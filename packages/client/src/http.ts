import {
  TranslationToolsHttpException,
  TranslationToolsNetworkException,
  TranslationToolsSerializationException,
} from './exceptions.js';
import type { ProjectMetadata, TranslationItem, TranslationRef } from './models.js';

export interface TranslationToolsApi {
  getProjectMetadata(): Promise<ProjectMetadata>;
  getLocale(locale: string): Promise<TranslationItem[]>;
  getTranslation(
    locale: string,
    ref: TranslationRef,
    defaultValue?: string | null,
  ): Promise<TranslationItem>;
  sendHeartbeat(args: {
    clientId: string;
    environment: string | null;
    platform: string;
    version: string;
  }): Promise<void>;
  pushGlobals(args: { environment: string | null; names: readonly string[] }): Promise<void>;
}

export interface CreateHttpApiOptions {
  fetch: typeof globalThis.fetch;
  apiKey: string;
  environment: string | null;
  baseUrl: string;
}

export function createHttpApi(options: CreateHttpApiOptions): TranslationToolsApi {
  const { fetch: fetchImpl, apiKey, baseUrl } = options;
  const environment = options.environment?.trim() ? options.environment.trim() : null;

  const commonHeaders = (): Record<string, string> => ({
    Authorization: apiKey,
    Accept: 'application/json',
  });

  async function readSuccessJson<T>(response: Response): Promise<T> {
    const bodyText = await response.text();
    if (!response.ok) {
      throw new TranslationToolsHttpException(response.status, bodyText);
    }
    try {
      return JSON.parse(bodyText) as T;
    } catch (cause) {
      throw new TranslationToolsSerializationException(
        'Failed to deserialize TranslationTools response.',
        { cause },
      );
    }
  }

  async function execute<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (
        error instanceof TranslationToolsHttpException ||
        error instanceof TranslationToolsSerializationException ||
        error instanceof TranslationToolsNetworkException
      ) {
        throw error;
      }
      throw new TranslationToolsNetworkException('TranslationTools request failed.', {
        cause: error,
      });
    }
  }

  return {
    async getProjectMetadata(): Promise<ProjectMetadata> {
      return execute(async () => {
        const response = await fetchImpl(`${baseUrl}/api/v1/translations/project`, {
          headers: commonHeaders(),
        });
        const body = await readSuccessJson<{ locales: string[]; defaultLocale: string }>(response);
        return { locales: body.locales, defaultLocale: body.defaultLocale };
      });
    },

    async getLocale(locale: string): Promise<TranslationItem[]> {
      return execute(async () => {
        const segments = ['api', 'v1', 'translations', encodeURIComponent(locale)];
        if (environment) {
          segments.push(encodeURIComponent(environment));
        }
        const response = await fetchImpl(`${baseUrl}/${segments.join('/')}`, {
          headers: commonHeaders(),
        });
        const body = await readSuccessJson<
          Array<{ origin: string; key: string; value: string | null }>
        >(response);
        return body.map((item) => ({
          ref: { origin: item.origin, key: item.key },
          value: item.value,
        }));
      });
    },

    async getTranslation(
      locale: string,
      ref: TranslationRef,
      defaultValue?: string | null,
    ): Promise<TranslationItem> {
      return execute(async () => {
        const encodedOrigin = encodeURIComponent(ref.origin);
        const encodedLocale = encodeURIComponent(locale);
        const encodedKey = encodeURIComponent(ref.key);
        let url = `${baseUrl}/api/v1/translations/${encodedOrigin}/${encodedLocale}/${encodedKey}`;
        if (environment) {
          url += `/${encodeURIComponent(environment)}`;
        }
        if (defaultValue != null) {
          url += `?defaultValue=${encodeURIComponent(defaultValue)}`;
        }
        const response = await fetchImpl(url, { headers: commonHeaders() });
        const body = await readSuccessJson<{
          origin: string;
          key: string;
          value: string | null;
        }>(response);
        return { ref: { origin: body.origin, key: body.key }, value: body.value };
      });
    },

    async sendHeartbeat(args): Promise<void> {
      await execute(async () => {
        const response = await fetchImpl(`${baseUrl}/api/v1/translations/heartbeat`, {
          method: 'POST',
          headers: {
            ...commonHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clientId: args.clientId,
            environment: args.environment,
            platform: args.platform,
            version: args.version,
          }),
        });
        const bodyText = await response.text();
        if (!response.ok) {
          throw new TranslationToolsHttpException(response.status, bodyText);
        }
      });
    },

    async pushGlobals(args): Promise<void> {
      await execute(async () => {
        const response = await fetchImpl(`${baseUrl}/api/v1/translations/project`, {
          method: 'POST',
          headers: {
            ...commonHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [],
            environment: args.environment,
            globals: [...args.names],
          }),
        });
        const bodyText = await response.text();
        if (!response.ok) {
          throw new TranslationToolsHttpException(response.status, bodyText);
        }
      });
    },
  };
}
