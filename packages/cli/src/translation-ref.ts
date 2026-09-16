export function translationRefKey(origin: string, key: string): string {
  return `${origin}\0${key}`;
}

export function translationPushKey(origin: string, locale: string, key: string): string {
  return `${origin}\0${locale}\0${key}`;
}
