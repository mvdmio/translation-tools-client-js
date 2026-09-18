# 02 — Tag-and-publish from GitHub Actions

Status: done
Blocked by: 01

## What to build

A maintainer who pushes or opens a pull request to `master` gets the existing test suite on Ubuntu with Node 22, and nothing is published. A maintainer who pushes a version tag `vX.Y.Z` gets a second workflow that runs those tests, checks that the tag without the `v` equals both package versions, and then publishes both workspace packages to the public npm registry with provenance. If the tag does not match both versions (for example `v0.2.0` while the packages still say `0.1.0`), publish does not run. Pushing `master` without a tag never hits the registry.

CI authenticates with npm trusted publishing. GitHub secrets do not hold an npm token. Maintainers do not publish from a laptop. npm records that GitHub Actions built the tarball. The publish workflow file is named `publish.translationtools-packages-npm.yml` so the trusted publisher can pin it. Only the Translation Tools Client and the Translation Tools CLI are published; the root workspace stays unpublished. Later releases use this same tag-and-publish path: bump both packages to one shared version, update the changelog, commit, tag `vX.Y.Z`, push the tag.

ADR-0004 already records that this client publishes only from GitHub Actions with trusted publishing. Do not add a long-lived npm token to "fix" CI. Do not publish on every push to `master`.

The publish job's tag-equals-both-versions check is a script or module the workflow runs. Tests cover a matching tag and a mismatching tag by calling that check. Do not parse workflow YAML in tests. Do not call the live npm registry or GitHub from tests.

The root README documents the release recipe a maintainer repeats: bump both package versions to the same number, update the changelog, commit, tag `vX.Y.Z`, push the tag.

## Footprint

Projects: translation-tools-client-js

- `.github/workflows/test.yml` — test suite on push and pull request to `master`; Ubuntu; Node 22
- `.github/workflows/publish.translationtools-packages-npm.yml` — tags `v*`; tests; tag-version check; publish both packages with provenance; trusted publishing (no npm token secret)
- `scripts/assert-release-tag.js` — tag without `v` equals both workspace package versions (new; the publish job runs this)
- `test/assert-release-tag.test.ts` — matching tag succeeds; mismatching tag fails (does not parse workflow YAML)
- `README.md` — maintainer release recipe
- `docs/adr/0004-trusted-publishing.md` — already the policy; touch only if a gap remains

## Acceptance criteria

- [x] A workflow runs the existing test suite on push and pull request to `master`, on Ubuntu, with Node 22.
- [x] `publish.translationtools-packages-npm.yml` runs on tags matching `v*`, on Ubuntu, with Node 22, runs the tests first, then publishes only `@mvdmio/translation-tools-client` and `@mvdmio/translation-tools-cli` with provenance and public access.
- [x] Publish authenticates with npm trusted publishing: `id-token` is available to the job; no npm token is stored in GitHub secrets.
- [x] When the tag without `v` equals both package versions, the tag check succeeds; when it does not, the check fails and publish does not run.
- [x] Tests cover that matching and mismatching tag check without parsing workflow YAML and without calling npm or GitHub.
- [x] Pushing `master` without a tag does not publish (test workflow has no publish job; publish workflow is tag-only).
- [x] Root README documents: bump both versions together, update the changelog, commit, tag `vX.Y.Z`, push the tag.
- [x] ADR-0004 still says publish is only from GitHub Actions with trusted publishing.
- [x] The whole suite stays green, including step 01's packed-consumer coverage.

## Outcome

`.github/workflows/test.yml` runs `npm ci` + `npm test` on push and pull_request to `master` (Ubuntu, Node 22). `.github/workflows/publish.translationtools-packages-npm.yml` is tag-only (`v*`), sets `permissions.id-token: write` (no npm token secret), upgrades npm to `^11.5.1` for trusted publishing, runs tests, then `node scripts/assert-release-tag.js "${{ github.ref_name }}"`, then `npm publish -w` each of `@mvdmio/translation-tools-client` and `@mvdmio/translation-tools-cli` with `--access public --provenance`. `scripts/assert-release-tag.js` exports `assertReleaseTag(tag, { root })` for tests and, as CLI, takes argv or `GITHUB_REF_NAME`. `test/assert-release-tag.test.ts` covers match, mismatch, and split package versions against temp workspace roots (no workflow YAML parsing). Root README documents the bump/changelog/commit/tag/push recipe. ADR-0004 needed no edit. Footprint matched; suite 64/64 green. `CHANGELOG.md` still untouched (Step 01 deviation) — Step 03 must land `## 0.1.0` before live publish.
