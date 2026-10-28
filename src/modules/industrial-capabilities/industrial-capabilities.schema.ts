import { z } from 'zod';
import { paginationQuerySchema, sortOrderSchema } from '../../shared/http';
import { iconSchema } from '../../shared/validators/icon';

export const IndustrialCapabilitiesErrorCode = {
  NOT_FOUND: 'INDUSTRIAL_CAPABILITY_NOT_FOUND',
  SLUG_CONFLICT: 'INDUSTRIAL_CAPABILITY_SLUG_CONFLICT',
  SLUG_BELONGS_TO_DELETED: 'INDUSTRIAL_CAPABILITY_SLUG_BELONGS_TO_DELETED',
  INVALID_ICON: 'INVALID_INDUSTRIAL_CAPABILITY_ICON',
  IMAGE_NOT_FOUND: 'INDUSTRIAL_CAPABILITY_IMAGE_NOT_FOUND',
} as const;

export type IndustrialCapabilitiesErrorCode =
  (typeof IndustrialCapabilitiesErrorCode)[keyof typeof IndustrialCapabilitiesErrorCode];

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const mediaUrlSchema = z
  .string()
  .trim()
  .max(500, 'URL cannot exceed 500 characters')
  .refine(
    (val) => /^https?:\/\//.test(val) || val.startsWith('/'),
    'Must be a valid HTTP(S) URL or relative path'
  )
  .nullable()
  .optional();

export const typicalProductsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, 'Product item cannot be empty')
      .max(100, 'Product item cannot exceed 100 characters')
  )
  .max(50, 'Typical products cannot exceed 50 items')
  .transform((items) => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of items) {
      const lower = item.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        result.push(item);
      }
    }
    return result;
  });

export const capabilitySlugSchema = z
  .string()
  .trim()
  .min(1, 'Slug cannot be empty')
  .max(120, 'Slug cannot exceed 120 characters')
  .regex(
    slugRegex,
    'Slug may only contain lowercase letters, numbers, and hyphens (e.g. power-transmission)'
  );

/** CRM Admin DTO */
export const industrialCapabilitySchema = z
  .object({
    id: z.uuid(),
    number: z.string().nullable().optional(),
    title: z.string(),
    slug: z.string(),
    imageUrl: z.string().nullable().optional(),
    imageMediaId: z.uuid().nullable().optional(),
    icon: z.string().nullable().optional(),
    shortDescription: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    typicalProducts: z.array(z.string()),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'IndustrialCapability' });

/** Public website Capability Segment DTO (internal audit and media ID fields excluded) */
export const publicIndustrialCapabilitySegmentSchema = z
  .object({
    id: z.uuid(),
    number: z.string().nullable(),
    title: z.string(),
    slug: z.string(),
    imageUrl: z.string().nullable(),
    icon: z.string().nullable(),
    shortDescription: z.string().nullable(),
    description: z.string().nullable(),
    typicalProducts: z.array(z.string()),
    sortOrder: z.number().int(),
  })
  .meta({ id: 'PublicIndustrialCapabilitySegment' });

export const industrialCapabilitySectionSettingsSchema = z
  .object({
    eyebrow: z.string().trim().max(100).default('OUR INDUSTRIAL CAPABILITIES'),
    title: z.string().trim().max(200).default('SIX CORE SEGMENTS'),
    description: z.string().trim().max(1000).default(''),
  })
  .meta({ id: 'IndustrialCapabilitySectionSettings' });

export const updateIndustrialCapabilitySectionSettingsSchema = z
  .object({
    eyebrow: z.string().trim().max(100).optional().nullable(),
    title: z.string().trim().max(200).optional().nullable(),
    description: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, 'Provide at least one setting field to update')
  .meta({ id: 'UpdateIndustrialCapabilitySectionSettings' });

export const publicIndustrialCapabilitiesDataSchema = z
  .object({
    section: z.object({
      eyebrow: z.string(),
      title: z.string(),
      description: z.string(),
    }),
    segments: z.array(publicIndustrialCapabilitySegmentSchema),
  })
  .meta({ id: 'PublicIndustrialCapabilitiesData' });

export const createIndustrialCapabilityBodySchema = z
  .object({
    number: z.string().trim().max(20).nullable().optional(),
    title: z.string().trim().min(1, 'Title is required').max(200, 'Title cannot exceed 200 characters'),
    slug: capabilitySlugSchema,
    imageUrl: mediaUrlSchema,
    icon: iconSchema.nullable().optional(),
    shortDescription: z.string().trim().max(500).nullable().optional(),
    description: z.string().trim().nullable().optional(),
    typicalProducts: typicalProductsSchema.optional().default([]),
    sortOrder: z
      .number()
      .int('Sort order must be an integer')
      .min(0, 'Sort order cannot be negative')
      .optional()
      .default(0),
    isActive: z.boolean().optional().default(true),
  })
  .meta({ id: 'CreateIndustrialCapabilityRequest' });

export const updateIndustrialCapabilityBodySchema = z
  .object({
    number: z.string().trim().max(20).nullable().optional(),
    title: z.string().trim().min(1, 'Title cannot be empty').max(200).optional(),
    slug: capabilitySlugSchema.optional(),
    imageUrl: mediaUrlSchema,
    icon: iconSchema.nullable().optional(),
    shortDescription: z.string().trim().max(500).nullable().optional(),
    description: z.string().trim().nullable().optional(),
    typicalProducts: typicalProductsSchema.optional(),
    sortOrder: z
      .number()
      .int('Sort order must be an integer')
      .min(0, 'Sort order cannot be negative')
      .optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update')
  .meta({ id: 'UpdateIndustrialCapabilityRequest' });

export const reorderIndustrialCapabilitiesBodySchema = z
  .object({
    capabilityIds: z
      .array(z.string().uuid('Each capabilityId must be a valid UUID'))
      .min(1, 'Provide at least one capability ID to reorder')
      .refine((ids) => new Set(ids).size === ids.length, 'capabilityIds must not contain duplicates'),
  })
  .meta({ id: 'ReorderIndustrialCapabilitiesRequest' });

export const listIndustrialCapabilitiesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional().meta({ description: 'Matches title or slug' }),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
    .meta({ description: 'Filter by active status' }),
  sortBy: z.enum(['title', 'slug', 'sortOrder', 'createdAt', 'updatedAt']).default('sortOrder'),
  sortOrder: sortOrderSchema.default('asc'),
});

export type IndustrialCapabilityDto = z.infer<typeof industrialCapabilitySchema>;
export type PublicIndustrialCapabilitySegmentDto = z.infer<typeof publicIndustrialCapabilitySegmentSchema>;
export type IndustrialCapabilitySectionSettingsDto = z.infer<
  typeof industrialCapabilitySectionSettingsSchema
>;
export type UpdateIndustrialCapabilitySectionSettingsBody = z.infer<
  typeof updateIndustrialCapabilitySectionSettingsSchema
>;
export type PublicIndustrialCapabilitiesDataDto = z.infer<typeof publicIndustrialCapabilitiesDataSchema>;
export type CreateIndustrialCapabilityBody = z.infer<typeof createIndustrialCapabilityBodySchema>;
export type UpdateIndustrialCapabilityBody = z.infer<typeof updateIndustrialCapabilityBodySchema>;
export type ReorderIndustrialCapabilitiesBody = z.infer<typeof reorderIndustrialCapabilitiesBodySchema>;
export type ListIndustrialCapabilitiesQuery = z.infer<typeof listIndustrialCapabilitiesQuerySchema>;
