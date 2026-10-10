import { describe, expect, it, vi, beforeEach } from 'vitest';
import { categoriesService } from '../../src/modules/categories/categories.service';
import { categoriesRepository } from '../../src/modules/categories/categories.repository';
import { mediaRepository } from '../../src/modules/media/media.repository';
import { storageService } from '../../src/shared/storage';
import { CategoriesErrorCode } from '../../src/modules/categories/categories.schema';

describe('Category Media Service (unit)', () => {
  const dummyCategory = {
    id: 'cat-1111-1111-1111-111111111111',
    name: 'Lighting',
    nameKey: 'lighting',
    slug: 'lighting',
    description: 'All lighting products',
    imageUrl: null,
    imageMediaId: null,
    bannerUrl: null,
    bannerMediaId: null,
    isActive: true,
    sortOrder: 0,
    parentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdById: 'actor-1',
    updatedById: 'actor-1',
  };

  const sampleFile = {
    fieldname: 'image',
    originalname: 'test.jpg',
    encoding: '7bit',
    filename: 'test.jpg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
    mimetype: 'image/jpeg',
    size: 10,
  } as unknown as Express.Multer.File;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('uploadImage', () => {
    it('uploads new category image, stores Media, and leaves banner unchanged', async () => {
      vi.spyOn(categoriesRepository, 'findById').mockResolvedValue(dummyCategory);
      vi.spyOn(storageService, 'upload').mockResolvedValue({
        filename: 'stored.jpg',
        path: 'categories/images/stored.jpg',
        url: 'https://cdn.example.com/categories/images/stored.jpg',
        size: 10,
        mimeType: 'image/jpeg',
      });
      vi.spyOn(mediaRepository, 'create').mockResolvedValue({
        id: 'media-img-1',
        fileName: 'test.jpg',
        storageKey: 'categories/images/stored.jpg',
        publicUrl: 'https://cdn.example.com/categories/images/stored.jpg',
        mimeType: 'image/jpeg',
        fileSize: 10,
        uploadedById: 'actor-1',
        createdById: 'actor-1',
        updatedById: 'actor-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      const updateImageSpy = vi.spyOn(categoriesRepository, 'updateImage').mockResolvedValue({
        ...dummyCategory,
        imageUrl: 'https://cdn.example.com/categories/images/stored.jpg',
        imageMediaId: 'media-img-1',
      });

      const result = await categoriesService.uploadImage(dummyCategory.id, sampleFile, 'actor-1');

      expect(result.imageUrl).toBe('https://cdn.example.com/categories/images/stored.jpg');
      expect(result.imageMediaId).toBe('media-img-1');
      expect(result.bannerUrl).toBeNull();
      expect(updateImageSpy).toHaveBeenCalledWith(
        dummyCategory.id,
        'https://cdn.example.com/categories/images/stored.jpg',
        'media-img-1',
        'actor-1'
      );
    });

    it('safely cleans up prior image storage on replacement without affecting banner', async () => {
      const categoryWithExistingImage = {
        ...dummyCategory,
        imageUrl: 'https://cdn.example.com/old-img.jpg',
        imageMediaId: 'media-old-1',
        bannerUrl: 'https://cdn.example.com/existing-banner.jpg',
        bannerMediaId: 'media-banner-1',
      };
      vi.spyOn(categoriesRepository, 'findById').mockResolvedValue(categoryWithExistingImage);
      vi.spyOn(storageService, 'upload').mockResolvedValue({
        filename: 'new.jpg',
        path: 'categories/images/new.jpg',
        url: 'https://cdn.example.com/categories/images/new.jpg',
        size: 10,
        mimeType: 'image/jpeg',
      });
      vi.spyOn(mediaRepository, 'create').mockResolvedValue({
        id: 'media-new-1',
        fileName: 'new.jpg',
        storageKey: 'categories/images/new.jpg',
        publicUrl: 'https://cdn.example.com/categories/images/new.jpg',
        mimeType: 'image/jpeg',
        fileSize: 10,
        uploadedById: 'actor-1',
        createdById: 'actor-1',
        updatedById: 'actor-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      vi.spyOn(categoriesRepository, 'updateImage').mockResolvedValue({
        ...categoryWithExistingImage,
        imageUrl: 'https://cdn.example.com/categories/images/new.jpg',
        imageMediaId: 'media-new-1',
      });
      const storageDeleteSpy = vi.spyOn(storageService, 'delete').mockResolvedValue();

      const result = await categoriesService.uploadImage(dummyCategory.id, sampleFile, 'actor-1');

      expect(result.imageUrl).toBe('https://cdn.example.com/categories/images/new.jpg');
      expect(result.bannerUrl).toBe('https://cdn.example.com/existing-banner.jpg');
      expect(storageDeleteSpy).toHaveBeenCalledWith('https://cdn.example.com/old-img.jpg');
    });

    it('throws 404 when category does not exist', async () => {
      vi.spyOn(categoriesRepository, 'findById').mockResolvedValue(null);

      await expect(categoriesService.uploadImage('missing-id', sampleFile, 'actor-1')).rejects.toThrow(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });

  describe('removeImage', () => {
    it('removes image and leaves banner untouched', async () => {
      const categoryWithImageAndBanner = {
        ...dummyCategory,
        imageUrl: 'https://cdn.example.com/img.jpg',
        imageMediaId: 'media-img-1',
        bannerUrl: 'https://cdn.example.com/banner.jpg',
        bannerMediaId: 'media-ban-1',
      };
      vi.spyOn(categoriesRepository, 'findById').mockResolvedValue(categoryWithImageAndBanner);
      const updateImageSpy = vi.spyOn(categoriesRepository, 'updateImage').mockResolvedValue({
        ...categoryWithImageAndBanner,
        imageUrl: null,
        imageMediaId: null,
      });
      const storageDeleteSpy = vi.spyOn(storageService, 'delete').mockResolvedValue();

      const result = await categoriesService.removeImage(dummyCategory.id, 'actor-1');

      expect(result.imageUrl).toBeNull();
      expect(result.imageMediaId).toBeNull();
      expect(result.bannerUrl).toBe('https://cdn.example.com/banner.jpg');
      expect(updateImageSpy).toHaveBeenCalledWith(dummyCategory.id, null, null, 'actor-1');
      expect(storageDeleteSpy).toHaveBeenCalledWith('https://cdn.example.com/img.jpg');
    });

    it('throws 404 if category has no image to remove', async () => {
      vi.spyOn(categoriesRepository, 'findById').mockResolvedValue(dummyCategory);

      await expect(categoriesService.removeImage(dummyCategory.id, 'actor-1')).rejects.toThrow(
        expect.objectContaining({ code: CategoriesErrorCode.IMAGE_NOT_FOUND })
      );
    });
  });

  describe('uploadBanner & removeBanner independence', () => {
    it('uploadBanner does not modify existing image', async () => {
      const categoryWithImage = {
        ...dummyCategory,
        imageUrl: 'https://cdn.example.com/card.jpg',
        imageMediaId: 'media-card-1',
      };
      const bannerFile = {
        ...sampleFile,
        fieldname: 'banner',
      } as unknown as Express.Multer.File;

      vi.spyOn(categoriesRepository, 'findById').mockResolvedValue(categoryWithImage);
      vi.spyOn(storageService, 'upload').mockResolvedValue({
        filename: 'hero.jpg',
        path: 'categories/banners/hero.jpg',
        url: 'https://cdn.example.com/categories/banners/hero.jpg',
        size: 10,
        mimeType: 'image/jpeg',
      });
      vi.spyOn(mediaRepository, 'create').mockResolvedValue({
        id: 'media-ban-1',
        fileName: 'hero.jpg',
        storageKey: 'categories/banners/hero.jpg',
        publicUrl: 'https://cdn.example.com/categories/banners/hero.jpg',
        mimeType: 'image/jpeg',
        fileSize: 10,
        uploadedById: 'actor-1',
        createdById: 'actor-1',
        updatedById: 'actor-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      vi.spyOn(categoriesRepository, 'updateBanner').mockResolvedValue({
        ...categoryWithImage,
        bannerUrl: 'https://cdn.example.com/categories/banners/hero.jpg',
        bannerMediaId: 'media-ban-1',
      });

      const result = await categoriesService.uploadBanner(dummyCategory.id, bannerFile, 'actor-1');

      expect(result.bannerUrl).toBe('https://cdn.example.com/categories/banners/hero.jpg');
      expect(result.imageUrl).toBe('https://cdn.example.com/card.jpg');
    });

    it('removeBanner does not modify existing image', async () => {
      const categoryWithBoth = {
        ...dummyCategory,
        imageUrl: 'https://cdn.example.com/card.jpg',
        imageMediaId: 'media-card-1',
        bannerUrl: 'https://cdn.example.com/hero.jpg',
        bannerMediaId: 'media-ban-1',
      };
      vi.spyOn(categoriesRepository, 'findById').mockResolvedValue(categoryWithBoth);
      vi.spyOn(categoriesRepository, 'updateBanner').mockResolvedValue({
        ...categoryWithBoth,
        bannerUrl: null,
        bannerMediaId: null,
      });
      vi.spyOn(storageService, 'delete').mockResolvedValue();

      const result = await categoriesService.removeBanner(dummyCategory.id, 'actor-1');

      expect(result.bannerUrl).toBeNull();
      expect(result.imageUrl).toBe('https://cdn.example.com/card.jpg');
    });
  });

  describe('isMediaUrlReferenced (media reference guard)', () => {
    it('detects references by media ID and publicUrl for category image', async () => {
      const spy = vi.spyOn(categoriesRepository, 'isMediaUrlReferenced').mockResolvedValue(true);

      const isReferenced = await categoriesService.isMediaUrlReferenced(
        'https://cdn.example.com/card.jpg',
        'media-card-1'
      );

      expect(isReferenced).toBe(true);
      expect(spy).toHaveBeenCalledWith('https://cdn.example.com/card.jpg', 'media-card-1');
    });

    it('detects references by banner media ID and bannerUrl', async () => {
      const spy = vi.spyOn(categoriesRepository, 'isMediaUrlReferenced').mockResolvedValue(true);

      const isReferenced = await categoriesService.isMediaUrlReferenced(
        'https://cdn.example.com/banner.jpg',
        'media-banner-1'
      );

      expect(isReferenced).toBe(true);
      expect(spy).toHaveBeenCalledWith('https://cdn.example.com/banner.jpg', 'media-banner-1');
    });

    it('returns false when neither image nor banner references media', async () => {
      vi.spyOn(categoriesRepository, 'isMediaUrlReferenced').mockResolvedValue(false);

      const isReferenced = await categoriesService.isMediaUrlReferenced(
        'https://cdn.example.com/unused.jpg',
        'media-unused'
      );

      expect(isReferenced).toBe(false);
    });
  });
});
