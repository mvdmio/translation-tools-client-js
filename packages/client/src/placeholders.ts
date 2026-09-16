import { PlaceholderSubstitutionException } from './exceptions.js';

export type PlaceholderBindings = Readonly<Record<string, string | null | undefined>>;

export type GlobalPlaceholderResolver = {
  readonly registeredNames: readonly string[];
  isRegistered(name: string): boolean;
  resolve(name: string): string | null;
};

type PlaceholderSegment =
  | { readonly kind: 'literal'; readonly text: string }
  | { readonly kind: 'token'; readonly name: string };

const GLOBAL_NAME_RE = /^[a-z][a-zA-Z0-9]*$/;

export function isValidGlobalPlaceholderName(name: string): boolean {
  return GLOBAL_NAME_RE.test(name);
}

export function createGlobalPlaceholderRegistry(
  globals: Readonly<Record<string, () => string | null | undefined>>,
): GlobalPlaceholderResolver {
  const ordered = new Map<string, () => string | null | undefined>();
  for (const [name, resolver] of Object.entries(globals)) {
    if (!isValidGlobalPlaceholderName(name)) {
      throw new Error(
        `Invalid global placeholder name '${name}'. Names must match [a-z][a-zA-Z0-9]*.`,
      );
    }
    ordered.set(name, resolver);
  }

  return {
    registeredNames: [...ordered.keys()],
    isRegistered(name: string): boolean {
      return ordered.has(name);
    },
    resolve(name: string): string | null {
      const resolver = ordered.get(name);
      if (!resolver) {
        return null;
      }
      try {
        const value = resolver();
        return value ?? null;
      } catch {
        return null;
      }
    },
  };
}

export function parsePlaceholderSegments(input: string): PlaceholderSegment[] {
  if (input.length === 0) {
    return [];
  }

  const segments: PlaceholderSegment[] = [];
  let buffer = '';

  const flush = (): void => {
    if (buffer.length > 0) {
      segments.push({ kind: 'literal', text: buffer });
      buffer = '';
    }
  };

  let i = 0;
  while (i < input.length) {
    const c = input[i]!;

    if (c === "'") {
      const next = i + 1 < input.length ? input[i + 1]! : '';

      if (next === "'") {
        buffer += "'";
        i += 2;
        continue;
      }

      if (next === '{' || next === '}') {
        i += 1;
        while (i < input.length) {
          if (input[i] === "'") {
            if (i + 1 < input.length && input[i + 1] === "'") {
              buffer += "'";
              i += 2;
              continue;
            }
            i += 1;
            break;
          }
          buffer += input[i]!;
          i += 1;
        }
        continue;
      }

      buffer += "'";
      i += 1;
      continue;
    }

    if (c === '{') {
      const match = tryMatchToken(input, i);
      if (match) {
        flush();
        segments.push({ kind: 'token', name: match.name });
        i += match.consumed;
        continue;
      }
      buffer += '{';
      i += 1;
      continue;
    }

    buffer += c;
    i += 1;
  }

  flush();
  return segments;
}

export function substitutePlaceholders(args: {
  value: string;
  bindings?: PlaceholderBindings | null;
  globals: GlobalPlaceholderResolver;
  knownSet?: ReadonlySet<string> | null;
  throwOnError?: boolean;
  warn?: ((message: string) => void) | null;
}): string {
  const {
    value,
    bindings = null,
    globals,
    knownSet = null,
    throwOnError = false,
    warn = null,
  } = args;

  if (value.length === 0) {
    return value;
  }

  const segments = parsePlaceholderSegments(value);
  let result = '';
  const hasBindings = bindings != null && Object.keys(bindings).length > 0;
  const consumedTokens = hasBindings ? new Set<string>() : null;

  for (const segment of segments) {
    if (segment.kind === 'literal') {
      result += segment.text;
      continue;
    }

    const name = segment.name;

    if (bindings != null && Object.prototype.hasOwnProperty.call(bindings, name)) {
      result += bindings[name] ?? '';
      consumedTokens?.add(name);
      continue;
    }

    if (globals.isRegistered(name)) {
      const resolved = globals.resolve(name);
      if (resolved != null) {
        result += resolved;
      } else {
        result += degrade(
          name,
          throwOnError,
          warn,
          `Could not resolve global placeholder '{${name}}' (resolver failed or returned null).`,
        );
      }
      continue;
    }

    if (knownSet != null && !knownSet.has(name)) {
      result += `{${name}}`;
      continue;
    }

    result += degrade(
      name,
      throwOnError,
      warn,
      `No value supplied for placeholder '{${name}}'.`,
    );
  }

  if (bindings != null && consumedTokens != null) {
    for (const key of Object.keys(bindings)) {
      if (!consumedTokens.has(key)) {
        warnOrThrow(throwOnError, warn, `Supplied placeholder '${key}' is not present in the value.`);
      }
    }
  }

  return result;
}

function degrade(
  name: string,
  throwOnError: boolean,
  warn: ((message: string) => void) | null | undefined,
  message: string,
): string {
  if (throwOnError) {
    throw new PlaceholderSubstitutionException(message);
  }
  warn?.(message);
  return `{${name}}`;
}

function warnOrThrow(
  throwOnError: boolean,
  warn: ((message: string) => void) | null | undefined,
  message: string,
): void {
  if (throwOnError) {
    throw new PlaceholderSubstitutionException(message);
  }
  warn?.(message);
}

function tryMatchToken(
  input: string,
  start: number,
): { name: string; consumed: number } | null {
  let i = start + 1;
  if (i >= input.length) {
    return null;
  }

  const first = input[i]!;
  if (first < 'a' || first > 'z') {
    return null;
  }

  const nameStart = i;
  i += 1;
  while (i < input.length) {
    const ch = input[i]!;
    const isIdentifierChar =
      (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9');
    if (!isIdentifierChar) {
      break;
    }
    i += 1;
  }

  if (i >= input.length || input[i] !== '}') {
    return null;
  }

  return {
    name: input.slice(nameStart, i),
    consumed: i - start + 1,
  };
}
