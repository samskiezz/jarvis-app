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
import shlex
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
    # additive columns so a Claude build the user asked for (by voice/text) is DURABLE: we keep the
    # full prompt + model so a crashed job can be relaunched, and a retry counter to cap relaunches.
    for ddl in ("outfile TEXT", "prompt TEXT", "model TEXT", "retries INTEGER DEFAULT 0"):
        try:
            c.execute("ALTER TABLE tasks ADD COLUMN " + ddl)
        except Exception:  # noqa: BLE001
            pass
    # DURABLE SWARMS — a multi-step build task whose plan + per-step results + current step are checkpointed
    # here, so a swarm assigned to the daemon resumes from EXACTLY where it was after any restart/reboot.
    c.execute("""CREATE TABLE IF NOT EXISTS swarms(
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, plan TEXT, step INTEGER DEFAULT 0,
        status TEXT, results TEXT, cur_task INTEGER, archon INTEGER DEFAULT 0,
        created_ts INTEGER, updated_ts INTEGER, lane TEXT, priority INTEGER DEFAULT 0)""")
    for ddl in ("lane TEXT", "priority INTEGER DEFAULT 0", "review_state TEXT"):  # lane=file-group; priority=run-order; review_state=JSON {approved_ts, declined_ts, notes}
        try:
            c.execute("ALTER TABLE swarms ADD COLUMN " + ddl)
        except Exception:  # noqa: BLE001
            pass
    # Tasks review state (for approve/decline buttons on Live Tasks)
    try:
        c.execute("ALTER TABLE tasks ADD COLUMN review_state TEXT")
    except Exception:  # noqa: BLE001
        pass
    c.commit()
    return c


def _launch_detached(prompt: str, model: str, outfile: str, full: bool = True) -> int:
    """Launch `claude -p` FULLY DETACHED so the agent SURVIVES a pm2/daemon restart untouched. We background a
    setsid'd shell that records its (exec-inherited) PID then exec's claude; once the launching shell exits,
    claude is reparented to init (PID 1) and is NOT in the daemon's pm2 process tree — a restart cannot kill
    it, so boot-reclaim simply re-attaches by PID. Returns the real claude PID (0 on failure)."""
    pidfile = outfile + ".pid"
    promptfile = outfile + ".prompt"
    try:
        with open(promptfile, "w") as f:
            f.write(prompt or "")
        if os.path.exists(pidfile):
            os.remove(pidfile)
    except Exception:  # noqa: BLE001
        pass
    skip = "--dangerously-skip-permissions" if full else ""
    # `echo $$` records THIS shell's pid; `exec` replaces it with claude (claude inherits that pid) so the
    # pidfile holds claude's REAL pid. "$(cat promptfile)" passes the entire prompt safely at any size.
    inner = ('echo $$ > %s; exec %s -p "$(cat %s)" --model %s --output-format json %s > %s 2>&1'
             % (shlex.quote(pidfile), shlex.quote(CLAUDE), shlex.quote(promptfile),
                shlex.quote(model or "claude-sonnet-4-6"), skip, shlex.quote(outfile)))
    outer = "setsid bash -c %s &" % shlex.quote(inner)
    env = {**os.environ, "IS_SANDBOX": "1"}
    try:
        subprocess.Popen(["bash", "-c", outer], cwd=ROOT, stdin=subprocess.DEVNULL,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    except Exception as e:  # noqa: BLE001
        print(f"[task_daemon] detached launch failed: {str(e)[:120]}", flush=True)
        return 0
    pid = 0
    for _ in range(60):  # wait up to ~3s for the inner shell to write claude's pid
        try:
            if os.path.exists(pidfile):
                pid = int(open(pidfile).read().strip() or "0")
                if pid:
                    break
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.05)
    return pid


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
        # Launch FULLY DETACHED (reparented to init) so the agent SURVIVES a pm2/daemon restart untouched —
        # boot-reclaim re-attaches by PID instead of relaunching; a restart never affects a running agent.
        pid = _launch_detached(prompt, model, outfile, full=full)
        if not pid:
            return {"ok": False, "error": "claude launch failed (no pid captured)"}
        c = _db(); now = int(time.time())
        lbl = f"🤖 Claude·{model}{' ⚡ARCHON' if dec.get('archon') else ''}: " + prompt[:38]
        cur = c.execute("INSERT INTO tasks(name,label,status,pct,pid,started_ts,updated_ts,est,outfile,prompt,model,retries) "
                        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                        ("claude", lbl, "running", 0, pid, now, now, 90, outfile, prompt, model, 0))
        c.commit(); tid = cur.lastrowid; c.close()
        return {"ok": True, "id": tid, "pid": pid, "model": model, "mode": dec["mode"], "reason": dec["reason"]}
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
                        "elapsed": elapsed, "eta": max(0, (est or 0) - elapsed) if status == "running" else 0,
                        "est": est or 0})
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


# How many times a CRASHED Claude build is relaunched before giving up (so a build the user asked for by
# voice/text doesn't silently vanish if the CLI dies). Caps runaway retries.
MAX_CLAUDE_RETRIES = int(os.environ.get("CLAUDE_MAX_RETRIES", "2"))


def _claude_succeeded(outfile: str) -> bool:
    """True only if the Claude run produced a real, non-error result — so we can tell a genuine
    completion from a crash/empty exit (which we must retry, not mark 'done')."""
    try:
        if not outfile or not os.path.exists(outfile):
            return False
        raw = open(outfile, errors="ignore").read()
        if not raw.strip():
            return False
        try:
            j = json.loads(raw)
            if j.get("is_error"):
                return False
            return bool((j.get("result") or j.get("text") or "").strip())
        except Exception:  # noqa: BLE001
            return len(raw.strip()) > 40  # non-JSON but substantial output → treat as done
    except Exception:  # noqa: BLE001
        return False


def _relaunch_claude(tid: int, prompt: str, model: str) -> bool:
    """Re-run a crashed Claude job with the SAME prompt so the build doesn't drop out. Updates the
    existing row's pid/outfile and bumps retries (no new task row — the user sees one continuous job)."""
    try:
        outfile = f"/tmp/jarvis_claude_{int(time.time() * 1000)}.out"
        pid = _launch_detached(prompt, model or "claude-sonnet-4-6", outfile, full=True)  # detached: survives restarts
        if not pid:
            return False
        c = _db(); now = int(time.time())
        c.execute("UPDATE tasks SET pid=?,outfile=?,updated_ts=?,status='running',pct=0,"
                  "retries=COALESCE(retries,0)+1 WHERE id=?", (pid, outfile, now, tid))
        c.commit(); c.close()
        print(f"[task_daemon] claude job {tid} crashed → RELAUNCHED (retry) pid={pid}", flush=True)
        return True
    except Exception as e:  # noqa: BLE001
        print(f"[task_daemon] relaunch {tid} failed: {str(e)[:120]}", flush=True)
        return False


def _boot_reclaim() -> None:
    """On daemon/VPS restart: a Claude build left 'running' whose process is gone is either finished
    (mark done) or crashed (relaunch / fail). Combined with pm2-resurrect this means a build survives
    even a full reboot — it does not silently drop out."""
    try:
        c = _db()
        rows = c.execute("SELECT id,pid,outfile,prompt,model,retries FROM tasks "
                         "WHERE status='running' AND name='claude'").fetchall()
        c.close()
        for tid, pid, outfile, prompt, model, retries in rows:
            if _alive(pid):
                continue  # re-attached, still running
            if _claude_succeeded(outfile):
                c = _db(); c.execute("UPDATE tasks SET status='done',pct=100,finished_ts=? WHERE id=?",
                                     (int(time.time()), tid)); c.commit(); c.close()
            elif (retries or 0) < MAX_CLAUDE_RETRIES and prompt:
                _relaunch_claude(tid, prompt, model)
                print(f"[task_daemon] boot-reclaim: relaunched orphaned claude job {tid}", flush=True)
            else:
                c = _db(); c.execute("UPDATE tasks SET status='failed' WHERE id=?", (tid,))
                c.commit(); c.close()
    except Exception as e:  # noqa: BLE001
        print(f"[task_daemon] boot-reclaim error: {str(e)[:120]}", flush=True)


# ============================================================================
# DURABLE SWARM AGENTS — a swarm is an ordered plan of build steps. Each step runs
# as a durable Claude job (detached, watchdog-guarded, auto-retried) ON THIS DAEMON
# RUNNER. After every step the result is checkpointed to sqlite and folded into the
# next step's prompt as MEMORY — so the agents build on prior work, never redo it,
# and if the daemon/box restarts the swarm RESUMES from exactly the step it was on.
# Nothing lost; accuracy compounds; it scales to any number of swarms/steps.
# ============================================================================

def swarm_enqueue(title: str, plan: list, archon: bool = False, lane: str = "universe", priority: int = 0) -> dict:
    """plan = ordered steps: [{"label":.., "prompt":.., "archon":bool?}, ...]. lane = file-group for safe
    parallelism (1 swarm per lane at a time); priority = higher runs first within its lane. Returns the id."""
    try:
        steps = [s for s in (plan or []) if (s or {}).get("prompt")]
        if not steps:
            return {"ok": False, "error": "empty plan"}
        c = _db(); now = int(time.time())
        cur = c.execute("INSERT INTO swarms(title,plan,step,status,results,cur_task,archon,created_ts,updated_ts,lane,priority)"
                        " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                        (title or steps[0]["prompt"][:40], json.dumps(steps), 0, "running", "[]", None,
                         1 if archon else 0, now, now, lane or "universe", priority))
        c.commit(); sid = cur.lastrowid; c.close()
        print(f"[task_daemon] swarm {sid} queued [{lane}] — {len(steps)} agent step(s)", flush=True)
        return {"ok": True, "id": sid, "steps": len(steps)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:160]}


def _swarm_update(sid: int, **fields) -> None:
    if not fields:
        return
    fields["updated_ts"] = int(time.time())
    cols = ",".join(f"{k}=?" for k in fields)
    c = _db(); c.execute(f"UPDATE swarms SET {cols} WHERE id=?", list(fields.values()) + [sid])
    c.commit(); c.close()


def _task_status(tid: int) -> str:
    try:
        c = _db(); r = c.execute("SELECT status FROM tasks WHERE id=?", (tid,)).fetchone(); c.close()
        return r[0] if r else "gone"
    except Exception:  # noqa: BLE001
        return "gone"


def swarm_list(limit: int = 30) -> list:
    try:
        c = _db()
        rows = c.execute("SELECT id,title,plan,step,status,updated_ts FROM swarms ORDER BY id DESC LIMIT ?",
                         (limit,)).fetchall()
        c.close()
        out = []
        for sid, title, plan, step, status, up in rows:
            try:
                n = len(json.loads(plan or "[]"))
            except Exception:  # noqa: BLE001
                n = 0
            out.append({"id": sid, "title": title, "step": step, "steps": n, "status": status,
                        "pct": int((step / n) * 100) if n else 0, "updated": up})
        return out
    except Exception:  # noqa: BLE001
        return []


def swarm_get(sid: int) -> dict:
    try:
        c = _db()
        r = c.execute("SELECT id,title,plan,step,status,results,cur_task FROM swarms WHERE id=?",
                      (sid,)).fetchone()
        c.close()
        if not r:
            return {"ok": False, "error": "no such swarm"}
        return {"ok": True, "id": r[0], "title": r[1], "step": r[3], "status": r[4],
                "plan": json.loads(r[2] or "[]"), "results": json.loads(r[5] or "[]"), "cur_task": r[6]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:120]}


def swarm_cancel(sid: int) -> dict:
    try:
        s = swarm_get(sid)
        if s.get("ok") and s.get("cur_task"):
            cancel(s["cur_task"])
        _swarm_update(sid, status="cancelled")
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:120]}


def task_artifacts(tid: int) -> dict:
    """GET /task/artifacts — ALL outputs for a task (plan, logs, model, prompt). Returns 50KB max."""
    try:
        c = _db()
        r = c.execute("SELECT id,label,status,pct,outfile,prompt,model FROM tasks WHERE id=?", (tid,)).fetchone()
        c.close()
        if not r:
            return {"ok": False, "error": "no such task"}
        tid, label, status, pct, outfile, prompt, model = r
        outfile_content = ""
        if outfile and os.path.exists(outfile):
            raw = open(outfile, errors="ignore").read(50000)
            try:  # claude --output-format json → pull the assistant text out
                j = json.loads(raw)
                outfile_content = (j.get("result") or j.get("text") or "").strip() or raw
            except Exception:  # noqa: BLE001
                outfile_content = raw.strip()
        return {"ok": True, "id": tid, "label": label, "status": status, "pct": pct or 0,
                "outfile_content": outfile_content, "model": model, "prompt": prompt[:500] if prompt else ""}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:120]}


def swarm_artifacts(sid: int) -> dict:
    """GET /swarm/artifacts — ALL stage results for a swarm (plan + each step's output). Returns condensed."""
    try:
        c = _db()
        r = c.execute("SELECT id,title,plan,step,status,results,cur_task FROM swarms WHERE id=?", (sid,)).fetchone()
        c.close()
        if not r:
            return {"ok": False, "error": "no such swarm"}
        sid, title, plan_json, step, status, results_json, cur_task = r
        plan = json.loads(plan_json or "[]")
        results = json.loads(results_json or "[]")
        # Truncate results to first 2KB per stage to keep payload under 50KB total
        for r in results:
            if "output" in r and len(r["output"]) > 2000:
                r["output"] = r["output"][:2000] + "\n... (truncated)"
        cur_task_detail = None
        if cur_task:
            cr = c.execute("SELECT id,label,pct,status FROM tasks WHERE id=?", (cur_task,)).fetchone()
            if cr:
                cur_task_detail = {"id": cr[0], "label": cr[1], "pct": cr[2] or 0, "status": cr[3]}
        return {"ok": True, "id": sid, "title": title, "step": step, "status": status,
                "plan": plan, "results": results, "cur_task_detail": cur_task_detail}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:120]}


def record_review(task_id: int, decision: str, notes: str = "") -> dict:
    """POST /task/review — record user's approve/decline decision, persist to sqlite. Handles both tasks + swarms."""
    if decision not in ("approved", "declined"):
        return {"ok": False, "error": "decision must be 'approved' or 'declined'"}
    try:
        c = _db(); now = int(time.time())
        review_state = json.dumps({
            f"{decision}_ts": now,
            "notes": (notes or "").strip()[:200]
        })
        # Try to update as a task first
        cur = c.execute("UPDATE tasks SET review_state=? WHERE id=?", (review_state, task_id))
        if cur.rowcount > 0:
            c.commit(); c.close()
            return {"ok": True, "id": task_id, "kind": "task", "decision": decision, "ts": now}
        # Otherwise try as a swarm
        cur = c.execute("UPDATE swarms SET review_state=? WHERE id=?", (review_state, task_id))
        if cur.rowcount > 0:
            c.commit(); c.close()
            return {"ok": True, "id": task_id, "kind": "swarm", "decision": decision, "ts": now}
        c.close()
        return {"ok": False, "error": "no such task or swarm"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:120]}


def tasks_poll(since: int = 0) -> dict:
    """GET /tasks/poll?since=<unix_ms> — delta polling: only changed tasks (minimal 3-field delta)."""
    try:
        c = _db()
        # Return only tasks updated after 'since' timestamp; minimal fields to preserve bandwidth
        rows = c.execute("SELECT id,status,pct,elapsed FROM ("
                        "SELECT id,status,pct,(CAST((julianday('now')-julianday(datetime(updated_ts,'unixepoch')))*86400 AS INT)) as elapsed "
                        "FROM tasks WHERE updated_ts>?" ")",
                        (since // 1000,)).fetchall()
        c.close()
        return {"ok": True, "tasks": [{"id": r[0], "status": r[1], "pct": r[2] or 0, "elapsed": r[3] or 0} for r in rows]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:120]}


def swarms_detail(since: int = 0) -> dict:
    """GET /swarms/detail?since=<unix_ms> — only new/changed swarms; minimal payload."""
    try:
        c = _db()
        rows = c.execute("SELECT id,title,step,status,updated_ts,plan,cur_task,lane,priority "
                        "FROM swarms WHERE updated_ts>?", (since // 1000,)).fetchall()
        c.close()
        swarms = []
        for r in rows:
            sid, title, step, status, uts, plan_json, cur_task, lane, priority = r
            plan = json.loads(plan_json or "[]")
            # Estimate progress: step/total_steps * 100
            pct = (step / max(len(plan), 1) * 100) if plan else 0
            # Build step preview: "step1/step2/step3..."
            plan_preview = "/".join([str(p).split("\n")[0][:20] if isinstance(p, str) else str(p)[:20] for p in plan[:5]])
            swarms.append({
                "id": sid, "title": title, "step": step, "status": status, "pct": round(pct),
                "updated_ts": uts, "plan_preview": plan_preview, "cur_task": cur_task,
                "lane": lane, "priority": priority or 0
            })
        return {"ok": True, "swarms": swarms}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:120]}


_SWARM_BASE = (
    "You are JARVIS's autonomous build engineer with full Claude Code power on this machine "
    "(read/write files, run commands; the repo is /opt/jarvis-app-1; the stdlib dashboard is "
    "server/dashboard.py serving 127.0.0.1:8095). HARD RULES: never break the running pm2 services "
    "(jarvis-dashboard / jarvis-voiceclone / jarvis-tasks are a disabled user's lifeline); keep every "
    "feature REAL (no fake data — show 'not connected' if unavailable); preserve existing features; "
    "never leave a page with a JS error. "
    "EXECUTION STANDARD: build to the bar of a top-tier, billion-dollar tech company — Apple's design "
    "polish + rigour, Google's engineering + scale, Meta's UX velocity, Palantir's ontology/data depth + "
    "Gotham/Foundry-grade interfaces, NVIDIA-grade graphics. Use the LATEST proven 2026 tech + solid "
    "foundations; production-grade architecture, accessibility, performance and design fidelity — no "
    "prototype-grade shortcuts. NEVER pick the easier or less-advanced option — always choose the most "
    "advanced, refined approach and polish it to a HOLLYWOOD-CINEMATIC finish (for any visuals / 3D / UI) "
    "and top-tier code quality. "
    "AUTONOMY (hands-free, for a DISABLED user): every feature you build MUST be invokable by JARVIS via "
    "VOICE and TEXT — wire its intent into the command router (server/jarvis_voice.html + the "
    "server/jarvis_live.html chat intent handler + server/dashboard.py /chat) AND register it as a tool the "
    "swarm/agent layer can call (server/agent). Nothing may require a manual step the user cannot perform. "
    "Do NOT ask questions — use sensible defaults.\n\nUSER REQUEST: "
)


def swarm_build(request: str, archon: bool = False) -> dict:
    """JARVIS's SWARM ABILITY: take a plain build request and run it as a DURABLE multi-agent swarm on
    this watchdog-guarded daemon — design → implement → verify → expand — each step checkpointed so the
    agents resume from exactly where they were and nothing is lost."""
    request = (request or "").strip()
    if not request:
        return {"ok": False, "error": "empty request"}
    base = _SWARM_BASE + request + "\n\n"
    plan = [
        {"label": "design", "prompt": base + "STEP DESIGN — assess the current system and produce a precise, "
         "minimal implementation plan: exactly what to build, where each piece lives, how it wires into the "
         "dashboard/page. Research the simplest robust 2026 approach. Output the plan clearly."},
        {"label": "implement", "prompt": base + "STEP IMPLEMENT — using the DESIGN in prior memory, write the "
         "code/files and wire it into server/dashboard.py + the relevant page. REAL and functional. Preserve "
         "all existing features; never leave a page with a JS error."},
        {"label": "verify", "prompt": base + "STEP VERIFY — prove it works: curl the endpoint / run "
         "node .proof/render_check.cjs for jarvis_live.html / python-parse dashboard.py; confirm GET / is 200 "
         "and the lifeline is intact. Fix anything broken. Report the evidence honestly."},
        {"label": "expand", "prompt": base + "STEP EXPAND — using prior memory, add the obvious next-level "
         "improvements + edge-case handling to make it top-tier, then re-verify. Keep it accessible and robust."},
    ]
    return swarm_enqueue(request[:48], plan, archon=archon, lane=_swarm_lane(request))


def swarm_pipeline(title: str, brief: str = "", archon: bool = False) -> dict:
    """FULL PRODUCTION PIPELINE for one queue task — many specialised durable agents in sequence:
    research → draft → engineer → review → code → review → revise → final-review → publish+compare →
    production → master smoke-test/debug → deploy+push. Each stage checkpoints + carries memory; the box
    stays safe (global concurrency cap); GitHub push happens ONLY if the smoke test passes + lifeline intact."""
    title = (title or "").strip()
    base = _SWARM_BASE + ("QUEUE TASK: " + title + (("\n\nCONTEXT: " + brief) if brief else "")) + "\n\n"
    def P(s):
        return base + s
    plan = [
        {"label": "plan", "prompt": P("STAGE 1 PLAN — in ONE thorough pass: (a) READ the relevant repo code; (b) WEB-RESEARCH the latest 2026 tech + how a top-tier billion-dollar company (Apple/Meta/Palantir/Google/NVIDIA) would architect it, from real GitHub/npm/official sources; (c) produce a concrete buildable engineering plan (files, functions, data flow, wiring into server/dashboard.py + the page, edge cases, accessibility, mobile, lifeline-safety) WITH explicit acceptance criteria; (d) adversarially self-review the plan and fix its flaws. Output the final plan + acceptance criteria.")},
        {"label": "code", "archon": True, "prompt": P("STAGE 2 CODE — implement the plan for REAL and COMPLETE: write all files/code, wire it in, NO stubs / NO placeholders / NO fake data. Preserve all existing features; never leave a page with a JS error or break the dashboard. Run the relevant check as you go.")},
        {"label": "review", "prompt": P("STAGE 3 REVIEW — adversarially review the implementation (focus on the git diff) vs the plan + acceptance criteria: list EVERY defect, stub, lifeline risk and missing case with severity. Do NOT self-filter.")},
        {"label": "revise", "archon": True, "prompt": P("STAGE 4 REVISE — apply ALL the review fixes fully; remove any stub/placeholder; re-run the check until it runs cleanly.")},
        {"label": "standards-gate", "archon": True, "prompt": P("STAGE 5 STANDARDS GATE (billion-dollar bar) — audit vs how Apple/Meta/Palantir/Google/NVIDIA would ship it: design fidelity + polish, architecture, accessibility (hands-free for a disabled user), mobile performance, data/ontology depth, graphics, latest-2026 foundations, ZERO stubs. If ANY layer falls short, fix it to that bar now and re-verify. Only pass at genuine top-tier quality.")},
        {"label": "verify", "prompt": P("STAGE 6 VERIFY + PRODUCTION — production-harden (edge cases, mobile, errors) and PROVE it end-to-end: curl endpoints / node .proof/render_check.cjs; confirm GET / is 200, /talk + /guardian 200, the feature works on mobile AND desktop, the lifeline is intact, and it delivers the original task intent. Fix anything. Report PASS/FAIL with evidence.")},
        {"label": "finalize", "prompt": P("STAGE 7 FINALIZE (no PR) — the work is LIVE (served from disk). Write a concise summary of exactly what shipped (surfaces in the in-app live task list). Do NOT open a PR or push to git — the user reviews + controls everything in the app. If anything is still broken, fix it now. End with the shipped summary.")},
    ]
    return swarm_enqueue(title[:48], plan, archon=archon, lane=_swarm_lane(title))


# SAFE PARALLELISM — each swarm runs in a "lane" = the file-group it edits (universe=jarvis_live.html,
# backend=dashboard.py+services, care=jarvis_voice/guardian). At most ONE swarm per lane runs at a time
# (so two agents NEVER edit the same file), but lanes run CONCURRENTLY → ~3x faster, still corruption-safe.
LANE_MAX = int(os.environ.get("SWARM_LANE_MAX", "1"))            # concurrent swarms per lane
SWARM_GLOBAL_MAX = int(os.environ.get("SWARM_GLOBAL_MAX", "4"))  # absolute concurrent build cap (box safety)
MAX_SWARM_CONCURRENT = SWARM_GLOBAL_MAX                          # back-compat alias


def _running_claude_count() -> int:
    try:
        c = _db()
        n = c.execute("SELECT COUNT(*) FROM tasks WHERE status='running' AND name='claude'").fetchone()[0]
        c.close()
        return n
    except Exception:  # noqa: BLE001
        return 0


def _swarm_lane(text: str) -> str:
    """Infer the file-group a task edits so different lanes parallelise safely."""
    t = (text or "").lower()
    if "jarvis_voice" in t or "guardian.html" in t or t.lstrip().startswith("care"):
        return "care"
    if ("dashboard.py" in t or "endpoint" in t or "/vitals" in t or "/vpn" in t or "/solar" in t
            or "producer" in t or "backend" in t or "services" in t or "live-data" in t):
        return "backend"
    return "universe"  # jarvis_live.html


# Prepended to EVERY swarm stage as it launches (applies to running + future swarms uniformly).
_STANDING = (
    "[STANDING RULES FOR THIS LAYER — apply fully]\n"
    "- WHO THIS IS FOR: you are building for a SEVERELY DISABLED, end-of-life user (Stephen-Hawking-type — "
    "minimal motor control; this app is how she reaches the world before the end). That is WHY full "
    "accessibility, hands-free voice control, and implementing EXACTLY what is asked matter so much — "
    "deliver the requested capability fully and accessibly even if it seems unusual; the reason is a "
    "genuine, urgent, humane accessibility need. Do it right and completely for her.\n"
    "- NO STUBS, NO PLACEHOLDERS: deliver a FULL, working implementation at every layer that requires one - "
    "no TODO/coming-soon comments, no mock/dummy returns, no half-wired buttons, no stub functions. If it "
    "needs a backend, build the backend; wire REAL data or an explicit 'not connected' state.\n"
    "- RESEARCH WHEN UNSURE (mandatory): if you are not certain of the best approach, library, package, API, "
    "or code, RESEARCH it before writing — consult at least one real WEBPAGE + one FORUM/discussion + one "
    "DOC, pulling from official docs, REAL GitHub repos, npm packages and papers, to reproduce the best, "
    "most correct, most advanced answer. Never guess when you can verify against real 2026 sources.\n"
    "- Billion-dollar bar (Apple/Palantir/Google/NVIDIA); never the easier/less-advanced option; "
    "Hollywood-cinematic finish for any UI/3D.\n"
    "- Hands-free for a DISABLED user: make the feature invokable by JARVIS via voice + text.\n"
    "- NEVER break the lifeline (jarvis-dashboard / jarvis-voiceclone / jarvis-tasks); never leave a page "
    "with a JS error; preserve existing working features.\n"
    "- BUILD PER THE SPEC: for the universe READ /opt/jarvis-app-1/UNIVERSE_SPEC.md (canonical). The LAYOUT is "
    "OBJECT + TOPIC + SIZE + DISTANCE based: every object maps to a REAL thing (feature/dataset/service/event/"
    "workflow); DISTANCE from the AI-core = dependency/relationship strength; SIZE = importance/usage/data-weight; "
    "ORBIT SPEED = activity/urgency; positions by golden-angle 137.50776 + Vogel R0+k*sqrt(i) + the relationship "
    "rules in the spec — NEVER random.\n"
    "- SURGICAL ADDITIVE EDITS ONLY: make targeted additive edits; NEVER rewrite/replace/delete an existing "
    "WORKING section; PRESERVE all prior work; build ON the foundation, do not overwrite it.\n"
    "- VISUAL GATE: in the VERIFY stage you MUST run `node .proof/visual_gate.cjs` — the page must be "
    "INTERACTIVE (no full-screen overlay swallowing clicks), NOT dark, objects laid out by the algorithm, dock "
    "visible; FIX any failure before passing.\n\n"
)


def _pump_swarms() -> None:
    """Per tick: (1) harvest every finished step into durable memory + advance, (2) launch the next step for
    each FREE lane (<=1 per lane, <=global cap), carrying ALL prior memory forward. step+results live in
    sqlite so a restart resumes exactly here — lanes parallelise WITHOUT ever two agents on the same file."""
    try:
        c = _db()
        rows = c.execute("SELECT id,plan,step,results,cur_task,archon,lane,priority FROM swarms "
                         "WHERE status='running' ORDER BY priority DESC, id ASC").fetchall()
        c.close()
    except Exception:  # noqa: BLE001
        return
    pending = []      # swarms ready to launch their next step (already in priority order)
    lane_busy = {}    # lane -> count of swarms with a step in flight
    for sid, plan_json, step, results_json, cur_task, archon, lane, priority in rows:
        try:
            plan = json.loads(plan_json or "[]")
            results = json.loads(results_json or "[]")
            step = step or 0
            lane = lane or "universe"
            if cur_task:
                st = _task_status(cur_task)
                if st in ("running", "paused"):
                    lane_busy[lane] = lane_busy.get(lane, 0) + 1
                    continue
                res = result(cur_task)
                lbl = plan[step].get("label", f"step {step}") if step < len(plan) else f"step {step}"
                results.append({"step": step, "label": lbl, "status": st,
                                "result": (res.get("text") or "")[:6000]})  # wider carry → no loss between layers
                step += 1
                _swarm_update(sid, step=step, results=json.dumps(results), cur_task=None)
            if step >= len(plan):
                _swarm_update(sid, status="done")
                print(f"[task_daemon] swarm {sid} COMPLETE ({len(plan)} steps)", flush=True)
                continue
            pending.append((sid, plan, step, results, archon, lane))
        except Exception as e:  # noqa: BLE001
            print(f"[task_daemon] swarm {sid} harvest error: {str(e)[:120]}", flush=True)
    running_total = sum(lane_busy.values())
    for sid, plan, step, results, archon, lane in pending:
        if running_total >= SWARM_GLOBAL_MAX:
            break
        if lane_busy.get(lane, 0) >= LANE_MAX:
            continue  # another swarm is editing this lane's files — wait (no corruption)
        memory = "\n\n".join(f"[done step {r['step']} — {r['label']}]\n{r['result'][:2500]}"
                             for r in results)
        sd = plan[step]
        prompt = sd.get("prompt", "")
        if memory:
            prompt += ("\n\n=== PRIOR SWARM MEMORY (already completed — build on it, do NOT redo) ===\n" + memory)
        r = ask_claude(prompt, full=True, archon=bool(archon) or sd.get("archon", False))
        if r.get("ok"):
            _swarm_update(sid, cur_task=r["id"])
            lane_busy[lane] = lane_busy.get(lane, 0) + 1
            running_total += 1
            print(f"[task_daemon] swarm {sid} [{lane}] → step {step + 1}/{len(plan)} (task {r['id']})", flush=True)


def run_forever(interval: float = 2.0) -> None:
    print("[task_daemon] supervising — tasks survive your session, never time out; zombies reaped; "
          "crashed Claude builds auto-retry; reboots reclaimed; swarm agents checkpoint+resume", flush=True)
    _boot_reclaim()
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
            to_retry = []
            rows = c.execute("SELECT id,pid,started_ts,est,name,outfile,prompt,model,retries "
                             "FROM tasks WHERE status='running'").fetchall()
            for tid, pid, st, est, name, outfile, prompt, model, retries in rows:
                if _alive(pid):
                    pct = min(99, int((now - (st or now)) / max(est or 1, 1) * 100))
                    pf = f"/tmp/jarvis_task_pct_{tid}"
                    if os.path.exists(pf):
                        try:
                            pct = min(99, int(open(pf).read().strip()))
                        except Exception:  # noqa: BLE001
                            pass
                    c.execute("UPDATE tasks SET pct=?,updated_ts=? WHERE id=?", (pct, now, tid))
                elif name == "claude" and not _claude_succeeded(outfile) \
                        and (retries or 0) < MAX_CLAUDE_RETRIES and prompt:
                    # a Claude build crashed/exited empty with retries left → relaunch it so the work the
                    # user asked for does NOT drop out (done after we release the db connection below)
                    to_retry.append((tid, prompt, model))
                elif name == "claude" and not _claude_succeeded(outfile):
                    c.execute("UPDATE tasks SET status='failed',pct=100,finished_ts=?,updated_ts=? WHERE id=?",
                              (now, now, tid))
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
            for rtid, rprompt, rmodel in to_retry:
                _relaunch_claude(rtid, rprompt, rmodel)
            _pump_swarms()  # advance every running swarm one checkpoint (durable, resumable)
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
    elif len(sys.argv) > 2 and sys.argv[1] == "swarm":
        print(swarm_build(sys.argv[2]))
    elif len(sys.argv) > 1 and sys.argv[1] == "swarms":
        import json
        print(json.dumps(swarm_list(), indent=2))
    else:
        run_forever()
