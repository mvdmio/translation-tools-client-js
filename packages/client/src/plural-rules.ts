export const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

export function isPluralCategory(name: string): name is PluralCategory {
  return (PLURAL_CATEGORIES as readonly string[]).includes(name);
}

/** The CLDR plural rules and number format of one Locale. */
export type PluralLocale = {
  select(count: number): PluralCategory;
  format(count: number): string;
};

const UNKNOWN_LOCALE: PluralLocale = {
  select: () => 'other',
  format: (count) => String(count),
};

const cache = new Map<string, PluralLocale>();

/**
 * `Intl` answers for the host's default locale when it does not know a tag, so the tag is
 * checked first: the stored Locale, then its language subtag, then no CLDR data at all.
 */
export function getPluralLocale(tag: string): PluralLocale {
  let pluralLocale = cache.get(tag);
  if (pluralLocale == null) {
    const language = tag.split('-')[0] ?? tag;
    pluralLocale = tryCreate(tag) ?? tryCreate(language) ?? UNKNOWN_LOCALE;
    cache.set(tag, pluralLocale);
  }
  return pluralLocale;
}

function tryCreate(tag: string): PluralLocale | null {
  try {
    if (Intl.PluralRules.supportedLocalesOf(tag).length === 0) {
      return null;
    }
    const rules = new Intl.PluralRules(tag);
    const numberFormat = new Intl.NumberFormat(tag);
    return {
      select: (count) => rules.select(count),
      format: (count) => numberFormat.format(count),
    };
  } catch {
    return null;
  }
}
