import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

export const CONFIG_FILE_NAME = 'translationtools.yaml';
export const DEFAULT_RESOURCE_DIRECTORY = 'translations';
export const STARTER_JSON_RELATIVE_PATH = path.join(DEFAULT_RESOURCE_DIRECTORY, 'strings.json');
export const DEFAULT_GENERATED_PATH = path.join(DEFAULT_RESOURCE_DIRECTORY, 'generated.ts');
export const DEFAULT_LOCALE = 'en';

export type GeneratedConfig = {
  enabled: boolean;
  path: string;
};

export type JsonResourcesConfig = {
  resourceDirectories: string[];
  prune: boolean;
  keyOverrides: Record<string, string>;
};

export type TranslationToolsConfig = {
  apiKey: string | undefined;
  defaultLocale: string;
  locales: string[];
  generated: GeneratedConfig;
  jsonResources: JsonResourcesConfig;
};

export function renderDefaultConfig(): string {
  return `apiKey: your-project-api-key
defaultLocale: en
locales:
  - en
generated:
  enabled: true
  path: translations/generated.ts
jsonResources:
  resourceDirectories:
    - translations
  prune: false
  keyOverrides: {}
`;
}

export function renderStarterJson(): string {
  return `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`;
}

export function configPath(cwd: string): string {
  return path.join(cwd, CONFIG_FILE_NAME);
}

export function starterJsonPath(cwd: string): string {
  return path.join(cwd, STARTER_JSON_RELATIVE_PATH);
}

export async function loadConfig(cwd: string): Promise<TranslationToolsConfig> {
  const file = configPath(cwd);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(
        `TranslationTools config file not found: ${file}. Run \`translationtools init\` first.`,
      );
    }
    throw error;
  }
  return parseConfig(text, file);
}

export function parseConfig(text: string, filePath: string): TranslationToolsConfig {
  let loaded: unknown;
  try {
    loaded = parseYaml(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid TranslationTools config: ${filePath}: ${message}`);
  }

  if (loaded === null || typeof loaded !== 'object' || Array.isArray(loaded)) {
    throw new Error(`Invalid TranslationTools config: ${filePath}`);
  }

  const root = loaded as Record<string, unknown>;

  if (Object.prototype.hasOwnProperty.call(root, 'snapshotFile')) {
    throw new Error(
      'snapshotFile is no longer supported. Use the default project-root snapshot.json path.',
    );
  }

  const apiKey = typeof root.apiKey === 'string' ? root.apiKey : undefined;
  const defaultLocale =
    typeof root.defaultLocale === 'string' && root.defaultLocale.trim() !== ''
      ? root.defaultLocale
      : DEFAULT_LOCALE;

  if (root.locales !== undefined && !Array.isArray(root.locales)) {
    throw new Error(
      `'locales' in ${filePath} must be a YAML list, not ${valueKind(root.locales)}. Example:\nlocales:\n  - en\n  - nl`,
    );
  }
  const locales = Array.isArray(root.locales)
    ? root.locales.map((locale) => String(locale))
    : [];

  if (root.generated !== undefined && !isPlainObject(root.generated)) {
    throw new Error(`'generated' in ${filePath} must be a YAML map.`);
  }
  const generatedRaw = isPlainObject(root.generated) ? root.generated : undefined;
  if (generatedRaw && Object.prototype.hasOwnProperty.call(generatedRaw, 'objectName')) {
    throw new Error(
      `'generated.objectName' is no longer supported. The generated object is always named 'Translations'. Remove this key from ${filePath}.`,
    );
  }

  let enabled = true;
  if (generatedRaw && Object.prototype.hasOwnProperty.call(generatedRaw, 'enabled')) {
    if (typeof generatedRaw.enabled !== 'boolean') {
      throw new Error(
        `'generated.enabled' in ${filePath} must be a boolean, not ${valueKind(generatedRaw.enabled)}.`,
      );
    }
    enabled = generatedRaw.enabled;
  }

  const generatedPath =
    generatedRaw && typeof generatedRaw.path === 'string' && generatedRaw.path.trim() !== ''
      ? generatedRaw.path
      : DEFAULT_GENERATED_PATH;

  if (root.jsonResources !== undefined && !isPlainObject(root.jsonResources)) {
    throw new Error(`'jsonResources' in ${filePath} must be a YAML map.`);
  }
  const jsonResourcesRaw = isPlainObject(root.jsonResources) ? root.jsonResources : undefined;

  if (
    jsonResourcesRaw?.resourceDirectories !== undefined &&
    !Array.isArray(jsonResourcesRaw.resourceDirectories)
  ) {
    throw new Error(`'jsonResources.resourceDirectories' in ${filePath} must be a YAML list.`);
  }
  const resourceDirectories = Array.isArray(jsonResourcesRaw?.resourceDirectories)
    ? jsonResourcesRaw.resourceDirectories.map((directory) => String(directory))
    : [DEFAULT_RESOURCE_DIRECTORY];

  const keyOverridesRaw = jsonResourcesRaw?.keyOverrides;
  if (keyOverridesRaw !== undefined && !isPlainObject(keyOverridesRaw)) {
    throw new Error(`'jsonResources.keyOverrides' in ${filePath} must be a YAML map.`);
  }
  const keyOverrides: Record<string, string> = {};
  if (isPlainObject(keyOverridesRaw)) {
    for (const [key, value] of Object.entries(keyOverridesRaw)) {
      keyOverrides[key] = String(value);
    }
  }

  let prune = false;
  if (jsonResourcesRaw && Object.prototype.hasOwnProperty.call(jsonResourcesRaw, 'prune')) {
    if (typeof jsonResourcesRaw.prune !== 'boolean') {
      throw new Error(
        `'jsonResources.prune' in ${filePath} must be a boolean, not ${valueKind(jsonResourcesRaw.prune)}.`,
      );
    }
    prune = jsonResourcesRaw.prune;
  }

  return {
    apiKey,
    defaultLocale,
    locales,
    generated: {
      enabled,
      path: generatedPath,
    },
    jsonResources: {
      resourceDirectories,
      prune,
      keyOverrides,
    },
  };
}

export function resolveApiKey(config: TranslationToolsConfig, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const fromEnv = env.TRANSLATIONTOOLS_API_KEY;
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    return fromEnv;
  }
  if (typeof config.apiKey === 'string' && config.apiKey.trim() !== '') {
    return config.apiKey;
  }
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function valueKind(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}
