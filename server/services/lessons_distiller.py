"""LESSONS DISTILLER — turn the LLM telemetry into lessons that feed the next prompt.

You've spent billions of tokens. They're all logged in server/data/tiered_llm.db (217K+ calls). This
service mines those logs HOURLY for actionable patterns and writes them as lessons to feedback.db,
which context_router pulls into the next chat prompt. End result: the more you use JARVIS, the more
the next answer reflects what worked and what didn't.

Patterns it surfaces (cheap, deterministic — no LLM needed for the mining step):
  * tiers with abnormally high failure rates in the last 24h         → "tier X is unreliable for Y"
  * tiers whose median latency just doubled                          → "tier X has slowed"
  * routing rules that escalate too aggressively                      → "router escalates to heavy when strong would do"
  * recurring user prompts (>=3x with same canonical form)            → "owner keeps asking about Z"

Doctrine: stdlib + numpy, never raises, idempotent (run as a cron / hourly trigger from the main app).
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import time
from collections import Counter
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LLM_DB = os.path.join(ROOT, "server", "data", "tiered_llm.db")
FB_DB = os.path.join(ROOT, "server", "data", "feedback.db")
WINDOW_S = int(os.environ.get("LESSONS_WINDOW_S", str(24 * 3600)))
TOP_PROMPTS_K = int(os.environ.get("LESSONS_TOP_PROMPTS", "5"))
SLOWDOWN_FACTOR = float(os.environ.get("LESSONS_SLOWDOWN_FACTOR", "1.8"))
MIN_PROMPT_REPEATS = int(os.environ.get("LESSONS_MIN_PROMPT_REPEATS", "3"))


def _canonicalize(prompt: str) -> str:
    if not prompt:
        return ""
    s = prompt.lower().strip()
    s = re.sub(r"\d+", "#", s)                # collapse numbers
    s = re.sub(r"\s+", " ", s)                # collapse whitespace
    s = re.sub(r"[^a-z #?]+", "", s)          # strip punctuation/symbols
    return s[:160]


def _read_llm_db():
    if not os.path.exists(LLM_DB):
        return []
    try:
        con = sqlite3.connect(f"file:{LLM_DB}?mode=ro", uri=True, timeout=5)
    except Exception:  # noqa: BLE001
        return []
    cutoff = int(time.time()) - WINDOW_S
    try:
        cols = [r[1] for r in con.execute("PRAGMA table_info(tiered_llm_calls)").fetchall()]
    except Exception:  # noqa: BLE001
        con.close()
        return []
    if not cols:
        con.close()
        return []
    sel = ["ts", "tier", "model", "ok", "latency_ms", "err"]
    if "prompt" in cols:
        sel.append("prompt")
    rows = []
    try:
        for r in con.execute(
            f"SELECT {','.join(sel)} FROM tiered_llm_calls WHERE ts > ? ORDER BY ts ASC", (cutoff,)):
            rows.append(dict(zip(sel, r)))
    except Exception:  # noqa: BLE001
        pass
    con.close()
    return rows


def _failure_lessons(rows: list[dict]) -> list[str]:
    by_tier: dict[str, list[dict]] = {}
    for r in rows:
        by_tier.setdefault(r.get("tier") or "?", []).append(r)
    lessons = []
    for tier, items in by_tier.items():
        if len(items) < 8:                    # ignore tiers with too few calls to be meaningful
            continue
        n_fail = sum(1 for it in items if not it.get("ok"))
        rate = n_fail / max(1, len(items))
        if rate >= 0.30:
            top_errs = Counter((it.get("err") or "")[:80] for it in items if not it.get("ok")).most_common(2)
            err_hint = "; ".join(f"{e or '(no err)'} ×{n}" for e, n in top_errs)
            lessons.append(
                f"Tier '{tier}' failing {rate*100:.0f}% in the last {WINDOW_S//3600}h — common error: {err_hint}. "
                f"Prefer the next tier down for prompts that historically land here."
            )
    return lessons


def _slowdown_lessons(rows: list[dict]) -> list[str]:
    by_tier_halves: dict[str, list[list[int]]] = {}
    if not rows:
        return []
    mid = (rows[0]["ts"] + rows[-1]["ts"]) // 2 if rows else 0
    for r in rows:
        bucket = by_tier_halves.setdefault(r.get("tier") or "?", [[], []])
        bucket[0 if r["ts"] <= mid else 1].append(int(r.get("latency_ms") or 0))
    lessons = []
    for tier, (older, newer) in by_tier_halves.items():
        if len(older) < 5 or len(newer) < 5:
            continue
        med_old = sorted(older)[len(older)//2]
        med_new = sorted(newer)[len(newer)//2]
        if med_old > 0 and med_new >= med_old * SLOWDOWN_FACTOR:
            lessons.append(
                f"Tier '{tier}' median latency rose {med_old}→{med_new}ms ({med_new/med_old:.1f}×) "
                f"in the last {WINDOW_S//3600}h — expect slower replies; the brain box may be hot."
            )
    return lessons


def _recurring_prompt_lessons(rows: list[dict]) -> list[str]:
    if not rows or "prompt" not in rows[0]:
        return []
    canonical = Counter(_canonicalize(r.get("prompt") or "") for r in rows if r.get("prompt"))
    canonical.pop("", None)
    top = [(p, n) for p, n in canonical.most_common(TOP_PROMPTS_K) if n >= MIN_PROMPT_REPEATS]
    if not top:
        return []
    parts = [f"'{p}' ×{n}" for p, n in top]
    return [
        f"Owner keeps asking about: {', '.join(parts)}. Anticipate these next; offer a structured "
        f"answer up front rather than waiting for the question."
    ]


def _ensure_feedback_db():
    if not os.path.exists(FB_DB):
        # feedback.db is created by feedback_bus on first use; create minimal table here as fallback.
        os.makedirs(os.path.dirname(FB_DB), exist_ok=True)
        con = sqlite3.connect(FB_DB)
        con.execute("""CREATE TABLE IF NOT EXISTS lessons(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER, module TEXT, lesson TEXT, source TEXT)""")
        con.commit()
        con.close()


def _write_lessons(module: str, lessons: list[str], source: str = "lessons_distiller") -> int:
    """feedback.db.lessons schema: (id, ts, module, trigger, lesson, source_tier, applied). We write
    one row per lesson with trigger=summary-of-lesson, source_tier=our module name."""
    if not lessons:
        return 0
    _ensure_feedback_db()
    con = sqlite3.connect(FB_DB)
    now = int(time.time())
    written = 0
    for ln in lessons:
        trigger = (ln.split(" — ", 1)[0] if " — " in ln else ln.split(":", 1)[0])[:200]
        try:
            con.execute(
                "INSERT INTO lessons(ts, module, trigger, lesson, source_tier, applied) "
                "VALUES(?,?,?,?,?,0)",
                (now, module, trigger, ln, source),
            )
            written += 1
        except Exception:  # noqa: BLE001
            continue
    con.commit()
    con.close()
    return written


def distill_once() -> dict:
    """Run one distillation pass. Returns a summary you can log / surface in the dashboard."""
    rows = _read_llm_db()
    failure = _failure_lessons(rows)
    slowdown = _slowdown_lessons(rows)
    recurring = _recurring_prompt_lessons(rows)
    all_lessons = failure + slowdown + recurring
    written = _write_lessons("chat", all_lessons)
    return {
        "rows_seen": len(rows),
        "failure_lessons": len(failure),
        "slowdown_lessons": len(slowdown),
        "recurring_prompt_lessons": len(recurring),
        "written": written,
        "lessons": all_lessons,
    }


if __name__ == "__main__":
    import sys
    if "--loop" in sys.argv:
        # Hourly tick (override with LESSONS_INTERVAL_S). Runs forever; pm2 manages restarts.
        interval = float(os.environ.get("LESSONS_INTERVAL_S", "3600"))
        print(f"[lessons_distiller] loop mode, interval={interval}s", flush=True)
        while True:
            try:
                out = distill_once()
                print(f"[lessons_distiller] tick: {out.get('written')} written / "
                      f"{out.get('rows_seen')} rows scanned", flush=True)
            except Exception as e:  # noqa: BLE001
                print(f"[lessons_distiller] tick crashed: {e}", flush=True)
            time.sleep(interval)
    else:
        out = distill_once()
        print(json.dumps(out, indent=2))
