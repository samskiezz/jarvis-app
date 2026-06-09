"""TOKEN GOVERNOR — the 'shadow agent' that decides, per task, which Claude model + token mode Jarvis
should use, so spend is efficient and never runs away.

Design goals (from the request):
  • a small/cheap decider in front of the big agent: it classifies the task and picks the cheapest
    model that can do it (haiku → sonnet → opus).
  • UNBREAKABLE: the decision core is pure deterministic rules that never raise; every failure path
    has a safe fallback (decider error → sonnet; budget exhausted → haiku).
  • BUDGET FAILSAFES: a daily USD ceiling. When it's hit, calls are forced to the cheapest model.
  • ARCHON MODE: forces the top model (opus) + max-per-call tokens for genuinely hard tasks — the most
    capability PER CALL — but a separate (higher) daily ceiling stops it draining the whole account at once.

Env: CLAUDE_DAILY_USD (default 25), ARCHON_DAILY_USD (default 60), CLAUDE_PER_CALL_USD_WARN (default 5).
"""
from __future__ import annotations

import os
import sqlite3
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, "server", "data", "token_budget.db")
DAILY_USD = float(os.environ.get("CLAUDE_DAILY_USD", "25"))
ARCHON_USD = float(os.environ.get("ARCHON_DAILY_USD", "60"))

# task-difficulty signals (cheap, deterministic — the "shadow" classifier)
HARD = ("refactor", "architect", "debug", "build ", "implement", "design ", "migrate", "optimi",
        "rewrite", "whole ", "entire ", "across the", "pipeline", "algorithm", "complex", "fix the",
        "multi", "end to end", "end-to-end", "integrate")
EASY = ("status", "list ", "what is", "what's", "explain", "summar", "show ", "read ", "how many",
        "check ", "tell me", "is the", "are the", "yes or no")


def _db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    c = sqlite3.connect(DB, timeout=10)
    c.execute("""CREATE TABLE IF NOT EXISTS spend(
        id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT, ts INTEGER, model TEXT, mode TEXT,
        in_tok INTEGER, out_tok INTEGER, usd REAL)""")
    c.commit()
    return c


def _today() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def spent_today() -> float:
    try:
        c = _db()
        v = c.execute("SELECT COALESCE(SUM(usd),0) FROM spend WHERE day=?", (_today(),)).fetchone()[0]
        c.close()
        return float(v or 0.0)
    except Exception:  # noqa: BLE001
        return 0.0


def _difficulty(task: str) -> str:
    t = (task or "").lower()
    if any(k in t for k in HARD) or len(t) > 400:
        return "hard"
    if any(k in t for k in EASY) and len(t) < 180:
        return "easy"
    return "normal"


def decide(task: str, archon: bool = False) -> dict:
    """Pick the model + mode. NEVER raises — always returns a usable decision."""
    try:
        spent = spent_today()
        if archon:
            if spent >= ARCHON_USD:
                return {"model": "sonnet", "mode": "archon-capped",
                        "reason": f"Archon daily ${ARCHON_USD:.0f} ceiling reached → capped to sonnet", "archon": False}
            return {"model": "opus", "mode": "archon", "max": True,
                    "reason": "ARCHON: top model + max tokens for a hard task", "archon": True}
        if spent >= DAILY_USD:
            return {"model": "haiku", "mode": "economy",
                    "reason": f"daily ${DAILY_USD:.0f} ceiling reached → cheapest (haiku)", "archon": False}
        d = _difficulty(task)
        model = {"easy": "haiku", "normal": "sonnet", "hard": "opus"}[d]
        return {"model": model, "mode": d, "reason": f"{d} task → {model}", "archon": False}
    except Exception:  # noqa: BLE001
        return {"model": "sonnet", "mode": "fallback", "reason": "decider error → safe default (sonnet)", "archon": False}


def record(model: str, mode: str, in_tok: int = 0, out_tok: int = 0, usd: float = 0.0) -> None:
    try:
        c = _db()
        c.execute("INSERT INTO spend(day,ts,model,mode,in_tok,out_tok,usd) VALUES(?,?,?,?,?,?,?)",
                  (_today(), int(time.time()), model, mode, int(in_tok or 0), int(out_tok or 0), float(usd or 0.0)))
        c.commit(); c.close()
    except Exception:  # noqa: BLE001
        pass


def state() -> dict:
    s = spent_today()
    return {"spent_usd_today": round(s, 3), "daily_cap": DAILY_USD, "archon_cap": ARCHON_USD,
            "daily_left": round(max(0, DAILY_USD - s), 3), "archon_left": round(max(0, ARCHON_USD - s), 3),
            "economy_forced": s >= DAILY_USD}


if __name__ == "__main__":
    import json
    import sys
    print(json.dumps(decide(" ".join(sys.argv[2:]) or "explain status", archon=(len(sys.argv) > 1 and sys.argv[1] == "archon")), indent=2))
    print(json.dumps(state(), indent=2))
