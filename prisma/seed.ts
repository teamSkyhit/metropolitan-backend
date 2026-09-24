/**
 * Creates the first Super Admin. Safe to run repeatedly: does nothing if a
 * Super Admin already exists. There is no public sign-up; every other user is
 * created by a Super Admin through the API.
 *
 *   SEED_SUPER_ADMIN_EMAIL=... SEED_SUPER_ADMIN_PASSWORD=... npm run db:seed
 *
 * Remove SEED_SUPER_ADMIN_PASSWORD from the environment after the first run.
 */
import { z } from 'zod';
import { prisma } from '../src/config/database';
import { hashPassword, passwordSchema } from '../src/shared/security/password';

const seedEnv = z.object({
  SEED_SUPER_ADMIN_NAME: z.string().trim().min(2).max(100).default('Super Admin'),
  SEED_SUPER_ADMIN_EMAIL: z.email().trim().toLowerCase(),
  SEED_SUPER_ADMIN_PASSWORD: passwordSchema,
});

async function main(): Promise<void> {
  const existing = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', deletedAt: null } });
  if (existing) {
    console.log(`A Super Admin already exists (${existing.email}). Nothing to do.`);
    return;
  }

  const parsed = seedEnv.safeParse(process.env);
  if (!parsed.success) {
    console.error('Cannot create the Super Admin. Fix these environment variables:');
    for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    process.exitCode = 1;
    return;
  }

  const { SEED_SUPER_ADMIN_NAME: name, SEED_SUPER_ADMIN_EMAIL: email } = parsed.data;
  const user = await prisma.user.create({
    data: {
      name,
      email,
      role: 'SUPER_ADMIN',
      passwordHash: await hashPassword(parsed.data.SEED_SUPER_ADMIN_PASSWORD),
    },
  });
  console.log(`Super Admin created: ${user.email} (${user.id})`);
}

main()
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
