import {
  handle,
  idParamsSchema,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../shared/http';
import { requireAuth } from '../../shared/security/auth-context';
import {
  createProductBodySchema,
  listProductsQuerySchema,
  listPublicProductsQuerySchema,
  productDocumentParamsSchema,
  productGalleryParamsSchema,
  productVideoParamsSchema,
  publicProductSlugParamsSchema,
  reorderProductDocumentsBodySchema,
  reorderProductGalleryBodySchema,
  reorderProductVideosBodySchema,
  updateProductBodySchema,
  updateProductDocumentBodySchema,
  updateProductVideoBodySchema,
  uploadProductDocumentBodySchema,
  uploadProductVideoBodySchema,
  updateProductSpecificationsBodySchema,
} from './products.schema';
import { productsService } from './products.service';

/** HTTP only: read validated input, call the service, send the response. */
export const productsController = {
  list: handle({ query: listProductsQuerySchema }, async (req, res) => {
    const { items, pagination } = await productsService.list(req.query);
    sendPaginated(res, items, pagination);
  }),

  listPublic: handle({ query: listPublicProductsQuerySchema }, async (req, res) => {
    const { items, pagination } = await productsService.listPublic(req.query);
    sendPaginated(res, items, pagination);
  }),

  getBySlugPublic: handle({ params: publicProductSlugParamsSchema }, async (req, res) => {
    sendSuccess(res, await productsService.getBySlugPublic(req.params.slug));
  }),

  getById: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await productsService.getById(req.params.id));
  }),

  create: handle({ body: createProductBodySchema }, async (req, res) => {
    sendCreated(res, await productsService.create(req.body, requireAuth(req).userId));
  }),

  update: handle({ params: idParamsSchema, body: updateProductBodySchema }, async (req, res) => {
    sendSuccess(res, await productsService.update(req.params.id, req.body, requireAuth(req).userId));
  }),

  remove: handle({ params: idParamsSchema }, async (req, res) => {
    await productsService.softDelete(req.params.id, requireAuth(req).userId);
    sendNoContent(res);
  }),

  restore: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await productsService.restore(req.params.id, requireAuth(req).userId));
  }),

  uploadImage: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await productsService.uploadImage(req.params.id, req.file!, requireAuth(req).userId));
  }),

  removeImage: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await productsService.removeImage(req.params.id, requireAuth(req).userId));
  }),

  uploadGallery: handle({ params: idParamsSchema }, async (req, res) => {
    const files =
      (req as unknown as { uploadedFiles?: Express.Multer.File[] }).uploadedFiles ||
      (Array.isArray(req.files) ? req.files : []) ||
      (req.file ? [req.file] : []);
    sendSuccess(res, await productsService.uploadGallery(req.params.id, files, requireAuth(req).userId));
  }),

  removeGalleryImage: handle({ params: productGalleryParamsSchema }, async (req, res) => {
    sendSuccess(
      res,
      await productsService.removeGalleryImage(
        req.params.id,
        req.params.galleryImageId,
        requireAuth(req).userId
      )
    );
  }),

  setPrimaryGalleryImage: handle({ params: productGalleryParamsSchema }, async (req, res) => {
    sendSuccess(
      res,
      await productsService.setPrimaryGalleryImage(
        req.params.id,
        req.params.galleryImageId,
        requireAuth(req).userId
      )
    );
  }),

  reorderGallery: handle(
    { params: idParamsSchema, body: reorderProductGalleryBodySchema },
    async (req, res) => {
      sendSuccess(
        res,
        await productsService.reorderGallery(req.params.id, req.body.imageIds, requireAuth(req).userId)
      );
    }
  ),

  uploadDocuments: handle(
    { params: idParamsSchema, body: uploadProductDocumentBodySchema },
    async (req, res) => {
      const files =
        (req as unknown as { uploadedFiles?: Express.Multer.File[] }).uploadedFiles ||
        (Array.isArray(req.files) ? req.files : []) ||
        (req.file ? [req.file] : []);
      const title = req.body?.title;
      sendSuccess(
        res,
        await productsService.uploadDocuments(req.params.id, files, title, requireAuth(req).userId)
      );
    }
  ),

  removeDocument: handle({ params: productDocumentParamsSchema }, async (req, res) => {
    sendSuccess(
      res,
      await productsService.removeDocument(req.params.id, req.params.documentId, requireAuth(req).userId)
    );
  }),

  updateDocument: handle(
    { params: productDocumentParamsSchema, body: updateProductDocumentBodySchema },
    async (req, res) => {
      sendSuccess(
        res,
        await productsService.updateDocument(
          req.params.id,
          req.params.documentId,
          req.body.title,
          requireAuth(req).userId
        )
      );
    }
  ),

  reorderDocuments: handle(
    { params: idParamsSchema, body: reorderProductDocumentsBodySchema },
    async (req, res) => {
      sendSuccess(
        res,
        await productsService.reorderDocuments(req.params.id, req.body.documentIds, requireAuth(req).userId)
      );
    }
  ),

  uploadVideos: handle({ params: idParamsSchema, body: uploadProductVideoBodySchema }, async (req, res) => {
    const files =
      (req as unknown as { uploadedFiles?: Express.Multer.File[] }).uploadedFiles ||
      (Array.isArray(req.files) ? req.files : []) ||
      (req.file ? [req.file] : []);
    const title = req.body?.title;
    sendSuccess(
      res,
      await productsService.uploadVideos(req.params.id, files, title, requireAuth(req).userId)
    );
  }),

  removeVideo: handle({ params: productVideoParamsSchema }, async (req, res) => {
    sendSuccess(
      res,
      await productsService.removeVideo(req.params.id, req.params.videoId, requireAuth(req).userId)
    );
  }),

  updateVideoTitle: handle(
    { params: productVideoParamsSchema, body: updateProductVideoBodySchema },
    async (req, res) => {
      sendSuccess(
        res,
        await productsService.updateVideoTitle(
          req.params.id,
          req.params.videoId,
          req.body.title,
          requireAuth(req).userId
        )
      );
    }
  ),

  reorderVideos: handle(
    { params: idParamsSchema, body: reorderProductVideosBodySchema },
    async (req, res) => {
      sendSuccess(
        res,
        await productsService.reorderVideos(req.params.id, req.body.videoIds, requireAuth(req).userId)
      );
    }
  ),

  updateSpecifications: handle(
    { params: idParamsSchema, body: updateProductSpecificationsBodySchema },
    async (req, res) => {
      sendSuccess(
        res,
        await productsService.updateSpecifications(
          req.params.id,
          req.body.specifications,
          requireAuth(req).userId
        )
      );
    }
  ),
};
