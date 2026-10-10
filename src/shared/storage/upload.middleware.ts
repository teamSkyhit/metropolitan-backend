import type { Request, Response, NextFunction, RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { AppError } from '../errors';
import {
  UPLOAD_LIMITS,
  validateFileSize,
  validateImageContent,
  validatePdfContent,
  validateVideoContent,
} from './file-validator';

export interface UploadOptions {
  maxBytes: number;
  fieldName: string;
  entityName?: string;
  errorCode?: string;
}

/**
 * Creates an Express middleware for strict single-file uploads with byte content verification.
 * Rejects wrong field names, missing files, or multiple files with 400 Bad Request.
 */
export function requireFileUpload(options: UploadOptions): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
    },
  }).single(options.fieldName);

  return (req: Request, res: Response, next: NextFunction): void => {
    upload(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(AppError.badRequest('File size exceeds limit', options.errorCode));
          }
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return next(
              AppError.badRequest(
                `Unexpected field or multiple files. Expected single file in field '${options.fieldName}'`
              )
            );
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return next(
              AppError.badRequest(
                `Multiple files are not allowed. Expected single file in field '${options.fieldName}'`
              )
            );
          }
          return next(AppError.badRequest(err.message));
        }
        return next(err);
      }

      const file = req.file;

      if (!file) {
        return next(AppError.badRequest(`No file uploaded. Expected multipart field: ${options.fieldName}`));
      }

      try {
        validateFileSize(file.size, options.maxBytes, options.entityName ?? 'File', options.errorCode);
        const validated = validateImageContent(file.buffer);
        file.mimetype = validated.mimeType;
        next();
      } catch (validationErr) {
        next(validationErr);
      }
    });
  };
}

/**
 * Creates an Express middleware for Product gallery image upload (up to 5 images, max 5 MB each).
 * Strictly validates image byte signatures (PNG, JPEG, WebP) and named multipart field 'images' (or 'image').
 */
export function requireGalleryUpload(options?: { maxBytes?: number; maxFiles?: number }): RequestHandler {
  const maxBytes = options?.maxBytes ?? UPLOAD_LIMITS.PRODUCT_GALLERY_IMAGE_MAX_BYTES;
  const maxFiles = options?.maxFiles ?? 5;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: maxFiles,
    },
  }).fields([
    { name: 'images', maxCount: maxFiles },
    { name: 'image', maxCount: maxFiles },
  ]);

  return (req: Request, res: Response, next: NextFunction): void => {
    upload(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(AppError.badRequest('File size exceeds limit of 5 MB'));
          }
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return next(
              AppError.badRequest(
                `Unexpected field or too many files. Expected field 'images' (max ${maxFiles} files)`
              )
            );
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return next(
              AppError.badRequest(
                `Maximum ${maxFiles} images allowed per upload request`,
                'PRODUCT_GALLERY_LIMIT_REACHED'
              )
            );
          }
          return next(AppError.badRequest(err.message));
        }
        return next(err);
      }

      const filesDict = req.files as Record<string, Express.Multer.File[]> | undefined;
      const fileList: Express.Multer.File[] = [...(filesDict?.images ?? []), ...(filesDict?.image ?? [])];

      if (fileList.length === 0) {
        return next(AppError.badRequest("No file uploaded. Expected multipart field: 'images'"));
      }

      if (fileList.length > maxFiles) {
        return next(
          AppError.badRequest(
            `Maximum ${maxFiles} images allowed per upload request`,
            'PRODUCT_GALLERY_LIMIT_REACHED'
          )
        );
      }

      try {
        for (const file of fileList) {
          validateFileSize(file.size, maxBytes, 'Gallery image');
          const validated = validateImageContent(file.buffer);
          file.mimetype = validated.mimeType;
        }
        (req as Request & { uploadedFiles?: Express.Multer.File[] }).uploadedFiles = fileList;
        next();
      } catch (validationErr) {
        next(validationErr);
      }
    });
  };
}

/**
 * Creates an Express middleware for Product PDF documents upload (up to 3 PDFs, max 10 MB each).
 * Strictly validates PDF byte signature (%PDF-) and named multipart fields 'file' or 'documents'.
 */
export function requireDocumentUpload(options?: { maxBytes?: number; maxFiles?: number }): RequestHandler {
  const maxBytes = options?.maxBytes ?? UPLOAD_LIMITS.PRODUCT_DOCUMENT_MAX_BYTES;
  const maxFiles = options?.maxFiles ?? 3;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 15 * 1024 * 1024,
      files: maxFiles,
    },
  }).fields([
    { name: 'file', maxCount: maxFiles },
    { name: 'documents', maxCount: maxFiles },
    { name: 'document', maxCount: maxFiles },
  ]);

  return (req: Request, res: Response, next: NextFunction): void => {
    upload(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(AppError.badRequest('File size exceeds limit of 10 MB', 'PDF_FILE_TOO_LARGE'));
          }
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return next(
              AppError.badRequest(`Unexpected field. Expected multipart field 'file' or 'documents'`)
            );
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return next(
              AppError.badRequest(
                `Maximum ${maxFiles} documents allowed per upload request`,
                'PRODUCT_DOCUMENT_LIMIT_REACHED'
              )
            );
          }
          return next(AppError.badRequest(err.message));
        }
        return next(err);
      }

      const filesDict = req.files as Record<string, Express.Multer.File[]> | undefined;
      const fileList: Express.Multer.File[] = [
        ...(filesDict?.file ?? []),
        ...(filesDict?.documents ?? []),
        ...(filesDict?.document ?? []),
      ];

      if (fileList.length === 0) {
        return next(AppError.badRequest("No file uploaded. Expected multipart field: 'documents'"));
      }

      if (fileList.length > maxFiles) {
        return next(
          AppError.badRequest(
            `Maximum ${maxFiles} documents allowed per upload request`,
            'PRODUCT_DOCUMENT_LIMIT_REACHED'
          )
        );
      }

      try {
        for (const file of fileList) {
          validateFileSize(file.size, maxBytes, 'Document', 'PDF_FILE_TOO_LARGE');
          const validated = validatePdfContent(file.buffer);
          file.mimetype = validated.mimeType;
        }
        (req as Request & { uploadedFiles?: Express.Multer.File[] }).uploadedFiles = fileList;
        next();
      } catch (validationErr) {
        next(validationErr);
      }
    });
  };
}

/**
 * Creates an Express middleware for Product video uploads (up to 2 videos, max 100 MB each).
 * Strictly validates MP4/WebM container signatures and named multipart field 'videos' (or 'video').
 */
export function requireVideoUpload(options?: { maxBytes?: number; maxFiles?: number }): RequestHandler {
  const maxBytes = options?.maxBytes ?? UPLOAD_LIMITS.PRODUCT_VIDEO_MAX_BYTES;
  const maxFiles = options?.maxFiles ?? 2;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 105 * 1024 * 1024,
      files: maxFiles,
    },
  }).fields([
    { name: 'videos', maxCount: maxFiles },
    { name: 'video', maxCount: maxFiles },
  ]);

  return (req: Request, res: Response, next: NextFunction): void => {
    upload(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(
              AppError.badRequest('Video file size exceeds limit of 100 MB', 'VIDEO_FILE_TOO_LARGE')
            );
          }
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return next(
              AppError.badRequest(
                `Unexpected field. Expected multipart field 'videos' (max ${maxFiles} files)`
              )
            );
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return next(
              AppError.badRequest(
                `Maximum ${maxFiles} videos allowed per upload request`,
                'PRODUCT_VIDEO_LIMIT_REACHED'
              )
            );
          }
          return next(AppError.badRequest(err.message));
        }
        return next(err);
      }

      const filesDict = req.files as Record<string, Express.Multer.File[]> | undefined;
      const fileList: Express.Multer.File[] = [...(filesDict?.videos ?? []), ...(filesDict?.video ?? [])];

      if (fileList.length === 0) {
        return next(AppError.badRequest("No file uploaded. Expected multipart field: 'videos'"));
      }

      if (fileList.length > maxFiles) {
        return next(
          AppError.badRequest(
            `Maximum ${maxFiles} videos allowed per upload request`,
            'PRODUCT_VIDEO_LIMIT_REACHED'
          )
        );
      }

      try {
        for (const file of fileList) {
          validateFileSize(file.size, maxBytes, 'Video', 'VIDEO_FILE_TOO_LARGE');
          const validated = validateVideoContent(file.buffer);
          file.mimetype = validated.mimeType;
        }
        (req as Request & { uploadedFiles?: Express.Multer.File[] }).uploadedFiles = fileList;
        next();
      } catch (validationErr) {
        next(validationErr);
      }
    });
  };
}
