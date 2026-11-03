# Changelog

## Unreleased

Requires a TranslationTools server that already runs michielvandermeer/mvdmio-suite#58. On an older server, a push that sends only local keys makes the unnamed environment drop other packages' keys.

- The runtime client declares the keys in `bundledSnapshot` when `initialize()` runs, under the configured `environment`. Values fill only empty translation values. A failed declaration never fails `initialize()`. Without `bundledSnapshot`, nothing is declared.
- `translationtools push` sends only the keys and values in the local JSON files. It no longer fetches project metadata or locales from TranslationTools first, and no longer merges remote keys into the upload.
- `jsonResources.prune` no longer affects `translationtools push`. `translationtools pull` still uses it.
- A key deleted from the JSON files disappears from TranslationTools once no running app has declared it for 7 days, plus a 24-hour grace.

## 0.1.0

A Node.js project can install the Translation Tools Client and the Translation Tools CLI from npm. Developers edit JSON resource files, then generate typed keys and pull or push with TranslationTools. After initialize, the app looks up translations with bundled fallback and runtime refresh. Until `1.0.0`, the API may still change.
