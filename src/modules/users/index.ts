import type { AppModule } from '../../shared/module';
import { registerUsersDocs } from './users.docs';
import { usersRouter } from './users.routes';

export const usersModule: AppModule = {
  name: 'users',
  basePath: '/users',
  router: usersRouter,
  registerDocs: registerUsersDocs,
};

// Public API for other modules.
export { usersService, toUserDto } from './users.service';
export type { UserRecord } from './users.repository';
export { userSchema, type UserDto } from './users.schema';
