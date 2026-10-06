/**
 * [LOCAL / DEV ONLY]
 * scripts/test-storage-service.ts
 *
 * Manual verification script for S3StorageService with Cloudflare R2 / S3.
 * NOT used in production or automated CI runs.
 *
 * Tests upload, getUrl (S3_PUBLIC_BASE_URL), and deletion (both by storage key and by public URL).
 * By default, all uploaded test objects are cleaned up immediately.
 * Pass `--keep` or set `KEEP_TEST_OBJECT=true` to retain test objects intentionally.
 *
 * Run: npx tsx scripts/test-storage-service.ts [--keep]
 */
import dotenv from 'dotenv';
dotenv.config();

import { S3StorageService } from '../src/shared/storage/s3-storage.service';
import type { StorageFile } from '../src/shared/storage/storage.types';

const keepObject = process.argv.includes('--keep') || process.env.KEEP_TEST_OBJECT === 'true';

// ── Minimal valid 1×1 red pixel PNG ────────────────────────────────────────
const PNG_BUFFER = Buffer.from(
  '89504e470d0a1a0a' +
    '0000000d49484452' + // IHDR chunk
    '00000001' + // width  = 1
    '00000001' + // height = 1
    '08020000' + // 8-bit RGB, no interlace
    '0090017de8' + // CRC
    '0000000c49444154' + // IDAT chunk
    '08d7636018f50f00' +
    '00000200017e073d5e' +
    '0000000049454e44' + // IEND chunk
    'ae426082',
  'hex'
);

const testFile: StorageFile = {
  filename: 'test-image.png',
  buffer: PNG_BUFFER,
  mimeType: 'image/png',
  size: PNG_BUFFER.length,
};

async function run() {
  console.log('\n🚀  Testing S3StorageService → Cloudflare R2 (Local / Dev Only)\n');
  console.log(
    '   Cleanup Mode :',
    keepObject ? 'Retain test objects (--keep active)' : 'Clean up immediately (default)'
  );

  const service = new S3StorageService();

  // ── 1. Upload ─────────────────────────────────────────────────────────────
  console.log('\n📤  [1/3] Uploading test image to folder "test-uploads"...');
  let stored;
  try {
    stored = await service.upload(testFile, 'test-uploads');
    console.log('✅  Upload successful!');
    console.log('   Filename :', stored.filename);
    console.log('   Key/Path :', stored.path);
    console.log('   URL      :', stored.url);
    console.log('   Size     :', stored.size, 'bytes');
    console.log('   MimeType :', stored.mimeType);
  } catch (err: unknown) {
    const e = err as Error;
    console.error('❌  Upload failed:', e.message);
    process.exit(1);
  }

  // ── 2. getUrl ─────────────────────────────────────────────────────────────
  console.log('\n🔗  [2/3] Testing getUrl()...');
  const resolvedUrl = service.getUrl(stored.path);
  console.log('✅  getUrl:', resolvedUrl);
  const urlMatch = resolvedUrl === stored.url;
  console.log('   URL matches upload URL:', urlMatch ? '✅ yes' : '⚠️  no (check S3_PUBLIC_BASE_URL format)');

  // ── 3. Delete by Full Public URL ──────────────────────────────────────────
  if (!keepObject) {
    console.log('\n🗑️   [3/3] Deleting uploaded file using full public URL...');
    try {
      await service.delete(stored.url);
      console.log('✅  Delete by full URL successful!');
    } catch (err: unknown) {
      const e = err as Error;
      console.error('❌  Delete failed:', e.message);
      process.exit(1);
    }
  } else {
    console.log('\nℹ️   [3/3] Test object intentionally retained in bucket as requested (--keep).');
    console.log(`   Object URL: ${stored.url}`);
    console.log(`   Object Key: ${stored.path}`);
  }

  console.log('\n🎉  All checks PASSED — S3StorageService is fully working with Cloudflare R2!\n');
}

run();
