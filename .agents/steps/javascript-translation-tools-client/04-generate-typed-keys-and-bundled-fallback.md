# 04 — Generate typed keys and bundled fallback

Status: pending
Blocked by: 02, 03

## What to build

A developer runs `translationtools generate` and gets a committed TypeScript module of typed keys plus bundled fallback, from local JSON only. No API key. No TranslationTools HTTP.

JSON resource files are the source of truth. Default folder `translations/`. Default-locale file has no locale suffix (`strings.json`). Other locales are `name.{locale}.json` with the locale lowercased (`strings.pt-br.json`). More than one base name is allowed (`strings` and `errors`). Values are strings. Nested objects, arrays, and non-strings are invalid. Empty JSON yields no typed keys (empty `Translations` object, empty snapshot items).

Origin is `{package.json name}:/{project-relative path to the default-locale file}` (ADR-0003). Name is used as-is including a scope, then the full origin is lowercased because TranslationTools stores origin lowercase. Path starts with `/` and ends with `.json`. Locale-suffixed files share the default-locale origin. A `package.json` name that contains `:` is rejected. A missing name fails with a clear error. Document that renaming the npm package changes origins.

Key overrides in yaml map a JSON key to a different TranslationTools key. Typed identifier comes from the JSON key; `TranslationRef.key` is the override if present, else the JSON key. JSON files on disk keep the JSON keys.

Keys that fail `^[A-Za-z0-9._-]+$` (the TranslationTools key after override) are rejected.

Identifier sanitization matches KMP, with JavaScript/TypeScript reserved words instead of Kotlin keywords: lowercase; `.` `-` `/` whitespace and other invalid identifier characters become `_`; collapse and trim `_`; empty → `key`; leading digit → `key_` prefix; reserved word → `_` suffix. Colliding sanitized names (including the same JSON key in two base files) get `__` plus the first 8 hex chars of SHA-256 of `origin + NUL + jsonKey`, so generate does not drop a key. The translation ref keeps the original TranslationTools key.

Default generated path `translations/generated.ts`, configurable via `generated.path`. Always named `Translations` (objectName is not supported). One module imports types from `@mvdmio/translation-tools-client` and exports typed keys plus bundled fallback for all local locales:

```
import type { TranslationStringResource, StoredTranslations } from '@mvdmio/translation-tools-client';

export const Translations = {
  home_title: { ref: { origin: '@org/app:/translations/strings.json', key: 'home_title' }, fallback: 'Home' },
};

export const TranslationsBundledSnapshot: StoredTranslations = { /* snapshots per local locale, lastSuccessfulRefreshAt null */ };
```

Fallback on each typed key is the default-locale string. Entries are sorted by JSON key.

## Footprint

Projects: packages/cli, packages/client

- `packages/cli/src/generate.ts` — `generate` command
- `packages/cli/src/json-resources.ts` — read flat JSON, locales in filenames, nested/non-string rejected
- `packages/cli/src/origin.ts` — package.json name, colon check, lowercase origin
- `packages/cli/src/sanitize.ts` — identifier sanitization and collision suffix
- `packages/cli/src/config.ts` — generated.path, jsonResources, keyOverrides (already started in 03)
- `packages/cli/test/generate.test.ts` — CLI process tests (typed key, original key, sanitization, collision, nested, invalid key, empty file, scoped name, colon, missing name)
- package README or equivalent — renaming the npm package changes origins

## Acceptance criteria

- [ ] `generate` with no API key writes `translations/generated.ts` that typechecks against the runtime package.
- [ ] A typed key's `ref.origin` is `{lowercase package name}:/{path}`; `ref.key` is the JSON key (or override).
- [ ] `home.title` and `home-title` both appear; sanitized names collide with a stable suffix; original keys are preserved on the refs.
- [ ] Nested JSON, non-string values, and keys outside `^[A-Za-z0-9._-]+$` fail generate with a non-zero exit.
- [ ] Empty JSON produces no typed keys.
- [ ] A scoped `package.json` name is kept in origin; a name containing `:` fails; a missing name fails clearly.
- [ ] `strings.json` and `strings.nl.json` share one origin; `errors.json` is a second origin.
- [ ] Docs state that renaming the npm package changes origins.
