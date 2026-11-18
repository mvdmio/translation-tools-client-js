import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  createClient,
  PlaceholderSubstitutionException,
  type StoredTranslations,
  type TranslationRef,
  type TranslationStringResource,
} from '@mvdmio/translation-tools-client';

const ORIGIN = '@demo/app:/translations/strings.json';

const EN_CART =
  '{count, plural, =0 {Your cart is empty} one {# item in {cartName}} other {# items in {cartName}}}';
const PL_CART =
  '{count, plural, =0 {Twój koszyk jest pusty} one {# produkt w {cartName}} few {# produkty w {cartName}} many {# produktów w {cartName}} other {# produktu w {cartName}}}';
const FRAGMENT = 'You have {count, plural, one {# item} other {# items}} left';

function ref(key: string): TranslationRef {
  return { origin: ORIGIN, key };
}

const cartItems: TranslationStringResource = { ref: ref('cart_items'), fallback: EN_CART };
const plCartFallback: TranslationStringResource = { ref: ref('cart_items'), fallback: PL_CART };

// Values that are not a whole-value Plural, so they render as plain text.
const NOT_PLURALS: Record<string, string> = {
  braces_arg: '{count, plural, one {{0} item} other {# items}}',
  nested: '{count, plural, one {# item} other {{n, plural, one {x y} other {z w}} items}}',
  no_other: '{count, plural, one {# item}}',
  fragment: FRAGMENT,
  leading_space: ' {count, plural, one {# item} other {# items}}',
  trailing_space: '{count, plural, one {# item} other {# items}} ',
  duplicate_category: '{count, plural, one {x y} one {z w} other {v u}}',
  duplicate_exact: '{count, plural, =1 {x y} =01 {z w} other {v u}}',
  negative_exact: '{count, plural, =-1 {x y} other {v u}}',
  offset: '{count, plural, offset:1 one {x y} other {v u}}',
  unclosed: '{count, plural, one {x y} other {v u}',
};

function bundledSnapshot(defaultLocale: string | null = 'en'): StoredTranslations {
  return {
    projectMetadata:
      defaultLocale == null
        ? null
        : { locales: ['en', 'pl', 'pt-br', 'ja', 'xx'], defaultLocale },
    snapshots: [
      {
        locale: 'en',
        items: [
          { ref: ref('cart_items'), value: EN_CART },
          { ref: ref('greeting'), value: 'Hello {userName}!' },
          { ref: ref('exact_wins'), value: '{count, plural, =1 {Exactly one} one {Category one} other {Many}}' },
          { ref: ref('compact'), value: '{count,plural,one{# item}other{# items}}' },
          { ref: ref('spaced'), value: '{ count , plural , one { # item } other { # items } }' },
          { ref: ref('quoted_pound'), value: "{count, plural, other {Use '#' for # items}}" },
          { ref: ref('count_inside'), value: '{count, plural, other {{count} items, # shown}}' },
          {
            ref: ref('global_form'),
            value: '{count, plural, one {# thing by {appName}} other {# things by {appName}}}',
          },
          ...Object.entries(NOT_PLURALS).map(([key, value]) => ({ ref: ref(key), value })),
        ],
      },
      {
        locale: 'pl',
        items: [
          { ref: ref('cart_items'), value: PL_CART },
          { ref: ref('no_few'), value: '{count, plural, one {# plik} other {# plików}}' },
        ],
      },
      {
        locale: 'pt-br',
        items: [{ ref: ref('items'), value: '{count, plural, one {# item} other {# itens}}' }],
      },
      {
        locale: 'ja',
        items: [
          { ref: ref('items'), value: '{count, plural, one {# eins} other {# 個}}' },
          { ref: ref('null_value'), value: null },
        ],
      },
      {
        locale: 'xx',
        items: [{ ref: ref('items'), value: '{count, plural, one {# item} other {# items}}' }],
      },
    ],
    lastSuccessfulRefreshAt: null,
  };
}

function createOfflineClient(
  overrides: Record<string, unknown> = {},
  snapshot: StoredTranslations = bundledSnapshot(),
) {
  return createClient({
    apiKey: 'test-api-key',
    bundledSnapshot: snapshot,
    backgroundRefreshEnabled: false,
    heartbeatEnabled: false,
    baseUrl: 'http://127.0.0.1:9',
    ...overrides,
  });
}

async function withWarnings<T>(
  action: () => Promise<T>,
): Promise<{ result: T; warnings: string[] }> {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args.map(String).join(' '));
  try {
    return { result: await action(), warnings };
  } finally {
    console.warn = original;
  }
}

test('get renders an English Plural by the number, with grouping for #', async () => {
  const client = createOfflineClient();
  await client.initialize();

  const lookup = (count: number) =>
    withWarnings(() => client.get(cartItems, 'en', { count, cartName: 'Cart' }));

  assert.deepEqual(await lookup(1), { result: '1 item in Cart', warnings: [] });
  assert.deepEqual(await lookup(5), { result: '5 items in Cart', warnings: [] });
  assert.deepEqual(await lookup(1000), { result: '1,000 items in Cart', warnings: [] });
  assert.equal((await lookup(-1)).result, '-1 item in Cart');
  client.dispose();
});

test('an exact =0 case beats the category and warns about nothing', async () => {
  const client = createOfflineClient();
  await client.initialize();

  const zero = await withWarnings(() =>
    client.get(cartItems, 'en', { count: 0, cartName: 'Cart' }),
  );
  assert.deepEqual(zero, { result: 'Your cart is empty', warnings: [] });

  const exact = ref('exact_wins');
  assert.equal(await client.get(exact, 'en', { count: 1 }), 'Exactly one');
  assert.equal(await client.get(exact, 'en', { count: 2 }), 'Many');
  client.dispose();
});

test('get picks the Polish form by CLDR rules for the lookup Locale', async () => {
  const client = createOfflineClient();
  await client.initialize();

  const lookup = (count: number) =>
    client.get(cartItems, 'pl', { count, cartName: 'Koszyk' });

  assert.equal(await lookup(1), '1 produkt w Koszyk');
  assert.equal(await lookup(22), '22 produkty w Koszyk');
  assert.equal(await lookup(25), '25 produktów w Koszyk');
  assert.equal(await lookup(12), '12 produktów w Koszyk');
  assert.equal(await lookup(0), 'Twój koszyk jest pusty');
  client.dispose();
});

test('withPlaceholders render picks the form from the number set with setPlaceholder', async () => {
  const client = createOfflineClient();
  await client.initialize();

  const rendered = await client
    .withPlaceholders(cartItems.ref, 'pl')
    .setPlaceholder('count', 22)
    .setPlaceholder('cartName', 'Koszyk')
    .render();
  assert.equal(rendered, '22 produkty w Koszyk');
  client.dispose();
});

test('a Locale without a form for the category uses the other form', async () => {
  const client = createOfflineClient();
  await client.initialize();

  assert.equal(await client.get(ref('no_few'), 'pl', { count: 22 }), '22 plików');
  assert.equal(await client.get(ref('no_few'), 'pl', { count: 1 }), '1 plik');
  client.dispose();
});

test('pt-br uses the pt rules and number format', async () => {
  const client = createOfflineClient();
  await client.initialize();

  // In Portuguese 0 is "one", which English would call "other".
  assert.equal(await client.get(ref('items'), 'pt-br', { count: 0 }), '0 item');
  assert.equal(await client.get(ref('items'), 'pt-br', { count: 2 }), '2 itens');
  assert.equal(await client.get(ref('items'), 'pt-br', { count: 1000 }), '1.000 itens');
  client.dispose();
});

test('a Locale with its own value uses its own rules: ja has only other', async () => {
  const client = createOfflineClient();
  await client.initialize();

  assert.equal(await client.get(ref('items'), 'ja', { count: 1 }), '1 個');
  client.dispose();
});

test('fallback text is picked by the project default Locale, not the lookup Locale', async () => {
  const client = createOfflineClient();
  await client.initialize();

  // ja has no cart_items value and the API is unreachable, so the English fallback is used.
  assert.equal(
    await client.get(cartItems, 'ja', { count: 1, cartName: 'Cart' }),
    '1 item in Cart',
  );
  assert.equal(
    await client.get(ref('cart_items'), 'ja', { count: 1, cartName: 'Cart' }, EN_CART),
    '1 item in Cart',
  );
  // A cached item without a value falls back to the caller's defaultValue the same way.
  assert.equal(
    await client.get(
      ref('null_value'),
      'ja',
      { count: 1 },
      '{count, plural, one {# item} other {# items}}',
    ),
    '1 item',
  );
  client.dispose();

  const polishProject = createOfflineClient({}, bundledSnapshot('pl'));
  await polishProject.initialize();
  assert.equal(
    await polishProject.get(plCartFallback, 'ja', { count: 22, cartName: 'Koszyk' }),
    '22 produkty w Koszyk',
  );
  polishProject.dispose();
});

test('fallback text is picked by English rules when the default Locale is not known', async () => {
  const client = createOfflineClient({}, bundledSnapshot(null));
  await client.initialize();

  assert.equal(
    await client.get(cartItems, 'ja', { count: 1, cartName: 'Cart' }),
    '1 item in Cart',
  );
  client.dispose();
});

test('an unknown Locale tag picks other and prints plain digits', async () => {
  const client = createOfflineClient();
  await client.initialize();

  assert.equal(await client.get(ref('items'), 'xx', { count: 1 }), '1 items');
  assert.equal(await client.get(ref('items'), 'xx', { count: 1000 }), '1000 items');
  client.dispose();
});

test('an unknown Locale tag does not take the host locale, even when the host is Polish', {
  skip:
    process.platform === 'win32'
      ? 'Node reads the default locale from LANG only on POSIX hosts.'
      : false,
}, async () => {
  const script = `
    import assert from 'node:assert/strict';
    import { createClient } from '@mvdmio/translation-tools-client';
    assert.ok(
      new Intl.NumberFormat().resolvedOptions().locale.startsWith('pl'),
      'the host locale is ' + new Intl.NumberFormat().resolvedOptions().locale,
    );
    const itemRef = { origin: '${ORIGIN}', key: 'items' };
    const client = createClient({
      apiKey: 'test-api-key',
      bundledSnapshot: {
        projectMetadata: null,
        snapshots: [{ locale: 'xx', items: [{
          ref: itemRef,
          value: '{count, plural, few {# few} other {# other}}',
        }] }],
        lastSuccessfulRefreshAt: null,
      },
      backgroundRefreshEnabled: false,
      heartbeatEnabled: false,
      baseUrl: 'http://127.0.0.1:9',
    });
    await client.initialize();
    console.log(JSON.stringify([
      await client.get(itemRef, 'xx', { count: 22 }),
      await client.get(itemRef, 'xx', { count: 1000 }),
    ]));
    client.dispose();
  `;

  const { code, stdout, stderr } = await new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, LANG: 'pl_PL.UTF-8', LC_ALL: 'pl_PL.UTF-8' },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ code: exitCode, stdout: out, stderr: err }));
  });

  assert.equal(code, 0, stderr);
  assert.deepEqual(JSON.parse(stdout), ['22 other', '1000 other']);
});

test("'#' inside a form prints a literal # when quoted and the number otherwise", async () => {
  const client = createOfflineClient();
  await client.initialize();

  assert.equal(await client.get(ref('quoted_pound'), 'en', { count: 3 }), 'Use # for 3 items');
  assert.equal(await client.get(ref('compact'), 'en', { count: 1 }), '1 item');
  assert.equal(await client.get(ref('spaced'), 'en', { count: 2 }), ' 2 items ');
  client.dispose();
});

test('values that are not a whole-value Plural render exactly as before', async () => {
  const client = createOfflineClient();
  await client.initialize();

  for (const [key, value] of Object.entries(NOT_PLURALS)) {
    const { result, warnings } = await withWarnings(() =>
      client.get(ref(key), 'en', { count: 3 }),
    );
    assert.equal(result, value, key);
    assert.deepEqual(warnings, ["Supplied placeholder 'count' is not present in the value."], key);
  }
  client.dispose();
});

test('a missing or non-whole number returns the raw value and warns naming the argument', async () => {
  const client = createOfflineClient();
  await client.initialize();

  const cases: Record<string, Record<string, string | number>> = {
    missing: { cartName: 'Cart' },
    fractional: { count: 1.5, cartName: 'Cart' },
    nan: { count: Number.NaN, cartName: 'Cart' },
    infinity: { count: Number.POSITIVE_INFINITY, cartName: 'Cart' },
    string: { count: '5', cartName: 'Cart' },
  };
  for (const [name, bindings] of Object.entries(cases)) {
    const { result, warnings } = await withWarnings(() => client.get(cartItems, 'en', bindings));
    assert.equal(result, EN_CART, name);
    assert.deepEqual(warnings, ["No whole number supplied for plural argument 'count'."], name);
  }

  const noBindings = await withWarnings(() => client.get(cartItems, 'en'));
  assert.deepEqual(noBindings, {
    result: EN_CART,
    warnings: ["No whole number supplied for plural argument 'count'."],
  });
  client.dispose();
});

test('throwOnPlaceholderError throws for a missing or non-whole number', async () => {
  const client = createOfflineClient({ throwOnPlaceholderError: true });
  await client.initialize();

  const cases: Record<string, Record<string, string | number>> = {
    missing: { cartName: 'Cart' },
    fractional: { count: 1.5, cartName: 'Cart' },
    nan: { count: Number.NaN, cartName: 'Cart' },
    string: { count: '5', cartName: 'Cart' },
  };
  for (const [name, bindings] of Object.entries(cases)) {
    await assert.rejects(
      client.get(cartItems, 'en', bindings),
      (error: unknown) =>
        error instanceof PlaceholderSubstitutionException &&
        error.message === "No whole number supplied for plural argument 'count'.",
      name,
    );
  }
  client.dispose();
});

test('a Placeholder the picked form needs degrades to raw {name} with a warning', async () => {
  const client = createOfflineClient();
  await client.initialize();

  assert.deepEqual(
    await withWarnings(() => client.get(cartItems, 'en', { count: 5 })),
    {
      result: '5 items in {cartName}',
      warnings: ["No value supplied for placeholder '{cartName}'."],
    },
  );
  // The zero form needs no cartName, and a bound cartName is still present in the value.
  assert.deepEqual(
    await withWarnings(() => client.get(cartItems, 'en', { count: 0, cartName: 'Cart' })),
    { result: 'Your cart is empty', warnings: [] },
  );
  // A name that is in no form is still reported.
  assert.deepEqual(
    await withWarnings(() => client.get(cartItems, 'en', { count: 0, other: 'x' })),
    {
      result: 'Your cart is empty',
      warnings: ["Supplied placeholder 'other' is not present in the value."],
    },
  );
  client.dispose();
});

test('a Global placeholder inside a picked form resolves but never supplies the number', async () => {
  const client = createOfflineClient({
    globalPlaceholders: { appName: () => 'Acme', count: () => '5' },
  });
  await client.initialize();

  assert.equal(await client.get(ref('global_form'), 'en', { count: 2 }), '2 things by Acme');

  assert.deepEqual(
    await withWarnings(() => client.get(cartItems, 'en', { cartName: 'Cart' })),
    {
      result: EN_CART,
      warnings: ["No whole number supplied for plural argument 'count'."],
    },
  );
  client.dispose();
});

test('a {count} token inside a form is an ordinary Placeholder', async () => {
  const client = createOfflineClient();
  await client.initialize();

  assert.deepEqual(
    await withWarnings(() => client.get(ref('count_inside'), 'en', { count: 1000 })),
    { result: '1000 items, 1,000 shown', warnings: [] },
  );
  client.dispose();
});

test('a number bound to an ordinary Placeholder prints as digits', async () => {
  const client = createOfflineClient();
  await client.initialize();

  assert.equal(await client.get(ref('greeting'), 'en', { userName: 5 }), 'Hello 5!');
  const rendered = await client
    .withPlaceholders(ref('greeting'), 'en')
    .setPlaceholder('userName', 0)
    .render();
  assert.equal(rendered, 'Hello 0!');
  client.dispose();
});

test('getCached still returns the raw Plural value', async () => {
  const client = createOfflineClient();
  await client.initialize();

  assert.equal(client.getCached(ref('cart_items'), 'en'), EN_CART);
  assert.equal(client.getCached(cartItems, 'pl'), PL_CART);
  client.dispose();
});
