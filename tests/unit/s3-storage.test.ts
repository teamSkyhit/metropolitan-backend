import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type * as AwsS3 from '@aws-sdk/client-s3';
import { S3StorageService } from '../../src/shared/storage/s3-storage.service';
import type { StorageFile } from '../../src/shared/storage/storage.types';

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof AwsS3>();
  const MockS3Client = vi.fn();
  MockS3Client.prototype.send = vi.fn();
  return {
    ...actual,
    S3Client: MockS3Client,
  };
});

describe('S3StorageService', () => {
  const defaultOptions = {
    bucket: 'metropolitan-media',
    endpoint: 'https://test-account.r2.cloudflarestorage.com',
    region: 'auto',
    publicBaseUrl: 'https://pub-test123.r2.dev',
    accessKeyId: 'test-access-key-id',
    secretAccessKey: 'test-secret-access-key',
  };

  const sampleFile: StorageFile = {
    filename: 'photo.jpg',
    buffer: Buffer.from('test-image-binary-data'),
    mimeType: 'image/jpeg',
    size: 22,
  };

  let mockSend: ReturnType<typeof vi.fn>;

  function getCommand<T>(callIndex = 0): T {
    const call = mockSend.mock.calls[callIndex];
    if (!call) {
      throw new Error(`Expected mockSend call at index ${callIndex}`);
    }
    return call[0] as T;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockSend = vi.fn().mockResolvedValue({});
    (S3Client.prototype.send as unknown as ReturnType<typeof vi.fn>) = mockSend;
  });

  describe('Constructor & Configuration', () => {
    it('initializes successfully with valid options', () => {
      const service = new S3StorageService(defaultOptions);
      expect(service).toBeInstanceOf(S3StorageService);
    });

    it('throws AppError.serviceUnavailable if required configuration is missing', () => {
      const incomplete = { ...defaultOptions, bucket: undefined };
      expect(() => new S3StorageService(incomplete as unknown as typeof defaultOptions)).toThrow(
        /S3 storage is not fully configured/
      );
    });

    it('throws AppError.serviceUnavailable if publicBaseUrl is missing', () => {
      const incomplete = { ...defaultOptions, publicBaseUrl: undefined };
      expect(() => new S3StorageService(incomplete as unknown as typeof defaultOptions)).toThrow(
        /S3 storage is not fully configured/
      );
    });

    it('throws AppError.serviceUnavailable if credentials are missing', () => {
      const incomplete = { ...defaultOptions, accessKeyId: undefined };
      expect(() => new S3StorageService(incomplete as unknown as typeof defaultOptions)).toThrow(
        /S3 storage is not fully configured/
      );
    });
  });

  describe('getUrl()', () => {
    it('builds public URL from S3_PUBLIC_BASE_URL and key without duplicate slashes', () => {
      const service = new S3StorageService(defaultOptions);
      const url = service.getUrl('general/image.jpg');
      expect(url).toBe('https://pub-test123.r2.dev/general/image.jpg');
    });

    it('strips leading slashes and backslashes from key', () => {
      const service = new S3StorageService(defaultOptions);
      expect(service.getUrl('/general/image.jpg')).toBe('https://pub-test123.r2.dev/general/image.jpg');
      expect(service.getUrl('\\general\\image.jpg')).toBe('https://pub-test123.r2.dev/general/image.jpg');
    });

    it('handles publicBaseUrl with trailing slash gracefully without double slashes', () => {
      const service = new S3StorageService({
        ...defaultOptions,
        publicBaseUrl: 'https://media.metropolitan.com/',
      });
      expect(service.getUrl('products/item.png')).toBe('https://media.metropolitan.com/products/item.png');
    });

    it('never uses S3_ENDPOINT for public URLs', () => {
      const service = new S3StorageService(defaultOptions);
      const url = service.getUrl('general/asset.png');
      expect(url).not.toContain('test-account.r2.cloudflarestorage.com');
      expect(url).toBe('https://pub-test123.r2.dev/general/asset.png');
    });
  });

  describe('upload()', () => {
    it('uploads file to S3 bucket with PutObjectCommand and returns StoredFile with public URL', async () => {
      const service = new S3StorageService(defaultOptions);
      const result = await service.upload(sampleFile, 'general');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = getCommand<PutObjectCommand>();
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input.Bucket).toBe('metropolitan-media');
      expect(command.input.Key).toMatch(/^general\/[a-f0-9-]+\.jpg$/);
      expect(command.input.Body).toEqual(sampleFile.buffer);
      expect(command.input.ContentType).toBe('image/jpeg');
      expect(command.input.ContentLength).toBe(22);

      expect(result.filename).toMatch(/^[a-f0-9-]+\.jpg$/);
      expect(result.path).toBe(command.input.Key);
      expect(result.url).toBe(`https://pub-test123.r2.dev/${command.input.Key}`);
      expect(result.size).toBe(22);
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('handles files with custom folder', async () => {
      const service = new S3StorageService(defaultOptions);
      const result = await service.upload(sampleFile, 'products/catalog');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = getCommand<PutObjectCommand>();
      expect(command.input.Key).toMatch(/^products\/catalog\/[a-f0-9-]+\.jpg$/);
      expect(result.path).toMatch(/^products\/catalog\//);
    });

    it('defaults file extension to .bin when filename lacks extension', async () => {
      const service = new S3StorageService(defaultOptions);
      const fileWithoutExt: StorageFile = {
        ...sampleFile,
        filename: 'blob-no-extension',
      };
      const result = await service.upload(fileWithoutExt, 'general');

      expect(result.filename).toMatch(/\.bin$/);
      expect(result.path).toMatch(/\.bin$/);
    });

    it('rejects traversal in folder with an error', async () => {
      const service = new S3StorageService(defaultOptions);

      await expect(service.upload(sampleFile, '../outside')).rejects.toThrow(
        'Invalid upload folder destination'
      );
      await expect(service.upload(sampleFile, '../../outside')).rejects.toThrow(
        'Invalid upload folder destination'
      );
      await expect(service.upload(sampleFile, 'nested/../../../outside')).rejects.toThrow(
        'Invalid upload folder destination'
      );
      await expect(service.upload(sampleFile, '..')).rejects.toThrow('Invalid upload folder destination');
    });

    it('rejects absolute paths or leading slashes in folder', async () => {
      const service = new S3StorageService(defaultOptions);

      await expect(service.upload(sampleFile, '/root-folder')).rejects.toThrow(
        'Invalid upload folder destination'
      );
      await expect(service.upload(sampleFile, '\\root-folder')).rejects.toThrow(
        'Invalid upload folder destination'
      );
    });

    it('propagates SDK errors when client.send rejects', async () => {
      mockSend.mockRejectedValueOnce(new Error('S3 connection timed out'));
      const service = new S3StorageService(defaultOptions);

      await expect(service.upload(sampleFile, 'general')).rejects.toThrow('S3 connection timed out');
    });
  });

  describe('delete()', () => {
    it('deletes by raw storage key', async () => {
      const service = new S3StorageService(defaultOptions);
      await service.delete('general/photo-123.jpg');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = getCommand<DeleteObjectCommand>();
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input.Bucket).toBe('metropolitan-media');
      expect(command.input.Key).toBe('general/photo-123.jpg');
    });

    it('deletes by raw storage key with leading slash or backslash', async () => {
      const service = new S3StorageService(defaultOptions);
      await service.delete('/general/photo-123.jpg');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = getCommand<DeleteObjectCommand>();
      expect(command.input.Key).toBe('general/photo-123.jpg');
    });

    it('strips bucket name prefix if key starts with metropolitan-media/<key>', async () => {
      const service = new S3StorageService(defaultOptions);
      await service.delete('metropolitan-media/general/photo-123.jpg');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = getCommand<DeleteObjectCommand>();
      expect(command.input.Bucket).toBe('metropolitan-media');
      // Must NOT send metropolitan-media/<key>
      expect(command.input.Key).toBe('general/photo-123.jpg');
    });

    it('deletes by full public base URL (R2 dev domain)', async () => {
      const service = new S3StorageService(defaultOptions);
      await service.delete('https://pub-test123.r2.dev/general/photo-123.jpg');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = getCommand<DeleteObjectCommand>();
      expect(command.input.Bucket).toBe('metropolitan-media');
      expect(command.input.Key).toBe('general/photo-123.jpg');
    });

    it('deletes by custom domain public URL', async () => {
      const service = new S3StorageService({
        ...defaultOptions,
        publicBaseUrl: 'https://media.metropolitan.com',
      });
      await service.delete('https://media.metropolitan.com/products/item-999.png');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = getCommand<DeleteObjectCommand>();
      expect(command.input.Key).toBe('products/item-999.png');
    });

    it('deletes by public base URL with subpath prefix', async () => {
      const service = new S3StorageService({
        ...defaultOptions,
        publicBaseUrl: 'https://cdn.metropolitan.com/media-assets',
      });
      await service.delete('https://cdn.metropolitan.com/media-assets/brands/banner.jpg');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = getCommand<DeleteObjectCommand>();
      expect(command.input.Key).toBe('brands/banner.jpg');
    });

    it('deletes by endpoint-style URL with bucket in path without sending bucket in key', async () => {
      const service = new S3StorageService(defaultOptions);
      await service.delete(
        'https://test-account.r2.cloudflarestorage.com/metropolitan-media/general/photo-123.jpg'
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = getCommand<DeleteObjectCommand>();
      expect(command.input.Bucket).toBe('metropolitan-media');
      expect(command.input.Key).toBe('general/photo-123.jpg');
    });

    it('deletes by virtual-hosted endpoint URL', async () => {
      const service = new S3StorageService(defaultOptions);
      await service.delete(
        'https://metropolitan-media.test-account.r2.cloudflarestorage.com/general/photo-123.jpg'
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = getCommand<DeleteObjectCommand>();
      expect(command.input.Bucket).toBe('metropolitan-media');
      expect(command.input.Key).toBe('general/photo-123.jpg');
    });

    it('handles URLs with query parameters and hash fragments', async () => {
      const service = new S3StorageService(defaultOptions);
      await service.delete('https://pub-test123.r2.dev/general/photo-123.jpg?versionId=abc&t=123#preview');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = getCommand<DeleteObjectCommand>();
      expect(command.input.Key).toBe('general/photo-123.jpg');
    });

    it('handles URLs with percent-encoded spaces and characters', async () => {
      const service = new S3StorageService(defaultOptions);
      await service.delete('https://pub-test123.r2.dev/general/my%20test%20file.jpg');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = getCommand<DeleteObjectCommand>();
      expect(command.input.Key).toBe('general/my test file.jpg');
    });

    it('allows valid filenames that contain double dots without path traversal', async () => {
      const service = new S3StorageService(defaultOptions);
      await service.delete('https://pub-test123.r2.dev/general/photo..v2.jpg');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = getCommand<DeleteObjectCommand>();
      expect(command.input.Key).toBe('general/photo..v2.jpg');
    });

    describe('invalid and traversal path edge cases', () => {
      it('safely no-ops for empty or whitespace-only inputs without calling S3', async () => {
        const service = new S3StorageService(defaultOptions);

        await service.delete('');
        await service.delete('   ');
        await service.delete(null as unknown as string);
        await service.delete(undefined as unknown as string);

        expect(mockSend).not.toHaveBeenCalled();
      });

      it('safely no-ops for directory traversal attempts without calling S3', async () => {
        const service = new S3StorageService(defaultOptions);

        await service.delete('../outside.txt');
        await service.delete('../../outside.txt');
        await service.delete('nested/../../../outside.txt');
        await service.delete('https://pub-test123.r2.dev/../../../etc/passwd');
        await service.delete('https://pub-test123.r2.dev/..%2f..%2fetc/passwd');

        expect(mockSend).not.toHaveBeenCalled();
      });

      it('safely no-ops when path is only the bucket name without an object key', async () => {
        const service = new S3StorageService(defaultOptions);

        await service.delete('metropolitan-media');
        await service.delete('metropolitan-media/');
        await service.delete('https://pub-test123.r2.dev/metropolitan-media');

        expect(mockSend).not.toHaveBeenCalled();
      });
    });

    it('propagates SDK errors when client.send rejects', async () => {
      mockSend.mockRejectedValueOnce(new Error('S3 Access Denied (403)'));
      const service = new S3StorageService(defaultOptions);

      await expect(service.delete('general/photo.jpg')).rejects.toThrow('S3 Access Denied (403)');
    });
  });
});
