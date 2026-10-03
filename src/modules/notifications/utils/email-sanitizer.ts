import { AppError } from '../../../shared/errors';

export const HEADER_INJECTION_REGEX = /[\r\n\u2028\u2029]/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates that header-controlled values contain no carriage return (CR),
 * line feed (LF), or Unicode line/paragraph separators (U+2028, U+2029)
 * to protect against email header injection.
 */
export function assertNoHeaderInjection(value: string, fieldName = 'header'): void {
  if (HEADER_INJECTION_REGEX.test(value)) {
    throw AppError.badRequest(
      `Invalid ${fieldName}: contains illegal carriage return, newline, or separator characters.`
    );
  }
}

/**
 * Strict recipient email format validation.
 */
export function assertValidEmail(email: string, fieldName = 'recipient email'): void {
  assertNoHeaderInjection(email, fieldName);
  const trimmed = email.trim();
  if (!EMAIL_REGEX.test(trimmed) || trimmed.length > 254) {
    throw AppError.badRequest(`Invalid ${fieldName}: "${email}"`);
  }
}

export interface ValidateEmailHeadersInput {
  to: string;
  subject: string;
  replyTo?: string;
  from?: string;
}

/**
 * Validates all email headers at service boundary to prevent header injection.
 */
export function validateEmailHeaders(input: ValidateEmailHeadersInput): void {
  assertValidEmail(input.to, 'recipient email');
  assertNoHeaderInjection(input.subject, 'email subject');
  if (input.replyTo) {
    assertValidEmail(input.replyTo, 'replyTo email');
  }
  if (input.from) {
    assertValidEmail(input.from, 'from email');
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
