import { randomUUID } from 'node:crypto';
import { translatePrismaUniqueError } from '../../shared/database';
import { AppError } from '../../shared/errors';
import { buildPaginationMeta, type Paginated } from '../../shared/http';
import {
  storageService,
  UPLOAD_LIMITS,
  validateFileSize,
  validateImageContent,
  validatePdfContent,
  validateVideoContent,
} from '../../shared/storage';
import { mediaRepository } from '../media';
import { productsRepository, type ProductRecord, type PublicProductRecord } from './products.repository';
import {
  normalizeSku,
  ProductsErrorCode,
  type CreateProductBody,
  type ListProductsQuery,
  type ListPublicProductsQuery,
  type ProductDto,
  type ProductSpecificationItem,
  type PublicProductDto,
  type UpdateProductBody,
} from './products.schema';

function handleProductUniqueError(err: unknown): never {
  translatePrismaUniqueError(err, [
    {
      fieldSubstring: 'sku',
      errorCode: ProductsErrorCode.SKU_TAKEN,
      errorMessage: 'A product with this SKU already exists',
    },
    {
      fieldSubstring: 'slug',
      errorCode: ProductsErrorCode.SLUG_TAKEN,
      errorMessage: 'A product with this slug already exists',
    },
  ]);
}

/** Maps database record to Admin Product DTO. */
export function toProductDto(record: ProductRecord): ProductDto {
  const gallery = Array.isArray(record.galleryImages)
    ? record.galleryImages.map((img) => ({
        id: img.id,
        mediaId: img.mediaId,
        publicUrl: img.media.publicUrl,
        sortOrder: img.sortOrder,
        isPrimary: img.isPrimary,
      }))
    : [];

  const videos = Array.isArray(record.videos)
    ? record.videos.map((vid) => ({
        id: vid.id,
        mediaId: vid.mediaId,
        title: vid.title,
        publicUrl: vid.media?.publicUrl ?? '',
        sortOrder: vid.sortOrder,
      }))
    : [];

  const documents = Array.isArray(record.documents)
    ? record.documents.map((doc) => ({
        id: doc.id,
        mediaId: doc.mediaId,
        title: doc.title,
        publicUrl: doc.media?.publicUrl ?? '',
        originalFileName: doc.originalFileName ?? doc.media?.fileName ?? null,
        sortOrder: doc.sortOrder,
      }))
    : [];

  const primaryGallery = gallery.find((g) => g.isPrimary) ?? gallery[0];
  const effectiveImageUrl = record.imageUrl ?? primaryGallery?.publicUrl ?? null;

  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    sku: record.sku,
    brandId: record.brandId,
    categoryId: record.categoryId,
    description: record.description,
    price: record.price !== null ? record.price.toNumber() : null,
    priceVisibility: record.priceVisibility,
    status: record.status,
    hotDeal: record.hotDeal,
    imageUrl: effectiveImageUrl,
    gallery,
    videos,
    documents,
    specifications: Array.isArray(record.specifications)
      ? (record.specifications as unknown as ProductSpecificationItem[])
      : null,
    brand: record.brand
      ? {
          id: record.brand.id,
          name: record.brand.name,
          slug: record.brand.slug,
        }
      : undefined,
    category: record.category
      ? {
          id: record.category.id,
          name: record.category.name,
          slug: record.category.slug,
        }
      : undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Resolves a collision-free slug using base-slug, base-slug-2, base-slug-3, ... */
export async function resolveUniqueProductSlug(baseName: string, exceptProductId?: string): Promise<string> {
  const baseSlug = (generateSlug(baseName) || 'product').substring(0, 100);
  let candidate = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await productsRepository.findBySlugIncludingDeleted(candidate);
    if (!existing || existing.id === exceptProductId) {
      return candidate;
    }
    counter++;
    candidate = `${baseSlug}-${counter}`;
  }
}

/** Maps database record to Public Product DTO using stored Product.slug without internal audit and CRM-only fields. */
export function toPublicProductDto(
  record: PublicProductRecord,
  options?: { lightweight?: boolean }
): PublicProductDto {
  const primaryGallery = Array.isArray(record.galleryImages)
    ? (record.galleryImages.find((img) => img.isPrimary) ?? record.galleryImages[0])
    : undefined;
  const effectiveImageUrl = record.imageUrl ?? primaryGallery?.media.publicUrl ?? null;

  const gallery = options?.lightweight
    ? []
    : Array.isArray(record.galleryImages)
      ? record.galleryImages.map((img) => ({
          id: img.id,
          publicUrl: img.media.publicUrl,
          sortOrder: img.sortOrder,
          isPrimary: img.isPrimary,
        }))
      : [];

  const videos = options?.lightweight
    ? []
    : Array.isArray(record.videos)
      ? record.videos.map((vid) => ({
          id: vid.id,
          title: vid.title,
          publicUrl: vid.media?.publicUrl ?? '',
          sortOrder: vid.sortOrder,
        }))
      : [];

  const documents = options?.lightweight
    ? []
    : Array.isArray(record.documents)
      ? record.documents.map((doc) => ({
          id: doc.id,
          title: doc.title,
          publicUrl: doc.media?.publicUrl ?? '',
          originalFileName: doc.originalFileName ?? doc.media?.fileName ?? null,
          sortOrder: doc.sortOrder,
        }))
      : [];

  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    sku: record.sku,
    description: record.description,
    price: record.priceVisibility && record.price !== null ? record.price.toNumber() : null,
    hotDeal: record.hotDeal,
    imageUrl: effectiveImageUrl,
    gallery,
    videos,
    documents,
    specifications: Array.isArray(record.specifications)
      ? (record.specifications as unknown as ProductSpecificationItem[])
      : null,
    brand: {
      id: record.brand.id,
      name: record.brand.name,
      slug: record.brand.slug,
      description: record.brand.description,
      logoUrl: record.brand.logoUrl,
      bannerUrl: record.brand.bannerUrl,
    },
    category: {
      id: record.category.id,
      name: record.category.name,
      slug: record.category.slug,
      description: record.category.description,
      imageUrl: record.category.imageUrl ?? null,
      bannerUrl: record.category.bannerUrl,
    },
    createdAt: record.createdAt.toISOString(),
  };
}

async function assertSkuAvailable(sku: string, exceptProductId?: string): Promise<void> {
  const normalizedSku = normalizeSku(sku);
  const existing = await productsRepository.findBySkuIncludingDeleted(normalizedSku);
  if (!existing || existing.id === exceptProductId) return;
  if (existing.deletedAt) {
    throw AppError.conflict(
      'This SKU belongs to a deleted product. Please restore the deleted product instead.',
      ProductsErrorCode.SKU_BELONGS_TO_DELETED_PRODUCT,
      { productId: existing.id }
    );
  }
  throw AppError.conflict('A product with this SKU already exists', ProductsErrorCode.SKU_TAKEN);
}

export interface BrandAssignableValidator {
  assertAssignable(
    id: string,
    options?: { notFoundCode?: string; unavailableCode?: string }
  ): Promise<unknown>;
}

export interface CategoryAssignableValidator {
  assertAssignable(
    id: string,
    options?: { notFoundCode?: string; unavailableCode?: string }
  ): Promise<unknown>;
}

let configuredBrandsService: BrandAssignableValidator | null = null;
let configuredCategoriesService: CategoryAssignableValidator | null = null;

/**
 * Wires cross-module brand and category assignable validators from the composition root
 * (src/routes/index.ts) to avoid circular imports between products, brands, and categories.
 */
export function registerProductAssignValidation(deps: {
  brandsService: BrandAssignableValidator;
  categoriesService: CategoryAssignableValidator;
}): void {
  configuredBrandsService = deps.brandsService;
  configuredCategoriesService = deps.categoriesService;
}

async function assertValidBrand(brandId: string): Promise<void> {
  const validator = configuredBrandsService;
  if (!validator) {
    throw AppError.internal('Brands service validator is not configured');
  }
  await validator.assertAssignable(brandId, {
    notFoundCode: ProductsErrorCode.BRAND_NOT_FOUND,
    unavailableCode: ProductsErrorCode.BRAND_UNAVAILABLE,
  });
}

async function assertValidCategory(categoryId: string): Promise<void> {
  const validator = configuredCategoriesService;
  if (!validator) {
    throw AppError.internal('Categories service validator is not configured');
  }
  await validator.assertAssignable(categoryId, {
    notFoundCode: ProductsErrorCode.CATEGORY_NOT_FOUND,
    unavailableCode: ProductsErrorCode.CATEGORY_UNAVAILABLE,
  });
}

export const productsService = {
  async list(query: ListProductsQuery): Promise<Paginated<ProductDto>> {
    const { items, total } = await productsRepository.findMany(query);
    return { items: items.map(toProductDto), pagination: buildPaginationMeta(query, total) };
  },

  async listPublic(query: ListPublicProductsQuery): Promise<Paginated<PublicProductDto>> {
    const { items, total } = await productsRepository.findManyPublic(query);
    return {
      items: items.map((item) => toPublicProductDto(item, { lightweight: true })),
      pagination: buildPaginationMeta(query, total),
    };
  },

  async getById(id: string): Promise<ProductDto> {
    const record = await productsRepository.findById(id);
    if (!record) throw AppError.notFound('Product');
    return toProductDto(record);
  },

  async getByIds(ids: string[]): Promise<ProductDto[]> {
    if (ids.length === 0) return [];
    const records = await productsRepository.findByIds(ids);
    return records.map(toProductDto);
  },

  async getByIdsPublic(ids: string[]): Promise<PublicProductDto[]> {
    if (ids.length === 0) return [];
    const records = await productsRepository.findByIdsPublic(ids);
    return records.map((record) => toPublicProductDto(record));
  },

  async getBySlugPublic(slug: string): Promise<PublicProductDto> {
    const record = await productsRepository.findByIdOrSkuPublic(slug);
    if (!record) throw AppError.notFound('Product');
    return toPublicProductDto(record);
  },

  async create(body: CreateProductBody, actorId: string): Promise<ProductDto> {
    await assertValidBrand(body.brandId);
    await assertValidCategory(body.categoryId);
    const normalizedSku = normalizeSku(body.sku);
    await assertSkuAvailable(normalizedSku);
    const slug = await resolveUniqueProductSlug(body.name);

    try {
      const record = await productsRepository.create({ ...body, sku: normalizedSku, slug }, actorId);
      return toProductDto(record);
    } catch (err) {
      handleProductUniqueError(err);
    }
  },

  async update(id: string, body: UpdateProductBody, actorId: string): Promise<ProductDto> {
    const existing = await productsRepository.findById(id);
    if (!existing) throw AppError.notFound('Product');

    const normalizedSku = body.sku !== undefined ? normalizeSku(body.sku) : undefined;

    if (normalizedSku && normalizedSku !== existing.sku) {
      await assertSkuAvailable(normalizedSku, id);
    }
    if (body.brandId && body.brandId !== existing.brandId) {
      await assertValidBrand(body.brandId);
    }
    if (body.categoryId && body.categoryId !== existing.categoryId) {
      await assertValidCategory(body.categoryId);
    }

    const newSlug =
      body.name !== undefined && body.name.trim() !== existing.name
        ? await resolveUniqueProductSlug(body.name, id)
        : undefined;

    try {
      const updated = await productsRepository.update(
        id,
        {
          ...body,
          ...(normalizedSku !== undefined && { sku: normalizedSku }),
          ...(newSlug !== undefined && { slug: newSlug }),
        },
        actorId
      );
      return toProductDto(updated);
    } catch (err) {
      handleProductUniqueError(err);
    }
  },

  async softDelete(id: string, actorId: string): Promise<void> {
    const existing = await productsRepository.findById(id);
    if (!existing) throw AppError.notFound('Product');
    await productsRepository.softDelete(id, actorId);
  },

  async restore(id: string, actorId: string): Promise<ProductDto> {
    const existing = await productsRepository.findByIdIncludingDeleted(id);
    if (!existing) throw AppError.notFound('Product');
    if (!existing.deletedAt) {
      throw AppError.conflict('Product is not deleted', ProductsErrorCode.NOT_DELETED);
    }
    const restored = await productsRepository.restore(id, actorId);
    return toProductDto(restored);
  },

  async uploadImage(id: string, file: Express.Multer.File, actorId: string): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    validateFileSize(file.size, UPLOAD_LIMITS.PRODUCT_IMAGE_MAX_BYTES, 'Product image');
    const validated = validateImageContent(file.buffer);

    const oldImageUrl = product.imageUrl;

    const stored = await storageService.upload(
      {
        filename: `${randomUUID()}${validated.extension}`,
        buffer: file.buffer,
        mimeType: validated.mimeType,
        size: file.size,
      },
      'products/images'
    );

    const updated = await productsRepository.updateImage(id, stored.url, actorId);

    if (oldImageUrl && !oldImageUrl.includes('/media/')) {
      await storageService.delete(oldImageUrl).catch(() => {});
    }

    return toProductDto(updated);
  },

  async removeImage(id: string, actorId: string): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    const oldImageUrl = product.imageUrl;
    const updated = await productsRepository.updateImage(id, null, actorId);

    if (oldImageUrl && !oldImageUrl.includes('/media/')) {
      await storageService.delete(oldImageUrl).catch(() => {});
    }

    return toProductDto(updated);
  },

  async updateSpecifications(
    id: string,
    specifications: ProductSpecificationItem[],
    actorId: string
  ): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    const updated = await productsRepository.updateSpecifications(id, specifications, actorId);
    return toProductDto(updated);
  },

  async uploadGallery(id: string, files: Express.Multer.File[], actorId: string): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    const currentCount = await productsRepository.countActiveGalleryImages(id);
    if (currentCount + files.length > 5) {
      throw AppError.conflict(
        `Product gallery cannot exceed 5 images. Current: ${currentCount}, uploading: ${files.length}.`,
        ProductsErrorCode.GALLERY_LIMIT_REACHED,
        { currentCount, requested: files.length, maxLimit: 5 }
      );
    }

    const uploadedStoredFiles: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        validateFileSize(file.size, UPLOAD_LIMITS.PRODUCT_GALLERY_IMAGE_MAX_BYTES, 'Gallery image');
        const validated = validateImageContent(file.buffer);

        const stored = await storageService.upload(
          {
            filename: `${randomUUID()}${validated.extension}`,
            buffer: file.buffer,
            mimeType: validated.mimeType,
            size: file.size,
          },
          'products/gallery'
        );
        uploadedStoredFiles.push(stored.path);

        const mediaRecord = await mediaRepository.create({
          fileName: file.originalname || stored.filename,
          storageKey: stored.path,
          publicUrl: stored.url,
          mimeType: validated.mimeType,
          fileSize: file.size,
          uploadedById: actorId,
          actorId,
        });

        // Set primary if no gallery images exist yet and this is the first one, or if product.imageUrl is empty
        const isPrimary = currentCount === 0 && i === 0;
        await productsRepository.addGalleryImage(
          id,
          {
            mediaId: mediaRecord.id,
            sortOrder: currentCount + i,
            isPrimary,
          },
          actorId
        );

        if (isPrimary || !product.imageUrl) {
          await productsRepository.updateImage(id, stored.url, actorId);
        }
      }
    } catch (err) {
      for (const storagePath of uploadedStoredFiles) {
        await storageService.delete(storagePath).catch(() => {});
      }
      throw err;
    }

    return this.getById(id);
  },

  async removeGalleryImage(id: string, galleryImageId: string, actorId: string): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    const img = await productsRepository.findActiveGalleryImageById(id, galleryImageId);
    if (!img) {
      throw AppError.notFound('Product gallery image', ProductsErrorCode.GALLERY_IMAGE_NOT_FOUND);
    }

    const wasPrimary = img.isPrimary;
    await productsRepository.removeGalleryImage(id, galleryImageId, actorId);

    if (wasPrimary) {
      const refreshed = await productsRepository.findById(id);
      const remaining = refreshed?.galleryImages ?? [];
      const firstRemaining = remaining[0];
      if (firstRemaining) {
        await productsRepository.setPrimaryGalleryImage(id, firstRemaining.id, actorId);
      } else {
        await productsRepository.updateImage(id, null, actorId);
      }
    }

    return this.getById(id);
  },

  async setPrimaryGalleryImage(id: string, galleryImageId: string, actorId: string): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    const img = await productsRepository.findActiveGalleryImageById(id, galleryImageId);
    if (!img) {
      throw AppError.notFound('Product gallery image', ProductsErrorCode.GALLERY_IMAGE_NOT_FOUND);
    }

    await productsRepository.setPrimaryGalleryImage(id, galleryImageId, actorId);
    return this.getById(id);
  },

  async reorderGallery(id: string, imageIds: string[], actorId: string): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    const existingImages = product.galleryImages ?? [];
    const existingIds = new Set(existingImages.map((img) => img.id));

    if (imageIds.length !== existingImages.length || !imageIds.every((imgId) => existingIds.has(imgId))) {
      throw AppError.badRequest('Provided image IDs must match active gallery images for this product');
    }

    await productsRepository.reorderGalleryImages(id, imageIds, actorId);
    return this.getById(id);
  },

  async uploadDocuments(
    id: string,
    files: Express.Multer.File[],
    title: string | undefined,
    actorId: string
  ): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    const currentCount = await productsRepository.countActiveDocuments(id);
    if (currentCount + files.length > 3) {
      throw AppError.conflict(
        `Product documents cannot exceed 3 PDFs. Current: ${currentCount}, uploading: ${files.length}.`,
        ProductsErrorCode.DOCUMENT_LIMIT_REACHED,
        { currentCount, requested: files.length, maxLimit: 3 }
      );
    }

    const uploadedStoredFiles: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        validateFileSize(
          file.size,
          UPLOAD_LIMITS.PRODUCT_DOCUMENT_MAX_BYTES,
          'Document',
          'PDF_FILE_TOO_LARGE'
        );
        const validated = validatePdfContent(file.buffer);

        const stored = await storageService.upload(
          {
            filename: `${randomUUID()}${validated.extension}`,
            buffer: file.buffer,
            mimeType: validated.mimeType,
            size: file.size,
          },
          'products/documents'
        );
        uploadedStoredFiles.push(stored.path);

        const mediaRecord = await mediaRepository.create({
          fileName: file.originalname || stored.filename,
          storageKey: stored.path,
          publicUrl: stored.url,
          mimeType: validated.mimeType,
          fileSize: file.size,
          uploadedById: actorId,
          actorId,
        });

        const docTitle =
          files.length === 1 && title && title.trim()
            ? title.trim()
            : file.originalname
              ? file.originalname.replace(/\.[^/.]+$/, '').trim() || 'Document'
              : 'Document';

        await productsRepository.addDocument(
          id,
          {
            mediaId: mediaRecord.id,
            title: docTitle,
            originalFileName: file.originalname || null,
            sortOrder: currentCount + i,
          },
          actorId
        );
      }
    } catch (err) {
      for (const storagePath of uploadedStoredFiles) {
        await storageService.delete(storagePath).catch(() => {});
      }
      throw err;
    }

    return this.getById(id);
  },

  async removeDocument(id: string, documentId: string, actorId: string): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    const doc = await productsRepository.findActiveDocumentById(id, documentId);
    if (!doc) {
      throw AppError.notFound('Product document', ProductsErrorCode.DOCUMENT_NOT_FOUND);
    }

    await productsRepository.removeDocument(id, documentId, actorId);
    return this.getById(id);
  },

  async updateDocument(id: string, documentId: string, title: string, actorId: string): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    const doc = await productsRepository.findActiveDocumentById(id, documentId);
    if (!doc) {
      throw AppError.notFound('Product document', ProductsErrorCode.DOCUMENT_NOT_FOUND);
    }

    await productsRepository.updateDocumentTitle(id, documentId, title.trim(), actorId);
    return this.getById(id);
  },

  async reorderDocuments(id: string, documentIds: string[], actorId: string): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    const existingDocs = product.documents ?? [];
    const existingIds = new Set(existingDocs.map((doc) => doc.id));

    if (documentIds.length !== existingDocs.length || !documentIds.every((docId) => existingIds.has(docId))) {
      throw AppError.badRequest('Provided document IDs must match active documents for this product');
    }

    await productsRepository.reorderDocuments(id, documentIds, actorId);
    return this.getById(id);
  },

  async uploadVideos(
    id: string,
    files: Express.Multer.File[],
    title: string | undefined,
    actorId: string
  ): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    const currentCount = await productsRepository.countActiveVideos(id);
    if (currentCount + files.length > 2) {
      throw AppError.conflict(
        `Product videos cannot exceed 2 videos. Current: ${currentCount}, uploading: ${files.length}.`,
        ProductsErrorCode.PRODUCT_VIDEO_LIMIT_REACHED,
        { currentCount, requested: files.length, maxLimit: 2 }
      );
    }

    const uploadedStoredFiles: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        validateFileSize(file.size, UPLOAD_LIMITS.PRODUCT_VIDEO_MAX_BYTES, 'Video', 'VIDEO_FILE_TOO_LARGE');
        const validated = validateVideoContent(file.buffer);

        const stored = await storageService.upload(
          {
            filename: `${randomUUID()}${validated.extension}`,
            buffer: file.buffer,
            mimeType: validated.mimeType,
            size: file.size,
          },
          'products/videos'
        );
        uploadedStoredFiles.push(stored.path);

        const mediaRecord = await mediaRepository.create({
          fileName: file.originalname || stored.filename,
          storageKey: stored.path,
          publicUrl: stored.url,
          mimeType: validated.mimeType,
          fileSize: file.size,
          uploadedById: actorId,
          actorId,
        });

        const videoTitle =
          files.length === 1 && title && title.trim()
            ? title.trim()
            : file.originalname
              ? file.originalname.replace(/\.[^/.]+$/, '').trim() || null
              : null;

        await productsRepository.addVideo(
          id,
          {
            mediaId: mediaRecord.id,
            title: videoTitle,
            sortOrder: currentCount + i,
          },
          actorId
        );
      }
    } catch (err) {
      for (const storagePath of uploadedStoredFiles) {
        await storageService.delete(storagePath).catch(() => {});
      }
      throw err;
    }

    return this.getById(id);
  },

  async removeVideo(id: string, videoId: string, actorId: string): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    const video = await productsRepository.findActiveVideoById(id, videoId);
    if (!video) {
      throw AppError.notFound('Product video', ProductsErrorCode.VIDEO_NOT_FOUND);
    }

    await productsRepository.removeVideo(id, videoId, actorId);
    return this.getById(id);
  },

  async updateVideoTitle(
    id: string,
    videoId: string,
    title: string | null | undefined,
    actorId: string
  ): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    const video = await productsRepository.findActiveVideoById(id, videoId);
    if (!video) {
      throw AppError.notFound('Product video', ProductsErrorCode.VIDEO_NOT_FOUND);
    }

    await productsRepository.updateVideoTitle(id, videoId, title?.trim() || null, actorId);
    return this.getById(id);
  },

  async reorderVideos(id: string, videoIds: string[], actorId: string): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    const existingVideos = product.videos ?? [];
    const existingIds = new Set(existingVideos.map((vid) => vid.id));

    if (videoIds.length !== existingVideos.length || !videoIds.every((vidId) => existingIds.has(vidId))) {
      throw AppError.badRequest('Provided video IDs must match active videos for this product');
    }

    await productsRepository.reorderVideos(id, videoIds, actorId);
    return this.getById(id);
  },

  async isMediaUrlReferenced(url: string, id?: string): Promise<boolean> {
    return productsRepository.isMediaUrlReferenced(url, id);
  },
};
