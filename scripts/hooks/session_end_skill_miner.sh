#!/bin/bash
# SessionEnd hook — auto-learn skills from the session that just ended.
#
# Runs scripts/skill_miner.py in --since-session mode against the just-ended
# session's transcript. New patterns get written to ~/.claude/skills/, so the
# skill catalog grows automatically as I learn — no manual extraction step.
# Failures are silent so a broken miner cannot trap session shutdown.

set +e

SID=$(python3 -c "
import json, sys
try:
    p = json.load(sys.stdin)
    print(p.get('session_id') or p.get('sessionId') or '')
except Exception:
    print('')
" 2>/dev/null)

if [ -z "$SID" ]; then
    exit 0
fi

# Cap at 5 new clusters per session so a chatty session doesn't flood skills.
# --no-brain since the local Ollama brain may be down; deterministic templates
# are good enough for the seed pattern.
timeout 60 python3 /opt/jarvis-app-1/scripts/skill_miner.py \
    --since-session "$SID" \
    --top 5 \
    --min-cluster 1 \
    --no-brain \
    >> /opt/jarvis-app-1/server/data/skill_miner.log 2>&1

exit 0
