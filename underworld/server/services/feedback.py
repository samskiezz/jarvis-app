"""THE WATCHED-SYSTEM LOOP — Kimi observes how Llama is doing, and makes it smarter.

The Claude↔Kimi↔Llama feedback loop, made mechanical (the user's keystone ask):

  LLAMA RUNS  → every llm.chat call writes UwLlmCall telemetry + auto-files UwFeedbackFinding on
                degradation (slice 1 — already live).
  KIMI OBSERVES → on a slow cadence, this module builds a digest of recent telemetry + open
                findings and asks Kimi (the cheap, separate observer brain) to diagnose: what is
                degrading, and what TERSE lesson would make the Llama tier produce better output.
  CLAUDE FIXES → issues Kimi tags as CODE problems are filed as findings flagged for Claude (the
                dev) to fix in the background; issues fixable by guidance become LESSONS.
  LLAMA IMPROVES → validated lessons are written to UwLesson, which llm.chat injects into that
                tier's system prompt on every future call. The loop closes; Llama gets smarter.

Kimi is called DIRECTLY here (not through llm.chat) so the observer never pollutes the telemetry
it observes, and never recurses. Everything is best-effort + never crashes the app.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any

from sqlalchemy import func, select

from ..config import get_settings
from ..db.models import UwFeedbackFinding, UwLesson, UwLlmCall
from ..tools import llm_pipeline as pipe

_LOOK_BACK = 200            # recent calls to summarise
_MAX_LESSONS_PER_CYCLE = 4  # don't flood Llama's prompt; a few sharp lessons per pass


def _kimi_creds() -> tuple[str, str, str]:
    s = get_settings()
    base = (s.kimi_base_url or "https://api.moonshot.ai/v1").rstrip("/")
    key = s.kimi_api_key or os.environ.get("KIMI_API_KEY", "")
    model = s.kimi_model or os.environ.get("KIMI_MODEL", "kimi-k2.6")
    return base, key, model


def _kimi_analyze(digest: dict) -> dict | None:
    """Direct Kimi call (sync; run under asyncio.to_thread). Returns the parsed diagnosis or None."""
    base, key, model = _kimi_creds()
    if not key:
        return None
    sys_msg = (
        "You are the OBSERVER in a Claude-controlled swarm watching a live LLM-driven game backend. "
        "You are given a digest of the Llama tiers' recent telemetry + open issues. Diagnose what is "
        "degrading and propose fixes. A 'lesson' is a TERSE (<160 char) instruction that will be "
        "injected into that tier's system prompt to improve its output (e.g. fix JSON formatting, "
        "stop truncating, be more concise). A 'code_issue' is a problem only a developer can fix "
        "(e.g. max_tokens too low, a tier routed to a missing model). Output ONLY JSON:\n"
        '{"summary":"one line","lessons":[{"tier":"chatter|normal_minion|high_minion|high|high_major|'
        'overmind|god_brain|*","lesson":"...","why":"..."}],"code_issues":[{"detail":"...","severity":'
        '"warn|error"}]}')
    usr = "Telemetry + open findings digest:\n" + json.dumps(digest, indent=2)[:6000]
    body = {"model": model, "temperature": 1,  # k2.x reasoning models require temperature=1
            "max_tokens": 2000,
            "messages": [{"role": "system", "content": sys_msg}, {"role": "user", "content": usr}]}
    try:
        r = urllib.request.Request(f"{base}/chat/completions", data=json.dumps(body).encode(),
                                   method="POST")
        r.add_header("Authorization", f"Bearer {key}")
        r.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(r, timeout=300) as resp:
            d = json.loads(resp.read().decode())
        txt = (d["choices"][0]["message"].get("content") or "")
        a, b = txt.find("{"), txt.rfind("}")
        return json.loads(txt[a:b + 1]) if a >= 0 and b > a else None
    except (urllib.error.URLError, KeyError, json.JSONDecodeError, IndexError):
        return None


async def _digest(s) -> dict:
    """Build the observation digest: recent telemetry stats + open findings (global, not per-world)."""
    rows = (await s.execute(
        select(UwLlmCall).order_by(UwLlmCall.created_at.desc()).limit(_LOOK_BACK))).scalars().all()
    by_tier: dict[str, dict] = {}
    for c in rows:
        t = by_tier.setdefault(c.tier, {"calls": 0, "errors": 0, "length": 0, "empty": 0,
                                        "lat_sum": 0, "model": c.model})
        t["calls"] += 1
        t["lat_sum"] += c.latency_ms or 0
        if not c.ok:
            t["errors"] += 1
        if c.finish_reason == "length":
            t["length"] += 1
        if (c.completion_tokens or 0) == 0 and c.ok:
            t["empty"] += 1
    for t in by_tier.values():
        t["avg_latency_ms"] = round(t["lat_sum"] / max(t["calls"], 1))
        t.pop("lat_sum", None)

    findings = (await s.execute(
        select(UwFeedbackFinding).where(UwFeedbackFinding.status == "open")
        .order_by(UwFeedbackFinding.created_at.desc()).limit(40))).scalars().all()
    find_counts: dict[str, int] = {}
    for f in findings:
        find_counts[f"{f.kind}:{f.tier}"] = find_counts.get(f"{f.kind}:{f.tier}", 0) + 1

    active = (await s.execute(
        select(UwLesson.tier, UwLesson.lesson).where(UwLesson.active.is_(True)))).all()
    return {"window": _LOOK_BACK, "tiers": by_tier, "open_findings": find_counts,
            "already_taught": [f"{t}: {l[:60]}" for t, l in active][:20]}


async def observe_and_improve(s) -> dict:
    """One feedback cycle: digest → Kimi diagnoses → validate → write lessons (Llama gets smarter) +
    flag code issues for Claude. Returns a summary for logging/alerting."""
    digest = await _digest(s)
    total_calls = sum(t["calls"] for t in digest["tiers"].values())
    if total_calls == 0 and not digest["open_findings"]:
        return {"skipped": "no activity yet"}

    import asyncio
    diag = await asyncio.to_thread(_kimi_analyze, digest)
    if not diag:
        return {"digest": digest, "kimi": "unavailable (no key or call failed)", "lessons_added": 0}

    # VALIDATE + write lessons (the make-Llama-smarter write-back). Dedup vs already-taught.
    taught = {(t, l) for t, l in (await s.execute(
        select(UwLesson.tier, UwLesson.lesson).where(UwLesson.active.is_(True)))).all()}
    valid_tiers = set(pipe._TIER_CLASS) | {"*"}
    added = 0
    added_detail = []
    for le in (diag.get("lessons") or [])[:_MAX_LESSONS_PER_CYCLE]:
        tier = str(le.get("tier", "*")).strip()
        lesson = str(le.get("lesson", "")).strip()
        if tier not in valid_tiers or not (5 <= len(lesson) <= 200):
            continue
        if any(tier == t and lesson[:40].lower() in l.lower() for t, l in taught):
            continue                                   # near-duplicate; skip
        lid = await pipe.add_lesson(tier=tier, lesson=lesson, source="kimi")
        if lid:
            added += 1
            added_detail.append(f"{tier}: {lesson}")
            taught.add((tier, lesson))

    # CODE issues → findings flagged for Claude (the dev) to fix in the background.
    code_issues = 0
    for ci in (diag.get("code_issues") or [])[:8]:
        detail = str(ci.get("detail", "")).strip()
        if detail:
            await pipe.note_finding(kind="claude_todo", detail=detail, severity=str(ci.get("severity", "warn")),
                                    source="kimi", payload={"from": "feedback_loop"})
            code_issues += 1

    return {"summary": diag.get("summary", ""), "lessons_added": added, "lessons": added_detail,
            "code_issues_for_claude": code_issues, "tiers_observed": list(digest["tiers"])}


def loop_disabled() -> bool:
    return os.environ.get("FEEDBACK_LOOP", "1").lower() in ("0", "false", "no")
