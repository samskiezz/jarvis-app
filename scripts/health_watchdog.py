"""Generic health watchdog — one process, many probes, single status file.

Owner asked: "I must be missing thousands of watchdogs for this whole repo".
Building thousands of separate pm2 services is wrong; building one
config-driven watchdog and pointing it at every critical surface is right.

How it works
------------
- Probes are defined in PROBES below. Each is a dict with kind, target,
  expect, timeout_s, interval_s, severity (P0|P1|P2), and a fix_hint.
- Every interval_s the watchdog runs the probe, records pass/fail, writes
  server/data/health.json with the consolidated state.
- On state change (pass<->fail) it appends to vast_events.jsonl so the UI /
  orchestrator can react.
- Auto-recovery is DEFAULT OFF for the same reasons brain_watchdog is —
  destructive actions need explicit owner authorization.

Seed probes (the P0/P1 gaps from the watchdog audit)
----------------------------------------------------
Backend health, dashboard health, Ollama local reachable, claude_code_runs
API, underworld.db integrity, watchdog_status freshness, claude_runs dir
writable, disk free, brain_health freshness, vast_kill_switch alive,
voice_history size, auto_improve recency. Add more by appending to PROBES.
"""
from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = "/opt/jarvis-app-1"
DATA = os.path.join(ROOT, "server", "data")
HEALTH_PATH = os.path.join(DATA, "health.json")
LOG_PATH = os.path.join(DATA, "health_watchdog.log")
EVENTS_PATH = os.path.join(DATA, "vast_events.jsonl")
ALLOW_RECOVER = os.environ.get("HEALTH_WATCHDOG_ALLOW_RECOVER", "") in ("1", "true", "yes")

PROBES: list[dict] = [
    {"name": "backend_health", "kind": "http", "target": "http://127.0.0.1:8001/health",
     "expect": ">=200", "timeout_s": 8, "interval_s": 60, "severity": "P0",
     "fix_hint": "pm2 restart jarvis-backend; check pm2 logs for crash"},

    {"name": "dashboard_health", "kind": "http", "target": "http://127.0.0.1:8095/health",
     "expect": ">=200", "timeout_s": 6, "interval_s": 60, "severity": "P0",
     "fix_hint": "pm2 restart jarvis-dashboard"},

    {"name": "underworld_backend", "kind": "http", "target": "http://127.0.0.1:8091/health",
     "expect": ">=200", "timeout_s": 6, "interval_s": 90, "severity": "P1",
     "fix_hint": "pm2 restart underworld-backend"},

    {"name": "ollama_local", "kind": "http", "target": "http://127.0.0.1:11434/api/tags",
     "expect": ">=200", "timeout_s": 8, "interval_s": 90, "severity": "P0",
     "fix_hint": "GPU brain box not reachable — provision a new Vast brain via the GPU mini-app"},

    {"name": "claude_code_runs_api", "kind": "http", "target": "http://127.0.0.1:8001/v1/claude_code/runs",
     "expect": ">=200", "timeout_s": 6, "interval_s": 120, "severity": "P1",
     "fix_hint": "FastAPI route or whip module broken — check pm2 logs jarvis-backend"},

    {"name": "underworld_db_integrity", "kind": "sqlite",
     "target": os.path.join(ROOT, "underworld", "underworld.db"),
     "expect": "ok", "timeout_s": 30, "interval_s": 600, "severity": "P0",
     "fix_hint": "DB integrity FAILED — stop underworld-backend, restore from latest .bak, investigate WAL"},

    {"name": "watchdog_status_file_fresh", "kind": "file_age",
     "target": os.path.join(DATA, "watchdog_status.json"),
     "expect": "<300", "timeout_s": 2, "interval_s": 120, "severity": "P1",
     "fix_hint": "Status file stale >5min — jarvis-watchdog pm2 process stalled"},

    {"name": "claude_runs_dir_writable", "kind": "file_writable",
     "target": os.path.join(DATA, "claude_runs"),
     "expect": "writable", "timeout_s": 2, "interval_s": 300, "severity": "P1",
     "fix_hint": "claude_runs/ unwritable — disk full or perm change; whip will silently lose transcripts"},

    {"name": "disk_free_above_5pct", "kind": "cmd",
     "target": "df --output=pcent " + ROOT + " | tail -1 | tr -d ' %'",
     "expect": "<95", "timeout_s": 3, "interval_s": 300, "severity": "P0",
     "fix_hint": "Disk >95% — jarvis-disk-guard cron should fire but verify"},

    {"name": "brain_health_recent", "kind": "file_age",
     "target": os.path.join(DATA, "brain_health.json"),
     "expect": "<180", "timeout_s": 2, "interval_s": 180, "severity": "P1",
     "fix_hint": "brain_health.json not refreshed in 3min — pm2 status brain-watchdog"},

    {"name": "vast_kill_switch_alive", "kind": "file_age",
     "target": os.path.join(DATA, "vast_kill_switch.log"),
     "expect": "<600", "timeout_s": 2, "interval_s": 300, "severity": "P1",
     "fix_hint": "vast-kill-switch log not updated in 10min — pm2 restart vast-kill-switch"},

    {"name": "voice_history_db_size_under_1gb", "kind": "file_size",
     "target": os.path.join(DATA, "voice_history.db"),
     "expect": "<1073741824", "timeout_s": 2, "interval_s": 3600, "severity": "P2",
     "fix_hint": "voice_history.db >1GB — add pruning to TTS/STT writers"},

    {"name": "auto_improve_log_recent", "kind": "file_age",
     "target": os.path.join(DATA, "auto_improve.log.jsonl"),
     "expect": "<86400", "timeout_s": 2, "interval_s": 3600, "severity": "P2",
     "fix_hint": "auto_improve hasn't run in 24h — check cron + scripts/auto_improve.py"},
]

_STATE: dict = {}


def _log(msg: str):
    line = "[%s] %s\n" % (time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), msg)
    sys.stdout.write(line); sys.stdout.flush()
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        pass


def _emit_event(kind: str, **rec):
    try:
        with open(EVENTS_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps({"ts": time.time(), "kind": kind, **rec}) + "\n")
    except Exception:
        pass


def _probe_http(p: dict) -> tuple[bool, str]:
    try:
        req = urllib.request.Request(p["target"], method="GET")
        with urllib.request.urlopen(req, timeout=p.get("timeout_s", 5)) as r:
            code = r.status
        exp = p.get("expect", ">=200")
        if exp.startswith(">="):
            return code >= int(exp[2:]), f"HTTP {code}"
        return code == int(exp), f"HTTP {code}"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}"
    except Exception as e:
        return False, str(e)[:120]


def _probe_sqlite(p: dict) -> tuple[bool, str]:
    path = p["target"]
    if not os.path.exists(path):
        return False, "db missing"
    try:
        c = sqlite3.connect(path, timeout=p.get("timeout_s", 30))
        try:
            r = c.execute("PRAGMA quick_check").fetchone()
        finally:
            c.close()
        return (r and str(r[0]).lower() == "ok"), f"quick_check={r[0] if r else 'null'}"
    except Exception as e:
        return False, str(e)[:120]


def _probe_file_age(p: dict) -> tuple[bool, str]:
    path = p["target"]
    if not os.path.exists(path):
        return False, "missing"
    age = time.time() - os.path.getmtime(path)
    limit = int(p["expect"].lstrip("<"))
    return age < limit, f"age={int(age)}s (limit {limit})"


def _probe_file_size(p: dict) -> tuple[bool, str]:
    path = p["target"]
    if not os.path.exists(path):
        return True, "missing (ok — nothing to bloat)"
    size = os.path.getsize(path)
    limit = int(p["expect"].lstrip("<"))
    return size < limit, f"size={size} (limit {limit})"


def _probe_file_writable(p: dict) -> tuple[bool, str]:
    path = p["target"]
    if not os.path.isdir(path):
        return False, "dir missing"
    try:
        probe = os.path.join(path, ".health_probe")
        with open(probe, "w") as f:
            f.write("ok")
        os.remove(probe)
        return True, "writable"
    except Exception as e:
        return False, str(e)[:120]


def _probe_cmd(p: dict) -> tuple[bool, str]:
    try:
        out = subprocess.check_output(p["target"], shell=True, timeout=p.get("timeout_s", 5))
        val = out.decode().strip()
        exp = p.get("expect", "")
        if exp.startswith("<"):
            return int(float(val)) < int(exp[1:]), f"val={val}"
        if exp.startswith(">"):
            return int(float(val)) > int(exp[1:]), f"val={val}"
        return val == exp, f"val={val}"
    except Exception as e:
        return False, str(e)[:120]


def _run_probe(p: dict) -> dict:
    fn = {"http": _probe_http, "sqlite": _probe_sqlite, "file_age": _probe_file_age,
          "file_size": _probe_file_size, "file_writable": _probe_file_writable,
          "cmd": _probe_cmd}.get(p["kind"])
    if not fn:
        return {"ok": False, "detail": f"unknown kind {p['kind']}"}
    try:
        ok, detail = fn(p)
    except Exception as e:
        ok, detail = False, str(e)[:120]
    return {"ok": ok, "detail": detail}


def _write_health(snapshot: dict):
    snapshot["updated_at"] = time.time()
    try:
        with open(HEALTH_PATH, "w", encoding="utf-8") as f:
            json.dump(snapshot, f)
    except Exception:
        pass


def loop():
    _log(f"started; {len(PROBES)} probes; recover_enabled={ALLOW_RECOVER}")
    while True:
        now = time.time()
        snapshot = {"probes": [], "p0_failing": 0, "p1_failing": 0, "p2_failing": 0,
                    "overall_ok": True, "last_failures": []}
        for p in PROBES:
            st = _STATE.setdefault(p["name"], {"last_run_ts": 0, "last_result": None, "consecutive_fails": 0})
            if now - st["last_run_ts"] < p.get("interval_s", 60):
                if st["last_result"]:
                    snapshot["probes"].append({"name": p["name"], "severity": p["severity"], **st["last_result"]})
                    if not st["last_result"]["ok"]:
                        snapshot[f"{p['severity'].lower()}_failing"] += 1
                        snapshot["last_failures"].append({"name": p["name"], "severity": p["severity"],
                                                          "detail": st["last_result"]["detail"],
                                                          "fix": p.get("fix_hint", "")})
                continue
            res = _run_probe(p)
            st["last_run_ts"] = now
            prev_ok = st["last_result"]["ok"] if st["last_result"] else None
            st["last_result"] = res
            st["consecutive_fails"] = 0 if res["ok"] else st["consecutive_fails"] + 1
            if prev_ok is not None and prev_ok != res["ok"]:
                _emit_event("health_state_change", probe=p["name"], severity=p["severity"],
                            ok=res["ok"], detail=res["detail"])
                _log(f"{p['name']} {'OK' if res['ok'] else 'FAIL'} ({p['severity']}) — {res['detail']}")
            snapshot["probes"].append({"name": p["name"], "severity": p["severity"], **res})
            if not res["ok"]:
                snapshot[f"{p['severity'].lower()}_failing"] += 1
                snapshot["last_failures"].append({"name": p["name"], "severity": p["severity"],
                                                  "detail": res["detail"], "fix": p.get("fix_hint", "")})
        snapshot["overall_ok"] = snapshot["p0_failing"] == 0
        _write_health(snapshot)
        time.sleep(10)


def one_shot():
    """Run every probe once and print the report — used for smoke tests + cron."""
    rep = {"probes": [], "p0_failing": 0, "p1_failing": 0, "p2_failing": 0}
    for p in PROBES:
        res = _run_probe(p)
        rep["probes"].append({"name": p["name"], "severity": p["severity"], "kind": p["kind"],
                              "target": str(p["target"])[:80], **res, "fix": p.get("fix_hint", "")})
        if not res["ok"]:
            rep[f"{p['severity'].lower()}_failing"] += 1
    rep["overall_ok"] = rep["p0_failing"] == 0
    _write_health(rep)
    print(json.dumps(rep, indent=2))


if __name__ == "__main__":
    if "--once" in sys.argv:
        one_shot()
    else:
        loop()
