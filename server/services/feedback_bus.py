"""FEEDBACK BUS — the self-improving loop wired into EVERY .py in the system.

One shared seam that every module reports to and learns from, so Llama ↔ Kimi ↔ Claude can talk to
each other ABOUT the running code and feed corrections back in:

  • register_all_modules()  — enrolls every .py in the repo as a watched node (the "assign to every py").
  • install_global()        — installs sys/threading excepthooks so ANY unhandled error in ANY module
                              flows here automatically, attributed to the exact file — zero per-file edits.
  • record(module, kind, …) — any module logs an issue / event / slow-call.
  • @watch                  — decorator: auto-records a function's exceptions + slow runs.
  • lesson(module, text)    — store a corrective lesson (written by the improver after the models confer).
  • lessons_for / get_lessons_preamble(module) — read those lessons back so the next LLM call on that
                              module is primed with what was already learned (the loop closes here).
  • stats()                 — counts for the dashboard's Self-Learning panel.

Backed by server/data/feedback.db (WAL, short-lived connections). Never raises — a telemetry bus must
never be able to break the code it watches.
"""
from __future__ import annotations

import os
import sqlite3
import sys
import threading
import time
import traceback

_HERE = os.path.dirname(os.path.abspath(__file__))          # …/server/services
SERVER = os.path.dirname(_HERE)                              # …/server
REPO = os.path.dirname(SERVER)                               # repo root
DB = os.environ.get("FEEDBACK_DB", os.path.join(SERVER, "data", "feedback.db"))

# directories never worth scanning / attributing to
_SKIP = ("/.venv/", "/node_modules/", "/.git/", "/__pycache__/", "/dist/", "/build/",
         "/.worktrees/", "/worktrees/", "/site-packages/")

_lock = threading.Lock()
_installed = False


def _db():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    c = sqlite3.connect(DB, timeout=10)
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("""CREATE TABLE IF NOT EXISTS modules(
        path TEXT PRIMARY KEY, app TEXT, registered_ts INTEGER,
        last_event_ts INTEGER, events INTEGER DEFAULT 0, errors INTEGER DEFAULT 0)""")
    c.execute("""CREATE TABLE IF NOT EXISTS events(
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, module TEXT, kind TEXT,
        severity TEXT, detail TEXT, tb TEXT, resolved INTEGER DEFAULT 0)""")
    c.execute("""CREATE TABLE IF NOT EXISTS lessons(
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, module TEXT, trigger TEXT,
        lesson TEXT, source_tier TEXT, applied INTEGER DEFAULT 0)""")
    return c


def _app_of(rel: str) -> str:
    if rel.startswith("underworld/"):
        return "underworld"
    if rel.startswith("server/") or rel.startswith("src/"):
        return "jarvis"
    return "other"


# ── registration ────────────────────────────────────────────────────────────
def register_module(path: str, app: str = "") -> None:
    try:
        rel = os.path.relpath(path, REPO) if os.path.isabs(path) else path
        with _lock:
            c = _db()
            c.execute("INSERT OR IGNORE INTO modules(path,app,registered_ts,events,errors) VALUES(?,?,?,0,0)",
                      (rel, app or _app_of(rel), int(time.time())))
            c.commit(); c.close()
    except Exception:  # noqa: BLE001
        pass


def register_all_modules(roots: list[str] | None = None) -> int:
    """Walk the repo and enroll every .py file. Idempotent. Returns count enrolled."""
    base = [os.path.join(REPO, r) for r in (roots or ["."])]
    found = []
    for root in base:
        for dp, dns, fns in os.walk(root):
            dns[:] = [d for d in dns if not any(s.strip("/") == d for s in _SKIP)]
            if any(s in (dp + "/") for s in _SKIP):
                continue
            for fn in fns:
                if fn.endswith(".py"):
                    found.append(os.path.relpath(os.path.join(dp, fn), REPO))
    try:
        with _lock:
            c = _db()
            now = int(time.time())
            c.executemany("INSERT OR IGNORE INTO modules(path,app,registered_ts,events,errors) VALUES(?,?,?,0,0)",
                          [(p, _app_of(p), now) for p in found])
            c.commit(); c.close()
    except Exception:  # noqa: BLE001
        pass
    return len(found)


# ── recording ───────────────────────────────────────────────────────────────
def record(module: str, kind: str, detail: str = "", severity: str = "info", tb: str = "") -> None:
    """Log an event/issue from a module. kind: exception|slow|warn|note|event."""
    try:
        rel = os.path.relpath(module, REPO) if os.path.isabs(module) else module
        is_err = severity in ("error", "exception") or kind == "exception"
        with _lock:
            c = _db()
            now = int(time.time())
            c.execute("INSERT INTO events(ts,module,kind,severity,detail,tb) VALUES(?,?,?,?,?,?)",
                      (now, rel, kind, severity, (detail or "")[:1000], (tb or "")[:3000]))
            c.execute("INSERT INTO modules(path,app,registered_ts,last_event_ts,events,errors) "
                      "VALUES(?,?,?,?,1,?) ON CONFLICT(path) DO UPDATE SET "
                      "last_event_ts=?, events=events+1, errors=errors+?",
                      (rel, _app_of(rel), now, now, 1 if is_err else 0, now, 1 if is_err else 0))
            c.commit(); c.close()
    except Exception:  # noqa: BLE001
        pass


def _module_of_tb(tb) -> str | None:
    """The deepest in-repo frame in a traceback → the file that actually failed."""
    path = None
    while tb is not None:
        fn = tb.tb_frame.f_code.co_filename
        if fn.startswith(REPO) and not any(s in fn for s in _SKIP):
            path = os.path.relpath(fn, REPO)
        tb = tb.tb_next
    return path


def watch(fn=None, *, label: str | None = None, slow_ms: int = 6000):
    """Decorator: record a function's exceptions (re-raised) and slow runs."""
    def deco(f):
        mod = label or getattr(f, "__module__", "?").replace(".", "/") + ".py"

        def wrap(*a, **k):
            t0 = time.time()
            try:
                r = f(*a, **k)
            except Exception as e:  # noqa: BLE001
                record(mod, "exception", f"{type(e).__name__}: {e}", "error",
                       traceback.format_exc()[-2500:])
                raise
            dt = int((time.time() - t0) * 1000)
            if dt >= slow_ms:
                record(mod, "slow", f"{f.__name__} took {dt}ms", "warn")
            return r
        wrap.__name__ = getattr(f, "__name__", "wrapped")
        wrap.__doc__ = getattr(f, "__doc__", None)
        return wrap
    return deco(fn) if callable(fn) else deco


def install_global() -> None:
    """Route EVERY unhandled exception (main thread + worker threads) into the bus."""
    global _installed
    if _installed:
        return
    _installed = True
    _prev = sys.excepthook

    def hook(et, ev, tb):
        try:
            record(_module_of_tb(tb) or "unknown", "exception", f"{et.__name__}: {ev}", "error",
                   "".join(traceback.format_exception(et, ev, tb))[-2500:])
        except Exception:  # noqa: BLE001
            pass
        _prev(et, ev, tb)
    sys.excepthook = hook

    if hasattr(threading, "excepthook"):
        _tprev = threading.excepthook

        def thook(args):
            try:
                record(_module_of_tb(args.exc_traceback) or "unknown", "exception",
                       f"{args.exc_type.__name__}: {args.exc_value}", "error",
                       "".join(traceback.format_exception(args.exc_type, args.exc_value,
                                                          args.exc_traceback))[-2500:])
            except Exception:  # noqa: BLE001
                pass
            _tprev(args)
        threading.excepthook = thook


# ── lessons (the corrective memory the models write + read) ───────────────────
def lesson(module: str, text: str, *, trigger: str = "", source_tier: str = "") -> None:
    try:
        rel = os.path.relpath(module, REPO) if os.path.isabs(module) else module
        with _lock:
            c = _db()
            c.execute("INSERT INTO lessons(ts,module,trigger,lesson,source_tier) VALUES(?,?,?,?,?)",
                      (int(time.time()), rel, trigger[:200], text.strip()[:600], source_tier))
            c.commit(); c.close()
    except Exception:  # noqa: BLE001
        pass


def lessons_for(module: str, limit: int = 5) -> list[str]:
    try:
        rel = os.path.relpath(module, REPO) if os.path.isabs(module) else module
        c = _db()
        rows = c.execute("SELECT lesson FROM lessons WHERE module=? ORDER BY ts DESC LIMIT ?",
                         (rel, limit)).fetchall()
        c.close()
        return [r[0] for r in rows]
    except Exception:  # noqa: BLE001
        return []


def get_lessons_preamble(module: str, limit: int = 5) -> str:
    ls = lessons_for(module, limit)
    if not ls:
        return ""
    return ("Lessons learned previously about this module (apply them):\n"
            + "\n".join(f"- {x}" for x in ls) + "\n")


# ── improver queue helpers ────────────────────────────────────────────────────
def open_issues(limit: int = 20) -> list[dict]:
    try:
        c = _db()
        rows = c.execute("SELECT id,module,kind,severity,detail,tb FROM events "
                         "WHERE resolved=0 ORDER BY (severity IN('error','exception')) DESC, id DESC "
                         "LIMIT ?", (limit,)).fetchall()
        c.close()
        return [{"id": r[0], "module": r[1], "kind": r[2], "severity": r[3],
                 "detail": r[4], "tb": r[5]} for r in rows]
    except Exception:  # noqa: BLE001
        return []


def mark_resolved(event_id: int) -> None:
    try:
        with _lock:
            c = _db()
            c.execute("UPDATE events SET resolved=1 WHERE id=?", (event_id,))
            c.commit(); c.close()
    except Exception:  # noqa: BLE001
        pass


def stats() -> dict:
    try:
        c = _db()

        def one(q):
            try:
                return c.execute(q).fetchone()[0]
            except Exception:  # noqa: BLE001
                return 0
        out = {
            "modules": one("SELECT count(*) FROM modules"),
            "modules_with_events": one("SELECT count(*) FROM modules WHERE events>0"),
            "events": one("SELECT count(*) FROM events"),
            "open_issues": one("SELECT count(*) FROM events WHERE resolved=0"),
            "lessons": one("SELECT count(*) FROM lessons"),
            "top_noisy": [{"module": m, "errors": e} for m, e in
                          c.execute("SELECT path,errors FROM modules WHERE errors>0 ORDER BY errors DESC LIMIT 6")],
            "recent_lessons": [{"module": m, "lesson": l, "tier": t} for m, l, t in
                               c.execute("SELECT module,lesson,source_tier FROM lessons ORDER BY ts DESC LIMIT 6")],
        }
        c.close()
        return out
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:120]}


if __name__ == "__main__":
    import json
    n = register_all_modules()
    print(f"registered {n} python modules across the repo")
    print(json.dumps(stats(), indent=2))
