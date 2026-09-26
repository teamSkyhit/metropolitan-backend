import type { Request, Response, NextFunction, RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { AppError } from '../errors';
import { validateFileSize, validateImageContent } from './file-validator';

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    // Generous upper bound, refined by validator per route
    fileSize: 10 * 1024 * 1024,
  },
});

export interface UploadOptions {
  maxBytes: number;
  fieldNames?: string[];
  entityName?: string;
}

/**
 * Creates an Express middleware for file uploads with byte content verification.
 * Accepts the specified field names (default: 'file', 'logo', 'banner').
 */
export function requireFileUpload(options: UploadOptions): RequestHandler {
  const allowedFields = options.fieldNames ?? ['file', 'logo', 'banner'];

  return (req: Request, res: Response, next: NextFunction): void => {
    memoryUpload.any()(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(AppError.badRequest(`File size exceeds limit`));
          }
          return next(AppError.badRequest(err.message));
        }
        return next(err);
      }

      const files = req.files as Express.Multer.File[] | undefined;
      const file = files?.find((f) => allowedFields.includes(f.fieldname)) ?? files?.[0];

      if (!file) {
        return next(
          AppError.badRequest(`No file uploaded. Expected multipart field: ${allowedFields.join(' or ')}`)
        );
      }

      try {
        validateFileSize(file.size, options.maxBytes, options.entityName ?? 'File');
        const validated = validateImageContent(file.buffer);
        file.mimetype = validated.mimeType;
        req.file = file;
        next();
      } catch (validationErr) {
        next(validationErr);
      }
    });
  };
}
