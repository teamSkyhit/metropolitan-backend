export interface StorageFile {
  filename: string;
  buffer?: Buffer;
  path?: string;
  mimeType: string;
  size: number;
}

export interface StoredFile {
  filename: string;
  url: string;
  path: string;
  size: number;
  mimeType: string;
}

export interface IStorageService {
  upload(file: StorageFile, folder?: string): Promise<StoredFile>;
  delete(filePathOrUrl: string): Promise<void>;
  getUrl(path: string): string;
}
