import { Router } from 'express';
import healthRoutes from '../modules/health/health.routes';

const router = Router();

// Mount modules
router.use('/health', healthRoutes);

export default router;
