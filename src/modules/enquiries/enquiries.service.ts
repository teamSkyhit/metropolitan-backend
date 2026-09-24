import { AppError } from '../../shared/errors';
import { buildPaginationMeta, type Paginated } from '../../shared/http';
import { usersService } from '../users';
import {
  enquiriesRepository,
  type EnquiryDetailRecord,
  type EnquirySummaryRecord,
  type StatusUpdate,
} from './enquiries.repository';
import {
  EnquiriesErrorCode,
  EnquiryStatus,
  type ChangeStatusBody,
  type EnquiryDetailDto,
  type EnquirySummaryDto,
  type FollowUpDto,
  type ListEnquiriesQuery,
  type SubmitEnquiryBody,
  type SubmitEnquiryResponse,
} from './enquiries.schema';

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
    const created = await enquiriesRepository.create(input, sourceIp);
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
};
