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

export type PullResult = {
  writtenFiles: string[];
  generatedFile: string | null;
  typedKeyCount: number | null;
};

type OriginPull = {
  defaultLocaleRelativePath: string;
  /** TranslationTools key -> locale -> value. */
  valuesByKey: Map<string, Map<string, string | null>>;
  /** Locales that exist as JSON resource files for this origin. Used when prune is on. */
  localLocales: Set<string>;
};

function originPull(defaultLocaleRelativePath: string): OriginPull {
  return {
    defaultLocaleRelativePath,
    valuesByKey: new Map(),
    localLocales: new Set(),
  };
}

function ensureOriginPull(
  origins: Map<string, OriginPull>,
  defaultLocaleRelativePath: string,
): OriginPull {
  let work = origins.get(defaultLocaleRelativePath);
  if (!work) {
    work = originPull(defaultLocaleRelativePath);
    origins.set(defaultLocaleRelativePath, work);
  }
  return work;
}

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

  const prune = config.jsonResources.prune;
  const originsToWrite = new Map<string, OriginPull>();

  for (const locale of locales) {
    const items = await http.getLocale(locale);
    for (const item of items) {
      if (!originMatchesPackage(item.origin, packageName)) {
        continue;
      }
      const defaultLocaleRelativePath = defaultLocaleRelativePathFromOrigin(
        item.origin,
        packageName,
      );
      if (defaultLocaleRelativePath === null) {
        continue;
      }
      const work = ensureOriginPull(originsToWrite, defaultLocaleRelativePath);
      let byLocale = work.valuesByKey.get(item.key);
      if (!byLocale) {
        byLocale = new Map();
        work.valuesByKey.set(item.key, byLocale);
      }
      byLocale.set(locale, item.value);
    }
  }

  if (prune) {
    const localFiles = await discoverJsonResourceFiles(
      cwd,
      config.jsonResources.resourceDirectories,
      config.defaultLocale,
    );
    for (const file of localFiles) {
      ensureOriginPull(originsToWrite, file.defaultLocaleRelativePath).localLocales.add(
        file.locale,
      );
    }
  }

  const writtenFiles: string[] = [];

  for (const work of [...originsToWrite.values()].sort((a, b) =>
    a.defaultLocaleRelativePath.localeCompare(b.defaultLocaleRelativePath),
  )) {
    const localesForOrigin = new Set([...locales, ...work.localLocales]);

    for (const locale of [...localesForOrigin].sort((a, b) => a.localeCompare(b))) {
      const incoming: Record<string, string> = {};
      for (const [key, valuesByLocale] of work.valuesByKey) {
        if (!valuesByLocale.has(locale)) {
          continue;
        }
        const value = valuesByLocale.get(locale);
        if (value == null) {
          continue;
        }
        incoming[toJsonKey(key, reverseOverrides)] = value;
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
