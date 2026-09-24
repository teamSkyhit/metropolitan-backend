import { Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';

export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Metro Industrial CRM API',
    version: '1.0.0',
    description: 'REST API documentation for Metro Industrial CRM Backend',
    contact: {
      name: 'Metro CRM Support',
    },
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API v1 Base Path',
    },
  ],
  tags: [
    {
      name: 'Health',
      description: 'System health and status endpoints',
    },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Check API and Database Health',
        description: 'Returns health status of the Metro CRM API and PostgreSQL database connectivity',
        responses: {
          '200': {
            description: 'API is running successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: {
                      type: 'boolean',
                      example: true,
                    },
                    message: {
                      type: 'string',
                      example: 'Metro CRM API is running',
                    },
                    database: {
                      type: 'string',
                      example: 'connected',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export const swaggerUiServe = swaggerUi.serve;
export const swaggerUiSetup = swaggerUi.setup(swaggerDocument, {
  customSiteTitle: 'Metro CRM API Docs',
});
