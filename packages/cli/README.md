# `@mvdmio/translation-tools-cli`

Dev-only CLI for Translation Tools.

Requires **Node.js 22 or newer**. Version `0.x` may still change until `1.0.0`.

## Run

Without a local install, use the scoped package name:

```bash
npx @mvdmio/translation-tools-cli
```

After `npm install -D @mvdmio/translation-tools-cli` (or an equivalent local install), `npx translationtools` works because that is the bin name. There is no unscoped `translationtools` package on npm.

## Commands

- `init` — create `translationtools.yaml` and a starter `translations/strings.json`
- `generate` — write typed keys and bundled fallback from local JSON (no API key, no HTTP)
- `pull` / `push` — sync JSON resource files with TranslationTools

## Origins

An origin identifies a JSON resource file in TranslationTools:

```text
{package.json name}:/{project-relative path to the default-locale file}
```

Example: `@org/app:/translations/strings.json`. The npm package `name` (including a scope) is taken from the `package.json` next to `translationtools.yaml`. The full origin string is stored lowercase.

**Renaming the npm package changes origins.** After a rename, local keys address a different origin than any keys already stored under the old name. Plan a push (and any remote cleanup) when you rename the package.

## Client package

Generate emits an import of `@mvdmio/translation-tools-client`. Install that package in the app that looks up translations; this CLI does not depend on it.
