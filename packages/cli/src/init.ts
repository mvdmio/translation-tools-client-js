import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CONFIG_FILE_NAME,
  STARTER_JSON_RELATIVE_PATH,
  configPath,
  renderDefaultConfig,
  renderStarterJson,
  starterJsonPath,
} from './config.js';
import { fileExists } from './fs.js';

export type InitResult = {
  configFile: string;
  starterJsonFile: string;
};

export async function runInit(cwd: string): Promise<InitResult> {
  const yamlFile = configPath(cwd);
  const jsonFile = starterJsonPath(cwd);

  const existing: string[] = [];
  if (await fileExists(yamlFile)) {
    existing.push(CONFIG_FILE_NAME);
  }
  if (await fileExists(jsonFile)) {
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
