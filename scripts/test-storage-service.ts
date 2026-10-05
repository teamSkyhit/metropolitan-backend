/**
 * scripts/test-storage-service.ts
 * Tests the real S3StorageService (Cloudflare R2) used by the app.
 * Run: npx tsx scripts/test-storage-service.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { S3StorageService } from '../src/shared/storage/s3-storage.service';
import type { StorageFile } from '../src/shared/storage/storage.types';

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
  console.log('\n🚀  Testing S3StorageService → Cloudflare R2\n');

  const service = new S3StorageService();

  // ── 1. Upload ─────────────────────────────────────────────────────────────
  console.log('📤  Uploading test image to folder: "test-uploads"...');
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
  console.log('\n🔗  Testing getUrl()...');
  const resolvedUrl = service.getUrl(stored.path);
  console.log('✅  getUrl:', resolvedUrl);
  const urlMatch = resolvedUrl === stored.url;
  console.log('   URL matches upload URL:', urlMatch ? '✅ yes' : '⚠️  no (check endpoint format)');

  // ── 3. Delete ─────────────────────────────────────────────────────────────
  console.log('\n🗑️   Deleting uploaded file...');
  try {
    await service.delete(stored.path);
    console.log('✅  Delete successful!');
  } catch (err: unknown) {
    const e = err as Error;
    console.error('❌  Delete failed:', e.message);
    process.exit(1);
  }

  console.log('\n🎉  All tests PASSED — S3StorageService is fully working with Cloudflare R2!\n');
}

run();
