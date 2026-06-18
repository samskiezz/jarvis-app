"""Voice intent map for dock mini-apps.

Single source of truth mapping spoken phrases to mini-app ids in MINI_APPS
(defined in server/jarvis_live.html). The frontend's regex dispatcher remains
the primary runtime path; this module exists so backend services (NLU, agent
routing, command help) can resolve "open <app>" / "show me <app>" to a
concrete app id without duplicating phrase lists.

Additive only: extends coverage to every dock mini-app, including ones the
legacy frontend regex map missed (claude_env, nexus, selfdev, notes).
"""
from __future__ import annotations

from typing import Dict, List, Tuple

# Each entry: app_id -> list of natural aliases the user might say.
# Aliases are matched as substrings of the lowercased utterance, after
# stripping "open" / "show me" / "launch" prefixes.
APP_ALIASES: Dict[str, List[str]] = {
    "claude_env": ["claude code", "claude env", "claude environment", "claude"],
    "nexus": ["nexus", "brain map", "synapse map"],
    "syshealth": ["system health", "sys health", "health hub"],
    "intel": ["intelligence", "intel hub", "intel"],
    "scale": ["scale", "scale monitor", "feature counter"],
    "agent": ["agent", "agent os", "agent tools"],
    "selfdev": ["self improve", "self-improve", "self dev", "self-dev", "self development", "self improvement"],
    "tasks": ["tasks", "task list", "live tasks"],
    "swarms": ["swarms", "swarm"],
    "library": ["library", "gallery", "media library"],
    "search": ["graph search", "search"],
    "celestial": ["celestial", "universe", "celestial map"],
    "suggestions": ["suggestions", "ideas"],
    "budget": ["budget", "token budget", "token governor"],
    "architecture": ["architecture", "architecture map"],
    "memory": ["memory", "recall"],
    "inbox": ["inbox", "notifications"],
    "assets": ["assets", "asset library"],
    "higgsfield": ["higgsfield", "image to video"],
    "tripo3d": ["tripo", "tripo 3d", "tripo3d", "text to 3d"],
    "theme": ["theme", "ui theme"],
    "claw": ["claw", "kimi claw", "kimi", "openclaw"],
    "settings": ["settings", "preferences"],
    "panickey": ["panickey", "panic key"],
    "forgekey": ["forgekey", "forge key"],
    "intent": ["intent inbox", "intent capture", "raw idea"],
    "decision": ["decision ledger", "decision log", "decisions"],
    "compress": ["thoughtcompressor", "thought compressor", "compress thought"],
    "asset": ["assetdna", "asset dna"],
    "ritual": ["ritual deck", "ritualdeck", "ritual"],
    "mode": ["modemixer", "mode mixer", "behaviour mode", "behavior mode"],
    "spec": ["specforge", "spec forge", "spec"],
    "friction": ["frictionmap", "friction map", "friction"],
    "deadzone": ["deadzonefinder", "dead zone finder", "dead zone", "deadzone"],
    "proofpack": ["proofpack", "proof pack", "evidence pack"],
    "voiceforge": ["voiceforge", "voice forge", "12labs", "twelve labs"],
    "codepulse": ["codepulse", "code pulse", "vs code bridge"],
    "aiconsole": ["ai console", "llm console", "model console"],
    "notes": ["notes", "note", "quick notes"],
    "voicecmd": ["voice commands", "voice command", "voice help", "what can i say"],
}

_TRIGGER_PREFIXES: Tuple[str, ...] = (
    "open ",
    "show me ",
    "show ",
    "launch ",
    "go to ",
    "switch to ",
)


def resolve_app_id(utterance: str) -> str | None:
    """Return the mini-app id that matches the utterance, or None.

    Matches longest alias first so "system health" wins over "health".
    """
    if not utterance:
        return None
    text = utterance.strip().lower()
    for prefix in _TRIGGER_PREFIXES:
        if text.startswith(prefix):
            text = text[len(prefix):].strip()
            break
    candidates: List[Tuple[int, str]] = []
    for app_id, aliases in APP_ALIASES.items():
        for alias in aliases:
            if alias in text:
                candidates.append((len(alias), app_id))
                break
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


def all_phrases() -> List[Dict[str, str]]:
    """Flat list of every "open <alias>" and "show me <alias>" phrase.

    Useful for NLU training data and the voice-help catalog.
    """
    out: List[Dict[str, str]] = []
    for app_id, aliases in APP_ALIASES.items():
        for alias in aliases:
            out.append({"phrase": f"open {alias}", "app_id": app_id})
            out.append({"phrase": f"show me {alias}", "app_id": app_id})
    return out
