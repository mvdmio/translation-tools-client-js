# 05 — Refresh translations from TranslationTools

Status: done
Blocked by: 02

## What to build

After install, a Node.js process can refresh copy from TranslationTools, fetch a single missing key, persist an opt-in snapshot, heartbeat, and observe updates — without a new build.

`initialize` order matches KMP: restore persisted snapshot if any, else bundled fallback; mint and persist a client id; fire-and-forget globals POST when global placeholders are registered; if nothing was restored, blocking refresh (failure still starts heartbeat, then throws); else optional background refresh when `backgroundRefreshEnabled` (default true). Heartbeat defaults on, interval one hour, platform string `node`, version from the runtime package. Refresh interval defaults to one hour.

HTTP matches the KMP client, using platform `fetch`:

- GET `/api/v1/translations/project` — metadata
- GET `/api/v1/translations/{locale}` with optional `/{environment}` — locale snapshot
- GET `/api/v1/translations/{encodedOrigin}/{locale}/{key}` with optional `/{environment}` and `defaultValue` query — one ref
- POST `/api/v1/translations/heartbeat` — `{ clientId, environment, platform, version }`
- POST `/api/v1/translations/project` — globals-only push `{ items: [], environment, globals }` at startup

Auth is the project API key as the raw `Authorization` header (not Bearer). Origin is one URL path segment (slashes encoded). Environment is trimmed; blank is omitted. Default base URL `https://translations.mvdm.io`.

`get` on a cache miss fetches that one translation ref, writes it into cache, persists, then renders. `getCached` still never fetches.

Default snapshot store does not persist. A file store is opt-in (`TranslationSnapshotStores.file(path)` or equivalent). Restore on initialize uses the store before bundled fallback.

`refresh` always refreshes; `refreshIfStale` no-ops inside the interval. Concurrent refreshes collapse. `observe` emits when a refresh changes the value.

`preferredLocales` on options selects which locales to fetch on refresh (match KMP); otherwise current locale + project default.

This step's tests use the fake HTTP helper and `baseUrl`.

## Footprint

Projects: packages/client

- `packages/client/src/http.ts` — `TranslationToolsHttpApi`, paths, raw Authorization, origin encoding
- `packages/client/src/client.ts` — initialize network path, refresh, get-on-miss, heartbeat, globals push
- `packages/client/src/snapshot-store.ts` — no-op store, file store
- `packages/client/src/create-client.ts` — wires fetch HTTP using options.apiKey, environment, baseUrl
- `packages/client/test/` — fake HTTP tests: initialize/get/refresh, Authorization, encoded origin, environment segment, heartbeat body, snapshot restore, observe on refresh, bundled fallback when network is down

## Acceptance criteria

- [x] `initialize` with no persisted snapshot and no bundled fallback does a blocking refresh; with bundled fallback and background refresh on, it serves bundled immediately and refreshes in the background.
- [x] `get` on a cache miss GETs `/api/v1/translations/{encodedOrigin}/{locale}/{key}` and then `getCached` hits.
- [x] Requests send the API key as raw `Authorization` (not `Bearer`).
- [x] Origin `@org/app:/translations/strings.json` is one path segment (`@org/app:%2Ftranslations%2Fstrings.json`).
- [x] Environment `staging` is appended on locale GET, single-key GET, and included on heartbeat.
- [x] Heartbeat POST body includes `platform: "node"` and a client id that survives a file-store restart.
- [x] Default snapshot store does not write files; the file store restores the last refresh after a new `createClient`/`initialize`.
- [x] When the network is down and nothing is persisted, bundled fallback still serves default-locale strings.
- [x] `observe` emits the new value after a refresh changes it.
- [x] `refreshIfStale` skips inside the default one-hour window and refreshes after it.

## Outcome

Step 02 already shipped the network client path (`createHttpApi` / `TranslationToolsApi` in `http.ts`, initialize/refresh/get-on-miss/heartbeat/globals in `client.ts`, `noOpSnapshotStore`). This step added the opt-in file store and proved the HTTP surface with the shared fake.

`TranslationSnapshotStores.file(path)` writes JSON to that path (creates parents; invalid JSON on load clears the file and returns null). Public export: `TranslationSnapshotStores` alongside `noOpSnapshotStore`. Heartbeat `version` is read from `packages/client/package.json`. Undocumented test clock: `options.now`. Path encoding matches Ktor `encodeURLPathPart` (pchar kept; `/` → `%2F`), so `@org/app:/translations/strings.json` becomes `@org%2Fapp:%2Ftranslations%2Fstrings.json` (the step criterion’s `@org/app:%2F…` omitted encoding the scoped `/`; Spec/KMP win). Coverage: `packages/client/test/refresh-from-translationtools.test.ts`.
