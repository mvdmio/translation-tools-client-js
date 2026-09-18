# Translation Tools Client (JavaScript)

Node.js packages for working with [TranslationTools](https://translationtools.mvdm.io) in application code and in local JSON resource files.

Local JSON resource files are the editable source of truth. TranslationTools is the remote store. The runtime client serves translations to application code, with bundled fallback and optional runtime refresh.

Requires **Node.js 22 or newer**. The packages are ESM-only. They run on Node.js, not in the browser. Version `0.x` may still change until `1.0.0`.

## Packages

### `@mvdmio/translation-tools-client`

Use this package in your application when you want to:

- look up translations from application code
- ship bundled fallback translations with the app
- fetch updated translations from TranslationTools after the app is installed
- substitute `{token}` placeholders, including ambient global placeholders
- persist a snapshot between launches

Install:

```bash
npm install @mvdmio/translation-tools-client
```

Basic setup after you generate typed keys (see [Quick start](#quick-start)):

```ts
import { createClient } from '@mvdmio/translation-tools-client';
import {
  Translations,
  TranslationsBundledSnapshot,
} from './translations/generated.js';

const client = createClient({
  apiKey: process.env.TRANSLATIONTOOLS_API_KEY!,
  bundledSnapshot: TranslationsBundledSnapshot,
  currentLocaleProvider: () => 'en',
  environment: 'production', // optional: scope translations to a named environment
});

await client.initialize();
const title = await client.get(Translations.home_title);
client.dispose();
```

Set `environment` to scope the translations this process fetches to a named environment (for example `production` or `staging`). Omit it for the unnamed environment.

Package docs: [`packages/client/README.md`](packages/client/README.md)

### `@mvdmio/translation-tools-cli`

Use this CLI when you want to init, generate, pull, and push JSON resource files.

Run without a local install:

```bash
npx @mvdmio/translation-tools-cli
```

Or install it as a dev dependency. After that, `npx translationtools` works because that is the bin name. There is no unscoped `translationtools` package on npm.

```bash
npm install -D @mvdmio/translation-tools-cli
npx translationtools init
npx translationtools generate
npx translationtools pull
npx translationtools push
```

- `init` creates `translationtools.yaml` and a starter `translations/strings.json`
- `generate` writes typed keys and bundled fallback from local JSON (no API key, no HTTP)
- `pull` downloads remote translations into local JSON resource files
- `push` uploads local JSON values to TranslationTools

Package docs: [`packages/cli/README.md`](packages/cli/README.md)

## Typical usage

1. Add `@mvdmio/translation-tools-client` to your application.
2. Keep JSON resource files in the project (one file per locale).
3. Run the Translation Tools CLI to init, generate, pull, and push.
4. Run `generate` after you edit local JSON.
5. Create one client, call `initialize()` at startup, and read translations through `Translations.*` or a translation ref.

## How it works

1. You keep strings in JSON resource files such as `translations/strings.json` and `translations/strings.nl.json`.
2. The CLI generates `Translations.*` typed keys and `TranslationsBundledSnapshot` from those files.
3. Your app creates a client with `createClient()` and calls `initialize()`.
4. The client restores a persisted or bundled snapshot, then optionally refreshes from TranslationTools.
5. Application code reads translations through `Translations.*` or a translation ref (`origin` plus `key`).

## Quick start

### 1. Install the packages

```bash
npm install @mvdmio/translation-tools-client
npm install -D @mvdmio/translation-tools-cli
```

Your `package.json` must have a non-empty `"name"`. The CLI uses that name to build origins. A name that contains `:` is rejected.

### 2. Create config and a starter JSON resource file

```bash
npx translationtools init
```

This writes `translationtools.yaml` and `translations/strings.json`. It refuses to overwrite either file if it already exists.

### 3. Edit JSON resource files

Default-locale file (`translations/strings.json`):

```json
{
  "home_title": "Home",
  "greeting": "Hello {userName}!"
}
```

Other locales use a locale suffix (`translations/strings.nl.json`):

```json
{
  "home_title": "Start",
  "greeting": "Hallo {userName}!"
}
```

Rules:

- Each file is a flat object of string values. Nested objects and non-string values are rejected.
- Keys must match `[A-Za-z0-9._-]+`.
- The default-locale file has no locale suffix (`strings.json`). Other locales use `name.{locale}.json` (`strings.nl.json`, `strings.pt-br.json`).
- Files that share a base name share an origin.
- The CLI reads `.json` files in the configured resource directories. It does not walk subdirectories.

### 4. Configure `translationtools.yaml`

`init` writes this starter:

```yaml
apiKey: your-project-api-key
defaultLocale: en
locales:
  - en
generated:
  enabled: true
  path: translations/generated.ts
jsonResources:
  resourceDirectories:
    - translations
  prune: false
  keyOverrides: {}
```

| Field | Purpose |
| --- | --- |
| `apiKey` | Project API key. Prefer the `TRANSLATIONTOOLS_API_KEY` environment variable in CI and local shells. |
| `defaultLocale` | Base locale. Defaults to `en`. |
| `locales` | Locales this project cares about. Pull and push also use locales from TranslationTools. |
| `generated.enabled` | When `true` (default), `pull` regenerates typed keys afterwards. `generate` always writes. |
| `generated.path` | Where to write `Translations` and `TranslationsBundledSnapshot`. Defaults to `translations/generated.ts`. |
| `jsonResources.resourceDirectories` | Directories that hold JSON resource files. Defaults to `translations`. |
| `jsonResources.prune` | When `true`, pull drops local-only keys and push deletes remote keys for this package that no longer exist locally. Defaults to `false` (merge). |
| `jsonResources.keyOverrides` | Map a JSON key to a different TranslationTools key (`json-key: translation-key`). Applied on generate, pull, and push. |

API key lookup order for pull and push:

1. Environment variable `TRANSLATIONTOOLS_API_KEY`
2. `apiKey` in `translationtools.yaml`

The runtime client needs its own `apiKey` option. It does not read `translationtools.yaml`.

### 5. Generate typed keys

```bash
npx translationtools generate
```

This writes TypeScript at `generated.path` (default `translations/generated.ts`):

- `Translations.*` for typed lookups
- `TranslationsBundledSnapshot` for bundled fallback

`generate` does not call TranslationTools and does not need an API key. Do not edit the generated file by hand. Run `generate` again after you change JSON resource files.

The generated module imports types from `@mvdmio/translation-tools-client`. Install that package in the app that looks up translations.

### 6. Create the client and initialize once at startup

```ts
import { createClient } from '@mvdmio/translation-tools-client';
import {
  Translations,
  TranslationsBundledSnapshot,
} from './translations/generated.js';

const client = createClient({
  apiKey: process.env.TRANSLATIONTOOLS_API_KEY!,
  bundledSnapshot: TranslationsBundledSnapshot,
  currentLocaleProvider: () => 'en',
});

await client.initialize();
```

`initialize()` does this:

1. Restore a persisted snapshot when a snapshot store has one.
2. Otherwise restore `bundledSnapshot`.
3. Otherwise do a blocking refresh from TranslationTools.
4. After restore, optionally refresh in the background when `backgroundRefreshEnabled` is true (the default).

`createClient` requires a non-empty `apiKey`. For bundled-only lookups with no network, still pass a key and set `backgroundRefreshEnabled: false` and `heartbeatEnabled: false`.

Call `dispose()` when the process shuts down so the heartbeat timer stops.

### 7. Read translations

```ts
import { Translations } from './translations/generated.js';

const cached = client.getCached(Translations.home_title);
const title = await client.get(Translations.home_title);
const stop = client.observe(Translations.home_title, (value) => {
  console.log(value);
});
stop();
```

You can also look up by translation ref, or by origin and key, without generated accessors:

```ts
const title = await client.get(
  { origin: 'my-app:/translations/strings.json', key: 'home_title' },
  'en',
);

const same = await client.get(
  'my-app:/translations/strings.json',
  'home_title',
  'en',
);
```

Behavior:

- `getCached(...)` returns the cached value. For a generated resource it then uses `fallback`, then the key. For a bare ref it returns `null` on a miss. It does not substitute placeholders.
- `get(...)` returns the cached value first. On a cache miss it fetches from TranslationTools. On a network failure it uses the resource fallback, the `defaultValue` argument, or the key.
- `observe(...)` calls the listener with the current cached value and again when that value changes. It returns an unsubscribe function.

Locale resolution order:

1. Explicit `locale` argument
2. `currentLocaleProvider`
3. Project default locale from the snapshot
4. `en`

Locales are trimmed and lowercased (`pt-BR` and ` pt-br ` both become `pt-br`).

## Client options

`createClient` takes `TranslationToolsClientOptions`. Only `apiKey` is required.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `apiKey` | `string` | — (required) | Project API key used to refresh translations and send heartbeats. |
| `currentLocaleProvider` | `() => string \| null \| undefined` | `() => null` | Resolves the active locale per read. |
| `preferredLocales` | `readonly string[]` | `[]` | Limits which locales are downloaded on refresh. When empty, the client fetches `currentLocaleProvider()` plus the project default. |
| `snapshotStore` | `TranslationSnapshotStore` | no-op (no persistence) | Where refreshed translations are cached between launches. |
| `bundledSnapshot` | `StoredTranslations \| null` | `null` | Generated `TranslationsBundledSnapshot`, used as offline fallback before the first refresh. |
| `backgroundRefreshEnabled` | `boolean` | `true` | Whether `initialize()` starts a background refresh after restoring the cache. Set `false` when you do not want network at startup. |
| `refreshIntervalMs` | `number` | `3_600_000` (1 hour) | Staleness window for `refreshIfStale()` and the background refresh. |
| `environment` | `string \| null` | `null` | Scopes translations and global placeholders to a named environment. |
| `heartbeatEnabled` | `boolean` | `true` | Periodically reports this client so it appears in the TranslationTools management UI. |
| `heartbeatIntervalMs` | `number` | `3_600_000` (1 hour) | How often the heartbeat is sent. |
| `globalPlaceholders` | `Record<string, () => string \| null \| undefined>` | `{}` | Ambient placeholder resolvers available to every key. |
| `throwOnPlaceholderError` | `boolean` | `false` | Throw `PlaceholderSubstitutionException` on an unresolved placeholder instead of leaving the raw `{token}`. |

## Refreshing translations

`initialize()` restores the cache and, when `backgroundRefreshEnabled` is set, refreshes once in the background. You can also refresh yourself:

```ts
await client.refresh();        // force an immediate refresh
await client.refreshIfStale(); // refresh only if older than refreshIntervalMs
```

Observe refresh status to drive logs or an offline banner:

```ts
const stop = client.observeRefreshState((state) => {
  if (state.status === 'failed') {
    console.warn(state.lastFailureMessage);
  }
});
```

`state.status` is one of `idle`, `restoringCache`, `refreshing`, `ready`, or `failed`. `state.lastSuccessfulRefreshAt` is an ISO timestamp or `null`.

## Persist a snapshot between launches

By default the client does not write a snapshot to disk. Pass a file store when you want refreshed translations to survive a process restart:

```ts
import {
  createClient,
  TranslationSnapshotStores,
} from '@mvdmio/translation-tools-client';
import { TranslationsBundledSnapshot } from './translations/generated.js';

const client = createClient({
  apiKey: process.env.TRANSLATIONTOOLS_API_KEY!,
  bundledSnapshot: TranslationsBundledSnapshot,
  snapshotStore: TranslationSnapshotStores.file(
    '/var/lib/my-app/translationtools/translations.json',
  ),
});
```

If you omit `snapshotStore`, the client uses an in-memory no-op store. Nothing is persisted across launches. Bundled fallback still works.

## Placeholders

Translation values may contain named placeholders as `{` plus a camelCase identifier plus `}`, for example `Hello {userName}`. A literal brace is written with the ICU apostrophe escape (`'{'`).

```ts
const greeting = await client.get(Translations.greeting, 'en', {
  userName: 'Sam',
});

const greeting2 = await client
  .withPlaceholders(Translations.greeting.ref, 'en')
  .setPlaceholder('userName', 'Sam')
  .render();
```

**Global placeholders** are available to every key. Register them once in options. Their names are pushed to TranslationTools at startup so they appear in the management UI:

```ts
const client = createClient({
  apiKey: process.env.TRANSLATIONTOOLS_API_KEY!,
  bundledSnapshot: TranslationsBundledSnapshot,
  environment: 'production',
  globalPlaceholders: {
    appName: () => 'My App',
    userName: () => currentUser()?.name,
  },
});
```

Names must match `[a-z][a-zA-Z0-9]*`. A per-call binding shadows a global of the same name.

When a token has no binding and no working global, the default is to leave the raw `{token}` and write a warning. Set `throwOnPlaceholderError: true` to throw `PlaceholderSubstitutionException` instead.

`getCached(...)` returns the raw value and does not substitute. Use `get(...)` or `withPlaceholders(...)` to render placeholders.

## Origins

An origin identifies a JSON resource file in TranslationTools:

```text
{package.json name}:/{project-relative path to the default-locale file}
```

Example: `@org/app:/translations/strings.json`. The npm package `name` (including a scope) is taken from the `package.json` next to `translationtools.yaml`. The full origin string is stored lowercase.

Same keys in different files or packages stay distinct. Moving a JSON resource file, or renaming the npm package, changes origins. After a rename, local keys address a different origin than keys already stored under the old name. Plan a push (and any remote cleanup) when you rename the package.

## Sync JSON resource files with TranslationTools

```bash
npx translationtools pull
npx translationtools push
```

Both commands need an API key.

**Pull** downloads translations whose origin belongs to this npm package and writes JSON resource files. Existing keys are updated in place. New keys are added. When `jsonResources.prune` is `false` (default), local-only keys are kept. When `prune` is `true`, local-only keys are dropped. When `generated.enabled` is `true` (default), pull then runs `generate`.

**Push** uploads local JSON values. When `jsonResources.prune` is `false` (default), this **merges**: remote keys you do not have locally are preserved, including keys from other packages. When `prune` is `true`, remote keys for **this package** that no longer exist locally are omitted from the upload so TranslationTools can remove them. Origins from other packages are still kept.

Normal workflow:

1. Edit JSON resource files.
2. Run `generate`.
3. Use `Translations.*` in application code.
4. Run `push` when local JSON should become the remote state.
5. Run `pull` when remote changes should be merged back into JSON.

## What you need in production

1. `@mvdmio/translation-tools-client` is in your dependencies.
2. JSON resource files exist for your default locale.
3. `translationtools.yaml` exists in the project that owns those files.
4. You have run `generate` so `Translations` and `TranslationsBundledSnapshot` are up to date.
5. The app creates one client with a real API key and `bundledSnapshot: TranslationsBundledSnapshot`.
6. The app calls `initialize()` at startup and `dispose()` on shutdown.
7. Application code reads translations through `Translations.*` or a translation ref.
8. You use `push` and `pull` to sync local JSON with TranslationTools.

## Development

This repository is an npm workspace. The root package is private and is not published.

```bash
npm run build
npm test
```

Both published packages share one version. To cut a release:

1. Bump both package versions to the same number.
2. Update the changelog.
3. Commit.
4. Tag `vX.Y.Z` (matching that version).
5. Push the tag.

GitHub Actions runs the tests, checks that the tag matches both package versions, and publishes both packages to the public npm registry with provenance. Publish uses npm trusted publishing (no npm token in GitHub secrets). Pushing `master` without a tag runs tests only and does not publish.
