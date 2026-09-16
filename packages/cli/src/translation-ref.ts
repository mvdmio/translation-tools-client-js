export function translationRefKey(origin: string, key: string): string {
  return `${origin}\0${key}`;
}

export function splitTranslationRefKey(mapKey: string): { origin: string; key: string } {
  const separator = mapKey.indexOf('\0');
  return {
    origin: mapKey.slice(0, separator),
    key: mapKey.slice(separator + 1),
  };
}

export function translationPushKey(origin: string, locale: string, key: string): string {
  return `${origin}\0${locale}\0${key}`;
}
