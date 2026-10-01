import { Router } from 'express';
import { authenticate, authorize } from '../../middleware';
import { Permission } from '../../shared/security/permissions';
import { dashboardController } from './dashboard.controller';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate());
dashboardRouter.use(authorize(Permission.DASHBOARD_READ));

dashboardRouter.get('/summary', dashboardController.summary);
dashboardRouter.get('/trends', dashboardController.trends);
dashboardRouter.get('/recent-enquiries', dashboardController.recentEnquiries);
