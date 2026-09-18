# Translation Tools Client (JavaScript)

Node.js client and CLI for [TranslationTools](https://translationtools.mvdm.io). Requires **Node.js 22 or newer**. Version `0.x` may still change until `1.0.0`.

## Packages

| Package | Install |
| --- | --- |
| Translation Tools Client | `npm install @mvdmio/translation-tools-client` |
| Translation Tools CLI | `npx @mvdmio/translation-tools-cli` |

After a local install of the CLI, `npx translationtools` also works (that is the bin name). Before a local install, use the scoped package name above.

## Workspace

This repository is an npm workspace. The root package is private and is not published.

## Releasing

Both packages share one version. To cut a release:

1. Bump both package versions to the same number.
2. Update the changelog.
3. Commit.
4. Tag `vX.Y.Z` (matching that version).
5. Push the tag.

GitHub Actions runs the tests, checks that the tag matches both package versions, and publishes both packages to the public npm registry with provenance. Publish uses npm trusted publishing (no npm token in GitHub secrets). Pushing `master` without a tag runs tests only and does not publish.
