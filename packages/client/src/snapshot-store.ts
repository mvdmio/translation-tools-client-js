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
