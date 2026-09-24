import type { RequestHandler } from 'express';
import { AppError, ErrorCode } from '../shared/errors';
import type { AuthUserResolver } from '../shared/security/auth-context';
import { permissionsFor } from '../shared/security/permissions';
import { verifyAccessToken } from '../shared/security/tokens';

let resolveUser: AuthUserResolver | null = null;

/**
 * Wires the user lookup used by `authenticate`. Called once from the
 * composition root (src/routes/index.ts) so this middleware stays independent
 * of any feature module.
 */
export function registerAuthUserResolver(resolver: AuthUserResolver): void {
  resolveUser = resolver;
}

export interface AuthenticateOptions {
  /**
   * Allow users who must change their password (e.g. after an admin reset).
   * Only the endpoints needed to change the password should set this.
   */
  allowPasswordChangeRequired?: boolean;
}

/**
 * Requires a valid `Authorization: Bearer <access token>` header and attaches
 * `req.auth`. The user is re-checked on every request, so deactivation,
 * deletion and password changes take effect immediately.
 */
export function authenticate(options: AuthenticateOptions = {}): RequestHandler {
  return async (req, _res, next) => {
    const [scheme, token] = (req.get('Authorization') ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw AppError.unauthorized('Authentication token is required');
    }

    const subject = verifyAccessToken(token);

    if (!resolveUser) throw AppError.internal('Authentication is not configured');
    const user = await resolveUser(subject.userId);

    if (!user || !user.isActive || user.tokenVersion !== subject.tokenVersion) {
      throw AppError.unauthorized(
        'Session is no longer valid, please sign in again',
        ErrorCode.INVALID_TOKEN
      );
    }
    if (user.mustChangePassword && !options.allowPasswordChangeRequired) {
      throw AppError.forbidden(
        'You must change your password before continuing',
        ErrorCode.PASSWORD_CHANGE_REQUIRED
      );
    }

    req.auth = { userId: user.id, role: user.role, permissions: permissionsFor(user.role) };
    next();
  };
}
