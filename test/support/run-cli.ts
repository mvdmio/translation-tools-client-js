import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type RunCliResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export type RunCliOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  apiKey?: string;
  baseUrl?: string;
};

function resolveCliBin(): string {
  // Workspace layout: test/support -> repo root -> packages/cli/dist/bin.js
  return path.resolve(fileURLToPath(new URL('../..', import.meta.url)), 'packages/cli/dist/bin.js');
}

export async function runCli(args: string[], options: RunCliOptions): Promise<RunCliResult> {
  const cliBin = resolveCliBin();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.env,
  };

  if (options.apiKey !== undefined) {
    env.TRANSLATIONTOOLS_API_KEY = options.apiKey;
  }
  if (options.baseUrl !== undefined) {
    env.TRANSLATIONTOOLS_BASE_URL = options.baseUrl;
  }

  return await new Promise<RunCliResult>((resolve, reject) => {
    const child = spawn(process.execPath, [cliBin, ...args], {
      cwd: options.cwd,
      env,
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
