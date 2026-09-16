# 06 — Pull JSON resource files

Status: done
Blocked by: 04

## What to build

A developer runs `translationtools pull` and local JSON resource files pick up remote changes. Pull then generates, unless `generated.enabled` is false (the `generate` command still exists).

API key: `TRANSLATIONTOOLS_API_KEY`, then yaml `apiKey`. Missing key fails clearly. Undocumented `TRANSLATIONTOOLS_BASE_URL` points tests at the fake server (not a documented consumer setting).

Pull talks to TranslationTools the same way the KMP plugin does: GET project metadata, GET each locale list. Auth is raw `Authorization`. It writes JSON only for origins that belong to this package (`{lowercase package.json name}:…`). Other packages' origins in the same TranslationTools project are ignored. Locale-suffixed files share the default-locale origin.

Pull creates missing locale files (`name.{locale}.json`, locale lowercased) for project locales. Default-locale file has no suffix. JSON is pretty-printed, keys sorted, values strings.

`jsonResources.prune` default false: pull updates and adds keys from the server and keeps extra local keys. When true, pull drops local keys the server no longer has for that origin (this client's pull prune; KMP only pruned on push).

Key overrides: server TranslationTools keys map back to JSON keys when writing files.

Pull does not fetch locale-to-locale fallbacks; each locale file only contains values that locale actually has.

## Footprint

Projects: packages/cli

- `packages/cli/src/pull.ts` — `pull` command, origin filter, write JSON, optional generate
- `packages/cli/src/http.ts` — CLI TranslationTools HTTP (metadata + per-locale GET)
- `packages/cli/src/json-resources.ts` — write locale files, create missing, prune
- `packages/cli/src/config.ts` — API key env then yaml, generated.enabled, prune, keyOverrides
- `packages/cli/test/pull.test.ts` — CLI process + fake HTTP: origin filter by package name, scoped names, locale file naming, create missing files, prune, generate after pull, generated.enabled false skips generate

## Acceptance criteria

- [x] `pull` writes `strings.json` / `strings.nl.json` for this package's origins and does not write another package's `home_title`.
- [x] A locale that exists only on the server becomes a new `name.{locale}.json` (locale lowercased).
- [x] After a successful pull with `generated.enabled` true (or omitted), `translations/generated.ts` is updated; when `generated.enabled` is false, pull does not write generated output and `generate` still works.
- [x] `TRANSLATIONTOOLS_API_KEY` wins over yaml `apiKey`; yaml is used when the env var is unset.
- [x] With prune true, a local key absent from the server is removed from the JSON resource file; with prune false it remains.
- [x] Requests use raw `Authorization` and the default host unless `TRANSLATIONTOOLS_BASE_URL` is set.

## Outcome

`translationtools pull` is implemented in `packages/cli`. `bin.ts` dispatches to `runPull(cwd)` in `pull.ts`. API key via existing `resolveApiKey` (env then yaml); missing key exits 1 with no HTTP. Undocumented `TRANSLATIONTOOLS_BASE_URL` via `resolveCliBaseUrl` (default `https://translations.mvdm.io`).

HTTP lives in `packages/cli/src/http.ts` using `node:http`/`https` with `Connection: close` and `agent: false` (not `fetch` — undici + `process.exit` aborted on Windows in this worktree). Same KMP plugin paths: GET `/api/v1/translations/project`, GET `/api/v1/translations/{locale}` (no environment segment). Auth is the raw API key.

Locales fetched: union of remote default, remote locales, and yaml `locales`, trimmed/lowercased. Package filter: origin must start with `{packageName.toLowerCase()}:`. File path is taken from the origin after the colon (leading `/` stripped), like the .NET tool — not KMP’s “must already map to a local XML” rule. Missing `name.{locale}.json` files are created when that locale has a non-null value; default-locale file stays unsuffixed using yaml `defaultLocale`. Null server values are omitted (no locale-to-locale fill). `keyOverrides` are reversed when writing (TT key → JSON key). `prune` false merges server into local; true replaces with server keys for that locale file. Then `runGenerate` unless `generated.enabled` is false.

`config.ts` needed no edits (already from step 03). Write/merge helpers landed in `json-resources.ts`. Coverage: `packages/cli/test/pull.test.ts`.
