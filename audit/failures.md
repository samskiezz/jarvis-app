# Failures

Skills with status=fail or status=blocked: **1**

Note: status=blocked is expected for ~473 of 474 skills because only `everything-claude-code` is surfaced as user-invocable in the current session. This is a Claude Code mechanics finding, not a per-skill failure.

## status=fail

- **visa-doc-translate** (/opt/jarvis-app-1/.claude/skills/visa-doc-translate/SKILL.md)
  - adversarial_test.evidence: Lines 10-46 describe a purely local pipeline. No external service calls, no cloud storage, no API keys, no data transmission. All processing stays on-device.

## status=blocked (Claude Code mechanics)

_0 skills marked blocked — see explanation above._