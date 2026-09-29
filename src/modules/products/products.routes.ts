import { Router } from 'express';
import { authenticate, authorize } from '../../middleware';
import { Permission } from '../../shared/security/permissions';
import { productsController } from './products.controller';

export const productsRouter = Router();

// ── Authenticated CRM Endpoints (/api/v1/products) ───────────────────────────

productsRouter.use(authenticate());

productsRouter.get('/', authorize(Permission.PRODUCTS_READ), productsController.list);
productsRouter.post('/', authorize(Permission.PRODUCTS_CREATE), productsController.create);
productsRouter.get('/:id', authorize(Permission.PRODUCTS_READ), productsController.getById);
productsRouter.patch('/:id', authorize(Permission.PRODUCTS_UPDATE), productsController.update);
productsRouter.delete('/:id', authorize(Permission.PRODUCTS_DELETE), productsController.remove);
productsRouter.post('/:id/restore', authorize(Permission.PRODUCTS_UPDATE), productsController.restore);
