# 03 — First live 0.1.0 on GitHub and npm

Status: pending
Blocked by: 01, 02

## What to build

A visitor on GitHub can open the public repository `mvdmio/translation-tools-client-js` and read the root README that names both packages and their install commands. That repository is the git remote for this workspace (same shape as `translation-tools-client-dotnet` and `translation-tools-client-kmp`). The GitHub repository already exists and is private; make it public. Its default branch is `master`.

Then the first live publish, in this order:

1. This work is on `master` (package metadata, license, READMEs, version `0.1.0`, changelog, workflows).
2. Push `master` to `mvdmio/translation-tools-client-js`.
3. Stop. The maintainer adds this repository as a trusted publisher on both `@mvdmio/translation-tools-client` and `@mvdmio/translation-tools-cli`, pinning `publish.translationtools-packages-npm.yml`.
4. After that is confirmed, push tag `v0.1.0`. CI publishes both packages. People can then `npm install @mvdmio/translation-tools-client` and `npx @mvdmio/translation-tools-cli`.

Do not publish from a laptop. Do not put an npm token in GitHub secrets. Do not call the live npm registry or GitHub from tests. The whole suite stays green.

## Footprint

Projects: translation-tools-client-js

- GitHub `mvdmio/translation-tools-client-js` — public visibility, default branch `master`, remote `origin`, tag `v0.1.0`
- `README.md` — already the GitHub landing from step 01 (install commands stay accurate once the packages are on npm)

## Acceptance criteria

- [ ] `mvdmio/translation-tools-client-js` is a public GitHub repository; `origin` points at it; default branch is `master`.
- [ ] `master` on GitHub has the package metadata, license, READMEs, version `0.1.0`, changelog, and workflows from steps 01 and 02.
- [ ] After `master` is on GitHub, stop until the maintainer has added this repository as a trusted publisher on both npm packages, pinning `publish.translationtools-packages-npm.yml`.
- [ ] After that confirmation, tag `v0.1.0` is pushed and CI publishes both packages to the public npm registry at `0.1.0` with provenance.
- [ ] `npm install @mvdmio/translation-tools-client` and `npx @mvdmio/translation-tools-cli` resolve on the public registry.
- [ ] Nothing was published from a laptop and GitHub secrets do not hold an npm token.
- [ ] The whole suite is green. Tests still do not call the live npm registry or GitHub.
