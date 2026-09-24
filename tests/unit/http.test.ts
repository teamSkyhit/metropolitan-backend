import express from 'express';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../../src/middleware';
import {
  buildPaginationMeta,
  dateRangeQuerySchema,
  handle,
  idParamsSchema,
  paginationQuerySchema,
  sendSuccess,
  toDateRangeFilter,
  toSkipTake,
} from '../../src/shared/http';

function appWith(...handlers: express.RequestHandler[][]) {
  const app = express();
  app.use(express.json());
  app.post('/items/:id', ...handlers);
  app.use(errorHandler);
  return supertest(app);
}

describe('handle()', () => {
  const action = handle(
    {
      params: idParamsSchema,
      query: paginationQuerySchema,
      body: z.object({ name: z.string().trim().min(1) }),
    },
    (req, res) => {
      sendSuccess(res, { id: req.params.id, page: req.query.page, name: req.body.name });
    }
  );
  const id = '6f1c2f3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

  it('passes parsed, coerced and defaulted input to the handler', async () => {
    const res = await appWith(action).post(`/items/${id}?page=3`).send({ name: '  Pump  ' }).expect(200);

    expect(res.body.data).toEqual({ id, page: 3, name: 'Pump' });
  });

  it('reports every invalid field with its location', async () => {
    const res = await appWith(action).post('/items/not-a-uuid?page=0').send({}).expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual([
      'params.id',
      'query.page',
      'body.name',
    ]);
  });

  it('rejects non-string values instead of crashing', async () => {
    const res = await appWith(action)
      .post(`/items/${id}`)
      .send({ name: { $ne: 'x' } })
      .expect(400);

    expect(res.body.error.details[0].field).toBe('body.name');
  });
});

describe('pagination helpers', () => {
  it('computes skip/take and metadata', () => {
    expect(toSkipTake({ page: 3, limit: 20 })).toEqual({ skip: 40, take: 20 });
    expect(buildPaginationMeta({ page: 2, limit: 10 }, 25)).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: true,
    });
    expect(buildPaginationMeta({ page: 1, limit: 10 }, 0).totalPages).toBe(1);
  });

  it('caps the page size', () => {
    expect(paginationQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});

describe('date range helpers', () => {
  it('rejects impossible calendar dates', () => {
    expect(dateRangeQuerySchema.safeParse({ from: '2026-02-31' }).success).toBe(false);
  });

  it('rejects inverted ranges', () => {
    expect(dateRangeQuerySchema.safeParse({ from: '2026-03-02', to: '2026-03-01' }).success).toBe(false);
  });

  it('builds an inclusive UTC filter', () => {
    expect(toDateRangeFilter({ from: '2026-01-01', to: '2026-01-31' })).toEqual({
      gte: new Date('2026-01-01T00:00:00.000Z'),
      lte: new Date('2026-01-31T23:59:59.999Z'),
    });
    expect(toDateRangeFilter({})).toBeUndefined();
  });
});
