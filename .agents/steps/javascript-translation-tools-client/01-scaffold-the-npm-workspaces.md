# 01 — Scaffold the npm workspaces

Status: pending
Blocked by: none

## What to build

The empty repo becomes an npm workspaces tree that can hold the two public packages. There is no user-facing translation behaviour yet.

- Workspace root with `packages/client` (`@mvdmio/translation-tools-client`) and `packages/cli` (`@mvdmio/translation-tools-cli`).
- ESM only. TypeScript types ship next to the JS. `engines.node` targets the current Node.js LTS (Node 24; `>=22` is acceptable so the still-maintained 22 line can run tests).
- The CLI package declares bin name `translationtools`. `--help` can exist; `init`, `pull`, `push`, and `generate` are not implemented yet.
- Tests use Node's built-in test runner against public surfaces. A programmable fake TranslationTools HTTP helper listens on `127.0.0.1` with an ephemeral port, records method/path/headers/body, and returns configured JSON. Later steps configure it; they do not invent a second fake.
- A helper runs the CLI as a child process in a temp directory (cwd = that project), with env for `TRANSLATIONTOOLS_API_KEY` and undocumented `TRANSLATIONTOOLS_BASE_URL`.
- `npm test` at the root is green even if this step only has a smoke import.

## Footprint

Projects: packages/client, packages/cli

- `package.json` — workspaces, root test script
- `packages/client/package.json` — `@mvdmio/translation-tools-client`, ESM, types, engines
- `packages/cli/package.json` — `@mvdmio/translation-tools-cli`, bin `translationtools`, engines
- `packages/client/src/` — package entry that currently exports nothing public of the runtime API
- `packages/cli/src/` — bin entry
- `test/support/fake-translation-tools-http.ts` — programmable fake TranslationTools HTTP API
- `test/support/run-cli.ts` — spawn the CLI process in a temp project
- `tsconfig` files, `.gitignore` — Node/TypeScript workspace

## Acceptance criteria

- [ ] Root `npm test` exits 0.
- [ ] Both packages typecheck as ESM and expose type declarations for importers.
- [ ] The CLI bin name is `translationtools`.
- [ ] A test can start the fake HTTP helper, send a GET, and see the recorded path and `Authorization` header.
- [ ] A test can spawn the CLI in a temp folder and observe its exit code and stdout/stderr.
