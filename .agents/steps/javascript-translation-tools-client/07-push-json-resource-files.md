# 07 — Push JSON resource files

Status: pending
Blocked by: 06

## What to build

A developer runs `translationtools push` and local JSON resource files become the remote store.

Push POSTs `/api/v1/translations/project` with items `{ origin, locale, key, value }`, same body the KMP plugin sends. Auth is raw `Authorization`. API key lookup matches pull (`TRANSLATIONTOOLS_API_KEY`, then yaml). Origin is lowercased `{package name}:/{default-locale path}`. Key overrides apply: JSON key → TranslationTools key.

`jsonResources.prune` default false: merge remote items with local (local wins on overlap) so remote-only keys are kept. When true, the POST contains only local items so the remote store becomes an exact mirror of local keys for this package's origins.

Invalid keys (`^[A-Za-z0-9._-]+$` after override), nested JSON, and non-string values fail push with a non-zero exit and do not POST. Empty JSON resource files push no items for that file.

Every key in a JSON resource file is pushed (no local-only marker).

## Footprint

Projects: packages/cli

- `packages/cli/src/push.ts` — `push` command, prune merge vs local-only
- `packages/cli/src/http.ts` — POST project items
- `packages/cli/src/json-resources.ts` — read local files for push (shared with pull/generate)
- `packages/cli/test/push.test.ts` — CLI process + fake HTTP: items posted, prune, key overrides, invalid keys rejected, origin includes package name

## Acceptance criteria

- [ ] `push` POSTs `/api/v1/translations/project` with this package's origins, locales, keys, and values.
- [ ] With prune false, a remote-only key is still present in the POST; with prune true it is omitted.
- [ ] A key override sends the TranslationTools key, not the JSON key.
- [ ] Invalid keys and nested JSON fail the CLI without posting.
- [ ] Two packages' JSON with the same JSON key produce different origins in the POST body.
- [ ] Authorization is the raw API key; `TRANSLATIONTOOLS_API_KEY` wins over yaml.
