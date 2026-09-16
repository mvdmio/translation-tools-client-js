# 02 — Look up translations from bundled fallback

Status: pending
Blocked by: 01

## What to build

A Node.js app can create a Translation Tools Client, `initialize` with a bundled fallback, and look up strings without calling TranslationTools.

Public factory is `createClient(options)` using platform `fetch`. The app does not pass an HTTP engine. `options.apiKey` is required and non-blank. Undocumented `options.baseUrl` exists for tests (default `https://translations.mvdm.io`).

Public jobs on the client (names match KMP): `initialize`, `get` (async), `getCached` (sync, never fetches, never substitutes placeholders), `observe`, `refresh` / `refreshIfStale`, `withPlaceholders`.

Locale resolution matches KMP: explicit argument, then `currentLocaleProvider`, then project default locale, then `en`. Locales are trimmed and lowercased. There is no locale-to-locale value fallback (`nl` does not read `en`).

Missing value: cache, then bundled fallback / generated fallback string, then the key. A lookup never throws on a miss. Invalid origin (blank) or key (blank or not `^[A-Za-z0-9._-]+$`) throws a validation error.

`get` substitutes ICU-style `{camelCase}` placeholders with apostrophe escapes, matching KMP (token names `[a-z][a-zA-Z0-9]*`; `'{'` / `'}'` / `'{token}'` are literals; `''` collapses to `'`). Per-call bindings shadow globals of the same name. Unbound tokens degrade to the raw `{token}`. Extra supplied bindings warn and still succeed. Null binding → empty string. Global placeholder names on options must match `[a-z][a-zA-Z0-9]*`. `throwOnPlaceholderError` defaults false (match KMP). `getCached` does not substitute.

`observe` emits the current value immediately and again when the cached value changes (distinct until changed). Resource overloads apply fallback then key. Return an unsubscribe (callback style) or an async iterable — Node-idiomatic, same events as KMP's Flow.

This step's tests turn heartbeat and background refresh off so nothing hits the network. Refresh that would need HTTP can exist as a method and is proven in step 05.

Types the generated module will import, exported from the runtime package:

```
TranslationRef { origin: string, key: string }
TranslationStringResource { ref: TranslationRef, fallback?: string }
StoredTranslations { projectMetadata, snapshots, lastSuccessfulRefreshAt, clientId? }
```

No `managedRemotely` flag — local-only keys are out of scope; every resource is fetched.

## Footprint

Projects: packages/client

- `packages/client/src/index.ts` — `createClient`, public types
- `packages/client/src/client.ts` — `TranslationToolsClient`, `initialize`, `get`, `getCached`, `observe`, `withPlaceholders`
- `packages/client/src/options.ts` — `TranslationToolsClientOptions`
- `packages/client/src/placeholders.ts` — token parse and substitute
- `packages/client/src/models.ts` — `TranslationRef`, `TranslationStringResource`, `StoredTranslations`, snapshots
- `packages/client/src/exceptions.ts` — validation / HTTP / network errors
- `packages/client/test/` — runtime tests against bundled fallback (no network)

## Acceptance criteria

- [ ] `createClient` rejects a blank API key.
- [ ] After `initialize` with a bundled snapshot and background refresh/heartbeat off, `get` / `getCached` return the bundled string for a typed key.
- [ ] Explicit locale wins over provider, then project default, then `en`; locales are trimmed and lowercased.
- [ ] A missing key returns bundled fallback, then the key; `nl` does not read `en`.
- [ ] `getCached` does not call the network and does not substitute `{userName}`.
- [ ] `get` substitutes `{userName}`, respects apostrophe escapes, applies global placeholders, and degrades unbound tokens to `{userName}`.
- [ ] `observe` emits the current value; unsubscribing stops further emissions.
- [ ] Invalid origin or key throws a validation error; a miss does not throw.
- [ ] A JavaScript (non-TS) importer can `createClient` and `get` using the shipped types as optional.
