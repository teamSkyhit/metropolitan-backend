import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductsErrorCode } from '../src/modules/products/products.schema';
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

async function createTestBrand(overrides: Record<string, unknown> = {}) {
  const id = randomUUID().slice(0, 8);
  const res = await api()
    .post('/api/v1/brands')
    .set(admin.auth)
    .send({
      name: `Brand ${id}`,
      slug: `brand-${id}`,
      ...overrides,
    })
    .expect(201);
  return res.body.data;
}

async function createTestCategory(overrides: Record<string, unknown> = {}) {
  const id = randomUUID().slice(0, 8);
  const res = await api()
    .post('/api/v1/categories')
    .set(admin.auth)
    .send({
      name: `Category ${id}`,
      slug: `category-${id}`,
      ...overrides,
    })
    .expect(201);
  return res.body.data;
}

function sampleProductPayload(brandId: string, categoryId: string, overrides: Record<string, unknown> = {}) {
  const id = randomUUID().slice(0, 8);
  return {
    name: `Industrial Centrifugal Pump ${id}`,
    sku: `SKU-${id.toUpperCase()}`,
    brandId,
    categoryId,
    description: 'High performance centrifugal pump for industrial applications.',
    price: 499.5,
    priceVisibility: true,
    status: 'PUBLISHED' as const,
    hotDeal: true,
    ...overrides,
  };
}

describe('Products Access Control & RBAC', () => {
  it('rejects unauthenticated requests on all product endpoints with 401', async () => {
    const id = randomUUID();
    await api().get('/api/v1/products').expect(401);
    await api().post('/api/v1/products').send({ name: 'Pump' }).expect(401);
    await api().get(`/api/v1/products/${id}`).expect(401);
    await api().patch(`/api/v1/products/${id}`).send({ name: 'Pump 2' }).expect(401);
    await api().delete(`/api/v1/products/${id}`).expect(401);
    await api().post(`/api/v1/products/${id}/restore`).expect(401);
    await api().put(`/api/v1/products/${id}/image`).expect(401);
    await api().delete(`/api/v1/products/${id}/image`).expect(401);
    await api().put(`/api/v1/products/${id}/specifications`).expect(401);
  });

  it('allows authorized Sales Manager to manage products', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();
    const payload = sampleProductPayload(brand.id, category.id);

    const created = await api().post('/api/v1/products').set(sales.auth).send(payload).expect(201);
    const productId = created.body.data.id;
    expect(created.body.data.name).toBe(payload.name);
    expect(created.body.data.sku).toBe(payload.sku);

    const listRes = await api().get('/api/v1/products').set(sales.auth).expect(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data).toHaveLength(1);

    const getRes = await api().get(`/api/v1/products/${productId}`).set(sales.auth).expect(200);
    expect(getRes.body.data.id).toBe(productId);

    await api()
      .patch(`/api/v1/products/${productId}`)
      .set(sales.auth)
      .send({ name: 'Updated by Sales' })
      .expect(200);

    await api().delete(`/api/v1/products/${productId}`).set(sales.auth).expect(204);

    const restored = await api().post(`/api/v1/products/${productId}/restore`).set(sales.auth).expect(200);
    expect(restored.body.data.id).toBe(productId);
  });

  it('allows Super Admin full access to manage products', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();
    const payload = sampleProductPayload(brand.id, category.id);

    const created = await api().post('/api/v1/products').set(admin.auth).send(payload).expect(201);
    const productId = created.body.data.id;

    await api()
      .patch(`/api/v1/products/${productId}`)
      .set(admin.auth)
      .send({ description: 'Updated by Super Admin' })
      .expect(200);

    await api().delete(`/api/v1/products/${productId}`).set(admin.auth).expect(204);
  });

  it('returns 403 Forbidden when an authenticated user lacks required permissions', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();
    const payload = sampleProductPayload(brand.id, category.id);

    const spy = vi.spyOn(permissionsModule, 'permissionsFor').mockReturnValue(new Set());

    try {
      const resCreate = await api().post('/api/v1/products').set(sales.auth).send(payload).expect(403);
      expect(resCreate.body.error.code).toBe('FORBIDDEN');

      const resList = await api().get('/api/v1/products').set(sales.auth).expect(403);
      expect(resList.body.error.code).toBe('FORBIDDEN');

      const id = randomUUID();
      const resUpdate = await api()
        .patch(`/api/v1/products/${id}`)
        .set(sales.auth)
        .send({ name: 'Test' })
        .expect(403);
      expect(resUpdate.body.error.code).toBe('FORBIDDEN');

      const resDelete = await api().delete(`/api/v1/products/${id}`).set(sales.auth).expect(403);
      expect(resDelete.body.error.code).toBe('FORBIDDEN');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('Product Creation & Validation', () => {
  it('creates product with valid full data', async () => {
    const brand = await createTestBrand({ name: 'Grundfos' });
    const category = await createTestCategory({ name: 'Pumps' });
    const payload = {
      name: 'Grundfos CM3-5 Industrial Pump',
      sku: 'GRUND-CM35-001',
      brandId: brand.id,
      categoryId: category.id,
      description: 'Multi-stage end-suction centrifugal pump.',
      price: 1299.99,
      priceVisibility: true,
      status: 'PUBLISHED',
      hotDeal: true,
    };

    const res = await api().post('/api/v1/products').set(admin.auth).send(payload).expect(201);
    expect(res.body.success).toBe(true);
    const product = res.body.data;
    expect(product.id).toBeDefined();
    expect(product.name).toBe(payload.name);
    expect(product.sku).toBe(payload.sku);
    expect(product.brandId).toBe(brand.id);
    expect(product.categoryId).toBe(category.id);
    expect(product.description).toBe(payload.description);
    expect(product.price).toBe(1299.99);
    expect(product.priceVisibility).toBe(true);
    expect(product.status).toBe('PUBLISHED');
    expect(product.hotDeal).toBe(true);
    expect(product.brand).toEqual({ id: brand.id, name: brand.name, slug: brand.slug });
    expect(product.category).toEqual({ id: category.id, name: category.name, slug: category.slug });
    expect(product.createdAt).toBeDefined();
    expect(product.updatedAt).toBeDefined();
  });

  it('creates minimal valid product with sensible defaults', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();
    const payload = {
      name: 'Basic Motor 1HP',
      sku: 'MOTOR-001',
      brandId: brand.id,
      categoryId: category.id,
    };

    const res = await api().post('/api/v1/products').set(admin.auth).send(payload).expect(201);
    const product = res.body.data;
    expect(product.name).toBe(payload.name);
    expect(product.sku).toBe(payload.sku);
    expect(product.description).toBeNull();
    expect(product.price).toBeNull();
    expect(product.priceVisibility).toBe(true);
    expect(product.status).toBe('DRAFT');
    expect(product.hotDeal).toBe(false);
  });

  it('rejects missing or empty product name with 400', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({ sku: 'SKU-1', brandId: brand.id, categoryId: category.id })
      .expect(400);

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({ name: '   ', sku: 'SKU-1', brandId: brand.id, categoryId: category.id })
      .expect(400);

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({ name: 'A'.repeat(201), sku: 'SKU-1', brandId: brand.id, categoryId: category.id })
      .expect(400);
  });

  it('rejects missing or invalid SKU with 400', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({ name: 'Product', brandId: brand.id, categoryId: category.id })
      .expect(400);

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({ name: 'Product', sku: '  ', brandId: brand.id, categoryId: category.id })
      .expect(400);

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({ name: 'Product', sku: 'S'.repeat(101), brandId: brand.id, categoryId: category.id })
      .expect(400);
  });

  it('rejects missing or invalid brandId with 400', async () => {
    const category = await createTestCategory();

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({ name: 'Product', sku: 'SKU-1', categoryId: category.id })
      .expect(400);

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({ name: 'Product', sku: 'SKU-1', brandId: 'not-a-uuid', categoryId: category.id })
      .expect(400);
  });

  it('rejects missing or invalid categoryId with 400', async () => {
    const brand = await createTestBrand();

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({ name: 'Product', sku: 'SKU-1', brandId: brand.id })
      .expect(400);

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({ name: 'Product', sku: 'SKU-1', brandId: brand.id, categoryId: 'invalid-uuid' })
      .expect(400);
  });

  it('rejects non-existent brand with PRODUCTS_BRAND_NOT_FOUND', async () => {
    const category = await createTestCategory();
    const nonExistentBrandId = randomUUID();

    const res = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({ name: 'Product', sku: 'SKU-1', brandId: nonExistentBrandId, categoryId: category.id })
      .expect(400);

    expect(res.body.error.code).toBe(ProductsErrorCode.BRAND_NOT_FOUND);
  });

  it('rejects non-existent category with PRODUCTS_CATEGORY_NOT_FOUND', async () => {
    const brand = await createTestBrand();
    const nonExistentCategoryId = randomUUID();

    const res = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({ name: 'Product', sku: 'SKU-1', brandId: brand.id, categoryId: nonExistentCategoryId })
      .expect(400);

    expect(res.body.error.code).toBe(ProductsErrorCode.CATEGORY_NOT_FOUND);
  });

  it('rejects soft-deleted brand with PRODUCTS_BRAND_UNAVAILABLE', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    await api().delete(`/api/v1/brands/${brand.id}`).set(admin.auth).expect(204);

    const res = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({ name: 'Product', sku: 'SKU-1', brandId: brand.id, categoryId: category.id })
      .expect(400);

    expect(res.body.error.code).toBe(ProductsErrorCode.BRAND_UNAVAILABLE);
  });

  it('rejects soft-deleted category with PRODUCTS_CATEGORY_UNAVAILABLE', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    await api().delete(`/api/v1/categories/${category.id}`).set(admin.auth).expect(204);

    const res = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({ name: 'Product', sku: 'SKU-1', brandId: brand.id, categoryId: category.id })
      .expect(400);

    expect(res.body.error.code).toBe(ProductsErrorCode.CATEGORY_UNAVAILABLE);
  });

  it('normalizes SKU to uppercase before persistence', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    const res = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { sku: 'cr-10' }))
      .expect(201);

    expect(res.body.data.sku).toBe('CR-10');

    const inDb = await prisma.product.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(inDb.sku).toBe('CR-10');
  });

  it('rejects duplicate SKU case-insensitively (cr-10 and CR-10 conflict)', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { sku: 'CR-10' }))
      .expect(201);

    const res = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { sku: 'cr-10' }))
      .expect(409);

    expect(res.body.error.code).toBe(ProductsErrorCode.SKU_TAKEN);
  });

  it('rejects invalid SKU formats containing spaces, HTML, or unsupported special characters', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    // Spaces
    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { sku: 'CR 10' }))
      .expect(400);

    // HTML / Script characters
    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { sku: 'CR<script>' }))
      .expect(400);

    // Unsupported special characters
    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { sku: 'CR@#$10' }))
      .expect(400);

    // Starting with non-alphanumeric
    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { sku: '-CR10' }))
      .expect(400);
  });

  it('rejects duplicate SKU on active product with 409 PRODUCTS_SKU_TAKEN', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { sku: 'DUPLICATE-SKU' }))
      .expect(201);

    const res = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { sku: 'DUPLICATE-SKU' }))
      .expect(409);

    expect(res.body.error.code).toBe(ProductsErrorCode.SKU_TAKEN);
  });

  it('rejects SKU belonging to a soft-deleted product with 409 PRODUCTS_SKU_BELONGS_TO_DELETED_PRODUCT', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { sku: 'RESERVED-SKU' }))
      .expect(201);

    await api().delete(`/api/v1/products/${created.body.data.id}`).set(admin.auth).expect(204);

    const res = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { sku: 'RESERVED-SKU' }))
      .expect(409);

    expect(res.body.error.code).toBe(ProductsErrorCode.SKU_BELONGS_TO_DELETED_PRODUCT);
  });

  it('validates price: rejects negative and malformed values, accepts null and zero', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { price: -5 }))
      .expect(400);

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { price: 'not-a-number' }))
      .expect(400);

    const zeroPriceRes = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { price: 0 }))
      .expect(201);
    expect(zeroPriceRes.body.data.price).toBe(0);

    const nullPriceRes = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { price: null }))
      .expect(201);
    expect(nullPriceRes.body.data.price).toBeNull();
  });

  it('handles priceVisibility and hotDeal toggles correctly', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    const hiddenRes = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { priceVisibility: false, hotDeal: true }))
      .expect(201);
    expect(hiddenRes.body.data.priceVisibility).toBe(false);
    expect(hiddenRes.body.data.hotDeal).toBe(true);

    const visibleRes = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { priceVisibility: true, hotDeal: false }))
      .expect(201);
    expect(visibleRes.body.data.priceVisibility).toBe(true);
    expect(visibleRes.body.data.hotDeal).toBe(false);
  });

  it('handles status: accepts DRAFT and PUBLISHED, rejects invalid status enum', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    const draftRes = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { status: 'DRAFT' }))
      .expect(201);
    expect(draftRes.body.data.status).toBe('DRAFT');

    const publishedRes = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { status: 'PUBLISHED' }))
      .expect(201);
    expect(publishedRes.body.data.status).toBe('PUBLISHED');

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { status: 'ARCHIVED' }))
      .expect(400);
  });
});

describe('Product Read & Detail', () => {
  it('gets product by ID with full relationship data', async () => {
    const brand = await createTestBrand({ name: 'Siemens' });
    const category = await createTestCategory({ name: 'Automation' });
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { name: 'Siemens S7-1200 PLC' }))
      .expect(201);

    const res = await api().get(`/api/v1/products/${created.body.data.id}`).set(admin.auth).expect(200);
    expect(res.body.success).toBe(true);
    const product = res.body.data;
    expect(product.id).toBe(created.body.data.id);
    expect(product.name).toBe('Siemens S7-1200 PLC');
    expect(product.brand).toEqual({ id: brand.id, name: brand.name, slug: brand.slug });
    expect(product.category).toEqual({ id: category.id, name: category.name, slug: category.slug });
  });

  it('returns 404 for non-existent product ID', async () => {
    const nonExistentId = randomUUID();
    const res = await api().get(`/api/v1/products/${nonExistentId}`).set(admin.auth).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 when querying a soft-deleted product by ID', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id))
      .expect(201);

    await api().delete(`/api/v1/products/${created.body.data.id}`).set(admin.auth).expect(204);

    await api().get(`/api/v1/products/${created.body.data.id}`).set(admin.auth).expect(404);
  });
});

describe('Product List, Search, Filter & Pagination', () => {
  it('supports pagination with items and pagination metadata', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    for (let i = 1; i <= 5; i++) {
      await api()
        .post('/api/v1/products')
        .set(admin.auth)
        .send(sampleProductPayload(brand.id, category.id, { name: `Item ${i}`, sku: `SKU-PAGE-${i}` }))
        .expect(201);
    }

    const page1 = await api().get('/api/v1/products?page=1&limit=2').set(admin.auth).expect(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 5,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: false,
    });

    const page3 = await api().get('/api/v1/products?page=3&limit=2').set(admin.auth).expect(200);
    expect(page3.body.data).toHaveLength(1);
    expect(page3.body.meta.pagination.hasNextPage).toBe(false);
    expect(page3.body.meta.pagination.hasPrevPage).toBe(true);
  });

  it('searches products by name case-insensitively', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { name: 'Rotary Vane Vacuum Pump' }))
      .expect(201);

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { name: 'Pneumatic Actuator' }))
      .expect(201);

    const res = await api().get('/api/v1/products?search=vacuum').set(admin.auth).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Rotary Vane Vacuum Pump');
  });

  it('searches products by SKU case-insensitively', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { name: 'Product A', sku: 'SPEC-ABC-999' }))
      .expect(201);

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { name: 'Product B', sku: 'NORM-XYZ-111' }))
      .expect(201);

    const res = await api().get('/api/v1/products?search=abc-999').set(admin.auth).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].sku).toBe('SPEC-ABC-999');
  });

  it('filters by brandId and categoryId', async () => {
    const brand1 = await createTestBrand({ name: 'Brand 1' });
    const brand2 = await createTestBrand({ name: 'Brand 2' });
    const cat1 = await createTestCategory({ name: 'Cat 1' });
    const cat2 = await createTestCategory({ name: 'Cat 2' });

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand1.id, cat1.id, { name: 'B1-C1' }))
      .expect(201);
    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand1.id, cat2.id, { name: 'B1-C2' }))
      .expect(201);
    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand2.id, cat1.id, { name: 'B2-C1' }))
      .expect(201);

    const brandFilterRes = await api()
      .get(`/api/v1/products?brandId=${brand1.id}`)
      .set(admin.auth)
      .expect(200);
    expect(brandFilterRes.body.data).toHaveLength(2);

    const catFilterRes = await api()
      .get(`/api/v1/products?categoryId=${cat2.id}`)
      .set(admin.auth)
      .expect(200);
    expect(catFilterRes.body.data).toHaveLength(1);
    expect(catFilterRes.body.data[0].name).toBe('B1-C2');
  });

  it('filters by hotDeal and status', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(
        sampleProductPayload(brand.id, category.id, { name: 'Hot Draft', hotDeal: true, status: 'DRAFT' })
      )
      .expect(201);
    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(
        sampleProductPayload(brand.id, category.id, {
          name: 'Regular Published',
          hotDeal: false,
          status: 'PUBLISHED',
        })
      )
      .expect(201);

    const hotRes = await api().get('/api/v1/products?hotDeal=true').set(admin.auth).expect(200);
    expect(hotRes.body.data).toHaveLength(1);
    expect(hotRes.body.data[0].name).toBe('Hot Draft');

    const publishedRes = await api().get('/api/v1/products?status=PUBLISHED').set(admin.auth).expect(200);
    expect(publishedRes.body.data).toHaveLength(1);
    expect(publishedRes.body.data[0].name).toBe('Regular Published');
  });

  it('orders by latest products (createdAt DESC) by default and supports custom sorting', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    const p1 = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { name: 'First Product', price: 100 }))
      .expect(201);

    const p2 = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { name: 'Second Product', price: 50 }))
      .expect(201);

    // Default sorting is latest products (createdAt DESC)
    const latestRes = await api().get('/api/v1/products').set(admin.auth).expect(200);
    expect(latestRes.body.data[0].id).toBe(p2.body.data.id);
    expect(latestRes.body.data[1].id).toBe(p1.body.data.id);

    // Sort by price ASC
    const priceAscRes = await api()
      .get('/api/v1/products?sortBy=price&sortOrder=asc')
      .set(admin.auth)
      .expect(200);
    expect(priceAscRes.body.data[0].price).toBe(50);
    expect(priceAscRes.body.data[1].price).toBe(100);
  });

  it('excludes soft-deleted products from list results', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    const p1 = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { name: 'Active Product' }))
      .expect(201);

    const p2 = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, category.id, { name: 'Deleted Product' }))
      .expect(201);

    await api().delete(`/api/v1/products/${p2.body.data.id}`).set(admin.auth).expect(204);

    const res = await api().get('/api/v1/products').set(admin.auth).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(p1.body.data.id);
  });
});

describe('Product Partial Updates (PATCH)', () => {
  it('updates product fields partially while preserving omitted fields', async () => {
    const brand1 = await createTestBrand({ name: 'Brand 1' });
    const brand2 = await createTestBrand({ name: 'Brand 2' });
    const cat = await createTestCategory();

    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(
        sampleProductPayload(brand1.id, cat.id, {
          name: 'Original Name',
          sku: 'ORIG-SKU',
          price: 500,
          status: 'DRAFT',
          hotDeal: false,
        })
      )
      .expect(201);
    const productId = created.body.data.id;

    // Partial update: only name and price
    const updateRes = await api()
      .patch(`/api/v1/products/${productId}`)
      .set(admin.auth)
      .send({ name: 'New Name', price: 750.25 })
      .expect(200);

    const updated = updateRes.body.data;
    expect(updated.name).toBe('New Name');
    expect(updated.price).toBe(750.25);
    expect(updated.sku).toBe('ORIG-SKU'); // preserved
    expect(updated.brandId).toBe(brand1.id); // preserved
    expect(updated.status).toBe('DRAFT'); // preserved
    expect(updated.hotDeal).toBe(false); // preserved

    // Update brand to brand2
    const brandUpdateRes = await api()
      .patch(`/api/v1/products/${productId}`)
      .set(admin.auth)
      .send({ brandId: brand2.id })
      .expect(200);
    expect(brandUpdateRes.body.data.brandId).toBe(brand2.id);
    expect(brandUpdateRes.body.data.brand.name).toBe('Brand 2');

    // Update hotDeal and status
    const statusUpdateRes = await api()
      .patch(`/api/v1/products/${productId}`)
      .set(admin.auth)
      .send({ status: 'PUBLISHED', hotDeal: true, priceVisibility: false })
      .expect(200);
    expect(statusUpdateRes.body.data.status).toBe('PUBLISHED');
    expect(statusUpdateRes.body.data.hotDeal).toBe(true);
    expect(statusUpdateRes.body.data.priceVisibility).toBe(false);
  });

  it('allows updating price to null', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();

    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id, { price: 299.99 }))
      .expect(201);

    const updateRes = await api()
      .patch(`/api/v1/products/${created.body.data.id}`)
      .set(admin.auth)
      .send({ price: null })
      .expect(200);

    expect(updateRes.body.data.price).toBeNull();
  });

  it('allows updating SKU to a new available SKU', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();

    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id, { sku: 'OLD-SKU-123' }))
      .expect(201);

    const res = await api()
      .patch(`/api/v1/products/${created.body.data.id}`)
      .set(admin.auth)
      .send({ sku: 'NEW-SKU-456' })
      .expect(200);

    expect(res.body.data.sku).toBe('NEW-SKU-456');
  });

  it('normalizes SKU to uppercase upon PATCH and enforces case-insensitive uniqueness', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id, { sku: 'CR-10' }))
      .expect(201);

    const p2 = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id, { sku: 'CR-20' }))
      .expect(201);

    // Normalizes to uppercase on update
    const updateRes = await api()
      .patch(`/api/v1/products/${p2.body.data.id}`)
      .set(admin.auth)
      .send({ sku: 'p-new-01' })
      .expect(200);
    expect(updateRes.body.data.sku).toBe('P-NEW-01');

    // Reject updating to cr-10 because CR-10 exists
    const conflictRes = await api()
      .patch(`/api/v1/products/${p2.body.data.id}`)
      .set(admin.auth)
      .send({ sku: 'cr-10' })
      .expect(409);
    expect(conflictRes.body.error.code).toBe(ProductsErrorCode.SKU_TAKEN);
  });

  it('allows patching product without changing its own SKU', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();

    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id, { sku: 'SAME-SKU' }))
      .expect(201);

    const res = await api()
      .patch(`/api/v1/products/${created.body.data.id}`)
      .set(admin.auth)
      .send({ sku: 'SAME-SKU', name: 'Renamed' })
      .expect(200);

    expect(res.body.data.name).toBe('Renamed');
    expect(res.body.data.sku).toBe('SAME-SKU');
  });

  it('rejects updating SKU to one taken by another product with 409', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();

    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id, { sku: 'EXISTING-SKU' }))
      .expect(201);

    const p2 = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id, { sku: 'OTHER-SKU' }))
      .expect(201);

    const res = await api()
      .patch(`/api/v1/products/${p2.body.data.id}`)
      .set(admin.auth)
      .send({ sku: 'EXISTING-SKU' })
      .expect(409);

    expect(res.body.error.code).toBe(ProductsErrorCode.SKU_TAKEN);
  });

  it('rejects updating brandId to non-existent or soft-deleted brand', async () => {
    const brand1 = await createTestBrand();
    const brand2 = await createTestBrand();
    const cat = await createTestCategory();

    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand1.id, cat.id))
      .expect(201);

    // Non-existent brand
    const notFoundRes = await api()
      .patch(`/api/v1/products/${created.body.data.id}`)
      .set(admin.auth)
      .send({ brandId: randomUUID() })
      .expect(400);
    expect(notFoundRes.body.error.code).toBe(ProductsErrorCode.BRAND_NOT_FOUND);

    // Soft-delete brand2 and attempt update
    await api().delete(`/api/v1/brands/${brand2.id}`).set(admin.auth).expect(204);
    const unavailableRes = await api()
      .patch(`/api/v1/products/${created.body.data.id}`)
      .set(admin.auth)
      .send({ brandId: brand2.id })
      .expect(400);
    expect(unavailableRes.body.error.code).toBe(ProductsErrorCode.BRAND_UNAVAILABLE);
  });

  it('rejects updating categoryId to non-existent or soft-deleted category', async () => {
    const brand = await createTestBrand();
    const cat1 = await createTestCategory();
    const cat2 = await createTestCategory();

    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat1.id))
      .expect(201);

    // Non-existent category
    const notFoundRes = await api()
      .patch(`/api/v1/products/${created.body.data.id}`)
      .set(admin.auth)
      .send({ categoryId: randomUUID() })
      .expect(400);
    expect(notFoundRes.body.error.code).toBe(ProductsErrorCode.CATEGORY_NOT_FOUND);

    // Soft-delete cat2 and attempt update
    await api().delete(`/api/v1/categories/${cat2.id}`).set(admin.auth).expect(204);
    const unavailableRes = await api()
      .patch(`/api/v1/products/${created.body.data.id}`)
      .set(admin.auth)
      .send({ categoryId: cat2.id })
      .expect(400);
    expect(unavailableRes.body.error.code).toBe(ProductsErrorCode.CATEGORY_UNAVAILABLE);
  });

  it('rejects empty update body with 400', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);

    await api().patch(`/api/v1/products/${created.body.data.id}`).set(admin.auth).send({}).expect(400);
  });
});

describe('Product Soft-Delete & Restore', () => {
  it('soft-deletes product and allows subsequent restore', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);
    const productId = created.body.data.id;

    // Delete
    await api().delete(`/api/v1/products/${productId}`).set(admin.auth).expect(204);

    // DB record still exists with deletedAt set
    const dbRecord = await prisma.product.findUnique({ where: { id: productId } });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.deletedAt).not.toBeNull();

    // Normal get returns 404
    await api().get(`/api/v1/products/${productId}`).set(admin.auth).expect(404);

    // Normal list excludes it
    const listRes = await api().get('/api/v1/products').set(admin.auth).expect(200);
    expect(listRes.body.data.find((p: { id: string }) => p.id === productId)).toBeUndefined();

    // Restore
    const restoreRes = await api().post(`/api/v1/products/${productId}/restore`).set(admin.auth).expect(200);
    expect(restoreRes.body.success).toBe(true);
    expect(restoreRes.body.data.id).toBe(productId);

    // Now available again
    const getRes = await api().get(`/api/v1/products/${productId}`).set(admin.auth).expect(200);
    expect(getRes.body.data.id).toBe(productId);
  });

  it('rejects restoring a non-deleted product with 409 PRODUCTS_NOT_DELETED', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);

    const res = await api()
      .post(`/api/v1/products/${created.body.data.id}/restore`)
      .set(admin.auth)
      .expect(409);

    expect(res.body.error.code).toBe(ProductsErrorCode.NOT_DELETED);
  });

  it('returns 404 when restoring or deleting a non-existent product', async () => {
    const nonExistentId = randomUUID();
    await api().delete(`/api/v1/products/${nonExistentId}`).set(admin.auth).expect(404);
    await api().post(`/api/v1/products/${nonExistentId}/restore`).set(admin.auth).expect(404);
  });
});

describe('Product Database Foreign Key Referential Integrity', () => {
  it('prevents physical deletion of a brand referenced by a product (onDelete: Restrict)', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);

    // Direct database hard delete attempt should fail due to FK restriction
    await expect(prisma.brand.delete({ where: { id: brand.id } })).rejects.toThrow();
  });

  it('prevents physical deletion of a category referenced by a product (onDelete: Restrict)', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);

    // Direct database hard delete attempt should fail due to FK restriction
    await expect(prisma.category.delete({ where: { id: cat.id } })).rejects.toThrow();
  });
});

describe('Product Image Upload, Replacement & Deletion (PUT & DELETE /api/v1/products/:id/image)', () => {
  it('uploads valid product image (PNG) via PUT /api/v1/products/:id/image', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);
    const productId = created.body.data.id;

    const res = await api()
      .put(`/api/v1/products/${productId}/image`)
      .set(admin.auth)
      .attach('image', validPngBuffer, 'product.png')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.imageUrl).toMatch(/\/products\/images\/.*\.png$/);

    const inDb = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(inDb.imageUrl).toBe(res.body.data.imageUrl);
  });

  it('uploads valid product image (JPEG) using "file" field name via PUT /api/v1/products/:id/image', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(sales.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);
    const productId = created.body.data.id;

    const res = await api()
      .put(`/api/v1/products/${productId}/image`)
      .set(sales.auth)
      .attach('file', validJpgBuffer, 'product.jpg')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.imageUrl).toMatch(/\/products\/images\/.*\.jpg$/);
  });

  it('uploads valid product image (WebP) via PUT /api/v1/products/:id/image', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);
    const productId = created.body.data.id;

    const res = await api()
      .put(`/api/v1/products/${productId}/image`)
      .set(admin.auth)
      .attach('image', validWebpBuffer, 'product.webp')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.imageUrl).toMatch(/\/products\/images\/.*\.webp$/);
  });

  it('safely replaces existing image and deletes old stored file', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);
    const productId = created.body.data.id;

    const firstUpload = await api()
      .put(`/api/v1/products/${productId}/image`)
      .set(admin.auth)
      .attach('image', validPngBuffer, 'first.png')
      .expect(200);

    const firstUrl = firstUpload.body.data.imageUrl;
    expect(firstUrl).toBeDefined();

    const secondUpload = await api()
      .put(`/api/v1/products/${productId}/image`)
      .set(admin.auth)
      .attach('image', validJpgBuffer, 'second.jpg')
      .expect(200);

    const secondUrl = secondUpload.body.data.imageUrl;
    expect(secondUrl).toBeDefined();
    expect(secondUrl).not.toBe(firstUrl);
    expect(secondUrl).toMatch(/\.jpg$/);

    const inDb = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(inDb.imageUrl).toBe(secondUrl);
  });

  it('removes product image via DELETE /api/v1/products/:id/image', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);
    const productId = created.body.data.id;

    await api()
      .put(`/api/v1/products/${productId}/image`)
      .set(admin.auth)
      .attach('image', validPngBuffer, 'first.png')
      .expect(200);

    const deleteRes = await api().delete(`/api/v1/products/${productId}/image`).set(admin.auth).expect(200);

    expect(deleteRes.body.success).toBe(true);
    expect(deleteRes.body.data.imageUrl).toBeNull();

    const inDb = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(inDb.imageUrl).toBeNull();
  });

  it('rejects empty file upload with 400', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);

    await api()
      .put(`/api/v1/products/${created.body.data.id}/image`)
      .set(admin.auth)
      .attach('image', Buffer.from([]), 'empty.png')
      .expect(400);
  });

  it('rejects invalid file content (SVG) with 400', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);

    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
    await api()
      .put(`/api/v1/products/${created.body.data.id}/image`)
      .set(admin.auth)
      .attach('image', svgBuffer, 'vector.svg')
      .expect(400);
  });

  it('rejects spoofed file extensions (text content pretending to be PNG) with 400', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);

    const fakePng = Buffer.from('this is just a text file renamed to png');
    await api()
      .put(`/api/v1/products/${created.body.data.id}/image`)
      .set(admin.auth)
      .attach('image', fakePng, 'fake.png')
      .expect(400);
  });

  it('rejects upload exceeding 5 MB limit with 400', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);

    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024);
    await api()
      .put(`/api/v1/products/${created.body.data.id}/image`)
      .set(admin.auth)
      .attach('image', oversizedBuffer, 'large.png')
      .expect(400);
  });

  it('rejects upload when no file is attached with 400', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);

    await api()
      .put(`/api/v1/products/${created.body.data.id}/image`)
      .set(admin.auth)
      .send({ someField: 'value' })
      .expect(400);
  });

  it('returns 404 when uploading or deleting image for nonexistent product', async () => {
    const nonExistentId = randomUUID();
    await api()
      .put(`/api/v1/products/${nonExistentId}/image`)
      .set(admin.auth)
      .attach('image', validPngBuffer, 'product.png')
      .expect(404);

    await api().delete(`/api/v1/products/${nonExistentId}/image`).set(admin.auth).expect(404);
  });
});

describe('Product Specifications (POST, PATCH, PUT /api/v1/products/:id/specifications)', () => {
  it('creates product with structured specifications via POST /api/v1/products', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const specs = [
      { key: 'Motor Power', value: '7.5', unit: 'HP' },
      { key: 'Flow Rate', value: '150', unit: 'L/min' },
      { key: 'Material', value: 'Stainless Steel 316' },
    ];

    const res = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id, { specifications: specs }))
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.specifications).toEqual(specs);

    const inDb = await prisma.product.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(inDb.specifications).toEqual(specs);
  });

  it('updates product specifications via PATCH /api/v1/products/:id', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);
    const productId = created.body.data.id;
    expect(created.body.data.specifications).toBeNull();

    const updatedSpecs = [{ key: 'Voltage', value: '415', unit: 'V' }];
    const res = await api()
      .patch(`/api/v1/products/${productId}`)
      .set(admin.auth)
      .send({ specifications: updatedSpecs })
      .expect(200);

    expect(res.body.data.specifications).toEqual(updatedSpecs);

    // Clear specifications via PATCH null
    const clearRes = await api()
      .patch(`/api/v1/products/${productId}`)
      .set(admin.auth)
      .send({ specifications: null })
      .expect(200);

    expect(clearRes.body.data.specifications).toBeNull();
  });

  it('updates specifications via dedicated PUT /api/v1/products/:id/specifications', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(sales.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);
    const productId = created.body.data.id;

    const specs = [
      { key: 'Pressure', value: '10', unit: 'bar' },
      { key: 'RPM', value: '2900' },
    ];

    const res = await api()
      .put(`/api/v1/products/${productId}/specifications`)
      .set(sales.auth)
      .send({ specifications: specs })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.specifications).toEqual(specs);

    const inDb = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(inDb.specifications).toEqual(specs);
  });

  it('rejects specifications with empty key with 400', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);

    await api()
      .put(`/api/v1/products/${created.body.data.id}/specifications`)
      .set(admin.auth)
      .send({ specifications: [{ key: '', value: '100' }] })
      .expect(400);
  });

  it('rejects specifications with empty value with 400', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);

    await api()
      .put(`/api/v1/products/${created.body.data.id}/specifications`)
      .set(admin.auth)
      .send({ specifications: [{ key: 'Power', value: '' }] })
      .expect(400);
  });

  it('rejects duplicate specification keys case-insensitively with 400', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);

    await api()
      .put(`/api/v1/products/${created.body.data.id}/specifications`)
      .set(admin.auth)
      .send({
        specifications: [
          { key: 'Power', value: '10', unit: 'HP' },
          { key: 'power', value: '15', unit: 'HP' },
        ],
      })
      .expect(400);
  });

  it('rejects specification key exceeding 100 characters with 400', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);

    await api()
      .put(`/api/v1/products/${created.body.data.id}/specifications`)
      .set(admin.auth)
      .send({
        specifications: [{ key: 'a'.repeat(101), value: '10' }],
      })
      .expect(400);
  });

  it('rejects arbitrary object instead of structured array with 400', async () => {
    const brand = await createTestBrand();
    const cat = await createTestCategory();
    const created = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send(sampleProductPayload(brand.id, cat.id))
      .expect(201);

    await api()
      .put(`/api/v1/products/${created.body.data.id}/specifications`)
      .set(admin.auth)
      .send({ specifications: { arbitraryKey: 'arbitraryValue' } })
      .expect(400);
  });

  it('returns 404 when updating specifications for nonexistent product', async () => {
    await api()
      .put(`/api/v1/products/${randomUUID()}/specifications`)
      .set(admin.auth)
      .send({ specifications: [{ key: 'Power', value: '10' }] })
      .expect(404);
  });
});

describe('Product Swagger & Documentation Verification', () => {
  it('includes Product image and specifications routes in OpenAPI specification', async () => {
    const res = await api().get('/api/docs.json').expect(200);
    expect(res.body.paths).toHaveProperty('/products/{id}/image');
    expect(res.body.paths['/products/{id}/image']).toHaveProperty('put');
    expect(res.body.paths['/products/{id}/image']).toHaveProperty('delete');
    expect(res.body.paths).toHaveProperty('/products/{id}/specifications');
    expect(res.body.paths['/products/{id}/specifications']).toHaveProperty('put');
  });
});
