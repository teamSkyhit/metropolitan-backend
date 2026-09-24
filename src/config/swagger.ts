import { Router } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { createRegistry, generateDocument } from '../shared/docs/openapi';
import type { AppModule } from '../shared/module';

/** Builds `/api/docs` (Swagger UI) and `/api/docs.json` from the modules' registered docs. */
export function createDocsRouter(modules: readonly AppModule[]): Router {
  const registry = createRegistry();
  for (const module of modules) module.registerDocs?.(registry);
  const document = generateDocument(registry);

  const router = Router();
  router.get('/docs.json', (_req, res) => {
    res.json(document);
  });
  router.use(
    '/docs',
    // Swagger UI needs inline scripts/styles, so relax CSP for the docs page only.
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(document, { customSiteTitle: 'Metro CRM API Docs' })
  );
  return router;
}
