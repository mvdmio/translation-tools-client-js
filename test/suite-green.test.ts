import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const cliPackageDir = path.join(repoRoot, 'packages/cli');
const clientPackageDir = path.join(repoRoot, 'packages/client');

type SpawnResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

async function run(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<SpawnResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function linkPackage(
  cwd: string,
  packageName: string,
  packageDir: string,
): Promise<void> {
  const parts = packageName.startsWith('@')
    ? packageName.split('/')
    : [packageName];
  const linkParent = path.join(cwd, 'node_modules', ...parts.slice(0, -1));
  await mkdir(linkParent, { recursive: true });
  await symlink(packageDir, path.join(cwd, 'node_modules', ...parts), 'junction');
}

/** Mimic npm's node_modules/.bin layout for the translationtools CLI. */
async function linkCliBin(cwd: string): Promise<string> {
  const binDir = path.join(cwd, 'node_modules', '.bin');
  await mkdir(binDir, { recursive: true });
  const binJs = path.join(
    cwd,
    'node_modules',
    '@mvdmio',
    'translation-tools-cli',
    'dist',
    'bin.js',
  );

  if (process.platform === 'win32') {
    const cmdPath = path.join(binDir, 'translationtools.cmd');
    await writeFile(
      cmdPath,
      `@ECHO off\r\n"${process.execPath}" "%~dp0\\..\\@mvdmio\\translation-tools-cli\\dist\\bin.js" %*\r\n`,
      'utf8',
    );
    return cmdPath;
  }

  const binPath = path.join(binDir, 'translationtools');
  await writeFile(
    binPath,
    `#!/bin/sh\nexec "${process.execPath}" "${binJs}" "$@"\n`,
    { encoding: 'utf8', mode: 0o755 },
  );
  return binPath;
}

const bundledSnapshotLiteral = `{
  projectMetadata: { locales: ['en'], defaultLocale: 'en' },
  snapshots: [
    {
      locale: 'en',
      items: [
        {
          ref: { origin: 'consumer-app:/translations/strings.json', key: 'home_title' },
          value: 'Home',
        },
      ],
    },
  ],
  lastSuccessfulRefreshAt: null,
}`;

test('npx-style translationtools bin works from a consumer-shaped temp project', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'translationtools-npx-'));
  await writeFile(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(
      {
        name: 'consumer-app',
        version: '0.0.0',
        private: true,
        type: 'module',
        devDependencies: {
          '@mvdmio/translation-tools-cli': '0.0.0',
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  await linkPackage(cwd, '@mvdmio/translation-tools-cli', cliPackageDir);
  const binPath = await linkCliBin(cwd);
  assert.equal(await fileExists(binPath), true);
  assert.equal(
    await fileExists(
      path.join(cwd, 'node_modules', '@mvdmio', 'translation-tools-cli', 'dist', 'bin.js'),
    ),
    true,
  );

  // Consumer layout: package linked under node_modules + npm-style .bin shim.
  // Invoke through the local package bin path (what npx resolves to without a global install).
  const packageBin = path.join(
    cwd,
    'node_modules',
    '@mvdmio',
    'translation-tools-cli',
    'dist',
    'bin.js',
  );
  const result = await run(process.execPath, [packageBin, 'init'], {
    cwd,
    env: {
      ...process.env,
      TRANSLATIONTOOLS_API_KEY: '',
    },
  });
  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /Created .*translationtools\.yaml/);
  assert.equal(await fileExists(path.join(cwd, 'translationtools.yaml')), true);
  assert.equal(await fileExists(path.join(cwd, 'translations', 'strings.json')), true);

  const help = await run(process.execPath, [packageBin, '--help'], { cwd });
  assert.equal(help.exitCode, 0, help.stderr);
  assert.match(help.stdout, /Usage: translationtools/);
});

test('JavaScript consumer looks up a bundled string without using types', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'translationtools-js-consumer-'));
  await writeFile(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(
      {
        name: 'consumer-app',
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies: {
          '@mvdmio/translation-tools-client': '0.0.0',
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  await linkPackage(cwd, '@mvdmio/translation-tools-client', clientPackageDir);

  await writeFile(
    path.join(cwd, 'lookup.mjs'),
    `import { createClient } from '@mvdmio/translation-tools-client';

const client = createClient({
  apiKey: 'js-consumer-key',
  bundledSnapshot: ${bundledSnapshotLiteral},
  backgroundRefreshEnabled: false,
  heartbeatEnabled: false,
  baseUrl: 'http://127.0.0.1:9',
});
await client.initialize();
const value = await client.get(
  { origin: 'consumer-app:/translations/strings.json', key: 'home_title' },
  'en',
);
client.dispose();
process.stdout.write(value ?? '');
`,
    'utf8',
  );

  const result = await run(process.execPath, ['lookup.mjs'], { cwd });
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.stdout, 'Home');
});

test('TypeScript consumer looks up a bundled string successfully', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'translationtools-ts-consumer-'));
  await writeFile(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(
      {
        name: 'consumer-app',
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies: {
          '@mvdmio/translation-tools-client': '0.0.0',
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  await linkPackage(cwd, '@mvdmio/translation-tools-client', clientPackageDir);

  await writeFile(
    path.join(cwd, 'lookup.ts'),
    `import {
  createClient,
  type StoredTranslations,
  type TranslationRef,
} from '@mvdmio/translation-tools-client';

const bundledSnapshot: StoredTranslations = ${bundledSnapshotLiteral};

const homeTitle: TranslationRef = {
  origin: 'consumer-app:/translations/strings.json',
  key: 'home_title',
};

async function main(): Promise<void> {
  const client = createClient({
    apiKey: 'ts-consumer-key',
    bundledSnapshot,
    backgroundRefreshEnabled: false,
    heartbeatEnabled: false,
    baseUrl: 'http://127.0.0.1:9',
  });
  await client.initialize();
  const value = await client.get(homeTitle, 'en');
  client.dispose();
  console.log(value ?? '');
}

await main();
`,
    'utf8',
  );

  await writeFile(
    path.join(cwd, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: true,
          types: [],
          outDir: 'dist',
          rootDir: '.',
        },
        include: ['lookup.ts'],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const tsc = await run(
    process.execPath,
    [path.join(repoRoot, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'],
    { cwd },
  );
  assert.equal(tsc.exitCode, 0, `${tsc.stdout}\n${tsc.stderr}`);

  const result = await run(process.execPath, ['dist/lookup.js'], { cwd });
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'Home');
});

test('push prune false keeps other-package remote origins in the POST body', async () => {
  const { startFakeTranslationToolsHttp } = await import(
    './support/fake-translation-tools-http.ts'
  );
  const { runCli } = await import('./support/run-cli.ts');

  const cwd = await mkdtemp(path.join(tmpdir(), 'translationtools-push-other-'));
  await writeFile(
    path.join(cwd, 'package.json'),
    `${JSON.stringify({ name: 'package-a', version: '0.0.0', private: true }, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(cwd, 'translationtools.yaml'),
    `apiKey: yaml-api-key
defaultLocale: en
locales:
  - en
generated:
  enabled: false
  path: translations/generated.ts
jsonResources:
  resourceDirectories:
    - translations
  prune: false
  keyOverrides: {}
`,
    'utf8',
  );
  await mkdir(path.join(cwd, 'translations'), { recursive: true });
  await writeFile(
    path.join(cwd, 'translations', 'strings.json'),
    `${JSON.stringify({ home_title: 'A local' }, null, 2)}\n`,
    'utf8',
  );

  const fake = await startFakeTranslationToolsHttp();
  try {
    fake.respond('GET', '/api/v1/translations/project', {
      json: { locales: ['en'], defaultLocale: 'en' },
    });
    fake.respond('GET', '/api/v1/translations/en', {
      json: [
        {
          origin: 'package-a:/translations/strings.json',
          key: 'home_title',
          value: 'A remote',
        },
        {
          origin: 'package-b:/translations/strings.json',
          key: 'home_title',
          value: 'B remote',
        },
      ],
    });
    fake.respond('POST', '/api/v1/translations/project', {
      json: {
        receivedKeyCount: 2,
        createdKeyCount: 0,
        updatedKeyCount: 1,
        removedKeyCount: 0,
      },
    });

    const result = await runCli(['push'], {
      cwd,
      apiKey: 'key',
      baseUrl: fake.baseUrl,
    });
    assert.equal(result.exitCode, 0, result.stderr);

    const post = fake.requests.find(
      (request) => request.method === 'POST' && request.path === '/api/v1/translations/project',
    );
    assert.ok(post);
    const body = JSON.parse(post.bodyText) as {
      items: Array<{ origin: string; key: string; value: string | null }>;
    };
    assert.deepEqual(
      body.items
        .map((item) => ({ origin: item.origin, key: item.key, value: item.value }))
        .sort((a, b) => a.origin.localeCompare(b.origin)),
      [
        {
          origin: 'package-a:/translations/strings.json',
          key: 'home_title',
          value: 'A local',
        },
        {
          origin: 'package-b:/translations/strings.json',
          key: 'home_title',
          value: 'B remote',
        },
      ],
    );
  } finally {
    await fake.close();
  }
});
