import { z } from 'zod';
import {
  dateRangeFields,
  paginationQuerySchema,
  sortOrderSchema,
  withDateRangeCheck,
} from '../../shared/http';

export const ContactStatus = {
  NEW: 'NEW',
  READ: 'READ',
  ARCHIVED: 'ARCHIVED',
} as const;

export type ContactStatus = (typeof ContactStatus)[keyof typeof ContactStatus];

export const CONTACT_STATUSES = ['NEW', 'READ', 'ARCHIVED'] as const;
export const contactStatusEnum = z.enum(CONTACT_STATUSES);
export type ContactStatusType = z.infer<typeof contactStatusEnum>;

export const ContactsErrorCode = {
  INVALID_STATUS_TRANSITION: 'CONTACT_INVALID_STATUS_TRANSITION',
} as const;

/**
 * Minimal forward-only contact workflow:
 * - NEW can be marked as READ or directly ARCHIVED.
 * - READ can be moved to ARCHIVED.
 * - ARCHIVED is terminal.
 */
export const CONTACT_STATUS_TRANSITIONS: Record<ContactStatusType, readonly ContactStatusType[]> = {
  NEW: ['READ', 'ARCHIVED'],
  READ: ['ARCHIVED'],
  ARCHIVED: [],
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

/** 7-15 digits, optionally with +, spaces, dashes and parentheses. */
const mobileSchema = z
  .string()
  .trim()
  .max(20)
  .regex(/^\+?[0-9\s\-()]+$/, 'Mobile number may contain digits, spaces, dashes, parentheses and a leading +')
  .refine((value) => {
    const digits = value.replace(/\D/g, '').length;
    return digits >= 7 && digits <= 15;
  }, 'Mobile number must have 7 to 15 digits')
  .meta({ example: '+91 98765 43210' });

const pageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((val) => {
    if (!val) return true;
    try {
      const parsed = new URL(val, 'http://localhost');
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Invalid page URL')
  .optional()
  .transform((v) => (v ? v : undefined));

// ── Public Website ────────────────────────────────────────────────────────────

export const submitContactBodySchema = z
  .object({
    name: z.string().trim().min(2, 'Name must have at least 2 characters').max(100),
    email: z.email('Invalid email address').max(254).trim().toLowerCase(),
    mobile: mobileSchema.optional(),
    company: optionalText(150),
    subject: optionalText(200),
    message: z.string().trim().min(5, 'Message must have at least 5 characters').max(2000),
    pageUrl: pageUrlSchema,
  })
  .meta({ id: 'SubmitContactBody' });

export type SubmitContactBody = z.infer<typeof submitContactBodySchema>;

export const submitContactResponseSchema = z
  .object({
    id: z.uuid(),
    message: z.string().meta({ example: 'Your message has been received.' }),
  })
  .meta({ id: 'SubmitContactResponse' });

export type SubmitContactResponse = z.infer<typeof submitContactResponseSchema>;

// ── CRM Management ────────────────────────────────────────────────────────────

export const listContactsQuerySchema = withDateRangeCheck(
  paginationQuerySchema.extend({
    ...dateRangeFields,
    status: contactStatusEnum.optional(),
    search: z.string().trim().max(100).optional(),
    sortBy: z.enum(['createdAt', 'name', 'status']).default('createdAt'),
    sortOrder: sortOrderSchema,
  })
);

export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;

export const contactSummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    mobile: z.string().nullable(),
    company: z.string().nullable(),
    subject: z.string().nullable(),
    status: contactStatusEnum,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'ContactSummary' });

export type ContactSummaryDto = z.infer<typeof contactSummarySchema>;

export const contactDetailSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    mobile: z.string().nullable(),
    company: z.string().nullable(),
    subject: z.string().nullable(),
    message: z.string(),
    pageUrl: z.string().nullable(),
    status: contactStatusEnum,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'ContactDetail' });

export type ContactDetailDto = z.infer<typeof contactDetailSchema>;

export const updateContactStatusBodySchema = z
  .object({
    status: contactStatusEnum,
  })
  .meta({ id: 'UpdateContactStatusBody' });

export type UpdateContactStatusBody = z.infer<typeof updateContactStatusBodySchema>;
