import { errorResponses, jsonResponse, successBody, type OpenAPIRegistry } from '../../shared/docs/openapi';
import { livenessSchema, readinessSchema } from './health.schema';

export function registerHealthDocs(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/health',
    tags: ['Health'],
    summary: 'Liveness probe',
    responses: { 200: jsonResponse('API process is running', successBody(livenessSchema)) },
  });

  registry.registerPath({
    method: 'get',
    path: '/health/ready',
    tags: ['Health'],
    summary: 'Readiness probe (checks the database)',
    responses: {
      200: jsonResponse('All dependencies are reachable', successBody(readinessSchema)),
      ...errorResponses(503),
    },
  });
}
