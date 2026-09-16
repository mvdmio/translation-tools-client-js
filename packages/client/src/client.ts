import { TranslationToolsValidationException } from './exceptions.js';
import type { TranslationToolsApi } from './http.js';
import {
  createRefreshState,
  type ProjectMetadata,
  type StoredTranslations,
  type TranslationItem,
  type TranslationRef,
  type TranslationRefreshState,
  type TranslationSnapshot,
  type TranslationStringResource,
} from './models.js';
import type { NormalizedClientOptions } from './options.js';
import {
  createGlobalPlaceholderRegistry,
  substitutePlaceholders,
  type GlobalPlaceholderResolver,
  type PlaceholderBindings,
} from './placeholders.js';

const DEFAULT_LOCALE = 'en';
const VALID_KEY_RE = /^[A-Za-z0-9._-]+$/;
const CLIENT_VERSION = '0.0.0';

type LocaleMap = Map<string, Map<string, TranslationItem>>;

function refKey(ref: TranslationRef): string {
  return `${ref.origin}\0${ref.key}`;
}

function normalizeLocale(locale: string): string {
  return locale.trim().toLowerCase();
}

function validateKey(key: string): string {
  if (key.trim() === '') {
    throw new TranslationToolsValidationException('Translation key is required.');
  }
  if (!VALID_KEY_RE.test(key)) {
    throw new TranslationToolsValidationException(`Invalid translation key: ${key}`);
  }
  return key;
}

function validateRef(ref: TranslationRef): TranslationRef {
  if (ref.origin.trim() === '') {
    throw new TranslationToolsValidationException('Translation origin is required.');
  }
  return { origin: ref.origin, key: validateKey(ref.key) };
}

function isResource(value: TranslationRef | TranslationStringResource): value is TranslationStringResource {
  return 'ref' in value && value.ref != null && typeof value.ref === 'object';
}

export class TranslationRenderBuilder {
  private readonly placeholders = new Map<string, string | null | undefined>();

  constructor(
    private readonly client: TranslationToolsClient,
    private readonly ref: TranslationRef,
    private readonly locale: string | null | undefined,
    private readonly defaultValue: string | null | undefined,
  ) {}

  setPlaceholder(name: string, value: string | null | undefined): this {
    this.placeholders.set(name, value);
    return this;
  }

  render(): Promise<string> {
    const bindings: Record<string, string | null | undefined> = {};
    for (const [name, value] of this.placeholders) {
      bindings[name] = value;
    }
    return this.client.get(this.ref, this.locale, bindings, this.defaultValue);
  }
}

export class TranslationToolsClient {
  private readonly globals: GlobalPlaceholderResolver;
  private projectMetadata: ProjectMetadata | null = null;
  private translations: LocaleMap = new Map();
  private refreshState: TranslationRefreshState = createRefreshState();
  private lastSuccessfulRefreshAt: string | null = null;
  private clientId: string | null = null;
  private readonly listeners = new Set<() => void>();
  private refreshInFlight: Promise<void> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly options: NormalizedClientOptions,
    private readonly api: TranslationToolsApi,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.globals = createGlobalPlaceholderRegistry(options.globalPlaceholders);
  }

  async initialize(): Promise<void> {
    let restored = false;
    this.refreshState = createRefreshState({
      status: 'restoringCache',
      lastSuccessfulRefreshAt: this.lastSuccessfulRefreshAt,
    });
    this.emit();

    const stored = await this.options.snapshotStore.load();
    if (stored) {
      this.restore(stored);
      restored = true;
    }

    if (!restored && this.options.bundledSnapshot) {
      this.restore(this.options.bundledSnapshot);
      restored = true;
    }

    if (this.clientId == null) {
      this.clientId = crypto.randomUUID();
      await this.persist();
    }

    this.pushGlobalsAtStartup();

    if (!restored) {
      try {
        await this.refreshInternal(true);
      } catch (error) {
        this.refreshState = createRefreshState({
          status: 'failed',
          lastSuccessfulRefreshAt: this.lastSuccessfulRefreshAt,
          lastFailureMessage: error instanceof Error ? error.message : String(error),
        });
        this.emit();
        this.startHeartbeat();
        throw error;
      }
      this.startHeartbeat();
      return;
    }

    if (!this.options.backgroundRefreshEnabled) {
      this.startHeartbeat();
      return;
    }

    void this.refreshInternal(true).catch(() => {});
    this.startHeartbeat();
  }

  getCached(ref: TranslationRef, locale?: string | null): string | null;
  getCached(resource: TranslationStringResource, locale?: string | null): string;
  getCached(
    target: TranslationRef | TranslationStringResource,
    locale?: string | null,
  ): string | null {
    if (isResource(target)) {
      return this.getCached(target.ref, locale) ?? target.fallback ?? target.ref.key;
    }
    const validatedRef = validateRef(target);
    const resolvedLocale = this.resolveLocale(locale);
    return this.translations.get(resolvedLocale)?.get(refKey(validatedRef))?.value ?? null;
  }

  get(
    ref: TranslationRef,
    locale?: string | null,
    placeholders?: PlaceholderBindings,
    defaultValue?: string | null,
  ): Promise<string>;
  get(
    resource: TranslationStringResource,
    locale?: string | null,
    placeholders?: PlaceholderBindings,
  ): Promise<string>;
  get(
    origin: string,
    key: string,
    locale?: string | null,
    placeholders?: PlaceholderBindings,
  ): Promise<string>;
  async get(
    targetOrOrigin: TranslationRef | TranslationStringResource | string,
    localeOrKey?: string | null,
    placeholdersOrLocale?: PlaceholderBindings | string | null,
    defaultValueOrPlaceholders?: string | null | PlaceholderBindings,
  ): Promise<string> {
    if (typeof targetOrOrigin === 'string') {
      const origin = targetOrOrigin;
      const key = localeOrKey ?? '';
      const locale = typeof placeholdersOrLocale === 'string' || placeholdersOrLocale == null
        ? placeholdersOrLocale
        : undefined;
      const placeholders =
        typeof placeholdersOrLocale === 'object' && placeholdersOrLocale != null
          ? placeholdersOrLocale
          : typeof defaultValueOrPlaceholders === 'object' && defaultValueOrPlaceholders != null
            ? defaultValueOrPlaceholders
            : undefined;
      return this.get({ origin, key }, locale, placeholders);
    }

    if (isResource(targetOrOrigin)) {
      const placeholders =
        typeof placeholdersOrLocale === 'object' && placeholdersOrLocale != null
          ? placeholdersOrLocale
          : undefined;
      return this.get(
        targetOrOrigin.ref,
        localeOrKey,
        placeholders,
        targetOrOrigin.fallback ?? null,
      );
    }

    const placeholders =
      typeof placeholdersOrLocale === 'object' && placeholdersOrLocale != null
        ? placeholdersOrLocale
        : undefined;
    const defaultValue =
      typeof defaultValueOrPlaceholders === 'string' || defaultValueOrPlaceholders == null
        ? defaultValueOrPlaceholders
        : undefined;

    const validatedRef = validateRef(targetOrOrigin);
    const resolvedLocale = this.resolveLocale(localeOrKey);
    const cachedItem = this.translations.get(resolvedLocale)?.get(refKey(validatedRef));
    if (cachedItem != null) {
      return this.render(cachedItem.value ?? defaultValue ?? validatedRef.key, placeholders);
    }

    const fetched = await this.api.getTranslation(
      resolvedLocale,
      validatedRef,
      defaultValue,
    );
    this.putItem(resolvedLocale, { ...fetched, ref: validateRef(fetched.ref) });
    await this.persist();
    return this.render(fetched.value ?? defaultValue ?? validatedRef.key, placeholders);
  }

  withPlaceholders(
    ref: TranslationRef,
    locale?: string | null,
    defaultValue?: string | null,
  ): TranslationRenderBuilder;
  withPlaceholders(
    origin: string,
    key: string,
    locale?: string | null,
    defaultValue?: string | null,
  ): TranslationRenderBuilder;
  withPlaceholders(
    refOrOrigin: TranslationRef | string,
    localeOrKey?: string | null,
    defaultValueOrLocale?: string | null,
    maybeDefaultValue?: string | null,
  ): TranslationRenderBuilder {
    if (typeof refOrOrigin === 'string') {
      return new TranslationRenderBuilder(
        this,
        { origin: refOrOrigin, key: localeOrKey ?? '' },
        defaultValueOrLocale,
        maybeDefaultValue,
      );
    }
    return new TranslationRenderBuilder(this, refOrOrigin, localeOrKey, defaultValueOrLocale);
  }

  observe(
    ref: TranslationRef,
    listener: (value: string | null) => void,
  ): () => void;
  observe(
    ref: TranslationRef,
    locale: string | null | undefined,
    listener: (value: string | null) => void,
  ): () => void;
  observe(
    resource: TranslationStringResource,
    listener: (value: string) => void,
  ): () => void;
  observe(
    resource: TranslationStringResource,
    locale: string | null | undefined,
    listener: (value: string) => void,
  ): () => void;
  observe(
    target: TranslationRef | TranslationStringResource,
    localeOrListener:
      | string
      | null
      | undefined
      | ((value: string | null) => void)
      | ((value: string) => void),
    maybeListener?: ((value: string | null) => void) | ((value: string) => void),
  ): () => void {
    const locale =
      typeof localeOrListener === 'function' ? undefined : localeOrListener;
    const listener = (
      typeof localeOrListener === 'function' ? localeOrListener : maybeListener
    ) as (value: string | null) => void;

    const read = (): string | null => {
      if (isResource(target)) {
        return this.getCached(target, locale);
      }
      return this.getCached(target, locale);
    };

    let last = read();
    listener(last);

    const onChange = (): void => {
      const next = read();
      if (next !== last) {
        last = next;
        listener(next);
      }
    };

    this.listeners.add(onChange);
    return () => {
      this.listeners.delete(onChange);
    };
  }

  observeRefreshState(listener: (state: TranslationRefreshState) => void): () => void {
    listener(this.refreshState);
    let last = this.refreshState;
    const onChange = (): void => {
      if (this.refreshState !== last) {
        last = this.refreshState;
        listener(this.refreshState);
      }
    };
    this.listeners.add(onChange);
    return () => {
      this.listeners.delete(onChange);
    };
  }

  async refresh(): Promise<void> {
    await this.refreshInternal(true);
  }

  async refreshIfStale(): Promise<void> {
    if (!this.isRefreshStale(this.now())) {
      return;
    }
    await this.refreshInternal(false);
  }

  dispose(): void {
    if (this.heartbeatTimer != null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.listeners.clear();
  }

  private render(value: string, placeholders?: PlaceholderBindings): string {
    if (
      (placeholders == null || Object.keys(placeholders).length === 0) &&
      this.globals.registeredNames.length === 0 &&
      !value.includes('{') &&
      !value.includes("'")
    ) {
      return value;
    }

    return substitutePlaceholders({
      value,
      bindings: placeholders,
      globals: this.globals,
      knownSet: null,
      throwOnError: this.options.throwOnPlaceholderError,
      warn: (message) => {
        console.warn(message);
      },
    });
  }

  private pushGlobalsAtStartup(): void {
    if (this.globals.registeredNames.length === 0) {
      return;
    }
    void this.api
      .pushGlobals({
        environment: this.options.environment,
        names: this.globals.registeredNames,
      })
      .catch(() => {});
  }

  private startHeartbeat(): void {
    if (!this.options.heartbeatEnabled) {
      return;
    }
    if (this.heartbeatTimer != null) {
      return;
    }

    const beat = (): void => {
      const clientId = this.clientId ?? crypto.randomUUID();
      this.clientId = clientId;
      void this.api
        .sendHeartbeat({
          clientId,
          environment: this.options.environment,
          platform: 'node',
          version: CLIENT_VERSION,
        })
        .catch(() => {});
    };

    beat();
    this.heartbeatTimer = setInterval(beat, this.options.heartbeatIntervalMs);
    this.heartbeatTimer.unref?.();
  }

  private async refreshInternal(force: boolean): Promise<void> {
    if (this.refreshInFlight) {
      await this.refreshInFlight;
      if (!force && !this.isRefreshStale(this.now())) {
        return;
      }
    }

    const run = async (): Promise<void> => {
      const requestedAt = this.now();
      if (!force && !this.isRefreshStale(requestedAt)) {
        return;
      }

      this.refreshState = createRefreshState({
        status: 'refreshing',
        lastSuccessfulRefreshAt: this.lastSuccessfulRefreshAt,
      });
      this.emit();

      try {
        const metadata = this.normalizeMetadata(await this.api.getProjectMetadata());
        const locales = this.selectLocales(metadata);
        const snapshots: TranslationSnapshot[] = [];
        for (const locale of locales) {
          const items = (await this.api.getLocale(locale)).map((item) => ({
            ...item,
            ref: validateRef(item.ref),
          }));
          snapshots.push({ locale, items });
        }

        const completedAt = this.now().toISOString();
        this.replaceState(metadata, snapshots, completedAt);
        await this.persist();
        this.refreshState = createRefreshState({
          status: 'ready',
          lastSuccessfulRefreshAt: completedAt,
        });
        this.emit();
      } catch (error) {
        this.refreshState = createRefreshState({
          status: 'failed',
          lastSuccessfulRefreshAt: this.lastSuccessfulRefreshAt,
          lastFailureMessage: error instanceof Error ? error.message : String(error),
        });
        this.emit();
        throw error;
      }
    };

    this.refreshInFlight = run().finally(() => {
      this.refreshInFlight = null;
    });
    await this.refreshInFlight;
  }

  private restore(stored: StoredTranslations): void {
    this.projectMetadata = stored.projectMetadata
      ? this.normalizeMetadata(stored.projectMetadata)
      : null;
    const next: LocaleMap = new Map();
    for (const snapshot of stored.snapshots) {
      const locale = normalizeLocale(snapshot.locale);
      const items = new Map<string, TranslationItem>();
      for (const item of snapshot.items) {
        const validated = validateRef(item.ref);
        items.set(refKey(validated), { ref: validated, value: item.value });
      }
      next.set(locale, items);
    }
    this.translations = next;
    this.lastSuccessfulRefreshAt = stored.lastSuccessfulRefreshAt;
    if (stored.clientId) {
      this.clientId = stored.clientId;
    }
    this.refreshState = createRefreshState({
      status: 'ready',
      lastSuccessfulRefreshAt: this.lastSuccessfulRefreshAt,
    });
    this.emit();
  }

  private async persist(): Promise<void> {
    const snapshots: TranslationSnapshot[] = [];
    for (const [locale, items] of this.translations) {
      snapshots.push({ locale, items: [...items.values()] });
    }
    await this.options.snapshotStore.save({
      projectMetadata: this.projectMetadata,
      snapshots,
      lastSuccessfulRefreshAt: this.lastSuccessfulRefreshAt,
      clientId: this.clientId,
    });
  }

  private replaceState(
    metadata: ProjectMetadata,
    snapshots: readonly TranslationSnapshot[],
    completedAt: string,
  ): void {
    this.projectMetadata = metadata;
    const next: LocaleMap = new Map();
    for (const snapshot of snapshots) {
      const locale = normalizeLocale(snapshot.locale);
      const items = new Map<string, TranslationItem>();
      for (const item of snapshot.items) {
        const validated = validateRef(item.ref);
        items.set(refKey(validated), { ref: validated, value: item.value });
      }
      next.set(locale, items);
    }
    this.translations = next;
    this.lastSuccessfulRefreshAt = completedAt;
  }

  private putItem(locale: string, item: TranslationItem): void {
    const normalizedLocale = normalizeLocale(locale);
    const validatedRef = validateRef(item.ref);
    const localeItems = new Map(this.translations.get(normalizedLocale) ?? []);
    localeItems.set(refKey(validatedRef), { ref: validatedRef, value: item.value });
    const next = new Map(this.translations);
    next.set(normalizedLocale, localeItems);
    this.translations = next;
    this.emit();
  }

  private selectLocales(metadata: ProjectMetadata): string[] {
    const projectLocales = new Set(metadata.locales.map(normalizeLocale));
    const configuredLocales =
      this.options.preferredLocales.length > 0
        ? this.options.preferredLocales.map(normalizeLocale)
        : [this.options.currentLocaleProvider(), metadata.defaultLocale]
            .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
            .map(normalizeLocale);

    const selected = [...new Set(configuredLocales.filter((locale) => projectLocales.has(locale)))];
    return selected.length > 0 ? selected : [metadata.defaultLocale];
  }

  private resolveLocale(locale?: string | null): string {
    if (locale != null && locale.trim() !== '') {
      return normalizeLocale(locale);
    }
    const fromProvider = this.options.currentLocaleProvider();
    if (typeof fromProvider === 'string' && fromProvider.trim() !== '') {
      return normalizeLocale(fromProvider);
    }
    if (this.projectMetadata?.defaultLocale) {
      return this.projectMetadata.defaultLocale;
    }
    return DEFAULT_LOCALE;
  }

  private isRefreshStale(referenceTime: Date): boolean {
    if (this.lastSuccessfulRefreshAt == null) {
      return true;
    }
    const lastRefresh = Date.parse(this.lastSuccessfulRefreshAt);
    if (Number.isNaN(lastRefresh)) {
      return true;
    }
    return lastRefresh + this.options.refreshIntervalMs <= referenceTime.getTime();
  }

  private normalizeMetadata(metadata: ProjectMetadata): ProjectMetadata {
    const normalizedLocales = [...new Set(metadata.locales.map(normalizeLocale))];
    const normalizedDefaultLocale = normalizeLocale(metadata.defaultLocale);
    return {
      locales:
        normalizedLocales.includes(normalizedDefaultLocale)
          ? normalizedLocales
          : [...normalizedLocales, normalizedDefaultLocale],
      defaultLocale: normalizedDefaultLocale,
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
