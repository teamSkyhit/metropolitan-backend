import { describe, expect, it, vi, beforeEach } from 'vitest';
import { authService } from '../../src/modules/auth/auth.service';
import { authRepository } from '../../src/modules/auth/auth.repository';
import { usersService } from '../../src/modules/users/users.service';
import { AuthErrorCode } from '../../src/modules/auth/auth.schema';
import * as passwordModule from '../../src/shared/security/password';
import { Role } from '../../src/shared/security/roles';

describe('authService.login (unit)', () => {
  const dummyUser = {
    id: 'user-uuid-1',
    name: 'Alice Admin',
    email: 'alice@metro.test',
    role: Role.SUPER_ADMIN,
    passwordHash: '$2a$12$DummyHashedPasswordForTest00000000000000000000000000000',
    isActive: true,
    mustChangePassword: false,
    failedLoginAttempts: 0,
    lockedUntil: null as Date | null,
    passwordChangedAt: new Date(),
    tokenVersion: 1,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdById: null,
    updatedById: null,
  };

  const dummyRefreshTokenRecord = {
    id: 'token-uuid-1',
    userId: dummyUser.id,
    familyId: 'family-uuid-1',
    tokenHash: 'hash-value',
    tokenVersion: 1,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    createdByIp: '127.0.0.1',
    userAgent: 'test-agent',
    createdAt: new Date(),
  };

  const clientInfo = { ip: '127.0.0.1', userAgent: 'test-agent' };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authRepository, 'createRefreshToken').mockResolvedValue(dummyRefreshTokenRecord);
    vi.spyOn(usersService, 'recordFailedLogin').mockResolvedValue(undefined);
  });

  it('unknown email runs dummy password check and throws 401 AUTH_INVALID_CREDENTIALS', async () => {
    vi.spyOn(usersService, 'findForSignIn').mockResolvedValue(null);
    const dummyCheckSpy = vi.spyOn(passwordModule, 'verifyAgainstDummyHash').mockResolvedValue(undefined);

    await expect(
      authService.login({ email: 'unknown@metro.test', password: 'SomePassword123' }, clientInfo)
    ).rejects.toThrow(
      expect.objectContaining({
        statusCode: 401,
        code: AuthErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      })
    );

    expect(dummyCheckSpy).toHaveBeenCalledWith('SomePassword123');
  });

  it('known user with wrong password records failed attempt and throws 401 AUTH_INVALID_CREDENTIALS', async () => {
    vi.spyOn(usersService, 'findForSignIn').mockResolvedValue(dummyUser);
    vi.spyOn(passwordModule, 'verifyPassword').mockResolvedValue(false);
    const recordFailedSpy = vi.spyOn(usersService, 'recordFailedLogin').mockResolvedValue(undefined);

    await expect(
      authService.login({ email: 'alice@metro.test', password: 'WrongPassword123' }, clientInfo)
    ).rejects.toThrow(
      expect.objectContaining({
        statusCode: 401,
        code: AuthErrorCode.INVALID_CREDENTIALS,
      })
    );

    expect(recordFailedSpy).toHaveBeenCalledWith(dummyUser.id);
  });

  it('locked user with wrong password throws 401 AUTH_INVALID_CREDENTIALS without revealing locked status', async () => {
    const lockedUser = {
      ...dummyUser,
      lockedUntil: new Date(Date.now() + 15 * 60_000), // locked for next 15 minutes
    };

    vi.spyOn(usersService, 'findForSignIn').mockResolvedValue(lockedUser);
    vi.spyOn(passwordModule, 'verifyPassword').mockResolvedValue(false);
    const recordFailedSpy = vi.spyOn(usersService, 'recordFailedLogin').mockResolvedValue(undefined);

    const err = await authService
      .login({ email: 'alice@metro.test', password: 'WrongPassword123' }, clientInfo)
      .catch((e) => e);

    expect(err.statusCode).toBe(401);
    expect(err.code).toBe(AuthErrorCode.INVALID_CREDENTIALS);
    expect(err.message).toBe('Invalid email or password');
    // Does not mutate lock while already locked
    expect(recordFailedSpy).not.toHaveBeenCalled();
  });

  it('locked user with correct password still enforces lockout with 423 AUTH_ACCOUNT_LOCKED', async () => {
    const lockedUser = {
      ...dummyUser,
      lockedUntil: new Date(Date.now() + 15 * 60_000),
    };

    vi.spyOn(usersService, 'findForSignIn').mockResolvedValue(lockedUser);
    vi.spyOn(passwordModule, 'verifyPassword').mockResolvedValue(true);
    const recordSuccessSpy = vi.spyOn(usersService, 'recordSuccessfulLogin');

    const err = await authService
      .login({ email: 'alice@metro.test', password: 'CorrectPassword123' }, clientInfo)
      .catch((e) => e);

    expect(err.statusCode).toBe(423);
    expect(err.code).toBe(AuthErrorCode.ACCOUNT_LOCKED);
    expect(recordSuccessSpy).not.toHaveBeenCalled();
  });

  it('user with expired lockout logs in successfully with correct password', async () => {
    const expiredLockUser = {
      ...dummyUser,
      lockedUntil: new Date(Date.now() - 5000), // expired 5 seconds ago
    };

    vi.spyOn(usersService, 'findForSignIn').mockResolvedValue(expiredLockUser);
    vi.spyOn(passwordModule, 'verifyPassword').mockResolvedValue(true);
    vi.spyOn(usersService, 'recordSuccessfulLogin').mockResolvedValue(dummyUser);

    const session = await authService.login(
      { email: 'alice@metro.test', password: 'CorrectPassword123' },
      clientInfo
    );

    expect(session.user.id).toBe(dummyUser.id);
    expect(session.tokens.accessToken).toBeDefined();
    expect(session.tokens.refreshToken).toBeDefined();
  });

  it('active user with correct password succeeds', async () => {
    vi.spyOn(usersService, 'findForSignIn').mockResolvedValue(dummyUser);
    vi.spyOn(passwordModule, 'verifyPassword').mockResolvedValue(true);
    vi.spyOn(usersService, 'recordSuccessfulLogin').mockResolvedValue(dummyUser);

    const session = await authService.login(
      { email: 'alice@metro.test', password: 'CorrectPassword123' },
      clientInfo
    );

    expect(session.user.email).toBe(dummyUser.email);
    expect(session.tokens.accessToken).toBeDefined();
  });

  it('deactivated user with wrong password throws 401 AUTH_INVALID_CREDENTIALS', async () => {
    const inactiveUser = { ...dummyUser, isActive: false };
    vi.spyOn(usersService, 'findForSignIn').mockResolvedValue(inactiveUser);
    vi.spyOn(passwordModule, 'verifyPassword').mockResolvedValue(false);

    await expect(
      authService.login({ email: 'alice@metro.test', password: 'WrongPassword123' }, clientInfo)
    ).rejects.toThrow(
      expect.objectContaining({
        statusCode: 401,
        code: AuthErrorCode.INVALID_CREDENTIALS,
      })
    );
  });

  it('deactivated user with correct password throws 403 AUTH_ACCOUNT_INACTIVE', async () => {
    const inactiveUser = { ...dummyUser, isActive: false };
    vi.spyOn(usersService, 'findForSignIn').mockResolvedValue(inactiveUser);
    vi.spyOn(passwordModule, 'verifyPassword').mockResolvedValue(true);

    await expect(
      authService.login({ email: 'alice@metro.test', password: 'CorrectPassword123' }, clientInfo)
    ).rejects.toThrow(
      expect.objectContaining({
        statusCode: 403,
        code: AuthErrorCode.ACCOUNT_INACTIVE,
      })
    );
  });

  it('normalizes email input before lookup', async () => {
    const findSpy = vi.spyOn(usersService, 'findForSignIn').mockResolvedValue(null);
    vi.spyOn(passwordModule, 'verifyAgainstDummyHash').mockResolvedValue(undefined);

    await expect(
      authService.login({ email: '  ALICE@Metro.Test  ', password: 'Password123' }, clientInfo)
    ).rejects.toThrow();

    expect(findSpy).toHaveBeenCalledWith('alice@metro.test');
  });
});
