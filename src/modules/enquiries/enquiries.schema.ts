import { EnquiryStatus } from '@prisma/client';
import { z } from 'zod';
import {
  dateRangeFields,
  paginationQuerySchema,
  sortOrderSchema,
  withDateRangeCheck,
} from '../../shared/http';

export { EnquiryStatus };

export const EnquiriesErrorCode = {
  INVALID_STATUS_TRANSITION: 'ENQUIRY_INVALID_STATUS_TRANSITION',
  CLOSED: 'ENQUIRY_CLOSED',
  ASSIGNEE_UNAVAILABLE: 'ENQUIRY_ASSIGNEE_UNAVAILABLE',
  CONCURRENT_UPDATE: 'ENQUIRY_CONCURRENT_UPDATE',
} as const;

export const MAX_LINE_ITEMS = 50;
export const MAX_QUANTITY = 1_000_000;

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

const lineItemInputSchema = z.object({
  productId: z.string().trim().min(1).max(100),
  sku: z.string().trim().min(1).max(100),
  productName: optionalText(200),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
});

// ── Public website ────────────────────────────────────────────────────────────

export const submitEnquiryBodySchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    company: optionalText(150),
    email: z.email().max(254).trim().toLowerCase(),
    mobile: mobileSchema,
    city: optionalText(100),
    state: optionalText(100),
    country: optionalText(100),
    message: optionalText(2000),
    lineItems: z.array(lineItemInputSchema).min(1).max(MAX_LINE_ITEMS),
  })
  .meta({ id: 'SubmitEnquiryRequest' });

export const submitEnquiryResponseSchema = z
  .object({ id: z.uuid(), status: z.enum(EnquiryStatus), createdAt: z.iso.datetime() })
  .meta({ id: 'SubmitEnquiryResponse' });

// ── CRM ───────────────────────────────────────────────────────────────────────

export const listEnquiriesQuerySchema = withDateRangeCheck(
  paginationQuerySchema.extend({
    ...dateRangeFields,
    status: z
      .string()
      .transform((value) => value.split(',').map((item) => item.trim()))
      .pipe(z.array(z.enum(EnquiryStatus)).min(1))
      .optional()
      .meta({ description: 'One or more statuses, comma separated (e.g. NEW,ASSIGNED)' }),
    assignedTo: z
      .union([z.literal('unassigned'), z.uuid()])
      .optional()
      .meta({ description: 'User id, or "unassigned"' }),
    search: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .meta({ description: 'Matches name, company, email, mobile or line item SKU' }),
    sortBy: z.enum(['createdAt', 'updatedAt']).default('createdAt'),
    sortOrder: sortOrderSchema,
  })
);

export const updateEnquiryBodySchema = z
  .object({ salesNotes: z.string().trim().max(5000).nullable() })
  .meta({ id: 'UpdateEnquiryRequest' });

export const changeStatusBodySchema = z
  .object({
    status: z.enum(EnquiryStatus),
    note: optionalText(1000),
  })
  .meta({ id: 'ChangeEnquiryStatusRequest' });

export const assignEnquiryBodySchema = z
  .object({ assignedToId: z.uuid().nullable().meta({ description: 'null to unassign' }) })
  .meta({ id: 'AssignEnquiryRequest' });

export const addFollowUpBodySchema = z
  .object({ note: z.string().trim().min(1).max(2000) })
  .meta({ id: 'AddFollowUpRequest' });

// ── Responses ─────────────────────────────────────────────────────────────────

const personSchema = z.object({ id: z.uuid(), name: z.string() }).meta({ id: 'PersonRef' });

export const lineItemSchema = z
  .object({
    id: z.uuid(),
    productId: z.string(),
    sku: z.string(),
    productName: z.string().nullable(),
    quantity: z.number().int(),
  })
  .meta({ id: 'EnquiryLineItem' });

export const followUpSchema = z
  .object({ id: z.uuid(), note: z.string(), author: personSchema, createdAt: z.iso.datetime() })
  .meta({ id: 'EnquiryFollowUp' });

export const statusChangeSchema = z
  .object({
    id: z.uuid(),
    fromStatus: z.enum(EnquiryStatus).nullable(),
    toStatus: z.enum(EnquiryStatus),
    note: z.string().nullable(),
    changedBy: personSchema.nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'EnquiryStatusChange' });

export const enquirySummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    company: z.string().nullable(),
    email: z.string(),
    mobile: z.string(),
    city: z.string().nullable(),
    status: z.enum(EnquiryStatus),
    assignedTo: personSchema.nullable(),
    lineItemCount: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'EnquirySummary' });

export const enquiryDetailSchema = enquirySummarySchema
  .extend({
    state: z.string().nullable(),
    country: z.string().nullable(),
    message: z.string().nullable(),
    salesNotes: z.string().nullable(),
    assignedAt: z.iso.datetime().nullable(),
    closedAt: z.iso.datetime().nullable(),
    allowedStatusTransitions: z.array(z.enum(EnquiryStatus)),
    lineItems: z.array(lineItemSchema),
    followUps: z.array(followUpSchema),
    statusHistory: z.array(statusChangeSchema),
  })
  .meta({ id: 'EnquiryDetail' });

export type SubmitEnquiryBody = z.infer<typeof submitEnquiryBodySchema>;
export type SubmitEnquiryResponse = z.infer<typeof submitEnquiryResponseSchema>;
export type ListEnquiriesQuery = z.infer<typeof listEnquiriesQuerySchema>;
export type ChangeStatusBody = z.infer<typeof changeStatusBodySchema>;
export type EnquirySummaryDto = z.infer<typeof enquirySummarySchema>;
export type EnquiryDetailDto = z.infer<typeof enquiryDetailSchema>;
export type FollowUpDto = z.infer<typeof followUpSchema>;
