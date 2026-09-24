import type { Response } from 'express';
import type { PaginationMeta } from './pagination';

/**
 * Every successful response has the shape `{ success: true, data, meta? }`.
 * Every error has the shape `{ success: false, error: { code, message, details?, requestId } }`
 * (produced by the error middleware). Controllers must use these helpers and
 * never call `res.json` directly.
 */
export interface SuccessBody<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  options: { status?: number; meta?: Record<string, unknown> } = {}
): void {
  const body: SuccessBody<T> = { success: true, data };
  if (options.meta) body.meta = options.meta;
  res.status(options.status ?? 200).json(body);
}

export function sendCreated<T>(res: Response, data: T): void {
  sendSuccess(res, data, { status: 201 });
}

export function sendPaginated<T>(res: Response, items: T[], pagination: PaginationMeta): void {
  sendSuccess(res, items, { meta: { pagination } });
}

export function sendNoContent(res: Response): void {
  res.status(204).end();
}
