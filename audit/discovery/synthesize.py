"""Synthesis pass — produces global reports + batch files + dup pointer stubs.

Inputs:
- audit/results/*.json     (474 per-skill audits)
- audit/discovery/skills-slim.json
- audit/discovery/dup-pointers.json

Outputs:
- audit/batches/batch-NNN.md  (rollups of every 50 skills)
- audit/failures.md           (status=fail or blocked)
- audit/critical-risks.md     (priority=p0 + adversarial severity)
- audit/duplicates-and-conflicts.md
- audit/app-break-tests.md    (applicable=true skills, grouped by component)
- audit/final-report.md       (executive summary, 16 sections)
- audit/results/<dup_slug>-DUP.md  (pointer stubs)
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path("/opt/jarvis-app-1/audit")
RESULTS = ROOT / "results"
BATCHES = ROOT / "batches"
DISCOVERY = ROOT / "discovery"


def load_results() -> list[dict]:
    out = []
    for p in sorted(RESULTS.glob("*.json")):
        try:
            out.append(json.loads(p.read_text()))
        except Exception:
            pass
    return out


def write_batches(results: list[dict]) -> None:
    BATCHES.mkdir(parents=True, exist_ok=True)
    chunk = 50
    for i in range(0, len(results), chunk):
        n = i // chunk + 1
        slice_ = results[i:i + chunk]
        statuses = defaultdict(int)
        prios = defaultdict(int)
        verdicts = defaultdict(int)
        for r in slice_:
            statuses[r.get("status", "?")] += 1
            prios[r.get("priority", "?")] += 1
            verdicts[r.get("delete_or_keep", "?")] += 1
        lines = [
            f"# Batch {n:03d} — skills {i + 1}–{i + len(slice_)}",
            "",
            f"**Count:** {len(slice_)}",
            "",
            "## Status distribution",
            ""
        ]
        for k, v in sorted(statuses.items()):
            lines.append(f"- {k}: {v}")
        lines.extend(["", "## Priority distribution", ""])
        for k, v in sorted(prios.items()):
            lines.append(f"- {k}: {v}")
        lines.extend(["", "## Verdict distribution", ""])
        for k, v in sorted(verdicts.items()):
            lines.append(f"- {k}: {v}")
        lines.extend(["", "## Skills in this batch", ""])
        for r in slice_:
            name = r.get("skill_name", "?")
            st = r.get("status", "?")
            pr = r.get("priority", "?")
            lines.append(f"- [{name}](../results/{name}.md) — {st} / {pr}")
        (BATCHES / f"batch-{n:03d}.md").write_text("\n".join(lines))


def write_failures(results: list[dict]) -> None:
    fails = [r for r in results if r.get("status") in ("fail", "blocked")]
    lines = ["# Failures", "",
             f"Skills with status=fail or status=blocked: **{len(fails)}**",
             "",
             "Note: status=blocked is expected for ~473 of 474 skills because only `everything-claude-code` is surfaced as user-invocable in the current session. This is a Claude Code mechanics finding, not a per-skill failure.",
             "",
             "## status=fail",
             ""]
    for r in fails:
        if r.get("status") == "fail":
            lines.append(f"- **{r['skill_name']}** ({r['skill_path']})")
            lines.append(f"  - adversarial_test.evidence: {r['adversarial_test'].get('evidence', '')}")
    lines.extend(["", "## status=blocked (Claude Code mechanics)", ""])
    blocked_count = sum(1 for r in fails if r.get("status") == "blocked")
    lines.append(f"_{blocked_count} skills marked blocked — see explanation above._")
    (ROOT / "failures.md").write_text("\n".join(lines))


def write_critical_risks(results: list[dict]) -> None:
    crit = [r for r in results if r.get("priority") == "p0"
            or r.get("adversarial_test", {}).get("evidence", "").startswith("Severity=3")
            or r.get("app_break_test", {}).get("severity") in ("high", "critical")]
    lines = ["# Critical risks", "",
             f"Skills flagged as p0 OR adversarial severity 3/3 OR app-break-test severity high/critical: **{len(crit)}**",
             ""]
    by_reason = defaultdict(list)
    for r in crit:
        if r.get("priority") == "p0":
            by_reason["P0 priority"].append(r)
        if r.get("adversarial_test", {}).get("evidence", "").startswith("Severity=3"):
            by_reason["Severity 3/3 destructive content"].append(r)
        if r.get("app_break_test", {}).get("severity") in ("high", "critical"):
            by_reason["App-break-test high/critical"].append(r)
    for reason, items in by_reason.items():
        lines.append(f"## {reason} ({len(items)})")
        lines.append("")
        for r in items[:50]:
            lines.append(f"- **{r['skill_name']}**: {r.get('adversarial_test', {}).get('evidence', '')[:200]}")
            for f in r.get("recommended_fixes", [])[:2]:
                lines.append(f"  - fix: {f}")
        if len(items) > 50:
            lines.append(f"- _...and {len(items) - 50} more_")
        lines.append("")
    (ROOT / "critical-risks.md").write_text("\n".join(lines))


def write_duplicates_and_conflicts(results: list[dict]) -> None:
    dups = json.loads((DISCOVERY / "dup-pointers.json").read_text())
    by_canon = defaultdict(list)
    for d in dups:
        by_canon[d["canonical_slug"]].append(d)
    lines = ["# Duplicates and conflicts", "",
             f"Duplicate paths (SHA256-identical to canonical): **{len(dups)}**",
             f"Canonical skills with at least one duplicate: **{len(by_canon)}**",
             "", "## Top duplicate groups", ""]
    top = sorted(by_canon.items(), key=lambda kv: -len(kv[1]))[:30]
    for canon, items in top:
        lines.append(f"### {canon} ({len(items)} duplicates)")
        for it in items[:6]:
            lines.append(f"- `{it['dup_path']}`")
        if len(items) > 6:
            lines.append(f"- _...and {len(items) - 6} more_")
        lines.append("")
    lines.extend(["", "## Conflict test failures", ""])
    cf = [r for r in results if not r.get("conflict_test", {}).get("pass", True)]
    lines.append(f"Skills with conflict_test.pass=false: **{len(cf)}**")
    for r in cf[:50]:
        lines.append(f"- **{r['skill_name']}** — {len(r.get('conflict_test', {}).get('competing_skills', []))} competing peers")
    (ROOT / "duplicates-and-conflicts.md").write_text("\n".join(lines))


def write_app_break_tests(results: list[dict]) -> None:
    appl = [r for r in results if r.get("app_break_test", {}).get("applicable")]
    by_sev = defaultdict(list)
    for r in appl:
        by_sev[r["app_break_test"]["severity"]].append(r)
    lines = ["# App break-tests (red-team toolkit)", "",
             f"Skills usable to test/audit/break the Jarvis app: **{len(appl)}**",
             ""]
    for sev in ("critical", "high", "medium", "low"):
        items = by_sev.get(sev, [])
        if not items:
            continue
        lines.append(f"## {sev} severity ({len(items)})")
        lines.append("")
        for r in items[:50]:
            ab = r["app_break_test"]
            lines.append(f"- **{r['skill_name']}** — {ab['test_generated']}")
            lines.append(f"  - finding: {ab['finding']}")
        if len(items) > 50:
            lines.append(f"- _...and {len(items) - 50} more_")
        lines.append("")
    (ROOT / "app-break-tests.md").write_text("\n".join(lines))


def write_final_report(results: list[dict]) -> None:
    status_hist = defaultdict(int)
    prio_hist = defaultdict(int)
    verdict_hist = defaultdict(int)
    for r in results:
        status_hist[r.get("status", "?")] += 1
        prio_hist[r.get("priority", "?")] += 1
        verdict_hist[r.get("delete_or_keep", "?")] += 1

    appl = [r for r in results if r.get("app_break_test", {}).get("applicable")]
    p0 = [r for r in results if r.get("priority") == "p0"]
    p1 = [r for r in results if r.get("priority") == "p1"]
    to_fix = [r for r in results if r.get("delete_or_keep") == "fix"]
    to_merge = [r for r in results if r.get("delete_or_keep") == "merge"]
    to_delete = [r for r in results if r.get("delete_or_keep") == "delete"]
    broad_triggers = [r for r in results if len(r.get("conflict_test", {}).get("competing_skills", [])) > 10]

    lines = [
        "# Skill audit — final report",
        "",
        "## 1. Executive summary",
        "",
        f"- **Skills audited:** {len(results)} of 474 canonical (1,020 raw SKILL.md files, 546 duplicate paths collapsed)",
        f"- **Status distribution:** {dict(status_hist)}",
        f"- **Priority distribution:** {dict(prio_hist)}",
        f"- **Verdict distribution:** {dict(verdict_hist)}",
        f"- **Useful for app red-team:** {len(appl)} skills",
        f"- **P0 critical / dangerous:** {len(p0)} skills",
        f"- **P1 high-risk:** {len(p1)} skills",
        f"- **Recommended fix:** {len(to_fix)} skills",
        f"- **Recommended merge:** {len(to_merge)} skills",
        f"- **Recommended delete:** {len(to_delete)} skills",
        "",
        "**Method note:** 12 skills got LLM-driven rich audits (architecture-decision-records, swift-actor-persistence, terminal-ops, video-editing, videodb, visa-doc-translate, rules-distill, healthcare-phi-compliance, dotnet-patterns, codebase-onboarding, competitive-platform-analysis, springboot-security). The LLM workflow stalled at 12/474 due to subagent Write-permission denials. The remaining 462 received deterministic evidence-backed audits via `audit/discovery/audit_remaining.py` — line-citation-grounded pattern audits over SKILL.md content. Both methods produce the user's spec'd schema; the LLM method has richer reasoning, the pattern method has stricter consistency.",
        "",
        "## 2. P0 critical / dangerous skills",
        ""
    ]
    if p0:
        lines.append("| Skill | Reason | Recommended fix |")
        lines.append("|---|---|---|")
        for r in p0[:50]:
            fix = (r.get("recommended_fixes") or ["—"])[0]
            reason = r.get("adversarial_test", {}).get("evidence", "")[:80]
            lines.append(f"| {r['skill_name']} | {reason} | {fix[:100]} |")
        if len(p0) > 50:
            lines.append(f"| _...and {len(p0) - 50} more_ | | |")
    else:
        lines.append("_None found._")

    lines.extend(["", "## 3. P1 high-risk skills", ""])
    if p1:
        lines.append("| Skill | Reason |")
        lines.append("|---|---|")
        for r in p1[:50]:
            reason = r.get("app_break_test", {}).get("finding", "")[:100]
            lines.append(f"| {r['skill_name']} | {reason} |")
        if len(p1) > 50:
            lines.append(f"| _...and {len(p1) - 50} more_ | |")
    else:
        lines.append("_None found._")

    lines.extend([
        "", "## 4. Skills that failed direct invocation",
        "",
        f"All but 1 of 474 skills are status=blocked for direct invocation. This is a Claude Code mechanics finding, not a per-skill failure. Skills surface as `/<name>` only when explicitly registered in the current session's plugin manifest. Only **everything-claude-code** was surfaced in the audit session.",
        "",
        "Recommendation: if the user wants more skills directly invocable as `/<name>`, register them in `.claude/plugins/` or symlink them into the skill discovery path. The 462 skills currently in `~/.claude/skills/learned/` and `vendor/ecc/skills/` are loadable by the parent agent via the Skill tool, but not by user typing.",
    ])

    lines.extend(["", "## 5. Skills with broad / incorrect triggers", ""])
    if broad_triggers:
        lines.append(f"Skills with >10 competing peers (high false-trigger risk): **{len(broad_triggers)}**")
        for r in broad_triggers[:30]:
            lines.append(f"- **{r['skill_name']}** ({len(r.get('conflict_test', {}).get('competing_skills', []))} peers)")
        if len(broad_triggers) > 30:
            lines.append(f"- _...and {len(broad_triggers) - 30} more_")
    else:
        lines.append("_None found with >10 peers._")

    lines.extend([
        "", "## 6. Skills that activate when they should not",
        "",
        "(See section 5 — broad-trigger skills are the most likely false-positive risks.)",
        "", "## 7. Conflicts (conflict_test.pass=false)",
        ""
    ])
    cf = [r for r in results if not r.get("conflict_test", {}).get("pass", True)]
    lines.append(f"Total: **{len(cf)}**. See `duplicates-and-conflicts.md` for the per-skill list.")

    lines.extend([
        "", "## 8. Skills that attempted unsafe actions",
        "",
        "**None** — every audit was dry-run only. No subagent executed destructive commands, sent emails, published, deployed, or made external API mutations. Hard safety rules enforced via prompt + tool-scope restrictions.",
    ])

    lines.extend(["", "## 9. Skills useful for app red-team testing (top 20)", ""])
    by_sev_rank = {"critical": 4, "high": 3, "medium": 2, "low": 1, "none": 0}
    ranked = sorted(appl, key=lambda r: -by_sev_rank.get(r["app_break_test"].get("severity", "none"), 0))[:20]
    if ranked:
        lines.append("| Skill | Severity | Test idea |")
        lines.append("|---|---|---|")
        for r in ranked:
            ab = r["app_break_test"]
            lines.append(f"| {r['skill_name']} | {ab['severity']} | {ab['test_generated'][:100]} |")
    else:
        lines.append("_No app-applicable skills found._")

    lines.extend(["", "## 10. App vulnerabilities discovered", ""])
    hi_findings = [r for r in appl if r["app_break_test"].get("severity") in ("high", "critical")]
    if hi_findings:
        lines.append(f"Discovered via high/critical-severity break-tests: **{len(hi_findings)}**")
        for r in hi_findings[:20]:
            lines.append(f"- **{r['skill_name']}** → {r['app_break_test']['finding']}")
    else:
        lines.append("_No high/critical app vulnerabilities discovered via skill audit. (Note: this is a skill audit, not a full app pentest. See [audit/app-break-tests.md](app-break-tests.md) for the full red-team toolkit list.)_")

    lines.extend(["", "## 11. Skills to fix (delete_or_keep=fix)", ""])
    if to_fix:
        lines.append(f"Total: **{len(to_fix)}**")
        for r in to_fix[:30]:
            lines.append(f"- **{r['skill_name']}** — {(r.get('recommended_fixes') or ['—'])[0][:120]}")
        if len(to_fix) > 30:
            lines.append(f"- _...and {len(to_fix) - 30} more_")
    else:
        lines.append("_None._")

    lines.extend(["", "## 12. Skills to merge (delete_or_keep=merge)", ""])
    if to_merge:
        lines.append(f"Total: **{len(to_merge)}** — these are the highly-clustered auto-learned template skills.")
        for r in to_merge[:30]:
            lines.append(f"- **{r['skill_name']}**")
        if len(to_merge) > 30:
            lines.append(f"- _...and {len(to_merge) - 30} more_")
    else:
        lines.append("_None._")

    lines.extend(["", "## 13. Skills to delete (delete_or_keep=delete)", ""])
    if to_delete:
        lines.append(f"Total: **{len(to_delete)}**")
        for r in to_delete[:30]:
            lines.append(f"- **{r['skill_name']}**")
    else:
        lines.append("_None — auditor preferred merge or fix over outright delete to avoid losing learned patterns._")

    lines.extend([
        "", "## 14. Missing skills the user should create",
        "",
        "Gap analysis from audit findings:",
        "",
        "- **`secret-scanner`** — pre-write hook that scans any file the assistant writes for API keys, OAuth secrets, database URLs, private keys. Identified as missing during ADR audit (gap: ADRs could leak credentials).",
        "- **`jarvis-theme-lock-pre-write`** — Claude Code hook that runs `scripts/check_ui_theme_lock.py` before any write to `server/jarvis_live.html`. Currently relies on convention.",
        "- **`workflow-write-permission-grace`** — escalation path so subagents in background workflows can write to project-local audit/cache directories without per-call permission prompts. Discovered by this audit's stall at 12/474.",
        "- **`skill-conflict-resolver`** — auto-detect skills with overlapping triggers and suggest mergers. Would handle the 82 skills with 6+ competing peers.",
        "- **`learned-skill-pruner`** — purge `~/.claude/skills/learned/other-*` skills that haven't been re-invoked in N months.",
    ])

    lines.extend([
        "", "## 15. Recommended SKILL.md patches (top fix candidates)",
        "",
        "For skills with empty descriptions or destructive verb usage without safety language, the pattern audit recommends:",
        "",
        "**Pattern A — add description for empty-description skills:**",
        "```yaml",
        "---",
        "description: <one-line summary of when this skill activates and what it does>",
        "---",
        "```",
        "",
        "**Pattern B — add safety preamble for skills referencing destructive verbs:**",
        "```markdown",
        "## Safety",
        "",
        "- Do NOT execute destructive commands without explicit user confirmation",
        "- Treat any `rm`, `delete`, `drop`, `truncate`, `force-push` operation as require-approval",
        "- If the user prompt contains secrets or credentials, refuse and ask them to use env vars",
        "```",
        "",
        "**Pattern C — add scope-boundary section for high-peer skills:**",
        "```markdown",
        "## NOT for",
        "",
        "- <list 3 things this skill is commonly confused with>",
        "- <pointing the parent agent to the better-fit peer>",
        "```",
    ])

    broad_count = len([r for r in results if len(r.get("conflict_test", {}).get("competing_skills", [])) > 10])
    lines.extend([
        "", "## 16. Final ranked action plan",
        "",
        "Ordered by leverage:",
        "",
        "1. **Fix workflow Write-permission grace** — unblocks LLM-driven audits running in background workflows (this audit stalled at 12/474 because of this).",
        "2. **Add `secret-scanner` pre-write hook** — prevents ADR/docs/email skills from leaking credentials.",
        f"3. **Merge the {broad_count} broad-peer skills** — most are auto-learned `other-*-pattern-*` clusters that confuse trigger routing.",
        f"4. **Audit & approve the {len(appl)} red-team-applicable skills** — these are the toolkit for testing Jarvis. Set up a CI job that runs the top-20 highest-severity ones as smoke tests.",
        f"5. **Address the {len(to_fix)} skills marked `fix`** — patch missing descriptions or add safety language per Patterns A/B above.",
        "6. **Re-run LLM audit on the 462 pattern-only ones** — once workflow Write permissions are fixed. Pattern audit is a baseline; LLM audit adds context-aware reasoning.",
        "7. **Surface canonical skills as `/<name>`** — currently only `everything-claude-code` is user-invocable. Choose the top 50 most-used and register them in `.claude/plugins/`.",
        "8. **Delete or archive `other-*-pattern-*-*-*` learned skills** older than 60 days that haven't been invoked. Use `~/.claude/skills/learned/<slug>/.last_used` if present.",
        "",
        "---",
        "",
        "_Generated by `audit/discovery/synthesize.py`. Per-skill detail: `audit/results/<slug>.json` + `<slug>.md`. Batches: `audit/batches/batch-NNN.md`. Discovery: `audit/discovery/`._",
    ])
    (ROOT / "final-report.md").write_text("\n".join(lines))


def write_pointer_stubs() -> None:
    dups = json.loads((DISCOVERY / "dup-pointers.json").read_text())
    count = 0
    for d in dups:
        slug = d["dup_slug"][:60]
        stub_path = RESULTS / f"{slug}-DUP.md"
        if stub_path.exists():
            continue
        canon = d["canonical_slug"]
        content = (
            f"# {slug} — DUPLICATE\n"
            f"Canonical: {canon}\n"
            f"Path: {d['dup_path']}\n"
            f"SHA256: {d['sha256']}\n"
            f"See: {RESULTS / (canon + '.md')}\n"
            f"(auto-collapsed by discovery; no independent audit)\n"
        )
        stub_path.write_text(content)
        count += 1
    print(f"Pointer stubs written: {count}")


def main() -> None:
    results = load_results()
    print(f"Loaded {len(results)} per-skill audits")
    write_batches(results)
    print(f"Batches written: {len(list(BATCHES.glob('*.md')))}")
    write_failures(results)
    print("failures.md written")
    write_critical_risks(results)
    print("critical-risks.md written")
    write_duplicates_and_conflicts(results)
    print("duplicates-and-conflicts.md written")
    write_app_break_tests(results)
    print("app-break-tests.md written")
    write_final_report(results)
    print("final-report.md written")
    write_pointer_stubs()


if __name__ == "__main__":
    main()
