import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const npmCliJs = resolveNpmCli();

/** Windows: <node>/node_modules/npm/bin. Unix: <prefix>/lib/node_modules/npm/bin. */
function resolveNpmCli(): string {
  const fromExecPath = process.env.npm_execpath;
  if (fromExecPath) {
    const sibling = path.join(path.dirname(fromExecPath), 'npm-cli.js');
    if (existsSync(sibling)) {
      return sibling;
    }
    if (existsSync(fromExecPath)) {
      return fromExecPath;
    }
  }

  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(path.dirname(nodeDir), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) {
    throw new Error(`Cannot find npm-cli.js; tried ${candidates.join(', ')}`);
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

/** Drop parent `npm run` config so the nested run is not scoped under the outer `npm test`. */
function nestedNpmEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
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

/** Copy the repository's tracked files, leaving out build output that only exists in a working checkout. */
async function copyTrackedFiles(destination: string): Promise<void> {
  const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  for (const relativePath of stdout.split('\0').filter(Boolean)) {
    const source = path.join(repoRoot, relativePath);
    if (!existsSync(source)) {
      continue;
    }
    const target = path.join(destination, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }
}

/**
 * Link the repository's installed dependencies into the copy, but resolve the two workspace
 * packages to the copy's own packages. A plain link to the repository's node_modules would
 * resolve them to the repository's built packages.
 */
async function linkNodeModules(destination: string): Promise<void> {
  const copyModules = path.join(destination, 'node_modules');
  await mkdir(copyModules);
  for (const entry of await readdir(path.join(repoRoot, 'node_modules'))) {
    if (entry === '@mvdmio') {
      continue;
    }
    await symlink(path.join(repoRoot, 'node_modules', entry), path.join(copyModules, entry), 'junction');
  }
  const scopeDir = path.join(copyModules, '@mvdmio');
  await mkdir(scopeDir);
  await symlink(
    path.join(destination, 'packages/client'),
    path.join(scopeDir, 'translation-tools-client'),
    'junction',
  );
  await symlink(
    path.join(destination, 'packages/cli'),
    path.join(scopeDir, 'translation-tools-cli'),
    'junction',
  );
}

test('npm run typecheck passes on a fresh copy with no build output', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'tt-typecheck-fresh-clone-'));
  try {
    await copyTrackedFiles(cwd);
    await linkNodeModules(cwd);

    const result = await run(process.execPath, [npmCliJs, 'run', 'typecheck'], {
      cwd,
      env: nestedNpmEnv(),
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.exitCode, 0, output);
    assert.doesNotMatch(output, /error TS\d+/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
