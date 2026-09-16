import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  TranslationSnapshotStores,
  createClient,
  noOpSnapshotStore,
  type StoredTranslations,
  type TranslationRef,
} from '@mvdmio/translation-tools-client';
import { startFakeTranslationToolsHttp } from '../../../test/support/fake-translation-tools-http.ts';

const ORIGIN = '@org/app:/translations/strings.json';
const ENCODED_ORIGIN = '@org%2Fapp:%2Ftranslations%2Fstrings.json';
const homeTitleRef: TranslationRef = { origin: ORIGIN, key: 'home_title' };
const missingRef: TranslationRef = { origin: ORIGIN, key: 'fresh_key' };

function bundledSnapshot(homeValue = 'Bundled Home'): StoredTranslations {
  return {
    projectMetadata: { locales: ['en'], defaultLocale: 'en' },
    snapshots: [
      {
        locale: 'en',
        items: [{ ref: homeTitleRef, value: homeValue }],
      },
    ],
    lastSuccessfulRefreshAt: '2026-03-25T10:00:00.000Z',
  };
}

function respondProjectAndLocale(
  fake: Awaited<ReturnType<typeof startFakeTranslationToolsHttp>>,
  homeValue: string,
  environment?: string,
): void {
  fake.respond('GET', '/api/v1/translations/project', {
    json: { locales: ['en'], defaultLocale: 'en' },
  });
  const localePath = environment
    ? `/api/v1/translations/en/${environment}`
    : '/api/v1/translations/en';
  fake.respond('GET', localePath, {
    json: [{ origin: ORIGIN, key: 'home_title', value: homeValue }],
  });
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 2000,
): Promise<void> {
  const started = Date.now();
  while (!(await predicate())) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('initialize with no snapshot does a blocking refresh; bundled + background serves immediately', async () => {
  const fake = await startFakeTranslationToolsHttp();
  try {
    respondProjectAndLocale(fake, 'Remote Home');
    const blocking = createClient({
      apiKey: 'test-api-key',
      backgroundRefreshEnabled: false,
      heartbeatEnabled: false,
      baseUrl: fake.baseUrl,
    });
    await blocking.initialize();
    assert.equal(blocking.getCached(homeTitleRef, 'en'), 'Remote Home');
    assert.ok(
      fake.requests.some((request) => request.path === '/api/v1/translations/project'),
    );
    blocking.dispose();

    const delayed = await startFakeTranslationToolsHttp();
    try {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      delayed.respond('GET', '/api/v1/translations/project', async () => {
        await gate;
        return { json: { locales: ['en'], defaultLocale: 'en' } };
      });
      delayed.respond('GET', '/api/v1/translations/en', {
        json: [{ origin: ORIGIN, key: 'home_title', value: 'Background Home' }],
      });

      const withBundled = createClient({
        apiKey: 'test-api-key',
        bundledSnapshot: bundledSnapshot(),
        backgroundRefreshEnabled: true,
        heartbeatEnabled: false,
        baseUrl: delayed.baseUrl,
      });
      await withBundled.initialize();
      assert.equal(withBundled.getCached(homeTitleRef, 'en'), 'Bundled Home');
      release();
      await waitFor(() => withBundled.getCached(homeTitleRef, 'en') === 'Background Home');
      withBundled.dispose();
    } finally {
      await delayed.close();
    }
  } finally {
    await fake.close();
  }
});

test('get on cache miss GETs encoded origin path and then getCached hits', async () => {
  const fake = await startFakeTranslationToolsHttp();
  try {
    respondProjectAndLocale(fake, 'Home');
    fake.respond(
      'GET',
      `/api/v1/translations/${ENCODED_ORIGIN}/en/fresh_key`,
      {
        json: { origin: ORIGIN, key: 'fresh_key', value: 'Fetched' },
      },
    );

    const client = createClient({
      apiKey: 'test-api-key',
      bundledSnapshot: bundledSnapshot(),
      backgroundRefreshEnabled: false,
      heartbeatEnabled: false,
      baseUrl: fake.baseUrl,
    });
    await client.initialize();

    assert.equal(client.getCached(missingRef, 'en'), null);
    assert.equal(await client.get(missingRef, 'en'), 'Fetched');
    assert.equal(client.getCached(missingRef, 'en'), 'Fetched');

    const singleKey = fake.requests.find((request) =>
      request.path.includes('/fresh_key'),
    );
    assert.ok(singleKey);
    assert.equal(
      singleKey.path,
      `/api/v1/translations/${ENCODED_ORIGIN}/en/fresh_key`,
    );
    client.dispose();
  } finally {
    await fake.close();
  }
});

test('requests send raw Authorization and environment on locale, single-key, and heartbeat', async () => {
  const fake = await startFakeTranslationToolsHttp();
  try {
    respondProjectAndLocale(fake, 'Staging Home', 'staging');
    fake.respond(
      'GET',
      `/api/v1/translations/${ENCODED_ORIGIN}/en/fresh_key/staging`,
      {
        json: { origin: ORIGIN, key: 'fresh_key', value: 'Staging Fresh' },
      },
    );
    fake.respond('POST', '/api/v1/translations/heartbeat', { status: 204 });

    const client = createClient({
      apiKey: 'raw-project-key',
      environment: '  staging  ',
      bundledSnapshot: bundledSnapshot(),
      backgroundRefreshEnabled: false,
      heartbeatEnabled: true,
      baseUrl: fake.baseUrl,
    });
    await client.initialize();
    await client.refresh();
    assert.equal(await client.get(missingRef, 'en'), 'Staging Fresh');

    await waitFor(() =>
      fake.requests.some((request) => request.path === '/api/v1/translations/heartbeat'),
    );

    for (const request of fake.requests) {
      assert.equal(request.headers.authorization, 'raw-project-key');
      assert.notEqual(request.headers.authorization?.toLowerCase().startsWith('bearer '), true);
    }

    assert.ok(
      fake.requests.some((request) => request.path === '/api/v1/translations/en/staging'),
    );
    assert.ok(
      fake.requests.some(
        (request) =>
          request.path ===
          `/api/v1/translations/${ENCODED_ORIGIN}/en/fresh_key/staging`,
      ),
    );

    const heartbeat = fake.requests.find(
      (request) => request.path === '/api/v1/translations/heartbeat',
    );
    assert.ok(heartbeat);
    const body = JSON.parse(heartbeat.bodyText) as {
      clientId: string;
      environment: string;
      platform: string;
      version: string;
    };
    assert.equal(body.environment, 'staging');
    assert.equal(body.platform, 'node');
    assert.ok(body.clientId);
    assert.equal(body.version, '0.0.0');
    client.dispose();
  } finally {
    await fake.close();
  }
});

test('file snapshot store restores refresh and client id; default store writes nothing', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tt-snapshot-'));
  const snapshotPath = path.join(tempRoot, 'cache', 'translations.json');
  const fake = await startFakeTranslationToolsHttp();
  try {
    respondProjectAndLocale(fake, 'Persisted Home');
    fake.respond('POST', '/api/v1/translations/heartbeat', { status: 204 });

    const fileStore = TranslationSnapshotStores.file(snapshotPath);
    const first = createClient({
      apiKey: 'test-api-key',
      snapshotStore: fileStore,
      backgroundRefreshEnabled: false,
      heartbeatEnabled: true,
      baseUrl: fake.baseUrl,
    });
    await first.initialize();
    await waitFor(() =>
      fake.requests.some((request) => request.path === '/api/v1/translations/heartbeat'),
    );
    const firstHeartbeat = JSON.parse(
      fake.requests.find((request) => request.path === '/api/v1/translations/heartbeat')!
        .bodyText,
    ) as { clientId: string };
    first.dispose();

    const saved = JSON.parse(await readFile(snapshotPath, 'utf8')) as StoredTranslations;
    assert.equal(saved.clientId, firstHeartbeat.clientId);
    assert.equal(saved.snapshots[0]?.items[0]?.value, 'Persisted Home');

    const offlineFake = await startFakeTranslationToolsHttp();
    try {
      // No routes: network appears down. Restore must come from the file store.
      const second = createClient({
        apiKey: 'test-api-key',
        snapshotStore: TranslationSnapshotStores.file(snapshotPath),
        backgroundRefreshEnabled: false,
        heartbeatEnabled: true,
        baseUrl: offlineFake.baseUrl,
      });
      await second.initialize();
      assert.equal(second.getCached(homeTitleRef, 'en'), 'Persisted Home');
      await waitFor(() =>
        offlineFake.requests.some(
          (request) => request.path === '/api/v1/translations/heartbeat',
        ),
      );
      const secondHeartbeat = JSON.parse(
        offlineFake.requests.find(
          (request) => request.path === '/api/v1/translations/heartbeat',
        )!.bodyText,
      ) as { clientId: string; platform: string };
      assert.equal(secondHeartbeat.clientId, firstHeartbeat.clientId);
      assert.equal(secondHeartbeat.platform, 'node');
      second.dispose();
    } finally {
      await offlineFake.close();
    }

    const emptyDir = await mkdtemp(path.join(os.tmpdir(), 'tt-noop-'));
    try {
      const noopClient = createClient({
        apiKey: 'test-api-key',
        snapshotStore: noOpSnapshotStore,
        bundledSnapshot: bundledSnapshot(),
        backgroundRefreshEnabled: false,
        heartbeatEnabled: false,
        baseUrl: fake.baseUrl,
      });
      await noopClient.initialize();
      await noopClient.refresh();
      noopClient.dispose();
      assert.deepEqual(await readdir(emptyDir), []);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  } finally {
    await fake.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('bundled fallback still serves when network is down and nothing is persisted', async () => {
  const client = createClient({
    apiKey: 'test-api-key',
    bundledSnapshot: bundledSnapshot('Offline Home'),
    backgroundRefreshEnabled: true,
    heartbeatEnabled: false,
    baseUrl: 'http://127.0.0.1:9',
  });
  await client.initialize();
  assert.equal(client.getCached(homeTitleRef, 'en'), 'Offline Home');
  assert.equal(await client.get(homeTitleRef, 'en'), 'Offline Home');
  client.dispose();
});

test('observe emits the new value after a refresh changes it', async () => {
  const fake = await startFakeTranslationToolsHttp();
  try {
    respondProjectAndLocale(fake, 'Home');
    const client = createClient({
      apiKey: 'test-api-key',
      bundledSnapshot: bundledSnapshot('Home'),
      backgroundRefreshEnabled: false,
      heartbeatEnabled: false,
      baseUrl: fake.baseUrl,
    });
    await client.initialize();

    const values: Array<string | null> = [];
    const stop = client.observe(homeTitleRef, 'en', (value) => {
      values.push(value);
    });
    assert.deepEqual(values, ['Home']);

    respondProjectAndLocale(fake, 'Home refreshed');
    await client.refresh();
    assert.deepEqual(values, ['Home', 'Home refreshed']);
    stop();
    client.dispose();
  } finally {
    await fake.close();
  }
});

test('refreshIfStale skips inside the one-hour window and refreshes after it', async () => {
  const fake = await startFakeTranslationToolsHttp();
  try {
    respondProjectAndLocale(fake, 'Hello');
    let now = new Date('2026-03-25T10:00:00.000Z');
    const client = createClient({
      apiKey: 'test-api-key',
      backgroundRefreshEnabled: false,
      heartbeatEnabled: false,
      baseUrl: fake.baseUrl,
      now: () => now,
    });

    await client.initialize();
    const projectCallsAfterInit = fake.requests.filter(
      (request) => request.path === '/api/v1/translations/project',
    ).length;

    now = new Date('2026-03-25T10:30:00.000Z');
    await client.refreshIfStale();
    assert.equal(
      fake.requests.filter((request) => request.path === '/api/v1/translations/project')
        .length,
      projectCallsAfterInit,
    );

    now = new Date('2026-03-25T11:00:00.000Z');
    await client.refreshIfStale();
    assert.equal(
      fake.requests.filter((request) => request.path === '/api/v1/translations/project')
        .length,
      projectCallsAfterInit + 1,
    );
    client.dispose();
  } finally {
    await fake.close();
  }
});
