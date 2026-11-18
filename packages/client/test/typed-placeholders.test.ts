import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createClient,
  type TranslationRef,
  type TranslationStringResource,
} from '@mvdmio/translation-tools-client';

const ORIGIN = '@demo/app:/translations/strings.json';

function ref(key: string): TranslationRef {
  return { origin: ORIGIN, key };
}

const client = createClient({
  apiKey: 'test-api-key',
  bundledSnapshot: {
    projectMetadata: { locales: ['en'], defaultLocale: 'en' },
    snapshots: [],
    lastSuccessfulRefreshAt: null,
  },
  backgroundRefreshEnabled: false,
  heartbeatEnabled: false,
  baseUrl: 'http://127.0.0.1:9',
});

// Placeholder names are written out by hand, not computed.
const greeting: TranslationStringResource<'userName'> = {
  ref: ref('greeting'),
  fallback: 'Hello {userName}!',
};
const footer: TranslationStringResource<'company', 'appName'> = {
  ref: ref('footer'),
  fallback: '{appName} by {company}',
};
const homeTitle: TranslationStringResource<never> = { ref: ref('home_title'), fallback: 'Home' };
const cartItems: TranslationStringResource<
  { count: number; cartName: string | null | undefined },
  never
> = {
  ref: ref('cart_items'),
  fallback: '{count, plural, one {# item in {cartName}} other {# items in {cartName}}}',
};
const bare: TranslationStringResource = { ref: ref('bare'), fallback: 'Hi {anything}' };

// Never called: the checks are the compiler's, under `npm run typecheck:tests`. Each
// `@ts-expect-error` fails the typecheck when the line below it starts to compile.
export async function typeChecks(): Promise<void> {
  // All required names present.
  await client.get(greeting, 'en', { userName: 'Ana' });
  await client.get(greeting, undefined, { userName: null });
  // A missing required name, an empty map, no map, a misspelled name, a leftover name.
  // @ts-expect-error userName is missing
  await client.get(greeting, 'en', {});
  // @ts-expect-error the map is required
  await client.get(greeting);
  // @ts-expect-error the map is required
  await client.get(greeting, 'en');
  // @ts-expect-error username is not a Placeholder of the Key
  await client.get(greeting, 'en', { username: 'Ana' });
  // @ts-expect-error appName is not a Placeholder of the Key
  await client.get(greeting, 'en', { userName: 'Ana', appName: 'Other' });
  // @ts-expect-error a number is not a string Placeholder value
  await client.get(greeting, 'en', { userName: 1 });

  // An optional name may be passed or left out; the required one may not.
  await client.get(footer, 'en', { company: 'Acme' });
  await client.get(footer, 'en', { company: 'Acme', appName: 'Other' });
  // @ts-expect-error company is missing
  await client.get(footer, 'en', { appName: 'Other' });
  // @ts-expect-error other is not a Placeholder of the Key
  await client.get(footer, 'en', { company: 'Acme', other: 'x' });

  // No Placeholders: the map is optional and takes no name.
  await client.get(homeTitle);
  await client.get(homeTitle, 'en');
  await client.get(homeTitle, 'en', {});
  // @ts-expect-error userName is not a Placeholder of the Key
  await client.get(homeTitle, 'en', { userName: 'Ana' });

  // A bare resource takes any map, or none.
  await client.get(bare);
  await client.get(bare, 'en');
  await client.get(bare, 'en', { anything: 'x', count: 2 });

  // A Plural's number is a number.
  await client.get(cartItems, 'en', { count: 2, cartName: 'Home' });
  // @ts-expect-error count must be a number
  await client.get(cartItems, 'en', { count: '2', cartName: 'Home' });
  // @ts-expect-error count is missing
  await client.get(cartItems, 'en', { cartName: 'Home' });
  // @ts-expect-error cartName is missing
  await client.get(cartItems, 'en', { count: 2 });

  // The other lookups keep the free-form map.
  await client.get(ref('greeting'), 'en', { anything: 'x' });
  await client.get(ORIGIN, 'greeting', 'en', { anything: 'x' });
  client.getCached(greeting);
  client.observe(greeting, () => {});
}

test('a typed resource renders with the placeholders its type asks for', async () => {
  assert.equal(await client.get(greeting, 'en', { userName: 'Ana' }), 'Hello Ana!');
  assert.equal(await client.get(footer, 'en', { appName: 'Acme', company: 'Co' }), 'Acme by Co');
  assert.equal(await client.get(homeTitle), 'Home');
  assert.equal(
    await client.get(cartItems, 'en', { count: 3, cartName: 'Home' }),
    '3 items in Home',
  );
});
