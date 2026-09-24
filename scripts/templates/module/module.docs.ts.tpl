import {
  BEARER_AUTH,
  errorResponses,
  jsonResponse,
  paginatedBody,
  successBody,
  type OpenAPIRegistry,
} from '../../shared/docs/openapi';
import { idParamsSchema } from '../../shared/http';
import { __camel__Schema, list__Module__QuerySchema } from './__module__.schema';

export function register__Module__Docs(registry: OpenAPIRegistry): void {
  const tags = ['__Module__'];
  const security = [{ [BEARER_AUTH]: [] }];

  registry.registerPath({
    method: 'get',
    path: '/__module__',
    tags,
    security,
    summary: 'List __module__',
    request: { query: list__Module__QuerySchema },
    responses: {
      200: jsonResponse('Paginated list', paginatedBody(__camel__Schema)),
      ...errorResponses(400, 401, 403),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/__module__/{id}',
    tags,
    security,
    summary: 'Get one of __module__ by id',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Found', successBody(__camel__Schema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });
}
