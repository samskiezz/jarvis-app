"""PanicKey — universal hybrid control, memory, optimisation, and learning layer.

This first production MVP plugs into the existing JARVIS runtime:
- captures events from tiered_llm.db, feedback.db, task_daemon, pm2, and the filesystem
- exposes live controls (modes, service actions, optimiser, debugger auto-fix)
- tracks token/cost/cache/error statistics
- records good/bad learning history from lessons and call outcomes
- runs a lightweight rule engine that can pause expensive work or block risky actions
"""
from __future__ import annotations

import glob
import json
import os
import sqlite3
import subprocess
import time
from datetime import datetime
from typing import Any

from server.services._registry import is_lifeline

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATE_PATH = os.path.join(ROOT, "server", "data", "panickey_state.json")
TL_DB = os.path.join(ROOT, "server", "data", "tiered_llm.db")
FB_DB = os.path.join(ROOT, "server", "data", "feedback.db")
BRAIN_DB = os.path.join(ROOT, "server", "data", "brain.db")


def _now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _state() -> dict[str, Any]:
    try:
        with open(STATE_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return {}


def _save_state(s: dict[str, Any]) -> None:
    try:
        os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
        with open(STATE_PATH, "w", encoding="utf-8") as f:
            json.dump(s, f, indent=2)
    except Exception:  # noqa: BLE001
        pass


def _ensure_state() -> dict[str, Any]:
    s = _state()
    s.setdefault("mode", "normal")
    s.setdefault("rules", [
        {"id": "disk_guard", "name": "Disk guard", "enabled": True,
         "condition": "disk_pct>=93", "action": "safe_mode", "description": "Enter safe mode if disk is critically full"},
        {"id": "crash_loop", "name": "Crash-loop reset", "enabled": True,
         "condition": "unstable_restarts>=5", "action": "reset_service", "description": "Reset a service that is crash-looping"},
        {"id": "token_waste", "name": "Token waste alert", "enabled": True,
         "condition": "duplicate_prompt_ratio>=0.5", "action": "alert", "description": "Alert when duplicate prompts exceed 50%"},
    ])
    s.setdefault("audit", [])
    _save_state(s)
    return s


def _audit(action: str, detail: dict[str, Any] | None = None) -> None:
    s = _ensure_state()
    s.setdefault("audit", []).append({"t": _now(), "action": action, "detail": detail or {}})
    s["audit"] = s["audit"][-500:]
    _save_state(s)


def _pm2_list() -> list[dict[str, Any]]:
    try:
        j = json.loads(subprocess.run(["pm2", "jlist"], capture_output=True, text=True, timeout=5).stdout)
        now = time.time() * 1000
        out = []
        for p in j:
            e = p.get("pm2_env", {})
            m = p.get("monit", {})
            out.append({
                "name": p.get("name"),
                "status": e.get("status"),
                "cpu": m.get("cpu"),
                "mem_mb": round((m.get("memory") or 0) / 1e6),
                "uptime_min": round((now - e.get("pm_uptime", now)) / 60000),
                "unstable_restarts": e.get("unstable_restarts") or 0,
                "restarts": e.get("restart_time") or 0,
            })
        return out
    except Exception:  # noqa: BLE001
        return []


def _disk() -> dict[str, Any]:
    try:
        st = os.statvfs(ROOT)
        total = st.f_blocks * st.f_frsize / 1e9
        used = (st.f_blocks - st.f_bavail) * st.f_frsize / 1e9
        return {"total_gb": round(total, 1), "used_gb": round(used, 1), "pct": round(used / total * 100, 1)}
    except Exception:  # noqa: BLE001
        return {}


def _call_stats(hours: int = 24) -> dict[str, Any]:
    since = int(time.time() - hours * 3600)
    out = {"total": 0, "ok": 0, "fail": 0, "prompt_tokens": 0, "completion_tokens": 0,
           "by_model": {}, "by_tier": {}, "avg_latency_ms": 0, "duplicate_prompt_ratio": 0.0}
    try:
        c = sqlite3.connect(TL_DB, timeout=4)
        rows = c.execute("SELECT tier, model, ok, latency_ms, prompt_tokens, completion_tokens FROM tiered_llm_calls WHERE ts>?", (since,)).fetchall()
        c.close()
        if not rows:
            return out
        out["total"] = len(rows)
        prompts: list[str] = []
        latencies: list[int] = []
        for tier, model, ok, lat, pt, ct in rows:
            out["ok"] += 1 if ok else 0
            out["fail"] += 0 if ok else 1
            out["prompt_tokens"] += pt or 0
            out["completion_tokens"] += ct or 0
            out["by_model"][model] = out["by_model"].get(model, 0) + 1
            out["by_tier"][tier] = out["by_tier"].get(tier, 0) + 1
            if pt:
                prompts.append(str(pt))
            if lat:
                latencies.append(lat)
        out["avg_latency_ms"] = round(sum(latencies) / len(latencies)) if latencies else 0
        if prompts:
            from collections import Counter
            cnt = Counter(prompts)
            dups = sum(v for v in cnt.values() if v > 1)
            out["duplicate_prompt_ratio"] = round(dups / len(prompts), 2)
    except Exception:  # noqa: BLE001
        pass
    return out


def _events(limit: int = 40) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    try:
        c = sqlite3.connect(FB_DB, timeout=4)
        for ts, module, kind, severity, detail in c.execute(
            "SELECT ts,module,kind,severity,detail FROM events ORDER BY ts DESC LIMIT ?", (limit,)):
            items.append({"t": ts, "source": module, "kind": kind, "severity": severity, "detail": detail})
        c.close()
    except Exception:  # noqa: BLE001
        pass
    # Mix in LLM call failures
    try:
        c = sqlite3.connect(TL_DB, timeout=4)
        for ts, tier, model, err in c.execute(
            "SELECT ts,tier,model,err FROM tiered_llm_calls WHERE ok=0 ORDER BY ts DESC LIMIT ?", (limit,)):
            items.append({"t": ts, "source": "tiered_llm", "kind": "llm_fail", "severity": "warn",
                          "detail": f"{tier}/{model}: {err or 'unknown error'}"})
        c.close()
    except Exception:  # noqa: BLE001
        pass
    items.sort(key=lambda x: x.get("t") or 0, reverse=True)
    return items[:limit]


def _calls(limit: int = 40) -> list[dict[str, Any]]:
    try:
        c = sqlite3.connect(TL_DB, timeout=4)
        rows = c.execute("SELECT ts,tier,model,engine,ok,latency_ms,prompt_tokens,completion_tokens,err FROM tiered_llm_calls ORDER BY ts DESC LIMIT ?", (limit,)).fetchall()
        c.close()
        return [{"ts": r[0], "tier": r[1], "model": r[2], "engine": r[3], "ok": bool(r[4]),
                 "latency_ms": r[5], "prompt_tokens": r[6], "completion_tokens": r[7], "err": r[8]} for r in rows]
    except Exception:  # noqa: BLE001
        return []


def _learning(limit: int = 40) -> dict[str, Any]:
    good: list[dict[str, Any]] = []
    bad: list[dict[str, Any]] = []
    try:
        c = sqlite3.connect(FB_DB, timeout=4)
        for ts, module, trigger, lesson, source_tier in c.execute(
            "SELECT ts,module,trigger,lesson,source_tier FROM lessons ORDER BY ts DESC LIMIT ?", (limit,)):
            rec = {"ts": ts, "module": module, "trigger": trigger, "lesson": lesson, "tier": source_tier}
            if "error" in (lesson or "").lower() or "fail" in (lesson or "").lower() or "waste" in (lesson or "").lower():
                bad.append(rec)
            else:
                good.append(rec)
        c.close()
    except Exception:  # noqa: BLE001
        pass
    # Build route scores from calls
    route_scores: dict[str, dict[str, Any]] = {}
    try:
        c = sqlite3.connect(TL_DB, timeout=4)
        for model, ok, pt, ct in c.execute(
            "SELECT model,ok,prompt_tokens,completion_tokens FROM tiered_llm_calls WHERE ts>?",
            (int(time.time()) - 7 * 86400,)):
            rs = route_scores.setdefault(model, {"calls": 0, "ok": 0, "tokens": 0})
            rs["calls"] += 1
            rs["ok"] += 1 if ok else 0
            rs["tokens"] += (pt or 0) + (ct or 0)
        c.close()
    except Exception:  # noqa: BLE001
        pass
    best = max(route_scores.items(), key=lambda kv: kv[1]["ok"] / max(kv[1]["calls"], 1)) if route_scores else None
    worst = min(route_scores.items(), key=lambda kv: kv[1]["ok"] / max(kv[1]["calls"], 1)) if route_scores else None
    return {"good": good, "bad": bad, "routes": route_scores,
            "best_route": best[0] if best else None, "worst_route": worst[0] if worst else None}


def _files(path: str = "", limit: int = 40) -> list[dict[str, Any]]:
    base = os.path.realpath(os.path.join(ROOT, path)) if path else ROOT
    if not base.startswith(os.path.realpath(ROOT)):
        base = ROOT
    out = []
    try:
        for root, _, files in os.walk(base):
            for fn in files[:limit * 2]:
                fp = os.path.join(root, fn)
                rel = os.path.relpath(fp, ROOT)
                try:
                    st = os.stat(fp)
                    out.append({"path": rel, "size": st.st_size, "mtime": st.st_mtime,
                                "type": os.path.splitext(fn)[1].lstrip(".").lower() or "unknown"})
                except Exception:  # noqa: BLE001
                    pass
                if len(out) >= limit:
                    break
            if len(out) >= limit:
                break
    except Exception:  # noqa: BLE001
        pass
    out.sort(key=lambda x: x.get("mtime") or 0, reverse=True)
    return out


def _jobs() -> list[dict[str, Any]]:
    try:
        from server.services import task_daemon as TD
        return TD.list_tasks()
    except Exception:  # noqa: BLE001
        return []


def _evaluate_rules() -> list[dict[str, Any]]:
    s = _ensure_state()
    rules = s.get("rules", [])
    pm2 = {p.get("name"): p for p in _pm2_list()}
    disk = _disk()
    calls = _call_stats(1)
    triggered = []
    for rule in rules:
        if not rule.get("enabled"):
            continue
        cond = rule.get("condition", "")
        try:
            if cond.startswith("disk_pct>="):
                thr = float(cond.split(">=", 1)[1])
                if (disk.get("pct") or 0) >= thr:
                    triggered.append({"rule": rule, "context": {"disk_pct": disk.get("pct")}})
            elif cond.startswith("unstable_restarts>="):
                thr = int(cond.split(">=", 1)[1])
                for name, p in pm2.items():
                    if (p.get("unstable_restarts") or 0) >= thr:
                        triggered.append({"rule": rule, "context": {"service": name, "unstable_restarts": p.get("unstable_restarts")}})
            elif cond.startswith("duplicate_prompt_ratio>="):
                thr = float(cond.split(">=", 1)[1])
                if (calls.get("duplicate_prompt_ratio") or 0) >= thr:
                    triggered.append({"rule": rule, "context": {"duplicate_prompt_ratio": calls.get("duplicate_prompt_ratio")}})
        except Exception:  # noqa: BLE001
            pass
    return triggered


def state() -> dict[str, Any]:
    s = _ensure_state()
    pm2 = _pm2_list()
    calls = _call_stats(24)
    triggered = _evaluate_rules()
    return {
        "ok": True,
        "mode": s.get("mode", "normal"),
        "health": {
            "disk": _disk(),
            "services": {"up": sum(1 for p in pm2 if p.get("status") == "online"), "total": len(pm2), "list": pm2},
            "alerts": triggered,
        },
        "stats": calls,
        "recent_events": _events(12),
    }


def set_mode(mode: str) -> dict[str, Any]:
    if mode not in ("normal", "safe", "emergency", "recovery"):
        return {"ok": False, "error": "invalid mode"}
    s = _ensure_state()
    old = s.get("mode", "normal")
    s["mode"] = mode
    _save_state(s)
    _audit("set_mode", {"old": old, "new": mode})
    # Enforce mode side effects
    if mode == "emergency":
        try:
            subprocess.run(["pm2", "stop", "jarvis-orchestrator", "jarvis-ingestor", "jarvis-worker"], capture_output=True, timeout=20)
        except Exception:  # noqa: BLE001
            pass
    if mode == "recovery":
        try:
            from server.services import system_debugger as SD
            SD.run_auto_fixes(auto_approve=True)
            from server.services import speed_optimizer as SO
            SO.run_maintenance()
        except Exception:  # noqa: BLE001
            pass
    return {"ok": True, "mode": mode}


def run_action(action: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}
    s = _ensure_state()
    mode = s.get("mode", "normal")

    if action == "set_mode":
        return set_mode(payload.get("mode", "normal"))

    if action == "run_optimizer":
        from server.services import speed_optimizer as SO
        _audit("run_optimizer", {"mode": mode})
        return SO.run_optimize({"resume": True})

    if action == "run_maintenance":
        from server.services import speed_optimizer as SO
        _audit("run_maintenance")
        return SO.run_maintenance()

    if action == "run_debugger_auto":
        from server.services import system_debugger as SD
        _audit("run_debugger_auto")
        return SD.run_auto_fixes(auto_approve=True)

    if action == "restart_service":
        name = payload.get("name", "")
        if not name.startswith("jarvis-") or is_lifeline(name):
            return {"ok": False, "error": "service not allowed"}
        _audit("restart_service", {"name": name})
        try:
            r = subprocess.run(["pm2", "restart", name], capture_output=True, text=True, timeout=20)
            return {"ok": r.returncode == 0, "output": (r.stdout + r.stderr)[-200:]}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)[:160]}

    if action == "stop_service":
        name = payload.get("name", "")
        if not name.startswith("jarvis-") or is_lifeline(name):
            return {"ok": False, "error": "service not allowed"}
        _audit("stop_service", {"name": name})
        try:
            r = subprocess.run(["pm2", "stop", name], capture_output=True, text=True, timeout=20)
            return {"ok": r.returncode == 0}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)[:160]}

    if action == "set_rule":
        rid = payload.get("id")
        for rule in s.get("rules", []):
            if rule.get("id") == rid:
                rule["enabled"] = bool(payload.get("enabled", rule.get("enabled")))
                if "condition" in payload:
                    rule["condition"] = payload["condition"]
                _save_state(s)
                _audit("set_rule", {"id": rid})
                return {"ok": True, "rule": rule}
        return {"ok": False, "error": "rule not found"}

    if action == "ingest":
        _audit("ingest_event", payload)
        return {"ok": True, "recorded": payload}

    return {"ok": False, "error": "unknown action"}


def audit_log(limit: int = 100) -> list[dict[str, Any]]:
    return _ensure_state().get("audit", [])[-limit:]


def rules() -> list[dict[str, Any]]:
    return _ensure_state().get("rules", [])


def active_snapshot() -> dict[str, Any]:
    """Return currently active work: pm2 services, recent LLM calls, task daemon jobs."""
    return {
        "ts": int(time.time()),
        "mode": _ensure_state().get("mode", "normal"),
        "services": _pm2_list(),
        "calls": _call_stats(1),
        "jobs": _jobs(),
        "events": _events(10),
    }


def snapshot(label: str | None = None) -> dict[str, Any]:
    """Capture a system snapshot and persist it."""
    s = _ensure_state()
    snaps = s.setdefault("snapshots", [])
    snap = {
        "id": f"snap-{int(time.time()*1000)}",
        "t": _now(),
        "label": label or "manual snapshot",
        "mode": s.get("mode", "normal"),
        "services": _pm2_list(),
        "disk": _disk(),
        "calls": _call_stats(24),
        "rules": [r.copy() for r in s.get("rules", [])],
    }
    snaps.append(snap)
    s["snapshots"] = snaps[-20:]
    _save_state(s)
    _audit("snapshot", {"id": snap["id"], "label": snap["label"]})
    return {"ok": True, "snapshot": snap}


def list_snapshots(limit: int = 20) -> list[dict[str, Any]]:
    return _ensure_state().get("snapshots", [])[-limit:]


def restore_snapshot(snap_id: str) -> dict[str, Any]:
    """Restore mode/rules from a snapshot. Does not restart services automatically."""
    s = _ensure_state()
    for snap in s.get("snapshots", []):
        if snap.get("id") == snap_id:
            old_mode = s.get("mode", "normal")
            s["mode"] = snap.get("mode", old_mode)
            if "rules" in snap:
                s["rules"] = [r.copy() for r in snap["rules"]]
            _save_state(s)
            _audit("restore_snapshot", {"id": snap_id, "mode": s["mode"]})
            return {"ok": True, "mode": s["mode"], "restored_from": snap_id}
    return {"ok": False, "error": "snapshot not found"}


def safe_mode() -> dict[str, Any]:
    """Enter safe mode and stop non-lifeline background work."""
    return set_mode("safe")


def guardian_tick() -> dict[str, Any]:
    """Autonomous rule enforcement — runs frequently to prevent runaway issues."""
    s = _ensure_state()
    triggered = _evaluate_rules()
    actions: list[dict[str, Any]] = []
    for t in triggered:
        rule = t.get("rule", {})
        action = rule.get("action")
        ctx = t.get("context", {})
        try:
            if action == "safe_mode" and s.get("mode") != "safe":
                set_mode("safe")
                actions.append({"rule": rule.get("id"), "action": "safe_mode", "ok": True})
            elif action == "reset_service" and ctx.get("service"):
                res = run_action("restart_service", {"name": ctx["service"]})
                actions.append({"rule": rule.get("id"), "action": "reset_service", "ok": res.get("ok"), "service": ctx["service"]})
            elif action == "alert":
                actions.append({"rule": rule.get("id"), "action": "alert", "ok": True, "context": ctx})
        except Exception as e:  # noqa: BLE001
            actions.append({"rule": rule.get("id"), "action": action, "ok": False, "error": str(e)[:200]})
    return {"ok": True, "mode": s.get("mode", "normal"), "triggered": len(triggered), "actions": actions}
