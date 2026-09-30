import { Router } from 'express';
import { authenticate, authorize } from '../../middleware';
import { Permission } from '../../shared/security/permissions';
import { requireFileUpload, UPLOAD_LIMITS } from '../../shared/storage';
import { mediaController } from './media.controller';

export const mediaRouter = Router();

// ── Authenticated CRM Endpoints (/api/v1/media) ──────────────────────────────

mediaRouter.use(authenticate());

mediaRouter.get('/', authorize(Permission.MEDIA_READ), mediaController.list);
mediaRouter.get('/:id', authorize(Permission.MEDIA_READ), mediaController.getById);

mediaRouter.post(
  '/upload',
  authorize(Permission.MEDIA_CREATE),
  requireFileUpload({
    maxBytes: UPLOAD_LIMITS.PRODUCT_IMAGE_MAX_BYTES,
    fieldName: 'file',
    entityName: 'Media file',
  }),
  mediaController.upload
);

mediaRouter.delete('/:id', authorize(Permission.MEDIA_DELETE), mediaController.remove);
