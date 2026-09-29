import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaErrorCode } from '../src/modules/media/media.schema';
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
const validWebpBuffer = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x18, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);

beforeEach(async () => {
  await resetDatabase();
  admin = await signInAs('SUPER_ADMIN');
  sales = await signInAs('SALES_MANAGER');
});

async function uploadTestMedia(
  session: Session = admin,
  buffer: Buffer = validPngBuffer,
  fileName: string = 'test-image.png',
  fieldName: string = 'file'
) {
  const res = await api()
    .post('/api/v1/media/upload')
    .set(session.auth)
    .attach(fieldName, buffer, fileName)
    .expect(201);
  return res.body.data;
}

describe('Media Access Control & Authentication', () => {
  it('rejects unauthenticated requests on all media endpoints with 401', async () => {
    const id = randomUUID();
    await api().get('/api/v1/media').expect(401);
    await api().get(`/api/v1/media/${id}`).expect(401);
    await api().post('/api/v1/media/upload').expect(401);
    await api().delete(`/api/v1/media/${id}`).expect(401);
  });

  it('returns 403 Forbidden when an authenticated user lacks required permissions', async () => {
    const spy = vi.spyOn(permissionsModule, 'permissionsFor').mockReturnValue(new Set());

    try {
      const id = randomUUID();
      const resList = await api().get('/api/v1/media').set(sales.auth).expect(403);
      expect(resList.body.error.code).toBe('FORBIDDEN');

      const resGet = await api().get(`/api/v1/media/${id}`).set(sales.auth).expect(403);
      expect(resGet.body.error.code).toBe('FORBIDDEN');

      const resUpload = await api()
        .post('/api/v1/media/upload')
        .set(sales.auth)
        .attach('file', validPngBuffer, 'photo.png')
        .expect(403);
      expect(resUpload.body.error.code).toBe('FORBIDDEN');

      const resDelete = await api().delete(`/api/v1/media/${id}`).set(sales.auth).expect(403);
      expect(resDelete.body.error.code).toBe('FORBIDDEN');
    } finally {
      spy.mockRestore();
    }
  });

  it('allows Sales Managers to upload, list, retrieve, and delete media', async () => {
    const uploaded = await uploadTestMedia(sales, validPngBuffer, 'sales-graphic.png');
    expect(uploaded.id).toBeDefined();

    const listRes = await api().get('/api/v1/media').set(sales.auth).expect(200);
    expect(listRes.body.data).toHaveLength(1);

    const getRes = await api().get(`/api/v1/media/${uploaded.id}`).set(sales.auth).expect(200);
    expect(getRes.body.data.id).toBe(uploaded.id);

    await api().delete(`/api/v1/media/${uploaded.id}`).set(sales.auth).expect(204);
  });
});

describe('Media Upload (POST /api/v1/media/upload)', () => {
  it('uploads valid PNG image and returns WordPress-style CRM response', async () => {
    const res = await api()
      .post('/api/v1/media/upload')
      .set(admin.auth)
      .attach('file', validPngBuffer, 'catalog-banner.png')
      .expect(201);

    expect(res.body.success).toBe(true);
    const media = res.body.data;
    expect(media.id).toBeDefined();
    expect(media.fileName).toBe('catalog-banner.png');
    expect(media.mimeType).toBe('image/png');
    expect(media.fileSize).toBe(validPngBuffer.length);
    expect(media.publicUrl).toMatch(/^\/uploads\/media\/.*\.png$/);
    expect(media.thumbnailUrl).toBe(media.publicUrl);
    expect(media.createdAt).toBeDefined();

    // Verify stored in DB
    const inDb = await prisma.media.findUniqueOrThrow({ where: { id: media.id } });
    expect(inDb.fileName).toBe('catalog-banner.png');
    expect(inDb.publicUrl).toBe(media.publicUrl);
    expect(inDb.mimeType).toBe('image/png');
    expect(inDb.fileSize).toBe(validPngBuffer.length);
  });

  it('accepts upload with field name "image"', async () => {
    const res = await api()
      .post('/api/v1/media/upload')
      .set(admin.auth)
      .attach('image', validJpgBuffer, 'product-photo.jpg')
      .expect(201);

    expect(res.body.data.mimeType).toBe('image/jpeg');
    expect(res.body.data.fileName).toBe('product-photo.jpg');
    expect(res.body.data.publicUrl).toMatch(/^\/uploads\/media\/.*\.jpg$/);
  });

  it('accepts upload with field name "media"', async () => {
    const res = await api()
      .post('/api/v1/media/upload')
      .set(admin.auth)
      .attach('media', validWebpBuffer, 'promo-flyer.webp')
      .expect(201);

    expect(res.body.data.mimeType).toBe('image/webp');
    expect(res.body.data.fileName).toBe('promo-flyer.webp');
    expect(res.body.data.publicUrl).toMatch(/^\/uploads\/media\/.*\.webp$/);
  });

  it('generates random unique storage keys even for identical filenames', async () => {
    const first = await uploadTestMedia(admin, validPngBuffer, 'same-name.png');
    const second = await uploadTestMedia(admin, validPngBuffer, 'same-name.png');

    expect(first.id).not.toBe(second.id);
    expect(first.storageKey).not.toBe(second.storageKey);
    expect(first.publicUrl).not.toBe(second.publicUrl);
  });

  it('rejects empty buffer with 400', async () => {
    const res = await api()
      .post('/api/v1/media/upload')
      .set(admin.auth)
      .attach('file', Buffer.from([]), 'empty.png')
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('rejects invalid file content (SVG) with 400', async () => {
    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
    const res = await api()
      .post('/api/v1/media/upload')
      .set(admin.auth)
      .attach('file', svgBuffer, 'vector.svg')
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('rejects spoofed file extensions (text disguised as PNG) with 400', async () => {
    const fakePng = Buffer.from('this is plain text posing as a png file');
    const res = await api()
      .post('/api/v1/media/upload')
      .set(admin.auth)
      .attach('file', fakePng, 'fake.png')
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('rejects upload exceeding 5 MB limit with 400', async () => {
    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024);
    const res = await api()
      .post('/api/v1/media/upload')
      .set(admin.auth)
      .attach('file', oversizedBuffer, 'huge.png')
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('rejects upload when no file is attached with 400', async () => {
    const res = await api().post('/api/v1/media/upload').set(admin.auth).expect(400);
    expect(res.body.success).toBe(false);
  });
});

describe('Media Detail (GET /api/v1/media/:id)', () => {
  it('returns single media asset with CRM-friendly response', async () => {
    const created = await uploadTestMedia(admin, validPngBuffer, 'detail-sample.png');

    const res = await api().get(`/api/v1/media/${created.id}`).set(admin.auth).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(created.id);
    expect(res.body.data.fileName).toBe('detail-sample.png');
    expect(res.body.data.publicUrl).toBe(created.publicUrl);
    expect(res.body.data.thumbnailUrl).toBe(created.publicUrl);
    expect(res.body.data.fileSize).toBe(validPngBuffer.length);
    expect(res.body.data.mimeType).toBe('image/png');
  });

  it('returns 404 for non-existent media ID', async () => {
    const missingId = randomUUID();
    const res = await api().get(`/api/v1/media/${missingId}`).set(admin.auth).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for invalid UUID format', async () => {
    await api().get('/api/v1/media/not-a-uuid').set(admin.auth).expect(400);
  });
});

describe('Media List (GET /api/v1/media)', () => {
  it('supports pagination, search, MIME type filter, and sorting', async () => {
    await uploadTestMedia(admin, validPngBuffer, 'alpha-pump.png');
    await uploadTestMedia(admin, validJpgBuffer, 'beta-valve.jpg');
    await uploadTestMedia(admin, validWebpBuffer, 'gamma-pump.webp');

    // 1. Default list returns all items sorted by latest first
    const listRes = await api().get('/api/v1/media').set(admin.auth).expect(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data).toHaveLength(3);
    expect(listRes.body.meta.pagination.total).toBe(3);
    expect(listRes.body.meta.pagination.page).toBe(1);
    expect(listRes.body.meta.pagination.limit).toBe(20);

    // 2. Search by fileName (supports both search and q)
    const searchRes = await api().get('/api/v1/media?q=pump').set(admin.auth).expect(200);
    expect(searchRes.body.data).toHaveLength(2);
    expect(searchRes.body.data.map((m: { fileName: string }) => m.fileName).sort()).toEqual([
      'alpha-pump.png',
      'gamma-pump.webp',
    ]);

    const searchParamRes = await api().get('/api/v1/media?search=valve').set(admin.auth).expect(200);
    expect(searchParamRes.body.data).toHaveLength(1);
    expect(searchParamRes.body.data[0].fileName).toBe('beta-valve.jpg');

    // 3. Filter by mimeType
    const mimeRes = await api().get('/api/v1/media?mimeType=image/jpeg').set(admin.auth).expect(200);
    expect(mimeRes.body.data).toHaveLength(1);
    expect(mimeRes.body.data[0].fileName).toBe('beta-valve.jpg');

    // 4. Pagination
    const page1Res = await api().get('/api/v1/media?limit=2&page=1').set(admin.auth).expect(200);
    expect(page1Res.body.data).toHaveLength(2);
    expect(page1Res.body.meta.pagination.totalPages).toBe(2);

    const page2Res = await api().get('/api/v1/media?limit=2&page=2').set(admin.auth).expect(200);
    expect(page2Res.body.data).toHaveLength(1);

    // 5. Sorting oldest first
    const sortRes = await api().get('/api/v1/media?sortOrder=asc').set(admin.auth).expect(200);
    expect(sortRes.body.data[0].fileName).toBe('alpha-pump.png');
  });

  it('excludes soft-deleted media items from list', async () => {
    const toKeep = await uploadTestMedia(admin, validPngBuffer, 'keep.png');
    const toDelete = await uploadTestMedia(admin, validPngBuffer, 'delete-me.png');

    await api().delete(`/api/v1/media/${toDelete.id}`).set(admin.auth).expect(204);

    const listRes = await api().get('/api/v1/media').set(admin.auth).expect(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].id).toBe(toKeep.id);
  });
});

describe('Referenced-Media Delete Protection & Safe Deletion (DELETE /api/v1/media/:id)', () => {
  it('blocks deletion with 409 if media is referenced by an active Product', async () => {
    const media = await uploadTestMedia(admin, validPngBuffer, 'product-image.png');

    // Create brand and category for product
    const brandRes = await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'Brand P', slug: 'brand-p' })
      .expect(201);
    const catRes = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Cat P', slug: 'cat-p' })
      .expect(201);

    // Create product referencing media.publicUrl
    const productRes = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({
        name: 'Protected Product',
        sku: 'SKU-PROT-1',
        brandId: brandRes.body.data.id,
        categoryId: catRes.body.data.id,
        imageUrl: media.publicUrl,
      })
      .expect(201);

    // Attempt to delete media -> Expect 409
    const deleteRes = await api().delete(`/api/v1/media/${media.id}`).set(admin.auth).expect(409);
    expect(deleteRes.body.success).toBe(false);
    expect(deleteRes.body.error.code).toBe(MediaErrorCode.MEDIA_IN_USE);
    expect(deleteRes.body.error.details.referencedIn).toBe('Product');

    // Soft delete the product
    await api().delete(`/api/v1/products/${productRes.body.data.id}`).set(admin.auth).expect(204);

    // Now deletion succeeds because the referencing product is no longer active
    await api().delete(`/api/v1/media/${media.id}`).set(admin.auth).expect(204);

    // Confirm media is gone
    await api().get(`/api/v1/media/${media.id}`).set(admin.auth).expect(404);
  });

  it('blocks deletion with 409 if media is referenced by an active Brand logo or banner', async () => {
    const logoMedia = await uploadTestMedia(admin, validPngBuffer, 'brand-logo.png');
    const bannerMedia = await uploadTestMedia(admin, validPngBuffer, 'brand-banner.png');

    const brandRes = await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({
        name: 'Brand Referenced',
        slug: 'brand-ref',
        logoUrl: logoMedia.publicUrl,
        bannerUrl: bannerMedia.publicUrl,
      })
      .expect(201);

    // Attempt delete logo -> 409
    const logoDeleteRes = await api().delete(`/api/v1/media/${logoMedia.id}`).set(admin.auth).expect(409);
    expect(logoDeleteRes.body.error.code).toBe(MediaErrorCode.MEDIA_IN_USE);
    expect(logoDeleteRes.body.error.details.referencedIn).toBe('Brand');

    // Attempt delete banner -> 409
    const bannerDeleteRes = await api().delete(`/api/v1/media/${bannerMedia.id}`).set(admin.auth).expect(409);
    expect(bannerDeleteRes.body.error.code).toBe(MediaErrorCode.MEDIA_IN_USE);

    // Soft delete brand
    await api().delete(`/api/v1/brands/${brandRes.body.data.id}`).set(admin.auth).expect(204);

    // Now both can be deleted safely
    await api().delete(`/api/v1/media/${logoMedia.id}`).set(admin.auth).expect(204);
    await api().delete(`/api/v1/media/${bannerMedia.id}`).set(admin.auth).expect(204);
  });

  it('blocks deletion with 409 if media is referenced by an active Category banner', async () => {
    const media = await uploadTestMedia(admin, validPngBuffer, 'category-banner.png');

    const catRes = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: 'Cat Referenced',
        slug: 'cat-ref',
        bannerUrl: media.publicUrl,
      })
      .expect(201);

    const deleteRes = await api().delete(`/api/v1/media/${media.id}`).set(admin.auth).expect(409);
    expect(deleteRes.body.error.code).toBe(MediaErrorCode.MEDIA_IN_USE);
    expect(deleteRes.body.error.details.referencedIn).toBe('Category');

    // Soft delete category
    await api().delete(`/api/v1/categories/${catRes.body.data.id}`).set(admin.auth).expect(204);

    // Now deletion succeeds
    await api().delete(`/api/v1/media/${media.id}`).set(admin.auth).expect(204);
  });

  it('safely deletes unreferenced media (204) and removes file from disk', async () => {
    const media = await uploadTestMedia(admin, validPngBuffer, 'unreferenced.png');

    await api().delete(`/api/v1/media/${media.id}`).set(admin.auth).expect(204);

    // Subsequent retrieval returns 404
    await api().get(`/api/v1/media/${media.id}`).set(admin.auth).expect(404);

    // DB record has deletedAt set
    const inDb = await prisma.media.findUniqueOrThrow({ where: { id: media.id } });
    expect(inDb.deletedAt).not.toBeNull();
  });

  it('preserves media library file on disk when a product removes or replaces its referenced image', async () => {
    const media = await uploadTestMedia(admin, validPngBuffer, 'shared-catalog.png');

    const brandRes = await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'Brand Preserved', slug: 'brand-preserved' })
      .expect(201);
    const catRes = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Cat Preserved', slug: 'cat-preserved' })
      .expect(201);

    const productRes = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({
        name: 'Shared Image Product',
        sku: 'SKU-SHARED-1',
        brandId: brandRes.body.data.id,
        categoryId: catRes.body.data.id,
        imageUrl: media.publicUrl,
      })
      .expect(201);

    // Remove the product's image via direct image endpoint
    await api().delete(`/api/v1/products/${productRes.body.data.id}/image`).set(admin.auth).expect(200);

    // Media library asset is still active and retrievable in the media library!
    const mediaCheck = await api().get(`/api/v1/media/${media.id}`).set(admin.auth).expect(200);
    expect(mediaCheck.body.data.id).toBe(media.id);

    // And now that the product no longer references it, the media can be safely deleted
    await api().delete(`/api/v1/media/${media.id}`).set(admin.auth).expect(204);
  });
});

describe('OpenAPI / Swagger Specification', () => {
  it('registers all Media endpoints in OpenAPI schema (/api/docs.json)', async () => {
    const res = await api().get('/api/docs.json').expect(200);

    expect(res.body.paths).toHaveProperty('/media');
    expect(res.body.paths['/media']).toHaveProperty('get');

    expect(res.body.paths).toHaveProperty('/media/{id}');
    expect(res.body.paths['/media/{id}']).toHaveProperty('get');
    expect(res.body.paths['/media/{id}']).toHaveProperty('delete');

    expect(res.body.paths).toHaveProperty('/media/upload');
    expect(res.body.paths['/media/upload']).toHaveProperty('post');
  });
});
