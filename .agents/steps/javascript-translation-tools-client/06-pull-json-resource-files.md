# 06 — Pull JSON resource files

Status: pending
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

- [ ] `pull` writes `strings.json` / `strings.nl.json` for this package's origins and does not write another package's `home_title`.
- [ ] A locale that exists only on the server becomes a new `name.{locale}.json` (locale lowercased).
- [ ] After a successful pull with `generated.enabled` true (or omitted), `translations/generated.ts` is updated; when `generated.enabled` is false, pull does not write generated output and `generate` still works.
- [ ] `TRANSLATIONTOOLS_API_KEY` wins over yaml `apiKey`; yaml is used when the env var is unset.
- [ ] With prune true, a local key absent from the server is removed from the JSON resource file; with prune false it remains.
- [ ] Requests use raw `Authorization` and the default host unless `TRANSLATIONTOOLS_BASE_URL` is set.
