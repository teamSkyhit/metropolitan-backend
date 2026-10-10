import { describe, expect, it } from 'vitest';
import {
  validateImageContent,
  validatePdfContent,
  validateVideoContent,
  validateFileSize,
  UPLOAD_LIMITS,
} from '../../src/shared/storage/file-validator';

describe('file-validator (unit)', () => {
  const JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const WEBP_BUFFER = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP'),
  ]);
  const PDF_BUFFER = Buffer.from('%PDF-1.7\n%test content binary stream');
  const FAKE_PDF_TEXT = Buffer.from('This is not a real pdf document');
  const SVG_BUFFER = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>');
  const EXE_BUFFER = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
  const ZIP_BUFFER = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

  // MP4 container with ftyp box
  const MP4_BUFFER = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x20]), // box size: 32 bytes
    Buffer.from('ftypisom'), // ftyp major brand
    Buffer.from([0x00, 0x00, 0x02, 0x00]), // minor version
    Buffer.from('isomiso2mp41'), // compatible brands
  ]);

  // WebM container with EBML header and webm docType
  const WEBM_BUFFER = Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), // EBML ID
    Buffer.from([
      0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08,
    ]),
    Buffer.from([0x42, 0x82, 0x84]), // DocType ID + length 4
    Buffer.from('webm'),
  ]);

  // Matroska container with DocType 'matroska' (MKV - should be rejected as non-WebM)
  const MKV_BUFFER = Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    Buffer.from([0x42, 0x82, 0x88]),
    Buffer.from('matroska'),
  ]);

  describe('validateImageContent', () => {
    it('accepts valid JPEG buffer', () => {
      const res = validateImageContent(JPEG_BUFFER);
      expect(res.mimeType).toBe('image/jpeg');
      expect(res.extension).toBe('.jpg');
    });

    it('accepts valid PNG buffer', () => {
      const res = validateImageContent(PNG_BUFFER);
      expect(res.mimeType).toBe('image/png');
      expect(res.extension).toBe('.png');
    });

    it('accepts valid WebP buffer', () => {
      const res = validateImageContent(WEBP_BUFFER);
      expect(res.mimeType).toBe('image/webp');
      expect(res.extension).toBe('.webp');
    });

    it('rejects SVG buffer with badRequest', () => {
      expect(() => validateImageContent(SVG_BUFFER)).toThrow(/SVG files are not allowed/);
    });

    it('rejects executable / non-image bytes', () => {
      expect(() => validateImageContent(EXE_BUFFER)).toThrow(/Only PNG, JPEG, and WebP images are allowed/);
    });

    it('rejects empty buffer', () => {
      expect(() => validateImageContent(Buffer.alloc(0))).toThrow(/File is empty/);
    });
  });

  describe('validatePdfContent', () => {
    it('accepts valid PDF buffer starting with %PDF-', () => {
      const res = validatePdfContent(PDF_BUFFER);
      expect(res.mimeType).toBe('application/pdf');
      expect(res.extension).toBe('.pdf');
    });

    it('rejects fake text disguised as PDF with INVALID_PDF_FILE', () => {
      expect(() => validatePdfContent(FAKE_PDF_TEXT)).toThrow(
        expect.objectContaining({
          code: 'INVALID_PDF_FILE',
        })
      );
    });

    it('rejects executable binary disguised as PDF with INVALID_PDF_FILE', () => {
      expect(() => validatePdfContent(EXE_BUFFER)).toThrow(
        expect.objectContaining({
          code: 'INVALID_PDF_FILE',
        })
      );
    });

    it('rejects empty or truncated buffer', () => {
      expect(() => validatePdfContent(Buffer.alloc(0))).toThrow(/File is empty/);
      expect(() => validatePdfContent(Buffer.from('%PD'))).toThrow(
        expect.objectContaining({
          code: 'INVALID_PDF_FILE',
        })
      );
    });
  });

  describe('validateVideoContent', () => {
    it('accepts valid MP4 buffer with ftyp box', () => {
      const res = validateVideoContent(MP4_BUFFER);
      expect(res.mimeType).toBe('video/mp4');
      expect(res.extension).toBe('.mp4');
    });

    it('accepts valid WebM buffer with EBML and webm DocType', () => {
      const res = validateVideoContent(WEBM_BUFFER);
      expect(res.mimeType).toBe('video/webm');
      expect(res.extension).toBe('.webm');
    });

    it('rejects EXE disguised as MP4 with INVALID_VIDEO_FILE', () => {
      expect(() => validateVideoContent(EXE_BUFFER)).toThrow(
        expect.objectContaining({
          code: 'INVALID_VIDEO_FILE',
        })
      );
    });

    it('rejects ZIP disguised as MP4 with INVALID_VIDEO_FILE', () => {
      expect(() => validateVideoContent(ZIP_BUFFER)).toThrow(
        expect.objectContaining({
          code: 'INVALID_VIDEO_FILE',
        })
      );
    });

    it('rejects MKV / non-WebM EBML container with INVALID_VIDEO_FILE', () => {
      expect(() => validateVideoContent(MKV_BUFFER)).toThrow(
        expect.objectContaining({
          code: 'INVALID_VIDEO_FILE',
        })
      );
    });

    it('rejects SVG buffer disguised as video', () => {
      expect(() => validateVideoContent(SVG_BUFFER)).toThrow(
        expect.objectContaining({
          code: 'INVALID_VIDEO_FILE',
        })
      );
    });

    it('rejects empty video buffer', () => {
      expect(() => validateVideoContent(Buffer.alloc(0))).toThrow(/File is empty/);
    });
  });

  describe('validateFileSize', () => {
    it('allows sizes within limit for images, PDFs, and videos', () => {
      expect(() => {
        validateFileSize(1024, UPLOAD_LIMITS.PRODUCT_DOCUMENT_MAX_BYTES, 'Document');
      }).not.toThrow();

      expect(() => {
        validateFileSize(5 * 1024 * 1024, UPLOAD_LIMITS.PRODUCT_GALLERY_IMAGE_MAX_BYTES, 'Image');
      }).not.toThrow();

      expect(() => {
        validateFileSize(50 * 1024 * 1024, UPLOAD_LIMITS.PRODUCT_VIDEO_MAX_BYTES, 'Video');
      }).not.toThrow();
    });

    it('rejects file exceeding size limit for PDFs with PDF_FILE_TOO_LARGE', () => {
      expect(() => {
        validateFileSize(
          UPLOAD_LIMITS.PRODUCT_DOCUMENT_MAX_BYTES + 1,
          UPLOAD_LIMITS.PRODUCT_DOCUMENT_MAX_BYTES,
          'Document',
          'PDF_FILE_TOO_LARGE'
        );
      }).toThrow(
        expect.objectContaining({
          code: 'PDF_FILE_TOO_LARGE',
        })
      );
    });

    it('rejects file exceeding size limit for videos with VIDEO_FILE_TOO_LARGE', () => {
      expect(() => {
        validateFileSize(
          UPLOAD_LIMITS.PRODUCT_VIDEO_MAX_BYTES + 1,
          UPLOAD_LIMITS.PRODUCT_VIDEO_MAX_BYTES,
          'Video',
          'VIDEO_FILE_TOO_LARGE'
        );
      }).toThrow(
        expect.objectContaining({
          code: 'VIDEO_FILE_TOO_LARGE',
        })
      );
    });
  });
});
