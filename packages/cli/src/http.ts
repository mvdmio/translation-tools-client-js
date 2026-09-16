import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

export const DEFAULT_BASE_URL = 'https://translations.mvdm.io';

export type ProjectMetadataResponse = {
  locales: string[];
  defaultLocale: string | null;
};

export type LocaleTranslationItem = {
  origin: string;
  key: string;
  value: string | null;
};

export type CliTranslationToolsHttp = {
  getProjectMetadata(): Promise<ProjectMetadataResponse>;
  getLocale(locale: string): Promise<LocaleTranslationItem[]>;
};

export type CreateCliHttpOptions = {
  apiKey: string;
  baseUrl: string;
};

export function resolveCliBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.TRANSLATIONTOOLS_BASE_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    return fromEnv.trim().replace(/\/+$/, '');
  }
  return DEFAULT_BASE_URL;
}

export function createCliHttp(options: CreateCliHttpOptions): CliTranslationToolsHttp {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  async function getJson<T>(label: string, urlPath: string): Promise<T> {
    const bodyText = await requestText(label, `${baseUrl}${urlPath}`, options.apiKey);
    try {
      return JSON.parse(bodyText) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse TranslationTools ${label} response: ${message}`);
    }
  }

  return {
    async getProjectMetadata(): Promise<ProjectMetadataResponse> {
      const body = await getJson<{ locales?: unknown; defaultLocale?: unknown }>(
        'project metadata',
        '/api/v1/translations/project',
      );
      const locales = Array.isArray(body.locales)
        ? body.locales.map((locale) => String(locale))
        : [];
      const defaultLocale =
        typeof body.defaultLocale === 'string' && body.defaultLocale.trim() !== ''
          ? body.defaultLocale
          : null;
      return { locales, defaultLocale };
    },

    async getLocale(locale: string): Promise<LocaleTranslationItem[]> {
      const body = await getJson<unknown>(
        `locale '${locale}'`,
        `/api/v1/translations/${encodeURIComponent(locale)}`,
      );
      if (!Array.isArray(body)) {
        throw new Error(
          `Failed to parse TranslationTools locale '${locale}' response: expected a JSON array.`,
        );
      }
      return body.map((item) => {
        const record = item as Record<string, unknown>;
        return {
          origin: String(record.origin ?? ''),
          key: String(record.key ?? ''),
          value: record.value == null ? null : String(record.value),
        };
      });
    },
  };
}

function requestText(label: string, urlString: string, apiKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(urlString);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reject(new Error(`TranslationTools ${label} request failed: ${message}`));
      return;
    }

    const transport = url.protocol === 'http:' ? http : https;
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Authorization: apiKey,
          Accept: 'application/json',
          Connection: 'close',
        },
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer | string) => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        res.on('end', () => {
          const bodyText = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(
              new Error(
                `TranslationTools ${label} request failed with status ${status}: ${bodyText.trim()}`,
              ),
            );
            return;
          }
          resolve(bodyText);
        });
      },
    );

    req.on('error', (error) => {
      reject(
        new Error(
          `TranslationTools ${label} request failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    });
    req.end();
  });
}
