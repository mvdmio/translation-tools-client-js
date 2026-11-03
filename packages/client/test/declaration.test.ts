import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createClient,
  noOpSnapshotStore,
  type StoredTranslations,
} from '@mvdmio/translation-tools-client';
import { startFakeTranslationToolsHttp } from '../../../test/support/fake-translation-tools-http.ts';

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

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
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
    empty.dispose();

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(declarationRequests(fake).length, 0);
  } finally {
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
    httpFailure.dispose();

    const networkFailure = createClient({
      apiKey: 'test-api-key',
      bundledSnapshot: bundledSnapshot(),
      snapshotStore: noOpSnapshotStore,
      backgroundRefreshEnabled: false,
      heartbeatEnabled: false,
      baseUrl: 'http://127.0.0.1:9',
    });
    await networkFailure.initialize();
    await new Promise((resolve) => setTimeout(resolve, 100));
    networkFailure.dispose();
  } finally {
    Object.assign(console, originals);
    await fake.close();
  }
  assert.deepEqual(logged, []);
});
