# `@mvdmio/translation-tools-client`

Translation Tools Client for Node.js. Look up translations with bundled fallback and optional runtime refresh from TranslationTools.

Requires **Node.js 22 or newer**. ESM-only. Not a browser library. Version `0.x` may still change until `1.0.0`.

The full install-and-use guide is in the [repository README](https://github.com/mvdmio/translation-tools-client-js#readme).

## Install

```bash
npm install @mvdmio/translation-tools-client
```

Use the Translation Tools CLI (`@mvdmio/translation-tools-cli`) to init JSON resource files, generate typed keys and bundled fallback, and pull or push with TranslationTools.

## Lookup with generated keys

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

const title = await client.get(Translations.home_title);
const cached = client.getCached(Translations.home_title);

client.dispose();
```

`createClient` requires a non-empty `apiKey`. For bundled-only lookups with no network, still pass a key and set `backgroundRefreshEnabled: false` and `heartbeatEnabled: false`.

## Lookup without generated keys

```js
import { createClient } from '@mvdmio/translation-tools-client';

const client = createClient({
  apiKey: process.env.TRANSLATIONTOOLS_API_KEY,
  bundledSnapshot: {
    projectMetadata: { locales: ['en'], defaultLocale: 'en' },
    snapshots: [
      {
        locale: 'en',
        items: [
          {
            ref: { origin: 'my-app:/translations/strings.json', key: 'home_title' },
            value: 'Home',
          },
        ],
      },
    ],
    lastSuccessfulRefreshAt: null,
  },
  backgroundRefreshEnabled: false,
  heartbeatEnabled: false,
});

await client.initialize();
const title = await client.get(
  { origin: 'my-app:/translations/strings.json', key: 'home_title' },
  'en',
);
client.dispose();
```

## Reads

- `getCached(...)` returns the cached value. It does not substitute placeholders.
- `get(...)` returns the cached value first, fetches from TranslationTools on a miss, and substitutes `{token}` placeholders.
- `observe(...)` calls a listener when a cached value changes.
- `refresh()` / `refreshIfStale()` fetch updated translations.
- `dispose()` stops the heartbeat timer.

Locale resolution: explicit argument, then `currentLocaleProvider`, then the project default locale, then `en`.
