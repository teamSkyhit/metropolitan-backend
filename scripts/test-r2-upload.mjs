/* eslint-disable no-console */

/**
 * [LOCAL / DEV ONLY]
 * test-r2-upload.mjs
 *
 * Manual diagnostic script to verify Cloudflare R2 / S3 connectivity and operations.
 * NOT used in production or automated CI runs.
 *
 * Uploads a minimal test PNG to Cloudflare R2 and verifies reachability and upload.
 * By default, the uploaded test object is cleaned up immediately.
 * Pass `--keep` or set `KEEP_TEST_OBJECT=true` to retain the uploaded object intentionally.
 *
 * Run: node scripts/test-r2-upload.mjs [--keep]
 */

import { S3Client, PutObjectCommand, HeadBucketCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Load .env manually (no external dependency needed) ───────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
try {
  const envLines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of envLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^"|"$/g, '');
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
} catch {
  // .env may not exist if env vars are passed in process environment
}

// ── Configuration (aligns with app's S3_* env var names, with legacy fallback)
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
const S3_ENDPOINT = process.env.S3_ENDPOINT || process.env.R2_ENDPOINT;
const S3_BUCKET = process.env.S3_BUCKET || process.env.R2_BUCKET_NAME;
const S3_REGION = process.env.S3_REGION || process.env.R2_REGION || 'auto';
const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL;

const keepObject = process.argv.includes('--keep') || process.env.KEEP_TEST_OBJECT === 'true';

console.log('\n🔧  S3 / R2 Configuration (Local/Dev Only):');
console.log('   Endpoint        :', S3_ENDPOINT || '(not configured)');
console.log('   Bucket          :', S3_BUCKET || '(not configured)');
console.log('   Region          :', S3_REGION);
console.log('   Public Base URL :', S3_PUBLIC_BASE_URL || '(not configured)');
console.log(
  '   Access Key ID   :',
  S3_ACCESS_KEY_ID ? S3_ACCESS_KEY_ID.slice(0, 8) + '...' : '(not configured)'
);
console.log(
  '   Cleanup Mode    :',
  keepObject ? 'Retain test object (--keep active)' : 'Clean up immediately (default)'
);

if (!S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_ENDPOINT || !S3_BUCKET) {
  console.error(
    '\n❌ Missing required configuration: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT, S3_BUCKET.'
  );
  console.error('   Please check your .env configuration.\n');
  process.exit(1);
}

// ── Minimal 1x1 red pixel PNG ─────────────────────────────────────────────
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108020000' +
    '0090017de80000000c4944415408d7636018f50f0000000200017e07' +
    '3d5e0000000049454e44ae426082',
  'hex'
);

const key = `test-uploads/r2-test-${Date.now()}.png`;

// ── S3 Client ─────────────────────────────────────────────────────────────
const client = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: false,
});

async function run() {
  // 1. Check bucket reachability
  console.log('\n📡  Checking bucket connectivity...');
  try {
    await client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    console.log('✅  Bucket reachable!');
  } catch (err) {
    console.error('❌  Cannot reach bucket:', err.message);
    if (err.$metadata) console.error('   HTTP Status:', err.$metadata.httpStatusCode);
    process.exit(1);
  }

  // 2. Upload test image
  console.log(`\n📤  Uploading test image → ${key}`);
  try {
    const result = await client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: TINY_PNG,
        ContentType: 'image/png',
        Metadata: {
          'uploaded-by': 'r2-test-script',
          timestamp: new Date().toISOString(),
        },
      })
    );
    console.log('✅  Upload successful!');
    console.log('   ETag       :', result.ETag);
    console.log('   Object Key :', key);
    if (S3_PUBLIC_BASE_URL) {
      console.log('   Public URL :', `${S3_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${key}`);
    }
  } catch (err) {
    console.error('❌  Upload failed:', err.message);
    if (err.$metadata) {
      console.error('   HTTP Status:', err.$metadata.httpStatusCode);
      console.error('   Request ID :', err.$metadata.requestId);
    }
    process.exit(1);
  }

  // 3. Clean up test object (default)
  if (!keepObject) {
    console.log('\n🧹  Cleaning up test object from bucket...');
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
        })
      );
      console.log('✅  Test object successfully deleted.');
    } catch (err) {
      console.warn('⚠️  Could not clean up test object:', err.message);
    }
  } else {
    console.log('\nℹ️   Test object intentionally retained in bucket as requested (--keep).');
    console.log(`   Key: ${key}`);
  }

  console.log('\n🎉  Test PASSED — Cloudflare R2 is working correctly!\n');
}

run();
