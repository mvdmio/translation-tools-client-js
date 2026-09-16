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
import { readPackageName } from './origin.js';

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

  let items: ProjectPushItem[];
  if (config.jsonResources.prune) {
    items = localItems;
  } else {
    const metadata = await http.getProjectMetadata();
    const locales = collectPushLocales(
      metadata.defaultLocale,
      metadata.locales,
      project.locales,
    );
    if (locales.length === 0) {
      throw new Error('TranslationTools project has no locales configured.');
    }

    const remoteByLocale = new Map<string, LocaleTranslationItem[]>();
    for (const locale of locales) {
      remoteByLocale.set(locale, await http.getLocale(locale));
    }
    items = mergeRemoteAndLocalPushItems(remoteByLocale, localItems);
  }

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
): ProjectPushItem[] {
  const merged = new Map<string, ProjectPushItem>();

  for (const [locale, remoteItems] of remoteByLocale) {
    for (const remote of remoteItems) {
      const item: ProjectPushItem = {
        origin: remote.origin,
        locale,
        key: remote.key,
        value: remote.value,
      };
      merged.set(pushItemKey(item), item);
    }
  }

  for (const item of localItems) {
    merged.set(pushItemKey(item), item);
  }

  return sortPushItems([...merged.values()]);
}

function collectPushLocales(
  remoteDefaultLocale: string | null,
  remoteLocales: readonly string[],
  localLocales: readonly string[],
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
  for (const locale of localLocales) {
    add(locale);
  }
  for (const locale of remoteLocales) {
    add(locale);
  }
  return [...locales].sort((a, b) => a.localeCompare(b));
}

function pushItemKey(item: ProjectPushItem): string {
  return `${item.origin}\0${item.locale}\0${item.key}`;
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
