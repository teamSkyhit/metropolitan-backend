import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  productsService,
  toProductDto,
  toPublicProductDto,
} from '../../src/modules/products/products.service';
import { productsRepository, type ProductRecord } from '../../src/modules/products/products.repository';
import { mediaRepository } from '../../src/modules/media';
import { storageService } from '../../src/shared/storage';
import { ProductsErrorCode } from '../../src/modules/products/products.schema';

describe('Product Media Service (unit)', () => {
  const dummyProduct = {
    id: 'prod-1111-1111-1111-111111111111',
    name: 'Industrial Motor 500W',
    nameKey: 'industrial motor 500w',
    slug: 'industrial-motor-500w',
    sku: 'IND-MTR-500',
    description: 'High power industrial motor',
    shortDescription: 'Motor 500W',
    imageUrl: null,
    pdfUrl: null,
    categoryId: 'cat-1111-1111-1111-111111111111',
    brandId: 'brand-1111-1111-1111-111111111111',
    price: null,
    costPrice: null,
    priceVisibility: 'PUBLIC',
    status: 'PUBLISHED',
    hotDeal: false,
    currency: 'AED',
    stock: 25,
    minStock: 5,
    isActive: true,
    isFeatured: false,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdById: 'actor-1',
    updatedById: 'actor-1',
    category: { id: 'cat-1', name: 'Motors', slug: 'motors' },
    brand: { id: 'brand-1', name: 'Siemens', slug: 'siemens' },
    specifications: [],
    galleryImages: [],
    documents: [],
    videos: [],
  } as unknown as ProductRecord;

  const sampleImageFile = {
    fieldname: 'images',
    originalname: 'image.jpg',
    encoding: '7bit',
    filename: 'image.jpg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
    mimetype: 'image/jpeg',
    size: 10,
  } as unknown as Express.Multer.File;

  const samplePdfFile = {
    fieldname: 'file',
    originalname: 'specsheet.pdf',
    encoding: '7bit',
    filename: 'specsheet.pdf',
    buffer: Buffer.from('%PDF-1.4\n%specsheet-binary-stream'),
    mimetype: 'application/pdf',
    size: 30,
  } as unknown as Express.Multer.File;

  const sampleMp4File = {
    fieldname: 'videos',
    originalname: 'demo.mp4',
    encoding: '7bit',
    filename: 'demo.mp4',
    buffer: Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x20]),
      Buffer.from('ftypisom'),
      Buffer.from([0x00, 0x00, 0x02, 0x00]),
      Buffer.from('isomiso2mp41'),
    ]),
    mimetype: 'video/mp4',
    size: 32,
  } as unknown as Express.Multer.File;

  const sampleWebmFile = {
    fieldname: 'videos',
    originalname: 'clip.webm',
    encoding: '7bit',
    filename: 'clip.webm',
    buffer: Buffer.concat([
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      Buffer.from([0x42, 0x82, 0x84]),
      Buffer.from('webm'),
    ]),
    mimetype: 'video/webm',
    size: 20,
  } as unknown as Express.Multer.File;

  const sampleFakeMp4File = {
    fieldname: 'videos',
    originalname: 'fake.mp4',
    encoding: '7bit',
    filename: 'fake.mp4',
    buffer: Buffer.from('NOT_AN_MP4_FILE_CORRUPTED'),
    mimetype: 'video/mp4',
    size: 25,
  } as unknown as Express.Multer.File;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Gallery: Upload & Limits', () => {
    it('uploads first gallery image and marks it as primary automatically', async () => {
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(dummyProduct);
      vi.spyOn(productsRepository, 'countActiveGalleryImages').mockResolvedValue(0);
      vi.spyOn(productsRepository, 'updateImage').mockResolvedValue(dummyProduct);
      vi.spyOn(storageService, 'upload').mockResolvedValue({
        filename: 'img1.jpg',
        path: 'products/gallery/img1.jpg',
        url: 'https://cdn.example.com/products/gallery/img1.jpg',
        size: 10,
        mimeType: 'image/jpeg',
      });
      vi.spyOn(mediaRepository, 'create').mockResolvedValue({
        id: 'media-1',
        fileName: 'image.jpg',
        storageKey: 'products/gallery/img1.jpg',
        publicUrl: 'https://cdn.example.com/products/gallery/img1.jpg',
        mimeType: 'image/jpeg',
        fileSize: 10,
        uploadedById: 'actor-1',
        createdById: 'actor-1',
        updatedById: 'actor-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const addGallerySpy = vi.spyOn(productsRepository, 'addGalleryImage').mockResolvedValue({
        id: 'gallery-1',
        productId: dummyProduct.id,
        mediaId: 'media-1',
        sortOrder: 0,
        isPrimary: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdById: 'actor-1',
        updatedById: 'actor-1',
        media: {
          id: 'media-1',
          publicUrl: 'https://cdn.example.com/products/gallery/img1.jpg',
        },
      });

      const productWithGallery = {
        ...dummyProduct,
        galleryImages: [
          {
            id: 'gallery-1',
            productId: dummyProduct.id,
            mediaId: 'media-1',
            sortOrder: 0,
            isPrimary: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            createdById: 'actor-1',
            updatedById: 'actor-1',
            media: {
              id: 'media-1',
              publicUrl: 'https://cdn.example.com/products/gallery/img1.jpg',
            },
          },
        ],
      } as unknown as ProductRecord;
      vi.spyOn(productsService, 'getById').mockResolvedValue(toProductDto(productWithGallery));

      const result = await productsService.uploadGallery(dummyProduct.id, [sampleImageFile], 'actor-1');

      expect(addGallerySpy).toHaveBeenCalledWith(
        dummyProduct.id,
        expect.objectContaining({
          mediaId: 'media-1',
          sortOrder: 0,
          isPrimary: true,
        }),
        'actor-1'
      );
      expect(result.gallery).toHaveLength(1);
      expect(result.gallery[0]?.isPrimary).toBe(true);
    });

    it('rejects upload when gallery limit of 5 is already reached (PRODUCT_GALLERY_LIMIT_REACHED)', async () => {
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(dummyProduct);
      vi.spyOn(productsRepository, 'countActiveGalleryImages').mockResolvedValue(5);

      await expect(
        productsService.uploadGallery(dummyProduct.id, [sampleImageFile], 'actor-1')
      ).rejects.toThrow(
        expect.objectContaining({
          code: ProductsErrorCode.GALLERY_LIMIT_REACHED,
          statusCode: 409,
        })
      );
    });

    it('rejects upload when adding batch would exceed max 5 images', async () => {
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(dummyProduct);
      vi.spyOn(productsRepository, 'countActiveGalleryImages').mockResolvedValue(4);

      await expect(
        productsService.uploadGallery(dummyProduct.id, [sampleImageFile, sampleImageFile], 'actor-1')
      ).rejects.toThrow(
        expect.objectContaining({
          code: ProductsErrorCode.GALLERY_LIMIT_REACHED,
        })
      );
    });
  });

  describe('Gallery: Primary & Reorder & Remove', () => {
    it('sets primary gallery image and marks other as non-primary', async () => {
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(dummyProduct);
      vi.spyOn(productsRepository, 'findActiveGalleryImageById').mockResolvedValue({
        id: 'g2',
        productId: dummyProduct.id,
        mediaId: 'm2',
        sortOrder: 1,
        isPrimary: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdById: 'actor-1',
        updatedById: 'actor-1',
        media: { id: 'm2', publicUrl: 'https://cdn.example.com/2.jpg' },
      });

      const setPrimarySpy = vi.spyOn(productsRepository, 'setPrimaryGalleryImage').mockResolvedValue({
        id: 'g2',
        productId: dummyProduct.id,
        mediaId: 'm2',
        sortOrder: 1,
        isPrimary: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdById: 'actor-1',
        updatedById: 'actor-1',
        media: { id: 'm2', publicUrl: 'https://cdn.example.com/2.jpg' },
      });

      const productWithPrimaryG2 = {
        ...dummyProduct,
        galleryImages: [
          {
            id: 'g1',
            productId: dummyProduct.id,
            mediaId: 'm1',
            sortOrder: 0,
            isPrimary: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            createdById: 'actor-1',
            updatedById: 'actor-1',
            media: { id: 'm1', publicUrl: 'https://cdn.example.com/1.jpg' },
          },
          {
            id: 'g2',
            productId: dummyProduct.id,
            mediaId: 'm2',
            sortOrder: 1,
            isPrimary: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            createdById: 'actor-1',
            updatedById: 'actor-1',
            media: { id: 'm2', publicUrl: 'https://cdn.example.com/2.jpg' },
          },
        ],
      } as unknown as ProductRecord;
      vi.spyOn(productsService, 'getById').mockResolvedValue(toProductDto(productWithPrimaryG2));

      const result = await productsService.setPrimaryGalleryImage(dummyProduct.id, 'g2', 'actor-1');

      expect(setPrimarySpy).toHaveBeenCalledWith(dummyProduct.id, 'g2', 'actor-1');
      expect(result.gallery.find((i) => i.id === 'g2')?.isPrimary).toBe(true);
      expect(result.gallery.find((i) => i.id === 'g1')?.isPrimary).toBe(false);
    });

    it('throws 404 when setting primary on nonexistent gallery image', async () => {
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(dummyProduct);
      vi.spyOn(productsRepository, 'findActiveGalleryImageById').mockResolvedValue(null);

      await expect(
        productsService.setPrimaryGalleryImage(dummyProduct.id, 'nonexistent-g', 'actor-1')
      ).rejects.toThrow(
        expect.objectContaining({
          code: ProductsErrorCode.GALLERY_IMAGE_NOT_FOUND,
          statusCode: 404,
        })
      );
    });

    it('reorders gallery images properly', async () => {
      const productWithImages = {
        ...dummyProduct,
        galleryImages: [
          {
            id: 'g1',
            mediaId: 'm1',
            sortOrder: 0,
            isPrimary: true,
            media: { id: 'm1', publicUrl: 'https://cdn.example.com/1.jpg' },
          },
          {
            id: 'g2',
            mediaId: 'm2',
            sortOrder: 1,
            isPrimary: false,
            media: { id: 'm2', publicUrl: 'https://cdn.example.com/2.jpg' },
          },
        ],
      } as unknown as ProductRecord;
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(productWithImages);
      const reorderSpy = vi.spyOn(productsRepository, 'reorderGalleryImages').mockResolvedValue();

      const productReordered = {
        ...dummyProduct,
        galleryImages: [
          {
            id: 'g2',
            mediaId: 'm2',
            sortOrder: 0,
            isPrimary: false,
            media: { id: 'm2', publicUrl: 'https://cdn.example.com/2.jpg' },
          },
          {
            id: 'g1',
            mediaId: 'm1',
            sortOrder: 1,
            isPrimary: true,
            media: { id: 'm1', publicUrl: 'https://cdn.example.com/1.jpg' },
          },
        ],
      } as unknown as ProductRecord;
      vi.spyOn(productsService, 'getById').mockResolvedValue(toProductDto(productReordered));

      const result = await productsService.reorderGallery(dummyProduct.id, ['g2', 'g1'], 'actor-1');

      expect(reorderSpy).toHaveBeenCalledWith(dummyProduct.id, ['g2', 'g1'], 'actor-1');
      expect(result.gallery[0]?.id).toBe('g2');
      expect(result.gallery[1]?.id).toBe('g1');
    });

    it('removes gallery image, cleans media, and promotes another to primary if removed was primary', async () => {
      vi.spyOn(productsRepository, 'findById').mockResolvedValue({
        ...dummyProduct,
        galleryImages: [
          {
            id: 'g2',
            mediaId: 'm2',
            sortOrder: 0,
            isPrimary: false,
            media: { id: 'm2', publicUrl: 'https://cdn.example.com/2.jpg' },
          },
        ],
      } as unknown as ProductRecord);
      vi.spyOn(productsRepository, 'findActiveGalleryImageById').mockResolvedValue({
        id: 'g1',
        productId: dummyProduct.id,
        mediaId: 'm1',
        sortOrder: 0,
        isPrimary: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdById: 'actor-1',
        updatedById: 'actor-1',
        media: { id: 'm1', publicUrl: 'https://cdn.example.com/1.jpg' },
      });
      const removeSpy = vi.spyOn(productsRepository, 'removeGalleryImage').mockResolvedValue({
        id: 'g1',
        productId: dummyProduct.id,
        mediaId: 'm1',
        sortOrder: 0,
        isPrimary: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
        createdById: 'actor-1',
        updatedById: 'actor-1',
      });
      const setPrimarySpy = vi.spyOn(productsRepository, 'setPrimaryGalleryImage').mockResolvedValue({
        id: 'g2',
        productId: dummyProduct.id,
        mediaId: 'm2',
        sortOrder: 0,
        isPrimary: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdById: 'actor-1',
        updatedById: 'actor-1',
        media: { id: 'm2', publicUrl: 'https://cdn.example.com/2.jpg' },
      });
      vi.spyOn(productsService, 'getById').mockResolvedValue(toProductDto(dummyProduct));

      await productsService.removeGalleryImage(dummyProduct.id, 'g1', 'actor-1');

      expect(removeSpy).toHaveBeenCalledWith(dummyProduct.id, 'g1', 'actor-1');
      expect(setPrimarySpy).toHaveBeenCalledWith(dummyProduct.id, 'g2', 'actor-1');
    });
  });

  describe('Documents: Upload & Limits & Operations', () => {
    it('uploads PDF document and assigns title from filename if omitted', async () => {
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(dummyProduct);
      vi.spyOn(productsRepository, 'countActiveDocuments').mockResolvedValue(0);
      vi.spyOn(storageService, 'upload').mockResolvedValue({
        filename: 'spec.pdf',
        path: 'products/docs/spec.pdf',
        url: 'https://cdn.example.com/products/docs/spec.pdf',
        size: 30,
        mimeType: 'application/pdf',
      });
      vi.spyOn(mediaRepository, 'create').mockResolvedValue({
        id: 'media-doc-1',
        fileName: 'specsheet.pdf',
        storageKey: 'products/docs/spec.pdf',
        publicUrl: 'https://cdn.example.com/products/docs/spec.pdf',
        mimeType: 'application/pdf',
        fileSize: 30,
        uploadedById: 'actor-1',
        createdById: 'actor-1',
        updatedById: 'actor-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const addDocSpy = vi.spyOn(productsRepository, 'addDocument').mockResolvedValue({
        id: 'doc-1',
        productId: dummyProduct.id,
        mediaId: 'media-doc-1',
        title: 'specsheet',
        originalFileName: 'specsheet.pdf',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdById: 'actor-1',
        updatedById: 'actor-1',
        media: {
          id: 'media-doc-1',
          fileName: 'specsheet.pdf',
          publicUrl: 'https://cdn.example.com/products/docs/spec.pdf',
        },
      });

      const productWithDoc = {
        ...dummyProduct,
        documents: [
          {
            id: 'doc-1',
            productId: dummyProduct.id,
            mediaId: 'media-doc-1',
            title: 'specsheet',
            originalFileName: 'specsheet.pdf',
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            createdById: 'actor-1',
            updatedById: 'actor-1',
            media: {
              id: 'media-doc-1',
              publicUrl: 'https://cdn.example.com/products/docs/spec.pdf',
              fileName: 'specsheet.pdf',
            },
          },
        ],
      } as unknown as ProductRecord;
      vi.spyOn(productsService, 'getById').mockResolvedValue(toProductDto(productWithDoc));

      const result = await productsService.uploadDocuments(
        dummyProduct.id,
        [samplePdfFile],
        undefined,
        'actor-1'
      );

      expect(addDocSpy).toHaveBeenCalledWith(
        dummyProduct.id,
        expect.objectContaining({
          mediaId: 'media-doc-1',
          title: 'specsheet',
          originalFileName: 'specsheet.pdf',
          sortOrder: 0,
        }),
        'actor-1'
      );
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0]?.title).toBe('specsheet');
    });

    it('rejects document upload when maximum 3 documents already reached (PRODUCT_DOCUMENT_LIMIT_REACHED)', async () => {
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(dummyProduct);
      vi.spyOn(productsRepository, 'countActiveDocuments').mockResolvedValue(3);

      await expect(
        productsService.uploadDocuments(dummyProduct.id, [samplePdfFile], undefined, 'actor-1')
      ).rejects.toThrow(
        expect.objectContaining({
          code: ProductsErrorCode.DOCUMENT_LIMIT_REACHED,
          statusCode: 409,
        })
      );
    });

    it('updates document title', async () => {
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(dummyProduct);
      vi.spyOn(productsRepository, 'findActiveDocumentById').mockResolvedValue({
        id: 'd1',
        productId: dummyProduct.id,
        mediaId: 'm1',
        title: 'Old Title',
        originalFileName: 'spec.pdf',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdById: 'actor-1',
        updatedById: 'actor-1',
        media: { id: 'm1', publicUrl: 'https://cdn.example.com/spec.pdf', fileName: 'spec.pdf' },
      });

      const updateTitleSpy = vi.spyOn(productsRepository, 'updateDocumentTitle').mockResolvedValue({
        id: 'd1',
        productId: dummyProduct.id,
        mediaId: 'm1',
        title: 'New Technical Datasheet',
        originalFileName: 'spec.pdf',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdById: 'actor-1',
        updatedById: 'actor-1',
        media: { id: 'm1', publicUrl: 'https://cdn.example.com/spec.pdf', fileName: 'spec.pdf' },
      });

      const productWithUpdatedDoc = {
        ...dummyProduct,
        documents: [
          {
            id: 'd1',
            productId: dummyProduct.id,
            mediaId: 'm1',
            title: 'New Technical Datasheet',
            originalFileName: 'spec.pdf',
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            createdById: 'actor-1',
            updatedById: 'actor-1',
            media: { id: 'm1', publicUrl: 'https://cdn.example.com/spec.pdf', fileName: 'spec.pdf' },
          },
        ],
      } as unknown as ProductRecord;
      vi.spyOn(productsService, 'getById').mockResolvedValue(toProductDto(productWithUpdatedDoc));

      const result = await productsService.updateDocument(
        dummyProduct.id,
        'd1',
        'New Technical Datasheet',
        'actor-1'
      );

      expect(updateTitleSpy).toHaveBeenCalledWith(
        dummyProduct.id,
        'd1',
        'New Technical Datasheet',
        'actor-1'
      );
      expect(result.documents[0]?.title).toBe('New Technical Datasheet');
    });

    it('removes document', async () => {
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(dummyProduct);
      vi.spyOn(productsRepository, 'findActiveDocumentById').mockResolvedValue({
        id: 'd1',
        productId: dummyProduct.id,
        mediaId: 'm1',
        title: 'spec',
        originalFileName: 'spec.pdf',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdById: 'actor-1',
        updatedById: 'actor-1',
        media: { id: 'm1', publicUrl: 'https://cdn.example.com/spec.pdf', fileName: 'spec.pdf' },
      });
      const removeDocSpy = vi.spyOn(productsRepository, 'removeDocument').mockResolvedValue({
        id: 'd1',
        productId: dummyProduct.id,
        mediaId: 'm1',
        title: 'spec',
        originalFileName: 'spec.pdf',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
        createdById: 'actor-1',
        updatedById: 'actor-1',
      });
      vi.spyOn(productsService, 'getById').mockResolvedValue(toProductDto(dummyProduct));

      await productsService.removeDocument(dummyProduct.id, 'd1', 'actor-1');

      expect(removeDocSpy).toHaveBeenCalledWith(dummyProduct.id, 'd1', 'actor-1');
    });
  });

  describe('Videos: Upload, Title, Reorder, Limits', () => {
    it('uploads valid MP4 video within limit', async () => {
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(dummyProduct);
      vi.spyOn(productsRepository, 'countActiveVideos').mockResolvedValue(0);
      vi.spyOn(storageService, 'upload').mockResolvedValue({
        filename: 'video1.mp4',
        path: 'products/videos/video1.mp4',
        url: 'https://cdn.example.com/products/videos/video1.mp4',
        size: 32,
        mimeType: 'video/mp4',
      });
      vi.spyOn(mediaRepository, 'create').mockResolvedValue({
        id: 'media-vid-1',
        fileName: 'demo.mp4',
        storageKey: 'products/videos/video1.mp4',
        publicUrl: 'https://cdn.example.com/products/videos/video1.mp4',
        mimeType: 'video/mp4',
        fileSize: 32,
        uploadedById: 'actor-1',
        createdById: 'actor-1',
        updatedById: 'actor-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const addVideoSpy = vi.spyOn(productsRepository, 'addVideo').mockResolvedValue({
        id: 'vid-1',
        productId: dummyProduct.id,
        mediaId: 'media-vid-1',
        title: 'demo',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdById: 'actor-1',
        updatedById: 'actor-1',
        media: {
          id: 'media-vid-1',
          publicUrl: 'https://cdn.example.com/products/videos/video1.mp4',
        },
      });

      vi.spyOn(productsService, 'getById').mockResolvedValue(toProductDto(dummyProduct));

      await productsService.uploadVideos(dummyProduct.id, [sampleMp4File], 'Overview', 'actor-1');

      expect(addVideoSpy).toHaveBeenCalledWith(
        dummyProduct.id,
        {
          mediaId: 'media-vid-1',
          title: 'Overview',
          sortOrder: 0,
        },
        'actor-1'
      );
    });

    it('uploads 2 videos in batch when current active count is 0', async () => {
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(dummyProduct);
      vi.spyOn(productsRepository, 'countActiveVideos').mockResolvedValue(0);
      vi.spyOn(storageService, 'upload').mockResolvedValue({
        filename: 'vid.mp4',
        path: 'products/videos/vid.mp4',
        url: 'https://cdn.example.com/vid.mp4',
        size: 32,
        mimeType: 'video/mp4',
      });
      vi.spyOn(mediaRepository, 'create').mockResolvedValue({
        id: 'm1',
        fileName: 'vid.mp4',
        storageKey: 'products/videos/vid.mp4',
        publicUrl: 'https://cdn.example.com/vid.mp4',
        mimeType: 'video/mp4',
        fileSize: 32,
        uploadedById: 'actor-1',
        createdById: 'actor-1',
        updatedById: 'actor-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      const addVideoSpy = vi
        .spyOn(productsRepository, 'addVideo')
        .mockResolvedValue({} as unknown as Awaited<ReturnType<typeof productsRepository.addVideo>>);
      vi.spyOn(productsService, 'getById').mockResolvedValue(toProductDto(dummyProduct));

      await productsService.uploadVideos(
        dummyProduct.id,
        [sampleMp4File, sampleWebmFile],
        undefined,
        'actor-1'
      );
      expect(addVideoSpy).toHaveBeenCalledTimes(2);
    });

    it('rejects batch upload when existing + requested exceeds 2 with PRODUCT_VIDEO_LIMIT_REACHED', async () => {
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(dummyProduct);
      vi.spyOn(productsRepository, 'countActiveVideos').mockResolvedValue(1);

      await expect(
        productsService.uploadVideos(dummyProduct.id, [sampleMp4File, sampleWebmFile], undefined, 'actor-1')
      ).rejects.toThrow(
        expect.objectContaining({
          code: ProductsErrorCode.PRODUCT_VIDEO_LIMIT_REACHED,
        })
      );
    });

    it('rejects fake MP4 file with INVALID_VIDEO_FILE', async () => {
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(dummyProduct);
      vi.spyOn(productsRepository, 'countActiveVideos').mockResolvedValue(0);

      await expect(
        productsService.uploadVideos(dummyProduct.id, [sampleFakeMp4File], undefined, 'actor-1')
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_VIDEO_FILE',
        })
      );
    });

    it('updates video title', async () => {
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(dummyProduct);
      vi.spyOn(productsRepository, 'findActiveVideoById').mockResolvedValue({
        id: 'vid-1',
        productId: dummyProduct.id,
        mediaId: 'm1',
        title: 'old',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdById: 'actor-1',
        updatedById: 'actor-1',
        media: { id: 'm1', publicUrl: 'https://cdn.example.com/v.mp4' },
      });
      const updateTitleSpy = vi
        .spyOn(productsRepository, 'updateVideoTitle')
        .mockResolvedValue({} as unknown as Awaited<ReturnType<typeof productsRepository.updateVideoTitle>>);
      vi.spyOn(productsService, 'getById').mockResolvedValue(toProductDto(dummyProduct));

      await productsService.updateVideoTitle(dummyProduct.id, 'vid-1', 'Product Walkthrough', 'actor-1');
      expect(updateTitleSpy).toHaveBeenCalledWith(dummyProduct.id, 'vid-1', 'Product Walkthrough', 'actor-1');
    });

    it('reorders videos when all IDs match active product videos', async () => {
      const productWithVideos = {
        ...dummyProduct,
        videos: [
          { id: 'v1', sortOrder: 0 },
          { id: 'v2', sortOrder: 1 },
        ],
      } as unknown as ProductRecord;
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(productWithVideos);
      const reorderSpy = vi
        .spyOn(productsRepository, 'reorderVideos')
        .mockResolvedValue(
          undefined as unknown as Awaited<ReturnType<typeof productsRepository.reorderVideos>>
        );
      vi.spyOn(productsService, 'getById').mockResolvedValue(toProductDto(productWithVideos));

      await productsService.reorderVideos(dummyProduct.id, ['v2', 'v1'], 'actor-1');
      expect(reorderSpy).toHaveBeenCalledWith(dummyProduct.id, ['v2', 'v1'], 'actor-1');
    });

    it('removes video', async () => {
      vi.spyOn(productsRepository, 'findById').mockResolvedValue(dummyProduct);
      vi.spyOn(productsRepository, 'findActiveVideoById').mockResolvedValue({
        id: 'vid-1',
        productId: dummyProduct.id,
        mediaId: 'm1',
        title: 'old',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdById: 'actor-1',
        updatedById: 'actor-1',
        media: { id: 'm1', publicUrl: 'https://cdn.example.com/v.mp4' },
      });
      const removeSpy = vi
        .spyOn(productsRepository, 'removeVideo')
        .mockResolvedValue({} as unknown as Awaited<ReturnType<typeof productsRepository.removeVideo>>);
      vi.spyOn(productsService, 'getById').mockResolvedValue(toProductDto(dummyProduct));

      await productsService.removeVideo(dummyProduct.id, 'vid-1', 'actor-1');
      expect(removeSpy).toHaveBeenCalledWith(dummyProduct.id, 'vid-1', 'actor-1');
    });
  });

  describe('DTO Fallback & Compatibility', () => {
    it('toProductDto falls back to primary gallery image if product.imageUrl is null', () => {
      const productRecord = {
        ...dummyProduct,
        imageUrl: null,
        galleryImages: [
          {
            id: 'g1',
            productId: dummyProduct.id,
            mediaId: 'm1',
            sortOrder: 0,
            isPrimary: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            createdById: 'actor-1',
            updatedById: 'actor-1',
            media: {
              id: 'm1',
              fileName: 'img1.jpg',
              storageKey: 'products/gallery/img1.jpg',
              publicUrl: 'https://cdn.example.com/primary.jpg',
              mimeType: 'image/jpeg',
              fileSize: 10,
              uploadedById: 'actor-1',
              createdById: 'actor-1',
              updatedById: 'actor-1',
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null,
            },
          },
        ],
        videos: [
          {
            id: 'v1',
            productId: dummyProduct.id,
            mediaId: 'm-vid',
            title: 'Overview',
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            createdById: 'actor-1',
            updatedById: 'actor-1',
            media: {
              id: 'm-vid',
              fileName: 'overview.mp4',
              storageKey: 'products/videos/overview.mp4',
              publicUrl: 'https://cdn.example.com/overview.mp4',
              mimeType: 'video/mp4',
              fileSize: 1000,
              uploadedById: 'actor-1',
              createdById: 'actor-1',
              updatedById: 'actor-1',
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null,
            },
          },
        ],
      } as unknown as ProductRecord;

      const dto = toProductDto(productRecord);

      expect(dto.imageUrl).toBe('https://cdn.example.com/primary.jpg');
      expect(dto.gallery).toHaveLength(1);
      expect(dto.gallery[0]?.publicUrl).toBe('https://cdn.example.com/primary.jpg');
      expect(dto.gallery[0]?.isPrimary).toBe(true);
      expect(dto.videos).toHaveLength(1);
      expect(dto.videos[0]?.publicUrl).toBe('https://cdn.example.com/overview.mp4');
      expect(dto.videos[0]?.title).toBe('Overview');
    });

    it('toPublicProductDto exposes safe gallery, videos, and documents without storage keys', () => {
      const productRecord = {
        ...dummyProduct,
        galleryImages: [
          {
            id: 'g1',
            sortOrder: 0,
            isPrimary: true,
            media: {
              id: 'm1',
              storageKey: 'SECRET_KEY_NEVER_LEAK',
              publicUrl: 'https://cdn.example.com/primary.jpg',
            },
          },
        ],
        videos: [
          {
            id: 'v1',
            title: 'Feature Tour',
            sortOrder: 0,
            media: {
              id: 'mv1',
              storageKey: 'SECRET_VID_KEY_NEVER_LEAK',
              publicUrl: 'https://cdn.example.com/tour.mp4',
            },
          },
        ],
        documents: [
          {
            id: 'd1',
            title: 'Datasheet',
            originalFileName: 'spec.pdf',
            sortOrder: 0,
            media: {
              id: 'm-doc',
              storageKey: 'SECRET_DOC_KEY_NEVER_LEAK',
              publicUrl: 'https://cdn.example.com/datasheet.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 100,
            },
          },
        ],
      } as unknown as ProductRecord;

      const publicDto = toPublicProductDto(
        productRecord as unknown as Parameters<typeof toPublicProductDto>[0]
      );

      expect(publicDto.gallery[0]?.publicUrl).toBe('https://cdn.example.com/primary.jpg');
      expect((publicDto.gallery[0] as unknown as Record<string, unknown>).storageKey).toBeUndefined();
      expect(publicDto.videos[0]?.publicUrl).toBe('https://cdn.example.com/tour.mp4');
      expect(publicDto.videos[0]?.title).toBe('Feature Tour');
      expect((publicDto.videos[0] as unknown as Record<string, unknown>).storageKey).toBeUndefined();
      expect(publicDto.documents[0]?.publicUrl).toBe('https://cdn.example.com/datasheet.pdf');
      expect((publicDto.documents[0] as unknown as Record<string, unknown>).storageKey).toBeUndefined();
    });

    it('toPublicProductDto lightweight option strips media arrays while preserving imageUrl', () => {
      const productRecord = {
        ...dummyProduct,
        galleryImages: [
          {
            id: 'g1',
            sortOrder: 0,
            isPrimary: true,
            media: {
              id: 'm1',
              publicUrl: 'https://cdn.example.com/primary.jpg',
            },
          },
        ],
        videos: [
          {
            id: 'v1',
            title: 'Tour',
            sortOrder: 0,
            media: { id: 'mv1', publicUrl: 'https://cdn.example.com/tour.mp4' },
          },
        ],
        documents: [
          {
            id: 'd1',
            title: 'Spec',
            sortOrder: 0,
            media: { id: 'md1', publicUrl: 'https://cdn.example.com/spec.pdf' },
          },
        ],
      } as unknown as ProductRecord;

      const publicDto = toPublicProductDto(
        productRecord as unknown as Parameters<typeof toPublicProductDto>[0],
        { lightweight: true }
      );

      expect(publicDto.imageUrl).toBe('https://cdn.example.com/primary.jpg');
      expect(publicDto.gallery).toEqual([]);
      expect(publicDto.videos).toEqual([]);
      expect(publicDto.documents).toEqual([]);
    });
  });

  describe('isMediaUrlReferenced (Media reference protection guards)', () => {
    it('returns true when media is referenced by ProductGalleryImage', async () => {
      const spy = vi.spyOn(productsRepository, 'isMediaUrlReferenced').mockResolvedValue(true);
      const isRef = await productsService.isMediaUrlReferenced(
        'https://cdn.example.com/gallery.jpg',
        'media-1'
      );
      expect(isRef).toBe(true);
      expect(spy).toHaveBeenCalledWith('https://cdn.example.com/gallery.jpg', 'media-1');
    });

    it('returns true when media is referenced by ProductVideo', async () => {
      const spy = vi.spyOn(productsRepository, 'isMediaUrlReferenced').mockResolvedValue(true);
      const isRef = await productsService.isMediaUrlReferenced(
        'https://cdn.example.com/video.mp4',
        'media-video-1'
      );
      expect(isRef).toBe(true);
      expect(spy).toHaveBeenCalledWith('https://cdn.example.com/video.mp4', 'media-video-1');
    });

    it('returns true when media is referenced by ProductDocument', async () => {
      const spy = vi.spyOn(productsRepository, 'isMediaUrlReferenced').mockResolvedValue(true);
      const isRef = await productsService.isMediaUrlReferenced(
        'https://cdn.example.com/doc.pdf',
        'media-doc-1'
      );
      expect(isRef).toBe(true);
      expect(spy).toHaveBeenCalledWith('https://cdn.example.com/doc.pdf', 'media-doc-1');
    });

    it('returns false when media is not referenced', async () => {
      vi.spyOn(productsRepository, 'isMediaUrlReferenced').mockResolvedValue(false);
      const isRef = await productsService.isMediaUrlReferenced(
        'https://cdn.example.com/unused.png',
        'media-unused'
      );
      expect(isRef).toBe(false);
    });
  });
});
