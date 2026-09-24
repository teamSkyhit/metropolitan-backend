import { z } from 'zod';
import { paginationQuerySchema } from '../../shared/http';
import { passwordSchema } from '../../shared/security/password';
import { Role } from '../../shared/security/roles';

export const UsersErrorCode = {
  EMAIL_TAKEN: 'USERS_EMAIL_TAKEN',
  EMAIL_BELONGS_TO_DELETED_USER: 'USERS_EMAIL_BELONGS_TO_DELETED_USER',
  CANNOT_MODIFY_ADMIN: 'USERS_CANNOT_MODIFY_ADMIN',
  NOT_DELETED: 'USERS_NOT_DELETED',
} as const;

/** Roles a Super Admin can create through the API. Super Admins are created with `npm run db:seed`. */
export const MANAGEABLE_ROLES = [Role.SALES_MANAGER] as const;

const emailSchema = z.email().max(254).trim().toLowerCase();
const nameSchema = z.string().trim().min(2).max(100);

export const userSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    role: z.enum(Role),
    isActive: z.boolean(),
    mustChangePassword: z.boolean(),
    lastLoginAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'User' });

export const userLookupSchema = z
  .object({ id: z.uuid(), name: z.string(), role: z.enum(Role) })
  .meta({ id: 'UserLookup' });

export const createUserBodySchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    /** Temporary password: the user must change it at first sign-in. */
    password: passwordSchema,
    role: z.enum(MANAGEABLE_ROLES).default(Role.SALES_MANAGER),
  })
  .meta({ id: 'CreateUserRequest' });

export const updateUserBodySchema = z
  .object({ name: nameSchema.optional(), email: emailSchema.optional() })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update')
  .meta({ id: 'UpdateUserRequest' });

export const setUserStatusBodySchema = z
  .object({ isActive: z.boolean() })
  .meta({ id: 'SetUserStatusRequest' });

export const resetPasswordBodySchema = z
  .object({ newPassword: passwordSchema })
  .meta({ id: 'ResetUserPasswordRequest' });

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional().meta({ description: 'Matches name or email' }),
  role: z.enum(Role).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const userLookupQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  role: z.enum(Role).optional(),
});

export type UserDto = z.infer<typeof userSchema>;
export type UserLookupDto = z.infer<typeof userLookupSchema>;
export type CreateUserBody = z.infer<typeof createUserBodySchema>;
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UserLookupQuery = z.infer<typeof userLookupQuerySchema>;
