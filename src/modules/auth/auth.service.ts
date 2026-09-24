import { randomUUID } from 'node:crypto';
import { config } from '../../config/env';
import { AppError } from '../../shared/errors';
import {
  generateOpaqueToken,
  hashToken,
  verifyAgainstDummyHash,
  verifyPassword,
} from '../../shared/security/password';
import { signAccessToken } from '../../shared/security/tokens';
import { toUserDto, usersService, type UserDto, type UserRecord } from '../users';
import { authRepository } from './auth.repository';
import {
  AuthErrorCode,
  type ClientInfo,
  type LoginBody,
  type SessionDto,
  type TokensDto,
} from './auth.schema';

const invalidRefreshToken = () =>
  AppError.unauthorized('Invalid refresh token', AuthErrorCode.INVALID_REFRESH_TOKEN);

async function issueTokens(
  user: UserRecord,
  client: ClientInfo,
  familyId: string = randomUUID()
): Promise<TokensDto> {
  const access = signAccessToken({ userId: user.id, tokenVersion: user.tokenVersion });
  const refreshToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await authRepository.createRefreshToken({
    userId: user.id,
    familyId,
    tokenHash: hashToken(refreshToken),
    tokenVersion: user.tokenVersion,
    expiresAt,
    createdByIp: client.ip?.slice(0, 64),
    userAgent: client.userAgent?.slice(0, 512),
  });

  return {
    accessToken: access.token,
    accessTokenExpiresIn: access.expiresIn,
    refreshToken,
    refreshTokenExpiresAt: expiresAt.toISOString(),
  };
}

export const authService = {
  async login({ email, password }: LoginBody, client: ClientInfo): Promise<SessionDto> {
    const user = await usersService.findForSignIn(email);
    if (!user) {
      await verifyAgainstDummyHash(password);
      throw AppError.unauthorized('Invalid email or password', AuthErrorCode.INVALID_CREDENTIALS);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(
        423,
        AuthErrorCode.ACCOUNT_LOCKED,
        'Too many failed sign-in attempts. Try again later or ask an administrator to reset your password.'
      );
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      await usersService.recordFailedLogin(user.id);
      throw AppError.unauthorized('Invalid email or password', AuthErrorCode.INVALID_CREDENTIALS);
    }

    if (!user.isActive) {
      throw AppError.forbidden('This account is deactivated', AuthErrorCode.ACCOUNT_INACTIVE);
    }

    const signedIn = await usersService.recordSuccessfulLogin(user.id);
    return { user: toUserDto(signedIn), tokens: await issueTokens(signedIn, client) };
  },

  /**
   * Rotates a refresh token. Each token works once; presenting a rotated token
   * again means it was stolen or replayed, so the whole session is revoked.
   */
  async refresh(refreshToken: string, client: ClientInfo): Promise<TokensDto> {
    const stored = await authRepository.findByHash(hashToken(refreshToken));
    if (!stored) throw invalidRefreshToken();

    if (stored.revokedAt) {
      await authRepository.revokeFamily(stored.familyId);
      throw AppError.unauthorized('Refresh token was already used', AuthErrorCode.REFRESH_TOKEN_REUSED);
    }
    if (stored.expiresAt <= new Date()) {
      throw AppError.unauthorized('Refresh token has expired', AuthErrorCode.REFRESH_TOKEN_EXPIRED);
    }

    const user = await usersService.findRecordById(stored.userId);
    if (!user || !user.isActive || user.tokenVersion !== stored.tokenVersion) {
      await authRepository.revokeFamily(stored.familyId);
      throw invalidRefreshToken();
    }

    if (!(await authRepository.revokeIfActive(stored.id))) {
      await authRepository.revokeFamily(stored.familyId);
      throw AppError.unauthorized('Refresh token was already used', AuthErrorCode.REFRESH_TOKEN_REUSED);
    }

    return issueTokens(user, client, stored.familyId);
  },

  /** Ends the session the refresh token belongs to. Idempotent: unknown tokens are ignored. */
  async logout(refreshToken: string): Promise<void> {
    const stored = await authRepository.findByHash(hashToken(refreshToken));
    if (stored) await authRepository.revokeFamily(stored.familyId);
  },

  /** Signs the user out on every device: access tokens die immediately, refresh tokens are revoked. */
  async logoutEverywhere(userId: string): Promise<void> {
    await usersService.revokeAllTokens(userId);
    await authRepository.revokeAllForUser(userId);
  },

  async me(userId: string): Promise<UserDto> {
    return usersService.getById(userId);
  },

  async changePassword(
    userId: string,
    body: { currentPassword: string; newPassword: string },
    client: ClientInfo
  ): Promise<SessionDto> {
    const user = await usersService.findRecordById(userId);
    if (!user) throw AppError.unauthorized();

    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      throw AppError.badRequest('Current password is incorrect', AuthErrorCode.INVALID_CURRENT_PASSWORD);
    }

    const updated = await usersService.changeOwnPassword(userId, body.newPassword);
    await authRepository.revokeAllForUser(userId);
    return { user: toUserDto(updated), tokens: await issueTokens(updated, client) };
  },
};
