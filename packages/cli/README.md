# `@mvdmio/translation-tools-cli`

Dev-only CLI for Translation Tools. Init, generate, pull, and push JSON resource files.

Requires **Node.js 22 or newer**. Version `0.x` may still change until `1.0.0`.

The full install-and-use guide is in the [repository README](https://github.com/mvdmio/translation-tools-client-js#readme).

## Run

Without a local install, use the scoped package name:

```bash
npx @mvdmio/translation-tools-cli
```

After `npm install -D @mvdmio/translation-tools-cli`, `npx translationtools` works because that is the bin name. There is no unscoped `translationtools` package on npm.

```bash
npx translationtools init
npx translationtools generate
npx translationtools pull
npx translationtools push
```

## Commands

- `init` — create `translationtools.yaml` and a starter `translations/strings.json`
- `generate` — write typed keys and bundled fallback from local JSON (no API key, no HTTP)
- `pull` — download remote translations into local JSON resource files
- `push` — upload local JSON values to TranslationTools

`init` and `generate` do not call TranslationTools. `pull` and `push` need an API key from `TRANSLATIONTOOLS_API_KEY` or `apiKey` in `translationtools.yaml`.

## JSON resource files

Keep a flat JSON object of string values per locale. Nested objects are rejected.

- Default locale: `translations/strings.json`
- Other locales: `translations/strings.nl.json`

Files that share a base name share an origin. Keys must match `[A-Za-z0-9._-]+`.

Your `package.json` must have a non-empty `"name"`. The CLI uses that name to build origins.

## Origins

An origin identifies a JSON resource file in TranslationTools:

```text
{package.json name}:/{project-relative path to the default-locale file}
```

Example: `@org/app:/translations/strings.json`. The npm package `name` (including a scope) is taken from the `package.json` next to `translationtools.yaml`. The full origin string is stored lowercase.

**Renaming the npm package changes origins.** After a rename, local keys address a different origin than any keys already stored under the old name. Plan a push (and any remote cleanup) when you rename the package.

## Generate

`generate` writes TypeScript (`translations/generated.ts` by default):

- `Translations.*` for typed lookups
- `TranslationsBundledSnapshot` for bundled fallback

That file imports `@mvdmio/translation-tools-client`. Install the client package in the app that looks up translations. This CLI does not depend on it.

When `generated.enabled` is `true` (default), `pull` runs `generate` afterwards. `generate` itself always writes.
