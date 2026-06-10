#!/usr/bin/env python3
"""UserPromptSubmit hook — auto-capture explicit build/do/run requests into FEATURES.md.

Fires on EVERY chat message. If the message contains an explicit ACTION verb (make/build/do/run/
create/implement/add/wire/fix/execute/...), it is appended to FEATURES.md under a dedicated
"CAPTURED REQUESTS" section as a 🔴 todo — so the request is logged permanently and never dropped,
to be executed (queued as a swarm) accordingly. Pure-question / conversational messages are ignored.

Append-only + silent (no stdout) so it never injects into the model context or blocks the prompt.
"""
import sys
import json
import re
import os
import time

FEATURES = "/opt/jarvis-app-1/FEATURES.md"
SECTION = "## CAPTURED REQUESTS (auto-logged from chat — explicit make/do/run, execute accordingly)"
# explicit action verbs that mean "do this"
ACTION = re.compile(r"\b(make|build|do|run|create|implement|add|wire|fix|execute|generate|design|"
                    r"give jarvis|set ?up|enable|connect|render|apply|integrate|deploy)\b", re.I)
# skip pure status/meta questions so we don't log "why hasn't X" type messages
SKIP = re.compile(r"^\s*(why|what|where|how|when|who|is |are |did |does |can you (check|tell|show|see)|"
                  r"hows|how's|status|update me)", re.I)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:  # noqa: BLE001
        return
    prompt = (data.get("prompt") or data.get("user_prompt") or "").strip()
    if not prompt or len(prompt) < 4:
        return
    if SKIP.match(prompt):
        return
    if not ACTION.search(prompt):
        return
    one = " ".join(prompt.split())[:600]
    stamp = time.strftime("%Y-%m-%d %H:%M")
    try:
        txt = open(FEATURES).read() if os.path.exists(FEATURES) else ""
        with open(FEATURES, "a") as f:
            if SECTION not in txt:
                f.write("\n\n" + SECTION + "\n")
            f.write("- \U0001f534 [%s] %s\n" % (stamp, one))
    except Exception:  # noqa: BLE001
        pass


if __name__ == "__main__":
    main()
