import type { Request, Response, NextFunction, RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { AppError } from '../errors';
import { validateFileSize, validateImageContent } from './file-validator';

export interface UploadOptions {
  maxBytes: number;
  fieldName: string;
  entityName?: string;
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
            return next(AppError.badRequest('File size exceeds limit'));
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
        validateFileSize(file.size, options.maxBytes, options.entityName ?? 'File');
        const validated = validateImageContent(file.buffer);
        file.mimetype = validated.mimeType;
        next();
      } catch (validationErr) {
        next(validationErr);
      }
    });
  };
}
