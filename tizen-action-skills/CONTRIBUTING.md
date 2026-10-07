# Contributing to tizen-action-skills

The repository-wide rules are in the root [CONTRIBUTING.md](../CONTRIBUTING.md);
this file adds what is specific to this plugin.

## Keep the skill in sync with the framework

The skill documents the Tizen Action Framework (`platform/core/appfw/tizen-action`)
and the action toolchain (`tools/action-toolchain` in `platform/core/appfw/tidl`).
When either changes a rule the skill states — schema fields, generated
signatures, metadata keys, `action.seq` handling, request routing — update the
references and say in the commit message which framework/toolchain revision the
change was checked against.

- Prefer pointing at the framework guide and samples over copying them; copied
  material goes stale.
- Never ship counts or lists that the catalogue changes (number of actions,
  methods of a category). Scripts read them live from `$ACTIONC_DATA_DIR`.
- Keep `SKILL.md` short: routing, the workflow and the rules that are not
  discoverable from generated code. Details belong in `references/`.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) with the
`tizen-action-skills` scope, for example
`fix(tizen-action-skills): ...`. Sign off every commit (`git commit -s`).

## Tests

Run both scaffold tests against a protocol 3 toolchain and the matching
`default-actions` before sending a change that touches `scripts/` or
`assets/` (see [README.md](README.md#tests)). Without the toolchain they only
print `SKIP`, so a CI pass alone does not prove a script change.

## Versioning and releases

`package.json`, `common/.claude-plugin/plugin.json` and this plugin's entry in
the root `.claude-plugin/marketplace.json` carry the same version. Record
changes under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md); a release moves
them under a version heading and is tagged `tizen-action-skills-vX.Y.Z`.
