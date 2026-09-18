# 01 — Packed Translation Tools Client and CLI at 0.1.0

Status: pending
Blocked by: none

## What to build

A Node.js developer can install the Translation Tools Client and the Translation Tools CLI the same way they will from npm, without talking to the live registry. `npm pack` on each workspace package produces a tarball at version `0.1.0`. Installing that tarball into a temporary consumer project is enough to look up a bundled string through the client, and to run the CLI bin (`init` or `--help`). After a local install of the CLI, `npx translationtools` still runs because that is the bin name. Before a local install, the documented command is `npx @mvdmio/translation-tools-cli`, not the unscoped `translationtools` name.

Both packages keep the names `@mvdmio/translation-tools-client` and `@mvdmio/translation-tools-cli`. They share one version, `0.1.0`. The root workspace stays private and is never packed as a publishable package. Each package stays ESM-only, ships compiled JavaScript and type declarations from `dist`, and declares Node.js 22 or newer. `dist` is built at pack time and is not committed.

Each package's npm metadata includes MIT license, author `mvdmio / Michiel van der Meer`, repository (with the workspace folder), homepage, bugs, and public access, all pointing at `https://github.com/mvdmio/translation-tools-client-js`. One MIT `LICENSE` file lives at the repository root with `Copyright (c) 2026 mvdm.io`. Each packed tarball includes that MIT text; the git tree does not grow a second license source of truth.

The client README is what npm shows for the client: `npm install @mvdmio/translation-tools-client` and a short lookup example. The CLI README is what npm shows for the CLI: `npx @mvdmio/translation-tools-cli` plus the existing commands and origin notes. The root README is the GitHub landing page: both package names, both install commands, Node.js 22 or newer, and that `0.x` may still change. Changelog heading `## 0.1.0` replaces the dated heading; the existing product note stays under it and says the API may still change until `1.0.0`.

The client's heartbeat keeps reading `version` from the client package manifest, so after the bump it reports `0.1.0`. Do not hardcode a second version string. The CLI still does not depend on the client. Generate still emits an import of `@mvdmio/translation-tools-client`. Lookup, pull, push, generate, and the public client API do not change.

Tests that pin *our* two packages at `0.0.0` follow `0.1.0`. A consumer app's own `version` field that is not our package stays as it is. The heartbeat assertion follows the version in the client package manifest. New coverage packs each package with `npm pack` and installs the tarball into a consumer-shaped temp project, the same shape as the existing suite that already builds those projects and links workspace packages. Do not call the live npm registry or GitHub.

## Footprint

Projects: translation-tools-client-js

- `packages/client/package.json` — `@mvdmio/translation-tools-client`, `version`, `license`, `author`, `repository`, `homepage`, `bugs`, `publishConfig`, `engines`, `files`, `exports`, pack-time `build`
- `packages/cli/package.json` — `@mvdmio/translation-tools-cli`, `version`, `bin.translationtools`, same publish metadata, no client dependency
- `package.json` — root `private`, unpublished workspace
- `package-lock.json` — workspace package versions
- `LICENSE` — MIT, `Copyright (c) 2026 mvdm.io`
- `README.md` — GitHub landing: both packages, install commands, Node 22, `0.x`
- `packages/client/README.md` — npm page for the Translation Tools Client
- `packages/cli/README.md` — npm page for the Translation Tools CLI (`npx @mvdmio/translation-tools-cli`)
- `CHANGELOG.md` — `## 0.1.0` heading and `0.x` note
- `packages/client/src/client.ts` — `CLIENT_VERSION` (manifest only; do not add a second source)
- `packages/client/test/refresh-from-translationtools.test.ts` — heartbeat `version` assertion
- `test/suite-green.test.ts` — dependency pins of our two packages
- `test/packed-consumer.test.ts` — packed-tarball client lookup and CLI bin (new; same consumer-shaped seam as `suite-green.test.ts`)
- `packages/cli/src/generate.ts` — generated import of `@mvdmio/translation-tools-client` (unchanged)
- `.gitignore` — `dist/` stays uncommitted; pack must not leave a second committed LICENSE

## Acceptance criteria

- [ ] Both workspace packages are version `0.1.0` and still named `@mvdmio/translation-tools-client` and `@mvdmio/translation-tools-cli`.
- [ ] The root workspace is private and is not a public npm package.
- [ ] `npm pack` on each package builds `dist` and yields a tarball that contains compiled JavaScript, type declarations, the package README, and the MIT license text, and does not contain committed `dist` in git.
- [ ] Each package manifest has MIT license, author `mvdmio / Michiel van der Meer`, repository (including workspace directory), homepage, bugs, `engines.node` `>=22`, ESM-only exports, and public `publishConfig`.
- [ ] A temp consumer that installs the packed client can look up a bundled string; a TypeScript import of the packed client resolves to that JavaScript and those declarations.
- [ ] A temp consumer that installs the packed CLI can run `init` or `--help` through the `translationtools` bin without installing the client.
- [ ] Client README documents `npm install @mvdmio/translation-tools-client`; CLI README documents `npx @mvdmio/translation-tools-cli` and that `npx translationtools` works after a local install; no unscoped `translationtools` package is added.
- [ ] Root README names both packages, both install commands, Node.js 22 or newer, and that `0.x` may still change.
- [ ] Changelog uses heading `## 0.1.0`, keeps the existing product note, and says the API may still change until `1.0.0`.
- [ ] Heartbeat reports the client package manifest version (`0.1.0`); tests that pin our two packages follow `0.1.0`; consumer apps' own `version` fields stay as they are.
- [ ] Generate still emits an import of `@mvdmio/translation-tools-client`; the CLI still has no client dependency; lookup, pull, push, generate, and the public client API are unchanged.
- [ ] Existing consumer lookup, CLI init/generate/pull/push, scaffold, bundled fallback, and refresh tests stay green. Pack tests do not call the live npm registry or GitHub.
