import type { AppModule } from '../../shared/module';
import { registerMediaDocs } from './media.docs';
import { mediaRouter } from './media.routes';

export const mediaModule: AppModule = {
  name: 'media',
  basePath: '/media',
  router: mediaRouter,
  registerDocs: registerMediaDocs,
};

// Public API for other modules
export {
  mediaService,
  toMediaDto,
  registerMediaReferenceCheckers,
  type MediaReferenceChecker,
} from './media.service';
export { mediaRepository, type MediaRecord } from './media.repository';
export {
  MediaErrorCode,
  mediaSchema,
  listMediaQuerySchema,
  type MediaDto,
  type ListMediaQuery,
} from './media.schema';
