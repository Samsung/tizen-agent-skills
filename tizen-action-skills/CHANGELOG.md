# Changelog

All notable changes to **tizen-action-skills** are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning](https://semver.org/).

Releases are tagged `tizen-action-skills-vX.Y.Z` on the
[tizen-agent-skills](https://github.com/Samsung/tizen-agent-skills) repository.

## [Unreleased]

## [1.0.0]

### Added

- `tizen-action-skill`, ported from `docs/skills/tizen-action-skill` in
  `platform/core/appfw/tizen-action` (review.tizen.org change 352673): routes a
  provider task through category selection, `actionc` stub generation,
  implementation in C#, C++, JavaScript or Flutter-Tizen/Dart, provider
  metadata registration and on-device verification with `action-tool`.
- Coverage of tizen-action 1.8 and the 3.1 action toolchain: subscription
  actions (`eventSchema`), `requiresConfirmation`, `consent`,
  `providerPrivilegeLevel`, sized integer formats, `required`/`oneOf`/`base`
  (TIDL protocol 3 optional, variant and box types), per-language handling of
  optional out-parameters, `;`-separated metadata values, and request routing
  to registered providers (`params.appid`, `action-tool default-app`).
- `check_toolchain_env.sh`/`.ps1` run `actionc` on a throwaway action to catch
  a pre-protocol-3 toolchain and mixed toolchain releases.
- `scaffold_custom_action.sh` regenerates the whole custom category in method-id
  order and warns when a new action renumbers existing methods.
