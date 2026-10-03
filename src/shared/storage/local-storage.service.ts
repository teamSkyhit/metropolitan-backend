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
    const targetDir = path.resolve(this.baseDir, folder);
    const relFolder = path.relative(this.baseDir, targetDir);

    if (relFolder.startsWith('..') || path.isAbsolute(relFolder)) {
      throw new Error('Invalid upload folder destination');
    }

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

    const resolvedBase = path.resolve(this.baseDir);
    const absolutePath = path.resolve(resolvedBase, relative);
    const relFromBase = path.relative(resolvedBase, absolutePath);

    // Robust containment check: ensure target path is strictly within baseDir.
    // Rejects directory traversal (starts with '..'), absolute escapes, and baseDir root itself.
    if (relFromBase.startsWith('..') || path.isAbsolute(relFromBase) || relFromBase === '') {
      return;
    }

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
