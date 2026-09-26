import { config } from '../../config/env';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';
import type { IStorageService } from './storage.types';

export function createStorageService(): IStorageService {
  if (config.STORAGE_DRIVER === 's3') {
    return new S3StorageService();
  }
  return new LocalStorageService();
}

export const storageService = createStorageService();
