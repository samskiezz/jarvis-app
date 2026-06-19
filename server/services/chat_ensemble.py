"""Multi-LLM chat ensemble — draft -> critique -> fuse.

Implements the Mixture-of-Agents pattern (Together AI, ICLR 2025) on top of
the existing tiered_llm ladder:

  base + strong drafts in parallel  ->  judge picks/fuses the best  ->  return

Called from server/routes/functions.py::_sse_chat when the intent classifier
(is_hard_intent below) decides the prompt warrants ensemble cost. Cheap intents
still go through the single-shot llm_router path (preserves /chat latency
budget on small talk).

Imported by:
- server/routes/functions.py — _sse_chat hard-intent branch
"""
from __future__ import annotations

import concurrent.futures
import re
import time
from typing import Any

try:
    from . import tiered_llm
except Exception:  # noqa: BLE001
    tiered_llm = None  # type: ignore[assignment]


_HARD_KEYWORDS = re.compile(
    r"\b(analyze|architect|design|compare|explain why|debug|root cause|"
    r"plan|propose|trade.?off|optimi[sz]e|refactor|critique|evaluate|"
    r"strategy|recommend|why does|what's the best|how should|"
    r"audit|review|assess)\b",
    re.IGNORECASE,
)


def is_hard_intent(prompt: str) -> bool:
    """Return True for prompts that justify the cost of multi-LLM ensemble.
    Tuned to fire on reasoning/analysis/design prompts, not pleasantries."""
    if not prompt:
        return False
    if len(prompt) >= 220:
        return True
    if _HARD_KEYWORDS.search(prompt):
        return True
    return False


def _safe_complete(prompt: str, system: str, tier: str, max_tokens: int = 800,
                   timeout: float = 18.0) -> dict[str, Any]:
    """Single-tier draft with timeout + error capture."""
    started = time.time()
    if tiered_llm is None:
        return {"tier": tier, "text": "", "ok": False, "error": "tiered_llm unavailable",
                "elapsed_s": 0.0}
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            fut = ex.submit(tiered_llm.complete, prompt, system=system, tier=tier,
                            max_tokens=max_tokens)
            text = fut.result(timeout=timeout)
        return {"tier": tier, "text": (text or "").strip(), "ok": bool(text),
                "elapsed_s": round(time.time() - started, 2)}
    except concurrent.futures.TimeoutError:
        return {"tier": tier, "text": "", "ok": False, "error": "timeout",
                "elapsed_s": round(time.time() - started, 2)}
    except Exception as e:  # noqa: BLE001
        return {"tier": tier, "text": "", "ok": False, "error": str(e)[:200],
                "elapsed_s": round(time.time() - started, 2)}


def _judge_and_fuse(prompt: str, drafts: list[dict[str, Any]]) -> dict[str, Any]:
    """Use Claude (or strongest available) to score drafts + fuse top-2.
    Falls back to longest non-empty draft if the judge fails."""
    good = [d for d in drafts if d.get("ok") and d.get("text")]
    if not good:
        return {"text": "", "ok": False, "method": "no-good-drafts",
                "judge_tier": None}
    if len(good) == 1:
        return {"text": good[0]["text"], "ok": True, "method": "single-good",
                "judge_tier": None, "picked_from": [good[0]["tier"]]}

    rubric = (
        "You are the final judge. Below are N candidate replies to the user's question. "
        "Pick the best 2 and FUSE them into ONE final answer that:\n"
        "- Keeps each claim that the candidates agree on\n"
        "- Picks the more specific / better-grounded option when they disagree\n"
        "- Drops fluff and repetition\n"
        "- Matches the system prompt's tone\n\n"
        "Return ONLY the fused answer text, no commentary, no candidate labels, no preamble."
    )
    parts = [f"USER QUESTION:\n{prompt[:1200]}\n"]
    for i, d in enumerate(good, start=1):
        parts.append(f"\nCANDIDATE {i} (from {d['tier']}, {d['elapsed_s']}s):\n{d['text'][:2000]}")
    parts.append(f"\n\n{rubric}")
    judge_prompt = "\n".join(parts)

    for judge_tier in ("claude", "kimi", "strong"):
        res = _safe_complete(judge_prompt, system="", tier=judge_tier,
                              max_tokens=1500, timeout=22.0)
        if res["ok"] and res["text"]:
            return {"text": res["text"], "ok": True, "method": "judge-fused",
                    "judge_tier": judge_tier,
                    "picked_from": [d["tier"] for d in good]}

    best = max(good, key=lambda d: len(d["text"]))
    return {"text": best["text"], "ok": True, "method": "longest-fallback",
            "judge_tier": None, "picked_from": [best["tier"]]}


def ensemble(prompt: str, system: str = "") -> dict[str, Any]:
    """Run the MoA-style ensemble. Returns a dict with the fused reply +
    telemetry. Caller's job to stream the .text field token-by-token."""
    started = time.time()
    tiers = ("base", "strong")
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(tiers)) as ex:
        futures = {tier: ex.submit(_safe_complete, prompt, system, tier, 800, 18.0)
                   for tier in tiers}
        drafts = [futures[t].result() for t in tiers]
    fused = _judge_and_fuse(prompt, drafts)
    fused["drafts"] = drafts
    fused["total_elapsed_s"] = round(time.time() - started, 2)
    return fused
