import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { linkClient } from '../../../test/support/client-link.ts';
import { startFakeTranslationToolsHttp } from '../../../test/support/fake-translation-tools-http.ts';
import { runCli } from '../../../test/support/run-cli.ts';

const repoRoot = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));

async function projectWith(
  packageName: string,
  files: Record<string, string>,
  options: { clientInstalled?: boolean } = {},
): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), 'translationtools-generate-'));
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

  if (options.clientInstalled ?? true) {
    await linkClient(cwd);
  }
  return cwd;
}

function starterYaml(): string {
  return `apiKey: your-project-api-key
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
`;
}

function collisionSuffix(origin: string, jsonKey: string): string {
  return createHash('sha256').update(`${origin}\0${jsonKey}`, 'utf8').digest('hex').slice(0, 8);
}

type TscResult = { exitCode: number | null; stdout: string; stderr: string };

async function typecheckGenerated(cwd: string, generatedRelativePath: string): Promise<TscResult> {
  const importPath =
    './' + generatedRelativePath.split(path.sep).join('/').replace(/\.ts$/, '.js');
  const shimPath = path.join(cwd, 'check-generated.ts');

  await writeFile(
    shimPath,
    `import { Translations, TranslationsBundledSnapshot } from '${importPath}';
import type { StoredTranslations, TranslationStringResource } from '@mvdmio/translation-tools-client';

const _t: typeof Translations = Translations;
const _s: StoredTranslations = TranslationsBundledSnapshot;
const _sample: TranslationStringResource | undefined = Object.values(_t)[0];
void _t;
void _s;
void _sample;
`,
    'utf8',
  );

  return await runTsc(cwd, ['check-generated.ts', generatedRelativePath.split(path.sep).join('/')]);
}

/** Compiles `include` (project-relative paths) in `cwd` with the repo's `tsc`. */
async function runTsc(cwd: string, include: string[]): Promise<TscResult> {
  const tsconfigPath = path.join(cwd, 'tsconfig.check.json');
  await writeFile(
    tsconfigPath,
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  return await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, 'node_modules/typescript/bin/tsc'), '-p', tsconfigPath],
      {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

test('generate writes typed keys and bundled snapshot without API key or HTTP', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
  });
  const fake = await startFakeTranslationToolsHttp();

  try {
    const result = await runCli(['generate'], {
      cwd,
      env: {
        ...process.env,
        TRANSLATIONTOOLS_API_KEY: '',
      },
      baseUrl: fake.baseUrl,
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(fake.requests.length, 0);

    const generated = await readFile(path.join(cwd, 'translations', 'generated.ts'), 'utf8');
    assert.match(generated, /export const Translations/);
    assert.match(generated, /home_title:/);
    assert.match(generated, /origin: "example-app:\/translations\/strings\.json"/);
    assert.match(generated, /key: "home_title"/);
    assert.match(generated, /fallback: "Home"/);
    assert.match(generated, /export const TranslationsBundledSnapshot/);
    assert.match(generated, /lastSuccessfulRefreshAt: null/);

    const check = await typecheckGenerated(cwd, 'translations/generated.ts');
    assert.equal(check.exitCode, 0, `${check.stdout}\n${check.stderr}`);
  } finally {
    await fake.close();
  }
});

test('generate keeps original keys on refs and suffixes colliding sanitized names', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': `${JSON.stringify(
      {
        'home.title': 'Home dot',
        'home-title': 'Home dash',
      },
      null,
      2,
    )}\n`,
  });

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.equal(result.exitCode, 0, result.stderr);

  const generated = await readFile(path.join(cwd, 'translations', 'generated.ts'), 'utf8');
  const origin = 'example-app:/translations/strings.json';
  const suffixDot = collisionSuffix(origin, 'home.title');
  const suffixDash = collisionSuffix(origin, 'home-title');

  assert.match(generated, new RegExp(`home_title__${suffixDot}:`));
  assert.match(generated, new RegExp(`home_title__${suffixDash}:`));
  assert.match(generated, /key: "home\.title"/);
  assert.match(generated, /key: "home-title"/);
  assert.notEqual(suffixDot, suffixDash);
});

test('generate rejects nested JSON and non-string values', async () => {
  const nested = await projectWith('example-app', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': `${JSON.stringify({ home: { title: 'Home' } }, null, 2)}\n`,
  });
  const nestedResult = await runCli(['generate'], {
    cwd: nested,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.notEqual(nestedResult.exitCode, 0);
  assert.match(nestedResult.stderr, /nested/i);

  const nonString = await projectWith('example-app', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': `${JSON.stringify({ home_title: 1 }, null, 2)}\n`,
  });
  const nonStringResult = await runCli(['generate'], {
    cwd: nonString,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.notEqual(nonStringResult.exitCode, 0);
  assert.match(nonStringResult.stderr, /string/i);
});

test('generate rejects keys outside the TranslationTools alphabet', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': `${JSON.stringify({ 'home title': 'Home' }, null, 2)}\n`,
  });

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /Invalid translation key/);
});

test('generate with empty JSON writes an empty Translations object', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': '{}\n',
  });

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.equal(result.exitCode, 0, result.stderr);

  const generated = await readFile(path.join(cwd, 'translations', 'generated.ts'), 'utf8');
  assert.match(generated, /export const Translations = \{\n\};/);
  assert.match(generated, /items: \[\n\s*\],/);
});

test('generate keeps a scoped package name in origin and lowercases the full origin', async () => {
  const cwd = await projectWith('@Org/App', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
  });

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.equal(result.exitCode, 0, result.stderr);

  const generated = await readFile(path.join(cwd, 'translations', 'generated.ts'), 'utf8');
  assert.match(generated, /origin: "@org\/app:\/translations\/strings\.json"/);
});

test('generate fails when package.json name contains a colon', async () => {
  const cwd = await projectWith('bad:name', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
  });

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /must not contain ':'/);
});

test('generate fails clearly when package.json name is missing', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'translationtools-generate-'));
  await writeFile(
    path.join(cwd, 'package.json'),
    `${JSON.stringify({ version: '0.0.0', private: true }, null, 2)}\n`,
    'utf8',
  );
  await writeFile(path.join(cwd, 'translationtools.yaml'), starterYaml(), 'utf8');
  await mkdir(path.join(cwd, 'translations'), { recursive: true });
  await writeFile(
    path.join(cwd, 'translations', 'strings.json'),
    `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
    'utf8',
  );

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /missing a non-empty "name"/);
});

test('locale-suffixed files share one origin; a second base name is a second origin', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': starterYaml(),
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
    'translations/strings.nl.json': `${JSON.stringify({ home_title: 'Thuis' }, null, 2)}\n`,
    'translations/errors.json': `${JSON.stringify({ not_found: 'Missing' }, null, 2)}\n`,
  });

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.equal(result.exitCode, 0, result.stderr);

  const generated = await readFile(path.join(cwd, 'translations', 'generated.ts'), 'utf8');
  assert.match(generated, /origin: "example-app:\/translations\/strings\.json"/);
  assert.match(generated, /origin: "example-app:\/translations\/errors\.json"/);
  assert.match(generated, /locale: "en"/);
  assert.match(generated, /locale: "nl"/);
  assert.match(generated, /value: "Thuis"/);
  assert.match(generated, /value: "Missing"/);

  const stringsOriginCount = [...generated.matchAll(/example-app:\/translations\/strings\.json/g)].length;
  assert.ok(stringsOriginCount >= 2);
});

test('keyOverrides change TranslationRef.key but keep the JSON key as the typed identifier source', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': `apiKey: your-project-api-key
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
  keyOverrides:
    home_title: home.title
`,
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
  });

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.equal(result.exitCode, 0, result.stderr);

  const generated = await readFile(path.join(cwd, 'translations', 'generated.ts'), 'utf8');
  assert.match(generated, /home_title:/);
  assert.match(generated, /key: "home\.title"/);
});

test('yaml snapshotFile is rejected because a file snapshot store is opt-in at runtime', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': `${starterYaml()}snapshotFile: snapshot.json\n`,
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
  });

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /snapshotFile is not supported/);
  assert.match(result.stderr, /opt-in/);
  assert.doesNotMatch(result.stderr, /snapshot\.json path/);
});

test('CLI README documents that renaming the npm package changes origins', async () => {
  const readme = await readFile(path.join(repoRoot, 'packages/cli/README.md'), 'utf8');
  assert.match(readme, /Renaming the npm package changes origins/i);
});

const PLACEHOLDER_STRINGS = {
  greeting: 'Hello {userName}!',
  footer: '{appName} by {company}',
  home_title: 'Home',
  escaped_brace: "Use '{'notAToken'}' here",
  zero_index: 'Item {0}',
  cart_items: '{count, plural, one {# item in {cartName}} other {# items in {cartName}}}',
};

const PLACEHOLDER_DUTCH_STRINGS = {
  greeting: 'Hallo {naam}!',
  only_nl: 'Alleen Nederlands {naam}',
};

const CONSUMER_PREFIX = `import type { TranslationToolsClient } from '@mvdmio/translation-tools-client';
import { Translations } from './translations/generated.js';

declare const client: TranslationToolsClient;

export async function use(): Promise<void> {
`;

function consumerWith(...calls: string[]): string {
  return `${CONSUMER_PREFIX}${calls.map((call) => `  await ${call};\n`).join('')}}\n`;
}

/** `globals` becomes `placeholders.globals`; undefined leaves the `placeholders` key out. */
async function placeholderProject(globals?: string[]): Promise<string> {
  const placeholdersYaml =
    globals === undefined
      ? ''
      : `placeholders:\n  globals:\n${globals.map((name) => `    - ${name}\n`).join('')}`;
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': `${starterYaml().replace('  - en\n', '  - en\n  - nl\n')}${placeholdersYaml}`,
    'translations/strings.json': `${JSON.stringify(PLACEHOLDER_STRINGS, null, 2)}\n`,
    'translations/strings.nl.json': `${JSON.stringify(PLACEHOLDER_DUTCH_STRINGS, null, 2)}\n`,
  });
  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.equal(result.exitCode, 0, result.stderr);
  return cwd;
}

// `unusedName` is in no value; `count` is a Plural's number, which stays required.
const FIXTURE_GLOBALS = ['appName', 'unusedName', 'count'];

test('generated Placeholders let the right calls compile', async () => {
  const cwd = await placeholderProject(FIXTURE_GLOBALS);
  await writeFile(
    path.join(cwd, 'consumer.ts'),
    consumerWith(
      "client.get(Translations.greeting, 'en', { userName: 'Ana' })",
      'client.get(Translations.home_title)',
      "client.get(Translations.greeting.ref, 'en', { anything: 'x' })",
      'client.get(Translations.escaped_brace)',
      'client.get(Translations.zero_index)',
      'client.get(Translations.only_nl)',
      "client.get(Translations.footer, 'en', { company: 'Acme' })",
      "client.get(Translations.footer, 'en', { company: 'Acme', appName: 'Other' })",
      "client.get(Translations.cart_items, 'en', { count: 2, cartName: 'Main' })",
    ),
    'utf8',
  );

  const check = await runTsc(cwd, ['consumer.ts']);
  assert.equal(check.exitCode, 0, `${check.stdout}\n${check.stderr}`);
});

test('generated Placeholders reject the wrong calls and name the property', async () => {
  const cwd = await placeholderProject(FIXTURE_GLOBALS);
  const failing: Record<string, { call: string; property: RegExp }> = {
    'fail-empty-map.ts': {
      call: "client.get(Translations.greeting, 'en', {})",
      property: /'userName'/,
    },
    'fail-no-map.ts': {
      call: "client.get(Translations.greeting, 'en')",
      property: /userName/,
    },
    'fail-misspelled.ts': {
      call: "client.get(Translations.greeting, 'en', { username: 'Ana' })",
      property: /'username'/,
    },
    'fail-no-placeholders.ts': {
      call: "client.get(Translations.home_title, 'en', { userName: 'Ana' })",
      property: /'userName'/,
    },
    'fail-footer-missing.ts': {
      call: "client.get(Translations.footer, 'en', { appName: 'Tool' })",
      property: /'company'/,
    },
    'fail-global-not-in-value.ts': {
      call: "client.get(Translations.greeting, 'en', { userName: 'Ana', appName: 'Other' })",
      property: /'appName'/,
    },
    'fail-listed-global-not-in-value.ts': {
      call: "client.get(Translations.home_title, 'en', { unusedName: 'x' })",
      property: /'unusedName'/,
    },
    'fail-plural-string-count.ts': {
      call: "client.get(Translations.cart_items, 'en', { count: '2', cartName: 'Main' })",
      // tsc does not name `count` in this message; it reports the type clash.
      property: /Type 'string' is not assignable to type 'number'/,
    },
    // `count` is listed in the fixture's globals; the Plural's number stays required.
    'fail-plural-missing-count.ts': {
      call: "client.get(Translations.cart_items, 'en', { cartName: 'Main' })",
      property: /'count'/,
    },
    'fail-other-locale-names.ts': {
      call: "client.get(Translations.greeting, 'nl', { naam: 'Ana' })",
      property: /'naam'/,
    },
  };

  for (const [fileName, { call }] of Object.entries(failing)) {
    await writeFile(path.join(cwd, fileName), consumerWith(call), 'utf8');
  }

  const check = await runTsc(cwd, Object.keys(failing));
  assert.notEqual(check.exitCode, 0);

  const diagnostics = check.stdout.split(/^(?=\S+\.ts\()/m);
  for (const [fileName, { property }] of Object.entries(failing)) {
    const own = diagnostics.filter((block) => block.startsWith(`${fileName}(`)).join('');
    assert.match(own, /error TS\d+/, `${fileName} should fail to compile:\n${check.stdout}`);
    assert.match(own, property, `${fileName} should name its property:\n${own}`);
  }
});

test('without placeholders.globals the footer call must pass appName', async () => {
  const cwd = await placeholderProject();
  await writeFile(
    path.join(cwd, 'consumer.ts'),
    consumerWith("client.get(Translations.footer, 'en', { appName: 'Tool', company: 'mvdmio' })"),
    'utf8',
  );
  await writeFile(
    path.join(cwd, 'fail-no-globals.ts'),
    consumerWith("client.get(Translations.footer, 'en', { company: 'Acme' })"),
    'utf8',
  );

  const passing = await runTsc(cwd, ['consumer.ts']);
  assert.equal(passing.exitCode, 0, `${passing.stdout}\n${passing.stderr}`);

  const failing = await runTsc(cwd, ['fail-no-globals.ts']);
  assert.notEqual(failing.exitCode, 0);
  assert.match(failing.stdout, /error TS\d+/);
  assert.match(failing.stdout, /'appName'/);
});

test('a non-string globals entry is read as its string form and fails the name check', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': `${starterYaml()}placeholders:\n  globals:\n    - 7\n`,
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
  });

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /Invalid Placeholder name '7'/);
});

test('generate rejects an invalid global name, names it, and leaves the last generated file as it was', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': `${starterYaml()}placeholders:\n  globals:\n    - appName\n`,
    'translations/strings.json': `${JSON.stringify(PLACEHOLDER_STRINGS, null, 2)}\n`,
  });
  const env = { ...process.env, TRANSLATIONTOOLS_API_KEY: '' };
  const generatedPath = path.join(cwd, 'translations', 'generated.ts');

  const first = await runCli(['generate'], { cwd, env });
  assert.equal(first.exitCode, 0, first.stderr);
  const before = await readFile(generatedPath);

  await writeFile(
    path.join(cwd, 'translationtools.yaml'),
    `${starterYaml()}placeholders:\n  globals:\n    - AppName\n`,
    'utf8',
  );
  const second = await runCli(['generate'], { cwd, env });
  assert.notEqual(second.exitCode, 0);
  assert.match(second.stderr, /Invalid Placeholder name 'AppName'/);
  assert.deepEqual(await readFile(generatedPath), before);
});

test('generate writes no file when the first run has an invalid global name', async () => {
  const cwd = await projectWith('example-app', {
    'translationtools.yaml': `${starterYaml()}placeholders:\n  globals:\n    - AppName\n`,
    'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
  });

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });
  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /Invalid Placeholder name 'AppName'/);
  assert.deepEqual(await readdir(path.join(cwd, 'translations')), ['strings.json']);
});

test('a placeholders value that is not a map, or globals that is not a list, fails when the config is read', async () => {
  const cases = [
    {
      yaml: 'placeholders:\n  - appName\n',
      message: /'placeholders' in .*translationtools\.yaml must be a YAML map, not array/,
    },
    {
      yaml: 'placeholders:\n  globals: appName\n',
      message: /'placeholders\.globals' in .*translationtools\.yaml must be a YAML list, not string/,
    },
  ];

  for (const { yaml, message } of cases) {
    const cwd = await projectWith('example-app', {
      'translationtools.yaml': `${starterYaml()}${yaml}`,
      'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
    });
    const result = await runCli(['generate'], {
      cwd,
      env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
    });
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, message);
  }
});

test('generate fails with an install message when the client is not in the project, and writes nothing', async () => {
  const cwd = await projectWith(
    'example-app',
    {
      'translationtools.yaml': starterYaml(),
      'translations/strings.json': `${JSON.stringify({ home_title: 'Home' }, null, 2)}\n`,
    },
    { clientInstalled: false },
  );

  const result = await runCli(['generate'], {
    cwd,
    env: { ...process.env, TRANSLATIONTOOLS_API_KEY: '' },
  });

  assert.notEqual(result.exitCode, 0);
  assert.match(
    result.stderr,
    /Cannot find @mvdmio\/translation-tools-client from .*Install it in the project: npm install @mvdmio\/translation-tools-client/,
  );
  assert.deepEqual(await readdir(path.join(cwd, 'translations')), ['strings.json']);
});
