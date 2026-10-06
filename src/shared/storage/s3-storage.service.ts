import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../../config/env';
import { AppError } from '../errors';
import type { IStorageService, StorageFile, StoredFile } from './storage.types';

export interface S3StorageServiceOptions {
  bucket?: string;
  endpoint?: string;
  region?: string;
  publicBaseUrl?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  client?: S3Client;
}

/**
 * S3-compatible Storage Provider — wired for Cloudflare R2 and S3-compatible object storage.
 *
 * Uses @aws-sdk/client-s3 with forcePathStyle=false which is required by Cloudflare R2.
 * Serves public URLs from S3_PUBLIC_BASE_URL (never S3_ENDPOINT).
 * Sanitizes upload folders and handles delete() with either raw storage keys or full URLs.
 */
export class S3StorageService implements IStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly publicBaseUrl: string;

  constructor(options?: S3StorageServiceOptions) {
    const bucket = options?.bucket ?? config.S3_BUCKET;
    const endpoint = options?.endpoint ?? config.S3_ENDPOINT;
    const region = options?.region ?? config.S3_REGION ?? 'auto';
    const publicBaseUrl = options?.publicBaseUrl ?? config.S3_PUBLIC_BASE_URL;
    const accessKeyId = options?.accessKeyId ?? config.S3_ACCESS_KEY_ID;
    const secretAccessKey = options?.secretAccessKey ?? config.S3_SECRET_ACCESS_KEY;

    if (!bucket || !endpoint || !publicBaseUrl || !accessKeyId || !secretAccessKey) {
      throw AppError.serviceUnavailable(
        'S3 storage is not fully configured. Check S3_BUCKET, S3_ENDPOINT, S3_PUBLIC_BASE_URL, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.'
      );
    }

    this.bucket = bucket;
    this.endpoint = endpoint.replace(/\/+$/, '');
    this.publicBaseUrl = publicBaseUrl.replace(/\/+$/, '');

    this.client =
      options?.client ??
      new S3Client({
        region,
        endpoint: this.endpoint,
        credentials: { accessKeyId, secretAccessKey },
        // Cloudflare R2 requires virtual-hosted style (forcePathStyle=false)
        forcePathStyle: false,
      });
  }

  /**
   * Sanitizes folder destinations to match LocalStorageService security rules:
   * rejects traversal (..), absolute paths, and leading slashes.
   */
  private sanitizeFolder(folder: string): string {
    if (!folder || folder.trim() === '') {
      return '';
    }

    // Disallow absolute paths (POSIX / or Windows C:\ or \\)
    if (path.isAbsolute(folder) || folder.startsWith('/') || folder.startsWith('\\')) {
      throw new Error('Invalid upload folder destination');
    }

    const normalized = path.posix.normalize(folder.replace(/\\/g, '/')).replace(/^\/+/, '');

    if (
      normalized === '..' ||
      normalized.startsWith('../') ||
      normalized.includes('/../') ||
      normalized.endsWith('/..')
    ) {
      throw new Error('Invalid upload folder destination');
    }

    return normalized === '.' ? '' : normalized;
  }

  /**
   * Derives a clean object key from either a storage key or a full public/endpoint URL.
   * Strips public base URL, endpoint prefixes, and bucket name prefixes.
   * Rejects path traversals and empty keys by returning null.
   */
  private extractKey(filePathOrUrl: string): string | null {
    if (!filePathOrUrl || typeof filePathOrUrl !== 'string') {
      return null;
    }

    const trimmed = filePathOrUrl.trim();
    if (!trimmed) {
      return null;
    }

    // Check for directory traversal sequences in the raw or percent-encoded input
    const decodedRaw = (() => {
      try {
        return decodeURIComponent(trimmed);
      } catch {
        return trimmed;
      }
    })();
    const normalizedRaw = decodedRaw.replace(/\\/g, '/');
    if (
      normalizedRaw === '..' ||
      normalizedRaw.startsWith('../') ||
      normalizedRaw.includes('/../') ||
      normalizedRaw.endsWith('/..')
    ) {
      return null;
    }

    let key = trimmed;

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const parsedUrl = new URL(trimmed);
        key = parsedUrl.pathname;

        try {
          const publicUrlObj = new URL(this.publicBaseUrl);
          if (
            parsedUrl.origin.toLowerCase() === publicUrlObj.origin.toLowerCase() &&
            parsedUrl.pathname.startsWith(publicUrlObj.pathname)
          ) {
            key = parsedUrl.pathname.slice(publicUrlObj.pathname.length);
          }
        } catch {
          if (this.publicBaseUrl.startsWith('/') && parsedUrl.pathname.startsWith(this.publicBaseUrl)) {
            key = parsedUrl.pathname.slice(this.publicBaseUrl.length);
          }
        }
      } catch {
        key = trimmed;
      }
    }

    // Decode URL component if encoded (e.g. %20 -> space)
    try {
      key = decodeURIComponent(key);
    } catch {
      // Keep key as-is if decoding fails
    }

    // Normalize backslashes to forward slashes and strip leading slashes
    key = key.replace(/\\/g, '/').replace(/^\/+/, '');

    // Strip bucket prefix if present at start of key (e.g. "metropolitan-media/<key>")
    if (this.bucket) {
      const bucketPrefix = `${this.bucket}/`;
      if (key.startsWith(bucketPrefix)) {
        key = key.slice(bucketPrefix.length);
      } else if (key === this.bucket) {
        return null;
      }
    }

    // Strip leading slashes again after bucket stripping
    key = key.replace(/^\/+/, '');

    if (!key) {
      return null;
    }

    // Containment & directory traversal checks matching local storage security rules
    const normalized = path.posix.normalize(key).replace(/^\/+/, '');

    if (
      normalized === '' ||
      normalized === '.' ||
      normalized === '..' ||
      normalized.startsWith('../') ||
      normalized.includes('/../') ||
      normalized.endsWith('/..')
    ) {
      return null;
    }

    return normalized;
  }

  async upload(file: StorageFile, folder = 'general'): Promise<StoredFile> {
    const safeFolder = this.sanitizeFolder(folder);
    const ext = path.extname(file.filename) || '.bin';
    const filename = `${randomUUID()}${ext}`;
    const key = safeFolder ? `${safeFolder}/${filename}` : filename;

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
    const key = this.extractKey(filePathOrUrl);
    if (!key) {
      return;
    }

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  getUrl(key: string): string {
    const cleanKey = key.replace(/\\/g, '/').replace(/^\/+/, '');
    return `${this.publicBaseUrl}/${cleanKey}`;
  }
}
