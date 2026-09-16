export function collectLocales(
  ...values: ReadonlyArray<string | null | undefined | readonly string[]>
): string[] {
  const locales = new Set<string>();
  const add = (value: string | null | undefined): void => {
    if (typeof value !== 'string') {
      return;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized !== '') {
      locales.add(normalized);
    }
  };
  for (const value of values) {
    if (typeof value === 'string' || value == null) {
      add(value);
    } else {
      for (const locale of value) {
        add(locale);
      }
    }
  }
  return [...locales].sort((a, b) => a.localeCompare(b));
}
