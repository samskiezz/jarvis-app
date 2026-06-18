"""Virtual whip for Claude Code subprocess calls — reusable across every Claude caller.

Why this exists
---------------
Every long-running `claude -p ...` (or `claude ...`) invocation used to be:

    subprocess.run(cmd, timeout=1800)

…a single blocking call with no heartbeat. If Claude was alive but slow the parent
killed it at the cap; if Claude hung idle the parent still waited the full cap; the
partial JSON output at /tmp/_ai_out.json was overwritten next cycle so transcripts
vanished. The orchestrator UI had zero visibility — hundreds of "open chats" with
no completion signal piling up.

The whip
--------
- Runs Claude via `Popen`, polls every HEARTBEAT_S seconds.
- Writes a heartbeat JSON next to the transcript so any UI can show live state.
- IDLE DETECT: if the output file does not grow for IDLE_KILL_S seconds → SIGTERM, then SIGKILL.
- WORK EXTEND: if Claude is still writing output, deadline auto-extends up to HARD_CAP_S.
- PERSISTS the transcript under server/data/claude_runs/<run_id>/ — prompt, raw output,
  heartbeat, final status. Nothing is left in /tmp where it gets overwritten.
- ARCHIVE marker on completion so a UI can show open vs archived runs without
  guessing from timestamps.

Use from any Claude caller:

    from claude_whip import whip_claude
    res = whip_claude(prompt="…", model="claude-sonnet-4-6", stage="implement", label="feature title")
    # res = {"run_id", "rc", "elapsed", "transcript_path", "status", "out_text"}

`server/routes/claude_code.py` reads the same server/data/claude_runs/ dir to
render the mini-app, so this is the single source of truth.
"""
from __future__ import annotations

import json
import os
import shlex
import signal
import subprocess
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNS_DIR = os.path.join(ROOT, "server", "data", "claude_runs")
DEFAULT_CLAUDE = os.environ.get("CLAUDE_BIN", "/root/.local/bin/claude")

# Heartbeat cadence — how often to bump the heartbeat file + check output growth.
HEARTBEAT_S = int(os.environ.get("CLAUDE_WHIP_HEARTBEAT_S", "10"))
# If output stays unchanged for this many seconds, treat Claude as hung and kill.
IDLE_KILL_S = int(os.environ.get("CLAUDE_WHIP_IDLE_KILL_S", "300"))
# Absolute ceiling — even with steady output we stop here so a runaway can't burn forever.
HARD_CAP_S = int(os.environ.get("CLAUDE_WHIP_HARD_CAP_S", "7200"))
# How much we extend the "soft" deadline each time Claude shows progress.
WORK_EXTEND_S = int(os.environ.get("CLAUDE_WHIP_WORK_EXTEND_S", "600"))


def _runs_dir() -> str:
    os.makedirs(RUNS_DIR, exist_ok=True)
    return RUNS_DIR


def _stamp() -> str:
    # Time-sortable id without using Date.now() in a way that breaks resume — this is a
    # subprocess wrapper, not a workflow script, so time.time() is fine here.
    return time.strftime("%Y%m%dT%H%M%S", time.gmtime())


def _new_run_dir(stage: str, label: str) -> tuple[str, str]:
    base = _runs_dir()
    safe_label = "".join(c if c.isalnum() or c in "-_" else "_" for c in (label or "")[:48]) or "run"
    run_id = "%s_%s_%s" % (_stamp(), stage or "run", safe_label)
    p = os.path.join(base, run_id)
    os.makedirs(p, exist_ok=True)
    return run_id, p


def _write(path: str, obj):
    try:
        with open(path, "w", encoding="utf-8") as f:
            if isinstance(obj, str):
                f.write(obj)
            else:
                json.dump(obj, f, default=str)
    except Exception:  # noqa: BLE001
        pass


def _file_size(p: str) -> int:
    try:
        return os.path.getsize(p)
    except OSError:
        return 0


def _last_lines(p: str, n: int = 4) -> str:
    try:
        with open(p, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            chunk = min(size, 4096)
            f.seek(size - chunk)
            tail = f.read().decode("utf-8", "replace")
        return "\n".join([ln for ln in tail.splitlines() if ln.strip()][-n:])
    except Exception:  # noqa: BLE001
        return ""


def _killtree(proc: subprocess.Popen):
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        time.sleep(2)
        if proc.poll() is None:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except Exception:  # noqa: BLE001
        try:
            proc.kill()
        except Exception:  # noqa: BLE001
            pass


def whip_claude(prompt: str,
                model: str = "claude-sonnet-4-6",
                stage: str = "run",
                label: str = "",
                extra_args: list | None = None,
                env: dict | None = None,
                claude_bin: str | None = None,
                soft_timeout: int = 1800,
                cwd: str | None = None) -> dict:
    """Run claude -p with a virtual whip. Returns a result dict; transcript persists on disk.

    Result keys: run_id, rc, elapsed, status (ok|idle_kill|hard_cap|launch_error|cli_error),
                 transcript_path, out_text, prompt_path.
    """
    run_id, rd = _new_run_dir(stage, label)
    prompt_path = os.path.join(rd, "prompt.txt")
    out_path = os.path.join(rd, "output.txt")
    hb_path = os.path.join(rd, "heartbeat.json")
    status_path = os.path.join(rd, "status.json")
    _write(prompt_path, prompt or "")
    _write(out_path, "")

    bin_ = claude_bin or DEFAULT_CLAUDE
    extra = list(extra_args or [])
    cmd = [bin_, "-p", prompt, "--model", model, "--output-format", "json",
           "--dangerously-skip-permissions", *extra]
    started = time.time()
    # Seed heartbeat / status so the UI sees the run the instant it starts.
    _write(hb_path, {"run_id": run_id, "stage": stage, "label": label, "model": model,
                     "started": started, "elapsed": 0, "bytes_out": 0,
                     "last_line": "", "state": "starting"})
    _write(status_path, {"run_id": run_id, "stage": stage, "label": label, "model": model,
                         "started": started, "status": "active", "archived": False})

    full_env = dict(os.environ, **(env or {}))
    full_env.setdefault("IS_SANDBOX", "1")  # allow --dangerously-skip-permissions as root
    try:
        with open(out_path, "w") as out_f:
            proc = subprocess.Popen(cmd, cwd=(cwd or ROOT), env=full_env,
                                    stdout=out_f, stderr=subprocess.STDOUT,
                                    preexec_fn=os.setsid)
    except FileNotFoundError as e:
        _write(status_path, {"run_id": run_id, "stage": stage, "label": label, "model": model,
                             "started": started, "ended": time.time(), "elapsed": 0,
                             "status": "launch_error", "error": str(e), "archived": False})
        return {"run_id": run_id, "rc": 127, "elapsed": 0, "status": "launch_error",
                "transcript_path": out_path, "prompt_path": prompt_path, "out_text": ""}

    last_size = 0
    last_growth_ts = started
    soft_deadline = started + max(60, soft_timeout)
    hard_deadline = started + HARD_CAP_S
    state = "running"

    try:
        while True:
            try:
                proc.wait(timeout=HEARTBEAT_S)
                break  # process exited naturally
            except subprocess.TimeoutExpired:
                pass
            now = time.time()
            size = _file_size(out_path)
            grew = size > last_size
            if grew:
                last_size = size
                last_growth_ts = now
                # Work extension — Claude is producing output, push the soft deadline forward.
                soft_deadline = max(soft_deadline, now + WORK_EXTEND_S)
            idle_for = now - last_growth_ts
            elapsed = now - started
            _write(hb_path, {"run_id": run_id, "stage": stage, "label": label, "model": model,
                             "started": started, "elapsed": int(elapsed), "bytes_out": size,
                             "idle_for": int(idle_for), "last_line": _last_lines(out_path, 1),
                             "soft_deadline": int(soft_deadline - started),
                             "hard_deadline": int(hard_deadline - started),
                             "state": state})
            if idle_for >= IDLE_KILL_S:
                state = "idle_kill"
                _killtree(proc)
                break
            if now >= hard_deadline:
                state = "hard_cap"
                _killtree(proc)
                break
            if now >= soft_deadline and not grew:
                # Soft deadline reached and Claude hasn't grown the file lately — let one more
                # heartbeat cycle confirm idleness, then idle_kill will handle the rest.
                pass
    except KeyboardInterrupt:
        state = "interrupt"
        _killtree(proc)

    rc = proc.poll() if proc.poll() is not None else proc.wait(timeout=5)
    ended = time.time()
    elapsed = int(ended - started)
    final_state = state if state in ("idle_kill", "hard_cap", "interrupt") else ("ok" if rc == 0 else "cli_error")
    try:
        out_text = open(out_path, encoding="utf-8", errors="replace").read()
    except Exception:  # noqa: BLE001
        out_text = ""
    _write(status_path, {"run_id": run_id, "stage": stage, "label": label, "model": model,
                         "started": started, "ended": ended, "elapsed": elapsed,
                         "rc": rc, "status": final_state, "archived": False,
                         "bytes_out": _file_size(out_path)})
    _write(hb_path, {"run_id": run_id, "stage": stage, "label": label, "model": model,
                     "started": started, "elapsed": elapsed, "bytes_out": _file_size(out_path),
                     "last_line": _last_lines(out_path, 1), "state": final_state})
    return {"run_id": run_id, "rc": rc, "elapsed": elapsed, "status": final_state,
            "transcript_path": out_path, "prompt_path": prompt_path, "out_text": out_text}


def register_detached_run(stage: str, label: str, model: str, pid: int,
                          outfile: str, prompt: str = "") -> str:
    """Register a Claude job that was launched DETACHED (e.g. task_daemon's reparented-to-init agents).
    Returns a run_id; the caller (or a watcher) is responsible for periodically calling
    bump_detached_heartbeat() and archive_run() so the viewer reflects live state."""
    run_id, rd = _new_run_dir(stage, label)
    _write(os.path.join(rd, "prompt.txt"), prompt or "")
    # Symlink the daemon's outfile into the run dir so the viewer tails the SAME file the daemon writes.
    try:
        link = os.path.join(rd, "output.txt")
        if outfile and os.path.exists(outfile) and not os.path.exists(link):
            os.symlink(outfile, link)
        elif outfile:
            with open(link, "w") as f:
                f.write("")  # placeholder; viewer reads outfile via status.outfile
    except Exception:  # noqa: BLE001
        pass
    started = time.time()
    _write(os.path.join(rd, "status.json"),
           {"run_id": run_id, "stage": stage, "label": label, "model": model,
            "started": started, "status": "active", "archived": False,
            "detached": True, "pid": pid, "outfile": outfile})
    _write(os.path.join(rd, "heartbeat.json"),
           {"run_id": run_id, "stage": stage, "label": label, "model": model,
            "started": started, "elapsed": 0, "bytes_out": 0, "state": "running",
            "detached": True, "pid": pid})
    return run_id


def bump_detached_heartbeat(run_id: str) -> dict:
    """Refresh heartbeat for a detached run by polling its PID + outfile size. Returns the heartbeat dict."""
    rd = os.path.join(_runs_dir(), run_id)
    sp = os.path.join(rd, "status.json")
    hp = os.path.join(rd, "heartbeat.json")
    if not os.path.exists(sp):
        return {}
    try:
        st = json.load(open(sp, encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}
    pid = int(st.get("pid") or 0)
    outfile = st.get("outfile") or ""
    alive = False
    if pid:
        try:
            os.kill(pid, 0)
            alive = True
        except OSError:
            alive = False
    size = _file_size(outfile) if outfile else 0
    elapsed = int(time.time() - float(st.get("started") or time.time()))
    state = "running" if alive else "exited"
    hb = {"run_id": run_id, "stage": st.get("stage"), "label": st.get("label"),
          "model": st.get("model"), "started": st.get("started"), "elapsed": elapsed,
          "bytes_out": size, "last_line": _last_lines(outfile, 1) if outfile else "",
          "state": state, "detached": True, "pid": pid}
    _write(hp, hb)
    if not alive and st.get("status") == "active":
        st["status"] = "exited"
        st["ended"] = time.time()
        st["elapsed"] = elapsed
        st["bytes_out"] = size
        _write(sp, st)
    return hb


def archive_run(run_id: str, outcome: str, detail: dict | None = None) -> bool:
    """Mark a run as archived (done/landed/discarded). UI uses this to clear it from 'open chats'."""
    p = os.path.join(_runs_dir(), run_id, "status.json")
    if not os.path.exists(p):
        return False
    try:
        data = json.load(open(p, encoding="utf-8"))
    except Exception:  # noqa: BLE001
        data = {"run_id": run_id}
    data["archived"] = True
    data["archived_at"] = time.time()
    data["outcome"] = outcome
    if detail:
        data["outcome_detail"] = detail
    _write(p, data)
    # Additive: emit an assurance event so the event bus + audit log see archival.
    try:
        import sys as _sys
        _root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if _root not in _sys.path:
            _sys.path.insert(0, _root)
        from assurance.events.bus import get_bus as _evt_bus  # type: ignore
        from assurance.events.types import Event as _Event  # type: ignore
        _evt_bus().append(_Event(
            name="claude.run.archived",
            actor=data.get("actor") or "system",
            source="scripts.claude_whip",
            payload={"run_id": run_id, "outcome": outcome,
                     "stage": data.get("stage"), "label": data.get("label")},
        ))
    except Exception:  # noqa: BLE001
        pass
    return True


def list_runs(limit: int = 200, include_archived: bool = True) -> list:
    base = _runs_dir()
    if not os.path.isdir(base):
        return []
    out = []
    for name in sorted(os.listdir(base), reverse=True):
        sp = os.path.join(base, name, "status.json")
        if not os.path.exists(sp):
            continue
        try:
            data = json.load(open(sp, encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
        if not include_archived and data.get("archived"):
            continue
        out.append(data)
        if len(out) >= limit:
            break
    return out


def get_run(run_id: str) -> dict:
    rd = os.path.join(_runs_dir(), run_id)
    if not os.path.isdir(rd):
        return {}
    res = {"run_id": run_id}
    for k, fn in (("status", "status.json"), ("heartbeat", "heartbeat.json")):
        p = os.path.join(rd, fn)
        if os.path.exists(p):
            try:
                res[k] = json.load(open(p, encoding="utf-8"))
            except Exception:  # noqa: BLE001
                res[k] = {}
    for k, fn in (("prompt", "prompt.txt"), ("output", "output.txt")):
        p = os.path.join(rd, fn)
        if os.path.exists(p):
            try:
                res[k] = open(p, encoding="utf-8", errors="replace").read()
            except Exception:  # noqa: BLE001
                res[k] = ""
    return res


def tail_output(run_id: str, from_byte: int = 0, max_bytes: int = 64 * 1024) -> tuple[str, int]:
    """Return (chunk, new_offset). Used by the SSE stream for live tail."""
    p = os.path.join(_runs_dir(), run_id, "output.txt")
    if not os.path.exists(p):
        return "", from_byte
    try:
        size = os.path.getsize(p)
        if from_byte >= size:
            return "", size
        with open(p, "rb") as f:
            f.seek(from_byte)
            data = f.read(max_bytes)
        return data.decode("utf-8", "replace"), from_byte + len(data)
    except Exception:  # noqa: BLE001
        return "", from_byte


if __name__ == "__main__":
    # CLI test:  python3 scripts/claude_whip.py "hello"
    import sys
    p = " ".join(sys.argv[1:]) or "Reply with the single word OK."
    r = whip_claude(p, stage="cli_test", label="manual")
    print(json.dumps({k: v for k, v in r.items() if k != "out_text"}, indent=2))
    print("---OUTPUT---")
    print((r.get("out_text") or "")[:2000])
