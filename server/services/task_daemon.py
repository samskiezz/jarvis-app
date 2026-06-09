"""TASK DAEMON — runs tracked jobs that NEVER time out when you step away.

Built with accessibility in mind: launch a task by voice or click, then leave (toilet, a break, lie
down, lose your connection) and come back — it is STILL running, with a live % + elapsed time, and the
UI announces (aloud, for blind users) when it finishes.

How it survives you leaving (the "daemon + zombie" robustness the request asked for):
  • each task is launched in its OWN detached session (start_new_session=True / setsid) so a browser
    close, terminal hangup (SIGHUP) or dropped connection can NOT kill it.
  • this daemon supervises the tasks by PID, updates % + status in a sqlite store, and on each tick
    os.waitpid()-reaps any finished children so none linger as ZOMBIE processes.
  • if this daemon itself restarts, running tasks are re-attached from the store by PID (they kept
    running, orphaned to init) — progress tracking resumes, nothing is lost.

Run:  cd /opt/jarvis-app-1 && .venv/bin/python -m server.services.task_daemon
"""
from __future__ import annotations

import json
import os
import signal
import sqlite3
import subprocess
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.environ.get("TASKS_DB", os.path.join(ROOT, "server", "data", "tasks.db"))
PY = os.path.join(ROOT, ".venv", "bin", "python")

# whitelist of safe, useful jobs — name → (friendly label, argv, est_seconds). Only these can be launched
# from the UI (no arbitrary shell), so voice/click task-running is safe.
SAFE: dict = {
    "snapshot":  ("💾 Backup snapshot (brain DBs)", ["bash", os.path.join(ROOT, "scripts", "snapshot.sh"), "db"], 180),
    "correlate": ("🔗 Cross-correlation pass", [PY, "-m", "server.services.correlator", "once"], 90),
    "live_data": ("🌍 Pull live measurements", [PY, "-m", "server.services.live_data", "once"], 130),
    "live_docs": ("📰 Ingest fresh documents", [PY, "-m", "server.services.live_docs", "once"], 90),
    "graph":     ("🕸 Rebuild knowledge-graph snapshot", [PY, "-c",
                  "import sys;sys.path.insert(0,'.');from server.services import correlator as C;c=C._conn();C._ensure(c);print(C.link_topics(c))"], 60),
}


CLAUDE = os.environ.get("CLAUDE_BIN", "/root/.local/bin/claude")


def _db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    c = sqlite3.connect(DB, timeout=15)
    c.execute("""CREATE TABLE IF NOT EXISTS tasks(
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, label TEXT, status TEXT, pct INTEGER,
        pid INTEGER, started_ts INTEGER, updated_ts INTEGER, finished_ts INTEGER, est INTEGER, outfile TEXT)""")
    try:
        c.execute("ALTER TABLE tasks ADD COLUMN outfile TEXT")
    except Exception:  # noqa: BLE001
        pass
    c.commit()
    return c


def ask_claude(prompt: str, full: bool = True, archon: bool = False) -> dict:
    """DIRECT ACCESS TO CLAUDE CODE — run the request headless (`claude -p`) as a no-timeout task. Full
    power by default (a voice user needs it to actually do the work). The Token Governor (shadow agent)
    picks the cheapest capable model; Archon mode forces the top model + max tokens for hard tasks."""
    prompt = (prompt or "").strip()
    if not prompt:
        return {"ok": False, "error": "empty prompt"}
    try:
        from . import token_governor as TG
        dec = TG.decide(prompt, archon)
        model = dec["model"]
        outfile = f"/tmp/jarvis_claude_{int(time.time() * 1000)}.out"
        argv = [CLAUDE, "-p", prompt, "--model", model, "--output-format", "json"]
        if full:
            argv.append("--dangerously-skip-permissions")
        log = open(outfile, "ab", buffering=0)
        # stdin from /dev/null so `claude -p` never blocks/warns waiting on a pipe (the prompt is in -p),
        # keeping the JSON output clean for result() parsing. IS_SANDBOX=1 lets --dangerously-skip-permissions
        # run as root inside this container (the CLI otherwise refuses skip-permissions for root).
        env = {**os.environ, "IS_SANDBOX": "1"}
        p = subprocess.Popen(argv, cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log,
                             stderr=subprocess.STDOUT, start_new_session=True, env=env)
        c = _db(); now = int(time.time())
        lbl = f"🤖 Claude·{model}{' ⚡ARCHON' if dec.get('archon') else ''}: " + prompt[:38]
        cur = c.execute("INSERT INTO tasks(name,label,status,pct,pid,started_ts,updated_ts,est,outfile) "
                        "VALUES(?,?,?,?,?,?,?,?,?)", ("claude", lbl, "running", 0, p.pid, now, now, 90, outfile))
        c.commit(); tid = cur.lastrowid; c.close()
        return {"ok": True, "id": tid, "pid": p.pid, "model": model, "mode": dec["mode"], "reason": dec["reason"]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:160]}


# One-touch "Suggested Upgrade" catalog. Clicking one fires a single Claude job that BRIEFS the
# current system, RESEARCHES the best way on the web, then EXECUTES the build — hands-free, for users
# (including disabled users) who can't assemble a multi-step prompt themselves.
UPGRADES = {
    "rollback": ("One-click rollback & snapshot restore", "Instantly revert systems or data to a known-good snapshot."),
    "scheduler": ("Natural-language job scheduler", "Create recurring schedules from plain English."),
    "forecaster": ("Cost & VRAM budget forecaster", "Predict spend and VRAM, and optimise budgets."),
    "approvals": ("Approval matrix with guardrails", "Define who approves what and enforce safe boundaries."),
    "replay": ("Session replay & audit timeline", "Replay actions and review the full system history."),
}


def run_upgrade(key: str, brief: str = "", archon: bool = False) -> dict:
    title, desc = UPGRADES.get(key, (key or "upgrade", "Implement the requested upgrade."))
    prompt = (
        "You are JARVIS's autonomous build engineer with full Claude Code power on this machine "
        "(you may read/write files and run commands; the repo is /opt/jarvis-app-1). Implement this "
        "system upgrade END TO END in a single run, and SHOW each step:\n\n"
        f"UPGRADE: {title}\nGOAL: {desc}\n\n"
        "STEP 1 — BRIEF: assess the current system and state precisely what is needed and where it should live.\n"
        "STEP 2 — RESEARCH: do a small web search for the best, simplest 2026 way to build it; note the approach.\n"
        "STEP 3 — EXECUTE: implement it (write the code/files), wire it into the dashboard "
        "(server/dashboard.py + server/jarvis_live.html) where relevant, and verify it works.\n\n"
        "Keep it simple, robust and accessible (this is for disabled users). Do NOT ask questions — use sensible defaults.\n\n"
        f"CURRENT SYSTEM CONTEXT:\n{brief or '(repo /opt/jarvis-app-1; stdlib http.server dashboard at server/dashboard.py)'}"
    )
    return ask_claude(prompt, full=True, archon=archon)


def result(tid: int) -> dict:
    try:
        c = _db()
        r = c.execute("SELECT status,outfile,label FROM tasks WHERE id=?", (tid,)).fetchone()
        c.close()
        if not r:
            return {"ok": False, "error": "no such task"}
        status, outfile, label = r
        text = ""
        if outfile and os.path.exists(outfile):
            raw = open(outfile, errors="ignore").read()[-12000:]
            try:  # claude --output-format json → pull the assistant text out
                j = json.loads(raw)
                text = (j.get("result") or j.get("text") or "").strip() or raw
            except Exception:  # noqa: BLE001
                text = raw.strip()
        return {"ok": True, "status": status, "label": label, "text": text[-6000:]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:120]}


def _alive(pid: int) -> bool:
    if not pid:
        return False
    try:
        os.kill(pid, 0)
        return True
    except Exception:  # noqa: BLE001
        return False


def create(name: str, arg: str = "") -> dict:
    info = SAFE.get(name)
    if not info:
        return {"ok": False, "error": f"unknown task '{name}'"}
    label, argv, est = info
    try:
        log = open(f"/tmp/jarvis_task_{name}_{int(time.time())}.log", "ab", buffering=0)
        # start_new_session=True → detached: survives browser close / SIGHUP / dropped session
        p = subprocess.Popen(argv, cwd=ROOT, stdout=log, stderr=log, start_new_session=True)
        c = _db(); now = int(time.time())
        cur = c.execute("INSERT INTO tasks(name,label,status,pct,pid,started_ts,updated_ts,est) "
                        "VALUES(?,?,?,?,?,?,?,?)", (name, label, "running", 0, p.pid, now, now, est))
        c.commit(); tid = cur.lastrowid; c.close()
        return {"ok": True, "id": tid, "label": label, "pid": p.pid}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:160]}


def list_tasks(limit: int = 40) -> list:
    try:
        c = _db(); now = int(time.time())
        rows = c.execute("SELECT id,name,label,status,pct,started_ts,finished_ts,est FROM tasks "
                         "ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        c.close()
        out = []
        for tid, name, label, status, pct, st, fin, est in rows:
            elapsed = (fin or now) - (st or now)
            out.append({"id": tid, "name": name, "label": label, "status": status, "pct": pct or 0,
                        "elapsed": elapsed, "eta": max(0, (est or 0) - elapsed) if status == "running" else 0})
        return out
    except Exception:  # noqa: BLE001
        return []


def cancel(tid: int) -> dict:
    try:
        c = _db()
        r = c.execute("SELECT pid FROM tasks WHERE id=?", (tid,)).fetchone()
        if r and r[0]:
            try:
                os.killpg(os.getpgid(r[0]), signal.SIGTERM)
            except Exception:  # noqa: BLE001
                try:
                    os.kill(r[0], signal.SIGTERM)
                except Exception:  # noqa: BLE001
                    pass
        c.execute("UPDATE tasks SET status='cancelled',finished_ts=? WHERE id=?", (int(time.time()), tid))
        c.commit(); c.close()
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:120]}


def gen_media(kind: str, prompt: str) -> dict:
    """Launch image (gpt-image-2) or 3D-GLB (Tripo) generation as a no-timeout, pausable task."""
    prompt = (prompt or "").strip()
    if not prompt:
        return {"ok": False, "error": "empty prompt"}
    kind = "glb" if kind == "glb" else "image"
    label = ("🎨 Image: " if kind == "image" else "🧊 3D GLB: ") + prompt[:42]
    est = 60 if kind == "image" else 360
    try:
        log = open(f"/tmp/jarvis_media_{int(time.time())}.log", "ab", buffering=0)
        p = subprocess.Popen([PY, "-m", "server.services.media_gen", kind, prompt], cwd=ROOT,
                             stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        c = _db(); now = int(time.time())
        cur = c.execute("INSERT INTO tasks(name,label,status,pct,pid,started_ts,updated_ts,est) "
                        "VALUES(?,?,?,?,?,?,?,?)", ("gen_" + kind, label, "running", 0, p.pid, now, now, est))
        c.commit(); tid = cur.lastrowid; c.close()
        return {"ok": True, "id": tid, "pid": p.pid}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:160]}


def _signal_group(tid: int, sig) -> None:
    c = _db()
    r = c.execute("SELECT pid FROM tasks WHERE id=?", (tid,)).fetchone()
    c.close()
    if r and r[0]:
        try:
            os.killpg(os.getpgid(r[0]), sig)
        except Exception:  # noqa: BLE001
            try:
                os.kill(r[0], sig)
            except Exception:  # noqa: BLE001
                pass


def pause(tid: int) -> dict:
    """Real pause — SIGSTOP freezes the job (state preserved, never times out)."""
    _signal_group(tid, signal.SIGSTOP)
    c = _db(); c.execute("UPDATE tasks SET status='paused' WHERE id=?", (tid,)); c.commit(); c.close()
    return {"ok": True}


def resume(tid: int) -> dict:
    _signal_group(tid, signal.SIGCONT)
    c = _db(); c.execute("UPDATE tasks SET status='running' WHERE id=?", (tid,)); c.commit(); c.close()
    return {"ok": True}


def library(limit: int = 60) -> list:
    try:
        from . import media_gen
        return media_gen.library(limit)
    except Exception:  # noqa: BLE001
        return []


def clear_finished() -> dict:
    try:
        c = _db()
        c.execute("DELETE FROM tasks WHERE status IN ('done','failed','cancelled')")
        n = c.total_changes; c.commit(); c.close()
        return {"ok": True, "cleared": n}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:120]}


def run_forever(interval: float = 2.0) -> None:
    print("[task_daemon] supervising — tasks survive your session, never time out; zombies reaped",
          flush=True)
    while True:
        try:
            # reap finished children so none become zombies
            try:
                while True:
                    pid, _ = os.waitpid(-1, os.WNOHANG)
                    if pid == 0:
                        break
            except ChildProcessError:
                pass
            except Exception:  # noqa: BLE001
                pass
            c = _db(); now = int(time.time())
            for tid, pid, st, est, name, outfile in c.execute(
                    "SELECT id,pid,started_ts,est,name,outfile FROM tasks WHERE status='running'"):
                if _alive(pid):
                    pct = min(99, int((now - (st or now)) / max(est or 1, 1) * 100))
                    pf = f"/tmp/jarvis_task_pct_{tid}"
                    if os.path.exists(pf):
                        try:
                            pct = min(99, int(open(pf).read().strip()))
                        except Exception:  # noqa: BLE001
                            pass
                    c.execute("UPDATE tasks SET pct=?,updated_ts=? WHERE id=?", (pct, now, tid))
                else:
                    c.execute("UPDATE tasks SET status='done',pct=100,finished_ts=?,updated_ts=? WHERE id=?",
                              (now, now, tid))
                    if name == "claude" and outfile and os.path.exists(outfile):
                        try:  # record real spend from the claude json output (budget governor)
                            j = json.loads(open(outfile, errors="ignore").read())
                            from . import token_governor as TG
                            u = j.get("usage", {}) or {}
                            TG.record(j.get("model", "claude"), "task", u.get("input_tokens", 0),
                                      u.get("output_tokens", 0), j.get("total_cost_usd", 0))
                        except Exception:  # noqa: BLE001
                            pass
            c.commit(); c.close()
        except Exception as e:  # noqa: BLE001
            print(f"[task_daemon] error: {str(e)[:140]}", flush=True)
        time.sleep(interval)


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 2 and sys.argv[1] == "create":
        print(create(sys.argv[2]))
    elif len(sys.argv) > 1 and sys.argv[1] == "list":
        import json
        print(json.dumps(list_tasks(), indent=2))
    else:
        run_forever()
