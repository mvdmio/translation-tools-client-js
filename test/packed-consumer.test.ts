import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const npmCliJs = resolveNpmCli('npm-cli.js');
const npxCliJs = resolveNpmCli('npx-cli.js');

/** Windows: <node>/node_modules/npm/bin. Unix: <prefix>/lib/node_modules/npm/bin. */
function resolveNpmCli(cliFile: 'npm-cli.js' | 'npx-cli.js'): string {
  const fromExecPath = process.env.npm_execpath;
  if (fromExecPath) {
    const sibling = path.join(path.dirname(fromExecPath), cliFile);
    if (existsSync(sibling)) {
      return sibling;
    }
    if (cliFile === 'npm-cli.js' && existsSync(fromExecPath)) {
      return fromExecPath;
    }
  }

  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', cliFile),
    path.join(path.dirname(nodeDir), 'lib', 'node_modules', 'npm', 'bin', cliFile),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) {
    throw new Error(`Cannot find ${cliFile}; tried ${candidates.join(', ')}`);
  }
  return found;
}

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

/** Drop parent `npm run` config so nested installs are not project-scoped under the repo. */
function consumerNpmEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const key of Object.keys(env)) {
    const lower = key.toLowerCase();
    if (
      lower.startsWith('npm_config_') ||
      lower.startsWith('npm_package_') ||
      lower === 'npm_lifecycle_event' ||
      lower === 'npm_lifecycle_script' ||
      lower === 'npm_command' ||
      lower === 'npm_execpath' ||
      lower === 'init_cwd'
    ) {
      delete env[key];
    }
  }
  return env;
}

function runNpm(args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<SpawnResult> {
  return run(process.execPath, [npmCliJs, ...args], {
    cwd: options.cwd,
    env: consumerNpmEnv(options.env),
  });
}

function runNpx(args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<SpawnResult> {
  return run(process.execPath, [npxCliJs, ...args], {
    cwd: options.cwd,
    env: consumerNpmEnv(options.env),
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

async function listTarballPaths(tarballPath: string): Promise<string[]> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync('tar', ['-tzf', tarballPath], {
    encoding: 'utf8',
  });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function packWorkspacePackage(
  packageName: string,
  packDir: string,
): Promise<string> {
  const result = await runNpm(['pack', '-w', packageName, '--pack-destination', packDir], {
    cwd: repoRoot,
  });
  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  const files = (await readdir(packDir)).filter((name) => name.endsWith('.tgz'));
  assert.equal(files.length, 1, `expected one tarball in ${packDir}, got ${files.join(', ')}`);
  return path.join(packDir, files[0]!);
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

test('npm pack client tarball installs and looks up a bundled string', async () => {
  const packDir = await mkdtemp(path.join(tmpdir(), 'tt-pack-client-'));
  const cwd = await mkdtemp(path.join(tmpdir(), 'tt-packed-client-consumer-'));
  try {
    const tarball = await packWorkspacePackage('@mvdmio/translation-tools-client', packDir);
    const entries = await listTarballPaths(tarball);
    assert.ok(entries.some((entry) => entry.endsWith('/LICENSE') || entry === 'package/LICENSE'));
    assert.ok(entries.some((entry) => entry.endsWith('/README.md') || entry === 'package/README.md'));
    assert.ok(entries.some((entry) => entry.includes('/dist/') && entry.endsWith('.js')));
    assert.ok(entries.some((entry) => entry.includes('/dist/') && entry.endsWith('.d.ts')));
    assert.equal(await fileExists(path.join(repoRoot, 'packages/client/LICENSE')), false);
    assert.equal(await fileExists(path.join(repoRoot, 'packages/client/dist/index.js')), true);

    await writeFile(
      path.join(cwd, 'package.json'),
      `${JSON.stringify(
        {
          name: 'consumer-app',
          version: '0.0.0',
          private: true,
          type: 'module',
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const install = await runNpm(['install', tarball], { cwd });
    assert.equal(install.exitCode, 0, install.stderr || install.stdout);

    await writeFile(
      path.join(cwd, 'lookup.mjs'),
      `import { createClient } from '@mvdmio/translation-tools-client';

const client = createClient({
  apiKey: 'packed-client-key',
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
    apiKey: 'packed-ts-key',
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

    const compiled = await run(process.execPath, ['dist/lookup.js'], { cwd });
    assert.equal(compiled.exitCode, 0, compiled.stderr);
    assert.equal(compiled.stdout.trim(), 'Home');
  } finally {
    await rm(packDir, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
    await rm(path.join(repoRoot, 'packages/client/LICENSE'), { force: true });
  }
});

test('npm pack CLI tarball installs and runs translationtools bin without the client', async () => {
  const packDir = await mkdtemp(path.join(tmpdir(), 'tt-pack-cli-'));
  const cwd = await mkdtemp(path.join(tmpdir(), 'tt-packed-cli-consumer-'));
  try {
    const tarball = await packWorkspacePackage('@mvdmio/translation-tools-cli', packDir);
    const entries = await listTarballPaths(tarball);
    assert.ok(entries.some((entry) => entry.endsWith('/LICENSE') || entry === 'package/LICENSE'));
    assert.ok(entries.some((entry) => entry.endsWith('/README.md') || entry === 'package/README.md'));
    assert.ok(entries.some((entry) => entry.endsWith('/dist/bin.js')));
    assert.ok(entries.some((entry) => entry.endsWith('/dist/bin.d.ts')));
    assert.equal(await fileExists(path.join(repoRoot, 'packages/cli/LICENSE')), false);

    const pkg = JSON.parse(await readFile(path.join(repoRoot, 'packages/cli/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    assert.equal(pkg.dependencies?.['@mvdmio/translation-tools-client'], undefined);

    await writeFile(
      path.join(cwd, 'package.json'),
      `${JSON.stringify(
        {
          name: 'consumer-app',
          version: '0.0.0',
          private: true,
          type: 'module',
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const install = await runNpm(['install', tarball], { cwd });
    assert.equal(install.exitCode, 0, install.stderr || install.stdout);
    assert.equal(
      await fileExists(path.join(cwd, 'node_modules', '@mvdmio', 'translation-tools-client')),
      false,
    );

    const packageBin = path.join(
      cwd,
      'node_modules',
      '@mvdmio',
      'translation-tools-cli',
      'dist',
      'bin.js',
    );
    assert.equal(await fileExists(packageBin), true);

    const help = await run(process.execPath, [packageBin, '--help'], { cwd });
    assert.equal(help.exitCode, 0, help.stderr);
    assert.match(help.stdout, /Usage: translationtools/);

    const init = await run(process.execPath, [packageBin, 'init'], {
      cwd,
      env: {
        ...process.env,
        TRANSLATIONTOOLS_API_KEY: '',
      },
    });
    assert.equal(init.exitCode, 0, init.stderr);
    assert.match(init.stdout, /Created .*translationtools\.yaml/);
    assert.equal(await fileExists(path.join(cwd, 'translationtools.yaml')), true);

    // After a local install, the bin name is translationtools (what npx translationtools resolves to).
    const npx = await runNpx(['translationtools', '--help'], { cwd });
    assert.equal(npx.exitCode, 0, npx.stderr);
    assert.match(npx.stdout, /Usage: translationtools/);
  } finally {
    await rm(packDir, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
    await rm(path.join(repoRoot, 'packages/cli/LICENSE'), { force: true });
  }
});
