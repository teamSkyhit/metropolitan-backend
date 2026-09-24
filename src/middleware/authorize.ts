import type { RequestHandler } from 'express';
import { AppError } from '../shared/errors';
import type { Permission } from '../shared/security/permissions';

/**
 * Requires the authenticated caller to hold every listed permission.
 * Always place after `authenticate()`.
 */
export function authorize(...required: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw AppError.unauthorized();
    if (!required.every((permission) => req.auth!.permissions.has(permission))) {
      throw AppError.forbidden();
    }
    next();
  };
}
