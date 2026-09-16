import type { TranslationItem, TranslationRef, TranslationSnapshot } from './models.js';
import { normalizeLocale, translationRefKey, validateRef } from './refs.js';

export type LocaleMap = Map<string, Map<string, TranslationItem>>;

export function localeMapFromSnapshots(snapshots: readonly TranslationSnapshot[]): LocaleMap {
  const next: LocaleMap = new Map();
  for (const snapshot of snapshots) {
    const locale = normalizeLocale(snapshot.locale);
    const items = new Map<string, TranslationItem>();
    for (const item of snapshot.items) {
      const validated = validateRef(item.ref);
      items.set(translationRefKey(validated), { ref: validated, value: item.value });
    }
    next.set(locale, items);
  }
  return next;
}

export function snapshotsFromLocaleMap(translations: LocaleMap): TranslationSnapshot[] {
  const snapshots: TranslationSnapshot[] = [];
  for (const [locale, items] of translations) {
    snapshots.push({ locale, items: [...items.values()] });
  }
  return snapshots;
}

export function getCachedItem(
  translations: LocaleMap,
  locale: string,
  ref: TranslationRef,
): TranslationItem | undefined {
  return translations.get(locale)?.get(translationRefKey(ref));
}

export function putCachedItem(
  translations: LocaleMap,
  locale: string,
  item: TranslationItem,
): LocaleMap {
  const localeItems = new Map(translations.get(locale) ?? []);
  localeItems.set(translationRefKey(item.ref), item);
  const next = new Map(translations);
  next.set(locale, localeItems);
  return next;
}
