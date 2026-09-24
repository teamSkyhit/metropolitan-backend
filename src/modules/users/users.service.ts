import { config } from '../../config/env';
import { AppError } from '../../shared/errors';
import { buildPaginationMeta, type Paginated } from '../../shared/http';
import type { AuthUserState } from '../../shared/security/auth-context';
import { hashPassword } from '../../shared/security/password';
import { Role } from '../../shared/security/roles';
import { usersRepository, type UserRecord } from './users.repository';
import {
  UsersErrorCode,
  type CreateUserBody,
  type ListUsersQuery,
  type UpdateUserBody,
  type UserDto,
  type UserLookupDto,
  type UserLookupQuery,
} from './users.schema';

export function toUserDto(user: UserRecord): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

async function assertEmailAvailable(email: string, exceptUserId?: string): Promise<void> {
  const existing = await usersRepository.findByEmailIncludingDeleted(email);
  if (!existing || existing.id === exceptUserId) return;
  if (existing.deletedAt) {
    throw AppError.conflict(
      'This email belongs to a deleted user. Restore that user instead of creating a new one.',
      UsersErrorCode.EMAIL_BELONGS_TO_DELETED_USER,
      { userId: existing.id }
    );
  }
  throw AppError.conflict('A user with this email already exists', UsersErrorCode.EMAIL_TAKEN);
}

/** Super Admin accounts are managed outside the API; only Sales Managers can be modified. */
async function getManageableUser(id: string): Promise<UserRecord> {
  const user = await usersRepository.findById(id);
  if (!user) throw AppError.notFound('User');
  if (user.role === Role.SUPER_ADMIN) {
    throw AppError.forbidden(
      'Super Admin accounts cannot be modified here',
      UsersErrorCode.CANNOT_MODIFY_ADMIN
    );
  }
  return user;
}

export const usersService = {
  async list(query: ListUsersQuery): Promise<Paginated<UserDto>> {
    const { items, total } = await usersRepository.findMany(query);
    return { items: items.map(toUserDto), pagination: buildPaginationMeta(query, total) };
  },

  lookup(query: UserLookupQuery): Promise<UserLookupDto[]> {
    return usersRepository.lookup(query);
  },

  async getById(id: string): Promise<UserDto> {
    const user = await usersRepository.findById(id);
    if (!user) throw AppError.notFound('User');
    return toUserDto(user);
  },

  async create(body: CreateUserBody, actorId: string): Promise<UserDto> {
    await assertEmailAvailable(body.email);
    const user = await usersRepository.create(
      {
        name: body.name,
        email: body.email,
        role: body.role,
        passwordHash: await hashPassword(body.password),
        mustChangePassword: true,
      },
      actorId
    );
    return toUserDto(user);
  },

  async update(id: string, body: UpdateUserBody, actorId: string): Promise<UserDto> {
    await getManageableUser(id);
    if (body.email) await assertEmailAvailable(body.email, id);
    return toUserDto(await usersRepository.update(id, body, actorId));
  },

  async setActive(id: string, isActive: boolean, actorId: string): Promise<UserDto> {
    await getManageableUser(id);
    return toUserDto(await usersRepository.setActive(id, isActive, actorId));
  },

  /** Admin reset: sets a temporary password, signs the user out everywhere, forces a change at next sign-in. */
  async resetPassword(id: string, newPassword: string, actorId: string): Promise<UserDto> {
    await getManageableUser(id);
    const passwordHash = await hashPassword(newPassword);
    return toUserDto(
      await usersRepository.setPassword(id, passwordHash, { mustChangePassword: true, actorId })
    );
  },

  async softDelete(id: string, actorId: string): Promise<void> {
    await getManageableUser(id);
    await usersRepository.softDelete(id, actorId);
  },

  async restore(id: string, actorId: string): Promise<UserDto> {
    const user = await usersRepository.findByIdIncludingDeleted(id);
    if (!user) throw AppError.notFound('User');
    if (!user.deletedAt) throw AppError.conflict('User is not deleted', UsersErrorCode.NOT_DELETED);
    return toUserDto(await usersRepository.restore(id, actorId));
  },

  // ── Used by the auth module ────────────────────────────────────────────────

  /** Resolver for the `authenticate` middleware. */
  async resolveAuthState(id: string): Promise<AuthUserState | null> {
    const user = await usersRepository.findById(id);
    if (!user) return null;
    return {
      id: user.id,
      role: user.role,
      isActive: user.isActive,
      tokenVersion: user.tokenVersion,
      mustChangePassword: user.mustChangePassword,
    };
  },

  findForSignIn(email: string): Promise<UserRecord | null> {
    return usersRepository.findActiveByEmail(email);
  },

  findRecordById(id: string): Promise<UserRecord | null> {
    return usersRepository.findById(id);
  },

  recordFailedLogin(id: string): Promise<void> {
    return usersRepository.recordFailedLogin(id, config.LOGIN_MAX_ATTEMPTS, config.LOGIN_LOCK_MINUTES);
  },

  recordSuccessfulLogin(id: string): Promise<UserRecord> {
    return usersRepository.recordSuccessfulLogin(id);
  },

  /** The user changed their own password: clears the forced-change flag and revokes all tokens. */
  async changeOwnPassword(id: string, newPassword: string): Promise<UserRecord> {
    const passwordHash = await hashPassword(newPassword);
    return usersRepository.setPassword(id, passwordHash, { mustChangePassword: false, actorId: id });
  },

  revokeAllTokens(id: string): Promise<UserRecord> {
    return usersRepository.revokeAllTokens(id);
  },
};
