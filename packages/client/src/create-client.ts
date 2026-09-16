import { TranslationToolsClient } from './client.js';
import { createHttpApi } from './http.js';
import {
  normalizeClientOptions,
  type TranslationToolsClientOptions,
} from './options.js';

export function createClient(options: TranslationToolsClientOptions): TranslationToolsClient {
  const normalized = normalizeClientOptions(options);
  const api = createHttpApi({
    fetch: globalThis.fetch.bind(globalThis),
    apiKey: normalized.apiKey,
    environment: normalized.environment,
    baseUrl: normalized.baseUrl,
  });
  return new TranslationToolsClient(normalized, api, normalized.now);
}
