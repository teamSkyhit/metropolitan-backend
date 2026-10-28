import { AppError } from '../../shared/errors';
import { buildPaginationMeta, type Paginated } from '../../shared/http';
import { productsService } from '../products';
import { usersService } from '../users';
import {
  enquiriesDashboardQueryService,
  type EnquiriesDashboardRecentItem,
} from './enquiries-dashboard-query.service';
import {
  enquiriesRepository,
  type EnquiryCreateLineItemData,
  type EnquiryDetailRecord,
  type EnquirySummaryRecord,
  type StatusUpdate,
} from './enquiries.repository';
import {
  EnquiriesErrorCode,
  EnquiryStatus,
  type ChangeStatusBody,
  type DashboardRecentEnquiryDto,
  type EnquiryDashboardDto,
  type EnquiryDetailDto,
  type EnquirySummaryDto,
  type FollowUpDto,
  type ListEnquiriesQuery,
  type SubmitEnquiryBody,
  type SubmitEnquiryResponse,
} from './enquiries.schema';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Sales pipeline. `NEW` and `ASSIGNED` are driven by assignment; every other
 * status is set explicitly and must follow this map. A lost enquiry can be
 * reopened; a won one is final.
 */
export const STATUS_TRANSITIONS: Record<EnquiryStatus, readonly EnquiryStatus[]> = {
  NEW: ['CONTACTED', 'CLOSED_LOST'],
  ASSIGNED: ['CONTACTED', 'CLOSED_LOST'],
  CONTACTED: ['QUOTATION_SENT', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'],
  QUOTATION_SENT: ['NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'],
  NEGOTIATION: ['QUOTATION_SENT', 'CLOSED_WON', 'CLOSED_LOST'],
  CLOSED_WON: [],
  CLOSED_LOST: ['CONTACTED'],
};

const CLOSED_STATUSES: readonly EnquiryStatus[] = [EnquiryStatus.CLOSED_WON, EnquiryStatus.CLOSED_LOST];

const iso = (date: Date | null) => date?.toISOString() ?? null;

function toSummary(record: EnquirySummaryRecord): EnquirySummaryDto {
  return {
    id: record.id,
    name: record.name,
    company: record.company,
    email: record.email,
    mobile: record.mobile,
    city: record.city,
    status: record.status,
    assignedTo: record.assignedTo,
    lineItemCount: record._count.lineItems,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toRecentDto(record: EnquiriesDashboardRecentItem): DashboardRecentEnquiryDto {
  return {
    id: record.id,
    name: record.name,
    company: record.company,
    status: record.status,
    assignedTo: record.assignedTo,
    itemCount: record.itemCount,
    createdAt: record.createdAt,
  };
}

function toDetail(record: EnquiryDetailRecord): EnquiryDetailDto {
  return {
    ...toSummary(record),
    state: record.state,
    country: record.country,
    message: record.message,
    salesNotes: record.salesNotes,
    assignedAt: iso(record.assignedAt),
    closedAt: iso(record.closedAt),
    allowedStatusTransitions: [...STATUS_TRANSITIONS[record.status]],
    lineItems: record.lineItems.map(({ id, productId, sku, productName, quantity }) => ({
      id,
      productId,
      sku,
      productName,
      quantity,
    })),
    followUps: record.followUps.map((followUp) => ({
      id: followUp.id,
      note: followUp.note,
      author: followUp.author,
      createdAt: followUp.createdAt.toISOString(),
    })),
    statusHistory: record.statusChanges.map((change) => ({
      id: change.id,
      fromStatus: change.fromStatus,
      toStatus: change.toStatus,
      note: change.note,
      changedBy: change.changedBy,
      createdAt: change.createdAt.toISOString(),
    })),
  };
}

async function getRecord(id: string): Promise<EnquiryDetailRecord> {
  const record = await enquiriesRepository.findById(id);
  if (!record) throw AppError.notFound('Enquiry');
  return record;
}

const concurrentUpdate = () =>
  AppError.conflict(
    'The enquiry was changed by someone else. Reload it and try again.',
    EnquiriesErrorCode.CONCURRENT_UPDATE
  );

export const enquiriesService = {
  async submit(input: SubmitEnquiryBody, sourceIp: string | undefined): Promise<SubmitEnquiryResponse> {
    const { items, lineItems, ...fields } = input;

    let resolvedLineItems: EnquiryCreateLineItemData[];

    if (items && items.length > 0) {
      // Check for duplicate product IDs
      const seenProductIds = new Set<string>();
      for (const item of items) {
        if (seenProductIds.has(item.productId)) {
          throw AppError.badRequest(
            `Duplicate product in quote items: ${item.productId}`,
            EnquiriesErrorCode.DUPLICATE_PRODUCT,
            { productId: item.productId }
          );
        }
        seenProductIds.add(item.productId);
      }

      // Validate all product IDs are valid UUIDs
      for (const item of items) {
        if (!UUID_REGEX.test(item.productId)) {
          throw AppError.badRequest(
            `Product not found: ${item.productId}`,
            EnquiriesErrorCode.PRODUCT_NOT_FOUND,
            { productId: item.productId }
          );
        }
      }

      const snapshotMap = await productsService.validateForQuote(items.map((i) => i.productId));

      resolvedLineItems = items.map((item) => {
        const snapshot = snapshotMap.get(item.productId)!;
        return {
          productId: item.productId,
          productIdRef: snapshot.id,
          sku: snapshot.sku,
          productName: snapshot.name,
          quantity: item.quantity,
        };
      });
    } else if (lineItems && lineItems.length > 0) {
      // Legacy support: if line items are provided
      resolvedLineItems = lineItems.map((item) => ({
        productId: item.productId,
        productIdRef: UUID_REGEX.test(item.productId) ? item.productId : null,
        sku: item.sku ?? 'SKU-PENDING',
        productName: item.productName ?? null,
        quantity: item.quantity,
      }));
    } else {
      throw AppError.badRequest('At least one item is required', EnquiriesErrorCode.ITEMS_REQUIRED);
    }

    const created = await enquiriesRepository.create(fields, resolvedLineItems, sourceIp);
    return { id: created.id, status: created.status, createdAt: created.createdAt.toISOString() };
  },

  async list(query: ListEnquiriesQuery): Promise<Paginated<EnquirySummaryDto>> {
    const { items, total } = await enquiriesRepository.findMany(query);
    return { items: items.map(toSummary), pagination: buildPaginationMeta(query, total) };
  },

  async getById(id: string): Promise<EnquiryDetailDto> {
    return toDetail(await getRecord(id));
  },

  async updateSalesNotes(id: string, salesNotes: string | null, actorId: string): Promise<EnquiryDetailDto> {
    await getRecord(id);
    await enquiriesRepository.updateSalesNotes(id, salesNotes || null, actorId);
    return enquiriesService.getById(id);
  },

  async changeStatus(id: string, body: ChangeStatusBody, actorId: string): Promise<EnquiryDetailDto> {
    const record = await getRecord(id);
    if (!STATUS_TRANSITIONS[record.status].includes(body.status)) {
      throw AppError.conflict(
        `Cannot change status from ${record.status} to ${body.status}`,
        EnquiriesErrorCode.INVALID_STATUS_TRANSITION,
        { from: record.status, to: body.status, allowed: STATUS_TRANSITIONS[record.status] }
      );
    }

    const changed = await enquiriesRepository.changeStatus(
      id,
      { from: record.status, to: body.status, note: body.note },
      actorId
    );
    if (!changed) throw concurrentUpdate();
    return enquiriesService.getById(id);
  },

  /**
   * Assigning a NEW enquiry moves it to ASSIGNED; unassigning an ASSIGNED one
   * moves it back to NEW. Closed enquiries cannot be reassigned.
   */
  async assign(id: string, assignedToId: string | null, actorId: string): Promise<EnquiryDetailDto> {
    const record = await getRecord(id);
    if (CLOSED_STATUSES.includes(record.status)) {
      throw AppError.conflict('Closed enquiries cannot be reassigned', EnquiriesErrorCode.CLOSED);
    }

    if (assignedToId) {
      const assignee = await usersService.findRecordById(assignedToId);
      if (!assignee || !assignee.isActive) {
        throw AppError.badRequest(
          'The selected user does not exist or is inactive',
          EnquiriesErrorCode.ASSIGNEE_UNAVAILABLE
        );
      }
    }

    let statusChange: StatusUpdate | null = null;
    if (assignedToId && record.status === EnquiryStatus.NEW) {
      statusChange = { from: EnquiryStatus.NEW, to: EnquiryStatus.ASSIGNED };
    } else if (!assignedToId && record.status === EnquiryStatus.ASSIGNED) {
      statusChange = { from: EnquiryStatus.ASSIGNED, to: EnquiryStatus.NEW };
    }

    const assigned = await enquiriesRepository.assign(id, record.status, assignedToId, statusChange, actorId);
    if (!assigned) throw concurrentUpdate();
    return enquiriesService.getById(id);
  },

  async addFollowUp(id: string, note: string, authorId: string): Promise<FollowUpDto> {
    await getRecord(id);
    const followUp = await enquiriesRepository.addFollowUp(id, authorId, note);
    return {
      id: followUp.id,
      note: followUp.note,
      author: followUp.author,
      createdAt: followUp.createdAt.toISOString(),
    };
  },

  async softDelete(id: string, actorId: string): Promise<void> {
    await getRecord(id);
    await enquiriesRepository.softDelete(id, actorId);
  },

  async getDashboard(recentLimit = 10): Promise<EnquiryDashboardDto> {
    const [summary, recentRecords] = await Promise.all([
      enquiriesDashboardQueryService.getSummary({}),
      enquiriesDashboardQueryService.getRecent(recentLimit),
    ]);
    return {
      counts: {
        total: summary.totalEnquiries,
        new: summary.new,
        assigned: summary.assigned,
        contacted: summary.contacted,
        quotationSent: summary.quotationSent,
        negotiation: summary.negotiation,
        closedWon: summary.closedWon,
        closedLost: summary.closedLost,
      },
      recentEnquiries: recentRecords.map(toRecentDto),
    };
  },

  async getRecent(limit = 10): Promise<DashboardRecentEnquiryDto[]> {
    const records = await enquiriesDashboardQueryService.getRecent(limit);
    return records.map(toRecentDto);
  },
};
