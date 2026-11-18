import { PlaceholderSubstitutionException } from './exceptions.js';
import {
  getPluralLocale,
  isPluralCategory,
  type PluralCategory,
  type PluralLocale,
} from './plural-rules.js';

export type PlaceholderBindings = Readonly<
  Record<string, string | number | null | undefined>
>;

export type GlobalPlaceholderResolver = {
  readonly registeredNames: readonly string[];
  isRegistered(name: string): boolean;
  resolve(name: string): string | null;
};

type PlaceholderSegment =
  | { readonly kind: 'literal'; readonly text: string }
  | { readonly kind: 'token'; readonly name: string }
  /** `#` inside a plural form: the number, formatted. */
  | { readonly kind: 'pound' };

type PluralSelector =
  | { readonly kind: 'exact'; readonly value: number }
  | { readonly kind: 'category'; readonly name: PluralCategory };

type PluralCase = {
  readonly selector: PluralSelector;
  readonly segments: readonly PlaceholderSegment[];
};

type ParsedPlural = {
  /** The name the number is bound under. It is not a Placeholder. */
  readonly argument: string;
  readonly cases: readonly PluralCase[];
  /** The `other` case, which is also one of `cases`. */
  readonly other: PluralCase;
};

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
  return scanSegments(input, 0, false)?.segments ?? [];
}

/**
 * Scans text into segments. In a plural form (`inForm`) the scan stops at the unquoted `}`
 * that closes the form, `#` is a segment, and any unquoted `{` that is not a token makes the
 * text invalid (`null`), as does a form that never closes.
 */
function scanSegments(
  input: string,
  start: number,
  inForm: boolean,
): { segments: PlaceholderSegment[]; end: number } | null {
  const segments: PlaceholderSegment[] = [];
  let buffer = '';

  const flush = (): void => {
    if (buffer.length > 0) {
      segments.push({ kind: 'literal', text: buffer });
      buffer = '';
    }
  };

  let i = start;
  while (i < input.length) {
    const c = input[i]!;

    if (c === "'") {
      const next = i + 1 < input.length ? input[i + 1]! : '';

      if (next === "'") {
        buffer += "'";
        i += 2;
        continue;
      }

      if (next === '{' || next === '}' || (inForm && next === '#')) {
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

    if (inForm && c === '}') {
      flush();
      return { segments, end: i };
    }

    if (inForm && c === '#') {
      flush();
      segments.push({ kind: 'pound' });
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
      if (inForm) {
        return null;
      }
      buffer += '{';
      i += 1;
      continue;
    }

    buffer += c;
    i += 1;
  }

  if (inForm) {
    return null;
  }
  flush();
  return { segments, end: i };
}

const PLURAL_HEAD_RE = /\{\s*([a-z][a-zA-Z0-9]*)\s*,\s*plural\s*,\s*/y;
const PLURAL_SELECTOR_RE = /(?:=(\d+)|([a-z]+))\s*\{/y;
const WHITESPACE_RE = /\s*/y;

function matchAt(re: RegExp, input: string, index: number): RegExpExecArray | null {
  re.lastIndex = index;
  return re.exec(input);
}

/**
 * Parses a whole value of the form `{count, plural, =0 {...} one {...} other {...}}`.
 * Returns `null` for any value that is not exactly that, so it renders as plain text.
 */
function parsePlural(input: string): ParsedPlural | null {
  const head = matchAt(PLURAL_HEAD_RE, input, 0);
  if (head == null) {
    return null;
  }

  const cases: PluralCase[] = [];
  const seen = new Set<string>();
  let i = PLURAL_HEAD_RE.lastIndex;

  while (true) {
    const selectorMatch = matchAt(PLURAL_SELECTOR_RE, input, i);
    if (selectorMatch == null) {
      return null;
    }
    const [, digits, word] = selectorMatch;
    let selector: PluralSelector;
    if (digits != null) {
      selector = { kind: 'exact', value: Number(digits) };
    } else if (word != null && isPluralCategory(word)) {
      selector = { kind: 'category', name: word };
    } else {
      return null;
    }

    const selectorKey = selector.kind === 'exact' ? `=${selector.value}` : selector.name;
    if (seen.has(selectorKey)) {
      return null;
    }
    seen.add(selectorKey);

    const form = scanSegments(input, PLURAL_SELECTOR_RE.lastIndex, true);
    if (form == null) {
      return null;
    }
    cases.push({ selector, segments: form.segments });

    matchAt(WHITESPACE_RE, input, form.end + 1);
    i = WHITESPACE_RE.lastIndex;
    if (input[i] === '}') {
      break;
    }
  }

  if (i !== input.length - 1) {
    return null;
  }

  const other = cases.find((c) => c.selector.kind === 'category' && c.selector.name === 'other');
  if (other == null) {
    return null;
  }
  return { argument: head[1]!, cases, other };
}

function pickPluralForm(plural: ParsedPlural, count: number, locale: PluralLocale): PluralCase {
  const category = locale.select(count);
  return (
    plural.cases.find((c) => c.selector.kind === 'exact' && c.selector.value === count) ??
    plural.cases.find((c) => c.selector.kind === 'category' && c.selector.name === category) ??
    plural.other
  );
}

function tokenNames(segments: readonly PlaceholderSegment[]): string[] {
  return segments.flatMap((segment) => (segment.kind === 'token' ? [segment.name] : []));
}

export function substitutePlaceholders(args: {
  value: string;
  /** The Locale whose plural rules and number format a Plural in `value` uses. */
  locale: string;
  bindings?: PlaceholderBindings | null;
  globals: GlobalPlaceholderResolver;
  throwOnError?: boolean;
  warn?: ((message: string) => void) | null;
}): string {
  const {
    value,
    locale,
    bindings = null,
    globals,
    throwOnError = false,
    warn = null,
  } = args;

  if (value.length === 0) {
    return value;
  }

  const plural = parsePlural(value);
  let segments: readonly PlaceholderSegment[];
  let presentNames: Set<string>;
  let numberText = '';

  if (plural == null) {
    segments = parsePlaceholderSegments(value);
    presentNames = new Set(tokenNames(segments));
  } else {
    const count = bindings?.[plural.argument];
    if (typeof count !== 'number' || !Number.isInteger(count)) {
      warnOrThrow(
        throwOnError,
        warn,
        `No whole number supplied for plural argument '${plural.argument}'.`,
      );
      return value;
    }
    const pluralLocale = getPluralLocale(locale);
    segments = pickPluralForm(plural, count, pluralLocale).segments;
    numberText = pluralLocale.format(count);
    presentNames = new Set([
      plural.argument,
      ...plural.cases.flatMap((c) => tokenNames(c.segments)),
    ]);
  }

  let result = '';

  for (const segment of segments) {
    if (segment.kind === 'literal') {
      result += segment.text;
      continue;
    }

    if (segment.kind === 'pound') {
      result += numberText;
      continue;
    }

    const name = segment.name;

    if (bindings != null && Object.prototype.hasOwnProperty.call(bindings, name)) {
      result += bindings[name] ?? '';
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

    result += degrade(
      name,
      throwOnError,
      warn,
      `No value supplied for placeholder '{${name}}'.`,
    );
  }

  if (bindings != null) {
    for (const key of Object.keys(bindings)) {
      if (!presentNames.has(key)) {
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
