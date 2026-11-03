import { loadConfig, resolveApiKey } from './config.js';
import { createCliHttp, type ProjectPushItem, resolveCliBaseUrl } from './http.js';
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

  const response = await http.postProjectItems(localItems);
  return {
    ...response,
    itemCount: localItems.length,
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
