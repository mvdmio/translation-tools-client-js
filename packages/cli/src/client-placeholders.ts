import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CLIENT_PACKAGE = '@mvdmio/translation-tools-client';

type ParsedSegment =
  | { readonly kind: 'token'; readonly name: string }
  | { readonly kind: 'literal' | 'pound' };

/** The part of the client's parser the generator reads. The project's own client supplies it. */
export type ClientParser = {
  isValidGlobalPlaceholderName(name: string): boolean;
  parsePlaceholderSegments(input: string): readonly ParsedSegment[];
  parsePlural(input: string): {
    readonly argument: string;
    readonly cases: readonly { readonly segments: readonly ParsedSegment[] }[];
  } | null;
};

/** What a Key's default-locale value asks of the caller. */
export type KeyPlaceholders = {
  /** The name a Plural's number is bound under; null when the value is not a Plural. */
  pluralArgument: string | null;
  /** Placeholder names in order of first appearance, without the Plural's argument. */
  names: string[];
};

/**
 * Imports the client the project has installed. The client's `exports` has no `require`
 * condition, so the package is found by looking in each `node_modules` the project sees.
 */
export async function loadClientParser(cwd: string): Promise<ClientParser> {
  const projectRequire = createRequire(path.join(cwd, 'package.json'));
  const searchDirectories = projectRequire.resolve.paths(CLIENT_PACKAGE) ?? [];

  for (const directory of searchDirectories) {
    const packageDir = path.join(directory, ...CLIENT_PACKAGE.split('/'));
    const entry = await readEntryPoint(packageDir);
    if (entry === null) {
      continue;
    }
    const exported: unknown = await import(pathToFileURL(await realpath(entry)).href);
    return asClientParser(exported, entry);
  }

  throw new Error(
    `Cannot find ${CLIENT_PACKAGE} from ${cwd}. Install it in the project: npm install ${CLIENT_PACKAGE}`,
  );
}

async function readEntryPoint(packageDir: string): Promise<string | null> {
  let text: string;
  try {
    text = await readFile(path.join(packageDir, 'package.json'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  const manifest = JSON.parse(text) as {
    exports?: { '.'?: { import?: unknown } };
    main?: unknown;
  };
  const entry = manifest.exports?.['.']?.import ?? manifest.main;
  return typeof entry === 'string' ? path.resolve(packageDir, entry) : null;
}

function asClientParser(exported: unknown, entry: string): ClientParser {
  const candidate = exported as Partial<Record<keyof ClientParser, unknown>>;
  if (
    typeof candidate.parsePlaceholderSegments !== 'function' ||
    typeof candidate.parsePlural !== 'function' ||
    typeof candidate.isValidGlobalPlaceholderName !== 'function'
  ) {
    throw new Error(
      `${entry} does not export parsePlaceholderSegments, parsePlural and isValidGlobalPlaceholderName. Update ${CLIENT_PACKAGE} in the project.`,
    );
  }
  return exported as ClientParser;
}

/** Splits a Key's names into those the caller must pass and the Global placeholders it may override. */
export function splitByGlobals(
  names: readonly string[],
  globals: readonly string[],
): { required: string[]; optional: string[] } {
  return {
    required: names.filter((name) => !globals.includes(name)),
    optional: names.filter((name) => globals.includes(name)),
  };
}

export function placeholdersOf(parser: ClientParser, value: string | undefined): KeyPlaceholders {
  if (value === undefined) {
    return { pluralArgument: null, names: [] };
  }

  const plural = parser.parsePlural(value);
  const segments =
    plural === null
      ? parser.parsePlaceholderSegments(value)
      : plural.cases.flatMap((formCase) => formCase.segments);
  const pluralArgument = plural?.argument ?? null;

  const names = new Set<string>();
  for (const segment of segments) {
    if (segment.kind === 'token' && segment.name !== pluralArgument) {
      names.add(segment.name);
    }
  }
  return { pluralArgument, names: [...names] };
}
