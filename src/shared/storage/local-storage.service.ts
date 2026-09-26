import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config/env';
import type { IStorageService, StorageFile, StoredFile } from './storage.types';

export class LocalStorageService implements IStorageService {
  private baseDir: string;
  private baseUrl: string;

  constructor(baseDir = config.STORAGE_LOCAL_DIR, baseUrl = config.STORAGE_BASE_URL) {
    this.baseDir = path.resolve(baseDir);
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async upload(file: StorageFile, folder = 'general'): Promise<StoredFile> {
    const ext = path.extname(file.filename) || '.bin';
    const filename = `${randomUUID()}${ext}`;
    const targetDir = path.join(this.baseDir, folder);

    await fs.mkdir(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, filename);
    await fs.writeFile(targetPath, file.buffer);

    const relativeUrl = `${this.baseUrl}/${folder}/${filename}`;
    const relativePath = `${folder}/${filename}`;

    return {
      filename,
      url: relativeUrl,
      path: relativePath,
      size: file.size,
      mimeType: file.mimeType,
    };
  }

  async delete(filePathOrUrl: string): Promise<void> {
    if (!filePathOrUrl) return;

    // Normalize path by stripping baseUrl if provided
    let relative = filePathOrUrl;
    if (relative.startsWith(this.baseUrl)) {
      relative = relative.slice(this.baseUrl.length);
    }
    relative = relative.replace(/^[/\\]+/, '');

    const absolutePath = path.resolve(this.baseDir, relative);
    // Security check: ensure path does not escape baseDir
    if (!absolutePath.startsWith(this.baseDir)) return;

    try {
      await fs.unlink(absolutePath);
    } catch (err: unknown) {
      // Ignore if file doesn't exist
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  getUrl(relativePath: string): string {
    const cleanPath = relativePath.replace(/^[/\\]+/, '');
    return `${this.baseUrl}/${cleanPath}`;
  }
}
