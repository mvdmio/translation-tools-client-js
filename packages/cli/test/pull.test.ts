import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DEFAULT_BASE_URL, resolveCliBaseUrl } from '../src/http.ts';
import { startFakeTranslationToolsHttp } from '../../../test/support/fake-translation-tools-http.ts';
import { runCli } from '../../../test/support/run-cli.ts';

async function projectWith(
  packageName: string,
  files: Record<string, string>,
): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), 'translationtools-pull-'));
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
  enabled?: boolean;
  prune?: boolean;
  locales?: string[];
  keyOverrides?: string;
}): string {
  const apiKey = options?.apiKey ?? 'yaml-api-key';
  const enabled = options?.enabled ?? true;
  const prune = options?.prune ?? false;
  const locales = options?.locales ?? ['en'];
  const keyOverrides = options?.keyOverrides ?? '{}';
  return `apiKey: ${apiKey}
defaultLocale: en
locales:
${locales.map((locale) => `  - ${locale}`).join('\n')}
generated:
  enabled: ${enabled}
  path: translations/generated.ts
jsonResources:
  resourceDirectories:
    - translations
  prune: ${prune}
  keyOverrides: ${keyOverrides}
`;
}

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

test('pull writes this package origins only and creates missing JSON resource files', async () => {
  const cwd = await projectWith('@Org/App', {
    'translationtools.yaml': yaml({ locales: ['en'] }),
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
  });
  const fake = await startFakeTranslationToolsHttp();

  try {
    fake.respond('GET', '/api/v1/translations/project', {
      json: { locales: ['en', 'NL'], defaultLocale: 'en' },
    });
    fake.respond('GET', '/api/v1/translations/en', {
      json: [
        {
          origin: '@org/app:/translations/strings.json',
          key: 'home_title',
          value: 'Home remote',
        },
        {
          origin: 'other-app:/translations/strings.json',
          key: 'home_title',
          value: 'Other home',
        },
      ],
    });
    fake.respond('GET', '/api/v1/translations/nl', {
      json: [
        {
          origin: '@org/app:/translations/strings.json',
          key: 'home_title',
          value: 'Thuis',
        },
        {
          origin: 'other-app:/translations/strings.json',
          key: 'home_title',
          value: 'Andere thuis',
        },
      ],
    });

    const result = await runCli(['pull'], {
      cwd,
      apiKey: 'env-api-key',
      baseUrl: fake.baseUrl,
    });

    assert.equal(result.exitCode, 0, result.stderr);

    const en = JSON.parse(await readFile(path.join(cwd, 'translations/strings.json'), 'utf8'));
    assert.deepEqual(en, { home_title: 'Home remote' });

    const nlPath = path.join(cwd, 'translations/strings.nl.json');
    assert.equal(await fileExists(nlPath), true);
    const nl = JSON.parse(await readFile(nlPath, 'utf8'));
    assert.deepEqual(nl, { home_title: 'Thuis' });

    assert.equal(await fileExists(path.join(cwd, 'translations/generated.ts')), true);

    for (const request of fake.requests) {
      assert.equal(request.headers.authorization, 'env-api-key');
      assert.notEqual(request.headers.authorization, 'Bearer env-api-key');
    }
    assert.ok(fake.requests.some((request) => request.path === '/api/v1/translations/project'));
    assert.ok(fake.requests.some((request) => request.path === '/api/v1/translations/en'));
    assert.ok(fake.requests.some((request) => request.path === '/api/v1/translations/nl'));
  } finally {
    await fake.close();
  }
});

test('pull keeps local-only keys when prune is false and drops them when prune is true', async () => {
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
      ],
    });

    const withoutPrune = await projectWith('example-app', {
      'translationtools.yaml': yaml({ prune: false }),
      'translations/strings.json': `${JSON.stringify(
        { home_title: 'Home', local_only: 'Keep me' },
        null,
        2,
      )}\n`,
    });
    const keepResult = await runCli(['pull'], {
      cwd: withoutPrune,
      apiKey: 'key',
      baseUrl: fake.baseUrl,
    });
    assert.equal(keepResult.exitCode, 0, keepResult.stderr);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(withoutPrune, 'translations/strings.json'), 'utf8')),
      { home_title: 'Home remote', local_only: 'Keep me' },
    );

    const withPrune = await projectWith('example-app', {
      'translationtools.yaml': yaml({ prune: true }),
      'translations/strings.json': `${JSON.stringify(
        { home_title: 'Home', local_only: 'Drop me' },
        null,
        2,
      )}\n`,
    });
    const dropResult = await runCli(['pull'], {
      cwd: withPrune,
      apiKey: 'key',
      baseUrl: fake.baseUrl,
    });
    assert.equal(dropResult.exitCode, 0, dropResult.stderr);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(withPrune, 'translations/strings.json'), 'utf8')),
      { home_title: 'Home remote' },
    );
  } finally {
    await fake.close();
  }
});

test('prune on pull empties a JSON resource file whose origin is gone from TranslationTools', async () => {
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
      ],
    });

    const withoutPrune = await projectWith('example-app', {
      'translationtools.yaml': yaml({ prune: false }),
      'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
      'translations/errors.json': `${JSON.stringify({ not_found: 'Keep me' }, null, 2)}\n`,
    });
    const keepResult = await runCli(['pull'], {
      cwd: withoutPrune,
      apiKey: 'key',
      baseUrl: fake.baseUrl,
    });
    assert.equal(keepResult.exitCode, 0, keepResult.stderr);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(withoutPrune, 'translations/errors.json'), 'utf8')),
      { not_found: 'Keep me' },
    );

    const withPrune = await projectWith('example-app', {
      'translationtools.yaml': yaml({ prune: true }),
      'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
      'translations/errors.json': `${JSON.stringify({ not_found: 'Drop me' }, null, 2)}\n`,
    });
    const dropResult = await runCli(['pull'], {
      cwd: withPrune,
      apiKey: 'key',
      baseUrl: fake.baseUrl,
    });
    assert.equal(dropResult.exitCode, 0, dropResult.stderr);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(withPrune, 'translations/strings.json'), 'utf8')),
      { home_title: 'Home remote' },
    );
    assert.deepEqual(
      JSON.parse(await readFile(path.join(withPrune, 'translations/errors.json'), 'utf8')),
      {},
    );
  } finally {
    await fake.close();
  }
});

test('TRANSLATIONTOOLS_API_KEY wins over yaml apiKey; yaml is used when env is unset', async () => {
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
          value: 'Home',
        },
      ],
    });

    const cwdEnv = await projectWith('example-app', {
      'translationtools.yaml': yaml({ apiKey: 'yaml-api-key' }),
      'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
    });
    const envResult = await runCli(['pull'], {
      cwd: cwdEnv,
      apiKey: 'env-wins',
      baseUrl: fake.baseUrl,
    });
    assert.equal(envResult.exitCode, 0, envResult.stderr);
    assert.equal(fake.requests[0]?.headers.authorization, 'env-wins');

    fake.requests.length = 0;
    const cwdYaml = await projectWith('example-app', {
      'translationtools.yaml': yaml({ apiKey: 'yaml-only-key' }),
      'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
    });
    const yamlResult = await runCli(['pull'], {
      cwd: cwdYaml,
      baseUrl: fake.baseUrl,
      env: {
        ...process.env,
        TRANSLATIONTOOLS_API_KEY: '',
      },
    });
    assert.equal(yamlResult.exitCode, 0, yamlResult.stderr);
    assert.equal(fake.requests[0]?.headers.authorization, 'yaml-only-key');
  } finally {
    await fake.close();
  }
});

test('pull skips generate when generated.enabled is false; generate still works', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': yaml({ enabled: false }),
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
  });
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
      ],
    });

    const pullResult = await runCli(['pull'], {
      cwd,
      apiKey: 'key',
      baseUrl: fake.baseUrl,
    });
    assert.equal(pullResult.exitCode, 0, pullResult.stderr);
    assert.equal(await fileExists(path.join(cwd, 'translations/generated.ts')), false);
    assert.doesNotMatch(pullResult.stdout, /Generated /);

    const generateResult = await runCli(['generate'], { cwd });
    assert.equal(generateResult.exitCode, 0, generateResult.stderr);
    assert.equal(await fileExists(path.join(cwd, 'translations/generated.ts')), true);
  } finally {
    await fake.close();
  }
});

test('pull maps TranslationTools keys back to JSON keys via keyOverrides', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': yaml({
      keyOverrides: `\n    homeTitle: home_title`,
    }),
    'translations/strings.json': `${JSON.stringify({ homeTitle: 'Home' }, null, 2)}\n`,
  });
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
      ],
    });

    const result = await runCli(['pull'], {
      cwd,
      apiKey: 'key',
      baseUrl: fake.baseUrl,
    });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(cwd, 'translations/strings.json'), 'utf8')),
      { homeTitle: 'Home remote' },
    );
  } finally {
    await fake.close();
  }
});

test('pull fails clearly when API key is missing', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': yaml({ apiKey: '' }).replace(/^apiKey:.*$/m, 'apiKey:'),
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
  });
  const fake = await startFakeTranslationToolsHttp();

  try {
    const result = await runCli(['pull'], {
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

test('resolveCliBaseUrl defaults to translations.mvdm.io and honors TRANSLATIONTOOLS_BASE_URL', () => {
  assert.equal(DEFAULT_BASE_URL, 'https://translations.mvdm.io');
  assert.equal(resolveCliBaseUrl({}), DEFAULT_BASE_URL);
  assert.equal(
    resolveCliBaseUrl({ TRANSLATIONTOOLS_BASE_URL: 'http://127.0.0.1:9/' }),
    'http://127.0.0.1:9',
  );
});

test('pulled JSON is pretty-printed with sorted keys', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': yaml(),
    'translations/strings.json': '{}\n',
  });
  const fake = await startFakeTranslationToolsHttp();

  try {
    fake.respond('GET', '/api/v1/translations/project', {
      json: { locales: ['en'], defaultLocale: 'en' },
    });
    fake.respond('GET', '/api/v1/translations/en', {
      json: [
        {
          origin: 'example-app:/translations/strings.json',
          key: 'zeta',
          value: 'Z',
        },
        {
          origin: 'example-app:/translations/strings.json',
          key: 'alpha',
          value: 'A',
        },
      ],
    });

    const result = await runCli(['pull'], {
      cwd,
      apiKey: 'key',
      baseUrl: fake.baseUrl,
    });
    assert.equal(result.exitCode, 0, result.stderr);
    const text = await readFile(path.join(cwd, 'translations/strings.json'), 'utf8');
    assert.equal(
      text,
      `{
  "alpha": "A",
  "zeta": "Z"
}
`,
    );
  } finally {
    await fake.close();
  }
});
