import { z } from 'zod';
import { passwordSchema } from '../../shared/security/password';
import { userSchema } from '../users';

export const AuthErrorCode = {
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  ACCOUNT_INACTIVE: 'AUTH_ACCOUNT_INACTIVE',
  INVALID_REFRESH_TOKEN: 'AUTH_INVALID_REFRESH_TOKEN',
  REFRESH_TOKEN_EXPIRED: 'AUTH_REFRESH_TOKEN_EXPIRED',
  REFRESH_TOKEN_REUSED: 'AUTH_REFRESH_TOKEN_REUSED',
  INVALID_CURRENT_PASSWORD: 'AUTH_INVALID_CURRENT_PASSWORD',
} as const;

const refreshTokenField = z.string().min(20).max(200);

export const loginBodySchema = z
  .object({
    email: z.email().max(254).trim().toLowerCase(),
    password: z.string().min(1).max(128),
  })
  .meta({ id: 'LoginRequest' });

export const refreshBodySchema = z.object({ refreshToken: refreshTokenField }).meta({ id: 'RefreshRequest' });

export const logoutBodySchema = z.object({ refreshToken: refreshTokenField }).meta({ id: 'LogoutRequest' });

export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .refine((body) => body.currentPassword !== body.newPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  })
  .meta({ id: 'ChangePasswordRequest' });

export const tokensSchema = z
  .object({
    accessToken: z.string(),
    /** Seconds until the access token expires. */
    accessTokenExpiresIn: z.number().int(),
    refreshToken: z.string(),
    refreshTokenExpiresAt: z.iso.datetime(),
  })
  .meta({ id: 'AuthTokens' });

export const sessionSchema = z.object({ user: userSchema, tokens: tokensSchema }).meta({ id: 'AuthSession' });

export type LoginBody = z.infer<typeof loginBodySchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
export type TokensDto = z.infer<typeof tokensSchema>;
export type SessionDto = z.infer<typeof sessionSchema>;

/** Client metadata stored with refresh tokens (helps investigate suspicious sessions). */
export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}
