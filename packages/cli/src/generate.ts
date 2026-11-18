import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  loadClientParser,
  placeholdersOf,
  splitByGlobals,
  type ClientParser,
  type KeyPlaceholders,
} from './client-placeholders.js';
import { configPath, loadConfig } from './config.js';
import {
  buildTranslationProject,
  discoverJsonResourceFiles,
  type JsonResourceProject,
  type TranslationEntry,
} from './json-resources.js';
import { readPackageName } from './origin.js';
import { resolveIdentifierNames } from './sanitize.js';
import { translationRefKey } from './translation-ref.js';

export type GenerateResult = {
  outputFile: string;
  typedKeyCount: number;
};

export async function runGenerate(cwd: string): Promise<GenerateResult> {
  const config = await loadConfig(cwd);
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

  const parser = await loadClientParser(cwd);
  for (const name of config.placeholders.globals) {
    if (!parser.isValidGlobalPlaceholderName(name)) {
      throw new Error(
        `Invalid Placeholder name '${name}' in 'placeholders.globals' of ${configPath(cwd)}. Names must match [a-z][a-zA-Z0-9]*.`,
      );
    }
  }
  const source = renderGeneratedModule(project, parser, config.placeholders.globals);
  const outputFile = path.resolve(cwd, config.generated.path);
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, source, 'utf8');

  return {
    outputFile,
    typedKeyCount: project.entries.length,
  };
}

export function renderGeneratedModule(
  project: JsonResourceProject,
  parser: ClientParser,
  globals: readonly string[],
): string {
  const nameByEntry = resolveIdentifierNames(
    project.entries.map((entry) => ({ origin: entry.origin, jsonKey: entry.jsonKey })),
  );
  const entryId = (entry: TranslationEntry) => translationRefKey(entry.origin, entry.jsonKey);

  const lines: string[] = [];
  lines.push(
    "import type { TranslationStringResource, StoredTranslations } from '@mvdmio/translation-tools-client';",
  );
  lines.push('');
  lines.push('export const Translations = {');

  for (const entry of project.entries) {
    const identifier = nameByEntry.get(entryId(entry))!;
    const fallback = entry.valuesByLocale[project.defaultLocale];
    lines.push(`  ${identifier}: {`);
    lines.push('    ref: {');
    lines.push(`      origin: ${asTsString(entry.origin)},`);
    lines.push(`      key: ${asTsString(entry.translationKey)},`);
    lines.push('    },');
    if (fallback !== undefined) {
      lines.push(`    fallback: ${asTsString(fallback)},`);
    }
    lines.push(`  } as ${resourceType(placeholdersOf(parser, fallback), globals)},`);
  }

  lines.push('};');
  lines.push('');
  lines.push('export const TranslationsBundledSnapshot: StoredTranslations = {');
  lines.push('  projectMetadata: {');
  lines.push(`    locales: [${project.locales.map((locale) => asTsString(locale)).join(', ')}],`);
  lines.push(`    defaultLocale: ${asTsString(project.defaultLocale)},`);
  lines.push('  },');
  lines.push('  snapshots: [');

  for (const locale of project.locales) {
    const items = project.entries
      .map((entry) => {
        const value = entry.valuesByLocale[locale];
        if (value === undefined) {
          return null;
        }
        return { entry, value };
      })
      .filter((item): item is { entry: TranslationEntry; value: string } => item !== null);

    lines.push('    {');
    lines.push(`      locale: ${asTsString(locale)},`);
    lines.push('      items: [');
    for (const item of items) {
      lines.push('        {');
      lines.push('          ref: {');
      lines.push(`            origin: ${asTsString(item.entry.origin)},`);
      lines.push(`            key: ${asTsString(item.entry.translationKey)},`);
      lines.push('          },');
      lines.push(`          value: ${asTsString(item.value)},`);
      lines.push('        },');
    }
    lines.push('      ],');
    lines.push('    },');
  }

  lines.push('  ],');
  lines.push('  lastSuccessfulRefreshAt: null,');
  lines.push('};');
  lines.push('');

  return lines.join('\n');
}

function resourceType(placeholders: KeyPlaceholders, globals: readonly string[]): string {
  const { pluralArgument } = placeholders;
  const { required, optional } = splitByGlobals(placeholders.names, globals);
  const optionalUnion = nameUnion(optional);
  if (pluralArgument === null) {
    return `TranslationStringResource<${nameUnion(required)}, ${optionalUnion}>`;
  }
  const properties = [
    `${pluralArgument}: number`,
    ...required.map((name) => `${name}: string | null | undefined`),
  ];
  return `TranslationStringResource<{ ${properties.join('; ')} }, ${optionalUnion}>`;
}

function nameUnion(names: readonly string[]): string {
  return names.length === 0 ? 'never' : names.map(asTsString).join(' | ');
}

function asTsString(value: string): string {
  return JSON.stringify(value);
}
