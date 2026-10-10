import { AppError } from '../errors';

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export interface ValidatedImage {
  mimeType: AllowedImageType;
  extension: '.png' | '.jpg' | '.webp';
}

export interface ValidatedDocument {
  mimeType: 'application/pdf';
  extension: '.pdf';
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

/**
 * Validates document content by byte signatures (magic numbers).
 * Strictly allows PDF (%PDF-). Explicitly rejects executables, scripts, and non-PDFs.
 */
export function validatePdfContent(buffer: Buffer): ValidatedDocument {
  if (!buffer || buffer.length === 0) {
    throw AppError.badRequest('File is empty', 'INVALID_PDF_FILE');
  }

  // PDF header must start with %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (
    buffer.length < 5 ||
    buffer[0] !== 0x25 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x44 ||
    buffer[3] !== 0x46 ||
    buffer[4] !== 0x2d
  ) {
    throw AppError.badRequest('Invalid file content. Only PDF documents are allowed.', 'INVALID_PDF_FILE');
  }

  return { mimeType: 'application/pdf', extension: '.pdf' };
}

export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'] as const;
export type AllowedVideoType = (typeof ALLOWED_VIDEO_TYPES)[number];

export interface ValidatedVideo {
  mimeType: AllowedVideoType;
  extension: '.mp4' | '.webm';
}

/**
 * Validates video content by container signatures.
 * Strictly allows MP4 (ISO Base Media / ftyp) and WebM (EBML header with 'webm' DocType).
 * Rejects executables, scripts, generic MKV, AVI, MOV, SVG, and malformed files.
 */
export function validateVideoContent(buffer: Buffer): ValidatedVideo {
  if (!buffer || buffer.length === 0) {
    throw AppError.badRequest('File is empty', 'INVALID_VIDEO_FILE');
  }

  // MP4: ISO Base Media File Format box structure.
  // Bytes 4..7 must be 'ftyp'
  if (buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    return { mimeType: 'video/mp4', extension: '.mp4' };
  }

  // WebM: EBML header starts with 1A 45 DF A3
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    const headerSlice = buffer.subarray(0, Math.min(buffer.length, 128)).toString('ascii');
    if (headerSlice.includes('webm')) {
      return { mimeType: 'video/webm', extension: '.webm' };
    }
  }

  throw AppError.badRequest(
    'Invalid video content. Only MP4 and WebM videos are allowed.',
    'INVALID_VIDEO_FILE'
  );
}

export const UPLOAD_LIMITS = {
  LOGO_MAX_BYTES: 2 * 1024 * 1024, // 2 MB
  BANNER_MAX_BYTES: 5 * 1024 * 1024, // 5 MB
  CATEGORY_IMAGE_MAX_BYTES: 5 * 1024 * 1024, // 5 MB
  CATEGORY_BANNER_MAX_BYTES: 5 * 1024 * 1024, // 5 MB
  PRODUCT_IMAGE_MAX_BYTES: 5 * 1024 * 1024, // 5 MB
  PRODUCT_GALLERY_IMAGE_MAX_BYTES: 5 * 1024 * 1024, // 5 MB
  PRODUCT_VIDEO_MAX_BYTES: 100 * 1024 * 1024, // 100 MB
  PRODUCT_DOCUMENT_MAX_BYTES: 10 * 1024 * 1024, // 10 MB
} as const;

export function validateFileSize(
  size: number,
  maxBytes: number,
  fieldName = 'File',
  errorCode?: string
): void {
  if (size > maxBytes) {
    const maxMb = maxBytes / (1024 * 1024);
    throw AppError.badRequest(`${fieldName} size exceeds maximum allowed limit of ${maxMb} MB`, errorCode);
  }
}
