# translation-tools-client-js

Node.js packages published to npm that let a project use TranslationTools: local JSON resource files are the editable source, TranslationTools is the remote store, and the runtime client serves translations to application code.

## Shared rules

- Work on the repo's default branch unless a skill or the user names a branch. This overrides any default that creates branches.
- Preserve the worktree: parallel sessions share each checkout. Inspect existing changes before editing and leave them intact. When the index already holds another session's staged changes, commit with `git commit -- <your paths>`; for a file another session also edited, stage only your hunks (`git apply --cached` of your filtered diff) and run plain `git commit`.
- Search early. Quote exact errors.
- Ask when blocked, or when the design has more than one reasonable path.
- Telegraph style in replies and agent docs: drop filler and grammar.
- The main session orchestrates: unless the task is trivial, delegate exploring, implementing, testing and reviewing to subagents, at a model and effort that fit the task.
- [judgement] Prefer small diffs over broad refactors. Keep files under ~500 lines; tests may exceed it. Add an abstraction only once a second use exists. Ship no backward-compat shim unless real consumers or persisted data need one.
- Every feature and every bug fix comes with a test; a bug fix's test fails without the fix.

The glossary is `CONTEXT.md`; the decisions are in `docs/adr/`.
