import { randomUUID } from 'node:crypto';
import { config } from '../../config/env';
import { AppError } from '../../shared/errors';
import {
  generateOpaqueToken,
  hashPassword,
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
    const normalizedEmail = email.trim().toLowerCase();
    const user = await usersService.findForSignIn(normalizedEmail);
    if (!user) {
      await verifyAgainstDummyHash(password);
      throw AppError.unauthorized('Invalid email or password', AuthErrorCode.INVALID_CREDENTIALS);
    }

    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      if (!user.lockedUntil || user.lockedUntil <= new Date()) {
        await usersService.recordFailedLogin(user.id);
      }
      throw AppError.unauthorized('Invalid email or password', AuthErrorCode.INVALID_CREDENTIALS);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(
        423,
        AuthErrorCode.ACCOUNT_LOCKED,
        'Too many failed sign-in attempts. Try again later or ask an administrator to reset your password.'
      );
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

    const access = signAccessToken({
      userId: user.id,
      tokenVersion: user.tokenVersion,
    });
    const newRefreshToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const rotated = await authRepository.rotateRefreshToken(stored.id, {
      userId: user.id,
      familyId: stored.familyId,
      tokenHash: hashToken(newRefreshToken),
      tokenVersion: user.tokenVersion,
      expiresAt,
      createdByIp: client.ip?.slice(0, 64),
      userAgent: client.userAgent?.slice(0, 512),
    });

    if (!rotated) {
      await authRepository.revokeFamily(stored.familyId);
      throw AppError.unauthorized('Refresh token was already used', AuthErrorCode.REFRESH_TOKEN_REUSED);
    }

    return {
      accessToken: access.token,
      accessTokenExpiresIn: access.expiresIn,
      refreshToken: newRefreshToken,
      refreshTokenExpiresAt: expiresAt.toISOString(),
    };
  },

  /** Ends the session the refresh token belongs to. Idempotent: unknown tokens are ignored. */
  async logout(refreshToken: string): Promise<void> {
    const stored = await authRepository.findByHash(hashToken(refreshToken));
    if (stored) await authRepository.revokeFamily(stored.familyId);
  },

  /** Signs the user out on every device: access tokens die immediately, refresh tokens are revoked. */
  async logoutEverywhere(userId: string): Promise<void> {
    await authRepository.logoutEverywhere(userId);
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

    const newPasswordHash = await hashPassword(body.newPassword);
    const newRefreshToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const { updatedUser } = await authRepository.changePasswordTransaction(userId, newPasswordHash, {
      familyId: randomUUID(),
      tokenHash: hashToken(newRefreshToken),
      expiresAt,
      createdByIp: client.ip?.slice(0, 64),
      userAgent: client.userAgent?.slice(0, 512),
    });

    const access = signAccessToken({
      userId: updatedUser.id,
      tokenVersion: updatedUser.tokenVersion,
    });

    return {
      user: toUserDto(updatedUser),
      tokens: {
        accessToken: access.token,
        accessTokenExpiresIn: access.expiresIn,
        refreshToken: newRefreshToken,
        refreshTokenExpiresAt: expiresAt.toISOString(),
      },
    };
  },
};
