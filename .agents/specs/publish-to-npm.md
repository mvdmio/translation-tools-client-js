# Publish the Translation Tools Client and CLI to npm

Status: ready-for-agent

## Problem Statement

A Node.js project cannot install the Translation Tools Client or the Translation Tools CLI from npm. The packages exist in this workspace with names and exports, but they are not on the public registry. There is no license, no consumer README for the client, no GitHub remote, and no release process. People who want translations in a Node.js app have to copy this repo.

## Solution

Publish both packages to the public npm registry under the existing `@mvdmio` names, at version `0.1.0`. Put the source on GitHub. GitHub Actions tests every change on `master` and publishes both packages when a maintainer pushes a version tag. CI authenticates with npm trusted publishing. The first live publish is part of this work. Lookup, pull, push, and generate stay as they are.

## User Stories

1. As a Node.js developer, I want to install the Translation Tools Client from the public npm registry, so that my app can look up translations without copying this repo.
2. As a Node.js developer, I want to run the Translation Tools CLI with `npx` and the scoped package name, so that I can init, generate, pull, and push without a global install.
3. As a Node.js developer who already installed the CLI as a dev dependency, I want `npx translationtools` to run the CLI, so that the bin name still works after a local install.
4. As a Node.js developer, I want the npm page for the client to show the install command, so that I do not guess the package name.
5. As a Node.js developer, I want the npm page for the CLI to show the install command and the `npx` command, so that I can run init, generate, pull, and push from the listing.
6. As a Node.js developer, I want each package to say it needs Node.js 22 or newer, so that I do not install it on an unsupported runtime.
7. As a Node.js developer, I want each package to say that `0.x` may still change, so that I do not treat `0.1.0` as a stable API.
8. As a TypeScript developer, I want `import` of the client to resolve to compiled JavaScript and type declarations, so that Node and the compiler both load the published package.
9. As a Node.js developer, I want the published CLI to expose the `translationtools` bin, so that commands start after install.
10. As a visitor on GitHub, I want a public repository with a root README that names both packages and their install commands, so that I can find the packages from the source.
11. As a visitor on GitHub, I want an MIT license with copyright holder mvdm.io, so that I know I can use the code.
12. As an npm consumer, I want each packed package to include the MIT license, so that the tarball on the registry is licensed.
13. As a maintainer, I want both packages to share one version number, so that I do not release them out of sync.
14. As a maintainer, I want the first published version to be `0.1.0`, so that npm does not show a placeholder `0.0.0`.
15. As a maintainer, I want the changelog to have a `0.1.0` heading, so that the first registry release has a product note.
16. As a maintainer, I want CI to run the existing test suite on every push and pull request to `master`, so that a broken tree is not tagged.
17. As a maintainer, I want CI to publish both packages when I push a version tag, so that I do not publish by hand.
18. As a maintainer, I want that publish job to run the tests first, so that a red suite never reaches npm.
19. As a maintainer, I want publish to fail when the tag does not match both package versions, so that I cannot ship the wrong number.
20. As a maintainer, I want GitHub Actions to authenticate to npm with trusted publishing, so that GitHub secrets do not hold an npm token.
21. As a maintainer, I want to add this GitHub repo as a trusted publisher on both npm packages before the first tag, so that CI is allowed to publish.
22. As a maintainer, I want the first live `0.1.0` publish to happen as part of this work, so that people can install as soon as the trusted publisher is in place.
23. As a maintainer, I want a documented release recipe — bump both versions, update the changelog, commit, tag `vX.Y.Z`, push the tag — so that later releases repeat.
24. As a maintainer, I want the root workspace to stay private and unpublished, so that nobody installs the monorepo wrapper from npm.
25. As an app that already stores origins in TranslationTools, I want the published package names to stay `@mvdmio/translation-tools-client` and `@mvdmio/translation-tools-cli`, so that origins do not change.
26. As TranslationTools, I want the client's heartbeat to send the published package version, so that the service sees `0.1.0` after this release.
27. As a consumer of generated code, I want generate to keep importing the Translation Tools Client by its npm name, so that generated files still typecheck against the published client.
28. As a maintainer, I want npm to record that GitHub Actions built the tarball (provenance), so that a later reader can see the publish came from CI.
29. As a maintainer who pushes `master` without a tag, I want tests to run and nothing to publish, so that everyday commits do not hit the registry.
30. As a maintainer who tags `v0.2.0` while the packages still say `0.1.0`, I want CI to refuse to publish, so that the registry version matches the tag.
31. As a future maintainer, I want an ADR that we publish only from GitHub Actions with trusted publishing, so that nobody adds a long-lived npm token to "fix" CI.
32. As a developer who only runs the CLI, I want to npx the CLI without installing the client, so that generate can still emit an import of the client that the app adds when it needs lookups.
33. As a Node.js developer, I want to install with `npm install @mvdmio/translation-tools-client`, so that the command on npm matches the command on GitHub.
34. As a Node.js developer, I want to run the CLI with `npx @mvdmio/translation-tools-cli`, so that npx resolves the scoped package and not some other `translationtools` name.
35. As a maintainer, I want each package's npm metadata to include license, repository, homepage, bugs, public access, and author, so that the registry listing is complete.
36. As a maintainer, I want compiled output built at pack time and not committed, so that the git tree stays source-only and the tarball still has `dist`.
37. As a CI runner, I want Ubuntu and Node 22, so that the published engines field and the test runtime match.
38. As a maintainer cutting `0.2.0` later, I want the same tag-and-publish path, so that the first release is not a one-off.

## Implementation Decisions

- Publish only the two workspace packages: the Translation Tools Client (`@mvdmio/translation-tools-client`) and the Translation Tools CLI (`@mvdmio/translation-tools-cli`). The root workspace stays `private` and is never published.
- Keep those package names. Renaming would change origins (ADR-0003).
- Both packages share one version. The first published version is `0.1.0`. Until `1.0.0`, README and changelog say the API may still change.
- License is MIT. Copyright line is `Copyright (c) 2026 mvdm.io`. One LICENSE file lives at the repository root. Each package's npm manifest sets `license` to MIT. Each packed tarball includes that MIT text.
- Author on each package is mvdmio / Michiel van der Meer, matching the .NET client package.
- Each package's npm manifest gets repository, homepage, and bugs pointing at the GitHub repo, plus `publishConfig.access: public`. Repository metadata also names which workspace folder the package lives in.
- Packages stay ESM-only (`type: module`) and keep `engines.node` at `>=22`. Do not add a CommonJS build or a browser build (ADR-0001).
- Each package continues to ship compiled JavaScript and type declarations from `dist`. `dist` is built at pack time and is not committed.
- Each package has a README. That README is what npm shows. The client README documents `npm install @mvdmio/translation-tools-client` and a short lookup example. The CLI README documents `npx @mvdmio/translation-tools-cli` and keeps the existing command and origin notes. After a local install, `npx translationtools` still works because that is the bin name. Do not also publish an unscoped `translationtools` package.
- A root README is the GitHub landing page. It points at both packages and the install commands. It states Node.js 22 or newer and that `0.x` may still change.
- Changelog: replace the dated heading with `## 0.1.0` and keep the existing product note under it. Later releases add a new version heading.
- The client's heartbeat already reads the version from the client package manifest. After the bump it reports `0.1.0`. Do not hardcode a second version string.
- The CLI does not list the client as a dependency. Generate still emits an import of the client. The app that looks up translations installs the client. That stays.
- Create a new public GitHub repository `mvdmio/translation-tools-client-js`. Set it as the git remote. Push `master`. That matches `translation-tools-client-dotnet` and `translation-tools-client-kmp`.
- Two GitHub Actions workflows, both on Ubuntu with Node 22:
  - Test: runs the existing test suite on push and pull request to `master`.
  - Publish: runs on tags that match `v*`. Runs the test suite, checks that the tag (without the `v`) equals both package versions, then publishes both packages to the public npm registry with provenance. The workflow file name is `publish.translationtools-packages-npm.yml` so the npm trusted publisher can pin it.
- CI authenticates with npm trusted publishing. GitHub proves its identity to npm. GitHub secrets do not hold an npm token. Maintainers do not publish from a laptop. Recorded in ADR-0004.
- First live publish sequence, in order:
  1. Land the package metadata, license, READMEs, version `0.1.0`, changelog, and workflows on `master`.
  2. Create the GitHub repository and push `master`.
  3. Stop. The maintainer adds this repository as a trusted publisher on both npm packages, pinning `publish.translationtools-packages-npm.yml`.
  4. After that is confirmed, push tag `v0.1.0`. CI publishes both packages.
- Later releases: bump both package versions to the same number, update the changelog, commit, tag `vX.Y.Z`, push the tag. CI publishes.
- Tests that pin our two packages at `0.0.0` follow the new version. A consumer app's own `version` field that is not our package stays as it is. The heartbeat assertion that expects the client package version follows `0.1.0`.
- Lookup, pull, push, generate, and the public client API do not change in this work.

## Testing Decisions

A good test checks what a consumer gets from a packed package, not GitHub Actions YAML and not npm's website.

The highest seam is a tarball from `npm pack` installed into a temporary consumer project, the same shape as the existing suite that already builds consumer-shaped temp projects and links the workspace packages. Add coverage at that seam so a packed client can look up a bundled string, and a packed CLI can run `init` (or `--help`) through its bin. That is the stand-in for "people installed from npm" without talking to the live registry.

Keep the existing suite green: consumer lookup, CLI init/generate/pull/push, scaffold, bundled fallback, and refresh. Those tests already prove behaviour this work must not break.

The heartbeat test that asserts the client version must expect the version in the client package manifest (`0.1.0` after the bump). Do not leave it asserting `0.0.0`.

The publish job checks that the tag matches both package versions. Cover that check with a matching tag and a mismatching tag. Do not parse workflow YAML in tests.

Do not call the live npm registry or GitHub from tests. The first live publish is a maintainer-and-CI step after trusted publishing is configured, not an automated test.

## Out of Scope

- Changing lookup, pull, push, generate, or the public client API.
- A browser build, DOM adapters, or other JS runtimes (ADR-0001).
- A CommonJS build or dual-package publish.
- Publishing the root workspace.
- Renaming either package or publishing an unscoped `translationtools` alias.
- Independent versions for the two packages.
- Shipping `1.0.0` or calling the API stable.
- A long-lived npm token in GitHub secrets.
- Publishing from a maintainer laptop as the supported path.
- Publishing on every push to `master` (the .NET and KMP clients do that; this repo publishes on version tags).
- Changesets, semantic-release, or other release-train tools.
- Adapters for i18next or other translation libraries (ADR-0002).
- Typed placeholder accessors (existing idea, unrelated).

## Further Notes

The first tag must wait until the maintainer has added `mvdmio/translation-tools-client-js` as a trusted publisher on both `@mvdmio` packages, with workflow `publish.translationtools-packages-npm.yml`. The implementer creates the GitHub repo and pushes `master`, then stops for that click. After the maintainer confirms, the implementer pushes `v0.1.0`.

`npx translationtools` without a local install resolves the unscoped npm name `translationtools`, which is not this package. Document `npx @mvdmio/translation-tools-cli` as the command that works before a local install.

The client heartbeat already reads `version` from the client package manifest. Bumping the manifest is enough; do not add a second source of truth.
