import { AppError } from '../../shared/errors';
import { buildPaginationMeta, type Paginated } from '../../shared/http';
import { contactsRepository, type ContactSubmissionRecord } from './contacts.repository';
import {
  CONTACT_STATUS_TRANSITIONS,
  ContactsErrorCode,
  type ContactDetailDto,
  type ContactStatusType,
  type ContactSummaryDto,
  type ListContactsQuery,
  type SubmitContactBody,
  type SubmitContactResponse,
} from './contacts.schema';

import { notificationsService } from '../notifications';

export function toContactSummaryDto(record: ContactSubmissionRecord): ContactSummaryDto {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    mobile: record.mobile,
    company: record.company,
    subject: record.subject,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toContactDetailDto(record: ContactSubmissionRecord): ContactDetailDto {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    mobile: record.mobile,
    company: record.company,
    subject: record.subject,
    message: record.message,
    pageUrl: record.pageUrl,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export const contactsService = {
  async submit(body: SubmitContactBody, sourceIp?: string): Promise<SubmitContactResponse> {
    const record = await contactsRepository.create(body, sourceIp);

    // Dispatch notification without blocking or failing contact persistence
    try {
      await notificationsService.handleContactSubmitted({
        id: record.id,
        name: record.name,
        email: record.email,
        mobile: record.mobile,
        company: record.company,
        subject: record.subject,
        createdAt: record.createdAt,
      });
    } catch {
      // Handled internally in notificationsService, catch is extra safeguard
    }

    return {
      id: record.id,
      message: 'Your message has been received.',
    };
  },

  async list(query: ListContactsQuery): Promise<Paginated<ContactSummaryDto>> {
    const { items, total } = await contactsRepository.findMany(query);
    return {
      items: items.map(toContactSummaryDto),
      pagination: buildPaginationMeta(query, total),
    };
  },

  async getById(id: string): Promise<ContactDetailDto> {
    const record = await contactsRepository.findById(id);
    if (!record) {
      throw AppError.notFound('Contact submission');
    }
    return toContactDetailDto(record);
  },

  async updateStatus(id: string, newStatus: ContactStatusType, actorId: string): Promise<ContactDetailDto> {
    const existing = await contactsRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Contact submission');
    }

    if (!CONTACT_STATUS_TRANSITIONS[existing.status].includes(newStatus)) {
      throw AppError.conflict(
        `Cannot change status from ${existing.status} to ${newStatus}`,
        ContactsErrorCode.INVALID_STATUS_TRANSITION,
        { from: existing.status, to: newStatus, allowed: CONTACT_STATUS_TRANSITIONS[existing.status] }
      );
    }

    const updated = await contactsRepository.updateStatus(id, newStatus, actorId);
    return toContactDetailDto(updated);
  },

  async softDelete(id: string, actorId: string): Promise<void> {
    const existing = await contactsRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Contact submission');
    }
    await contactsRepository.softDelete(id, actorId);
  },
};
