import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startFakeTranslationToolsHttp } from '../../../test/support/fake-translation-tools-http.ts';
import { runCli } from '../../../test/support/run-cli.ts';

async function emptyProject(): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), 'translationtools-init-'));
  await writeFile(
    path.join(cwd, 'package.json'),
    `${JSON.stringify({ name: 'example-app', version: '0.0.0', private: true }, null, 2)}\n`,
    'utf8',
  );
  return cwd;
}

test('init writes starter yaml and JSON without API key or HTTP', async () => {
  const cwd = await emptyProject();
  const fake = await startFakeTranslationToolsHttp();

  try {
    const result = await runCli(['init'], {
      cwd,
      env: {
        ...process.env,
        TRANSLATIONTOOLS_API_KEY: '',
      },
      baseUrl: fake.baseUrl,
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(fake.requests.length, 0);

    const yamlText = await readFile(path.join(cwd, 'translationtools.yaml'), 'utf8');
    assert.match(yamlText, /^apiKey:\s+your-project-api-key$/m);
    assert.match(yamlText, /^defaultLocale:\s+en$/m);
    assert.match(yamlText, /^locales:\n\s+-\s+en$/m);
    assert.match(yamlText, /^generated:\n\s+enabled:\s+true\n\s+path:\s+translations\/generated\.ts$/m);
    assert.match(
      yamlText,
      /^jsonResources:\n\s+resourceDirectories:\n\s+-\s+translations\n\s+prune:\s+false\n\s+keyOverrides:\s+\{\}$/m,
    );

    const jsonText = await readFile(path.join(cwd, 'translations', 'strings.json'), 'utf8');
    assert.deepEqual(JSON.parse(jsonText), { home_title: 'Home' });
  } finally {
    await fake.close();
  }
});

test('init refuses to overwrite an existing yaml and leaves files unchanged', async () => {
  const cwd = await emptyProject();
  const yamlPath = path.join(cwd, 'translationtools.yaml');
  const originalYaml = 'apiKey: keep-me\n';
  await writeFile(yamlPath, originalYaml, 'utf8');

  const result = await runCli(['init'], {
    cwd,
    env: {
      ...process.env,
      TRANSLATIONTOOLS_API_KEY: '',
    },
  });

  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /Refusing to overwrite existing files: translationtools\.yaml/);
  assert.equal(await readFile(yamlPath, 'utf8'), originalYaml);

  let missingJson = false;
  try {
    await readFile(path.join(cwd, 'translations', 'strings.json'), 'utf8');
  } catch (error) {
    missingJson = (error as NodeJS.ErrnoException).code === 'ENOENT';
  }
  assert.equal(missingJson, true);
});

test('init refuses to overwrite an existing starter JSON and does not write yaml', async () => {
  const cwd = await emptyProject();
  const jsonPath = path.join(cwd, 'translations', 'strings.json');
  await mkdir(path.dirname(jsonPath), { recursive: true });
  const originalJson = `${JSON.stringify({ home_title: 'Keep' }, null, 2)}\n`;
  await writeFile(jsonPath, originalJson, 'utf8');

  const result = await runCli(['init'], {
    cwd,
    env: {
      ...process.env,
      TRANSLATIONTOOLS_API_KEY: '',
    },
  });

  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /Refusing to overwrite existing files: translations\/strings\.json/);
  assert.equal(await readFile(jsonPath, 'utf8'), originalJson);

  let missingYaml = false;
  try {
    await readFile(path.join(cwd, 'translationtools.yaml'), 'utf8');
  } catch (error) {
    missingYaml = (error as NodeJS.ErrnoException).code === 'ENOENT';
  }
  assert.equal(missingYaml, true);
});

test('a second init exits non-zero and leaves the first files unchanged', async () => {
  const cwd = await emptyProject();

  const first = await runCli(['init'], {
    cwd,
    env: {
      ...process.env,
      TRANSLATIONTOOLS_API_KEY: '',
    },
  });
  assert.equal(first.exitCode, 0, first.stderr);

  const yamlBefore = await readFile(path.join(cwd, 'translationtools.yaml'), 'utf8');
  const jsonBefore = await readFile(path.join(cwd, 'translations', 'strings.json'), 'utf8');

  const second = await runCli(['init'], {
    cwd,
    env: {
      ...process.env,
      TRANSLATIONTOOLS_API_KEY: '',
    },
  });

  assert.notEqual(second.exitCode, 0);
  assert.match(second.stderr, /Refusing to overwrite existing files/);
  assert.equal(await readFile(path.join(cwd, 'translationtools.yaml'), 'utf8'), yamlBefore);
  assert.equal(await readFile(path.join(cwd, 'translations', 'strings.json'), 'utf8'), jsonBefore);
});
