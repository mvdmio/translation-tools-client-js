# JavaScript Translation Tools Client

Status: ready-for-agent

## Problem Statement

TranslationTools already has a .NET client and a Kotlin Multiplatform client. A Node.js project has no package to install. Developers cannot keep JSON resource files as the source of truth, generate typed keys, pull and push with TranslationTools, or look up translations at runtime the way KMP apps do.

JavaScript has no default translation-file format. Without a client that defines one, each Node.js project invents its own files and cannot share a TranslationTools project with a stable origin.

## Solution

Publish two public npm packages under `@mvdmio`.

The Translation Tools Client is the runtime a Node.js app imports. After `initialize`, the app looks up translations with typed keys, placeholders, bundled fallback, and runtime refresh.

The Translation Tools CLI is a dev-only package. Developers run it with npx. It inits config, pulls and pushes JSON resource files, and generates committed TypeScript (typed keys plus bundled fallback).

Local JSON resource files are the source of truth. One file per locale. Keys are flat. Values are strings. Origin is the npm package name plus the path to the default-locale file, so two packages in one TranslationTools project do not collide.

This matches the KMP library’s features, except origins include the package name on purpose, and local-only keys are not supported.

## User Stories

1. As a Node.js developer, I want to install the Translation Tools Client from the public npm registry, so that I can add it with the same tools I already use.
2. As a Node.js developer, I want to install the Translation Tools CLI as a dev-only dependency, so that production installs do not carry generate and sync tooling.
3. As a Node.js developer, I want to run the CLI with npx, so that I do not need a global install.
4. As a Node.js developer, I want an `init` command, so that I get a starter config and a starter JSON resource file without writing them by hand.
5. As a Node.js developer, I want `init` to refuse to overwrite files I already have, so that I do not lose work.
6. As a Node.js developer, I want config in `translationtools.yaml` next to `package.json`, so that the origin prefix is that package’s name.
7. As a Node.js developer, I want to put the API key in `TRANSLATIONTOOLS_API_KEY`, so that I do not commit secrets.
8. As a Node.js developer, I want the CLI to fall back to the API key in yaml when the environment variable is unset, so that local experiments still work.
9. As a Node.js developer, I want to edit a default-locale JSON resource file with flat keys and string values, so that the source of truth is ordinary JSON.
10. As a Node.js developer, I want a second locale as `name.{locale}.json`, so that each locale is its own file.
11. As a Node.js developer, I want more than one base name (`strings` and `errors`), so that I can split origins the way .NET splits `.resx` files.
12. As a Node.js developer, I want nested JSON objects rejected, so that keys stay a single TranslationTools key each.
13. As a Node.js developer, I want a `generate` command, so that typed keys and bundled fallback stay in sync with local JSON.
14. As a Node.js developer, I want generate to work without an API key and without calling TranslationTools, so that I can typecheck without a network.
15. As a Node.js developer, I want generated TypeScript committed, so that a fresh clone typechecks without running generate.
16. As a Node.js developer, I want generated typed keys to import types from the runtime package, so that the app has one model for a translation ref.
17. As a Node.js developer, I want invalid key characters sanitized on the typed name, so that the generated module is valid TypeScript.
18. As a Node.js developer, I want the translation ref to keep the original key, so that lookup still hits TranslationTools.
19. As a Node.js developer, I want colliding sanitized names to get a stable suffix, so that generate does not drop a key.
20. As a Node.js developer, I want a `pull` command, so that JSON resource files pick up remote changes.
21. As a Node.js developer, I want `pull` to also generate, so that I do not forget a second command.
22. As a Node.js developer, I want `pull` to create missing locale files, so that a new locale on the server becomes a local file.
23. As a Node.js developer, I want a `push` command, so that my local JSON resource files become the remote store.
24. As a Node.js developer, I want prune on push, so that I can make the remote store an exact mirror of local keys.
25. As a Node.js developer, I want prune on pull, so that I can drop local keys the server no longer has.
26. As a Node.js developer, I want key overrides in config, so that a JSON key can map to a different TranslationTools key.
27. As a Node.js developer, I want origin to include my `package.json` name, so that another package in the same TranslationTools project cannot collide with my keys.
28. As a Node.js developer, I want a scoped package name (`@org/app`) used as-is in origin, so that the origin matches the name I publish.
29. As a Node.js developer, I want a `package.json` name that contains `:` rejected, so that origin parsing stays unambiguous.
30. As a Node.js developer, I want a missing `package.json` name to fail with a clear error, so that I am not silently assigned a wrong origin.
31. As a Node.js developer, I want locale-suffixed files to share the default-locale origin, so that `strings.json` and `strings.nl.json` are one origin, two locales.
32. As a Node.js developer, I want the JSON folder to default to `translations/` and to be configurable, so that I can match my repo layout.
33. As a Node.js developer, I want the generated module path to default to `translations/generated.ts` and to be configurable, so that I can match my repo layout.
34. As a Node.js developer, I want locales in filenames lowercased (`strings.pt-br.json`), so that they match how TranslationTools stores locale.
35. As a Node.js app, I want to `initialize` on process start, so that cache, bundled fallback, and refresh have a defined order.
36. As a Node.js app, I want `get` with a typed key, so that I receive the current string for the resolved locale.
37. As a Node.js app, I want `getCached` to never call the network, so that a request path can stay synchronous and local.
38. As a Node.js app, I want `observe` to emit when a value changes, so that long-running processes can react to a refresh.
39. As a Node.js app, I want an explicit locale argument to override the locale provider, so that a job can render a specific locale.
40. As a Node.js app, I want locale resolution to be explicit argument, then provider, then project default locale, then `en`, so that behaviour matches KMP.
41. As a Node.js app, I want `{camelCase}` placeholders substituted on `get`, so that a string can include a name or count.
42. As a Node.js app, I want global placeholders from client options, so that app-wide tokens do not pass on every call.
43. As a Node.js app, I want a missing translation to use cache, then bundled fallback, then the key, so that a lookup never throws on a miss.
44. As a Node.js app, I want `get` on a cache miss to fetch that one translation ref from TranslationTools, so that a new key appears without a full refresh.
45. As a Node.js app, I want bundled fallback when the network is down and nothing is persisted, so that the process still serves default-locale strings.
46. As a Node.js app, I want runtime refresh after install, so that copy can change without shipping a new build.
47. As a Node.js app, I want a default snapshot store that does not persist, so that I opt in to files on disk.
48. As a Node.js app, I want an opt-in file snapshot store, so that a restart can restore the last refresh.
49. As a Node.js app, I want environments on lookup and heartbeat, so that staging copy can differ from production.
50. As a Node.js app, I want a heartbeat, so that the process appears in the TranslationTools UI.
51. As a Node.js app, I want no locale-to-locale value fallback (`nl` does not read `en` when a key is missing in `nl`), so that behaviour matches KMP.
52. As a Node.js app, I want the default TranslationTools URL to be `https://translations.mvdm.io`, so that I do not configure a host in the common case.
53. As a Node.js app, I want the project API key sent as the raw `Authorization` header (not Bearer), so that I match existing clients.
54. As a Node.js app, I want origin encoded as one URL path segment when fetching a single key, so that slashes in the path do not break the route.
55. As a Node.js developer who uses JavaScript without TypeScript, I want the packages to ship types that I can ignore, so that I can still install and run.
56. As a Node.js developer, I want empty JSON resource files to produce no typed keys, so that generate does not invent entries.
57. As a Node.js developer, I want keys that fail `^[A-Za-z0-9._-]+$` rejected on generate and push, so that I do not upload keys the API will refuse.
58. As a CI job, I want tests to run against the public CLI and the public runtime with a fake TranslationTools HTTP API, so that I do not depend on production.
59. As a Node.js developer with two packages in one TranslationTools project, I want their origins to differ by package name, so that `home_title` in each package stays distinct.
60. As a Node.js developer who renames an npm package, I want to understand that origins change, so that I can plan a push rather than silently orphan remote keys.

## Implementation Decisions

- This repo publishes two npm packages: a runtime (`@mvdmio/translation-tools-client`) and a CLI (`@mvdmio/translation-tools-cli`). The CLI bin name is `translationtools`. Commands: `init`, `pull`, `push`, `generate`. `pull` also generates.
- The runtime runs on Node.js only (ADR-0001). Ship TypeScript types. JavaScript importers work. ESM is the module format. Target a current Node.js LTS.
- Apps call this client as the translation API (ADR-0002). The public runtime surface matches the KMP client’s jobs: create a client, `initialize`, `get`, `getCached`, `observe`, `refresh` / `refreshIfStale`, `withPlaceholders`. `get` is async. `getCached` is synchronous and does not fetch. Locale resolution matches KMP (explicit argument, then provider, then project default locale, then `en`). Locales are trimmed and lowercased. Runtime options require a non-blank API key. The runtime uses the platform HTTP client; the app does not pass an engine. A base URL override exists for tests and is not a documented consumer setting.
- JSON resource files are the source of truth. Default folder `translations/`. Default-locale file has no locale suffix. Other locales use `name.{locale}.json` with a lowercase locale. More than one base name is allowed. Values are strings only. Nested objects are invalid. There is no local-only marker.
- Origin is `{package.json name}:/{project-relative path to the default-locale file}` (ADR-0003). The yaml file sits next to that `package.json`. The name is used as-is, including a scope. A name that contains `:` is rejected. The path starts with `/` and ends with `.json`. Locale-suffixed files share the default-locale origin. TranslationTools stores origin lowercase. HTTP single-key calls encode origin as one URL path segment.
- Config file name is `translationtools.yaml`, with the KMP field set renamed for JSON (`jsonResources` instead of `androidResources`). Fields: API key, default locale, locales, generated output (enabled, path), JSON resource directories, prune, key overrides. API key lookup: `TRANSLATIONTOOLS_API_KEY`, then yaml. If generated output is disabled, `pull` does not generate; the `generate` command still exists.
- `init` writes yaml and a starter default-locale JSON resource file. It does not overwrite existing files.
- Generate reads local JSON only. It writes one TypeScript module (typed keys plus bundled fallback) that imports types from the runtime package. Default output path: `translations/generated.ts`. Developers commit it. Identifier sanitization matches KMP (invalid characters become `_`; collisions get a suffix). The translation ref keeps the original key.
- Push and pull talk to TranslationTools the same way the KMP plugin does (project metadata, per-locale lists, POST project items). Both support prune. Pull writes JSON resource files for origins that match this package, then generates. Pull creates missing locale files.
- Runtime HTTP matches the KMP client: project metadata, locale snapshots (optional environment segment), single-key GET (optional environment), heartbeat POST, globals POST. Auth is the project API key in `Authorization`. Default base URL is `https://translations.mvdm.io`.
- Placeholders are ICU-style `{camelCase}` with apostrophe escapes, matching KMP and the TranslationTools placeholder rules. Global placeholders live on client options. `getCached` does not substitute.
- Default snapshot store does not persist. A file store is opt-in. `initialize` restores persisted snapshot if any, else bundled fallback, then blocking refresh if nothing restored, else optional background refresh. Heartbeat defaults on, interval one hour. Refresh interval defaults to one hour.
- Missing value: cache, then bundled fallback / generated fallback string, then the key. No locale-to-locale chain. `get` may fetch one ref on a cache miss. Invalid origin or key throws a validation error. Key alphabet is `^[A-Za-z0-9._-]+$`.
- Heartbeat platform string is `node`.
- yaml `generated.objectName` and a configurable snapshot path in yaml are not supported (KMP already rejected those).
- Document that renaming the npm package changes origins.

Origin shape (decision, not an implementation file):

```
{package.json name}:/{relative path to default-locale JSON}
@org/app:/translations/strings.json
```

JSON resource file shape:

```
{ "home_title": "Home", "checkout.title": "Checkout" }
```

## Testing Decisions

A good test asserts what a developer or a running app can observe: CLI exit, files written, strings returned, HTTP paths and headers sent. It does not assert private helpers, generated formatting trivia, or mock internals.

Test through two public surfaces against a fake TranslationTools HTTP API: the CLI process, and the runtime module. That is one seam (this client as a TranslationTools consumer) with two entry points. Prefer that seam over parser-only tests. Add a focused origin test only where HTTP is too coarse to show encoding and package-name rules.

Cover at least: `init` on an empty project and on an existing project; generate from JSON (typed key, original key on the ref, sanitization, collision suffix, nested JSON rejected, invalid key rejected, empty file); pull/push including prune, origin filter by package name, locale file naming, scoped package names; runtime `initialize` / `get` / `getCached` / `observe` / placeholders / missing-key fallback / bundled fallback without network / single-key fetch on miss / Authorization header / encoded origin on single-key GET / environment path segment / heartbeat body.

This repo has no tests yet. Prior art is the KMP client (runtime tests with a mock HTTP API, plugin tests with an in-process fake server) and the .NET client (unit tests plus an in-process fake host for initialize, auth, generated accessors).

## Out of Scope

- Running in a browser, React Native, Electron, Deno, or other non-Node runtimes (ADR-0001).
- Adapters or file export for i18next, Vue I18n, FormatJS, or similar (ADR-0002).
- Local-only keys (`translatable=false` in KMP). Every key in a JSON resource file is pushed and fetched.
- Plural rules and string arrays.
- Live WebSocket updates (a .NET client feature, not KMP).
- Typed placeholder accessors. See `.agents/ideas/typed-placeholder-accessors.md`.
- Apple `.strings`, Android XML, or `.resx` as source of truth.
- Changing the TranslationTools service, its HTTP API, or its storage rules.
- Publishing the Gradle plugin, the .NET tool, or any non-npm artifact from this repo.

## Further Notes

The KMP library is the feature twin. Where this spec is silent on a runtime or sync detail, match KMP. Two deliberate breaks: origin includes the package name (ADR-0003); no local-only keys.

The .NET client is a sibling for the CLI-versus-runtime split and for `<project>:<path>` origins. Do not copy .NET live updates, `IStringLocalizer`, or `.resx`.

This folder starts empty. The spec is the first product in the repo.
