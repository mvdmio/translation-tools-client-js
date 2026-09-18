import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Ensure a release tag (with leading `v`) matches both workspace package versions.
 * @param {string} tag
 * @param {{ root?: string }} [options]
 * @returns {string} version without the leading `v`
 */
export function assertReleaseTag(tag, options = {}) {
  const root = options.root ?? defaultRoot;

  if (typeof tag !== 'string' || tag.length === 0) {
    throw new Error('Release tag is required (for example v0.1.0)');
  }

  if (!tag.startsWith('v')) {
    throw new Error(`Release tag must start with "v" (got ${JSON.stringify(tag)})`);
  }

  const expected = tag.slice(1);
  if (expected.length === 0) {
    throw new Error(`Release tag has no version after "v" (got ${JSON.stringify(tag)})`);
  }

  const clientVersion = readPackageVersion(path.join(root, 'packages', 'client', 'package.json'));
  const cliVersion = readPackageVersion(path.join(root, 'packages', 'cli', 'package.json'));

  if (clientVersion !== expected || cliVersion !== expected) {
    throw new Error(
      `Tag ${tag} does not match both package versions ` +
        `(client=${clientVersion}, cli=${cliVersion}; expected ${expected})`,
    );
  }

  return expected;
}

/**
 * @param {string} packageJsonPath
 * @returns {string}
 */
function readPackageVersion(packageJsonPath) {
  const raw = readFileSync(packageJsonPath, 'utf8');
  const manifest = JSON.parse(raw);
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`Missing version in ${packageJsonPath}`);
  }
  return manifest.version;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
  try {
    const version = assertReleaseTag(tag);
    console.log(`Release tag matches both packages at ${version}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
