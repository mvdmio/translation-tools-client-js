import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createClient,
  noOpSnapshotStore,
  type StoredTranslations,
} from '@mvdmio/translation-tools-client';
import { startFakeTranslationToolsHttp } from '../../../test/support/fake-translation-tools-http.ts';
import { waitFor } from '../../../test/support/wait-for.ts';

const ORIGIN = '@org/app:/translations/strings.json';
const DECLARATION_PATH = '/api/v1/translations/declaration';

function bundledSnapshot(): StoredTranslations {
  return {
    projectMetadata: { locales: ['en', 'nl'], defaultLocale: 'en' },
    snapshots: [
      {
        locale: 'en',
        items: [
          { ref: { origin: ORIGIN, key: 'home_title' }, value: 'Home' },
          { ref: { origin: ORIGIN, key: 'nl_only' }, value: '' },
          { ref: { origin: ORIGIN, key: 'no_value' }, value: '' },
          { ref: { origin: ORIGIN, key: 'null_value' }, value: null },
        ],
      },
      {
        locale: 'NL',
        items: [
          { ref: { origin: ORIGIN, key: 'home_title' }, value: 'Thuis' },
          { ref: { origin: ORIGIN, key: 'nl_only' }, value: 'Alleen NL' },
          { ref: { origin: ORIGIN, key: 'no_value' }, value: null },
        ],
      },
    ],
    lastSuccessfulRefreshAt: null,
  };
}

function declarationRequests(fake: Awaited<ReturnType<typeof startFakeTranslationToolsHttp>>) {
  return fake.requests.filter((request) => request.path === DECLARATION_PATH);
}

/**
 * Replaces `globalThis.fetch` and records the URL of every Declaration call. The client binds
 * `globalThis.fetch` when it is created, so install this before `createClient`. Calls pass
 * through to the real `fetch` unless `rejectDeclarations` is set, which fails them the way
 * `fetch` fails on a network error.
 */
function interceptFetch() {
  const original = globalThis.fetch;
  const intercept = {
    declarationCalls: [] as string[],
    rejectDeclarations: false,
    restore: () => {
      globalThis.fetch = original;
    },
  };
  globalThis.fetch = ((input, init) => {
    if (String(input).endsWith(DECLARATION_PATH)) {
      intercept.declarationCalls.push(String(input));
      if (intercept.rejectDeclarations) {
        return Promise.reject(new TypeError('fetch failed'));
      }
    }
    return original(input, init);
  }) as typeof globalThis.fetch;
  return intercept;
}

/** Yields to the event loop once, so every pending promise step has run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test('initialize declares the bundled snapshot keys under the environment', async () => {
  const fake = await startFakeTranslationToolsHttp();
  try {
    fake.respond('POST', DECLARATION_PATH, { status: 200, body: '' });
    const client = createClient({
      apiKey: 'test-api-key',
      environment: 'production',
      bundledSnapshot: bundledSnapshot(),
      snapshotStore: noOpSnapshotStore,
      backgroundRefreshEnabled: false,
      heartbeatEnabled: false,
      baseUrl: fake.baseUrl,
    });
    await client.initialize();
    await waitFor(() => declarationRequests(fake).length === 1);

    const [request] = declarationRequests(fake);
    assert.ok(request);
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.authorization, 'test-api-key');
    assert.deepEqual(JSON.parse(request.bodyText), {
      items: [
        { origin: ORIGIN, locale: 'en', key: 'home_title', value: 'Home' },
        { origin: ORIGIN, locale: 'nl', key: 'home_title', value: 'Thuis' },
        { origin: ORIGIN, locale: 'nl', key: 'nl_only', value: 'Alleen NL' },
        { origin: ORIGIN, locale: 'en', key: 'no_value', value: '' },
        { origin: ORIGIN, locale: 'en', key: 'null_value', value: '' },
      ],
      environment: 'production',
    });
    client.dispose();
  } finally {
    await fake.close();
  }
});

test('the declaration body has no environment when none is configured', async () => {
  const fake = await startFakeTranslationToolsHttp();
  try {
    fake.respond('POST', DECLARATION_PATH, { status: 200, body: '' });
    const client = createClient({
      apiKey: 'test-api-key',
      bundledSnapshot: bundledSnapshot(),
      snapshotStore: noOpSnapshotStore,
      backgroundRefreshEnabled: false,
      heartbeatEnabled: false,
      baseUrl: fake.baseUrl,
    });
    await client.initialize();
    await waitFor(() => declarationRequests(fake).length === 1);

    const body = JSON.parse(declarationRequests(fake)[0]!.bodyText) as Record<string, unknown>;
    assert.equal('environment' in body, false);
    client.dispose();
  } finally {
    await fake.close();
  }
});

test('a restored cache does not change what is declared', async () => {
  const fake = await startFakeTranslationToolsHttp();
  try {
    fake.respond('POST', DECLARATION_PATH, { status: 200, body: '' });
    const client = createClient({
      apiKey: 'test-api-key',
      environment: 'production',
      bundledSnapshot: bundledSnapshot(),
      snapshotStore: {
        load: async () => ({
          projectMetadata: { locales: ['en'], defaultLocale: 'en' },
          snapshots: [
            {
              locale: 'en',
              items: [{ ref: { origin: ORIGIN, key: 'cached_only' }, value: 'Cached' }],
            },
          ],
          lastSuccessfulRefreshAt: '2026-03-25T10:00:00.000Z',
        }),
        save: async () => {},
        clear: async () => {},
      },
      backgroundRefreshEnabled: false,
      heartbeatEnabled: false,
      baseUrl: fake.baseUrl,
    });
    await client.initialize();
    await waitFor(() => declarationRequests(fake).length === 1);

    const body = JSON.parse(declarationRequests(fake)[0]!.bodyText) as {
      items: Array<{ key: string }>;
    };
    assert.deepEqual(
      [...new Set(body.items.map((item) => item.key))],
      ['home_title', 'nl_only', 'no_value', 'null_value'],
    );
    client.dispose();
  } finally {
    await fake.close();
  }
});

test('no declaration is sent without a bundled snapshot or without items', async () => {
  const fake = await startFakeTranslationToolsHttp();
  const intercept = interceptFetch();
  try {
    fake.respond('GET', '/api/v1/translations/project', {
      json: { locales: ['en'], defaultLocale: 'en' },
    });
    fake.respond('GET', '/api/v1/translations/en', { json: [] });
    const withoutBundled = createClient({
      apiKey: 'test-api-key',
      snapshotStore: noOpSnapshotStore,
      backgroundRefreshEnabled: false,
      heartbeatEnabled: false,
      baseUrl: fake.baseUrl,
    });
    await withoutBundled.initialize();
    await settle();
    assert.deepEqual(intercept.declarationCalls, []);
    withoutBundled.dispose();

    const empty = createClient({
      apiKey: 'test-api-key',
      bundledSnapshot: {
        projectMetadata: { locales: ['en'], defaultLocale: 'en' },
        snapshots: [{ locale: 'en', items: [] }],
        lastSuccessfulRefreshAt: null,
      },
      snapshotStore: noOpSnapshotStore,
      backgroundRefreshEnabled: false,
      heartbeatEnabled: false,
      baseUrl: fake.baseUrl,
    });
    await empty.initialize();
    await settle();
    empty.dispose();

    assert.deepEqual(intercept.declarationCalls, []);
    assert.equal(declarationRequests(fake).length, 0);
  } finally {
    intercept.restore();
    await fake.close();
  }
});

test('initialize resolves and logs nothing when the declaration fails', async () => {
  const logged: unknown[][] = [];
  const originals = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  console.log = (...args) => void logged.push(args);
  console.warn = (...args) => void logged.push(args);
  console.error = (...args) => void logged.push(args);

  const fake = await startFakeTranslationToolsHttp();
  const intercept = interceptFetch();
  try {
    fake.respond('POST', DECLARATION_PATH, { status: 500, json: { error: 'boom' } });
    const httpFailure = createClient({
      apiKey: 'test-api-key',
      bundledSnapshot: bundledSnapshot(),
      snapshotStore: noOpSnapshotStore,
      backgroundRefreshEnabled: false,
      heartbeatEnabled: false,
      baseUrl: fake.baseUrl,
    });
    await httpFailure.initialize();
    await waitFor(() => declarationRequests(fake).length === 1);
    await settle();
    httpFailure.dispose();

    intercept.rejectDeclarations = true;
    const networkFailure = createClient({
      apiKey: 'test-api-key',
      bundledSnapshot: bundledSnapshot(),
      snapshotStore: noOpSnapshotStore,
      backgroundRefreshEnabled: false,
      heartbeatEnabled: false,
      baseUrl: fake.baseUrl,
    });
    await networkFailure.initialize();
    await waitFor(() => intercept.declarationCalls.length === 2);
    await settle();
    networkFailure.dispose();
    assert.equal(declarationRequests(fake).length, 1);
  } finally {
    intercept.restore();
    Object.assign(console, originals);
    await fake.close();
  }
  assert.deepEqual(logged, []);
});
