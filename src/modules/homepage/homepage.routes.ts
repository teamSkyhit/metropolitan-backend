import { Router } from 'express';
import { authenticate, authorize } from '../../middleware';
import { Permission } from '../../shared/security/permissions';
import { homepageController } from './homepage.controller';

export const homepageRouter = Router();

// CRM management routes require JWT authentication
homepageRouter.use(authenticate());

homepageRouter.get('/sections', authorize(Permission.HOMEPAGE_READ), homepageController.list);

// Reorder must be mounted before /sections/:id to prevent matching 'reorder' as a UUID
homepageRouter.patch('/sections/reorder', authorize(Permission.HOMEPAGE_UPDATE), homepageController.reorder);

homepageRouter.get('/sections/:id', authorize(Permission.HOMEPAGE_READ), homepageController.getById);

homepageRouter.post('/sections', authorize(Permission.HOMEPAGE_CREATE), homepageController.create);

homepageRouter.patch('/sections/:id', authorize(Permission.HOMEPAGE_UPDATE), homepageController.update);

homepageRouter.delete('/sections/:id', authorize(Permission.HOMEPAGE_DELETE), homepageController.delete);

// Public read-only router
export const homepagePublicRouter = Router();

homepagePublicRouter.get('/', homepageController.getPublicHomepage);
