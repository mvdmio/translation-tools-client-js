import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function readPackageName(cwd: string): Promise<string> {
  const packageJsonPath = path.join(cwd, 'package.json');
  let text: string;
  try {
    text = await readFile(packageJsonPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(
        `package.json not found at ${packageJsonPath}. An npm package name is required to build translation origins.`,
      );
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid package.json at ${packageJsonPath}: ${message}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid package.json at ${packageJsonPath}: expected an object.`);
  }

  const name = (parsed as Record<string, unknown>).name;
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error(
      `package.json at ${packageJsonPath} is missing a non-empty "name". An npm package name is required to build translation origins.`,
    );
  }

  if (name.includes(':')) {
    throw new Error(
      `package.json "name" must not contain ':' (got ${JSON.stringify(name)}). Colon is reserved as the origin separator.`,
    );
  }

  return name;
}

/**
 * Build a TranslationTools origin: `{packageName}:/{posix-relative-default-locale-path}`, lowercased.
 * `defaultLocaleRelativePath` is project-relative using `/` separators and no leading slash
 * (e.g. `translations/strings.json`); the leading `/` is added here.
 */
export function buildOrigin(packageName: string, defaultLocaleRelativePath: string): string {
  const normalized = defaultLocaleRelativePath
    .split(path.sep)
    .join('/')
    .replace(/^\/+/, '');
  return `${packageName}:/${normalized}`.toLowerCase();
}
