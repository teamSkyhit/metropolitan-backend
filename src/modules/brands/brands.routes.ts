import { Router } from 'express';
import { authenticate, authorize } from '../../middleware';
import { Permission } from '../../shared/security/permissions';
import { brandsController } from './brands.controller';

export const brandsRouter = Router();

brandsRouter.use(authenticate());

brandsRouter.get('/', authorize(Permission.BRANDS_READ), brandsController.list);
brandsRouter.post('/', authorize(Permission.BRANDS_CREATE), brandsController.create);
brandsRouter.get('/:id', authorize(Permission.BRANDS_READ), brandsController.getById);
brandsRouter.patch('/:id', authorize(Permission.BRANDS_UPDATE), brandsController.update);
brandsRouter.delete('/:id', authorize(Permission.BRANDS_DELETE), brandsController.remove);
