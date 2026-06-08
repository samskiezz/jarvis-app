"""THE UNIFIED INFERENCE PIPELINE — the one seam every LLM call in the repo flows through.

llm.chat() wraps each call with this facade: route → govern → (call) → validate → observe → record.
That single attach-point is how the whole AI infrastructure stays in SYMBIOSIS with the repo:

  • OBSERVE/RECORD (Layer 13): every call writes a UwLlmCall row (tier/model/latency/finish/usage),
    and any degradation (empty content, length-truncation, LLM error) auto-files a UwFeedbackFinding.
  • LESSONS (the make-Llama-smarter write-back): lessons_for(tier) returns validated learnings that
    llm.chat injects into the system prompt — so a finding Claude fixed becomes durable guidance the
    Llama tier reads on every future call. This closes the Claude↔Kimi↔Llama loop.
  • CLASSIFY (Layer 4): classify_tier maps a tier to a job class the router/governor/Vast-burst
    orchestrator key off (micro…ultra; whether it may spill to a disposable 120B instance).

Everything here is BEST-EFFORT and never raises into the hot path — a telemetry/lesson failure must
never break inference. DB writes use their own session_scope so they don't touch the caller's txn.
"""
from __future__ import annotations

import time
from typing import Any, Optional

# tier → job class + escalation policy (Layer 4 classifier; the Vast burst layer reads `ultra`).
# `burst` means: if the local Ollama box can't serve it, the orchestrator may spin a disposable
# Vast instance for this job (e.g. the 120B tier).
_TIER_CLASS = {
    "chatter":       {"klass": "micro",    "realtime": False, "retryable": True,  "burst": False},
    "normal_minion": {"klass": "base",     "realtime": False, "retryable": True,  "burst": False},
    "high_minion":   {"klass": "strong",   "realtime": False, "retryable": True,  "burst": False},
    "standard":      {"klass": "base",     "realtime": True,  "retryable": True,  "burst": False},
    "high":          {"klass": "strong",   "realtime": False, "retryable": True,  "burst": False},
    "high_major":    {"klass": "advanced", "realtime": False, "retryable": True,  "burst": True},
    "overmind":      {"klass": "advanced", "realtime": False, "retryable": False, "burst": True},
    "god_brain":     {"klass": "ultra",    "realtime": False, "retryable": False, "burst": True},
}


def classify_tier(tier: str) -> dict[str, Any]:
    return _TIER_CLASS.get(tier, {"klass": "base", "realtime": True, "retryable": True, "burst": False})


def provider_name(base_url: str) -> str:
    b = (base_url or "").lower()
    if "moonshot" in b or "kimi" in b:
        return "kimi"
    if "groq" in b:
        return "groq"
    if "openrouter" in b:
        return "openrouter"
    if "11434" in b or "8080" in b or "ollama" in b or "211.72" in b:
        return "ollama"
    return "other"


# ── lessons: cached active lessons per tier, injected into the system prompt ──────────────
_LESSON_CACHE: dict[str, tuple[float, str]] = {}   # tier -> (expires_monotonic, text)
_LESSON_TTL = 60.0


def lessons_text(rows) -> str:
    items = [r.lesson.strip() for r in rows if (r.lesson or "").strip()]
    if not items:
        return ""
    return ("\n\nOperator lessons (apply these to improve your output):\n- "
            + "\n- ".join(items[:12]))


async def lessons_for(tier: str) -> str:
    """Active lessons for this tier (+ the '*' all-tiers lessons), TTL-cached so we don't hit the
    DB every call. Returns a string to append to the system prompt (empty when there are none)."""
    now = time.monotonic()
    hit = _LESSON_CACHE.get(tier)
    if hit and hit[0] > now:
        return hit[1]
    text = ""
    try:
        from sqlalchemy import or_, select

        from ..db.models import UwLesson
        from ..db.session import session_scope
        async with session_scope() as s:
            rows = (await s.execute(
                select(UwLesson).where(UwLesson.active.is_(True),
                                       or_(UwLesson.tier == tier, UwLesson.tier == "*"))
                .order_by(UwLesson.created_at.desc()).limit(12))).scalars().all()
        text = lessons_text(rows)
    except Exception:  # noqa: BLE001 - lessons are an enhancement; never break inference
        text = ""
    _LESSON_CACHE[tier] = (now + _LESSON_TTL, text)
    return text


def inject_lessons(messages: list[dict[str, Any]], lessons: str) -> list[dict[str, Any]]:
    """Return a copy of messages with `lessons` appended to the (first) system message — or a new
    system message prepended if there is none. Never mutates the caller's list."""
    if not lessons:
        return messages
    out = [dict(m) for m in messages]
    for m in out:
        if m.get("role") == "system":
            m["content"] = (m.get("content") or "") + lessons
            return out
    return [{"role": "system", "content": lessons.strip()}] + out


# ── observe/record: write telemetry + auto-file findings on degradation ───────────────────
def _degradation(content: str, finish_reason: Optional[str], ok: bool) -> Optional[tuple[str, str]]:
    """(kind, severity) if this call looks degraded, else None."""
    if not ok:
        return ("llm_error", "error")
    if content.startswith("// LLM error") or content.startswith("[STUB"):
        return ("llm_error", "error")
    if finish_reason == "length":
        return ("length_truncated", "warn")
    if not (content or "").strip():
        return ("empty_content", "warn")
    return None


async def record_call(*, tier: str, model: str, provider: str = "", world_id: Optional[str] = None,
                      content: str = "", finish_reason: Optional[str] = None, ok: bool = True,
                      latency_ms: int = 0, usage: Optional[dict] = None) -> None:
    """Write one UwLlmCall row + auto-file a UwFeedbackFinding on degradation. Best-effort."""
    try:
        from ..db.models import UwFeedbackFinding, UwLlmCall
        from ..db.session import session_scope
        usage = usage or {}
        async with session_scope() as s:
            s.add(UwLlmCall(world_id=world_id, tier=tier, model=model, provider=provider,
                            ok=ok, finish_reason=finish_reason, latency_ms=int(latency_ms),
                            prompt_tokens=int(usage.get("prompt_tokens", 0) or 0),
                            completion_tokens=int(usage.get("completion_tokens", 0) or 0)))
            deg = _degradation(content, finish_reason, ok)
            if deg:
                kind, severity = deg
                s.add(UwFeedbackFinding(
                    world_id=world_id, kind=kind, tier=tier, severity=severity, source="facade",
                    detail=f"{kind} on {tier}/{model} (finish={finish_reason})",
                    payload={"model": model, "provider": provider, "latency_ms": int(latency_ms)}))
    except Exception:  # noqa: BLE001 - telemetry must never break inference
        pass


async def note_finding(*, kind: str, detail: str, tier: Optional[str] = None, severity: str = "warn",
                       world_id: Optional[str] = None, source: str = "claude",
                       payload: Optional[dict] = None) -> Optional[str]:
    """File a feedback finding (used by the Kimi observer + manual reports). Returns its id."""
    try:
        from ..db.models import UwFeedbackFinding
        from ..db.session import session_scope
        async with session_scope() as s:
            f = UwFeedbackFinding(world_id=world_id, kind=kind, tier=tier, severity=severity,
                                  detail=detail, source=source, payload=payload or {})
            s.add(f)
            await s.flush()
            return f.id
    except Exception:  # noqa: BLE001
        return None


async def add_lesson(*, tier: str, lesson: str, source: str = "claude",
                     finding_id: Optional[str] = None) -> Optional[str]:
    """Write a validated lesson (the make-Llama-smarter write-back) + bust the cache. Returns id."""
    try:
        from ..db.models import UwLesson
        from ..db.session import session_scope
        async with session_scope() as s:
            le = UwLesson(tier=tier, lesson=lesson.strip(), source=source, finding_id=finding_id)
            s.add(le)
            await s.flush()
            lid = le.id
        _LESSON_CACHE.pop(tier, None)
        _LESSON_CACHE.pop("*", None)
        return lid
    except Exception:  # noqa: BLE001
        return None
