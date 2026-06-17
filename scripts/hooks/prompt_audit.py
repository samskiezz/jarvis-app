#!/usr/bin/env python3
"""Hook: UserPromptSubmit — never-miss-a-prompt guard.

Claude Code fires this on every user message. We:
  1. Append the prompt to a session log (~/.claude/prompt_audit/<session>.jsonl).
  2. Bump a per-session "pending" counter on disk.
  3. Emit a `<system-reminder>` injected into Claude's context that lists every
     pending prompt in this session so it cannot quietly miss one.

The companion `stop_guard.py` hook (Stop event) refuses to let the assistant
end its turn while pending > 0, forcing it to acknowledge each prompt.

Stdin (hook protocol): JSON with at least {session_id, prompt}.
Stdout: free-form text → injected as additional context for the assistant.
Exit 0 always (a blocking exit code on UserPromptSubmit would drop the prompt).
"""
from __future__ import annotations

import json
import os
import sys
import time

AUDIT_DIR = os.path.expanduser("~/.claude/prompt_audit")
os.makedirs(AUDIT_DIR, exist_ok=True)


def _log_path(sid: str) -> str:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in (sid or "default"))[:64] or "default"
    return os.path.join(AUDIT_DIR, f"{safe}.jsonl")


def _state_path(sid: str) -> str:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in (sid or "default"))[:64] or "default"
    return os.path.join(AUDIT_DIR, f"{safe}.state.json")


def _load_state(sid: str) -> dict:
    p = _state_path(sid)
    if not os.path.exists(p):
        return {"pending": [], "acknowledged": []}
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return {"pending": [], "acknowledged": []}


def _save_state(sid: str, state: dict):
    try:
        with open(_state_path(sid), "w", encoding="utf-8") as f:
            json.dump(state, f)
    except Exception:
        pass


def main():
    try:
        payload = json.load(sys.stdin) if not sys.stdin.isatty() else {}
    except Exception:
        payload = {}
    sid = str(payload.get("session_id") or payload.get("sessionId") or "default")
    prompt = (payload.get("prompt") or payload.get("user_prompt") or "").strip()
    if not prompt:
        return 0
    ts = int(time.time())
    pid = f"p{ts}-{len(prompt)}"
    # 1. Append to per-session log.
    try:
        with open(_log_path(sid), "a", encoding="utf-8") as f:
            f.write(json.dumps({"ts": ts, "id": pid, "prompt": prompt[:4000]}) + "\n")
    except Exception:
        pass
    # 2. Bump pending list.
    st = _load_state(sid)
    st.setdefault("pending", []).append({"id": pid, "ts": ts, "prompt": prompt[:600]})
    _save_state(sid, st)
    # 3. Inject a reminder for the assistant.
    pend = st["pending"]
    if len(pend) > 1:
        # multiple pending prompts — the situation we're trying to prevent
        lines = [f"  [{i+1}] ({p['id']}) {p['prompt'][:180]}" for i, p in enumerate(pend)]
        sys.stdout.write(
            "<system-reminder>\n"
            f"PROMPT AUDIT: {len(pend)} unacknowledged user prompts in this session.\n"
            "Address every one before ending your turn. Acknowledge each by writing\n"
            "`ACK:<prompt_id>` somewhere in your response (the stop_guard hook scans for these).\n\n"
            "Pending:\n" + "\n".join(lines) + "\n"
            "</system-reminder>\n"
        )
    else:
        sys.stdout.write(
            f"<system-reminder>PROMPT AUDIT: prompt {pid} recorded. "
            f"Acknowledge with `ACK:{pid}` in your reply so stop_guard sees it.</system-reminder>\n"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
