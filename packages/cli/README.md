# `@mvdmio/translation-tools-cli`

Dev-only CLI for Translation Tools. Run with `npx translationtools`.

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
