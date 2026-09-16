import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StoredTranslations } from './models.js';

export interface TranslationSnapshotStore {
  load(): Promise<StoredTranslations | null>;
  save(translations: StoredTranslations): Promise<void>;
  clear(): Promise<void>;
}

export const noOpSnapshotStore: TranslationSnapshotStore = {
  async load(): Promise<StoredTranslations | null> {
    return null;
  },
  async save(_translations: StoredTranslations): Promise<void> {},
  async clear(): Promise<void> {},
};

class FileTranslationSnapshotStore implements TranslationSnapshotStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<StoredTranslations | null> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as StoredTranslations;
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? (error as { code?: string }).code
          : undefined;
      if (code === 'ENOENT') {
        return null;
      }
      await this.clear();
      return null;
    }
  }

  async save(translations: StoredTranslations): Promise<void> {
    const parent = path.dirname(this.filePath);
    await mkdir(parent, { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(translations)}\n`, 'utf8');
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? (error as { code?: string }).code
          : undefined;
      if (code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

export const TranslationSnapshotStores = {
  file(filePath: string): TranslationSnapshotStore {
    return new FileTranslationSnapshotStore(filePath);
  },
};
