import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { EnquiriesErrorCode } from '../src/modules/enquiries/enquiries.schema';
import { api } from './helpers/app';
import { signInAs, type Session } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

let admin: Session;
let prod1: { id: string; name: string; sku: string };
let prod2: { id: string; name: string; sku: string };
let draftProd: { id: string; name: string; sku: string };
let deletedProd: { id: string; name: string; sku: string };

beforeEach(async () => {
  await resetDatabase();
  admin = await signInAs('SUPER_ADMIN');

  // Create brand & category
  const brand = await prisma.brand.create({
    data: { name: 'SKF Bearings', slug: 'skf-bearings', nameKey: 'skf bearings' },
  });
  const category = await prisma.category.create({
    data: { name: 'Ball Bearings', slug: 'ball-bearings', nameKey: 'ball bearings' },
  });

  // Create published products
  prod1 = await prisma.product.create({
    data: {
      name: 'Deep Groove Ball Bearing 6205',
      slug: 'deep-groove-ball-bearing-6205',
      sku: 'BRG-6205',
      status: 'PUBLISHED',
      brandId: brand.id,
      categoryId: category.id,
    },
  });

  prod2 = await prisma.product.create({
    data: {
      name: 'Spherical Roller Bearing 22210',
      slug: 'spherical-roller-bearing-22210',
      sku: 'BRG-22210',
      status: 'PUBLISHED',
      brandId: brand.id,
      categoryId: category.id,
    },
  });

  // Create draft product (unavailable)
  draftProd = await prisma.product.create({
    data: {
      name: 'Draft Concept Pump',
      slug: 'draft-concept-pump',
      sku: 'PUMP-DRAFT',
      status: 'DRAFT',
      brandId: brand.id,
      categoryId: category.id,
    },
  });

  // Create soft-deleted product
  deletedProd = await prisma.product.create({
    data: {
      name: 'Discontinued Bearing',
      slug: 'discontinued-bearing',
      sku: 'BRG-DISC',
      status: 'PUBLISHED',
      deletedAt: new Date(),
      brandId: brand.id,
      categoryId: category.id,
    },
  });
});

const basePayload = {
  name: 'Rajesh Kumar',
  email: 'rajesh.kumar@example.com',
  mobile: '+91 98765 43210',
  company: 'Kumar Engineering',
  message: 'Please send quotation with best prices and lead time.',
};

describe('Multi-Product Add-to-Quote Submission (POST /api/v1/public/enquiries)', () => {
  it('successfully submits quote with single product and quantity 1', async () => {
    const res = await api()
      .post('/api/v1/public/enquiries')
      .send({
        ...basePayload,
        items: [{ productId: prod1.id, quantity: 1 }],
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();

    const stored = await prisma.enquiry.findUniqueOrThrow({
      where: { id: res.body.data.id },
      include: { lineItems: true },
    });

    expect(stored.lineItems).toHaveLength(1);
    expect(stored.lineItems[0]).toMatchObject({
      productId: prod1.id,
      productIdRef: prod1.id,
      productName: prod1.name,
      sku: prod1.sku,
      quantity: 1,
    });
  });

  it('successfully submits quote with multiple products and quantities', async () => {
    const res = await api()
      .post('/api/v1/public/enquiries')
      .send({
        ...basePayload,
        items: [
          { productId: prod1.id, quantity: 4 },
          { productId: prod2.id, quantity: 12 },
        ],
      })
      .expect(201);

    expect(res.body.success).toBe(true);

    const stored = await prisma.enquiry.findUniqueOrThrow({
      where: { id: res.body.data.id },
      include: { lineItems: { orderBy: { sku: 'asc' } } },
    });

    expect(stored.lineItems).toHaveLength(2);
    expect(stored.lineItems[0]).toMatchObject({
      productId: prod2.id,
      productIdRef: prod2.id,
      sku: 'BRG-22210',
      productName: 'Spherical Roller Bearing 22210',
      quantity: 12,
    });
    expect(stored.lineItems[1]).toMatchObject({
      productId: prod1.id,
      productIdRef: prod1.id,
      sku: 'BRG-6205',
      productName: 'Deep Groove Ball Bearing 6205',
      quantity: 4,
    });
  });

  it('exposes line item quantities and snapshots in CRM enquiry detail', async () => {
    const submitRes = await api()
      .post('/api/v1/public/enquiries')
      .send({
        ...basePayload,
        items: [{ productId: prod1.id, quantity: 7 }],
      })
      .expect(201);

    const enquiryId = submitRes.body.data.id;

    const detailRes = await api().get(`/api/v1/enquiries/${enquiryId}`).set(admin.auth).expect(200);

    expect(detailRes.body.success).toBe(true);
    expect(detailRes.body.data.lineItems).toHaveLength(1);
    expect(detailRes.body.data.lineItems[0]).toMatchObject({
      productId: prod1.id,
      sku: prod1.sku,
      productName: prod1.name,
      quantity: 7,
    });
  });

  it('rejects quote submission with non-existent productId', async () => {
    const fakeId = randomUUID();
    const res = await api()
      .post('/api/v1/public/enquiries')
      .send({
        ...basePayload,
        items: [{ productId: fakeId, quantity: 2 }],
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(EnquiriesErrorCode.PRODUCT_NOT_FOUND);
  });

  it('rejects quote submission with soft-deleted product', async () => {
    const res = await api()
      .post('/api/v1/public/enquiries')
      .send({
        ...basePayload,
        items: [{ productId: deletedProd.id, quantity: 2 }],
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(EnquiriesErrorCode.PRODUCT_NOT_FOUND);
  });

  it('rejects quote submission with unpublished (DRAFT) product', async () => {
    const res = await api()
      .post('/api/v1/public/enquiries')
      .send({
        ...basePayload,
        items: [{ productId: draftProd.id, quantity: 2 }],
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(EnquiriesErrorCode.PRODUCT_UNAVAILABLE);
  });

  it.each([
    ['zero quantity', 0],
    ['negative quantity', -3],
    ['fractional quantity', 2.5],
  ])('rejects invalid quantity (%s)', async (_label, qty) => {
    const res = await api()
      .post('/api/v1/public/enquiries')
      .send({
        ...basePayload,
        items: [{ productId: prod1.id, quantity: qty }],
      })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('rejects duplicate products in quote items array with DUPLICATE_QUOTE_PRODUCT', async () => {
    const res = await api()
      .post('/api/v1/public/enquiries')
      .send({
        ...basePayload,
        items: [
          { productId: prod1.id, quantity: 2 },
          { productId: prod1.id, quantity: 5 },
        ],
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(EnquiriesErrorCode.DUPLICATE_PRODUCT);
  });

  it('guarantees atomic transaction rollback when one item in multi-item quote is invalid', async () => {
    const initialEnquiryCount = await prisma.enquiry.count();
    const initialLineItemCount = await prisma.enquiryLineItem.count();

    const fakeId = randomUUID();
    const res = await api()
      .post('/api/v1/public/enquiries')
      .send({
        ...basePayload,
        items: [
          { productId: prod1.id, quantity: 3 },
          { productId: fakeId, quantity: 1 },
        ],
      })
      .expect(400);

    expect(res.body.success).toBe(false);

    // Verify DB remains completely unchanged
    const afterEnquiryCount = await prisma.enquiry.count();
    const afterLineItemCount = await prisma.enquiryLineItem.count();
    expect(afterEnquiryCount).toBe(initialEnquiryCount);
    expect(afterLineItemCount).toBe(initialLineItemCount);
  });

  it('preserves backwards compatibility for existing lineItems structure', async () => {
    const res = await api()
      .post('/api/v1/public/enquiries')
      .send({
        ...basePayload,
        lineItems: [{ productId: 'custom-prod', sku: 'CUSTOM-10', productName: 'Custom Valve', quantity: 3 }],
      })
      .expect(201);

    expect(res.body.success).toBe(true);

    const stored = await prisma.enquiry.findUniqueOrThrow({
      where: { id: res.body.data.id },
      include: { lineItems: true },
    });

    expect(stored.lineItems).toHaveLength(1);
    expect(stored.lineItems[0]).toMatchObject({
      productId: 'custom-prod',
      productIdRef: null,
      sku: 'CUSTOM-10',
      productName: 'Custom Valve',
      quantity: 3,
    });
  });
});
