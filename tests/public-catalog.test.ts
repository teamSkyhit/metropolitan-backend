import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './helpers/app';
import { signInAs, type Session } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

let admin: Session;

beforeEach(async () => {
  await resetDatabase();
  admin = await signInAs('SUPER_ADMIN');
});

async function createTestBrand(overrides: Record<string, unknown> = {}) {
  const uid = randomUUID().slice(0, 8);
  const res = await api()
    .post('/api/v1/brands')
    .set(admin.auth)
    .send({
      name: `Brand ${uid}`,
      slug: `brand-${uid}`,
      description: `Description for brand ${uid}`,
      isActive: true,
      sortOrder: 0,
      ...overrides,
    })
    .expect(201);
  return res.body.data;
}

async function createTestCategory(overrides: Record<string, unknown> = {}) {
  const uid = randomUUID().slice(0, 8);
  const res = await api()
    .post('/api/v1/categories')
    .set(admin.auth)
    .send({
      name: `Category ${uid}`,
      slug: `category-${uid}`,
      description: `Description for category ${uid}`,
      isActive: true,
      sortOrder: 0,
      ...overrides,
    })
    .expect(201);
  return res.body.data;
}

async function createTestProduct(overrides: Record<string, unknown> = {}) {
  const uid = randomUUID().slice(0, 8);
  const brand = overrides.brandId ? null : await createTestBrand();
  const category = overrides.categoryId ? null : await createTestCategory();

  const res = await api()
    .post('/api/v1/products')
    .set(admin.auth)
    .send({
      name: `Product ${uid}`,
      sku: `SKU-${uid.toUpperCase()}`,
      brandId: overrides.brandId ?? brand!.id,
      categoryId: overrides.categoryId ?? category!.id,
      description: `Description for product ${uid}`,
      price: 150.0,
      priceVisibility: true,
      status: 'PUBLISHED',
      hotDeal: false,
      ...overrides,
    })
    .expect(201);
  return res.body.data;
}

describe('Public Brands API', () => {
  it('GET /api/v1/public/brands returns public-safe active brands', async () => {
    await createTestBrand({ name: 'Beta Brand', slug: 'beta-brand', sortOrder: 2 });
    await createTestBrand({ name: 'Alpha Brand', slug: 'alpha-brand', sortOrder: 1 });
    await createTestBrand({ name: 'Inactive Brand', slug: 'inactive-brand', isActive: false });

    const deleted = await createTestBrand({ name: 'Deleted Brand', slug: 'deleted-brand' });
    await api().delete(`/api/v1/brands/${deleted.id}`).set(admin.auth).expect(204);

    const res = await api().get('/api/v1/public/brands').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    // Ordered by sortOrder ASC: Alpha Brand (1), then Beta Brand (2)
    expect(res.body.data[0].slug).toBe('alpha-brand');
    expect(res.body.data[1].slug).toBe('beta-brand');

    // Verify public shape and exclusion of internal fields
    for (const item of res.body.data) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('slug');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('logoUrl');
      expect(item).toHaveProperty('bannerUrl');

      expect(item).not.toHaveProperty('isActive');
      expect(item).not.toHaveProperty('sortOrder');
      expect(item).not.toHaveProperty('nameKey');
      expect(item).not.toHaveProperty('deletedAt');
      expect(item).not.toHaveProperty('createdById');
      expect(item).not.toHaveProperty('updatedById');
    }
  });

  it('GET /api/v1/public/brands/:slug returns active brand and 404 for deleted/non-existent brand', async () => {
    const brand = await createTestBrand({ name: 'Siemens', slug: 'siemens' });

    const detailRes = await api().get('/api/v1/public/brands/siemens').expect(200);
    expect(detailRes.body.success).toBe(true);
    expect(detailRes.body.data.id).toBe(brand.id);
    expect(detailRes.body.data.name).toBe('Siemens');
    expect(detailRes.body.data).not.toHaveProperty('createdById');

    // Soft delete brand
    await api().delete(`/api/v1/brands/${brand.id}`).set(admin.auth).expect(204);

    // Detail should now return 404
    await api().get('/api/v1/public/brands/siemens').expect(404);

    // Non-existent slug returns 404
    await api().get('/api/v1/public/brands/non-existent-slug').expect(404);
  });
});

describe('Public Categories API', () => {
  it('GET /api/v1/public/categories returns public-safe active categories', async () => {
    await createTestCategory({ name: 'Zeta Category', slug: 'zeta-cat', sortOrder: 2 });
    await createTestCategory({ name: 'Alpha Category', slug: 'alpha-cat', sortOrder: 1 });
    await createTestCategory({ name: 'Hidden Category', slug: 'hidden-cat', isActive: false });

    const deleted = await createTestCategory({ name: 'Deleted Cat', slug: 'deleted-cat' });
    await api().delete(`/api/v1/categories/${deleted.id}`).set(admin.auth).expect(204);

    const res = await api().get('/api/v1/public/categories').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].slug).toBe('alpha-cat');
    expect(res.body.data[1].slug).toBe('zeta-cat');

    for (const item of res.body.data) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('slug');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('bannerUrl');

      expect(item).not.toHaveProperty('isActive');
      expect(item).not.toHaveProperty('sortOrder');
      expect(item).not.toHaveProperty('nameKey');
      expect(item).not.toHaveProperty('deletedAt');
      expect(item).not.toHaveProperty('createdById');
      expect(item).not.toHaveProperty('updatedById');
    }
  });

  it('GET /api/v1/public/categories/:slug returns active category and 404 for deleted/non-existent category', async () => {
    const category = await createTestCategory({ name: 'Switchgear', slug: 'switchgear' });

    const detailRes = await api().get('/api/v1/public/categories/switchgear').expect(200);
    expect(detailRes.body.success).toBe(true);
    expect(detailRes.body.data.id).toBe(category.id);
    expect(detailRes.body.data.name).toBe('Switchgear');
    expect(detailRes.body.data).not.toHaveProperty('createdById');

    await api().delete(`/api/v1/categories/${category.id}`).set(admin.auth).expect(204);

    await api().get('/api/v1/public/categories/switchgear').expect(404);
    await api().get('/api/v1/public/categories/non-existent-slug').expect(404);
  });
});

describe('Public Products API', () => {
  it('allows unauthenticated access to product list and detail', async () => {
    const product = await createTestProduct({
      name: 'Hydraulic Valve',
      sku: 'HV-001',
      status: 'PUBLISHED',
    });

    const listRes = await api().get('/api/v1/public/products').expect(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

    const detailRes = await api().get(`/api/v1/public/products/${product.id}`).expect(200);
    expect(detailRes.body.success).toBe(true);
    expect(detailRes.body.data.id).toBe(product.id);
  });

  it('excludes soft-deleted, draft, or inactive brand/category products', async () => {
    const activeBrand = await createTestBrand({ name: 'Active Brand', slug: 'active-brand' });
    const inactiveBrand = await createTestBrand({
      name: 'Inactive Brand',
      slug: 'inactive-brand',
      isActive: false,
    });
    const activeCat = await createTestCategory({ name: 'Active Category', slug: 'active-cat' });
    const inactiveCat = await createTestCategory({
      name: 'Inactive Category',
      slug: 'inactive-cat',
      isActive: false,
    });

    // 1. Valid published product
    const valid = await createTestProduct({
      name: 'Valid Product',
      sku: 'VALID-01',
      brandId: activeBrand.id,
      categoryId: activeCat.id,
      status: 'PUBLISHED',
    });

    // 2. Draft product
    const draft = await createTestProduct({
      name: 'Draft Product',
      sku: 'DRAFT-01',
      brandId: activeBrand.id,
      categoryId: activeCat.id,
      status: 'DRAFT',
    });

    // 3. Product with inactive brand
    const prodInactiveBrand = await createTestProduct({
      name: 'Product Inactive Brand',
      sku: 'INACT-B-01',
      brandId: inactiveBrand.id,
      categoryId: activeCat.id,
      status: 'PUBLISHED',
    });

    // 4. Product with inactive category
    const prodInactiveCat = await createTestProduct({
      name: 'Product Inactive Category',
      sku: 'INACT-C-01',
      brandId: activeBrand.id,
      categoryId: inactiveCat.id,
      status: 'PUBLISHED',
    });

    // 5. Soft-deleted product
    const toDelete = await createTestProduct({
      name: 'Deleted Product',
      sku: 'DEL-01',
      brandId: activeBrand.id,
      categoryId: activeCat.id,
      status: 'PUBLISHED',
    });
    await api().delete(`/api/v1/products/${toDelete.id}`).set(admin.auth).expect(204);

    // 6. Product whose brand is soft-deleted
    const brandToDelete = await createTestBrand({ name: 'Brand To Delete', slug: 'brand-to-delete' });
    const prodWithDeletedBrand = await createTestProduct({
      name: 'Product With Deleted Brand',
      sku: 'DEL-B-01',
      brandId: brandToDelete.id,
      categoryId: activeCat.id,
      status: 'PUBLISHED',
    });
    await prisma.brand.update({
      where: { id: brandToDelete.id },
      data: { deletedAt: new Date() },
    });

    // 7. Product whose category is soft-deleted
    const catToDelete = await createTestCategory({ name: 'Category To Delete', slug: 'cat-to-delete' });
    const prodWithDeletedCat = await createTestProduct({
      name: 'Product With Deleted Cat',
      sku: 'DEL-C-01',
      brandId: activeBrand.id,
      categoryId: catToDelete.id,
      status: 'PUBLISHED',
    });
    await prisma.category.update({
      where: { id: catToDelete.id },
      data: { deletedAt: new Date() },
    });

    // List verification
    const listRes = await api().get('/api/v1/public/products').expect(200);
    const listedIds = listRes.body.data.map((p: { id: string }) => p.id);

    expect(listedIds).toContain(valid.id);
    expect(listedIds).not.toContain(draft.id);
    expect(listedIds).not.toContain(prodInactiveBrand.id);
    expect(listedIds).not.toContain(prodInactiveCat.id);
    expect(listedIds).not.toContain(toDelete.id);
    expect(listedIds).not.toContain(prodWithDeletedBrand.id);
    expect(listedIds).not.toContain(prodWithDeletedCat.id);

    // Detail verification: excluded products must return 404
    await api().get(`/api/v1/public/products/${valid.id}`).expect(200);
    await api().get(`/api/v1/public/products/${draft.id}`).expect(404);
    await api().get(`/api/v1/public/products/${prodInactiveBrand.id}`).expect(404);
    await api().get(`/api/v1/public/products/${prodInactiveCat.id}`).expect(404);
    await api().get(`/api/v1/public/products/${toDelete.id}`).expect(404);
    await api().get(`/api/v1/public/products/${prodWithDeletedBrand.id}`).expect(404);
    await api().get(`/api/v1/public/products/${prodWithDeletedCat.id}`).expect(404);
  });

  it('supports pagination metadata correctly', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    for (let i = 1; i <= 5; i++) {
      await createTestProduct({
        name: `Paginated Product ${i}`,
        sku: `PAG-${i}`,
        brandId: brand.id,
        categoryId: category.id,
        status: 'PUBLISHED',
      });
    }

    const page1 = await api().get('/api/v1/public/products?page=1&limit=2').expect(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 5,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: false,
    });

    const page3 = await api().get('/api/v1/public/products?page=3&limit=2').expect(200);
    expect(page3.body.data).toHaveLength(1);
    expect(page3.body.meta.pagination.hasNextPage).toBe(false);
    expect(page3.body.meta.pagination.hasPrevPage).toBe(true);
  });

  it('supports search by name, SKU, brand name, and category name', async () => {
    const brandHoneywell = await createTestBrand({ name: 'Honeywell Industrial', slug: 'honeywell' });
    const brandBosch = await createTestBrand({ name: 'Bosch Rexroth', slug: 'bosch' });
    const catSensors = await createTestCategory({ name: 'Flow Sensors', slug: 'flow-sensors' });
    const catMotors = await createTestCategory({ name: 'Servo Motors', slug: 'servo-motors' });

    await createTestProduct({
      name: 'Turbine Flowmeter',
      sku: 'FLW-001',
      brandId: brandHoneywell.id,
      categoryId: catSensors.id,
      status: 'PUBLISHED',
    });

    await createTestProduct({
      name: 'Induction Motor',
      sku: 'MTR-999',
      brandId: brandBosch.id,
      categoryId: catMotors.id,
      status: 'PUBLISHED',
    });

    // 1. Search by product name
    const searchName = await api().get('/api/v1/public/products?search=flowmeter').expect(200);
    expect(searchName.body.data).toHaveLength(1);
    expect(searchName.body.data[0].sku).toBe('FLW-001');

    // 2. Search by SKU
    const searchSku = await api().get('/api/v1/public/products?search=mtr-999').expect(200);
    expect(searchSku.body.data).toHaveLength(1);
    expect(searchSku.body.data[0].name).toBe('Induction Motor');

    // 3. Search by brand name
    const searchBrand = await api().get('/api/v1/public/products?search=honeywell').expect(200);
    expect(searchBrand.body.data).toHaveLength(1);
    expect(searchBrand.body.data[0].sku).toBe('FLW-001');

    // 4. Search by category name
    const searchCategory = await api().get('/api/v1/public/products?search=servo').expect(200);
    expect(searchCategory.body.data).toHaveLength(1);
    expect(searchCategory.body.data[0].sku).toBe('MTR-999');
  });

  it('supports filtering by brand and category (using slug or UUID)', async () => {
    const brandA = await createTestBrand({ name: 'ABB Power', slug: 'abb-power' });
    const brandB = await createTestBrand({ name: 'Schneider Electric', slug: 'schneider' });
    const catA = await createTestCategory({ name: 'Transformers', slug: 'transformers' });
    const catB = await createTestCategory({ name: 'Circuit Breakers', slug: 'circuit-breakers' });

    const prod1 = await createTestProduct({
      name: 'High Voltage Transformer',
      sku: 'TR-01',
      brandId: brandA.id,
      categoryId: catA.id,
      status: 'PUBLISHED',
    });

    const prod2 = await createTestProduct({
      name: 'Air Circuit Breaker',
      sku: 'ACB-01',
      brandId: brandB.id,
      categoryId: catB.id,
      status: 'PUBLISHED',
    });

    // Filter by brand slug
    const resBrandSlug = await api().get('/api/v1/public/products?brand=abb-power').expect(200);
    expect(resBrandSlug.body.data).toHaveLength(1);
    expect(resBrandSlug.body.data[0].id).toBe(prod1.id);

    // Filter by brand UUID
    const resBrandId = await api().get(`/api/v1/public/products?brand=${brandB.id}`).expect(200);
    expect(resBrandId.body.data).toHaveLength(1);
    expect(resBrandId.body.data[0].id).toBe(prod2.id);

    // Filter by category slug
    const resCatSlug = await api().get('/api/v1/public/products?category=circuit-breakers').expect(200);
    expect(resCatSlug.body.data).toHaveLength(1);
    expect(resCatSlug.body.data[0].id).toBe(prod2.id);

    // Filter by category UUID
    const resCatId = await api().get(`/api/v1/public/products?category=${catA.id}`).expect(200);
    expect(resCatId.body.data).toHaveLength(1);
    expect(resCatId.body.data[0].id).toBe(prod1.id);
  });

  it('supports hotDeal filtering', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    const hotProd = await createTestProduct({
      name: 'Hot Deal Machine',
      sku: 'HOT-01',
      brandId: brand.id,
      categoryId: category.id,
      hotDeal: true,
      status: 'PUBLISHED',
    });

    await createTestProduct({
      name: 'Regular Machine',
      sku: 'REG-01',
      brandId: brand.id,
      categoryId: category.id,
      hotDeal: false,
      status: 'PUBLISHED',
    });

    const res = await api().get('/api/v1/public/products?hotDeal=true').expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(hotProd.id);
  });

  it('supports sorting by latest, oldest, name, and price', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    const pA = await createTestProduct({
      name: 'Alpha Drill',
      sku: 'DRILL-A',
      price: 50.0,
      brandId: brand.id,
      categoryId: category.id,
      status: 'PUBLISHED',
    });

    const pZ = await createTestProduct({
      name: 'Zulu Drill',
      sku: 'DRILL-Z',
      price: 200.0,
      brandId: brand.id,
      categoryId: category.id,
      status: 'PUBLISHED',
    });

    // 1. Name ascending
    const sortNameAsc = await api().get('/api/v1/public/products?sort=name_asc').expect(200);
    expect(sortNameAsc.body.data[0].id).toBe(pA.id);
    expect(sortNameAsc.body.data[1].id).toBe(pZ.id);

    // 2. Name descending
    const sortNameDesc = await api().get('/api/v1/public/products?sort=name_desc').expect(200);
    expect(sortNameDesc.body.data[0].id).toBe(pZ.id);
    expect(sortNameDesc.body.data[1].id).toBe(pA.id);

    // 3. Price ascending
    const sortPriceAsc = await api().get('/api/v1/public/products?sort=price_asc').expect(200);
    expect(sortPriceAsc.body.data[0].id).toBe(pA.id);
    expect(sortPriceAsc.body.data[1].id).toBe(pZ.id);

    // 4. Price descending
    const sortPriceDesc = await api().get('/api/v1/public/products?sort=price_desc').expect(200);
    expect(sortPriceDesc.body.data[0].id).toBe(pZ.id);
    expect(sortPriceDesc.body.data[1].id).toBe(pA.id);
  });

  it('respects priceVisibility: hides price when false and shows price when true', async () => {
    const brand = await createTestBrand();
    const category = await createTestCategory();

    const hiddenPriceProd = await createTestProduct({
      name: 'Quote Only Machine',
      sku: 'QUOTE-01',
      price: 5000.0,
      priceVisibility: false,
      brandId: brand.id,
      categoryId: category.id,
      status: 'PUBLISHED',
    });

    const visiblePriceProd = await createTestProduct({
      name: 'Retail Machine',
      sku: 'RETAIL-01',
      price: 120.5,
      priceVisibility: true,
      brandId: brand.id,
      categoryId: category.id,
      status: 'PUBLISHED',
    });

    // Listing check
    const listRes = await api().get('/api/v1/public/products').expect(200);
    const hiddenInList = listRes.body.data.find((p: { id: string }) => p.id === hiddenPriceProd.id);
    const visibleInList = listRes.body.data.find((p: { id: string }) => p.id === visiblePriceProd.id);

    expect(hiddenInList.price).toBeNull();
    expect(visibleInList.price).toBe(120.5);

    // Detail check
    const hiddenDetail = await api().get(`/api/v1/public/products/${hiddenPriceProd.id}`).expect(200);
    expect(hiddenDetail.body.data.price).toBeNull();

    const visibleDetail = await api().get(`/api/v1/public/products/${visiblePriceProd.id}`).expect(200);
    expect(visibleDetail.body.data.price).toBe(120.5);
  });

  it('supports product detail lookup by UUID, SKU, or name slug', async () => {
    const brand = await createTestBrand({ name: 'Danfoss', slug: 'danfoss' });
    const category = await createTestCategory({ name: 'VFD', slug: 'vfd' });

    const product = await createTestProduct({
      name: 'Danfoss Drive FC51',
      sku: 'FC-51-01',
      brandId: brand.id,
      categoryId: category.id,
      status: 'PUBLISHED',
    });

    // 1. Lookup by UUID
    const byId = await api().get(`/api/v1/public/products/${product.id}`).expect(200);
    expect(byId.body.data.id).toBe(product.id);

    // 2. Lookup by SKU
    const bySku = await api().get('/api/v1/public/products/FC-51-01').expect(200);
    expect(bySku.body.data.id).toBe(product.id);

    // 3. Lookup by computed slug (danfoss-drive-fc51)
    const bySlug = await api().get('/api/v1/public/products/danfoss-drive-fc51').expect(200);
    expect(bySlug.body.data.id).toBe(product.id);
  });

  it('never exposes internal or CRM-only fields in public products', async () => {
    const product = await createTestProduct({
      name: 'Precision Lathe',
      sku: 'LATHE-01',
      status: 'PUBLISHED',
      specifications: [{ key: 'Power', value: '5', unit: 'kW' }],
    });

    const listRes = await api().get('/api/v1/public/products').expect(200);
    const item = listRes.body.data.find((p: { id: string }) => p.id === product.id);

    const detailRes = await api().get(`/api/v1/public/products/${product.id}`).expect(200);
    const detail = detailRes.body.data;

    for (const record of [item, detail]) {
      expect(record).toHaveProperty('id');
      expect(record).toHaveProperty('name');
      expect(record).toHaveProperty('slug');
      expect(record).toHaveProperty('sku');
      expect(record).toHaveProperty('description');
      expect(record).toHaveProperty('price');
      expect(record).toHaveProperty('hotDeal');
      expect(record).toHaveProperty('imageUrl');
      expect(record).toHaveProperty('specifications');
      expect(record).toHaveProperty('brand');
      expect(record).toHaveProperty('category');
      expect(record).toHaveProperty('createdAt');

      // Internal fields strictly excluded
      expect(record).not.toHaveProperty('status');
      expect(record).not.toHaveProperty('priceVisibility');
      expect(record).not.toHaveProperty('createdById');
      expect(record).not.toHaveProperty('updatedById');
      expect(record).not.toHaveProperty('deletedAt');
      expect(record).not.toHaveProperty('updatedAt');
      expect(record).not.toHaveProperty('brandId');
      expect(record).not.toHaveProperty('categoryId');
    }

    // Specifications structured format preserved
    expect(detail.specifications).toEqual([{ key: 'Power', value: '5', unit: 'kW' }]);
  });

  it('returns 400 for invalid query parameters', async () => {
    await api().get('/api/v1/public/products?limit=101').expect(400);
    await api().get('/api/v1/public/products?page=0').expect(400);
    await api().get('/api/v1/public/products?sort=unknown_sort').expect(400);
  });

  it('returns 404 for non-existent product slug/id', async () => {
    await api().get('/api/v1/public/products/non-existent-product-identifier').expect(404);
    await api().get(`/api/v1/public/products/${randomUUID()}`).expect(404);
  });
});
