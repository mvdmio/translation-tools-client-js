import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startFakeTranslationToolsHttp } from '../../../test/support/fake-translation-tools-http.ts';
import { runCli } from '../../../test/support/run-cli.ts';

async function projectWith(
  packageName: string,
  files: Record<string, string>,
): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), 'translationtools-push-'));
  await writeFile(
    path.join(cwd, 'package.json'),
    `${JSON.stringify({ name: packageName, version: '0.0.0', private: true }, null, 2)}\n`,
    'utf8',
  );

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolute = path.join(cwd, relativePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, contents, 'utf8');
  }

  return cwd;
}

function yaml(options?: {
  apiKey?: string;
  prune?: boolean;
  locales?: string[];
  keyOverrides?: string;
}): string {
  const apiKey = options?.apiKey ?? 'yaml-api-key';
  const prune = options?.prune ?? false;
  const locales = options?.locales ?? ['en'];
  const keyOverrides = options?.keyOverrides ?? '{}';
  return `apiKey: ${apiKey}
defaultLocale: en
locales:
${locales.map((locale) => `  - ${locale}`).join('\n')}
generated:
  enabled: true
  path: translations/generated.ts
jsonResources:
  resourceDirectories:
    - translations
  prune: ${prune}
  keyOverrides: ${keyOverrides}
`;
}

type PostedItem = {
  origin: string;
  locale: string;
  key: string;
  value: string | null;
};

function parsePostedItems(bodyText: string): PostedItem[] {
  const body = JSON.parse(bodyText) as { items?: PostedItem[] };
  assert.ok(Array.isArray(body.items));
  return body.items;
}

function findPost(fake: Awaited<ReturnType<typeof startFakeTranslationToolsHttp>>) {
  const post = fake.requests.find(
    (request) => request.method === 'POST' && request.path === '/api/v1/translations/project',
  );
  assert.ok(post, 'expected POST /api/v1/translations/project');
  return post;
}

function respondEmptyRemote(
  fake: Awaited<ReturnType<typeof startFakeTranslationToolsHttp>>,
  locales: string[] = ['en'],
): void {
  fake.respond('GET', '/api/v1/translations/project', {
    json: { locales, defaultLocale: locales[0] ?? 'en' },
  });
  for (const locale of locales) {
    fake.respond('GET', `/api/v1/translations/${locale}`, { json: [] });
  }
}

test('push POSTs this package origins, locales, keys, and values', async () => {
  const cwd = await projectWith('@Org/App', {
    'translationtools.yaml': yaml({ prune: true, locales: ['en', 'nl'] }),
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
    'translations/strings.nl.json': `${JSON.stringify({ home_title: 'Thuis' }, null, 2)}\n`,
  });
  const fake = await startFakeTranslationToolsHttp();

  try {
    respondEmptyRemote(fake, ['en', 'nl']);
    fake.respond('POST', '/api/v1/translations/project', {
      json: {
        receivedKeyCount: 2,
        createdKeyCount: 2,
        updatedKeyCount: 0,
        removedKeyCount: 0,
      },
    });

    const result = await runCli(['push'], {
      cwd,
      apiKey: 'env-api-key',
      baseUrl: fake.baseUrl,
    });
    assert.equal(result.exitCode, 0, result.stderr);

    const post = findPost(fake);
    assert.equal(post.headers.authorization, 'env-api-key');
    assert.notEqual(post.headers.authorization, 'Bearer env-api-key');

    const items = parsePostedItems(post.bodyText);
    assert.deepEqual(items, [
      {
        origin: '@org/app:/translations/strings.json',
        locale: 'en',
        key: 'home_title',
        value: 'Home',
      },
      {
        origin: '@org/app:/translations/strings.json',
        locale: 'nl',
        key: 'home_title',
        value: 'Thuis',
      },
    ]);
    assert.match(result.stdout, /Synced 2 translation values/);
  } finally {
    await fake.close();
  }
});

test('prune false keeps remote-only keys in the POST; prune true omits them', async () => {
  const fake = await startFakeTranslationToolsHttp();

  try {
    fake.respond('GET', '/api/v1/translations/project', {
      json: { locales: ['en'], defaultLocale: 'en' },
    });
    fake.respond('GET', '/api/v1/translations/en', {
      json: [
        {
          origin: 'example-app:/translations/strings.json',
          key: 'home_title',
          value: 'Home remote',
        },
        {
          origin: 'example-app:/translations/strings.json',
          key: 'remote_only',
          value: 'Keep me',
        },
      ],
    });
    fake.respond('POST', '/api/v1/translations/project', {
      json: {
        receivedKeyCount: 2,
        createdKeyCount: 0,
        updatedKeyCount: 1,
        removedKeyCount: 0,
      },
    });

    const withoutPrune = await projectWith('example-app', {
      'translationtools.yaml': yaml({ prune: false }),
      'translations/strings.json': `${JSON.stringify({ home_title: 'Home local' }, null, 2)}\n`,
    });
    const keepResult = await runCli(['push'], {
      cwd: withoutPrune,
      apiKey: 'key',
      baseUrl: fake.baseUrl,
    });
    assert.equal(keepResult.exitCode, 0, keepResult.stderr);
    const keepItems = parsePostedItems(findPost(fake).bodyText);
    assert.deepEqual(
      keepItems.map((item) => ({ key: item.key, value: item.value })).sort((a, b) =>
        a.key.localeCompare(b.key),
      ),
      [
        { key: 'home_title', value: 'Home local' },
        { key: 'remote_only', value: 'Keep me' },
      ],
    );

    fake.requests.length = 0;
    fake.respond('POST', '/api/v1/translations/project', {
      json: {
        receivedKeyCount: 1,
        createdKeyCount: 0,
        updatedKeyCount: 1,
        removedKeyCount: 1,
      },
    });

    const withPrune = await projectWith('example-app', {
      'translationtools.yaml': yaml({ prune: true }),
      'translations/strings.json': `${JSON.stringify({ home_title: 'Home local' }, null, 2)}\n`,
    });
    const dropResult = await runCli(['push'], {
      cwd: withPrune,
      apiKey: 'key',
      baseUrl: fake.baseUrl,
    });
    assert.equal(dropResult.exitCode, 0, dropResult.stderr);
    const dropItems = parsePostedItems(findPost(fake).bodyText);
    assert.deepEqual(dropItems, [
      {
        origin: 'example-app:/translations/strings.json',
        locale: 'en',
        key: 'home_title',
        value: 'Home local',
      },
    ]);
  } finally {
    await fake.close();
  }
});

test('prune on push keeps other-package origins and drops this package remote-only keys', async () => {
  const cwd = await projectWith('package-a', {
    'translationtools.yaml': yaml({ prune: true }),
    'translations/strings.json': `${JSON.stringify({ home_title: 'A local' }, null, 2)}\n`,
  });
  const fake = await startFakeTranslationToolsHttp();

  try {
    fake.respond('GET', '/api/v1/translations/project', {
      json: { locales: ['en'], defaultLocale: 'en' },
    });
    fake.respond('GET', '/api/v1/translations/en', {
      json: [
        {
          origin: 'package-a:/translations/strings.json',
          key: 'home_title',
          value: 'A remote',
        },
        {
          origin: 'package-a:/translations/strings.json',
          key: 'remote_only',
          value: 'Drop me',
        },
        {
          origin: 'package-b:/translations/strings.json',
          key: 'home_title',
          value: 'B remote',
        },
      ],
    });
    fake.respond('POST', '/api/v1/translations/project', {
      json: {
        receivedKeyCount: 2,
        createdKeyCount: 0,
        updatedKeyCount: 1,
        removedKeyCount: 1,
      },
    });

    const result = await runCli(['push'], {
      cwd,
      apiKey: 'key',
      baseUrl: fake.baseUrl,
    });
    assert.equal(result.exitCode, 0, result.stderr);

    const items = parsePostedItems(findPost(fake).bodyText);
    assert.deepEqual(
      items.map((item) => ({ origin: item.origin, key: item.key, value: item.value })),
      [
        {
          origin: 'package-a:/translations/strings.json',
          key: 'home_title',
          value: 'A local',
        },
        {
          origin: 'package-b:/translations/strings.json',
          key: 'home_title',
          value: 'B remote',
        },
      ],
    );
    assert.equal(
      items.some((item) => item.origin.startsWith('package-a:') && item.key === 'remote_only'),
      false,
    );
  } finally {
    await fake.close();
  }
});

test('key override sends the TranslationTools key, not the JSON key', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': yaml({
      prune: true,
      keyOverrides: `\n    homeTitle: home_title`,
    }),
    'translations/strings.json': `${JSON.stringify({ homeTitle: 'Home' }, null, 2)}\n`,
  });
  const fake = await startFakeTranslationToolsHttp();

  try {
    respondEmptyRemote(fake);
    fake.respond('POST', '/api/v1/translations/project', {
      json: {
        receivedKeyCount: 1,
        createdKeyCount: 1,
        updatedKeyCount: 0,
        removedKeyCount: 0,
      },
    });

    const result = await runCli(['push'], {
      cwd,
      apiKey: 'key',
      baseUrl: fake.baseUrl,
    });
    assert.equal(result.exitCode, 0, result.stderr);
    const items = parsePostedItems(findPost(fake).bodyText);
    assert.deepEqual(items, [
      {
        origin: 'example-app:/translations/strings.json',
        locale: 'en',
        key: 'home_title',
        value: 'Home',
      },
    ]);
  } finally {
    await fake.close();
  }
});

test('invalid keys and nested JSON fail without posting', async () => {
  const fake = await startFakeTranslationToolsHttp();

  try {
    fake.respond('POST', '/api/v1/translations/project', {
      json: {
        receivedKeyCount: 0,
        createdKeyCount: 0,
        updatedKeyCount: 0,
        removedKeyCount: 0,
      },
    });

    const invalidKey = await projectWith('example-app', {
      'translationtools.yaml': yaml({ prune: true }),
      'translations/strings.json': `${JSON.stringify({ 'bad key': 'Nope' }, null, 2)}\n`,
    });
    const invalidResult = await runCli(['push'], {
      cwd: invalidKey,
      apiKey: 'key',
      baseUrl: fake.baseUrl,
    });
    assert.notEqual(invalidResult.exitCode, 0);
    assert.match(invalidResult.stderr, /Invalid translation key/);
    assert.equal(fake.requests.length, 0);

    const nested = await projectWith('example-app', {
      'translationtools.yaml': yaml({ prune: true }),
      'translations/strings.json': `${JSON.stringify({ home: { title: 'Home' } }, null, 2)}\n`,
    });
    const nestedResult = await runCli(['push'], {
      cwd: nested,
      apiKey: 'key',
      baseUrl: fake.baseUrl,
    });
    assert.notEqual(nestedResult.exitCode, 0);
    assert.match(nestedResult.stderr, /nested values are not allowed/);
    assert.equal(fake.requests.length, 0);
  } finally {
    await fake.close();
  }
});

test('two packages with the same JSON key produce different origins in the POST body', async () => {
  const fake = await startFakeTranslationToolsHttp();

  try {
    respondEmptyRemote(fake);
    fake.respond('POST', '/api/v1/translations/project', {
      json: {
        receivedKeyCount: 1,
        createdKeyCount: 1,
        updatedKeyCount: 0,
        removedKeyCount: 0,
      },
    });

    const first = await projectWith('package-a', {
      'translationtools.yaml': yaml({ prune: true }),
      'translations/strings.json': `${JSON.stringify({ home_title: 'A' }, null, 2)}\n`,
    });
    const firstResult = await runCli(['push'], {
      cwd: first,
      apiKey: 'key',
      baseUrl: fake.baseUrl,
    });
    assert.equal(firstResult.exitCode, 0, firstResult.stderr);
    const firstItems = parsePostedItems(findPost(fake).bodyText);
    assert.equal(firstItems[0]?.origin, 'package-a:/translations/strings.json');
    assert.equal(firstItems[0]?.key, 'home_title');

    fake.requests.length = 0;
    const second = await projectWith('package-b', {
      'translationtools.yaml': yaml({ prune: true }),
      'translations/strings.json': `${JSON.stringify({ home_title: 'B' }, null, 2)}\n`,
    });
    const secondResult = await runCli(['push'], {
      cwd: second,
      apiKey: 'key',
      baseUrl: fake.baseUrl,
    });
    assert.equal(secondResult.exitCode, 0, secondResult.stderr);
    const secondItems = parsePostedItems(findPost(fake).bodyText);
    assert.equal(secondItems[0]?.origin, 'package-b:/translations/strings.json');
    assert.equal(secondItems[0]?.key, 'home_title');
    assert.notEqual(firstItems[0]?.origin, secondItems[0]?.origin);
  } finally {
    await fake.close();
  }
});

test('TRANSLATIONTOOLS_API_KEY wins over yaml apiKey; yaml is used when env is unset', async () => {
  const fake = await startFakeTranslationToolsHttp();

  try {
    respondEmptyRemote(fake);
    fake.respond('POST', '/api/v1/translations/project', {
      json: {
        receivedKeyCount: 1,
        createdKeyCount: 1,
        updatedKeyCount: 0,
        removedKeyCount: 0,
      },
    });

    const cwdEnv = await projectWith('example-app', {
      'translationtools.yaml': yaml({ apiKey: 'yaml-api-key', prune: true }),
      'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
    });
    const envResult = await runCli(['push'], {
      cwd: cwdEnv,
      apiKey: 'env-wins',
      baseUrl: fake.baseUrl,
    });
    assert.equal(envResult.exitCode, 0, envResult.stderr);
    assert.equal(findPost(fake).headers.authorization, 'env-wins');

    fake.requests.length = 0;
    const cwdYaml = await projectWith('example-app', {
      'translationtools.yaml': yaml({ apiKey: 'yaml-only-key', prune: true }),
      'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
    });
    const yamlResult = await runCli(['push'], {
      cwd: cwdYaml,
      baseUrl: fake.baseUrl,
      env: {
        ...process.env,
        TRANSLATIONTOOLS_API_KEY: '',
      },
    });
    assert.equal(yamlResult.exitCode, 0, yamlResult.stderr);
    assert.equal(findPost(fake).headers.authorization, 'yaml-only-key');
  } finally {
    await fake.close();
  }
});

test('empty JSON resource files push no items for that file', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': yaml({ prune: true }),
    'translations/strings.json': '{}\n',
    'translations/errors.json': `${JSON.stringify({ not_found: 'Missing' }, null, 2)}\n`,
  });
  const fake = await startFakeTranslationToolsHttp();

  try {
    respondEmptyRemote(fake);
    fake.respond('POST', '/api/v1/translations/project', {
      json: {
        receivedKeyCount: 1,
        createdKeyCount: 1,
        updatedKeyCount: 0,
        removedKeyCount: 0,
      },
    });

    const result = await runCli(['push'], {
      cwd,
      apiKey: 'key',
      baseUrl: fake.baseUrl,
    });
    assert.equal(result.exitCode, 0, result.stderr);
    const items = parsePostedItems(findPost(fake).bodyText);
    assert.deepEqual(items, [
      {
        origin: 'example-app:/translations/errors.json',
        locale: 'en',
        key: 'not_found',
        value: 'Missing',
      },
    ]);
  } finally {
    await fake.close();
  }
});

test('push fails clearly when API key is missing', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': yaml({ apiKey: '', prune: true }).replace(/^apiKey:.*$/m, 'apiKey:'),
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
  });
  const fake = await startFakeTranslationToolsHttp();

  try {
    const result = await runCli(['push'], {
      cwd,
      baseUrl: fake.baseUrl,
      env: {
        ...process.env,
        TRANSLATIONTOOLS_API_KEY: '',
      },
    });
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /Missing TranslationTools API key/);
    assert.equal(fake.requests.length, 0);
  } finally {
    await fake.close();
  }
});
