import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CONFIG_FILE_NAME,
  STARTER_JSON_RELATIVE_PATH,
  configPath,
  renderDefaultConfig,
  renderStarterJson,
  starterJsonPath,
} from './config.js';

export type InitResult = {
  configFile: string;
  starterJsonFile: string;
};

export async function runInit(cwd: string): Promise<InitResult> {
  const yamlFile = configPath(cwd);
  const jsonFile = starterJsonPath(cwd);

  const existing: string[] = [];
  if (await exists(yamlFile)) {
    existing.push(CONFIG_FILE_NAME);
  }
  if (await exists(jsonFile)) {
    existing.push(STARTER_JSON_RELATIVE_PATH.split(path.sep).join('/'));
  }

  if (existing.length > 0) {
    throw new Error(`Refusing to overwrite existing files: ${existing.join(', ')}`);
  }

  await mkdir(path.dirname(jsonFile), { recursive: true });
  await writeFile(yamlFile, renderDefaultConfig(), 'utf8');
  await writeFile(jsonFile, renderStarterJson(), 'utf8');

  return {
    configFile: yamlFile,
    starterJsonFile: jsonFile,
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
