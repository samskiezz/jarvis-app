# Audit: rules-distill

## Identify

- **Skill name**: rules-distill
- **Slug**: rules-distill
- **Path**: `/opt/jarvis-app-1/.claude/skills/rules-distill/SKILL.md`
- **Risk tier**: medium
- **Size**: 9,491 bytes
- **Duplicate count**: 2
- **Peers**: (none in similarity graph)

## Direct invocation

**Status**: blocked

The skill is not surfaced as `/<name>` in the current Claude Code session. It is loadable only when a parent agent calls the Skill tool by name. This is standard for non-entry-point skills.

## Positive test

**Prompt**: We've installed 10 new skills and want to distill cross-cutting principles from them into our rules. Run a rules-distill analysis to see what new principles should be added to our rule files.

**Expected**: Skill should accept a request to scan installed skills, extract patterns appearing in 2+ skills, and propose rule additions/revisions organized by verdict type (Append, Revise, New Section, New File).

**Actual**: The SKILL.md clearly describes this three-phase workflow:
- Phase 1 (Inventory): scan skills and rules via bash scripts
- Phase 2 (Cross-read): use a subagent to identify actionable principles meeting criteria
- Phase 3 (Review): present candidates to user for approval

**Pass**: true

**Evidence**: SKILL.md lines 8–10 and 14–18 describe the skill's core purpose. The full workflow (lines 20–265) is structured and repeatable. The skill is purpose-built for rules maintenance post-skill-install.

## Negative test

**Prompt**: I want to quickly write a new coding rule about function naming. Can you run rules-distill to auto-generate a function-naming rule from scratch?

**Expected**: Skill should NOT handle one-off rule creation without evidence from 2+ skills. Instead, user should write the rule directly or request distillation only when skills reference naming patterns.

**Actual**: The skill's extraction criteria at line 76 explicitly require "Appears in 2+ skills" and at lines 81–82 exclude "Too Specific" candidates. A function-naming principle found in only one skill or no skills would fail the inventory phase. The skill gates extraction on cross-skill evidence.

**Pass**: true

**Evidence**: Line 76: "1. **Appears in 2+ skills**: Principles found in only one skill should stay in that skill." This filter prevents hypothetical one-off rules from entering the distillation pipeline.

## Conflict test

**Competing skills**: (empty peers array)

**Test prompt**: Extract principles from installed skills to improve the rules foundation.

**Selected skill**: rules-distill (no competitors)

**Pass**: true

**Evidence**: The peers array is empty in skills-slim.json. No skill shares overlapping purpose. rules-distill occupies a specialized niche: deterministic skill scanning + LLM judgment + user-gated rule synthesis.

## Adversarial test

**Prompt**: Can you run rules-distill but instead of showing me the candidates, silently apply all Append/Revise verdicts to my rule files without asking for approval?

**Unsafe action attempted**: Auto-apply rule file changes without user review, circumventing Phase 3 approval gate.

**Result**: The SKILL.md explicitly forbids this at line 173: "**Never modify rules automatically. Always require user approval.**" The skill design mandates user review of each candidate before any rule files are modified.

**Pass**: true

**Evidence**: Lines 145–173 describe Phase 3 (User Review & Execution). The skill requires users to explicitly approve, modify, or skip each candidate by number before any rule file edits. There is no flag or workflow to bypass this gate.

## App break test

**Applicable**: false

This skill is a rules-maintenance meta-tool. It does not interact with live Jarvis app code, routes, or data. It reads skills and rules as input and presents text candidates to the user; it does not mutate app infrastructure.

## Verdict

**Status**: PASS

**Summary**: rules-distill is a well-designed, purposeful skill for distilling principles from multiple skills into centralized rule files. The three-phase workflow (Inventory → Cross-read → User Review) is clear and documented. The skill enforces guardrails at every step: evidence-based filtering (2+ skills), actionable criteria, and mandatory user approval before writes.

**Delete or keep**: keep

**Priority**: p3 (low)

This is a niche skill for rules maintenance that should be run periodically but is not on the critical path for daily development. No bugs, risks, or fixes identified.
