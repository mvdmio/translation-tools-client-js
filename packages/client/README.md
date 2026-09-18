# `@mvdmio/translation-tools-client`

Translation Tools Client for Node.js. Look up translations with bundled fallback and optional runtime refresh from TranslationTools.

Requires **Node.js 22 or newer**. Version `0.x` may still change until `1.0.0`.

## Install

```bash
npm install @mvdmio/translation-tools-client
```

## Lookup example

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
console.log(title);
```

Use the Translation Tools CLI (`@mvdmio/translation-tools-cli`) to init JSON resource files, generate typed keys and bundled fallback, and pull or push with TranslationTools.
