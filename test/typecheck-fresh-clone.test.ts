import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { populateRepoCopy, runNpmScript } from './support/repo-copy.ts';

test('npm run typecheck passes on a fresh copy with no build output', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'tt-typecheck-fresh-clone-'));
  try {
    await populateRepoCopy(cwd);

    const result = await runNpmScript('typecheck', cwd);
    assert.equal(result.exitCode, 0, result.output);
    assert.doesNotMatch(result.output, /error TS\d+/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
