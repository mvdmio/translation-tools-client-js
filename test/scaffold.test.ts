import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { startFakeTranslationToolsHttp } from './support/fake-translation-tools-http.ts';
import { runCli } from './support/run-cli.ts';

test('client package is importable', async () => {
  const mod = await import('@mvdmio/translation-tools-client');
  assert.equal(typeof mod, 'object');
  assert.equal('parsePlaceholderSegments' in mod, false);
  assert.equal('substitutePlaceholders' in mod, false);
  assert.equal('createGlobalPlaceholderRegistry' in mod, false);
  assert.equal(typeof mod.createClient, 'function');
});

test('client and CLI packages expose type declarations', async () => {
  const { access, readFile } = await import('node:fs/promises');
  const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
  const clientTypes = path.join(repoRoot, 'packages/client/dist/index.d.ts');
  const cliTypes = path.join(repoRoot, 'packages/cli/dist/bin.d.ts');
  const cliPkg = JSON.parse(
    await readFile(path.join(repoRoot, 'packages/cli/package.json'), 'utf8'),
  ) as { bin: { translationtools: string } };

  assert.equal(cliPkg.bin.translationtools, './dist/bin.js');
  await access(clientTypes);
  await access(cliTypes);
  assert.equal(
    fileURLToPath(import.meta.resolve('@mvdmio/translation-tools-client')),
    path.join(repoRoot, 'packages/client/dist/index.js'),
  );
});

test('fake TranslationTools HTTP records GET path and Authorization', async () => {
  const fake = await startFakeTranslationToolsHttp();
  try {
    fake.respond('GET', '/api/v1/translations/project', {
      json: { locales: ['en'], defaultLocale: 'en' },
    });

    const response = await fetch(`${fake.baseUrl}/api/v1/translations/project`, {
      headers: { Authorization: 'test-api-key' },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { locales: ['en'], defaultLocale: 'en' });
    assert.equal(fake.requests.length, 1);
    assert.equal(fake.requests[0]?.method, 'GET');
    assert.equal(fake.requests[0]?.path, '/api/v1/translations/project');
    assert.equal(fake.requests[0]?.headers.authorization, 'test-api-key');
  } finally {
    await fake.close();
  }
});

test('runCli spawns translationtools and captures exit code and stdout', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'translationtools-cli-'));
  const result = await runCli(['--help'], {
    cwd,
    apiKey: 'unused-for-help',
    baseUrl: 'http://127.0.0.1:9',
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Usage: translationtools/);
  assert.equal(result.stderr, '');
});

test('unknown command exits non-zero', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'translationtools-cli-'));
  const result = await runCli(['nope'], {
    cwd,
    apiKey: 'unused',
    baseUrl: 'http://127.0.0.1:9',
  });

  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /Unknown command: nope/);
});
