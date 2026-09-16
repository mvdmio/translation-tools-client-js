import { TranslationToolsValidationException } from './exceptions.js';
import type { TranslationRef, TranslationStringResource } from './models.js';

const VALID_KEY_RE = /^[A-Za-z0-9._-]+$/;

export function translationRefKey(ref: TranslationRef): string {
  return `${ref.origin}\0${ref.key}`;
}

export function normalizeLocale(locale: string): string {
  return locale.trim().toLowerCase();
}

export function validateKey(key: string): string {
  if (key.trim() === '') {
    throw new TranslationToolsValidationException('Translation key is required.');
  }
  if (!VALID_KEY_RE.test(key)) {
    throw new TranslationToolsValidationException(`Invalid translation key: ${key}`);
  }
  return key;
}

export function validateRef(ref: TranslationRef): TranslationRef {
  if (ref.origin.trim() === '') {
    throw new TranslationToolsValidationException('Translation origin is required.');
  }
  return { origin: ref.origin, key: validateKey(ref.key) };
}

export function isStringResource(
  value: TranslationRef | TranslationStringResource,
): value is TranslationStringResource {
  return 'ref' in value && value.ref != null && typeof value.ref === 'object';
}
