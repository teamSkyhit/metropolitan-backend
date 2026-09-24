import { Router } from 'express';
import { healthController } from './health.controller';

export const healthRouter = Router();

/** Liveness: the process is up. Never touches dependencies. */
healthRouter.get('/', healthController.liveness);

/** Readiness: dependencies (database) are reachable. Returns 503 otherwise. */
healthRouter.get('/ready', healthController.readiness);
