import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductsErrorCode } from '../src/modules/products/products.schema';
import { MediaErrorCode } from '../src/modules/media/media.schema';
import { mediaService } from '../src/modules/media';
import { storageService } from '../src/shared/storage';
import * as permissionsModule from '../src/shared/security/permissions';
import { api } from './helpers/app';
import { signInAs, type Session } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

let admin: Session;
let sales: Session;

const validPngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const validJpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const validPdfBuffer = Buffer.from(
  '%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF'
);
const validMp4Buffer = Buffer.from([
  0x00,
  0x00,
  0x00,
  0x18,
  0x66,
  0x74,
  0x79,
  0x70, // size 24, 'ftyp'
  0x69,
  0x73,
  0x6f,
  0x6d, // major brand 'isom'
  0x00,
  0x00,
  0x02,
  0x00, // minor version
  0x69,
  0x73,
  0x6f,
  0x6d, // compatible brand 'isom'
  0x6d,
  0x70,
  0x34,
  0x31, // compatible brand 'mp41'
]);

beforeEach(async () => {
  await resetDatabase();
  admin = await signInAs('SUPER_ADMIN');
  sales = await signInAs('SALES_MANAGER');
});

async function createTestBrand(overrides: Record<string, unknown> = {}) {
  const id = randomUUID().slice(0, 8);
  const res = await api()
    .post('/api/v1/brands')
    .set(admin.auth)
    .send({ name: `Brand ${id}`, slug: `brand-${id}`, ...overrides })
    .expect(201);
  return res.body.data;
}

async function createTestCategory(overrides: Record<string, unknown> = {}) {
  const id = randomUUID().slice(0, 8);
  const res = await api()
    .post('/api/v1/categories')
    .set(admin.auth)
    .send({ name: `Category ${id}`, slug: `category-${id}`, ...overrides })
    .expect(201);
  return res.body.data;
}

async function createTestProduct(overrides: Record<string, unknown> = {}) {
  const brand = await createTestBrand();
  const category = await createTestCategory();
  const id = randomUUID().slice(0, 8);
  const res = await api()
    .post('/api/v1/products')
    .set(admin.auth)
    .send({
      name: `Product ${id}`,
      sku: `SKU-${id.toUpperCase()}`,
      brandId: brand.id,
      categoryId: category.id,
      status: 'PUBLISHED',
      ...overrides,
    })
    .expect(201);
  return res.body.data;
}

describe('Blocker 1: Batch Upload Failure Leaves No Orphan Rows', () => {
  it('rolls back and cleans storage when second file fails during gallery batch upload', async () => {
    const product = await createTestProduct();
    const deleteSpy = vi.spyOn(storageService, 'delete');

    let uploadCount = 0;
    const uploadSpy = vi.spyOn(storageService, 'upload').mockImplementation(async (file) => {
      uploadCount++;
      if (uploadCount === 2) {
        throw new Error('S3 Connection Lost on File 2');
      }
      return {
        filename: `gallery-${uploadCount}.png`,
        path: `products/gallery/${randomUUID()}.png`,
        url: `https://storage.local/gallery-${uploadCount}.png`,
        size: file.size,
        mimeType: file.mimeType,
      };
    });

    try {
      const res = await api()
        .post(`/api/v1/products/${product.id}/gallery`)
        .set(admin.auth)
        .attach('images', validPngBuffer, 'img1.png')
        .attach('images', validJpgBuffer, 'img2.jpg')
        .expect(500);

      expect(res.body.success).toBe(false);

      // Verify no gallery images exist in DB
      const galleryCount = await prisma.productGalleryImage.count({
        where: { productId: product.id },
      });
      expect(galleryCount).toBe(0);

      // Verify no orphan Media rows exist
      const mediaCount = await prisma.media.count({
        where: { publicUrl: { contains: 'gallery-1.png' } },
      });
      expect(mediaCount).toBe(0);

      // Verify storage cleanup was attempted for the 1st uploaded file
      expect(deleteSpy).toHaveBeenCalledWith(expect.stringContaining('products/gallery/'));
    } finally {
      uploadSpy.mockRestore();
      deleteSpy.mockRestore();
    }
  });

  it('rolls back and cleans storage when DB transaction fails on gallery batch', async () => {
    const product = await createTestProduct();
    const deleteSpy = vi.spyOn(storageService, 'delete');

    const mediaSpy = vi.spyOn(mediaService, 'createManagedMedia').mockImplementation(async () => {
      throw new Error('Database constraint error');
    });

    try {
      const res = await api()
        .post(`/api/v1/products/${product.id}/gallery`)
        .set(admin.auth)
        .attach('images', validPngBuffer, 'img1.png')
        .expect(500);

      expect(res.body.success).toBe(false);

      const galleryCount = await prisma.productGalleryImage.count({
        where: { productId: product.id },
      });
      expect(galleryCount).toBe(0);

      expect(deleteSpy).toHaveBeenCalled();
    } finally {
      mediaSpy.mockRestore();
      deleteSpy.mockRestore();
    }
  });

  it('rolls back and cleans storage when video batch upload fails mid-way', async () => {
    const product = await createTestProduct();
    const deleteSpy = vi.spyOn(storageService, 'delete');

    let uploadCount = 0;
    const uploadSpy = vi.spyOn(storageService, 'upload').mockImplementation(async (file) => {
      uploadCount++;
      if (uploadCount === 2) {
        throw new Error('Storage outage on video 2');
      }
      return {
        filename: `video-${uploadCount}.mp4`,
        path: `products/videos/${randomUUID()}.mp4`,
        url: `https://storage.local/video-${uploadCount}.mp4`,
        size: file.size,
        mimeType: file.mimeType,
      };
    });

    try {
      await api()
        .post(`/api/v1/products/${product.id}/videos`)
        .set(admin.auth)
        .attach('videos', validMp4Buffer, 'v1.mp4')
        .attach('videos', validMp4Buffer, 'v2.mp4')
        .expect(500);

      const videoCount = await prisma.productVideo.count({
        where: { productId: product.id },
      });
      expect(videoCount).toBe(0);

      const orphanMedia = await prisma.media.count({
        where: { publicUrl: { contains: 'video-1.mp4' } },
      });
      expect(orphanMedia).toBe(0);
      expect(deleteSpy).toHaveBeenCalled();
    } finally {
      uploadSpy.mockRestore();
      deleteSpy.mockRestore();
    }
  });

  it('rolls back and cleans storage when document batch upload fails mid-way', async () => {
    const product = await createTestProduct();
    const deleteSpy = vi.spyOn(storageService, 'delete');

    let uploadCount = 0;
    const uploadSpy = vi.spyOn(storageService, 'upload').mockImplementation(async (file) => {
      uploadCount++;
      if (uploadCount === 2) {
        throw new Error('Storage failure on doc 2');
      }
      return {
        filename: `doc-${uploadCount}.pdf`,
        path: `products/documents/${randomUUID()}.pdf`,
        url: `https://storage.local/doc-${uploadCount}.pdf`,
        size: file.size,
        mimeType: file.mimeType,
      };
    });

    try {
      await api()
        .post(`/api/v1/products/${product.id}/documents`)
        .set(admin.auth)
        .attach('documents', validPdfBuffer, 'doc1.pdf')
        .attach('documents', validPdfBuffer, 'doc2.pdf')
        .expect(500);

      const docCount = await prisma.productDocument.count({
        where: { productId: product.id },
      });
      expect(docCount).toBe(0);

      const orphanMedia = await prisma.media.count({
        where: { publicUrl: { contains: 'doc-1.pdf' } },
      });
      expect(orphanMedia).toBe(0);
      expect(deleteSpy).toHaveBeenCalled();
    } finally {
      uploadSpy.mockRestore();
      deleteSpy.mockRestore();
    }
  });
});

describe('Blocker 2: Soft-Deleted Products Do Not Block Media Delete', () => {
  it('blocks media delete when product is active and gallery is active', async () => {
    const product = await createTestProduct();
    const uploadRes = await api()
      .post(`/api/v1/products/${product.id}/gallery`)
      .set(admin.auth)
      .attach('images', validPngBuffer, 'img1.png')
      .expect(200);

    const mediaId = uploadRes.body.data.gallery[0].mediaId;
    expect(mediaId).toBeDefined();

    const deleteRes = await api().delete(`/api/v1/media/${mediaId}`).set(admin.auth).expect(409);
    expect(deleteRes.body.error.code).toBe(MediaErrorCode.MEDIA_IN_USE);
  });

  it('allows media delete when parent product is soft-deleted', async () => {
    const product = await createTestProduct();
    const uploadRes = await api()
      .post(`/api/v1/products/${product.id}/gallery`)
      .set(admin.auth)
      .attach('images', validPngBuffer, 'img1.png')
      .expect(200);

    const mediaId = uploadRes.body.data.gallery[0].mediaId;

    // Soft delete product
    await api().delete(`/api/v1/products/${product.id}`).set(admin.auth).expect(204);

    // Media deletion should now succeed because parent product is soft-deleted
    await api().delete(`/api/v1/media/${mediaId}`).set(admin.auth).expect(204);

    const mediaInDb = await prisma.media.findUnique({ where: { id: mediaId } });
    expect(mediaInDb?.deletedAt).not.toBeNull();
  });

  it('allows media delete when gallery join is soft-deleted even if product is active', async () => {
    const product = await createTestProduct();
    const uploadRes = await api()
      .post(`/api/v1/products/${product.id}/gallery`)
      .set(admin.auth)
      .attach('images', validPngBuffer, 'img1.png')
      .expect(200);

    const galleryId = uploadRes.body.data.gallery[0].id;
    const mediaId = uploadRes.body.data.gallery[0].mediaId;

    // Clear legacy imageUrl and soft delete the gallery join to simulate detached join
    await prisma.product.update({
      where: { id: product.id },
      data: { imageUrl: null },
    });
    await prisma.productGalleryImage.update({
      where: { id: galleryId },
      data: { deletedAt: new Date() },
    });

    const isRef = await mediaService.isReferenced(uploadRes.body.data.gallery[0].publicUrl, mediaId);
    expect(isRef.isReferenced).toBe(false);

    await api().delete(`/api/v1/media/${mediaId}`).set(admin.auth).expect(204);
  });

  it('allows media delete when product with video is soft-deleted', async () => {
    const product = await createTestProduct();
    const uploadRes = await api()
      .post(`/api/v1/products/${product.id}/videos`)
      .set(admin.auth)
      .attach('videos', validMp4Buffer, 'video.mp4')
      .expect(200);

    const mediaId = uploadRes.body.data.videos[0].mediaId;

    // Soft-delete product
    await api().delete(`/api/v1/products/${product.id}`).set(admin.auth).expect(204);

    // Media delete should succeed
    await api().delete(`/api/v1/media/${mediaId}`).set(admin.auth).expect(204);
  });

  it('allows media delete when product with document is soft-deleted', async () => {
    const product = await createTestProduct();
    const uploadRes = await api()
      .post(`/api/v1/products/${product.id}/documents`)
      .set(admin.auth)
      .attach('documents', validPdfBuffer, 'doc.pdf')
      .expect(200);

    const mediaId = uploadRes.body.data.documents[0].mediaId;

    // Soft-delete product
    await api().delete(`/api/v1/products/${product.id}`).set(admin.auth).expect(204);

    // Media delete should succeed
    await api().delete(`/api/v1/media/${mediaId}`).set(admin.auth).expect(204);
  });
});

describe('Blocker 3: Category Media Atomic Replacement & Error Handling', () => {
  it('rolls back and does not persist imageUrl when Media create fails', async () => {
    const category = await createTestCategory();
    const deleteSpy = vi.spyOn(storageService, 'delete');
    const mediaSpy = vi.spyOn(mediaService, 'createManagedMedia').mockImplementation(async () => {
      throw new Error('Media creation failed');
    });

    try {
      await api()
        .put(`/api/v1/categories/${category.id}/image`)
        .set(admin.auth)
        .attach('image', validPngBuffer, 'cat.png')
        .expect(500);

      const inDb = await prisma.category.findUniqueOrThrow({ where: { id: category.id } });
      expect(inDb.imageUrl).toBeNull();
      expect(inDb.imageMediaId).toBeNull();
      expect(deleteSpy).toHaveBeenCalled();
    } finally {
      mediaSpy.mockRestore();
      deleteSpy.mockRestore();
    }
  });

  it('rolls back and cleans storage when category banner update fails', async () => {
    const category = await createTestCategory();
    const deleteSpy = vi.spyOn(storageService, 'delete');
    const mediaSpy = vi.spyOn(mediaService, 'createManagedMedia').mockImplementation(async () => {
      throw new Error('Media creation failed');
    });

    try {
      await api()
        .put(`/api/v1/categories/${category.id}/banner`)
        .set(admin.auth)
        .attach('banner', validPngBuffer, 'cat-banner.png')
        .expect(500);

      const inDb = await prisma.category.findUniqueOrThrow({ where: { id: category.id } });
      expect(inDb.bannerUrl).toBeNull();
      expect(inDb.bannerMediaId).toBeNull();
      expect(deleteSpy).toHaveBeenCalled();
    } finally {
      mediaSpy.mockRestore();
      deleteSpy.mockRestore();
    }
  });
});

describe('Blocker 4: Delete Product Media Cleans Unreferenced Media & Preserves Shared', () => {
  it('cleans unreferenced owned media and deletes storage when gallery image is deleted', async () => {
    const product = await createTestProduct();
    const deleteSpy = vi.spyOn(storageService, 'delete');

    const uploadRes = await api()
      .post(`/api/v1/products/${product.id}/gallery`)
      .set(admin.auth)
      .attach('images', validPngBuffer, 'img1.png')
      .expect(200);

    const galleryId = uploadRes.body.data.gallery[0].id;
    const mediaId = uploadRes.body.data.gallery[0].mediaId;

    await api().delete(`/api/v1/products/${product.id}/gallery/${galleryId}`).set(admin.auth).expect(200);

    // Verify join is soft-deleted
    const join = await prisma.productGalleryImage.findUnique({ where: { id: galleryId } });
    expect(join?.deletedAt).not.toBeNull();

    // Verify media is deleted
    const media = await prisma.media.findUnique({ where: { id: mediaId } });
    expect(media?.deletedAt).not.toBeNull();

    // Verify storage cleanup called
    expect(deleteSpy).toHaveBeenCalled();
    deleteSpy.mockRestore();
  });

  it('preserves shared media when another entity references the media URL', async () => {
    const product1 = await createTestProduct();
    const uploadRes = await api()
      .post(`/api/v1/products/${product1.id}/gallery`)
      .set(admin.auth)
      .attach('images', validPngBuffer, 'shared.png')
      .expect(200);

    const gallery1 = uploadRes.body.data.gallery[0];
    const mediaId = gallery1.mediaId;

    // Attach same media URL to a category banner
    const cat = await createTestCategory();
    await prisma.category.update({
      where: { id: cat.id },
      data: { bannerUrl: gallery1.publicUrl, bannerMediaId: mediaId },
    });

    const deleteSpy = vi.spyOn(storageService, 'delete');

    // Delete gallery image from product1
    await api().delete(`/api/v1/products/${product1.id}/gallery/${gallery1.id}`).set(admin.auth).expect(200);

    // Join should be deleted
    const join = await prisma.productGalleryImage.findUnique({ where: { id: gallery1.id } });
    expect(join?.deletedAt).not.toBeNull();

    // But media should NOT be deleted because category references it!
    const media = await prisma.media.findUnique({ where: { id: mediaId } });
    expect(media?.deletedAt).toBeNull();

    deleteSpy.mockRestore();
  });
});

describe('Should-Fix 2: Legacy Product.imageUrl vs Gallery Primary Synchronization', () => {
  it('synchronizes product.imageUrl on first upload, change primary, delete primary, delete last', async () => {
    const product = await createTestProduct();
    expect(product.imageUrl).toBeNull();

    // 1. Upload first 2 gallery images
    const uploadRes = await api()
      .post(`/api/v1/products/${product.id}/gallery`)
      .set(admin.auth)
      .attach('images', validPngBuffer, 'img1.png')
      .attach('images', validJpgBuffer, 'img2.jpg')
      .expect(200);

    const gallery = uploadRes.body.data.gallery;
    expect(gallery).toHaveLength(2);
    expect(gallery[0].isPrimary).toBe(true);

    // Product imageUrl should mirror primary image URL
    let inDb = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(inDb.imageUrl).toBe(gallery[0].publicUrl);

    // 2. Set second image as primary
    const setPrimaryRes = await api()
      .patch(`/api/v1/products/${product.id}/gallery/${gallery[1].id}/primary`)
      .set(admin.auth)
      .expect(200);

    expect(setPrimaryRes.body.data.gallery[1].isPrimary).toBe(true);
    expect(setPrimaryRes.body.data.gallery[0].isPrimary).toBe(false);

    inDb = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(inDb.imageUrl).toBe(gallery[1].publicUrl);

    // 3. Delete current primary (gallery[1]) -> should promote remaining (gallery[0]) to primary
    await api().delete(`/api/v1/products/${product.id}/gallery/${gallery[1].id}`).set(admin.auth).expect(200);

    inDb = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(inDb.imageUrl).toBe(gallery[0].publicUrl);

    const remainingGallery = await prisma.productGalleryImage.findMany({
      where: { productId: product.id, deletedAt: null },
    });
    expect(remainingGallery).toHaveLength(1);
    expect(remainingGallery[0]?.isPrimary).toBe(true);

    // 4. Delete last gallery image -> product.imageUrl becomes null
    await api().delete(`/api/v1/products/${product.id}/gallery/${gallery[0].id}`).set(admin.auth).expect(200);

    inDb = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(inDb.imageUrl).toBeNull();
  });
});

describe('Should-Fix 3: Limits and Invariants', () => {
  it('enforces maximum 5 gallery images limit', async () => {
    const product = await createTestProduct();

    // Upload 4 images first
    await api()
      .post(`/api/v1/products/${product.id}/gallery`)
      .set(admin.auth)
      .attach('images', validPngBuffer, '1.png')
      .attach('images', validPngBuffer, '2.png')
      .attach('images', validPngBuffer, '3.png')
      .attach('images', validPngBuffer, '4.png')
      .expect(200);

    // Trying to upload 2 more should fail because 4 + 2 = 6 > 5
    const res = await api()
      .post(`/api/v1/products/${product.id}/gallery`)
      .set(admin.auth)
      .attach('images', validPngBuffer, '5.png')
      .attach('images', validPngBuffer, '6.png')
      .expect(409);

    expect(res.body.error.code).toBe(ProductsErrorCode.GALLERY_LIMIT_REACHED);
  });

  it('enforces maximum 2 videos limit', async () => {
    const product = await createTestProduct();

    await api()
      .post(`/api/v1/products/${product.id}/videos`)
      .set(admin.auth)
      .attach('videos', validMp4Buffer, '1.mp4')
      .attach('videos', validMp4Buffer, '2.mp4')
      .expect(200);

    const res = await api()
      .post(`/api/v1/products/${product.id}/videos`)
      .set(admin.auth)
      .attach('videos', validMp4Buffer, '3.mp4')
      .expect(409);

    expect(res.body.error.code).toBe(ProductsErrorCode.VIDEO_LIMIT_REACHED);
  });

  it('enforces maximum 3 documents limit', async () => {
    const product = await createTestProduct();

    await api()
      .post(`/api/v1/products/${product.id}/documents`)
      .set(admin.auth)
      .attach('documents', validPdfBuffer, '1.pdf')
      .attach('documents', validPdfBuffer, '2.pdf')
      .attach('documents', validPdfBuffer, '3.pdf')
      .expect(200);

    const res = await api()
      .post(`/api/v1/products/${product.id}/documents`)
      .set(admin.auth)
      .attach('documents', validPdfBuffer, '4.pdf')
      .expect(409);

    expect(res.body.error.code).toBe(ProductsErrorCode.DOCUMENT_LIMIT_REACHED);
  });
});

describe('Should-Fix 5: Authorization Integration Coverage (401 / 403 / 200/201)', () => {
  it('verifies 401 unauthenticated and 403 unauthorized for all product media mutations', async () => {
    const product = await createTestProduct();
    const cat = await createTestCategory();
    const dummyId = randomUUID();
    const permSpy = vi.spyOn(permissionsModule, 'permissionsFor').mockReturnValue(new Set());

    try {
      // 1. Gallery upload
      await api()
        .post(`/api/v1/products/${product.id}/gallery`)
        .attach('images', validPngBuffer, 'img.png')
        .expect(401);
      await api()
        .post(`/api/v1/products/${product.id}/gallery`)
        .set(sales.auth)
        .attach('images', validPngBuffer, 'img.png')
        .expect(403);

      // 2. Gallery reorder
      await api()
        .patch(`/api/v1/products/${product.id}/gallery/reorder`)
        .send({ imageIds: [dummyId] })
        .expect(401);
      await api()
        .patch(`/api/v1/products/${product.id}/gallery/reorder`)
        .set(sales.auth)
        .send({ imageIds: [dummyId] })
        .expect(403);

      // 3. Gallery primary
      await api().patch(`/api/v1/products/${product.id}/gallery/${dummyId}/primary`).expect(401);
      await api()
        .patch(`/api/v1/products/${product.id}/gallery/${dummyId}/primary`)
        .set(sales.auth)
        .expect(403);

      // 4. Gallery delete
      await api().delete(`/api/v1/products/${product.id}/gallery/${dummyId}`).expect(401);
      await api().delete(`/api/v1/products/${product.id}/gallery/${dummyId}`).set(sales.auth).expect(403);

      // 5. Videos upload
      await api()
        .post(`/api/v1/products/${product.id}/videos`)
        .attach('videos', validMp4Buffer, 'v.mp4')
        .expect(401);
      await api()
        .post(`/api/v1/products/${product.id}/videos`)
        .set(sales.auth)
        .attach('videos', validMp4Buffer, 'v.mp4')
        .expect(403);

      // 6. Videos update title
      await api()
        .patch(`/api/v1/products/${product.id}/videos/${dummyId}`)
        .send({ title: 'New' })
        .expect(401);
      await api()
        .patch(`/api/v1/products/${product.id}/videos/${dummyId}`)
        .set(sales.auth)
        .send({ title: 'New' })
        .expect(403);

      // 7. Videos reorder
      await api()
        .patch(`/api/v1/products/${product.id}/videos/reorder`)
        .send({ videoIds: [dummyId] })
        .expect(401);
      await api()
        .patch(`/api/v1/products/${product.id}/videos/reorder`)
        .set(sales.auth)
        .send({ videoIds: [dummyId] })
        .expect(403);

      // 8. Videos delete
      await api().delete(`/api/v1/products/${product.id}/videos/${dummyId}`).expect(401);
      await api().delete(`/api/v1/products/${product.id}/videos/${dummyId}`).set(sales.auth).expect(403);

      // 9. Documents upload
      await api()
        .post(`/api/v1/products/${product.id}/documents`)
        .attach('documents', validPdfBuffer, 'd.pdf')
        .expect(401);
      await api()
        .post(`/api/v1/products/${product.id}/documents`)
        .set(sales.auth)
        .attach('documents', validPdfBuffer, 'd.pdf')
        .expect(403);

      // 10. Documents update title
      await api()
        .patch(`/api/v1/products/${product.id}/documents/${dummyId}`)
        .send({ title: 'Doc' })
        .expect(401);
      await api()
        .patch(`/api/v1/products/${product.id}/documents/${dummyId}`)
        .set(sales.auth)
        .send({ title: 'Doc' })
        .expect(403);

      // 11. Documents reorder
      await api()
        .patch(`/api/v1/products/${product.id}/documents/reorder`)
        .send({ documentIds: [dummyId] })
        .expect(401);
      await api()
        .patch(`/api/v1/products/${product.id}/documents/reorder`)
        .set(sales.auth)
        .send({ documentIds: [dummyId] })
        .expect(403);

      // 12. Documents delete
      await api().delete(`/api/v1/products/${product.id}/documents/${dummyId}`).expect(401);
      await api().delete(`/api/v1/products/${product.id}/documents/${dummyId}`).set(sales.auth).expect(403);

      // 13. Category image PUT and DELETE
      await api()
        .put(`/api/v1/categories/${cat.id}/image`)
        .attach('image', validPngBuffer, 'c.png')
        .expect(401);
      await api()
        .put(`/api/v1/categories/${cat.id}/image`)
        .set(sales.auth)
        .attach('image', validPngBuffer, 'c.png')
        .expect(403);

      await api().delete(`/api/v1/categories/${cat.id}/image`).expect(401);
      await api().delete(`/api/v1/categories/${cat.id}/image`).set(sales.auth).expect(403);

      // 14. Category banner PUT and DELETE
      await api()
        .put(`/api/v1/categories/${cat.id}/banner`)
        .attach('banner', validPngBuffer, 'b.png')
        .expect(401);
      await api()
        .put(`/api/v1/categories/${cat.id}/banner`)
        .set(sales.auth)
        .attach('banner', validPngBuffer, 'b.png')
        .expect(403);

      await api().delete(`/api/v1/categories/${cat.id}/banner`).expect(401);
      await api().delete(`/api/v1/categories/${cat.id}/banner`).set(sales.auth).expect(403);
    } finally {
      permSpy.mockRestore();
    }
  });
});

describe('Single Product Detail Model & Endpoints', () => {
  it('manages scalar fields: shortDescription, overview, series, and SEO', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    const createRes = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({
        name: 'High Precision Planetary Gearbox',
        sku: 'HP-PLAN-001',
        brandId: brand.id,
        categoryId: category.id,
        shortDescription: 'Compact and high-torque planetary gearbox.',
        overview: 'Engineered for high precision robotics and automation machinery.',
        series: 'HDO Series',
        metaTitle: 'Precision Planetary Gearbox | Industrial',
        metaDescription: 'High precision planetary gearboxes for demanding industrial applications.',
        metaKeywords: 'planetary gearbox, robotics, high torque',
        canonicalUrl: 'https://metropolitan.com/products/planetary-gearbox',
        ogImageUrl: 'https://metropolitan.com/images/og-gearbox.jpg',
      })
      .expect(201);

    const p = createRes.body.data;
    expect(p.shortDescription).toBe('Compact and high-torque planetary gearbox.');
    expect(p.overview).toBe('Engineered for high precision robotics and automation machinery.');
    expect(p.series).toBe('HDO Series');
    expect(p.metaTitle).toBe('Precision Planetary Gearbox | Industrial');
    expect(p.canonicalUrl).toBe('https://metropolitan.com/products/planetary-gearbox');

    // Update scalar fields
    const patchRes = await api()
      .patch(`/api/v1/products/${p.id}`)
      .set(admin.auth)
      .send({
        series: 'HDP Series Extended',
        shortDescription: 'Updated short description.',
      })
      .expect(200);

    expect(patchRes.body.data.series).toBe('HDP Series Extended');
    expect(patchRes.body.data.shortDescription).toBe('Updated short description.');
  });

  it('manages Product Features: CRUD and reorder', async () => {
    const product = await createTestProduct();

    // 1. Create Feature 1
    const f1Res = await api()
      .post(`/api/v1/products/${product.id}/features`)
      .set(admin.auth)
      .send({
        icon: 'gear',
        title: 'High Transmissible Power',
        description: 'Optimized tooth geometry allows maximum torque transmission.',
      })
      .expect(200);

    expect(f1Res.body.data.features).toHaveLength(1);
    expect(f1Res.body.data.features[0].title).toBe('High Transmissible Power');
    const f1Id = f1Res.body.data.features[0].id;

    // 2. Create Feature 2
    const f2Res = await api()
      .post(`/api/v1/products/${product.id}/features`)
      .set(admin.auth)
      .send({
        icon: 'thermometer',
        title: 'Thermal Dissipation',
        description: 'Heavy duty cast iron housing dissipates heat efficiently.',
      })
      .expect(200);

    expect(f2Res.body.data.features).toHaveLength(2);
    const f2Id = f2Res.body.data.features[1].id;

    // 3. Update Feature 1
    const updateRes = await api()
      .patch(`/api/v1/products/${product.id}/features/${f1Id}`)
      .set(admin.auth)
      .send({
        title: 'Ultra-High Transmissible Power',
      })
      .expect(200);

    const updatedF1 = updateRes.body.data.features.find((f: { id: string }) => f.id === f1Id);
    expect(updatedF1.title).toBe('Ultra-High Transmissible Power');

    // 4. Reorder Features
    const reorderRes = await api()
      .patch(`/api/v1/products/${product.id}/features/reorder`)
      .set(admin.auth)
      .send({ featureIds: [f2Id, f1Id] })
      .expect(200);

    expect(reorderRes.body.data.features[0].id).toBe(f2Id);
    expect(reorderRes.body.data.features[1].id).toBe(f1Id);

    // 5. Delete Feature
    const deleteRes = await api()
      .delete(`/api/v1/products/${product.id}/features/${f1Id}`)
      .set(admin.auth)
      .expect(200);

    expect(deleteRes.body.data.features).toHaveLength(1);
    expect(deleteRes.body.data.features[0].id).toBe(f2Id);
  });

  it('manages Product Key Benefits: CRUD and reorder', async () => {
    const product = await createTestProduct();

    // 1. Create Benefit 1
    const b1Res = await api()
      .post(`/api/v1/products/${product.id}/key-benefits`)
      .set(admin.auth)
      .send({
        icon: 'shield',
        title: 'Robust Construction',
        description: 'Hardened gears designed for continuous 24/7 duty.',
      })
      .expect(200);

    expect(b1Res.body.data.keyBenefits).toHaveLength(1);
    const b1Id = b1Res.body.data.keyBenefits[0].id;

    // 2. Create Benefit 2
    const b2Res = await api()
      .post(`/api/v1/products/${product.id}/key-benefits`)
      .set(admin.auth)
      .send({
        icon: 'clock',
        title: 'Extended Maintenance Intervals',
        description: 'Synthetic oil filling ensures up to 20,000 operational hours.',
      })
      .expect(200);

    expect(b2Res.body.data.keyBenefits).toHaveLength(2);
    const b2Id = b2Res.body.data.keyBenefits[1].id;

    // 3. Update Benefit 1
    await api()
      .patch(`/api/v1/products/${product.id}/key-benefits/${b1Id}`)
      .set(admin.auth)
      .send({ title: 'Ultra-Robust Construction' })
      .expect(200);

    // 4. Reorder Benefits
    const reorderRes = await api()
      .patch(`/api/v1/products/${product.id}/key-benefits/reorder`)
      .set(admin.auth)
      .send({ benefitIds: [b2Id, b1Id] })
      .expect(200);

    expect(reorderRes.body.data.keyBenefits[0].id).toBe(b2Id);
    expect(reorderRes.body.data.keyBenefits[1].id).toBe(b1Id);

    // 5. Delete Benefit
    const deleteRes = await api()
      .delete(`/api/v1/products/${product.id}/key-benefits/${b1Id}`)
      .set(admin.auth)
      .expect(200);

    expect(deleteRes.body.data.keyBenefits).toHaveLength(1);
    expect(deleteRes.body.data.keyBenefits[0].id).toBe(b2Id);
  });

  it('manages Related Products relationship with validation', async () => {
    const p1 = await createTestProduct({ name: 'Product Alpha' });
    const p2 = await createTestProduct({ name: 'Product Beta' });
    const p3 = await createTestProduct({ name: 'Product Gamma' });

    // 1. Assign related products
    const assignRes = await api()
      .put(`/api/v1/products/${p1.id}/related-products`)
      .set(admin.auth)
      .send({ relatedProductIds: [p2.id, p3.id] })
      .expect(200);

    expect(assignRes.body.data.relatedProducts).toHaveLength(2);
    expect(assignRes.body.data.relatedProducts[0].id).toBe(p2.id);
    expect(assignRes.body.data.relatedProducts[1].id).toBe(p3.id);

    // 2. Self relation rejected
    const selfRes = await api()
      .put(`/api/v1/products/${p1.id}/related-products`)
      .set(admin.auth)
      .send({ relatedProductIds: [p1.id] })
      .expect(400);

    expect(selfRes.body.error.code).toBe(ProductsErrorCode.CANNOT_RELATE_TO_SELF);

    // 3. Nonexistent product relation rejected
    const nonExistentRes = await api()
      .put(`/api/v1/products/${p1.id}/related-products`)
      .set(admin.auth)
      .send({ relatedProductIds: [randomUUID()] })
      .expect(404);

    expect(nonExistentRes.body.error.code).toBe(ProductsErrorCode.RELATED_PRODUCT_NOT_FOUND);

    // 4. Clear related products
    const clearRes = await api()
      .put(`/api/v1/products/${p1.id}/related-products`)
      .set(admin.auth)
      .send({ relatedProductIds: [] })
      .expect(200);

    expect(clearRes.body.data.relatedProducts).toEqual([]);
  });

  it('returns complete single product contract on GET /api/v1/public/products/:slug', async () => {
    const brand = await createTestBrand({ name: 'Bonfiglioli', slug: 'bonfiglioli' });
    const category = await createTestCategory({ name: 'Industrial Gearboxes', slug: 'industrial-gearboxes' });

    const createRes = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({
        name: 'HDO Heavy Duty Gearbox',
        sku: 'BFG-HDO-100',
        brandId: brand.id,
        categoryId: category.id,
        shortDescription: 'Heavy-duty bevel helical gearbox series.',
        overview: 'The HDO Series provides the highest torque capacity for demanding heavy-duty drives.',
        series: 'HDO',
        status: 'PUBLISHED',
        metaTitle: 'HDO Heavy Duty Gearbox | Metropolitan',
        metaDescription: 'Maximum torque and reliability in heavy-duty industry.',
        metaKeywords: 'gearbox, heavy duty, bevel helical',
        canonicalUrl: 'https://metropolitan.com/products/hdo-heavy-duty-gearbox',
        ogImageUrl: 'https://metropolitan.com/images/hdo.jpg',
      })
      .expect(201);

    const productId = createRes.body.data.id;

    // Add Specifications
    await api()
      .put(`/api/v1/products/${productId}/specifications`)
      .set(admin.auth)
      .send({
        specifications: [
          { key: 'Torque Range', value: '8,990 – 209,000', unit: 'Nm' },
          { key: 'Gear Ratios', value: '5.6 – 400' },
        ],
      })
      .expect(200);

    // Add Feature
    await api()
      .post(`/api/v1/products/${productId}/features`)
      .set(admin.auth)
      .send({
        icon: 'gear',
        title: 'High Transmissible Power',
        description: 'Optimized gearing reduces friction and noise.',
      })
      .expect(200);

    // Add Key Benefit
    await api()
      .post(`/api/v1/products/${productId}/key-benefits`)
      .set(admin.auth)
      .send({
        icon: 'shield',
        title: 'Robust Construction',
        description: 'Built for extreme duty cycles.',
      })
      .expect(200);

    // Add Related Product
    const related = await createTestProduct({ name: 'HDP Parallel Shaft Gearbox', status: 'PUBLISHED' });
    await api()
      .put(`/api/v1/products/${productId}/related-products`)
      .set(admin.auth)
      .send({ relatedProductIds: [related.id] })
      .expect(200);

    // Fetch public product by slug
    const publicRes = await api().get('/api/v1/public/products/hdo-heavy-duty-gearbox').expect(200);

    const data = publicRes.body.data;
    expect(data.name).toBe('HDO Heavy Duty Gearbox');
    expect(data.slug).toBe('hdo-heavy-duty-gearbox');
    expect(data.sku).toBe('BFG-HDO-100');
    expect(data.shortDescription).toBe('Heavy-duty bevel helical gearbox series.');
    expect(data.overview).toBe(
      'The HDO Series provides the highest torque capacity for demanding heavy-duty drives.'
    );
    expect(data.series).toBe('HDO');

    expect(data.features).toHaveLength(1);
    expect(data.features[0].title).toBe('High Transmissible Power');

    expect(data.keyBenefits).toHaveLength(1);
    expect(data.keyBenefits[0].title).toBe('Robust Construction');

    expect(data.specifications).toHaveLength(2);
    expect(data.specifications[0].key).toBe('Torque Range');

    expect(data.relatedProducts).toHaveLength(1);
    expect(data.relatedProducts[0].name).toBe('HDP Parallel Shaft Gearbox');

    expect(data.seo).toBeDefined();
    expect(data.seo.metaTitle).toBe('HDO Heavy Duty Gearbox | Metropolitan');
    expect(data.seo.canonicalUrl).toBe('https://metropolitan.com/products/hdo-heavy-duty-gearbox');

    expect(data.brand.name).toBe('Bonfiglioli');
    expect(data.category.name).toBe('Industrial Gearboxes');
  });

  it('keeps public list endpoint lightweight without heavy features and related products', async () => {
    await createTestProduct({ status: 'PUBLISHED' });
    const res = await api().get('/api/v1/public/products').expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const firstItem = res.body.data[0];

    // Assert that heavy sections are empty arrays and SEO is omitted in lightweight list
    expect(firstItem.features).toEqual([]);
    expect(firstItem.keyBenefits).toEqual([]);
    expect(firstItem.relatedProducts).toEqual([]);
    expect(firstItem.gallery).toEqual([]);
    expect(firstItem.videos).toEqual([]);
    expect(firstItem.documents).toEqual([]);
    expect(firstItem.seo).toBeUndefined();
  });
});

describe('Category Shared Media Integrity & Deletion Safety', () => {
  it('preserves shared media and storage when category image is replaced', async () => {
    const product = await createTestProduct();
    const category = await createTestCategory();

    // 1. Upload gallery image to Product
    const prodRes = await api()
      .post(`/api/v1/products/${product.id}/gallery`)
      .set(admin.auth)
      .attach('images', validPngBuffer, 'shared-img.png')
      .expect(200);

    const mediaId = prodRes.body.data.gallery[0].mediaId;
    const mediaRow = await prisma.media.findUniqueOrThrow({ where: { id: mediaId } });

    // 2. Attach same Media M to Category Image
    await prisma.category.update({
      where: { id: category.id },
      data: {
        imageUrl: mediaRow.publicUrl,
        imageMediaId: mediaRow.id,
      },
    });

    // 3. Spy on storageService.delete
    const storageDeleteSpy = vi.spyOn(storageService, 'delete');

    // 4. Replace Category image with a new upload
    const replaceRes = await api()
      .put(`/api/v1/categories/${category.id}/image`)
      .set(admin.auth)
      .attach('image', validJpgBuffer, 'new-cat-img.jpg')
      .expect(200);

    // Verify Category has new image and new media ID
    expect(replaceRes.body.data.imageMediaId).not.toBe(mediaId);
    expect(replaceRes.body.data.imageUrl).not.toBe(mediaRow.publicUrl);

    // Verify Product Gallery still references Media M
    const galleryItems = await prisma.productGalleryImage.findMany({
      where: { productId: product.id, deletedAt: null },
    });
    expect(galleryItems).toHaveLength(1);
    expect(galleryItems[0]?.mediaId).toBe(mediaId);

    // Verify Media M is still active
    const mediaCheck = await prisma.media.findUnique({ where: { id: mediaId } });
    expect(mediaCheck?.deletedAt).toBeNull();

    // Verify storageService.delete was NOT called for shared Media M (neither storageKey nor publicUrl)
    expect(storageDeleteSpy).not.toHaveBeenCalledWith(mediaRow.storageKey);
    expect(storageDeleteSpy).not.toHaveBeenCalledWith(mediaRow.publicUrl);

    // Verify Media M cannot be deleted because product still references it
    const deleteAttempt = await api().delete(`/api/v1/media/${mediaId}`).set(admin.auth).expect(409);
    expect(deleteAttempt.body.error.code).toBe(MediaErrorCode.MEDIA_IN_USE);

    storageDeleteSpy.mockRestore();
  });

  it('preserves shared media and storage when category image is removed', async () => {
    const product = await createTestProduct();
    const category = await createTestCategory();

    // 1. Upload gallery image to Product
    const prodRes = await api()
      .post(`/api/v1/products/${product.id}/gallery`)
      .set(admin.auth)
      .attach('images', validPngBuffer, 'shared-img.png')
      .expect(200);

    const mediaId = prodRes.body.data.gallery[0].mediaId;
    const mediaRow = await prisma.media.findUniqueOrThrow({ where: { id: mediaId } });

    // 2. Attach same Media M to Category Image
    await prisma.category.update({
      where: { id: category.id },
      data: {
        imageUrl: mediaRow.publicUrl,
        imageMediaId: mediaRow.id,
      },
    });

    const storageDeleteSpy = vi.spyOn(storageService, 'delete');

    // 3. Remove Category image via DELETE /api/v1/categories/:id/image
    const removeRes = await api()
      .delete(`/api/v1/categories/${category.id}/image`)
      .set(admin.auth)
      .expect(200);

    expect(removeRes.body.data.imageUrl).toBeNull();
    expect(removeRes.body.data.imageMediaId).toBeNull();

    // Verify Product Gallery still references Media M
    const galleryItems = await prisma.productGalleryImage.findMany({
      where: { productId: product.id, deletedAt: null },
    });
    expect(galleryItems).toHaveLength(1);
    expect(galleryItems[0]?.mediaId).toBe(mediaId);

    // Verify Media M is still active
    const mediaCheck = await prisma.media.findUnique({ where: { id: mediaId } });
    expect(mediaCheck?.deletedAt).toBeNull();

    // Verify storage was NOT deleted
    expect(storageDeleteSpy).not.toHaveBeenCalledWith(mediaRow.storageKey);
    expect(storageDeleteSpy).not.toHaveBeenCalledWith(mediaRow.publicUrl);

    storageDeleteSpy.mockRestore();
  });

  it('preserves shared media and storage when category banner is replaced', async () => {
    const product = await createTestProduct();
    const category = await createTestCategory();

    const prodRes = await api()
      .post(`/api/v1/products/${product.id}/gallery`)
      .set(admin.auth)
      .attach('images', validPngBuffer, 'shared-banner.png')
      .expect(200);

    const mediaId = prodRes.body.data.gallery[0].mediaId;
    const mediaRow = await prisma.media.findUniqueOrThrow({ where: { id: mediaId } });

    await prisma.category.update({
      where: { id: category.id },
      data: {
        bannerUrl: mediaRow.publicUrl,
        bannerMediaId: mediaRow.id,
      },
    });

    const storageDeleteSpy = vi.spyOn(storageService, 'delete');

    const replaceRes = await api()
      .put(`/api/v1/categories/${category.id}/banner`)
      .set(admin.auth)
      .attach('banner', validJpgBuffer, 'new-banner.jpg')
      .expect(200);

    expect(replaceRes.body.data.bannerMediaId).not.toBe(mediaId);
    expect(replaceRes.body.data.bannerUrl).not.toBe(mediaRow.publicUrl);

    // Product still references M
    const galleryItems = await prisma.productGalleryImage.findMany({
      where: { productId: product.id, deletedAt: null },
    });
    expect(galleryItems[0]?.mediaId).toBe(mediaId);

    // Media M still active
    const mediaCheck = await prisma.media.findUnique({ where: { id: mediaId } });
    expect(mediaCheck?.deletedAt).toBeNull();

    // Storage for M was NOT deleted
    expect(storageDeleteSpy).not.toHaveBeenCalledWith(mediaRow.storageKey);
    expect(storageDeleteSpy).not.toHaveBeenCalledWith(mediaRow.publicUrl);

    storageDeleteSpy.mockRestore();
  });

  it('preserves shared media and storage when category banner is removed', async () => {
    const product = await createTestProduct();
    const category = await createTestCategory();

    const prodRes = await api()
      .post(`/api/v1/products/${product.id}/gallery`)
      .set(admin.auth)
      .attach('images', validPngBuffer, 'shared-banner.png')
      .expect(200);

    const mediaId = prodRes.body.data.gallery[0].mediaId;
    const mediaRow = await prisma.media.findUniqueOrThrow({ where: { id: mediaId } });

    await prisma.category.update({
      where: { id: category.id },
      data: {
        bannerUrl: mediaRow.publicUrl,
        bannerMediaId: mediaRow.id,
      },
    });

    const storageDeleteSpy = vi.spyOn(storageService, 'delete');

    const removeRes = await api()
      .delete(`/api/v1/categories/${category.id}/banner`)
      .set(admin.auth)
      .expect(200);

    expect(removeRes.body.data.bannerUrl).toBeNull();
    expect(removeRes.body.data.bannerMediaId).toBeNull();

    // Product still references M
    const galleryItems = await prisma.productGalleryImage.findMany({
      where: { productId: product.id, deletedAt: null },
    });
    expect(galleryItems[0]?.mediaId).toBe(mediaId);

    // Media M still active
    const mediaCheck = await prisma.media.findUnique({ where: { id: mediaId } });
    expect(mediaCheck?.deletedAt).toBeNull();

    // Storage for M was NOT deleted
    expect(storageDeleteSpy).not.toHaveBeenCalledWith(mediaRow.storageKey);
    expect(storageDeleteSpy).not.toHaveBeenCalledWith(mediaRow.publicUrl);

    storageDeleteSpy.mockRestore();
  });

  it('deletes unreferenced media and deletes storage exactly once when category image is removed', async () => {
    const category = await createTestCategory();

    // Upload category image
    const uploadRes = await api()
      .put(`/api/v1/categories/${category.id}/image`)
      .set(admin.auth)
      .attach('image', validPngBuffer, 'unref-cat-img.png')
      .expect(200);

    const mediaId = uploadRes.body.data.imageMediaId;
    const mediaRow = await prisma.media.findUniqueOrThrow({ where: { id: mediaId } });

    const storageDeleteSpy = vi.spyOn(storageService, 'delete');

    // Remove category image
    await api().delete(`/api/v1/categories/${category.id}/image`).set(admin.auth).expect(200);

    // Verify category references cleared
    const catInDb = await prisma.category.findUniqueOrThrow({ where: { id: category.id } });
    expect(catInDb.imageUrl).toBeNull();
    expect(catInDb.imageMediaId).toBeNull();

    // Verify Media record is soft deleted
    const mediaInDb = await prisma.media.findUniqueOrThrow({ where: { id: mediaId } });
    expect(mediaInDb.deletedAt).not.toBeNull();

    // Verify storage deletion happened EXACTLY ONCE
    expect(storageDeleteSpy).toHaveBeenCalledTimes(1);
    expect(storageDeleteSpy).toHaveBeenCalledWith(mediaRow.storageKey);

    storageDeleteSpy.mockRestore();
  });

  it('deletes unreferenced media and deletes storage exactly once when category banner is removed', async () => {
    const category = await createTestCategory();

    const uploadRes = await api()
      .put(`/api/v1/categories/${category.id}/banner`)
      .set(admin.auth)
      .attach('banner', validPngBuffer, 'unref-cat-banner.png')
      .expect(200);

    const mediaId = uploadRes.body.data.bannerMediaId;
    const mediaRow = await prisma.media.findUniqueOrThrow({ where: { id: mediaId } });

    const storageDeleteSpy = vi.spyOn(storageService, 'delete');

    await api().delete(`/api/v1/categories/${category.id}/banner`).set(admin.auth).expect(200);

    const catInDb = await prisma.category.findUniqueOrThrow({ where: { id: category.id } });
    expect(catInDb.bannerUrl).toBeNull();
    expect(catInDb.bannerMediaId).toBeNull();

    const mediaInDb = await prisma.media.findUniqueOrThrow({ where: { id: mediaId } });
    expect(mediaInDb.deletedAt).not.toBeNull();

    expect(storageDeleteSpy).toHaveBeenCalledTimes(1);
    expect(storageDeleteSpy).toHaveBeenCalledWith(mediaRow.storageKey);

    storageDeleteSpy.mockRestore();
  });

  it('directly cleans up storage for legacy URL-only category image on replacement and removal', async () => {
    const category = await createTestCategory();
    const legacyUrl = 'https://cdn.example.com/legacy/old-category.png';

    // Set legacy URL with null mediaId
    await prisma.category.update({
      where: { id: category.id },
      data: { imageUrl: legacyUrl, imageMediaId: null },
    });

    const storageDeleteSpy = vi.spyOn(storageService, 'delete');

    // Replace legacy image
    await api()
      .put(`/api/v1/categories/${category.id}/image`)
      .set(admin.auth)
      .attach('image', validJpgBuffer, 'replacement.jpg')
      .expect(200);

    expect(storageDeleteSpy).toHaveBeenCalledWith(legacyUrl);
    storageDeleteSpy.mockClear();

    // Set legacy URL again and test removal
    await prisma.category.update({
      where: { id: category.id },
      data: { imageUrl: legacyUrl, imageMediaId: null },
    });

    await api().delete(`/api/v1/categories/${category.id}/image`).set(admin.auth).expect(200);

    expect(storageDeleteSpy).toHaveBeenCalledWith(legacyUrl);
    storageDeleteSpy.mockRestore();
  });

  it('directly cleans up storage for legacy URL-only category banner on replacement and removal', async () => {
    const category = await createTestCategory();
    const legacyUrl = 'https://cdn.example.com/legacy/old-banner.png';

    await prisma.category.update({
      where: { id: category.id },
      data: { bannerUrl: legacyUrl, bannerMediaId: null },
    });

    const storageDeleteSpy = vi.spyOn(storageService, 'delete');

    await api()
      .put(`/api/v1/categories/${category.id}/banner`)
      .set(admin.auth)
      .attach('banner', validJpgBuffer, 'replacement-banner.jpg')
      .expect(200);

    expect(storageDeleteSpy).toHaveBeenCalledWith(legacyUrl);
    storageDeleteSpy.mockClear();

    await prisma.category.update({
      where: { id: category.id },
      data: { bannerUrl: legacyUrl, bannerMediaId: null },
    });

    await api().delete(`/api/v1/categories/${category.id}/banner`).set(admin.auth).expect(200);

    expect(storageDeleteSpy).toHaveBeenCalledWith(legacyUrl);
    storageDeleteSpy.mockRestore();
  });
});
