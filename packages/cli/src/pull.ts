import { access } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, resolveApiKey } from './config.js';
import { runGenerate } from './generate.js';
import { createCliHttp, resolveCliBaseUrl } from './http.js';
import {
  localeFileRelativePath,
  mergeLocaleEntries,
  readFlatJsonResource,
  reverseKeyOverrides,
  toJsonKey,
  writeJsonResourceFile,
} from './json-resources.js';
import { readPackageName } from './origin.js';

export type PullResult = {
  writtenFiles: string[];
  generatedFile: string | null;
  typedKeyCount: number | null;
};

export async function runPull(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PullResult> {
  const config = await loadConfig(cwd);
  const apiKey = resolveApiKey(config, env);
  if (apiKey === undefined) {
    throw new Error(
      'Missing TranslationTools API key. Set TRANSLATIONTOOLS_API_KEY or apiKey in translationtools.yaml.',
    );
  }

  const packageName = await readPackageName(cwd);
  const packagePrefix = `${packageName.toLowerCase()}:`;
  const defaultLocale = config.defaultLocale.trim().toLowerCase();
  const reverseOverrides = reverseKeyOverrides(config.jsonResources.keyOverrides);
  const baseUrl = resolveCliBaseUrl(env);
  const http = createCliHttp({ apiKey, baseUrl });

  const metadata = await http.getProjectMetadata();
  const locales = collectPullLocales(metadata.defaultLocale, metadata.locales, config.locales);
  if (locales.length === 0) {
    throw new Error('TranslationTools project has no locales configured.');
  }

  const itemsByOriginKey = new Map<string, Map<string, string | null>>();
  for (const locale of locales) {
    const items = await http.getLocale(locale);
    for (const item of items) {
      if (!item.origin.startsWith(packagePrefix)) {
        continue;
      }
      const mapKey = `${item.origin}\0${item.key}`;
      let byLocale = itemsByOriginKey.get(mapKey);
      if (!byLocale) {
        byLocale = new Map();
        itemsByOriginKey.set(mapKey, byLocale);
      }
      byLocale.set(locale, item.value);
    }
  }

  const remoteByOrigin = new Map<
    string,
    { key: string; valuesByLocale: Map<string, string | null> }[]
  >();
  for (const [mapKey, valuesByLocale] of itemsByOriginKey) {
    const separator = mapKey.indexOf('\0');
    const origin = mapKey.slice(0, separator);
    const key = mapKey.slice(separator + 1);
    const list = remoteByOrigin.get(origin) ?? [];
    list.push({ key, valuesByLocale });
    remoteByOrigin.set(origin, list);
  }

  const writtenFiles: string[] = [];
  const prune = config.jsonResources.prune;

  for (const [origin, entries] of [...remoteByOrigin.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const defaultLocaleRelativePath = defaultLocalePathFromOrigin(origin, packagePrefix);
    if (defaultLocaleRelativePath === null) {
      continue;
    }

    for (const locale of locales) {
      const incoming: Record<string, string> = {};
      for (const entry of entries) {
        if (!entry.valuesByLocale.has(locale)) {
          continue;
        }
        const value = entry.valuesByLocale.get(locale);
        if (value == null) {
          continue;
        }
        const jsonKey = toJsonKey(entry.key, reverseOverrides);
        incoming[jsonKey] = value;
      }

      const relativePath = localeFileRelativePath(
        defaultLocaleRelativePath,
        locale,
        defaultLocale,
      );
      const absolutePath = path.resolve(cwd, relativePath);
      const exists = await fileExists(absolutePath);
      if (!exists && Object.keys(incoming).length === 0) {
        continue;
      }

      const existing = exists
        ? await readFlatJsonResource(absolutePath, relativePath)
        : {};
      const merged = mergeLocaleEntries(existing, incoming, prune);
      await writeJsonResourceFile(absolutePath, merged);
      writtenFiles.push(relativePath);
    }
  }

  writtenFiles.sort((a, b) => a.localeCompare(b));

  let generatedFile: string | null = null;
  let typedKeyCount: number | null = null;
  if (config.generated.enabled) {
    const generated = await runGenerate(cwd);
    generatedFile = generated.outputFile;
    typedKeyCount = generated.typedKeyCount;
  }

  return { writtenFiles, generatedFile, typedKeyCount };
}

function collectPullLocales(
  remoteDefaultLocale: string | null,
  remoteLocales: readonly string[],
  configuredLocales: readonly string[],
): string[] {
  const locales = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (typeof value !== 'string') {
      return;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized !== '') {
      locales.add(normalized);
    }
  };
  add(remoteDefaultLocale);
  for (const locale of configuredLocales) {
    add(locale);
  }
  for (const locale of remoteLocales) {
    add(locale);
  }
  return [...locales].sort((a, b) => a.localeCompare(b));
}

function defaultLocalePathFromOrigin(origin: string, packagePrefix: string): string | null {
  if (!origin.startsWith(packagePrefix)) {
    return null;
  }
  let resourcePath = origin.slice(packagePrefix.length);
  if (!resourcePath.startsWith('/')) {
    return null;
  }
  resourcePath = resourcePath.slice(1);
  if (!resourcePath.toLowerCase().endsWith('.json')) {
    return null;
  }
  return resourcePath;
}

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}
