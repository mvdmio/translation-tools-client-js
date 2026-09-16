#!/usr/bin/env node

const args = process.argv.slice(2);

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

process.stderr.write(`Command not implemented: ${args[0]}\n`);
process.exit(1);
