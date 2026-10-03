import { AppError } from '../../../shared/errors';

const CR_OR_LF_REGEX = /[\r\n]/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates that header-controlled values contain no carriage return (CR)
 * or line feed (LF) characters to protect against email header injection.
 */
export function assertNoHeaderInjection(value: string, fieldName = 'header'): void {
  if (CR_OR_LF_REGEX.test(value)) {
    throw AppError.badRequest(
      `Invalid ${fieldName}: contains illegal carriage return or newline characters.`
    );
  }
}

/**
 * Strict recipient email format validation.
 */
export function assertValidEmail(email: string): void {
  assertNoHeaderInjection(email, 'recipient email');
  if (!EMAIL_REGEX.test(email.trim()) || email.trim().length > 254) {
    throw AppError.badRequest(`Invalid recipient email address: "${email}"`);
  }
}

/**
 * Escapes HTML characters in dynamic data before template interpolation.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
