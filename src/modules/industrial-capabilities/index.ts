import type { AppModule } from '../../shared/module';
import { registerIndustrialCapabilitiesDocs } from './industrial-capabilities.docs';
import {
  industrialCapabilitiesPublicRouter,
  industrialCapabilitiesRouter,
} from './industrial-capabilities.routes';

export const industrialCapabilitiesModule: AppModule = {
  name: 'industrial-capabilities',
  basePath: '/industrial-capabilities',
  router: industrialCapabilitiesRouter,
  publicRouter: industrialCapabilitiesPublicRouter,
  registerDocs: registerIndustrialCapabilitiesDocs,
};

// Public API for other modules.
export {
  industrialCapabilitiesService,
  toIndustrialCapabilityDto,
  toPublicSegmentDto,
} from './industrial-capabilities.service';
export type { IndustrialCapabilityRecord } from './industrial-capabilities.repository';
export {
  IndustrialCapabilitiesErrorCode,
  industrialCapabilitySchema,
  publicIndustrialCapabilitySegmentSchema,
  industrialCapabilitySectionSettingsSchema,
  publicIndustrialCapabilitiesDataSchema,
  createIndustrialCapabilityBodySchema,
  updateIndustrialCapabilityBodySchema,
  reorderIndustrialCapabilitiesBodySchema,
  listIndustrialCapabilitiesQuerySchema,
  type IndustrialCapabilityDto,
  type PublicIndustrialCapabilitySegmentDto,
  type IndustrialCapabilitySectionSettingsDto,
  type PublicIndustrialCapabilitiesDataDto,
  type CreateIndustrialCapabilityBody,
  type UpdateIndustrialCapabilityBody,
  type ReorderIndustrialCapabilitiesBody,
  type ListIndustrialCapabilitiesQuery,
} from './industrial-capabilities.schema';
