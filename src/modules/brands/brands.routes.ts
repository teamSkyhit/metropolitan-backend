import { Router } from 'express';
import { authenticate, authorize } from '../../middleware';
import { Permission } from '../../shared/security/permissions';
import { requireFileUpload, UPLOAD_LIMITS } from '../../shared/storage';
import { brandsController } from './brands.controller';

export const brandsRouter = Router();

// ── Authenticated CRM Endpoints (/api/v1/brands) ─────────────────────────────

brandsRouter.use(authenticate());

brandsRouter.get('/', authorize(Permission.BRANDS_READ), brandsController.list);
brandsRouter.post('/', authorize(Permission.BRANDS_CREATE), brandsController.create);
brandsRouter.get('/:id', authorize(Permission.BRANDS_READ), brandsController.getById);
brandsRouter.patch('/:id', authorize(Permission.BRANDS_UPDATE), brandsController.update);
brandsRouter.delete('/:id', authorize(Permission.BRANDS_DELETE), brandsController.remove);
brandsRouter.post('/:id/restore', authorize(Permission.BRANDS_UPDATE), brandsController.restore);

// Upload routes
brandsRouter.put(
  '/:id/logo',
  authorize(Permission.BRANDS_UPDATE),
  requireFileUpload({
    maxBytes: UPLOAD_LIMITS.LOGO_MAX_BYTES,
    fieldNames: ['file', 'logo'],
    entityName: 'Logo',
  }),
  brandsController.uploadLogo
);
brandsRouter.delete('/:id/logo', authorize(Permission.BRANDS_UPDATE), brandsController.removeLogo);

brandsRouter.put(
  '/:id/banner',
  authorize(Permission.BRANDS_UPDATE),
  requireFileUpload({
    maxBytes: UPLOAD_LIMITS.BANNER_MAX_BYTES,
    fieldNames: ['file', 'banner'],
    entityName: 'Banner',
  }),
  brandsController.uploadBanner
);
brandsRouter.delete('/:id/banner', authorize(Permission.BRANDS_UPDATE), brandsController.removeBanner);

// ── Public Website Endpoints (/api/v1/public/brands) ─────────────────────────

export const brandsPublicRouter = Router();

brandsPublicRouter.get('/', brandsController.listPublic);
brandsPublicRouter.get('/:slug', brandsController.getBySlugPublic);
