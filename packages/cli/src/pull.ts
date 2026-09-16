import path from 'node:path';
import { loadConfig, resolveApiKey } from './config.js';
import { fileExists } from './fs.js';
import { runGenerate } from './generate.js';
import { createCliHttp, resolveCliBaseUrl } from './http.js';
import {
  discoverJsonResourceFiles,
  jsonResourceRelativePath,
  mergeLocaleEntries,
  readFlatJsonResource,
  reverseKeyOverrides,
  toJsonKey,
  writeJsonResourceFile,
} from './json-resources.js';
import { collectLocales } from './locales.js';
import {
  defaultLocaleRelativePathFromOrigin,
  originMatchesPackage,
  readPackageName,
} from './origin.js';
import { splitTranslationRefKey, translationRefKey } from './translation-ref.js';

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
  const defaultLocale = config.defaultLocale.trim().toLowerCase();
  const reverseOverrides = reverseKeyOverrides(config.jsonResources.keyOverrides);
  const baseUrl = resolveCliBaseUrl(env);
  const http = createCliHttp({ apiKey, baseUrl });

  const metadata = await http.getProjectMetadata();
  const locales = collectLocales(metadata.defaultLocale, metadata.locales, config.locales);
  if (locales.length === 0) {
    throw new Error('TranslationTools project has no locales configured.');
  }

  const itemsByOriginKey = new Map<string, Map<string, string | null>>();
  for (const locale of locales) {
    const items = await http.getLocale(locale);
    for (const item of items) {
      if (!originMatchesPackage(item.origin, packageName)) {
        continue;
      }
      const mapKey = translationRefKey(item.origin, item.key);
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
    const { origin, key } = splitTranslationRefKey(mapKey);
    const list = remoteByOrigin.get(origin) ?? [];
    list.push({ key, valuesByLocale });
    remoteByOrigin.set(origin, list);
  }

  const prune = config.jsonResources.prune;
  const localFiles = prune
    ? await discoverJsonResourceFiles(
        cwd,
        config.jsonResources.resourceDirectories,
        config.defaultLocale,
      )
    : [];

  type OriginPull = {
    defaultLocaleRelativePath: string;
    entries: { key: string; valuesByLocale: Map<string, string | null> }[];
  };

  const originsToWrite = new Map<string, OriginPull>();
  for (const [origin, entries] of remoteByOrigin) {
    const defaultLocaleRelativePath = defaultLocaleRelativePathFromOrigin(origin, packageName);
    if (defaultLocaleRelativePath === null) {
      continue;
    }
    originsToWrite.set(defaultLocaleRelativePath, { defaultLocaleRelativePath, entries });
  }

  if (prune) {
    for (const file of localFiles) {
      if (!originsToWrite.has(file.defaultLocaleRelativePath)) {
        originsToWrite.set(file.defaultLocaleRelativePath, {
          defaultLocaleRelativePath: file.defaultLocaleRelativePath,
          entries: [],
        });
      }
    }
  }

  const writtenFiles: string[] = [];

  for (const work of [...originsToWrite.values()].sort((a, b) =>
    a.defaultLocaleRelativePath.localeCompare(b.defaultLocaleRelativePath),
  )) {
    const localesForOrigin = new Set(locales);
    if (prune) {
      for (const file of localFiles) {
        if (file.defaultLocaleRelativePath === work.defaultLocaleRelativePath) {
          localesForOrigin.add(file.locale);
        }
      }
    }

    for (const locale of [...localesForOrigin].sort((a, b) => a.localeCompare(b))) {
      const incoming: Record<string, string> = {};
      for (const entry of work.entries) {
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

      const relativePath = jsonResourceRelativePath(
        work.defaultLocaleRelativePath,
        locale,
        defaultLocale,
      );
      const absolutePath = path.resolve(cwd, relativePath);
      const exists = await fileExists(absolutePath);
      if (!exists && Object.keys(incoming).length === 0) {
        continue;
      }

      const existing = exists ? await readFlatJsonResource(absolutePath, relativePath) : {};
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
