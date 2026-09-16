# 08 — Green the whole suite

Status: done
Blocked by: 01, 02, 03, 04, 05, 06, 07

## What to build

The whole workspace is green against the public CLI process and the public runtime module, using the fake TranslationTools HTTP API. Any Testing Decisions gap left by earlier steps is closed here — not new product scope.

Cover at least, if not already green: `init` on empty and existing projects; generate (typed key, original key, sanitization, collision suffix, nested rejected, invalid key rejected, empty file); pull/push including prune, origin filter by package name, locale file naming, scoped package names; runtime `initialize` / `get` / `getCached` / `observe` / placeholders / missing-key fallback / bundled fallback without network / single-key fetch on miss / Authorization header / encoded origin on single-key GET / environment path segment / heartbeat body.

npx-style invocation of the `translationtools` bin works from a consumer-shaped temp project (devDependency layout, no global install). A JavaScript importer can ignore types and still run. Two packages in one TranslationTools project keep distinct origins by package name.

Out of scope stays out: browsers, i18next adapters, local-only keys, plurals, live WebSocket, typed placeholder accessors, publishing.

## Footprint

Projects: packages/client, packages/cli

- `packages/client/test/` — remaining runtime coverage against the fake HTTP API
- `packages/cli/test/` — remaining CLI process coverage
- `test/support/` — fake HTTP helper shared by both suites
- workspace `package.json` — root test script that runs the whole suite

## Acceptance criteria

- [x] Root `npm test` is green for both packages.
- [x] Every case listed in the spec's Testing Decisions is asserted through the CLI process or the runtime module (or a focused origin test where HTTP is too coarse).
- [x] The CLI bin can be run without a global install.
- [x] A JS consumer and a TS consumer both look up a bundled string successfully.

## Outcome

No product code changes. Suite gaps closed in `test/suite-green.test.ts`: consumer-shaped temp project with `devDependencies`/`dependencies` package.json + `node_modules` junction to workspace packages and an npm-style `.bin` shim; `translationtools` invoked via the linked package `dist/bin.js` (no global install); JS `.mjs` and TS (tsc → run) consumers both `createClient` + `get` a bundled string; push with `prune: false` keeps other-package remote origins in the POST body.

Earlier steps already covered the rest of Testing Decisions (init/generate/pull/push/runtime HTTP). Root `npm test` runs build then `node --experimental-strip-types --test` over `test/**/*.test.ts` and `packages/*/test/**/*.test.ts` — 55 passing. Origin encoding deviation from step 05 stands: single-key GET uses `@org%2Fapp:%2Ftranslations%2Fstrings.json`. Out of scope (browsers, adapters, plurals, WebSocket, typed placeholders, publishing) stays untested by design.
