import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../../config/env';
import { AppError } from '../errors';
import type { IStorageService, StorageFile, StoredFile } from './storage.types';

/**
 * S3-compatible Storage Provider — wired for Cloudflare R2.
 *
 * Uses @aws-sdk/client-s3 with forcePathStyle=false which is required by R2.
 * Falls back gracefully with a descriptive error when credentials are missing.
 */
export class S3StorageService implements IStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor() {
    const bucket = config.S3_BUCKET;
    const endpoint = config.S3_ENDPOINT;
    const accessKeyId = config.S3_ACCESS_KEY_ID;
    const secretAccessKey = config.S3_SECRET_ACCESS_KEY;

    if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
      throw AppError.serviceUnavailable(
        'S3 storage is not fully configured. Check S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.'
      );
    }

    this.bucket = bucket;
    this.endpoint = endpoint;

    this.client = new S3Client({
      region: config.S3_REGION,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      // Cloudflare R2 requires virtual-hosted style (forcePathStyle=false)
      forcePathStyle: false,
    });
  }

  async upload(file: StorageFile, folder = 'general'): Promise<StoredFile> {
    const ext = path.extname(file.filename) || '.bin';
    const filename = `${randomUUID()}${ext}`;
    const key = `${folder}/${filename}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimeType,
        ContentLength: file.size,
      })
    );

    return {
      filename,
      url: this.getUrl(key),
      path: key,
      size: file.size,
      mimeType: file.mimeType,
    };
  }

  async delete(filePathOrUrl: string): Promise<void> {
    // Accept either a full URL or a raw object key
    let key = filePathOrUrl;
    if (filePathOrUrl.startsWith('http')) {
      try {
        const url = new URL(filePathOrUrl);
        key = url.pathname.replace(/^\//, '');
      } catch {
        // fall through — use as-is
      }
    }

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  getUrl(key: string): string {
    const cleanKey = key.replace(/^[/\\]+/, '');
    // R2 public URL format: <endpoint>/<bucket>/<key>
    return `${this.endpoint}/${this.bucket}/${cleanKey}`;
  }
}
