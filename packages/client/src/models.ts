export interface TranslationRef {
  readonly origin: string;
  readonly key: string;
}

export interface TranslationStringResource {
  readonly ref: TranslationRef;
  readonly fallback?: string;
}

export interface ProjectMetadata {
  readonly locales: readonly string[];
  readonly defaultLocale: string;
}

export interface TranslationItem {
  readonly ref: TranslationRef;
  readonly value: string | null;
}

export interface TranslationSnapshot {
  readonly locale: string;
  readonly items: readonly TranslationItem[];
}

export interface StoredTranslations {
  readonly projectMetadata: ProjectMetadata | null;
  readonly snapshots: readonly TranslationSnapshot[];
  readonly lastSuccessfulRefreshAt: string | null;
  readonly clientId?: string | null;
}

export type TranslationRefreshStatus =
  | 'idle'
  | 'restoringCache'
  | 'refreshing'
  | 'ready'
  | 'failed';

export interface TranslationRefreshState {
  readonly status: TranslationRefreshStatus;
  readonly lastSuccessfulRefreshAt: string | null;
  readonly lastFailureMessage: string | null;
}

export function createRefreshState(
  partial: Partial<TranslationRefreshState> = {},
): TranslationRefreshState {
  return {
    status: partial.status ?? 'idle',
    lastSuccessfulRefreshAt: partial.lastSuccessfulRefreshAt ?? null,
    lastFailureMessage: partial.lastFailureMessage ?? null,
  };
}
