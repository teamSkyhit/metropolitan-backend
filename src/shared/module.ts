import type { Router } from 'express';
import type { OpenAPIRegistry } from './docs/openapi';

/**
 * Contract every feature module exports from its `index.ts`.
 * Modules are mounted in src/routes/index.ts.
 */
export interface AppModule {
  /** Module name, used in logs and docs tags. */
  name: string;
  /** Mount path relative to the API root, e.g. '/enquiries'. */
  basePath: string;
  /** Authenticated CRM endpoints, mounted at /api/v1{basePath}. */
  router?: Router;
  /** Public website endpoints, mounted at /api/v1/public{basePath}. */
  publicRouter?: Router;
  /** Registers the module's OpenAPI paths. */
  registerDocs?: (registry: OpenAPIRegistry) => void;
}
