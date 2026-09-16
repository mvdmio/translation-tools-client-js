import { createRequire } from 'node:module';
import { TranslationToolsValidationException } from './exceptions.js';
import { HeartbeatLoop } from './heartbeat.js';
import type { TranslationToolsApi } from './http.js';
import {
  getCachedItem,
  localeMapFromSnapshots,
  putCachedItem,
  snapshotsFromLocaleMap,
  type LocaleMap,
} from './locale-cache.js';
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
import { bindValueObserver } from './observers.js';
import type { NormalizedClientOptions } from './options.js';
import {
  createGlobalPlaceholderRegistry,
  substitutePlaceholders,
  type GlobalPlaceholderResolver,
  type PlaceholderBindings,
} from './placeholders.js';
import { isStringResource, normalizeLocale, validateRef } from './refs.js';

const DEFAULT_LOCALE = 'en';
const CLIENT_VERSION = (
  createRequire(import.meta.url)('../package.json') as { version: string }
).version;

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
  private readonly heartbeat: HeartbeatLoop;
  private projectMetadata: ProjectMetadata | null = null;
  private translations: LocaleMap = new Map();
  private refreshState: TranslationRefreshState = createRefreshState();
  private lastSuccessfulRefreshAt: string | null = null;
  private clientId: string | null = null;
  private readonly listeners = new Set<() => void>();
  private refreshInFlight: Promise<void> | null = null;

  constructor(
    readonly options: NormalizedClientOptions,
    private readonly api: TranslationToolsApi,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.globals = createGlobalPlaceholderRegistry(options.globalPlaceholders);
    this.heartbeat = new HeartbeatLoop(options.heartbeatIntervalMs, () => this.sendHeartbeat());
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
  ): string | null;
  getCached(
    target: TranslationRef | TranslationStringResource,
    locale?: string | null,
  ): string | null {
    if (isStringResource(target)) {
      return this.getCached(target.ref, locale) ?? target.fallback ?? target.ref.key;
    }
    const validatedRef = validateRef(target);
    const resolvedLocale = this.resolveLocale(locale);
    return getCachedItem(this.translations, resolvedLocale, validatedRef)?.value ?? null;
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
      const locale =
        typeof placeholdersOrLocale === 'string' || placeholdersOrLocale == null
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

    if (isStringResource(targetOrOrigin)) {
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
    const cachedItem = getCachedItem(this.translations, resolvedLocale, validatedRef);
    if (cachedItem != null) {
      return this.render(cachedItem.value ?? defaultValue ?? validatedRef.key, placeholders);
    }

    try {
      const fetched = await this.api.getTranslation(resolvedLocale, validatedRef, defaultValue);
      this.putItem(resolvedLocale, { ...fetched, ref: validateRef(fetched.ref) });
      await this.persist();
      return this.render(fetched.value ?? defaultValue ?? validatedRef.key, placeholders);
    } catch (error) {
      if (error instanceof TranslationToolsValidationException) {
        throw error;
      }
      return this.render(defaultValue ?? validatedRef.key, placeholders);
    }
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
    const locale = typeof localeOrListener === 'function' ? undefined : localeOrListener;
    const listener = (
      typeof localeOrListener === 'function' ? localeOrListener : maybeListener
    ) as (value: string | null) => void;

    return bindValueObserver(this.listeners, () => this.getCached(target, locale), listener);
  }

  observeRefreshState(listener: (state: TranslationRefreshState) => void): () => void {
    return bindValueObserver(this.listeners, () => this.refreshState, listener);
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
    this.heartbeat.stop();
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
    this.heartbeat.start();
  }

  private sendHeartbeat(): void {
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
    this.translations = localeMapFromSnapshots(stored.snapshots);
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
    await this.options.snapshotStore.save({
      projectMetadata: this.projectMetadata,
      snapshots: snapshotsFromLocaleMap(this.translations),
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
    this.translations = localeMapFromSnapshots(snapshots);
    this.lastSuccessfulRefreshAt = completedAt;
  }

  private putItem(locale: string, item: TranslationItem): void {
    const normalizedLocale = normalizeLocale(locale);
    const validatedRef = validateRef(item.ref);
    this.translations = putCachedItem(this.translations, normalizedLocale, {
      ref: validatedRef,
      value: item.value,
    });
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
      locales: normalizedLocales.includes(normalizedDefaultLocale)
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
