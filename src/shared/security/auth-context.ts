import type { Request } from 'express';
import { AppError } from '../errors';
import type { Permission } from './permissions';
import type { Role } from './roles';

/** Identity of the caller, attached to `req.auth` by the `authenticate` middleware. */
export interface AuthContext {
  userId: string;
  role: Role;
  permissions: ReadonlySet<Permission>;
}

/** The minimal user state `authenticate` needs to decide whether a token is still valid. */
export interface AuthUserState {
  id: string;
  role: Role;
  isActive: boolean;
  tokenVersion: number;
  mustChangePassword: boolean;
}

export type AuthUserResolver = (userId: string) => Promise<AuthUserState | null>;

/** Returns the caller's identity or throws 401. Use in handlers behind `authenticate()`. */
export function requireAuth(req: Pick<Request, 'auth'>): AuthContext {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
}
