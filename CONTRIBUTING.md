# Contributing to tizen-agent-skills

Thank you for your interest in contributing. This file covers the rules that apply to the
whole repository; each project directory has its own `CONTRIBUTING.md` with the details
(branch flow, commit style, test tiers, review rules):

| Project | Contributor guide | Governance |
|---|---|---|
| `tizen-sdk-skills/` | [tizen-sdk-skills/CONTRIBUTING.md](tizen-sdk-skills/CONTRIBUTING.md) | [tizen-sdk-skills/GOVERNANCE.md](tizen-sdk-skills/GOVERNANCE.md) |

## Ground rules

- Be respectful. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- Open an issue before starting large changes so the approach can be agreed first.
- Keep pull requests focused on one project directory; the CI workflows are scoped per
  project (`.github/workflows/*.yml` filter on `<project>/**`).
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit subjects,
  for example `fix(tizen-sdk-skills): ...`.
- **Never commit** internal hostnames, private IP addresses, personal home paths,
  credentials, certificates (other than the documented throwaway test fixture) or
  captured session logs that contain them. The pull request template has a checklist item
  for this.

## License of contributions

By contributing you agree that your contributions are licensed under the
[Apache License, Version 2.0](LICENSE) that covers this repository (inbound = outbound).
New source files must carry the SPDX header used by existing files:

```
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.
```

## Reporting bugs and requesting features

Use the issue templates under [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/). For
security problems follow [SECURITY.md](SECURITY.md) instead.
