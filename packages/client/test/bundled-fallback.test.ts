import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createClient,
  TranslationToolsValidationException,
  type StoredTranslations,
  type TranslationRef,
  type TranslationStringResource,
} from '@mvdmio/translation-tools-client';

const ORIGIN = '@demo/app:/translations/strings.json';

const homeTitleRef: TranslationRef = { origin: ORIGIN, key: 'home_title' };
const greetingRef: TranslationRef = { origin: ORIGIN, key: 'greeting' };
const missingRef: TranslationRef = { origin: ORIGIN, key: 'missing_key' };

const homeTitleResource: TranslationStringResource = {
  ref: homeTitleRef,
  fallback: 'Home',
};

const missingResource: TranslationStringResource = {
  ref: missingRef,
  fallback: 'Missing fallback',
};

const missingNoFallback: TranslationStringResource = {
  ref: missingRef,
};

function bundledSnapshot(): StoredTranslations {
  return {
    projectMetadata: {
      locales: ['en', 'nl'],
      defaultLocale: 'en',
    },
    snapshots: [
      {
        locale: 'en',
        items: [
          { ref: homeTitleRef, value: 'Home' },
          { ref: greetingRef, value: 'Hello {userName}!' },
          {
            ref: { origin: ORIGIN, key: 'welcome' },
            value: 'Welcome to {appName}',
          },
          {
            ref: { origin: ORIGIN, key: 'escaped' },
            value: "'{'userName'}'",
          },
          {
            ref: { origin: ORIGIN, key: 'its_count' },
            value: "It's {n} cats",
          },
        ],
      },
      {
        locale: 'nl',
        items: [{ ref: homeTitleRef, value: 'Home NL' }],
      },
    ],
    lastSuccessfulRefreshAt: null,
  };
}

function createOfflineClient(overrides: Record<string, unknown> = {}) {
  return createClient({
    apiKey: 'test-api-key',
    bundledSnapshot: bundledSnapshot(),
    backgroundRefreshEnabled: false,
    heartbeatEnabled: false,
    baseUrl: 'http://127.0.0.1:9',
    ...overrides,
  });
}

test('createClient rejects a blank API key', () => {
  assert.throws(() => createClient({ apiKey: '' }), /ApiKey is required/);
  assert.throws(() => createClient({ apiKey: '   ' }), /ApiKey is required/);
});

test('initialize with bundled snapshot serves get and getCached without network', async () => {
  const client = createOfflineClient();
  await client.initialize();

  assert.equal(client.getCached(homeTitleRef, 'en'), 'Home');
  assert.equal(client.getCached(homeTitleResource, 'en'), 'Home');
  assert.equal(await client.get(homeTitleRef, 'en'), 'Home');
  assert.equal(await client.get(homeTitleResource, 'en'), 'Home');
  client.dispose();
});

test('locale resolution: explicit, then provider, then project default, then en', async () => {
  const withProvider = createOfflineClient({
    currentLocaleProvider: () => ' NL ',
  });
  await withProvider.initialize();
  assert.equal(withProvider.getCached(homeTitleRef), 'Home NL');
  assert.equal(withProvider.getCached(homeTitleRef, ' En '), 'Home');
  withProvider.dispose();

  const withoutProvider = createOfflineClient({
    currentLocaleProvider: () => null,
  });
  await withoutProvider.initialize();
  assert.equal(withoutProvider.getCached(homeTitleRef), 'Home');
  withoutProvider.dispose();

  const noMetadata = createClient({
    apiKey: 'test-api-key',
    bundledSnapshot: {
      projectMetadata: null,
      snapshots: [
        {
          locale: 'en',
          items: [{ ref: homeTitleRef, value: 'Home' }],
        },
      ],
      lastSuccessfulRefreshAt: null,
    },
    backgroundRefreshEnabled: false,
    heartbeatEnabled: false,
    currentLocaleProvider: () => null,
    baseUrl: 'http://127.0.0.1:9',
  });
  await noMetadata.initialize();
  assert.equal(noMetadata.getCached(homeTitleRef), 'Home');
  noMetadata.dispose();
});

test('missing key returns bundled fallback then key; nl does not read en', async () => {
  const client = createOfflineClient({
    currentLocaleProvider: () => 'nl',
  });
  await client.initialize();

  assert.equal(client.getCached(missingResource, 'nl'), 'Missing fallback');
  assert.equal(client.getCached(missingNoFallback, 'nl'), 'missing_key');
  assert.equal(client.getCached(greetingRef, 'nl'), null);
  assert.equal(
    client.getCached({ ref: greetingRef, fallback: 'Hi' }, 'nl'),
    'Hi',
  );
  client.dispose();
});

test('getCached does not substitute placeholders', async () => {
  const client = createOfflineClient();
  await client.initialize();

  assert.equal(client.getCached(greetingRef, 'en'), 'Hello {userName}!');
  client.dispose();
});

test('get substitutes placeholders, escapes, globals, and degrades unbound tokens', async () => {
  const client = createOfflineClient({
    globalPlaceholders: {
      appName: () => 'Acme',
    },
  });
  await client.initialize();

  assert.equal(await client.get(greetingRef, 'en', { userName: 'Bob' }), 'Hello Bob!');
  assert.equal(await client.get(greetingRef, 'en'), 'Hello {userName}!');
  assert.equal(await client.get({ origin: ORIGIN, key: 'welcome' }, 'en'), 'Welcome to Acme');
  assert.equal(
    await client.get({ origin: ORIGIN, key: 'welcome' }, 'en', { appName: 'Local' }),
    'Welcome to Local',
  );
  assert.equal(await client.get({ origin: ORIGIN, key: 'escaped' }, 'en'), '{userName}');
  assert.equal(
    await client.get({ origin: ORIGIN, key: 'its_count' }, 'en', { n: '3' }),
    "It's 3 cats",
  );
  assert.equal(await client.get(greetingRef, 'en', { userName: null }), 'Hello !');

  const rendered = await client
    .withPlaceholders(greetingRef, 'en')
    .setPlaceholder('userName', 'Ada')
    .render();
  assert.equal(rendered, 'Hello Ada!');
  client.dispose();
});

test('observe emits current value and unsubscribe stops further emissions', async () => {
  const { startFakeTranslationToolsHttp } = await import(
    '../../../test/support/fake-translation-tools-http.ts'
  );
  const fake = await startFakeTranslationToolsHttp();
  try {
    const respondSnapshots = (homeValue: string): void => {
      fake.respond('GET', '/api/v1/translations/project', {
        json: { locales: ['en'], defaultLocale: 'en' },
      });
      fake.respond('GET', '/api/v1/translations/en', {
        json: [{ origin: ORIGIN, key: 'home_title', value: homeValue }],
      });
    };

    respondSnapshots('Home');
    const client = createClient({
      apiKey: 'test-api-key',
      bundledSnapshot: bundledSnapshot(),
      backgroundRefreshEnabled: false,
      heartbeatEnabled: false,
      baseUrl: fake.baseUrl,
    });
    await client.initialize();

    const values: string[] = [];
    const stop = client.observe(homeTitleResource, 'en', (value) => {
      values.push(value);
    });
    assert.deepEqual(values, ['Home']);

    respondSnapshots('Home refreshed');
    await client.refresh();
    assert.deepEqual(values, ['Home', 'Home refreshed']);

    stop();
    respondSnapshots('Home after unsubscribe');
    await client.refresh();
    assert.deepEqual(values, ['Home', 'Home refreshed']);
    client.dispose();
  } finally {
    await fake.close();
  }
});

test('invalid origin or key throws; a miss does not throw', async () => {
  const client = createOfflineClient();
  await client.initialize();

  assert.throws(
    () => client.getCached({ origin: ' ', key: 'home_title' }),
    (error: unknown) => error instanceof TranslationToolsValidationException,
  );
  assert.throws(
    () => client.getCached({ origin: ORIGIN, key: '' }),
    (error: unknown) => error instanceof TranslationToolsValidationException,
  );
  assert.throws(
    () => client.getCached({ origin: ORIGIN, key: 'bad key!' }),
    (error: unknown) => error instanceof TranslationToolsValidationException,
  );

  assert.equal(client.getCached(missingRef, 'en'), null);
  assert.equal(client.getCached(missingResource, 'en'), 'Missing fallback');
  assert.equal(await client.get(missingResource, 'en'), 'Missing fallback');
  assert.equal(await client.get(missingNoFallback, 'en'), 'missing_key');
  assert.equal(await client.get(missingRef, 'en'), 'missing_key');
  client.dispose();
});

test('JavaScript importer can createClient and get using shipped types as optional', async () => {
  const mod = await import('@mvdmio/translation-tools-client');
  const client = mod.createClient({
    apiKey: 'js-key',
    bundledSnapshot: bundledSnapshot(),
    backgroundRefreshEnabled: false,
    heartbeatEnabled: false,
    baseUrl: 'http://127.0.0.1:9',
  });
  await client.initialize();
  assert.equal(await client.get(homeTitleRef, 'en'), 'Home');
  client.dispose();
});
