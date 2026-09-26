import { AppError } from '../errors';

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export interface ValidatedImage {
  mimeType: AllowedImageType;
  extension: '.png' | '.jpg' | '.webp';
}

/**
 * Validates file content by byte signatures (magic numbers).
 * Strictly allows PNG, JPEG, WebP. Explicitly rejects SVG and non-images.
 */
export function validateImageContent(buffer: Buffer): ValidatedImage {
  if (!buffer || buffer.length === 0) {
    throw AppError.badRequest('File is empty');
  }

  // Reject SVG by inspecting text
  const headerText = buffer.subarray(0, 256).toString('utf8').toLowerCase();
  if (headerText.includes('<svg') || headerText.includes('<?xml')) {
    throw AppError.badRequest('SVG files are not allowed. Please upload PNG, JPEG, or WebP.');
  }

  // PNG: 89 50 4E 47
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { mimeType: 'image/png', extension: '.png' };
  }

  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: '.jpg' };
  }

  // WebP: RIFF .... WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: '.webp' };
  }

  throw AppError.badRequest('Invalid file content. Only PNG, JPEG, and WebP images are allowed.');
}

export const UPLOAD_LIMITS = {
  LOGO_MAX_BYTES: 2 * 1024 * 1024, // 2 MB
  BANNER_MAX_BYTES: 5 * 1024 * 1024, // 5 MB
} as const;

export function validateFileSize(size: number, maxBytes: number, fieldName = 'File'): void {
  if (size > maxBytes) {
    const maxMb = maxBytes / (1024 * 1024);
    throw AppError.badRequest(`${fieldName} size exceeds maximum allowed limit of ${maxMb} MB`);
  }
}
