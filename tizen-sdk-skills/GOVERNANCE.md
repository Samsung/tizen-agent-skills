# tizen-sdk-skills Governance

English | [한국어](GOVERNANCE.ko.md)

How the `tizen-sdk-skills` project is organised, who decides what, and how
changes are reviewed. Last amended: 2026-09-09.

## 1. Project

### 1.1 Overview

tizen-sdk-skills is a Tizen SDK automation plugin for AI coding assistants —
Claude Code, Cline, Codex CLI, Gemini CLI — and for the tizen-cli plugin host,
with a VS Code extension that installs and syncs it. It automates SDK
installation, project creation, building, emulator and device management, app
installation, remote debugging (GDB / netcoredbg / CDP), certificate management,
and Playwright testing, and returns every result as a Standard JSON Envelope.

The repository is developed in the open on GitHub
(`Samsung/tizen-agent-skills`, directory `tizen-sdk-skills/`) and is
licensed under Apache License 2.0 (see 2.1.4). Architecture and layout are
documented in the README — see
[Repository Structure](README.md#repository-structure) and
[Harness Separation Principle](README.md#harness-separation-principle); this
document does not repeat them.

### 1.1.1 Steering body

This project does not have a separate Steering Committee. The Maintainers listed
in 2.1.1 collectively act as the steering body. Their remit is:

- the project roadmap and release cadence;
- appointing, moving and revoking Reviewers and Maintainers;
- license, policy and external-publication questions;
- resolving conflicts that cross module boundaries (2.1.3);
- amending this document (section 3).

Steering decisions are made in the open, in GitHub Issues labelled
`governance`, following the rules in 2.1.2.

### 1.1.2 Modules

A Module is a directory subtree with its own code owners. A pull request belongs
to every module whose paths it touches. Maintainers are code owners of every
module; the Reviewer column lists the additional owners.

| Module                          | Paths                                                                                                                                   | Maintainers                               | Reviewers                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------ |
| common (single source of truth) | `common/`, `scripts/`                                                                                                                   | Maintainers (see 2.1.1 roster)            | Reviewers (see 2.1.1 roster)                |
| tizen-cli                       | `tizen-cli/`                                                                                                                            | Maintainers (see 2.1.1 roster)            | Reviewers (see 2.1.1 roster)                |
| vscode                          | `vscode/`                                                                                                                               | Maintainers (see 2.1.1 roster)            | @\<reviewer-3\>                             |
| harness wrappers                | `claude/`, `cline/`, `codex/`, `gemini/`                                                                                                | Maintainers (see 2.1.1 roster)            | Reviewers (see 2.1.1 roster)                |
| tests & docs                    | `tests/`, `docs/`, `usage/`, root `*.md`                                                                                                | Maintainers (see 2.1.1 roster)            | Reviewers (see 2.1.1 roster)                |
| repo infrastructure             | `_repo-root/` (repository-root files), root `package.json` / lockfile / lint and format configs, `.gitattributes`, `LICENSE`, `NOTICE`, `GOVERNANCE*.md`, `CONTRIBUTING*.md` | Maintainers (see 2.1.1 roster)            | —                                          |

Notes:

- `common/` is mirrored into every harness at install time, so a change there
  affects all hosts. A PR that touches `common/` **and** any other module is a
  cross-module change (2.1.3, level 3).
- `.github/CODEOWNERS` is the machine-readable copy of this table and of the
  roster in 2.1.1. The two must be changed together.
- Reviewer placement per module is the initial assignment and may be adjusted
  by the Maintainers through the amendment process in section 3.

### 1.1.3 How to build, use and get involved

- **Use** — install the plugin for your host: [Quick Start](README.md#quick-start)
  and the per-host guide
  [HARNESS_SETUP.en.md](docs/deployment/HARNESS_SETUP.en.md).
- **Build and test** — run the command block in
  [Development](README.md#development).
- **Get involved** — read [CONTRIBUTING.md](CONTRIBUTING.md) for branch flow,
  commit style, test tiers and the documentation pair rule, then open an Issue
  or a pull request.
- **Talk** — GitHub Issues and pull-request review threads in this
  repository are the only official channels. The PR review thread, and any
  Issue linked from the PR, are the written record of decisions made during
  review. Discussing in team chat is fine, but any decision reached there must
  be written back to the Issue or PR before it takes effect.

## 2. Governance and Community

### 2.1 Governance

The project follows an open-development model: anyone may read, propose,
review and contribute. Governance
rules specify decision-making (2.1.3), conflict escalation (2.1.3), positions of
responsibility (2.1.1) and how the rules themselves change (section 3). Updates
to these rules are ratified by the Maintainers.

### 2.1.1 Project Roles

The project recognises three roles. Informally the team organises itself as it
sees fit; formal rights are as follows.

**Contributor** — anyone with access to the repository. Contributors may:

- open Issues and pull requests (code, docs, tests, translations);
- comment on and review any pull request;
- start and join discussions in Issues.

Contributors are expected to abide by decisions once made (new information may
reopen them), take responsibility for defects introduced by their changes,
respect the rules of the community (2.1.2) and give constructive review.

**Reviewer** — a Contributor who is a code owner of at least one module. In
addition to Contributor rights, a Reviewer may:

- approve pull requests into `dev` for their module(s) — an approval that
  satisfies the code-owner requirement;
- approve their own contribution after another Reviewer or Maintainer has
  reviewed it;
- set short- and medium-term goals for the module together with the
  Maintainers.

Reviewers are responsible for reviewing PRs to their module within the times in
2.2.2, for the quality of the module, and for participating in release
verification when asked. Reviewers cannot merge `dev` into `main`, create
release tags, or change roles.

**Maintainer** — a Reviewer who is a code owner of every module and a member
of the steering body (1.1.1). Maintainers additionally:

- merge `dev` into `main` and create `tizen-sdk-skills-v*` release tags;
- edit `.github/CODEOWNERS`, `GOVERNANCE*.md` and repository settings;
- grant and revoke Reviewer and Maintainer roles;
- make the final call on cross-module and steering-level decisions (2.1.3).

**Roster** (source of truth; the repository-root `.github/CODEOWNERS` mirrors it)

<!-- TODO(open-source release): replace the placeholders with github.com handles. -->

| Role        | Members                                     |
| ----------- | ------------------------------------------- |
| Maintainers | @\<maintainer-1\>, @\<maintainer-2\>, @\<maintainer-3\> |
| Reviewers   | @\<reviewer-1\>, @\<reviewer-2\>, @\<reviewer-3\> |
| Emeritus    | —                                          |

**Selection**

- _Contributor → Reviewer._ A candidate has at least 10 merged, non-trivial
  pull requests in the module (non-trivial excludes formatting-only, typo-only,
  generated-file-only and version-bump changes) and has shown the review
  behaviour described in 2.2.3. Any Reviewer or Maintainer may nominate, and a
  Contributor may self-nominate with evidence, by opening an Issue labelled
  `governance`. The nomination is accepted by Lazy Consensus of the Maintainers
  (2.1.2): five business days with no reasoned objection.
- _Reviewer → Maintainer._ Sustained review activity across at least two
  modules plus unanimous agreement of the existing Maintainers, recorded in a
  `governance` Issue.

**Revocation**

- _Inactivity._ A Reviewer or Maintainer with no commits or reviews for six
  months is moved to the Emeritus line and removed from `CODEOWNERS`. Emeritus
  members are restored on request by Lazy Consensus of the Maintainers.
- _Misconduct._ Intentional abuse of review privilege or a violation of the
  [Code of Conduct](../CODE_OF_CONDUCT.md) may lead to temporary suspension or removal. The decision is made by
  all Maintainers other than the person concerned and is recorded in a
  `governance` Issue; if the Maintainers cannot agree, the role is suspended
  until they do.
- _Voluntary._ Anyone may step down by opening a PR against the roster.

### 2.1.2 Rules of Community

All members follow the rules of common sense, civility and good
neighbourliness. Frank technical discussion is encouraged; discussion of
people rather than code is not, and personal attacks are not tolerated.
Members respect and acknowledge every contribution, listen to differing
opinions, help each other across modules, and assume good faith.

**Lazy Consensus.** Contributors may proceed with work when they have reason to
believe the community agrees; they publish it quickly (as a PR) so objections
can surface. When agreement is uncertain, the change is proposed first in an
Issue labelled `proposal`. A proposal is accepted if no reasoned objection is
raised within **five business days** (three business days for technical
decisions confined to a single module). Objections must state a reason and,
where possible, an alternative.

**Silent Consent.** Those who do not offer a reasoned alternative during the
discussion period implicitly agree. In code review this means: if an
auto-requested code owner has not responded within the review window in 2.2.2,
the author may request review from any other owner of the same module or from a
Maintainer, and the silent owner's approval is no longer required.

**Meritocracy.** Responsibility follows demonstrated contribution and
dedication to a module, as described in 2.1.1 — not seniority or the
organisation chart. In consensus-building, the opinion of those most familiar
with the code carries more weight.

**Written, in the repository.** Consensus reached elsewhere (chat, meetings)
is an unapproved proposal until it is written into the relevant Issue or PR.
English and Korean are both acceptable in Issues, PRs and commit messages;
shipped documentation is published in both languages (see CONTRIBUTING.md).

### 2.1.3 Decision-making

Decisions are made at the lowest level that is applicable, always keeping the
rules of community and the project goals in mind.

1. **In the pull request** — the author and the assigned reviewer decide what
   to implement and how. Most decisions end here.
2. **Module level** — if they cannot agree, the code owners of the affected
   module decide by Lazy Consensus (three business days).
3. **Cross-module** — the following require approval from **all
   Maintainers**:
   - changes touching two or more modules, or `common/` plus any other module;
   - `common/lib/core/plugin-cache.js` (`HOST_DOT_DIRS`) and the runner-lookup
     snippets it drives;
   - the envelope contract (`common/lib/envelope/*`);
   - the plugin id, cache path, environment variable names or command names.
4. **Steering** — roadmap, releases, roles, license, external publication and
   amendments to this document are decided by the Maintainers as the steering
   body.

**Tie-break among Maintainers.** For technical disputes that reach level 3
or 4 without agreement, a one-week cooling period applies; after it, the
Maintainer with the most commits in the primarily affected module
(`git shortlog -s -- <path>`) decides. For governance, role, license and
publication decisions unanimity is required; if it is not reached, the status
quo stands.

**Releases.** After `dev` is merged into `main`, any one Maintainer may create
the `tizen-sdk-skills-vX.Y.Z` tag (the project-prefixed form is the only one the
release workflow reacts to). The release is announced in an Issue titled
`Release tizen-sdk-skills vX.Y.Z` that links the version-bump PR.

**Breaking changes** — renaming the plugin id, cache path, envelope fields or
command names — are level-3 decisions and must add a row to the README
migration table in the same PR.

### 2.1.4 Open Source License

tizen-sdk-skills is released under the terms of the
[Apache License, Version 2.0](LICENSE). All contributions are accepted under
the same license (inbound = outbound); no separate CLA or DCO sign-off is
required. New source files carry the Apache-2.0 SPDX header used by existing
files (`node scripts/add-spdx-headers.js --check` verifies this). Third-party
material redistributed with the project is listed in [NOTICE](NOTICE).

### 2.2 Code Review

#### 2.2.1 Reviewing Guidelines

Anyone may review and comment. Changes are submitted as pull requests using
the repository template, one topic per PR. Reviewer assignment is the
automatic code-owner request from `.github/CODEOWNERS`.

Required approvals before merge into `dev`:

- one approval from a code owner of every module the PR touches (a
  Maintainer's approval counts for all modules); and
- additionally a Maintainer's approval when the PR is cross-module (2.1.3,
  level 3), touches repository infrastructure, or bumps the version.

Reviewer checklist:

- Logic lives in `common/`, not in a per-harness copy (harness directories hold
  wrappers and adapters only).
- `node scripts/rewrite-runner-snippets.js --check` passes when runner-lookup
  snippets or `HOST_DOT_DIRS` change.
- The Standard JSON Envelope contract is preserved.
- Both languages of every touched document pair are updated.
- New or changed TCs keep `tests/README.md` counts correct
  (`node scripts/verify-doc-stats.mjs`) and contain no credentials — use
  `${NAME}` placeholders.
- The PR's "Testing" section names the test tiers actually run.

#### 2.2.2 Review Times

- First response to a PR: within **two business days**.
- Complete review: within **five business days**; large changes may take
  longer and the reviewer says so in the thread.
- PRs labelled `hotfix`: within **one business day**.
- Reviewers leave a PR open for at least one full business day after the
  first approval so others across time zones can comment, unless it is a
  `hotfix`.
- After the window, Silent Consent (2.1.2) applies to unresponsive owners.
- A PR with no author activity for 30 days may be closed by a Maintainer; it
  can be reopened at any time.

#### 2.2.3 Reviewing and Discussion Principles

- Discuss the code, never the author of it.
- Respect and acknowledge contributions, suggestions and comments.
- Listen and be open to different opinions; help each other.
- Every "Request changes" states a reason; non-blocking remarks are prefixed
  `nit:`.
- The author answers every review thread before requesting re-review.
- An open "Request changes" is never merged over; disagreements escalate per
  2.1.3.
- Conduct in this repository is governed by the repository
  [Code of Conduct](../CODE_OF_CONDUCT.md) (Contributor Covenant 2.1); this
  document does not restate it.

## 3. Amending this document

Changes to `GOVERNANCE.md` / `GOVERNANCE.ko.md` are made by pull request,
announced in an Issue labelled `governance`, accepted by Lazy Consensus of five
business days, and approved by all Maintainers. Both language files change in
the same PR, and `.github/CODEOWNERS` is updated whenever the roster or module
table changes.
