import { createHash } from 'node:crypto';
import { translationRefKey } from './translation-ref.js';

const INVALID_IDENTIFIER_CHARS = /[^a-z0-9_]+/g;
const REPEATED_UNDERSCORES = /_+/g;

/** JavaScript and TypeScript reserved words / keywords that cannot be bare identifiers. */
const RESERVED_WORDS = new Set([
  'abstract',
  'accessor',
  'any',
  'as',
  'asserts',
  'async',
  'await',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'debugger',
  'declare',
  'default',
  'delete',
  'do',
  'double',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'final',
  'finally',
  'float',
  'for',
  'from',
  'function',
  'get',
  'global',
  'goto',
  'if',
  'implements',
  'import',
  'in',
  'infer',
  'instanceof',
  'int',
  'interface',
  'is',
  'keyof',
  'let',
  'long',
  'module',
  'namespace',
  'native',
  'never',
  'new',
  'null',
  'number',
  'object',
  'of',
  'override',
  'package',
  'private',
  'protected',
  'public',
  'readonly',
  'require',
  'return',
  'satisfies',
  'set',
  'short',
  'static',
  'string',
  'super',
  'switch',
  'symbol',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'unique',
  'unknown',
  'var',
  'void',
  'volatile',
  'while',
  'with',
  'yield',
]);

export function sanitizeIdentifier(rawKey: string): string {
  let sanitized = rawKey
    .toLowerCase()
    .replaceAll('.', '_')
    .replaceAll('-', '_')
    .replaceAll('/', '_')
    .replace(/\s+/g, '_')
    .replace(INVALID_IDENTIFIER_CHARS, '_')
    .replace(REPEATED_UNDERSCORES, '_')
    .replace(/^_+|_+$/g, '');

  if (sanitized === '') {
    sanitized = 'key';
  }

  if (/^\d/.test(sanitized)) {
    sanitized = `key_${sanitized}`;
  }

  if (RESERVED_WORDS.has(sanitized)) {
    sanitized = `${sanitized}_`;
  }

  return sanitized;
}

export function stableCollisionSuffix(origin: string, jsonKey: string): string {
  const digest = createHash('sha256').update(translationRefKey(origin, jsonKey), 'utf8').digest('hex');
  return digest.slice(0, 8);
}

export function resolveIdentifierNames(
  entries: ReadonlyArray<{ origin: string; jsonKey: string }>,
): Map<string, string> {
  const collisionKey = (origin: string, jsonKey: string) => translationRefKey(origin, jsonKey);
  const sanitizedByEntry = new Map<string, string>();
  const groups = new Map<string, string[]>();

  for (const entry of entries) {
    const id = collisionKey(entry.origin, entry.jsonKey);
    const sanitized = sanitizeIdentifier(entry.jsonKey);
    sanitizedByEntry.set(id, sanitized);
    const group = groups.get(sanitized);
    if (group) {
      group.push(id);
    } else {
      groups.set(sanitized, [id]);
    }
  }

  const resolved = new Map<string, string>();
  for (const entry of entries) {
    const id = collisionKey(entry.origin, entry.jsonKey);
    const sanitized = sanitizedByEntry.get(id)!;
    const group = groups.get(sanitized)!;
    if (group.length === 1) {
      resolved.set(id, sanitized);
    } else {
      resolved.set(id, `${sanitized}__${stableCollisionSuffix(entry.origin, entry.jsonKey)}`);
    }
  }

  return resolved;
}
