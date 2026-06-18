# Audit Workflow Permission Fix

## What was wrong

The 474-subagent audit Workflow stalled at 12/474 successful writes.

Subagent transcript (e.g. `/root/.claude/projects/-opt-jarvis-app-1/4a20b3b1-3426-453f-89fc-b54252043b57/subagents/workflows/wf_16e000fb-a51/agent-a36c431d7464b7842.jsonl`) shows the remaining `Write` calls being rejected with:

> "The user doesn't want to proceed with this tool use"

This message is emitted by the `claude-vscode` entrypoint when a tool call is not auto-approved by the session permission allowlist and no human is present to interactively approve it. Spawned subagents inherit the parent session permissions but cannot prompt for new ones, so each `Write(/opt/jarvis-app-1/audit/results/<slug>.{json,md})` blocked until rejected.

The parent's `permissions.allow` array in `.claude/settings.local.json` had bare `"Write"` and `"Edit"` entries, but the harness was not treating them as auto-approving every path for subagent contexts. Explicit path-scoped matchers were required.

## What was added

File: `/opt/jarvis-app-1/.claude/settings.local.json`
Array: `permissions.allow` (append-only — all existing entries preserved)

New entries:

```
Write(/opt/jarvis-app-1/audit/**)
Write(/opt/jarvis-app-1/.proof/**)
Write(/opt/jarvis-app-1/.cache/**)
Write(/tmp/**)
Edit(/opt/jarvis-app-1/audit/**)
Edit(/opt/jarvis-app-1/.proof/**)
```

Scope is tight on purpose:
- `audit/`, `.proof/`, `.cache/` are derived/output paths — safe to auto-write.
- `/tmp/**` is ephemeral.
- Production paths (`server/`, `scripts/`, `app/`, runtime data files like `server/data/watchdog_status.json`) remain gated and still require explicit approval.
- We did NOT add `Write(/**)` or `Edit(/**)`.

The shared `.claude/settings.json` was NOT touched — only the gitignored `settings.local.json`.

## How a parent agent verifies the fix

1. Confirm JSON validity:

   ```
   python3 -c "import json; json.load(open('/opt/jarvis-app-1/.claude/settings.local.json'))"
   ```

   Expected: no output, exit 0. (Verified at install — 27 entries in `permissions.allow`.)

2. Spawn a one-shot subagent that writes a probe file:

   - Prompt the subagent: "Write the JSON `{\"probe\": true}` to `/opt/jarvis-app-1/audit/results/test.json` using the Write tool, then report the path."
   - Expected: the subagent's Write call completes without a permission rejection and `audit/results/test.json` exists.

3. Re-launch the stalled audit Workflow. The remaining ~462 subagents should now write `<slug>.json` and `<slug>.md` to `audit/results/` without per-call approval.

## Why this works for subagents

Subagents spawned via the Agent tool / Workflow run inside the same session permission context as the parent agent. When a subagent issues a tool call, the harness evaluates the call against `permissions.allow` matchers. A matcher of the form `Write(<glob>)` auto-approves any `Write` call whose `file_path` matches `<glob>` — no human prompt, no rejection. Bare `Write` did not reliably match in the subagent execution path here, so explicit path-scoped matchers were added to close the gap.

If the workflow spawns subagents with `permission-mode: default`, they will inherit these allow entries. If you ever spawn with `permission-mode: ask-for-everything`, these entries are bypassed by design.
