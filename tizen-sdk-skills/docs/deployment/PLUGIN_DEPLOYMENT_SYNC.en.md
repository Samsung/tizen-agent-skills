# Plugin Deployment & Sync Guide (User-level Component Deployment)

> In some environments an organization policy (`strictKnownMarketplaces: []`, pushed via
> `~/.claude/remote-settings.json`) blocks the `tizen-platform` marketplace, preventing
> the plugin from loading in any session (`claude plugin list` →
> `Marketplace 'tizen-platform' is not in the allowed marketplace list`).
> In that case, skills, agents, and hooks are deployed as **user-level components**.
> User-level components are a Claude Code built-in feature that bypasses the marketplace
> system and are unaffected by the policy.

## Three Deployment Locations (Always Keep in Sync)

| # | Location | Path | Role |
|---|---|---|---|
| ① | Repo (source of truth) | `<repo-root>/` (tizen-sdk-skills checkout) | Source of truth. All edits start here |
| ② | Plugin cache | `~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/0.1.0/` | SKILL.md references CLI runners via glob (`*/lib/cli/*.js`) at this path — **do not delete**. Will revert to plugin loading path when policy is lifted |
| ③ | Personal copies | `~/.claude/skills/<skill-name>/`, `~/.claude/agents/*.md` | **Current actual loading path** (until policy is lifted) |

Hooks have no copies: `~/.claude/settings.json`'s `hooks.PreToolUse` points **directly via absolute path** to the repo's `common/hooks/*.sh`, so editing the hook script in the repo takes effect immediately (session restart required).

## Post-Edit Sync Procedure

After editing skills/agents/lib/docs, run the following in order (Git Bash):

```bash
R="C:/path/to/tizen-sdk-skills"
C="$HOME/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/0.1.0"

# 1) Repo → Cache
cp -r "$R/common/skills/."  "$C/skills/"
cp -r "$R/common/agents/."  "$C/agents/"
cp -r "$R/common/scripts/." "$C/scripts/"
cp -r "$R/common/lib/."     "$C/lib/"
cp -r "$R/docs/." "$C/docs/"

# 2) Cache → Personal copies (current actual loading path)
cp -r "$C/skills/."     "$HOME/.claude/skills/"
cp    "$C/agents/"*.md  "$HOME/.claude/agents/"

# 3) Verify — no output means OK
diff -rq "$R/common/skills" "$C/skills"
diff -rq "$R/common/lib" "$C/lib"
for s in $(ls "$C/skills"); do diff -rq "$C/skills/$s" "$HOME/.claude/skills/$s"; done
```

> **Automation script**: The above procedure is automated by running
> `claude/setup/setup.ps1` (Windows) or
> `claude/setup/setup.sh` (Linux/macOS) — thin wrappers
> around `common/setup/setup.{ps1,sh} --harness claude`.
> The same implementation serves Cline, Codex CLI and Gemini CLI; see
> [HARNESS_SETUP.en.md](HARNESS_SETUP.en.md) for what each harness installs where.

After syncing, **restart the Claude Code session** to load new skill definitions and hooks.

## Verification (Headless Probe)

```bash
# Skill recognition — should list 9 tizen skills
claude -p "Answer with ONLY a comma-separated list of skill names containing tizen, or NONE."

# Hook activation — should show denial + correction message
claude -p "Run exactly this bash command and report the outcome: tizen list templates"

# Plugin block status
claude plugin list
```

## When Policy Is Lifted (Restore to Original)

Once the plugin loads again, personal copies will cause double-loading — **remove them**:

```bash
# Remove personal skill/agent copies (tizen-* only)
rm -rf "$HOME"/.claude/skills/tizen-*
rm -f  "$HOME"/.claude/agents/tizen-*.md
```

Then remove the 2 tizen hook entries from `~/.claude/settings.json`'s `hooks.PreToolUse`
(the plugin's `hooks/hooks.json` will take over the same hooks).

The fundamental fix is to ask the organization Claude administrator to add the
`tizen-platform` marketplace (`github.com/Samsung/tizen-agent-skills`)
to the allowlist.

## Reference: Hooks Registered in settings.json (Current State)

```json
"hooks": {
  "PreToolUse": [
    {
      "matcher": "Bash|PowerShell",
      "hooks": [{ "type": "command",
        "command": "bash \"C:/path/to/tizen-sdk-skills/common/hooks/check-tizen-commands.sh\"" }]
    },
    {
      "matcher": "Write|Bash|PowerShell",
      "hooks": [{ "type": "command",
        "command": "bash \"C:/path/to/tizen-sdk-skills/common/hooks/check-project-writes.sh\"" }]
    }
  ]
}
```
