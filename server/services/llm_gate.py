"""LLM GATE — the JARVIS permission/policy layer in front of every model call.

This is the piece NO external router (LiteLLM / RouteLLM / Not Diamond) provides — it enforces, from
config/llm_router.json:

  1. TIER 0 short-circuit — deterministic work (metrics, dedup, ingest, dashboard, glb) never reaches a model.
  2. Per-worker MAX tier — e.g. live_data can't exceed micro; dashboard can't use an LLM at all.
  3. Hard RESOURCE GATES — block LOADING a non-resident heavy model when VRAM is high; pause on CPU/disk pressure.
     (a model that's already resident is free to use — the gate is about not lighting a VRAM fire.)
  4. Cheapest-tier-first + escalate ONE tier ONLY on a real failure (never preemptively, never by percentage).

Execution is delegated to tiered_llm.complete (our OpenAI-compatible multi-provider gateway). To later
drop in a LiteLLM Proxy, only `_execute()` changes — callers and the policy stay identical.

Usage:  from .llm_gate import gated_complete
        r = gated_complete("knowledge_builder", prompt, task_type="enrich", system=..., max_tokens=400)
        # r = {"ok", "content", "tier", "reason", ...}  or  {"ok": False, "tier": "none", "reason": "tier0"}
"""
from __future__ import annotations

import json
import os
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG = os.path.join(ROOT, "config", "llm_router.json")
BOX = os.environ.get("OLLAMA_HOST", "http://211.72.13.201:41137").rstrip("/")
VRAM_TOTAL_GB = 48.0

# tier name → the model it runs (matches tiered_llm tiers)
TIER_MODEL = {"micro": "llama3.2", "base": "llama3.1:8b", "strong": "qwen2.5:32b",
              "heavy": "llama3.3:70b", "claude": "claude", "kimi": "kimi-k2.6", "openai": "gpt-5.5"}
TIER_RANK = {"none": 0, "micro": 1, "base": 2, "strong": 3, "heavy": 4, "claude": 5, "kimi": 5, "openai": 5}

_cache: dict = {}


def _cached(key, ttl, fn):
    now = time.time()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    v = fn()
    _cache[key] = (now + ttl, v)
    return v


def _policy() -> dict:
    def load():
        try:
            with open(CONFIG) as f:
                return json.load(f)
        except Exception:  # noqa: BLE001
            return {}
    return _cached("policy", 60.0, load)


def _box_state() -> dict:
    """VRAM% used + the set of currently-resident models on the box (cached 20s)."""
    def probe():
        try:
            with urllib.request.urlopen(BOX + "/api/ps", timeout=3) as r:
                d = json.loads(r.read())
            used = sum(m.get("size_vram", 0) for m in d.get("models", []))
            return {"vram_pct": used / (VRAM_TOTAL_GB * 1e9) * 100,
                    "resident": {m["name"] for m in d.get("models", [])}}
        except Exception:  # noqa: BLE001
            return {"vram_pct": 0.0, "resident": set()}
    return _cached("box", 20.0, probe)


def _cpu_pct() -> float:
    def probe():
        try:
            return round(os.getloadavg()[0] / (os.cpu_count() or 1) * 100, 1)
        except Exception:  # noqa: BLE001
            return 0.0
    return _cached("cpu", 10.0, probe)


def _resident(model: str, resident: set) -> bool:
    return any(model.split(":")[0] in r for r in resident)


def gate(worker: str, task_type: str = "enrich", want_tier: str | None = None) -> dict:
    """Resolve the tier this (worker, task) is ALLOWED to use, after policy + resource gates.
    Returns {tier, reason}. tier == 'none' means: do it deterministically, no LLM."""
    pol = _policy()
    wp = (pol.get("workers") or {}).get(worker, {})
    gates = pol.get("resource_gates") or {}

    # 1) Tier 0 short-circuit — if the worker's default is no-LLM and the task isn't flagged otherwise
    default = (wp.get("default") or "2_base").split("_")[-1]
    if default == "none" and not want_tier:
        return {"tier": "none", "reason": "tier0: worker default is deterministic"}

    # 2) start at the requested-or-default tier, cap at the worker's MAX
    tier = want_tier or default
    maxt = (wp.get("max") or "strong").split("_")[-1]
    if TIER_RANK.get(tier, 2) > TIER_RANK.get(maxt, 3):
        tier = maxt
        reason = f"capped to worker max ({maxt})"
    else:
        reason = f"policy default ({tier})"

    # 3) resource gates — only matter for LOADING a non-resident model
    box = _box_state()
    vram = box["vram_pct"]
    model = TIER_MODEL.get(tier, "")
    if tier in ("heavy",) and not _resident(model, box["resident"]) and vram >= gates.get("vram_pct_block_heavy", 85):
        tier = "strong"
        reason = f"VRAM {vram:.0f}% ≥ {gates.get('vram_pct_block_heavy',85)}% → blocked heavy load, downgraded to strong"
    if tier == "strong" and vram >= gates.get("vram_pct_pause_strong", 92) and not _resident(TIER_MODEL["strong"], box["resident"]):
        tier = "base"
        reason = f"VRAM {vram:.0f}% ≥ {gates.get('vram_pct_pause_strong',92)}% → strong not resident, downgraded to base"
    return {"tier": tier, "reason": reason, "vram_pct": round(vram, 1), "cpu_pct": _cpu_pct()}


def _route_3b(task_desc: str, lo: str = "base", hi: str = "strong") -> dict:
    """Llama 3B (micro) router: for an AMBIGUOUS task, decide lo vs hi tier. It only DECIDES, never
    completes. Returns {tier, confidence, reason}."""
    from . import tiered_llm as T
    p = (f'Reply JSON only: {{"tier":"{lo}" or "{hi}","confidence":0-1,"reason":"..."}}\n'
         f"Use '{lo}' for routine/short/factual work; '{hi}' ONLY for genuinely complex multi-step "
         f"reasoning, technical synthesis or code.\nTask: {task_desc[:400]}")
    r = T.complete(p, system="You are a routing classifier. JSON only.", tier="micro", max_tokens=120, fmt="json")
    try:
        j = json.loads((r.get("content") or "{}").strip())
        t = j.get("tier", lo)
        return {"tier": t if t in (lo, hi) else lo, "confidence": float(j.get("confidence", 0.5)),
                "reason": str(j.get("reason", ""))[:80]}
    except Exception:  # noqa: BLE001
        return {"tier": lo, "confidence": 0.0, "reason": "router parse-fail → cheapest"}


def _log_decision(d: dict) -> None:
    try:
        import sqlite3
        from . import tiered_llm as T
        c = sqlite3.connect(T._DB, timeout=8)
        c.execute("""CREATE TABLE IF NOT EXISTS llm_routing(
            id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, worker TEXT, task_type TEXT, tier TEXT,
            reason TEXT, vram_pct REAL, cpu_pct REAL, validated INTEGER, escalated TEXT, ok INTEGER)""")
        c.execute("INSERT INTO llm_routing(ts,worker,task_type,tier,reason,vram_pct,cpu_pct,validated,escalated,ok) "
                  "VALUES(?,?,?,?,?,?,?,?,?,?)",
                  (int(time.time()), d.get("worker"), d.get("task_type"), d.get("tier"),
                   (d.get("reason") or "")[:200], d.get("vram_pct"), d.get("cpu_pct"),
                   1 if d.get("validated") else 0, d.get("escalated", ""), 1 if d.get("ok") else 0))
        c.commit(); c.close()
    except Exception:  # noqa: BLE001
        pass


def gated_complete(worker: str, prompt: str, *, task_type: str = "enrich", system: str = "",
                   max_tokens: int = 512, want_tier: str | None = None, ambiguous: bool = False,
                   validator=None, escalate: bool = True) -> dict:
    """Full control-plane path: policy gate → (3B router if ambiguous) → resource gate → execute →
    validate → escalate ONE tier only on validation failure → log the decision + reason."""
    from . import tiered_llm as T
    g = gate(worker, task_type, want_tier)
    if g["tier"] == "none":
        _log_decision({"worker": worker, "task_type": task_type, "tier": "none", "reason": g["reason"], "ok": True})
        return {"ok": False, "tier": "none", "reason": g["reason"], "content": ""}

    tier, reason = g["tier"], g["reason"]
    maxt = ((_policy().get("workers") or {}).get(worker, {}).get("max") or "strong").split("_")[-1]
    if ambiguous and TIER_RANK.get(maxt, 3) >= TIER_RANK.get("strong", 3):
        rr = _route_3b(prompt)
        if rr["confidence"] >= 0.6:
            tier = gate(worker, task_type, rr["tier"])["tier"]   # re-cap by resources
            reason = f"3B-router→{tier} ({rr['confidence']:.2f}: {rr['reason']})"

    def _run(t):
        r = T.complete(prompt, system=system, tier=t, max_tokens=max_tokens)
        ok = bool(r.get("ok") and r.get("content"))
        return r, ok, (ok and (validator(r["content"]) if validator else True))

    r, ok, valid = _run(tier)
    escalated = ""
    if not valid and escalate:
        nxt = {"micro": "base", "base": "strong", "strong": "claude"}.get(tier)
        if nxt and TIER_RANK.get(nxt, 9) <= TIER_RANK.get(maxt, 3):
            r2, ok2, valid2 = _run(nxt)
            escalated = f"{tier}→{nxt} (validation failed)"
            if ok2:
                r, ok, valid, tier = r2, ok2, valid2, nxt
    r["reason"] = reason + (f" | {escalated}" if escalated else "")
    r["tier_used"] = tier
    _log_decision({"worker": worker, "task_type": task_type, "tier": tier, "reason": r["reason"],
                   "vram_pct": g.get("vram_pct"), "cpu_pct": g.get("cpu_pct"),
                   "validated": valid, "escalated": escalated, "ok": ok})
    return r


def routing_stats(limit: int = 15) -> dict:
    """Dashboard 'why did this run' view + tier distribution + blocked/escalation counts."""
    try:
        import sqlite3
        from . import tiered_llm as T
        c = sqlite3.connect(T._DB, timeout=8)
        c.execute("""CREATE TABLE IF NOT EXISTS llm_routing(
            id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, worker TEXT, task_type TEXT, tier TEXT,
            reason TEXT, vram_pct REAL, cpu_pct REAL, validated INTEGER, escalated TEXT, ok INTEGER)""")
        dist = [{"tier": t, "n": n} for t, n in c.execute(
            "SELECT tier,count(*) FROM llm_routing GROUP BY tier ORDER BY 2 DESC")]
        recent = [{"worker": w, "tier": t, "reason": rs} for w, t, rs in c.execute(
            "SELECT worker,tier,reason FROM llm_routing ORDER BY id DESC LIMIT ?", (limit,))]
        total = sum(d["n"] for d in dist) or 1
        c.close()
        return {"distribution": dist, "recent": recent, "total": total}
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:120]}


if __name__ == "__main__":
    import sys
    w = sys.argv[1] if len(sys.argv) > 1 else "knowledge_builder"
    print(json.dumps(gate(w, want_tier=sys.argv[2] if len(sys.argv) > 2 else None), indent=2, default=str))
