# 07 — Push JSON resource files

Status: done
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

- [x] `push` POSTs `/api/v1/translations/project` with this package's origins, locales, keys, and values.
- [x] With prune false, a remote-only key is still present in the POST; with prune true it is omitted.
- [x] A key override sends the TranslationTools key, not the JSON key.
- [x] Invalid keys and nested JSON fail the CLI without posting.
- [x] Two packages' JSON with the same JSON key produce different origins in the POST body.
- [x] Authorization is the raw API key; `TRANSLATIONTOOLS_API_KEY` wins over yaml.

## Outcome

`translationtools push` is implemented in `packages/cli`. `bin.ts` dispatches to `runPush(cwd)` in `push.ts`. API key via `resolveApiKey` (env then yaml); missing key exits 1 with no HTTP. Base URL via `resolveCliBaseUrl`.

Local files are discovered and validated through existing `discoverJsonResourceFiles` / `buildTranslationProject` (invalid TT keys, nested/non-string JSON fail before any request). Local push items use lowercased origin `{package}:/{default-locale path}`, locale from each file, and `translationKey` after `keyOverrides`. Empty `{}` files contribute no items.

`jsonResources.prune` true: POST body is local items only (no GET). False (default): GET project metadata + each locale (union of remote default, remote locales, and locales present in local JSON — same as KMP `pullTranslations` when push merges), then merge all remote items with local (local wins on origin+locale+key), matching KMP `mergeRemoteAndLocalPushItems` (other packages' remote keys are kept when not pruning). POST `{ items }` only — no `prune` / `environment` fields (KMP plugin body). Response counts are printed like KMP.

`http.ts` gained `postProjectItems` on the existing `node:http`/`https` client (`Connection: close`, `agent: false`, raw `Authorization`). Coverage: `packages/cli/test/push.test.ts`. `json-resources.ts` needed no edits.
