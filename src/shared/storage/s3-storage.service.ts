import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { config } from '../../config/env';
import { AppError } from '../errors';
import type { IStorageService, StorageFile, StoredFile } from './storage.types';

/**
 * S3 Storage Provider implementation.
 *
 * NOTE: Client S3 bucket approval and credentials are currently pending.
 * This class provides the production abstraction ready to integrate with AWS SDK / S3-compatible APIs.
 */
export class S3StorageService implements IStorageService {
  private bucket?: string;
  private region: string;
  private endpoint?: string;

  constructor() {
    this.bucket = config.S3_BUCKET;
    this.region = config.S3_REGION;
    this.endpoint = config.S3_ENDPOINT;
  }

  private ensureConfigured(): void {
    if (!this.bucket || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) {
      throw AppError.serviceUnavailable(
        'S3 storage is not configured yet (client credentials pending approval). Use local storage driver.'
      );
    }
  }

  async upload(file: StorageFile, folder = 'general'): Promise<StoredFile> {
    this.ensureConfigured();
    const ext = path.extname(file.filename) || '.bin';
    const filename = `${randomUUID()}${ext}`;
    const key = `${folder}/${filename}`;

    // AWS SDK PutObjectCommand will be executed here once credentials are provided
    const url = this.endpoint
      ? `${this.endpoint}/${this.bucket}/${key}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    return {
      filename,
      url,
      path: key,
      size: file.size,
      mimeType: file.mimeType,
    };
  }

  async delete(_filePathOrUrl: string): Promise<void> {
    this.ensureConfigured();
    // AWS SDK DeleteObjectCommand will be executed here once credentials are provided
  }

  getUrl(key: string): string {
    const cleanKey = key.replace(/^[/\\]+/, '');
    return this.endpoint
      ? `${this.endpoint}/${this.bucket}/${cleanKey}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${cleanKey}`;
  }
}
