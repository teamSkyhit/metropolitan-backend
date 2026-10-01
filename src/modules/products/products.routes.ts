import { Router } from 'express';
import { authenticate, authorize } from '../../middleware';
import { Permission } from '../../shared/security/permissions';
import { requireFileUpload, UPLOAD_LIMITS } from '../../shared/storage';
import { productsController } from './products.controller';

export const productsRouter = Router();

// ── Authenticated CRM Endpoints (/api/v1/products) ───────────────────────────

productsRouter.use(authenticate());

productsRouter.get('/', authorize(Permission.PRODUCTS_READ), productsController.list);
productsRouter.post('/', authorize(Permission.PRODUCTS_CREATE), productsController.create);
productsRouter.get('/:id', authorize(Permission.PRODUCTS_READ), productsController.getById);
productsRouter.patch('/:id', authorize(Permission.PRODUCTS_UPDATE), productsController.update);
productsRouter.delete('/:id', authorize(Permission.PRODUCTS_DELETE), productsController.remove);
productsRouter.post('/:id/restore', authorize(Permission.PRODUCTS_UPDATE), productsController.restore);

// Media routes
productsRouter.put(
  '/:id/image',
  authorize(Permission.PRODUCTS_UPDATE),
  requireFileUpload({
    maxBytes: UPLOAD_LIMITS.PRODUCT_IMAGE_MAX_BYTES,
    fieldName: 'image',
    entityName: 'Product image',
  }),
  productsController.uploadImage
);
productsRouter.delete('/:id/image', authorize(Permission.PRODUCTS_UPDATE), productsController.removeImage);

// Specifications route
productsRouter.put(
  '/:id/specifications',
  authorize(Permission.PRODUCTS_UPDATE),
  productsController.updateSpecifications
);

// ── Public Website Endpoints (/api/v1/public/products) ───────────────────────

export const productsPublicRouter = Router();

productsPublicRouter.get('/', productsController.listPublic);
productsPublicRouter.get('/:slug', productsController.getBySlugPublic);
