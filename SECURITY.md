# Security Policy

## Reporting a vulnerability

Please **do not** report security vulnerabilities through public GitHub issues, pull requests
or discussions.

Instead, report them privately through one of these channels:

1. **GitHub private vulnerability reporting** — use *Report a vulnerability* on the
   [Security tab](https://github.com/Samsung/tizen-agent-skills/security) of this repository
   (preferred).
2. **E-mail** — <!-- TODO(open-source release): add the team security contact address -->
   `security-contact@example.com`.

Include as much of the following as you can:

- The project directory affected (for example `tizen-sdk-skills`) and its version
- The harness in use (Claude Code, Cline, Codex CLI, Gemini CLI, tizen-cli, VS Code extension)
- Steps to reproduce, or a proof-of-concept prompt / command
- The impact you believe the issue has (for example: arbitrary command execution on the host,
  deletion outside the project directory, credential exposure)

Please redact internal hostnames, private IP addresses, personal paths and credentials from
any logs you attach.

## What to expect

- We will acknowledge your report within **5 business days**.
- We will keep you informed of the progress towards a fix and may ask for additional
  information.
- Once a fix is available we will publish a release and credit you in the release notes
  unless you prefer to stay anonymous.

## Scope

The skills, agents, hooks, CLI runners, scripts and extensions in this repository run **on the
developer's machine** with the developer's privileges and can invoke the Tizen SDK tools
(`tizen`, `sdb`, `em-cli`, ...). Reports about the following are in scope:

- Guard-rule or hook bypasses that allow destructive actions the design forbids
  (for example deleting a directory that is not a Tizen project)
- Command-injection or path-traversal through user-supplied arguments
- Exposure of secrets (certificate passwords, tokens) in envelopes, logs or files

Vulnerabilities in the Tizen SDK itself, in the AI hosts, or in third-party dependencies
should be reported to their respective maintainers.

## Supported versions

Only the latest release of each project receives security fixes.
