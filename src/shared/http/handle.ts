import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import { AppError, formatZodIssues, type FieldIssue } from '../errors';

export interface RequestSchemas {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
}

type Output<S, Fallback> = S extends z.ZodType ? z.output<S> : Fallback;

/** An Express request whose params / query / body are the parsed outputs of the given schemas. */
export type ValidatedRequest<S extends RequestSchemas> = Omit<Request, 'params' | 'query' | 'body'> & {
  params: Output<S['params'], Record<string, string>>;
  query: Output<S['query'], Record<string, unknown>>;
  body: Output<S['body'], unknown>;
};

const PARTS = ['params', 'query', 'body'] as const;

function validationMiddleware(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    const issues: FieldIssue[] = [];

    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        // Express 5 exposes `req.query` as a getter, so shadow it with an own property.
        Object.defineProperty(req, part, {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } else {
        issues.push(
          ...formatZodIssues(result.error.issues).map((issue) => ({
            ...issue,
            field: issue.field ? `${part}.${issue.field}` : part,
          }))
        );
      }
    }

    if (issues.length > 0) throw AppError.validation(issues);
    next();
  };
}

/**
 * Declares a controller action together with the schemas for its input.
 *
 * The returned value is a `[validate, handler]` pair that can be passed
 * straight to a router, so validation can never be forgotten and the
 * handler's `req.params` / `req.query` / `req.body` are fully typed.
 *
 * @example
 * export const getUser = handle({ params: idParamsSchema }, async (req, res) => {
 *   sendSuccess(res, await usersService.getById(req.params.id));
 * });
 */
export function handle<S extends RequestSchemas>(
  schemas: S,
  handler: (req: ValidatedRequest<S>, res: Response, next: NextFunction) => Promise<void> | void
): RequestHandler[] {
  return [validationMiddleware(schemas), handler as unknown as RequestHandler];
}
