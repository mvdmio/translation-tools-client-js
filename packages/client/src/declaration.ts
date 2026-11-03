import type { StoredTranslations } from './models.js';
import { normalizeLocale, translationRefKey } from './refs.js';

export interface DeclarationItem {
  readonly origin: string;
  readonly locale: string;
  readonly key: string;
  readonly value: string;
}

/**
 * The Keys a bundled snapshot ships, as Declaration items: one per origin, locale, and key with a
 * non-empty value. A key with no non-empty value in any locale gets one default-locale item with
 * an empty value.
 */
export function buildDeclarationItems(
  snapshot: StoredTranslations,
  fallbackDefaultLocale: string,
): DeclarationItem[] {
  const defaultLocale = normalizeLocale(
    snapshot.projectMetadata?.defaultLocale ?? fallbackDefaultLocale,
  );
  const items: DeclarationItem[] = [];
  const keysWithValue = new Set<string>();
  const emptyKeys = new Map<string, { origin: string; key: string }>();

  for (const { locale, items: localeItems } of snapshot.snapshots) {
    for (const { ref, value } of localeItems) {
      const refKey = translationRefKey(ref);
      if (value == null || value === '') {
        emptyKeys.set(refKey, ref);
        continue;
      }
      keysWithValue.add(refKey);
      items.push({ origin: ref.origin, locale: normalizeLocale(locale), key: ref.key, value });
    }
  }

  for (const [refKey, ref] of emptyKeys) {
    if (!keysWithValue.has(refKey)) {
      items.push({ origin: ref.origin, locale: defaultLocale, key: ref.key, value: '' });
    }
  }

  return items;
}
