import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config.js';
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

  const source = renderGeneratedModule(project);
  const outputFile = path.resolve(cwd, config.generated.path);
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, source, 'utf8');

  return {
    outputFile,
    typedKeyCount: project.entries.length,
  };
}

export function renderGeneratedModule(project: JsonResourceProject): string {
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
    lines.push('  } satisfies TranslationStringResource,');
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

function asTsString(value: string): string {
  return JSON.stringify(value);
}
