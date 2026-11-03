export function translationRefKey(origin: string, key: string): string {
  return `${origin}\0${key}`;
}
