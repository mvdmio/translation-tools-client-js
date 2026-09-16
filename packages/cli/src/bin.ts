#!/usr/bin/env node

import { runInit } from './init.js';

const args = process.argv.slice(2);

async function main(): Promise<void> {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`Usage: translationtools <command>

Commands:
  init       Create starter config and JSON resource file
  pull       Pull translations from TranslationTools
  push       Push local JSON resource files to TranslationTools
  generate   Generate typed keys and bundled fallback

Options:
  -h, --help  Show help
`);
    process.exit(0);
  }

  const command = args[0];

  if (command === 'init') {
    try {
      const result = await runInit(process.cwd());
      process.stdout.write(`Created ${result.configFile}\n`);
      process.stdout.write(`Created ${result.starterJsonFile}\n`);
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error: ${message}\n`);
      process.exit(1);
    }
  }

  process.stderr.write(`Command not implemented: ${command}\n`);
  process.exit(1);
}

void main();
