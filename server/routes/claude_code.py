"""Claude Code mini-app — UI for the mandatory whip transcripts.

Endpoints (mounted under /v1/claude_code):

- GET  /runs                  → list every Claude run (active + archived) with status.
- GET  /run/{run_id}          → full transcript: prompt, output, status, heartbeat.
- GET  /stream/{run_id}       → SSE live tail (heartbeat + new output bytes).
- POST /run                   → start a NEW interactive Claude job (requires bearer auth).
- POST /archive/{run_id}      → mark a run archived so it leaves the "open chats" list.

The interactive run shells out to the same `whip_claude()` every other Claude caller
uses, so the same heartbeat / idle-kill / hard-cap / persisted-transcript guarantees
apply. Interactive starts are bearer-gated because they spawn `claude -p` with
--dangerously-skip-permissions on the host.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import threading
import time

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..auth import optional_bearer, require_bearer

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from claude_whip import (  # type: ignore  # noqa: E402
    archive_run,
    bump_detached_heartbeat,
    get_run,
    list_runs,
    tail_output,
    whip_claude,
)

router = APIRouter(prefix="/v1/claude_code", tags=["claude-code"])


@router.get("/runs")
def runs(limit: int = 200, archived: int = 1, _t: str | None = Depends(optional_bearer)):
    items = list_runs(limit=max(1, min(limit, 1000)), include_archived=bool(archived))
    # Refresh detached jobs' heartbeats opportunistically (cheap pid/size probe).
    for it in items:
        if it.get("detached") and it.get("status") == "active":
            try:
                bump_detached_heartbeat(it.get("run_id", ""))
            except Exception:  # noqa: BLE001
                pass
    open_n = sum(1 for it in items if it.get("status") == "active" and not it.get("archived"))
    return {"ok": True, "open": open_n, "total": len(items), "items": items}


@router.get("/run/{run_id}")
def run_detail(run_id: str, _t: str | None = Depends(optional_bearer)):
    data = get_run(run_id)
    if not data:
        raise HTTPException(status_code=404, detail="unknown run_id")
    return data


@router.post("/archive/{run_id}")
def run_archive(run_id: str, _t: str | None = Depends(optional_bearer)):
    ok = archive_run(run_id, outcome="manual_archive")
    if not ok:
        raise HTTPException(status_code=404, detail="unknown run_id")
    return {"ok": True}


class _RunBody(BaseModel):
    prompt: str
    model: str | None = "claude-sonnet-4-6"
    label: str | None = ""


_active_threads: dict[str, threading.Thread] = {}


def _spawn_whip(prompt: str, model: str, label: str) -> str:
    """Pre-create the run dir so we can return a run_id immediately; spawn whip in a thread."""
    from claude_whip import _new_run_dir, _write  # type: ignore

    run_id, rd = _new_run_dir("interactive", label or "")
    _write(os.path.join(rd, "prompt.txt"), prompt)
    _write(os.path.join(rd, "output.txt"), "")
    started = time.time()
    _write(os.path.join(rd, "status.json"),
           {"run_id": run_id, "stage": "interactive", "label": label, "model": model,
            "started": started, "status": "active", "archived": False, "queued": True})
    _write(os.path.join(rd, "heartbeat.json"),
           {"run_id": run_id, "stage": "interactive", "label": label, "model": model,
            "started": started, "elapsed": 0, "bytes_out": 0, "state": "queued"})

    def _go():
        try:
            whip_claude(prompt=prompt, model=model, stage="interactive",
                        label=label or "", soft_timeout=1800)
        except Exception:  # noqa: BLE001
            pass
        finally:
            _active_threads.pop(run_id, None)

    th = threading.Thread(target=_go, daemon=True, name=f"whip-{run_id}")
    _active_threads[run_id] = th
    th.start()
    return run_id


@router.post("/run")
def run_start(body: _RunBody, _bg: BackgroundTasks, _t: str = Depends(require_bearer)):
    prompt = (body.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="empty prompt")
    if len(prompt) > 200_000:
        raise HTTPException(status_code=413, detail="prompt too large")
    model = (body.model or "claude-sonnet-4-6").strip()
    label = (body.label or prompt[:48]).strip()
    run_id = _spawn_whip(prompt, model, label)
    return {"ok": True, "run_id": run_id}


async def _sse_stream(run_id: str):
    """Tail output.txt + heartbeat.json for this run; close when status leaves 'active'."""
    sent = 0
    last_state = ""
    idle_ticks = 0
    while True:
        data = get_run(run_id)
        if not data:
            yield "event: error\ndata: {\"error\":\"unknown run_id\"}\n\n"
            return
        chunk, sent = tail_output(run_id, from_byte=sent, max_bytes=32 * 1024)
        if chunk:
            yield "event: output\ndata: %s\n\n" % json.dumps({"chunk": chunk, "offset": sent})
            idle_ticks = 0
        st = (data.get("status") or {})
        hb = (data.get("heartbeat") or {})
        state = st.get("status") or hb.get("state") or ""
        if state != last_state:
            yield "event: status\ndata: %s\n\n" % json.dumps(
                {"status": state, "elapsed": hb.get("elapsed"), "bytes_out": hb.get("bytes_out"),
                 "idle_for": hb.get("idle_for"), "last_line": hb.get("last_line"),
                 "archived": st.get("archived"), "outcome": st.get("outcome")})
            last_state = state
        else:
            yield "event: heartbeat\ndata: %s\n\n" % json.dumps(
                {"elapsed": hb.get("elapsed"), "bytes_out": hb.get("bytes_out"),
                 "idle_for": hb.get("idle_for"), "state": hb.get("state")})
        if state not in ("active", "running", "queued", ""):
            # Drain any remaining output once, then close.
            chunk2, sent = tail_output(run_id, from_byte=sent, max_bytes=64 * 1024)
            if chunk2:
                yield "event: output\ndata: %s\n\n" % json.dumps({"chunk": chunk2, "offset": sent})
            yield "event: end\ndata: %s\n\n" % json.dumps({"status": state})
            return
        idle_ticks += 1
        if idle_ticks > 3600:  # safety: no SSE longer than ~1h even if something hangs upstream
            yield "event: end\ndata: {\"reason\":\"sse_cap\"}\n\n"
            return
        await asyncio.sleep(1.0)


@router.get("/stream/{run_id}")
async def stream(run_id: str, _t: str | None = Depends(optional_bearer)):
    return StreamingResponse(
        _sse_stream(run_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
