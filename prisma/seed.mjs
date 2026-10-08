/**
 * Creates the first Super Admin. Safe to run repeatedly: does nothing if a
 * Super Admin already exists. There is no public sign-up; every other user is
 * created by a Super Admin through the API.
 *
 * Plain ESM so it runs in the production Docker image with `node prisma/seed.mjs`
 * (no tsx / type-stripping / package.json "type" required):
 *
 *   SEED_SUPER_ADMIN_EMAIL=... SEED_SUPER_ADMIN_PASSWORD=... npm run db:seed
 *
 * Password policy matches the API: 10–64 chars, at least one letter and one digit.
 * Remove SEED_SUPER_ADMIN_PASSWORD from the environment after the first successful run.
 *
 * If no Super Admin exists and seed env vars are missing, the seed skips with a
 * warning and exit 0 so migrate/boot can continue — set the vars and redeploy.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const prisma = new PrismaClient();

const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(64, 'Password must be at most 64 characters')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long')
  .refine((value) => /[A-Za-z]/.test(value), 'Password must contain a letter')
  .refine((value) => /\d/.test(value), 'Password must contain a digit');

const seedEnv = z.object({
  SEED_SUPER_ADMIN_NAME: z.string().trim().min(2).max(100).default('Super Admin'),
  SEED_SUPER_ADMIN_EMAIL: z.email().trim().toLowerCase(),
  SEED_SUPER_ADMIN_PASSWORD: passwordSchema,
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
});

async function main() {
  const existing = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', deletedAt: null } });
  if (existing) {
    console.log(`A Super Admin already exists (${existing.email}). Nothing to do.`);
    return;
  }

  const emailSet = Boolean(process.env.SEED_SUPER_ADMIN_EMAIL?.trim());
  const passwordSet = Boolean(process.env.SEED_SUPER_ADMIN_PASSWORD?.trim());
  if (!emailSet || !passwordSet) {
    console.warn(
      'No Super Admin exists and SEED_SUPER_ADMIN_EMAIL / SEED_SUPER_ADMIN_PASSWORD are not set. Skipping seed so the API can start. Set those Railway variables (password min 10 chars) and redeploy to create the first Super Admin.'
    );
    return;
  }

  const parsed = seedEnv.safeParse(process.env);
  if (!parsed.success) {
    console.error('Cannot create the Super Admin. Fix these environment variables:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const { SEED_SUPER_ADMIN_NAME: name, SEED_SUPER_ADMIN_EMAIL: email, BCRYPT_ROUNDS } = parsed.data;
  const user = await prisma.user.create({
    data: {
      name,
      email,
      role: 'SUPER_ADMIN',
      passwordHash: await bcrypt.hash(parsed.data.SEED_SUPER_ADMIN_PASSWORD, BCRYPT_ROUNDS),
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
