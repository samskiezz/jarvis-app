"""TIERED LLM — JARVIS's staggered model ladder, with telemetry that actually records.

This is the JARVIS counterpart to the Underworld tier stack: one call site, a ladder of tiers, each
routed to the cheapest capable engine, escalating to the disposable Vast burst for the heavy tier.
EVERY call is written to `tiered_llm_calls` so "is the ladder ticking?" is answered by a SQL query,
not a claim (the lesson from the broken counter).

Ladder (all OpenAI-compatible under the hood):
  micro  → llama3.2:3b   (box)      routing / classify / JSON-repair / cheap bulk
  base   → llama3.1:8b   (box)      everyday research / enrich / chatter
  strong → qwen2.5:32b   (box)      planning, harder summaries, group reasoning
  heavy  → llama3.3:70b  (BURST)    future/manual tier only. Disabled by default while the
                                    sub-70B stack is perfected; falls back to `strong` unless
                                    LLM_ENABLE_70B=1 or ENABLE_70B_TIER=1.
  kimi   → kimi-k2.6     (Moonshot) cheap high-concurrency cloud reasoning
  openai → gpt-5.5       (OpenAI)   premium reasoning (cost-gated by the caller)
  claude → claude        (Anthropic) top-tier reasoning / orchestration

Env: OLLAMA_HOST (box), KIMI_MOONSHOT_KEY(+_MODEL)/KIMI_API_KEY+KIMI_BASE_URL, OPENAI_API_KEY,
ANTHROPIC_API_KEY. Graceful + never raises — returns {ok:False} on failure so callers don't break.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
import urllib.error
import urllib.request

from .llm_runtime import is_70b_blocked, sync_llm_slot

_DB = os.environ.get("TIERED_LLM_DB", os.path.join(os.path.dirname(__file__), "..", "data", "tiered_llm.db"))


def _box() -> str:
    ep = os.environ.get("OLLAMA_HOST", "").rstrip("/")
    return (ep + "/v1") if ep and "/v1" not in ep else (ep or "")


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _heavy_enabled() -> bool:
    return _truthy(os.environ.get("LLM_ENABLE_70B")) or _truthy(os.environ.get("ENABLE_70B_TIER"))


def _blocks_70b(model: str) -> bool:
    return is_70b_blocked(model)


def _safe_local_model(env_name: str, default: str) -> str:
    model = os.environ.get(env_name, default)
    if _blocks_70b(model):
        return default
    return model


def _tiers() -> dict:
    box = _box()
    kimi_key = os.environ.get("KIMI_MOONSHOT_KEY") or (
        os.environ.get("KIMI_API_KEY", "") if "moonshot" in os.environ.get("KIMI_BASE_URL", "") else "")
    kimi_base = "https://api.moonshot.ai/v1"
    return {
        "micro":  {"engine": "openai", "base": box, "model": "llama3.2:latest", "key": "ollama"},
        "base":   {"engine": "openai", "base": box, "model": _safe_local_model("OLLAMA_BASE_MODEL", "llama3.1:8b"), "key": "ollama"},
        "strong": {"engine": "openai", "base": box, "model": _safe_local_model("OLLAMA_STRONG_MODEL", "qwen2.5:32b"), "key": "ollama"},
        "heavy":  {"engine": "burst", "model": os.environ.get("HEAVY_MODEL", "llama3.3:70b"), "fallback": "strong"},
        "kimi":   {"engine": "openai", "base": kimi_base, "model": os.environ.get("KIMI_MOONSHOT_MODEL", "kimi-k2.6"),
                   "key": kimi_key, "reasoning": True},
        "openai": {"engine": "openai", "base": "https://api.openai.com/v1", "model": os.environ.get("OPENAI_MODEL", "gpt-5.5"),
                   "key": os.environ.get("OPENAI_API_KEY", ""), "reasoning": True},
        "claude": {"engine": "anthropic", "base": "https://api.anthropic.com/v1", "model": os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-5"),
                   "key": os.environ.get("ANTHROPIC_API_KEY", "")},
    }


def _ensure_db():
    d = os.path.dirname(os.path.abspath(_DB))
    os.makedirs(d, exist_ok=True)
    c = sqlite3.connect(_DB)
    c.execute("""CREATE TABLE IF NOT EXISTS tiered_llm_calls(
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, tier TEXT, model TEXT, engine TEXT,
        ok INTEGER, latency_ms INTEGER, prompt_tokens INTEGER, completion_tokens INTEGER, err TEXT)""")
    c.commit()
    return c


def _record(tier, model, engine, ok, latency_ms, usage, err=""):
    try:
        c = _ensure_db()
        c.execute("INSERT INTO tiered_llm_calls(ts,tier,model,engine,ok,latency_ms,prompt_tokens,completion_tokens,err) "
                  "VALUES(?,?,?,?,?,?,?,?,?)",
                  (int(time.time()), tier, model, engine, 1 if ok else 0, latency_ms,
                   (usage or {}).get("prompt_tokens", 0), (usage or {}).get("completion_tokens", 0), err[:200]))
        c.commit(); c.close()
    except Exception:  # noqa: BLE001
        pass


def _post(url, payload, headers, timeout=15):   # LIFELINE: never let a dead GPU box hang chat for minutes — fail fast → next tier/fallback
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def _call_openai_compat(cfg, system, prompt, max_tokens, fmt, temperature=None):
    msgs = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}]
    payload = {"model": cfg["model"], "messages": msgs, "stream": False}
    if cfg.get("reasoning"):
        payload["max_completion_tokens"] = max(max_tokens, 2000)
    else:
        payload["max_tokens"] = max_tokens
        payload["temperature"] = 0.3 if temperature is None else float(temperature)
    if fmt == "json" and not cfg.get("reasoning"):
        payload["response_format"] = {"type": "json_object"}
    provider = "ollama" if cfg.get("key") == "ollama" else cfg.get("engine", "openai")
    with sync_llm_slot(provider=provider, base_url=cfg.get("base", ""), model=cfg["model"]):
        out = _post(cfg["base"] + "/chat/completions", payload, {"Authorization": f"Bearer {cfg.get('key','')}"})
    ch = (out.get("choices") or [{}])[0]
    return ch.get("message", {}).get("content") or "", out.get("usage")


def _call_anthropic(cfg, system, prompt, max_tokens, temperature=None):
    payload = {"model": cfg["model"], "max_tokens": max_tokens,
               "messages": [{"role": "user", "content": prompt}]}
    if temperature is not None:
        payload["temperature"] = float(temperature)
    if system:
        payload["system"] = system
    out = _post(cfg["base"] + "/messages", payload,
                {"x-api-key": cfg.get("key", ""), "anthropic-version": "2023-06-01"})
    blocks = out.get("content") or []
    text = "".join(b.get("text", "") for b in blocks if isinstance(b, dict))
    return text, out.get("usage")


def complete(prompt: str, *, system: str = "", tier: str = "base", max_tokens: int = 1024,
             fmt: str | None = None, module: str = "", temperature: float | None = None) -> dict:
    """Run a completion at the given tier. Returns {ok, content, tier, model, engine, latency_ms}.
    `heavy` resolves the disposable Vast burst; with none, it falls back to `strong` (logged).
    `module` (a repo path) primes the call with that module's learned lessons and routes any failure
    back to the feedback bus — this is how the self-improving loop closes."""
    if module:
        try:
            from . import feedback_bus as _fb
            _pre = _fb.get_lessons_preamble(module)
            if _pre:
                system = (_pre + "\n" + system) if system else _pre
        except Exception:  # noqa: BLE001
            pass
    tiers = _tiers()
    cfg = tiers.get(tier) or tiers["base"]
    eng = cfg["engine"]
    model = cfg.get("model", "")
    t0 = time.time()

    # heavy → burst endpoint, else graceful fallback to strong (no 70B on the base box)
    if _blocks_70b(model) and tier != "heavy":
        fb = "strong" if tier != "strong" else "base"
        cfg = tiers[fb]; eng = cfg["engine"]; model = cfg["model"]; tier = f"{tier}(70b-blocked)→{fb}"

    if eng == "burst":
        if not _heavy_enabled():
            fb = cfg.get("fallback", "strong")
            cfg = tiers[fb]; eng = cfg["engine"]; model = cfg["model"]; tier = f"heavy(disabled)→{fb}"
        else:
            ep = None
            try:
                from . import gpu_orchestrator as gpu
                ep = gpu.resolve_endpoint_sync(tier)
            except Exception:  # noqa: BLE001
                ep = None
            if ep:
                cfg = {"engine": "openai", "base": ep.rstrip("/"), "model": model, "key": "ollama"}
                eng = "openai"
            else:
                fb = cfg.get("fallback", "strong")
                cfg = tiers[fb]; eng = cfg["engine"]; model = cfg["model"]; tier = f"heavy→{fb}"

    try:
        if eng == "openai":
            if not cfg.get("base") or not cfg.get("key"):
                raise RuntimeError(f"tier '{tier}' not configured (base/key missing)")
            content, usage = _call_openai_compat(cfg, system, prompt, max_tokens, fmt, temperature)
        elif eng == "anthropic":
            if not cfg.get("key"):
                raise RuntimeError("claude tier: ANTHROPIC_API_KEY missing")
            content, usage = _call_anthropic(cfg, system, prompt, max_tokens, temperature)
        else:
            raise RuntimeError(f"unknown engine {eng}")
        dt = int((time.time() - t0) * 1000)
        _record(tier, model, eng, True, dt, usage)
        return {"ok": True, "content": content, "tier": tier, "model": model, "engine": eng,
                "latency_ms": dt, "usage": usage}
    except Exception as e:  # noqa: BLE001
        dt = int((time.time() - t0) * 1000)
        _record(tier, model, eng, False, dt, None, str(e))
        if module:
            try:
                from . import feedback_bus as _fb
                _fb.record(module, "llm_error", f"{tier}/{model}: {str(e)[:160]}", "error")
            except Exception:  # noqa: BLE001
                pass
        return {"ok": False, "content": "", "tier": tier, "model": model, "engine": eng,
                "latency_ms": dt, "error": str(e)[:200]}


def stats() -> list[dict]:
    """The verifiable proof: per-tier call counts + last call. Run anytime."""
    try:
        c = _ensure_db()
        rows = c.execute("SELECT tier,model,engine,sum(ok),count(*),max(ts),avg(latency_ms) "
                         "FROM tiered_llm_calls GROUP BY tier,model ORDER BY count(*) DESC").fetchall()
        c.close()
        return [{"tier": r[0], "model": r[1], "engine": r[2], "ok": r[3], "calls": r[4],
                 "last_ts": r[5], "avg_ms": int(r[6] or 0)} for r in rows]
    except Exception as e:  # noqa: BLE001
        return [{"error": str(e)}]


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "stats":
        print(json.dumps(stats(), indent=2)); sys.exit(0)
    tier = sys.argv[1] if len(sys.argv) > 1 else "base"
    r = complete("In one sentence, what is a knowledge graph?", tier=tier, max_tokens=2000)
    print(json.dumps({k: (v[:120] if isinstance(v, str) else v) for k, v in r.items()}, indent=2))
