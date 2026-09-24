import type { AppModule } from '../../shared/module';
import { register__Module__Docs } from './__module__.docs';
import { __camel__Router } from './__module__.routes';

export const __camel__Module: AppModule = {
  name: '__module__',
  basePath: '/__module__',
  router: __camel__Router,
  registerDocs: register__Module__Docs,
};
