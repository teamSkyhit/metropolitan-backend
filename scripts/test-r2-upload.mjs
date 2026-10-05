/* eslint-disable no-console */

/**
 * test-r2-upload.mjs
 * Quick test: uploads a small PNG to Cloudflare R2 and prints the public URL.
 * Run: node scripts/test-r2-upload.mjs
 */

import { S3Client, PutObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Load .env manually (no dotenv needed) ──────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
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
  process.env[key] = val;
}

// ── Config ─────────────────────────────────────────────────────────────────
const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME, R2_REGION } = process.env;

console.log('\n🔧  R2 Config:');
console.log('   Endpoint  :', R2_ENDPOINT);
console.log('   Bucket    :', R2_BUCKET_NAME);
console.log('   Region    :', R2_REGION);
console.log('   Key ID    :', R2_ACCESS_KEY_ID?.slice(0, 8) + '...');

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
  region: R2_REGION || 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: false,
});

async function run() {
  // 1. Check bucket reachability
  console.log('\n📡  Checking bucket connectivity...');
  try {
    await client.send(new HeadBucketCommand({ Bucket: R2_BUCKET_NAME }));
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
        Bucket: R2_BUCKET_NAME,
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
    console.log('   ETag      :', result.ETag);
    console.log('   Object Key:', key);
    console.log('\n🎉  Test PASSED — Cloudflare R2 is working correctly!\n');
  } catch (err) {
    console.error('❌  Upload failed:', err.message);
    if (err.$metadata) {
      console.error('   HTTP Status:', err.$metadata.httpStatusCode);
      console.error('   Request ID :', err.$metadata.requestId);
    }
    process.exit(1);
  }
}

run();
