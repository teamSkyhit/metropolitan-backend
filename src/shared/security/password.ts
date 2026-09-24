import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../../config/env';

/**
 * Password policy for every password a user chooses or an admin sets.
 * bcrypt only uses the first 72 bytes, so longer inputs are rejected.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(64, 'Password must be at most 64 characters')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long')
  .refine((value) => /[A-Za-z]/.test(value), 'Password must contain a letter')
  .refine((value) => /\d/.test(value), 'Password must contain a digit')
  .meta({ description: '10-64 characters, at least one letter and one digit', example: 'Str0ngPassw0rd' });

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same time as a real password check. Call it when the user does not
 * exist, so response times do not reveal which emails are registered.
 */
export async function verifyAgainstDummyHash(plain: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  await bcrypt.compare(plain, await dummyHash);
}

/** Cryptographically random opaque token (e.g. refresh tokens). */
export function generateOpaqueToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

/** Tokens are stored hashed; a database leak does not expose usable tokens. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
