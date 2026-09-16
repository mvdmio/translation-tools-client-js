import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { startFakeTranslationToolsHttp } from '../../../test/support/fake-translation-tools-http.ts';
import { runCli } from '../../../test/support/run-cli.ts';

const repoRoot = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const clientPackageDir = path.join(repoRoot, 'packages/client');

async function projectWith(
  packageName: string,
  files: Record<string, string>,
): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), 'translationtools-generate-'));
  await writeFile(
    path.join(cwd, 'package.json'),
    `${JSON.stringify({ name: packageName, version: '0.0.0', private: true }, null, 2)}\n`,
    'utf8',
  );

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolute = path.join(cwd, relativePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, contents, 'utf8');
  }

  return cwd;
}

function starterYaml(): string {
  return `apiKey: your-project-api-key
defaultLocale: en
locales:
  - en
generated:
  enabled: true
  path: translations/generated.ts
jsonResources:
  resourceDirectories:
    - translations
  prune: false
  keyOverrides: {}
`;
}

function collisionSuffix(origin: string, jsonKey: string): string {
  return createHash('sha256').update(`${origin}\0${jsonKey}`, 'utf8').digest('hex').slice(0, 8);
}

async function typecheckGenerated(cwd: string, generatedRelativePath: string): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  const importPath =
    './' + generatedRelativePath.split(path.sep).join('/').replace(/\.ts$/, '.js');
  const shimPath = path.join(cwd, 'check-generated.ts');
  const tsconfigPath = path.join(cwd, 'tsconfig.check.json');

  await mkdir(path.join(cwd, 'node_modules', '@mvdmio'), { recursive: true });
  await symlink(
    clientPackageDir,
    path.join(cwd, 'node_modules', '@mvdmio', 'translation-tools-client'),
    'junction',
  );

  await writeFile(
    shimPath,
    `import { Translations, TranslationsBundledSnapshot } from '${importPath}';
import type { StoredTranslations, TranslationStringResource } from '@mvdmio/translation-tools-client';

const _t: typeof Translations = Translations;
const _s: StoredTranslations = TranslationsBundledSnapshot;
const _sample: TranslationStringResource | undefined = Object.values(_t)[0];
void _t;
void _s;
void _sample;
`,
    'utf8',
  );

  await writeFile(
    tsconfigPath,
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['check-generated.ts', generatedRelativePath.split(path.sep).join('/')],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  return await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, 'node_modules/typescript/bin/tsc'), '-p', tsconfigPath],
      {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

test('generate writes typed keys and bundled snapshot without API key or HTTP', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
  });
  const fake = await startFakeTranslationToolsHttp();

  try {
    const result = await runCli(['generate'], {
      cwd,
      env: {
        ...process.env,
        TRANSLATIONTOOLS_API_KEY: '',
      },
      baseUrl: fake.baseUrl,
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(fake.requests.length, 0);

    const generated = await readFile(path.join(cwd, 'translations', 'generated.ts'), 'utf8');
    assert.match(generated, /export const Translations/);
    assert.match(generated, /home_title:/);
    assert.match(generated, /origin: "example-app:\/translations\/strings\.json"/);
    assert.match(generated, /key: "home_title"/);
    assert.match(generated, /fallback: "Home"/);
    assert.match(generated, /export const TranslationsBundledSnapshot/);
    assert.match(generated, /lastSuccessfulRefreshAt: null/);

    const check = await typecheckGenerated(cwd, 'translations/generated.ts');
    assert.equal(check.exitCode, 0, `${check.stdout}\n${check.stderr}`);
  } finally {
    await fake.close();
  }
});

test('generate keeps original keys on refs and suffixes colliding sanitized names', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': `${JSON.stringify(
      {
        'home.title': 'Home dot',
        'home-title': 'Home dash',
      },
      null,
      2,
    )}\n`,
  });

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.equal(result.exitCode, 0, result.stderr);

  const generated = await readFile(path.join(cwd, 'translations', 'generated.ts'), 'utf8');
  const origin = 'example-app:/translations/strings.json';
  const suffixDot = collisionSuffix(origin, 'home.title');
  const suffixDash = collisionSuffix(origin, 'home-title');

  assert.match(generated, new RegExp(`home_title__${suffixDot}:`));
  assert.match(generated, new RegExp(`home_title__${suffixDash}:`));
  assert.match(generated, /key: "home\.title"/);
  assert.match(generated, /key: "home-title"/);
  assert.notEqual(suffixDot, suffixDash);
});

test('generate rejects nested JSON and non-string values', async () => {
  const nested = await projectWith('example-app', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': `${JSON.stringify({ home: { title: 'Home' } }, null, 2)}\n`,
  });
  const nestedResult = await runCli(['generate'], {
    cwd: nested,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.notEqual(nestedResult.exitCode, 0);
  assert.match(nestedResult.stderr, /nested/i);

  const nonString = await projectWith('example-app', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': `${JSON.stringify({ home_title: 1 }, null, 2)}\n`,
  });
  const nonStringResult = await runCli(['generate'], {
    cwd: nonString,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.notEqual(nonStringResult.exitCode, 0);
  assert.match(nonStringResult.stderr, /string/i);
});

test('generate rejects keys outside the TranslationTools alphabet', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': `${JSON.stringify({ 'home title': 'Home' }, null, 2)}\n`,
  });

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /Invalid translation key/);
});

test('generate with empty JSON writes an empty Translations object', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': '{}\n',
  });

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.equal(result.exitCode, 0, result.stderr);

  const generated = await readFile(path.join(cwd, 'translations', 'generated.ts'), 'utf8');
  assert.match(generated, /export const Translations = \{\n\};/);
  assert.match(generated, /items: \[\n\s*\],/);
});

test('generate keeps a scoped package name in origin and lowercases the full origin', async () => {
  const cwd = await projectWith('@Org/App', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
  });

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.equal(result.exitCode, 0, result.stderr);

  const generated = await readFile(path.join(cwd, 'translations', 'generated.ts'), 'utf8');
  assert.match(generated, /origin: "@org\/app:\/translations\/strings\.json"/);
});

test('generate fails when package.json name contains a colon', async () => {
  const cwd = await projectWith('bad:name', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
  });

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /must not contain ':'/);
});

test('generate fails clearly when package.json name is missing', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'translationtools-generate-'));
  await writeFile(
    path.join(cwd, 'package.json'),
    `${JSON.stringify({ version: '0.0.0', private: true }, null, 2)}\n`,
    'utf8',
  );
  await writeFile(path.join(cwd, 'translationtools.yaml'), starterYaml(), 'utf8');
  await mkdir(path.join(cwd, 'translations'), { recursive: true });
  await writeFile(
    path.join(cwd, 'translations', 'strings.json'),
    `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
    'utf8',
  );

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /missing a non-empty "name"/);
});

test('locale-suffixed files share one origin; a second base name is a second origin', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
    'translations/strings.nl.json': `${JSON.stringify({ home_title: 'Thuis' }, null, 2)}\n`,
    'translations/errors.json': `${JSON.stringify({ not_found: 'Missing' }, null, 2)}\n`,
  });

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.equal(result.exitCode, 0, result.stderr);

  const generated = await readFile(path.join(cwd, 'translations', 'generated.ts'), 'utf8');
  assert.match(generated, /origin: "example-app:\/translations\/strings\.json"/);
  assert.match(generated, /origin: "example-app:\/translations\/errors\.json"/);
  assert.match(generated, /locale: "en"/);
  assert.match(generated, /locale: "nl"/);
  assert.match(generated, /value: "Thuis"/);
  assert.match(generated, /value: "Missing"/);

  const stringsOriginCount = [...generated.matchAll(/example-app:\/translations\/strings\.json/g)].length;
  assert.ok(stringsOriginCount >= 2);
});

test('keyOverrides change TranslationRef.key but keep the JSON key as the typed identifier source', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': `apiKey: your-project-api-key
defaultLocale: en
locales:
  - en
generated:
  enabled: true
  path: translations/generated.ts
jsonResources:
  resourceDirectories:
    - translations
  prune: false
  keyOverrides:
    home_title: home.title
`,
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
  });

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.equal(result.exitCode, 0, result.stderr);

  const generated = await readFile(path.join(cwd, 'translations', 'generated.ts'), 'utf8');
  assert.match(generated, /home_title:/);
  assert.match(generated, /key: "home\.title"/);
});

test('CLI README documents that renaming the npm package changes origins', async () => {
  const readme = await readFile(path.join(repoRoot, 'packages/cli/README.md'), 'utf8');
  assert.match(readme, /Renaming the npm package changes origins/i);
});
