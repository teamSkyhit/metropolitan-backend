import { Router } from 'express';
import { authenticate, authorize } from '../../middleware';
import { Permission } from '../../shared/security/permissions';
import {
  requireDocumentUpload,
  requireFileUpload,
  requireGalleryUpload,
  requireVideoUpload,
  UPLOAD_LIMITS,
} from '../../shared/storage';
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

// Gallery routes
productsRouter.post(
  '/:id/gallery',
  authorize(Permission.PRODUCTS_UPDATE),
  requireGalleryUpload(),
  productsController.uploadGallery
);
productsRouter.patch(
  '/:id/gallery/reorder',
  authorize(Permission.PRODUCTS_UPDATE),
  productsController.reorderGallery
);
productsRouter.patch(
  '/:id/gallery/:galleryImageId/primary',
  authorize(Permission.PRODUCTS_UPDATE),
  productsController.setPrimaryGalleryImage
);
productsRouter.delete(
  '/:id/gallery/:galleryImageId',
  authorize(Permission.PRODUCTS_UPDATE),
  productsController.removeGalleryImage
);

// Video routes
productsRouter.post(
  '/:id/videos',
  authorize(Permission.PRODUCTS_UPDATE),
  requireVideoUpload(),
  productsController.uploadVideos
);
productsRouter.patch(
  '/:id/videos/reorder',
  authorize(Permission.PRODUCTS_UPDATE),
  productsController.reorderVideos
);
productsRouter.patch(
  '/:id/videos/:videoId',
  authorize(Permission.PRODUCTS_UPDATE),
  productsController.updateVideoTitle
);
productsRouter.delete(
  '/:id/videos/:videoId',
  authorize(Permission.PRODUCTS_UPDATE),
  productsController.removeVideo
);

// Document routes
productsRouter.post(
  '/:id/documents',
  authorize(Permission.PRODUCTS_UPDATE),
  requireDocumentUpload(),
  productsController.uploadDocuments
);
productsRouter.patch(
  '/:id/documents/reorder',
  authorize(Permission.PRODUCTS_UPDATE),
  productsController.reorderDocuments
);
productsRouter.patch(
  '/:id/documents/:documentId',
  authorize(Permission.PRODUCTS_UPDATE),
  productsController.updateDocument
);
productsRouter.delete(
  '/:id/documents/:documentId',
  authorize(Permission.PRODUCTS_UPDATE),
  productsController.removeDocument
);

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
