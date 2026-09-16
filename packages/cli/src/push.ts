import { loadConfig, resolveApiKey } from './config.js';
import {
  createCliHttp,
  type LocaleTranslationItem,
  type ProjectPushItem,
  resolveCliBaseUrl,
} from './http.js';
import {
  buildTranslationProject,
  discoverJsonResourceFiles,
  type JsonResourceProject,
} from './json-resources.js';
import { collectLocales } from './locales.js';
import { originMatchesPackage, readPackageName } from './origin.js';
import { translationPushKey } from './translation-ref.js';

export type PushResult = {
  receivedKeyCount: number;
  createdKeyCount: number;
  updatedKeyCount: number;
  removedKeyCount: number;
  itemCount: number;
};

export async function runPush(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PushResult> {
  const config = await loadConfig(cwd);
  const apiKey = resolveApiKey(config, env);
  if (apiKey === undefined) {
    throw new Error(
      'Missing TranslationTools API key. Set TRANSLATIONTOOLS_API_KEY or apiKey in translationtools.yaml.',
    );
  }

  const packageName = await readPackageName(cwd);
  const files = await discoverJsonResourceFiles(
    cwd,
    config.jsonResources.resourceDirectories,
    config.defaultLocale,
  );
  const project = buildTranslationProject(
    files,
    packageName,
    config.defaultLocale,
    config.jsonResources.keyOverrides,
  );

  const localItems = toPushItems(project);
  const baseUrl = resolveCliBaseUrl(env);
  const http = createCliHttp({ apiKey, baseUrl });

  const metadata = await http.getProjectMetadata();
  const locales = collectLocales(metadata.defaultLocale, metadata.locales, project.locales);
  if (locales.length === 0) {
    throw new Error('TranslationTools project has no locales configured.');
  }

  const remoteByLocale = new Map<string, LocaleTranslationItem[]>();
  for (const locale of locales) {
    remoteByLocale.set(locale, await http.getLocale(locale));
  }

  const items = mergeRemoteAndLocalPushItems(remoteByLocale, localItems, {
    prunePackageName: config.jsonResources.prune ? packageName : null,
  });

  const response = await http.postProjectItems(items);
  return {
    ...response,
    itemCount: items.length,
  };
}

export function toPushItems(project: JsonResourceProject): ProjectPushItem[] {
  const items: ProjectPushItem[] = [];
  for (const entry of project.entries) {
    for (const [locale, value] of Object.entries(entry.valuesByLocale)) {
      items.push({
        origin: entry.origin,
        locale,
        key: entry.translationKey,
        value,
      });
    }
  }
  return sortPushItems(items);
}

/** Merge remote locale snapshots with local push items. Local wins on origin+locale+key. */
export function mergeRemoteAndLocalPushItems(
  remoteByLocale: ReadonlyMap<string, readonly LocaleTranslationItem[]>,
  localItems: readonly ProjectPushItem[],
  options?: { prunePackageName?: string | null },
): ProjectPushItem[] {
  const merged = new Map<string, ProjectPushItem>();
  const prunePackageName = options?.prunePackageName ?? null;

  for (const [locale, remoteItems] of remoteByLocale) {
    for (const remote of remoteItems) {
      if (prunePackageName != null && originMatchesPackage(remote.origin, prunePackageName)) {
        continue;
      }
      const item: ProjectPushItem = {
        origin: remote.origin,
        locale,
        key: remote.key,
        value: remote.value,
      };
      merged.set(translationPushKey(item.origin, item.locale, item.key), item);
    }
  }

  for (const item of localItems) {
    merged.set(translationPushKey(item.origin, item.locale, item.key), item);
  }

  return sortPushItems([...merged.values()]);
}

function sortPushItems(items: readonly ProjectPushItem[]): ProjectPushItem[] {
  return [...items].sort((a, b) => {
    const byOrigin = a.origin.localeCompare(b.origin);
    if (byOrigin !== 0) {
      return byOrigin;
    }
    const byLocale = a.locale.localeCompare(b.locale);
    if (byLocale !== 0) {
      return byLocale;
    }
    return a.key.localeCompare(b.key);
  });
}
