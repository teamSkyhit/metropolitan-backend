import { Router } from 'express';
import { authenticate, authorize } from '../../middleware';
import { Permission } from '../../shared/security/permissions';
import { requireFileUpload, UPLOAD_LIMITS } from '../../shared/storage';
import { industrialCapabilitiesController } from './industrial-capabilities.controller';

export const industrialCapabilitiesRouter = Router();

// ── Authenticated CRM Endpoints (/api/v1/industrial-capabilities) ────────────

industrialCapabilitiesRouter.use(authenticate());

// Static routes before parameterized :id
industrialCapabilitiesRouter.get(
  '/',
  authorize(Permission.INDUSTRIAL_CAPABILITIES_READ),
  industrialCapabilitiesController.list
);
industrialCapabilitiesRouter.post(
  '/',
  authorize(Permission.INDUSTRIAL_CAPABILITIES_CREATE),
  industrialCapabilitiesController.create
);
industrialCapabilitiesRouter.get(
  '/settings',
  authorize(Permission.INDUSTRIAL_CAPABILITIES_READ),
  industrialCapabilitiesController.getSettings
);
industrialCapabilitiesRouter.patch(
  '/settings',
  authorize(Permission.INDUSTRIAL_CAPABILITIES_UPDATE),
  industrialCapabilitiesController.updateSettings
);
industrialCapabilitiesRouter.patch(
  '/reorder',
  authorize(Permission.INDUSTRIAL_CAPABILITIES_UPDATE),
  industrialCapabilitiesController.reorder
);

// Parameterized routes
industrialCapabilitiesRouter.get(
  '/:id',
  authorize(Permission.INDUSTRIAL_CAPABILITIES_READ),
  industrialCapabilitiesController.getById
);
industrialCapabilitiesRouter.patch(
  '/:id',
  authorize(Permission.INDUSTRIAL_CAPABILITIES_UPDATE),
  industrialCapabilitiesController.update
);
industrialCapabilitiesRouter.delete(
  '/:id',
  authorize(Permission.INDUSTRIAL_CAPABILITIES_DELETE),
  industrialCapabilitiesController.remove
);

// Image upload and removal
industrialCapabilitiesRouter.post(
  '/:id/image',
  authorize(Permission.INDUSTRIAL_CAPABILITIES_UPDATE),
  requireFileUpload({
    maxBytes: UPLOAD_LIMITS.PRODUCT_IMAGE_MAX_BYTES,
    fieldName: 'image',
    entityName: 'Capability image',
  }),
  industrialCapabilitiesController.uploadImage
);
industrialCapabilitiesRouter.put(
  '/:id/image',
  authorize(Permission.INDUSTRIAL_CAPABILITIES_UPDATE),
  requireFileUpload({
    maxBytes: UPLOAD_LIMITS.PRODUCT_IMAGE_MAX_BYTES,
    fieldName: 'image',
    entityName: 'Capability image',
  }),
  industrialCapabilitiesController.uploadImage
);
industrialCapabilitiesRouter.delete(
  '/:id/image',
  authorize(Permission.INDUSTRIAL_CAPABILITIES_UPDATE),
  industrialCapabilitiesController.removeImage
);

// ── Public Website Endpoints (/api/v1/public/industrial-capabilities) ────────

export const industrialCapabilitiesPublicRouter = Router();

industrialCapabilitiesPublicRouter.get('/', industrialCapabilitiesController.getPublic);
