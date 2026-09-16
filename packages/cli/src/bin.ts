#!/usr/bin/env node

import { runGenerate } from './generate.js';
import { runInit } from './init.js';
import { runPull } from './pull.js';
import { runPush } from './push.js';

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

  if (command === 'generate') {
    try {
      const result = await runGenerate(process.cwd());
      process.stdout.write(`Generated ${result.outputFile} (${result.typedKeyCount} typed keys)\n`);
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error: ${message}\n`);
      process.exit(1);
    }
  }

  if (command === 'pull') {
    try {
      const result = await runPull(process.cwd());
      for (const file of result.writtenFiles) {
        process.stdout.write(`Updated ${file}\n`);
      }
      if (result.generatedFile !== null) {
        process.stdout.write(
          `Generated ${result.generatedFile} (${result.typedKeyCount ?? 0} typed keys)\n`,
        );
      }
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error: ${message}\n`);
      process.exit(1);
    }
  }

  if (command === 'push') {
    try {
      const result = await runPush(process.cwd());
      process.stdout.write(
        `Push complete. Synced ${result.receivedKeyCount} translation values.\n`,
      );
      process.stdout.write(
        `Created: ${result.createdKeyCount}. Updated values: ${result.updatedKeyCount}. Removed: ${result.removedKeyCount}.\n`,
      );
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error: ${message}\n`);
      process.exit(1);
    }
  }

  process.stderr.write(`Unknown command: ${command}\n`);
  process.exit(1);
}

void main();
