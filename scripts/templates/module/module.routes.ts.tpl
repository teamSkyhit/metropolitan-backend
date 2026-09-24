import { Router } from 'express';
import { authenticate, authorize } from '../../middleware';
import { Permission } from '../../shared/security/permissions';
import { __camel__Controller } from './__module__.controller';

export const __camel__Router = Router();

__camel__Router.use(authenticate());

__camel__Router.get('/', authorize(Permission.__MODULE___READ), __camel__Controller.list);
__camel__Router.get('/:id', authorize(Permission.__MODULE___READ), __camel__Controller.getById);
