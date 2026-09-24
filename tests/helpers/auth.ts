import { randomUUID } from 'node:crypto';
import type { Role, User } from '@prisma/client';
import { hashPassword } from '../../src/shared/security/password';
import { api } from './app';
import { prisma } from './db';

export const DEFAULT_PASSWORD = 'Passw0rdForTests';

export async function createUser(
  overrides: Partial<
    Pick<User, 'name' | 'email' | 'role' | 'isActive' | 'mustChangePassword' | 'deletedAt'>
  > & {
    password?: string;
  } = {}
): Promise<User> {
  const { password = DEFAULT_PASSWORD, ...data } = overrides;
  return prisma.user.create({
    data: {
      name: 'Test User',
      email: `user-${randomUUID()}@metro.test`,
      role: 'SALES_MANAGER',
      ...data,
      passwordHash: await hashPassword(password),
    },
  });
}

export interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
  auth: { Authorization: string };
}

/** Creates a user with the given role and signs in through the API. */
export async function signInAs(
  role: Role,
  overrides: Parameters<typeof createUser>[0] = {}
): Promise<Session> {
  const user = await createUser({ role, ...overrides });
  const res = await api()
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: overrides.password ?? DEFAULT_PASSWORD })
    .expect(200);
  const { accessToken, refreshToken } = res.body.data.tokens;
  return { user, accessToken, refreshToken, auth: { Authorization: `Bearer ${accessToken}` } };
}
