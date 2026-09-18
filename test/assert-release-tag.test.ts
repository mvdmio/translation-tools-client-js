import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { assertReleaseTag } from '../scripts/assert-release-tag.js';

async function writeWorkspace(root: string, clientVersion: string, cliVersion: string): Promise<void> {
  await mkdir(path.join(root, 'packages', 'client'), { recursive: true });
  await mkdir(path.join(root, 'packages', 'cli'), { recursive: true });
  await writeFile(
    path.join(root, 'packages', 'client', 'package.json'),
    JSON.stringify({ name: '@mvdmio/translation-tools-client', version: clientVersion }),
    'utf8',
  );
  await writeFile(
    path.join(root, 'packages', 'cli', 'package.json'),
    JSON.stringify({ name: '@mvdmio/translation-tools-cli', version: cliVersion }),
    'utf8',
  );
}

test('assertReleaseTag succeeds when the tag matches both package versions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'assert-release-tag-match-'));
  await writeWorkspace(root, '0.1.0', '0.1.0');

  assert.equal(assertReleaseTag('v0.1.0', { root }), '0.1.0');
});

test('assertReleaseTag fails when the tag does not match both package versions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'assert-release-tag-mismatch-'));
  await writeWorkspace(root, '0.1.0', '0.1.0');

  assert.throws(
    () => assertReleaseTag('v0.2.0', { root }),
    /Tag v0\.2\.0 does not match both package versions/,
  );
});

test('assertReleaseTag fails when the two package versions differ', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'assert-release-tag-split-'));
  await writeWorkspace(root, '0.1.0', '0.2.0');

  assert.throws(
    () => assertReleaseTag('v0.1.0', { root }),
    /Tag v0\.1\.0 does not match both package versions/,
  );
});
