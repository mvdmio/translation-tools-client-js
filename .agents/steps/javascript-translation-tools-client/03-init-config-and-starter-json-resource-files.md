# 03 — Init config and starter JSON resource files

Status: done
Blocked by: 01

## What to build

A developer in a Node.js package directory runs the Translation Tools CLI `init` command and gets a starter `translationtools.yaml` plus a starter default-locale JSON resource file, without writing them by hand.

Cwd is the package (the directory that contains `package.json`). The yaml sits next to that `package.json`. If `translationtools.yaml` or the starter JSON already exists, init exits non-zero, writes neither, and does not overwrite.

Starter yaml uses the KMP field set renamed for JSON (`jsonResources` instead of `androidResources`):

```yaml
apiKey: your-project-api-key
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
```

`generated.objectName` and `snapshotFile` are rejected if present (KMP already rejected those). Default locale is `en` when omitted later; init writes `en`.

Starter JSON is `translations/strings.json` with one example entry `{ "home_title": "Home" }` so generate has something to emit.

Init does not need an API key and does not call TranslationTools.

## Footprint

Projects: packages/cli

- `packages/cli/src/bin.ts` — command dispatch, `init`
- `packages/cli/src/init.ts` — write yaml and starter JSON, refuse overwrite
- `packages/cli/src/config.ts` — yaml shape (`jsonResources`, `generated.path`, prune, keyOverrides)
- `packages/cli/test/init.test.ts` — CLI process tests on an empty project and an existing project

## Acceptance criteria

- [x] `translationtools init` in a folder with `package.json` and no yaml/JSON writes `translationtools.yaml` next to `package.json` and `translations/strings.json`.
- [x] The yaml includes apiKey, defaultLocale, locales, generated.enabled, generated.path, jsonResources.resourceDirectories, prune, and keyOverrides.
- [x] A second `init` exits non-zero and leaves the existing files unchanged.
- [x] Init does not send HTTP and does not require `TRANSLATIONTOOLS_API_KEY`.

## Outcome

`translationtools init` is implemented in `packages/cli`. `bin.ts` dispatches `init` to `runInit(cwd)` in `init.ts`, which writes `translationtools.yaml` and `translations/strings.json` (`{ "home_title": "Home" }`) under cwd. If either path already exists, init exits 1, writes neither, and does not overwrite. Init never reads `TRANSLATIONTOOLS_API_KEY` and never opens HTTP.

`config.ts` owns the yaml shape (`jsonResources` not `androidResources`), starter render helpers, `parseConfig` / `loadConfig`, and `resolveApiKey` (env then yaml). Defaults when omitted: `defaultLocale` `en`, `generated.enabled` true, `generated.path` `translations/generated.ts`, `resourceDirectories` `['translations']`, `prune` false, `keyOverrides` `{}`. Present `snapshotFile` or `generated.objectName` throw (same rejection as KMP). CLI depends on `yaml` for parsing. Init itself only writes the starter string; later steps call `loadConfig`. Tests: `packages/cli/test/init.test.ts` via `runCli` (empty project, existing yaml, existing JSON, second init; fake HTTP asserts zero requests).
