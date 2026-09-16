import { isValidGlobalPlaceholderName } from './placeholders.js';
import { noOpSnapshotStore, type TranslationSnapshotStore } from './snapshot-store.js';
import type { StoredTranslations } from './models.js';

export const DEFAULT_BASE_URL = 'https://translations.mvdm.io';
export const DEFAULT_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000;

export interface TranslationToolsClientOptions {
  apiKey: string;
  preferredLocales?: readonly string[];
  refreshIntervalMs?: number;
  backgroundRefreshEnabled?: boolean;
  currentLocaleProvider?: () => string | null | undefined;
  snapshotStore?: TranslationSnapshotStore;
  bundledSnapshot?: StoredTranslations | null;
  environment?: string | null;
  heartbeatEnabled?: boolean;
  heartbeatIntervalMs?: number;
  globalPlaceholders?: Readonly<Record<string, () => string | null | undefined>>;
  throwOnPlaceholderError?: boolean;
  /** Undocumented override for tests. */
  baseUrl?: string;
  /** Undocumented clock override for tests. */
  now?: () => Date;
}

export interface NormalizedClientOptions {
  readonly apiKey: string;
  readonly preferredLocales: readonly string[];
  readonly refreshIntervalMs: number;
  readonly backgroundRefreshEnabled: boolean;
  readonly currentLocaleProvider: () => string | null | undefined;
  readonly snapshotStore: TranslationSnapshotStore;
  readonly bundledSnapshot: StoredTranslations | null;
  readonly environment: string | null;
  readonly heartbeatEnabled: boolean;
  readonly heartbeatIntervalMs: number;
  readonly globalPlaceholders: Readonly<Record<string, () => string | null | undefined>>;
  readonly throwOnPlaceholderError: boolean;
  readonly baseUrl: string;
  readonly now: () => Date;
}

export function normalizeClientOptions(
  options: TranslationToolsClientOptions,
): NormalizedClientOptions {
  if (typeof options.apiKey !== 'string' || options.apiKey.trim() === '') {
    throw new Error('ApiKey is required.');
  }

  const refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  if (refreshIntervalMs < 0) {
    throw new Error('RefreshInterval must be zero or greater.');
  }
  if (heartbeatIntervalMs < 0) {
    throw new Error('HeartbeatInterval must be zero or greater.');
  }

  const globalPlaceholders = options.globalPlaceholders ?? {};
  for (const name of Object.keys(globalPlaceholders)) {
    if (!isValidGlobalPlaceholderName(name)) {
      throw new Error(
        `Invalid global placeholder name '${name}'. Names must match [a-z][a-zA-Z0-9]*.`,
      );
    }
  }

  const environment = options.environment?.trim() ? options.environment.trim() : null;
  const baseUrl = (options.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');

  return {
    apiKey: options.apiKey,
    preferredLocales: options.preferredLocales ? [...options.preferredLocales] : [],
    refreshIntervalMs,
    backgroundRefreshEnabled: options.backgroundRefreshEnabled ?? true,
    currentLocaleProvider: options.currentLocaleProvider ?? (() => null),
    snapshotStore: options.snapshotStore ?? noOpSnapshotStore,
    bundledSnapshot: options.bundledSnapshot ?? null,
    environment,
    heartbeatEnabled: options.heartbeatEnabled ?? true,
    heartbeatIntervalMs,
    globalPlaceholders,
    throwOnPlaceholderError: options.throwOnPlaceholderError ?? false,
    baseUrl,
    now: options.now ?? (() => new Date()),
  };
}
