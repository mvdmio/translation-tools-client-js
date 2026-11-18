# Changelog

## Unreleased

Requires a TranslationTools server that already runs michielvandermeer/mvdmio-suite#58. On an older server, a push that sends only local keys makes the unnamed environment drop other packages' keys.

- The runtime client declares the keys in `bundledSnapshot` when `initialize()` runs, under the configured `environment`. Values fill only empty translation values. A failed declaration never fails `initialize()`. Without `bundledSnapshot`, nothing is declared.
- `translationtools push` sends only the keys and values in the local JSON files. It no longer fetches project metadata or locales from TranslationTools first, and no longer merges remote keys into the upload.
- `jsonResources.prune` no longer affects `translationtools push`. `translationtools pull` still uses it.
- `get(...)` and `withPlaceholders(...).render()` render a Plural as the one sentence its number picks, by the CLDR rules of the lookup Locale. Pass the number in the placeholders map, for example `{ count: 5 }`. A placeholder binding may now be a number. A missing or non-whole number returns the raw value with a warning, or throws `PlaceholderSubstitutionException` with `throwOnPlaceholderError`. Put a Plural on a new key, because older builds of an app show the raw ICU text.
- Breaking: `translationtools generate` types each generated key by the placeholders its default-locale value contains, so `client.get(Translations.greeting, 'en', { userName: 'Ana' })` checks its map. A placeholder the value contains is required, a Plural's number is required as a `number`, and a name the value does not contain is rejected. Regenerating can surface compile errors where a lookup leaves out a placeholder or passes a name the value does not contain. Each such error was a bug that already showed the raw `{name}` text. Lookups by ref, by origin and key, and `withPlaceholders(...)` keep the free-form map.
- `placeholders.globals` in `translationtools.yaml` lists the names of your global placeholders. A listed name is optional on the keys that contain it, and may override the global value for one lookup. An invalid name fails `generate`.
- `translationtools generate` needs `@mvdmio/translation-tools-client` installed in the project. The CLI lists the client as an optional peer dependency, so installing the CLI does not install it.
- A key deleted from the JSON files disappears from TranslationTools once no running app has declared it for 7 days, plus a 24-hour grace.

## 0.1.0

A Node.js project can install the Translation Tools Client and the Translation Tools CLI from npm. Developers edit JSON resource files, then generate typed keys and pull or push with TranslationTools. After initialize, the app looks up translations with bundled fallback and runtime refresh. Until `1.0.0`, the API may still change.
