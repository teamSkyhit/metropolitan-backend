import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import { swaggerUiServe, swaggerUiSetup } from './config/swagger';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

const app: Application = express();

// Security and standard middlewares
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows Swagger UI assets to load without inline restriction conflicts
  })
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger Documentation UI
app.use('/api/docs', swaggerUiServe, swaggerUiSetup);

// API v1 Routes
app.use('/api/v1', routes);

// 404 Route Handler
app.use(notFoundHandler);

// Global Error Handler
app.use(errorHandler);

export default app;
