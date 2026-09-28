import { Router } from 'express';
import { authenticate, authorize } from '../../middleware';
import { Permission } from '../../shared/security/permissions';
import { requireFileUpload, UPLOAD_LIMITS } from '../../shared/storage';
import { categoriesController } from './categories.controller';

export const categoriesRouter = Router();

// ── Authenticated CRM Endpoints (/api/v1/categories) ─────────────────────────

categoriesRouter.use(authenticate());

categoriesRouter.get('/', authorize(Permission.CATEGORIES_READ), categoriesController.list);
categoriesRouter.post('/', authorize(Permission.CATEGORIES_CREATE), categoriesController.create);
categoriesRouter.get('/:id', authorize(Permission.CATEGORIES_READ), categoriesController.getById);
categoriesRouter.patch('/:id', authorize(Permission.CATEGORIES_UPDATE), categoriesController.update);
categoriesRouter.put('/:id', authorize(Permission.CATEGORIES_UPDATE), categoriesController.update);
categoriesRouter.delete('/:id', authorize(Permission.CATEGORIES_DELETE), categoriesController.remove);
categoriesRouter.post('/:id/restore', authorize(Permission.CATEGORIES_UPDATE), categoriesController.restore);

// Upload routes
categoriesRouter.put(
  '/:id/banner',
  authorize(Permission.CATEGORIES_UPDATE),
  requireFileUpload({
    maxBytes: UPLOAD_LIMITS.BANNER_MAX_BYTES,
    fieldNames: ['file', 'banner'],
    entityName: 'Banner',
  }),
  categoriesController.uploadBanner
);
categoriesRouter.delete(
  '/:id/banner',
  authorize(Permission.CATEGORIES_UPDATE),
  categoriesController.removeBanner
);

// ── Public Website Endpoints (/api/v1/public/categories) ─────────────────────

export const categoriesPublicRouter = Router();

categoriesPublicRouter.get('/', categoriesController.listPublic);
categoriesPublicRouter.get('/:seoUrl', categoriesController.getBySeoUrlPublic);
