#!/usr/bin/env python3
"""Hook: Stop — blocks the assistant from ending its turn while user prompts are unacknowledged.

Scans the most recent assistant transcript line (passed by Claude Code on stdin
as the `transcript_path`) for `ACK:<prompt_id>` markers and removes any acknowledged
prompt from the per-session pending list. If pending prompts remain, the hook
exits with reason "blocked" and a message that re-injects the unacknowledged
prompts — Claude Code then continues the turn instead of stopping.

Exit codes (per Claude Code hook protocol):
  0    → allow stop
  2    → block stop (stdout becomes feedback to the assistant)
"""
from __future__ import annotations

import json
import os
import re
import sys

AUDIT_DIR = os.path.expanduser("~/.claude/prompt_audit")


def _safe(s: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in (s or "default"))[:64] or "default"


def _state_path(sid: str) -> str:
    return os.path.join(AUDIT_DIR, f"{_safe(sid)}.state.json")


def _load(sid: str) -> dict:
    p = _state_path(sid)
    if not os.path.exists(p):
        return {"pending": [], "acknowledged": []}
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return {"pending": [], "acknowledged": []}


def _save(sid: str, st: dict):
    try:
        with open(_state_path(sid), "w", encoding="utf-8") as f:
            json.dump(st, f)
    except Exception:
        pass


def _last_assistant_text(transcript_path: str) -> str:
    """Read the transcript and return the concatenated text of the latest assistant message."""
    if not transcript_path or not os.path.exists(transcript_path):
        return ""
    try:
        # Transcript is JSONL of messages; the last assistant message is what we care about.
        lines = open(transcript_path, encoding="utf-8", errors="replace").read().splitlines()
        text = ""
        for ln in reversed(lines):
            try:
                obj = json.loads(ln)
            except Exception:
                continue
            role = obj.get("role") or (obj.get("message") or {}).get("role")
            if role == "assistant":
                content = obj.get("content") or (obj.get("message") or {}).get("content") or ""
                if isinstance(content, list):
                    text = " ".join((b.get("text") or "") for b in content if isinstance(b, dict))
                else:
                    text = str(content)
                break
        return text
    except Exception:
        return ""


def main():
    try:
        payload = json.load(sys.stdin) if not sys.stdin.isatty() else {}
    except Exception:
        payload = {}
    sid = str(payload.get("session_id") or payload.get("sessionId") or "default")
    transcript_path = payload.get("transcript_path") or payload.get("transcriptPath") or ""

    st = _load(sid)
    pending = list(st.get("pending") or [])
    if not pending:
        return 0

    # Scan latest assistant text for ACK:<id> markers.
    text = _last_assistant_text(transcript_path)
    acked = set(re.findall(r"ACK:(p\d+-\d+)", text or ""))

    still_pending = []
    newly_acked = []
    for p in pending:
        if p.get("id") in acked:
            newly_acked.append(p)
        else:
            still_pending.append(p)

    if newly_acked:
        st["pending"] = still_pending
        st.setdefault("acknowledged", []).extend(newly_acked)
        _save(sid, st)

    if not still_pending:
        return 0  # all acknowledged → allow stop

    # Block stop with a message describing the unacknowledged prompts.
    lines = [f"  [{i+1}] {p.get('id')}: {p.get('prompt','')[:200]}" for i, p in enumerate(still_pending)]
    sys.stderr.write(
        "STOP BLOCKED — unacknowledged user prompts in this session:\n"
        + "\n".join(lines) + "\n"
        "Address each prompt above, then write `ACK:<id>` in your response to clear it.\n"
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
