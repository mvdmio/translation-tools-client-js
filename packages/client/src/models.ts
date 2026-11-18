export interface TranslationRef {
  readonly origin: string;
  readonly key: string;
}

/** The value a string Placeholder takes in a typed lookup. */
export type PlaceholderValue = string | null | undefined;

/**
 * The required Placeholders of a Key: a union of names, each a `PlaceholderValue`, or an object
 * type that gives each name its own type, such as `{ count: number; cartName: PlaceholderValue }`
 * for a Plural, whose number is a `number`. `string` means any names (a hand-written resource).
 */
export type RequiredPlaceholders = string | { readonly [name: string]: string | number | null | undefined };

/** A Key's Placeholders, typed. Without type arguments the lookup takes any `PlaceholderBindings`. */
export interface TranslationStringResource<
  Required extends RequiredPlaceholders = string,
  Optional extends string = never,
> {
  readonly ref: TranslationRef;
  readonly fallback?: string;
  /** Carries the Placeholder names as a type. It never exists at runtime. */
  readonly __placeholders?: { readonly required: Required; readonly optional: Optional };
}

type RequiredBindings<Required extends RequiredPlaceholders> = [Required] extends [string]
  ? { readonly [K in Required]: PlaceholderValue }
  : { readonly [K in keyof Required]: Required[K] };

type OptionalBindings<Optional extends string> = {
  readonly [K in Optional]?: PlaceholderValue;
};

/** The map of a Key that takes no Placeholders. Its one optional property makes any name excess. */
interface NoPlaceholderBindings {
  readonly __noPlaceholders?: never;
}

/** The `locale` and `placeholders` arguments of `get` for a resource. */
export type ResourceGetArguments<
  Required extends RequiredPlaceholders,
  Optional extends string,
> = string extends Required
  ? [locale?: string | null, placeholders?: Readonly<Record<string, string | number | null | undefined>>]
  : [Required] extends [never]
    ? [
        locale?: string | null,
        placeholders?: [Optional] extends [never] ? NoPlaceholderBindings : OptionalBindings<Optional>,
      ]
    : [
        locale: string | null | undefined,
        placeholders: RequiredBindings<Required> & OptionalBindings<Optional>,
      ];

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

/** One Key in one locale as sent in a Declaration. */
export interface DeclarationItem {
  readonly origin: string;
  readonly locale: string;
  readonly key: string;
  readonly value: string;
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
