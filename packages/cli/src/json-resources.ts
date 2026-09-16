import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildOrigin } from './origin.js';

export const TRANSLATION_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

/** Locale suffix: language, optionally with region segments (`en`, `pt-br`, `zh-hans`). */
const LOCALE_SUFFIX_PATTERN = /^[a-z]{2}(?:-[a-z0-9]+)*$/i;

export type JsonResourceFile = {
  /** Absolute path to the file on disk. */
  absolutePath: string;
  /** Project-relative path using `/` separators (no leading slash). */
  relativePath: string;
  /** Project-relative path of the default-locale file for this origin. */
  defaultLocaleRelativePath: string;
  locale: string;
  /** Flat string map; empty object when the file is `{}`. */
  entries: Record<string, string>;
};

export type TranslationEntry = {
  origin: string;
  /** Key as written in the JSON resource file. */
  jsonKey: string;
  /** TranslationTools key after keyOverrides. */
  translationKey: string;
  valuesByLocale: Record<string, string>;
};

export type JsonResourceProject = {
  defaultLocale: string;
  locales: string[];
  entries: TranslationEntry[];
};

export async function discoverJsonResourceFiles(
  cwd: string,
  resourceDirectories: readonly string[],
  defaultLocale: string,
): Promise<JsonResourceFile[]> {
  const normalizedDefault = defaultLocale.trim().toLowerCase();
  const discovered: JsonResourceFile[] = [];

  for (const directory of resourceDirectories) {
    const absoluteDirectory = path.resolve(cwd, directory);
    let names: string[];
    try {
      names = await readdir(absoluteDirectory);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    for (const name of names.sort()) {
      if (!name.toLowerCase().endsWith('.json')) {
        continue;
      }

      const absolutePath = path.join(absoluteDirectory, name);
      const relativePath = path
        .relative(cwd, absolutePath)
        .split(path.sep)
        .join('/');

      const parsed = parseResourceFileName(name, normalizedDefault);
      if (!parsed) {
        continue;
      }

      const defaultLocaleRelativePath = path
        .relative(cwd, path.join(absoluteDirectory, parsed.defaultLocaleFileName))
        .split(path.sep)
        .join('/');

      const entries = await readFlatJsonResource(absolutePath, relativePath);
      discovered.push({
        absolutePath,
        relativePath,
        defaultLocaleRelativePath,
        locale: parsed.locale,
        entries,
      });
    }
  }

  const collisions = new Map<string, string[]>();
  for (const file of discovered) {
    const key = `${file.locale}\0${file.defaultLocaleRelativePath}`;
    const group = collisions.get(key);
    if (group) {
      group.push(file.relativePath);
    } else {
      collisions.set(key, [file.relativePath]);
    }
  }
  for (const [, files] of collisions) {
    if (files.length > 1) {
      throw new Error(
        `Multiple JSON resource files normalize to the same locale and origin base: ${files.join(', ')}`,
      );
    }
  }

  return discovered;
}

export function parseResourceFileName(
  fileName: string,
  defaultLocale: string,
): { locale: string; defaultLocaleFileName: string } | null {
  if (!fileName.toLowerCase().endsWith('.json')) {
    return null;
  }

  const withoutExtension = fileName.slice(0, -'.json'.length);
  const lastDot = withoutExtension.lastIndexOf('.');
  if (lastDot === -1) {
    return {
      locale: defaultLocale,
      defaultLocaleFileName: fileName,
    };
  }

  const localeCandidate = withoutExtension.slice(lastDot + 1);
  if (!LOCALE_SUFFIX_PATTERN.test(localeCandidate)) {
    // Treat as a default-locale file whose base name contains a dot.
    return {
      locale: defaultLocale,
      defaultLocaleFileName: fileName,
    };
  }

  const baseName = withoutExtension.slice(0, lastDot);
  if (baseName === '') {
    return null;
  }

  return {
    locale: localeCandidate.toLowerCase(),
    defaultLocaleFileName: `${baseName}.json`,
  };
}

export async function readFlatJsonResource(
  absolutePath: string,
  displayPath: string,
): Promise<Record<string, string>> {
  let text: string;
  try {
    text = await readFile(absolutePath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(`JSON resource file not found: ${displayPath}`);
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${displayPath}: ${message}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `Invalid JSON resource file ${displayPath}: expected a flat object of string values.`,
    );
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value !== null && typeof value === 'object') {
      throw new Error(
        `Invalid JSON resource file ${displayPath}: nested values are not allowed (key ${JSON.stringify(key)}).`,
      );
    }
    if (typeof value !== 'string') {
      throw new Error(
        `Invalid JSON resource file ${displayPath}: values must be strings (key ${JSON.stringify(key)} has type ${valueKind(value)}).`,
      );
    }
    result[key] = value;
  }

  return result;
}

export function buildTranslationProject(
  files: readonly JsonResourceFile[],
  packageName: string,
  defaultLocale: string,
  keyOverrides: Readonly<Record<string, string>>,
): JsonResourceProject {
  const normalizedDefault = defaultLocale.trim().toLowerCase();
  const collected = new Map<
    string,
    {
      origin: string;
      jsonKey: string;
      translationKey: string;
      valuesByLocale: Record<string, string>;
    }
  >();

  for (const file of files) {
    const origin = buildOrigin(packageName, file.defaultLocaleRelativePath);
    for (const [jsonKey, value] of Object.entries(file.entries)) {
      const translationKey = keyOverrides[jsonKey] ?? jsonKey;
      if (!TRANSLATION_KEY_PATTERN.test(translationKey)) {
        throw new Error(
          `Invalid translation key ${JSON.stringify(translationKey)} in ${file.relativePath}: keys must match ${TRANSLATION_KEY_PATTERN}.`,
        );
      }

      const mapKey = `${origin}\0${jsonKey}`;
      let entry = collected.get(mapKey);
      if (!entry) {
        entry = {
          origin,
          jsonKey,
          translationKey,
          valuesByLocale: {},
        };
        collected.set(mapKey, entry);
      } else if (entry.translationKey !== translationKey) {
        throw new Error(
          `Conflicting key overrides for JSON key ${JSON.stringify(jsonKey)} under origin ${origin}.`,
        );
      }
      entry.valuesByLocale[file.locale] = value;
    }
  }

  const locales = [...new Set(files.map((file) => file.locale))].sort();
  const entries = [...collected.values()].sort((a, b) => {
    const byKey = a.jsonKey.localeCompare(b.jsonKey);
    if (byKey !== 0) {
      return byKey;
    }
    return a.origin.localeCompare(b.origin);
  });

  return {
    defaultLocale: normalizedDefault,
    locales,
    entries,
  };
}

/** Pretty-printed JSON resource file: sorted keys, 2-space indent, trailing newline. */
export function formatJsonResource(entries: Readonly<Record<string, string>>): string {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(entries).sort((a, b) => a.localeCompare(b))) {
    sorted[key] = entries[key]!;
  }
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

export async function writeJsonResourceFile(
  absolutePath: string,
  entries: Readonly<Record<string, string>>,
): Promise<void> {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, formatJsonResource(entries), 'utf8');
}

/**
 * Project-relative path of the locale file for a default-locale JSON resource path.
 * Default locale keeps the unsuffixed name; others use `name.{locale}.json`.
 */
export function localeFileRelativePath(
  defaultLocaleRelativePath: string,
  locale: string,
  defaultLocale: string,
): string {
  const normalizedLocale = locale.trim().toLowerCase();
  const normalizedDefault = defaultLocale.trim().toLowerCase();
  const posixPath = defaultLocaleRelativePath.split(path.sep).join('/');
  if (normalizedLocale === normalizedDefault) {
    return posixPath;
  }

  const slash = posixPath.lastIndexOf('/');
  const directory = slash === -1 ? '' : posixPath.slice(0, slash + 1);
  const fileName = slash === -1 ? posixPath : posixPath.slice(slash + 1);
  if (!fileName.toLowerCase().endsWith('.json')) {
    throw new Error(
      `Default-locale resource path must end with .json (got ${JSON.stringify(defaultLocaleRelativePath)}).`,
    );
  }
  const baseName = fileName.slice(0, -'.json'.length);
  return `${directory}${baseName}.${normalizedLocale}.json`;
}

/**
 * Merge server values into a local locale file map.
 * prune=false keeps local-only keys; prune=true keeps only server keys for this write.
 */
export function mergeLocaleEntries(
  existing: Readonly<Record<string, string>>,
  incoming: Readonly<Record<string, string>>,
  prune: boolean,
): Record<string, string> {
  if (prune) {
    return { ...incoming };
  }
  return { ...existing, ...incoming };
}

/** Reverse jsonResources.keyOverrides (JSON key → TT key) to map server keys back to JSON keys. */
export function reverseKeyOverrides(
  keyOverrides: Readonly<Record<string, string>>,
): Map<string, string> {
  const reverse = new Map<string, string>();
  for (const [jsonKey, translationKey] of Object.entries(keyOverrides)) {
    const existing = reverse.get(translationKey);
    if (existing !== undefined && existing !== jsonKey) {
      throw new Error(
        `Conflicting keyOverrides: JSON keys ${JSON.stringify(existing)} and ${JSON.stringify(jsonKey)} both map to TranslationTools key ${JSON.stringify(translationKey)}.`,
      );
    }
    reverse.set(translationKey, jsonKey);
  }
  return reverse;
}

export function toJsonKey(
  translationKey: string,
  reverseOverrides: ReadonlyMap<string, string>,
): string {
  return reverseOverrides.get(translationKey) ?? translationKey;
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
