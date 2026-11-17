import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { populateRepoCopy, runNpmScript } from './support/repo-copy.ts';

test('npm run build recreates a deleted dist folder and a deleted dist file', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'tt-build-recreates-dist-'));
  try {
    await populateRepoCopy(cwd);

    const firstBuild = await runNpmScript('build', cwd);
    assert.equal(firstBuild.exitCode, 0, firstBuild.output);

    await rm(path.join(cwd, 'packages/client/dist'), { recursive: true, force: true });
    await rm(path.join(cwd, 'packages/cli/dist/bin.js'), { force: true });

    const secondBuild = await runNpmScript('build', cwd);
    assert.equal(secondBuild.exitCode, 0, secondBuild.output);
    assert.equal(existsSync(path.join(cwd, 'packages/client/dist/index.js')), true);
    assert.equal(existsSync(path.join(cwd, 'packages/client/dist/index.d.ts')), true);
    assert.equal(existsSync(path.join(cwd, 'packages/cli/dist/bin.js')), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
