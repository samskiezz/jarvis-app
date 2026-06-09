"""CLIMATE RELAY — the VPS-side brain stem for home aircon control (Daikin ducted via Polyaire
AirTouch 5, console 94302563). Lets JARVIS keep the disabled mother warm — "Jarvis I am cold"
raises her zone — while being HONEST about the network: neither the Hostinger VPS nor the Vast GPU
box is on the home LAN, and a phone browser cannot open raw TCP/UDP. So this module holds NO socket
and speaks NO AirTouch protocol. It is purely a thread-safe relay:

    voice/chat page  --POST /climate/cmd-->  [QUEUE]  <--GET /climate/poll-- home bridge
                                                                               (executes on :9005)
    voice/chat page  <--GET /climate/state--  [STATE] <--POST /climate/report-- home bridge

The home bridge (server/services/airtouch5_bridge.py) runs on a device on the HOME LAN and connects
OUTBOUND to the VPS, so it works through home NAT with no port-forwarding. The VPS never reaches into
the home network.

This module also owns the natural-language INTENT PARSER so the dashboard can route phrases like
"I am cold", "set the lounge to 23", "what is the temperature", "which zones" straight to climate
control instead of the Claude builder, and can phrase JARVIS's spoken confirmation. Stdlib only.

State shape (cached from the bridge's /climate/report):
    {
      "connected": bool,            # is a bridge currently feeding us state?
      "ts": float,                  # when the bridge last reported
      "console_id": str|None,       # verified console serial (target 94302563)
      "zones": [ {number,name,power,control,temperature,set_point,open_percentage,
                  has_sensor,spill,low_battery}, ... ],
      "acs":   [ {number,name,power,mode,fan,setpoint,temperature,error,
                  min_heat,max_heat,min_cool,max_cool}, ... ],
      "error": str|None,            # last bridge-reported execution error
    }
"""
from __future__ import annotations

import re
import threading
import time

# Target console serial (the AirTouch 5 touchscreen) — used to verify the bridge talks to the right
# system when several respond to a broadcast.
TARGET_CONSOLE_ID = "94302563"

# How much "I am cold/warmer" nudges a zone's target, and the absolute safety clamp (the bridge also
# clamps to the AC's reported min/max heat setpoint; this is a belt-and-braces guard on the VPS).
BUMP_STEP_C = 1.0
SAFE_MIN_C = 16.0
SAFE_MAX_C = 30.0

# A command is considered stale (bridge never picked it up) after this long; a state report older
# than the freshness window means the bridge has gone away.
_CMD_TTL = 120.0
_STATE_FRESH = 45.0

_LOCK = threading.Lock()
_QUEUE: list[dict] = []          # pending commands FIFO, each: {id, op, ts, ...}
_DONE: dict[int, dict] = {}      # id -> result reported by the bridge (for optional ack lookups)
_SEQ = 0
_STATE: dict = {                 # last-known state pushed by the bridge
    "connected": False, "ts": 0.0, "console_id": None,
    "zones": [], "acs": [], "error": None,
}
_BRIDGE_LAST_POLL = 0.0          # last time the bridge polled (proves it is alive even when idle)


def _now() -> float:
    return time.time()


def _prune(now: float) -> None:
    """Drop commands the bridge never collected, and cap the done-log."""
    global _QUEUE
    _QUEUE = [c for c in _QUEUE if now - c["ts"] < _CMD_TTL]
    if len(_DONE) > 200:
        for k in sorted(_DONE)[:-100]:
            _DONE.pop(k, None)


# ---------------------------------------------------------------------------
# Command queue (voice/chat -> bridge)
# ---------------------------------------------------------------------------
def enqueue(cmd: dict) -> dict:
    """Queue a normalised command for the home bridge. Returns {ok, id, connected}.

    `cmd` ops (validated lightly here; the bridge does the real AirTouch work):
      warmer / cooler            : nudge the warm zone (or zone N) by +/- BUMP_STEP_C, ensure heat+on
      set_zone_temp {zone, value}: set a zone's target setpoint (by number or name)
      set_zone_power {zone, on}  : turn a zone on/off
      set_ac_mode    {ac, mode}  : heat/cool/auto/fan/dry
      set_ac_temp    {ac, value} : set the AC unit setpoint
      set_ac_power   {ac, on}    : AC on/off
      refresh                    : just ask the bridge to push fresh state
    """
    global _SEQ
    op = (cmd or {}).get("op")
    if op not in {"warmer", "cooler", "set_zone_temp", "set_zone_power",
                  "set_ac_mode", "set_ac_temp", "set_ac_power", "refresh"}:
        return {"ok": False, "error": f"bad op {op!r}"}
    now = _now()
    with _LOCK:
        _SEQ += 1
        rec = {"id": _SEQ, "ts": now}
        rec.update({k: v for k, v in cmd.items() if k != "id" and k != "ts"})
        _QUEUE.append(rec)
        _prune(now)
        return {"ok": True, "id": _SEQ, "connected": _bridge_alive(now)}


def poll(max_n: int = 16) -> dict:
    """Bridge pulls (and dequeues) pending commands. Marks the bridge alive."""
    global _BRIDGE_LAST_POLL, _QUEUE
    now = _now()
    with _LOCK:
        _BRIDGE_LAST_POLL = now
        batch = _QUEUE[:max_n]
        _QUEUE = _QUEUE[len(batch):]
        _prune(now)
        return {"ok": True, "commands": batch, "ts": now}


def report(payload: dict) -> dict:
    """Bridge pushes latest full state (+ optional per-command results)."""
    now = _now()
    with _LOCK:
        st = {
            "connected": bool(payload.get("connected", True)),
            "ts": now,
            "console_id": payload.get("console_id"),
            "zones": payload.get("zones") or [],
            "acs": payload.get("acs") or [],
            "error": payload.get("error"),
        }
        _STATE.update(st)
        for r in (payload.get("results") or []):
            try:
                _DONE[int(r.get("id"))] = r
            except (TypeError, ValueError):
                pass
        return {"ok": True}


def _bridge_alive(now: float) -> bool:
    """The bridge is considered connected if it polled OR reported within the freshness window."""
    return (now - _BRIDGE_LAST_POLL < _STATE_FRESH) or (now - _STATE.get("ts", 0) < _STATE_FRESH)


def state() -> dict:
    """Voice/chat reads the cached last-known state. `connected` reflects bridge liveness AND data
    freshness so the UI can be honest ('I can't reach the heating yet')."""
    now = _now()
    with _LOCK:
        alive = _bridge_alive(now)
        out = dict(_STATE)
        out["connected"] = alive and bool(_STATE.get("zones") or _STATE.get("acs"))
        out["bridge_alive"] = alive
        out["age"] = round(now - _STATE.get("ts", 0), 1) if _STATE.get("ts") else None
        out["pending"] = len(_QUEUE)
        out["target_console_id"] = TARGET_CONSOLE_ID
        return out


# ---------------------------------------------------------------------------
# Zone helpers (used by intent parser + spoken confirmation)
# ---------------------------------------------------------------------------
# Phrases that mean "the room the mother is in" so "I am cold" warms HER zone without naming it.
# PERSON hints (her room by name) take priority over generic ROOM hints, so "Mum's Room" beats
# "Lounge" when both exist — the whole point is keeping the mother warm.
_PERSON_ZONE_HINTS = ("mum", "mother", "mom", "nanna", "nan", "grandma", "her ")
_ROOM_ZONE_HINTS = ("lounge", "living", "bed")
_WARM_ZONE_HINTS = _PERSON_ZONE_HINTS + _ROOM_ZONE_HINTS


def _zones() -> list[dict]:
    with _LOCK:
        return list(_STATE.get("zones") or [])


def find_zone(name_or_num) -> dict | None:
    """Resolve a spoken zone reference to a known zone dict. Accepts a number, an exact-ish name,
    or a substring (case-insensitive). Returns None if nothing matches."""
    zs = _zones()
    if not zs:
        return None
    # numeric
    try:
        n = int(name_or_num)
        for z in zs:
            if int(z.get("number", -1)) == n:
                return z
    except (TypeError, ValueError):
        pass
    s = str(name_or_num or "").strip().lower()
    if not s:
        return None
    for z in zs:                                   # exact name
        if str(z.get("name", "")).strip().lower() == s:
            return z
    for z in zs:                                   # substring either direction
        zn = str(z.get("name", "")).strip().lower()
        if zn and (s in zn or zn in s):
            return z
    return None


def warm_zone() -> dict | None:
    """Best guess at the mother's zone for "I am cold": prefer a zone whose name hints at her room;
    else the zone that currently has a temperature sensor and is on; else the first zone."""
    zs = _zones()
    if not zs:
        return None
    for hints in (_PERSON_ZONE_HINTS, _ROOM_ZONE_HINTS):   # person's room first, then generic rooms
        for z in zs:
            nm = str(z.get("name", "")).lower()
            if any(h.strip() in nm for h in hints):
                return z
    for z in zs:
        if z.get("has_sensor") and z.get("power") in ("ON", "TURBO"):
            return z
    for z in zs:
        if z.get("has_sensor"):
            return z
    return zs[0]


def clamp_c(v: float) -> float:
    return max(SAFE_MIN_C, min(SAFE_MAX_C, round(float(v) * 2) / 2))  # 0.5°C grid, safe range


# ---------------------------------------------------------------------------
# Natural-language intent parser  (the bit that keeps climate off the Claude builder)
# ---------------------------------------------------------------------------
_NUM = r"(\d{1,2}(?:\.\d)?)"


def parse_intent(text: str) -> dict | None:
    """Map a spoken/typed phrase to a climate command + a JARVIS-style spoken confirmation.

    Returns a dict {op,...,"speak":..., optionally "query":True} when the phrase is a climate
    request, else None (so the caller falls through to normal chat/builder). Pure & side-effect free
    so it is trivially unit-testable. Confirmations are phrased warmly for the disabled mother."""
    if not text:
        return None
    t = " " + text.lower().strip() + " "
    t = t.replace("’", "'")

    # ---- queries (read-only) ----
    if re.search(r"\b(what('?s| is)?|how warm|how cold|how hot)\b.*\b(temp|temperature|degrees?|warm|cold|hot)\b", t) \
            or re.search(r"\b(temperature|how warm is it|how cold is it)\b", t):
        return {"op": "refresh", "query": "temperature", "speak": None}
    if re.search(r"\b(which|what|list|name)\b.*\bzones?\b", t) or re.search(r"\bzones?\b.*\b(are there|do (i|we) have)\b", t):
        return {"op": "refresh", "query": "zones", "speak": None}
    if re.search(r"\b(climate|aircon|air con|heating|cooling|status)\b.*\b(status|state|on|how)\b", t):
        return {"op": "refresh", "query": "status", "speak": None}

    # ---- set a named/numbered zone to N degrees: "set the lounge to 23" ----
    m = re.search(r"\b(?:set|change|put|make)\s+(?:the\s+)?(.+?)\s+(?:zone\s+)?to\s+" + _NUM, t)
    if m:
        zone = m.group(1).strip().rstrip("'s").strip()
        val = clamp_c(float(m.group(2)))
        return {"op": "set_zone_temp", "zone": zone, "value": val,
                "speak": f"Setting the {zone} to {val:g} degrees now."}

    # ---- bare "set it/the heating to N" -> warm zone ----
    m = re.search(r"\b(?:set|change|put|make)\s+(?:it|the (?:heating|aircon|air con|temperature))\s+to\s+" + _NUM, t)
    if m:
        val = clamp_c(float(m.group(1)))
        return {"op": "set_ac_temp", "value": val,
                "speak": f"Setting the temperature to {val:g} degrees now."}

    # ---- turn zone on/off: "turn off the study", "turn the bedroom on" ----
    m = re.search(r"\bturn\s+(on|off)\s+(?:the\s+)?(.+?)\s*(?:zone)?\s$", t) \
        or re.search(r"\bturn\s+(?:the\s+)?(.+?)\s+(on|off)\b", t)
    if m:
        g = m.groups()
        on = (g[0] == "on") if g[0] in ("on", "off") else (g[1] == "on")
        zone = (g[1] if g[0] in ("on", "off") else g[0]).strip()
        if zone in ("heating", "the heating", "heat", "aircon", "air con", "ac", "it"):
            return {"op": "set_ac_power", "on": on,
                    "speak": f"Turning the {'heating on' if on else 'heating off'} now."}
        return {"op": "set_zone_power", "zone": zone, "on": on,
                "speak": f"Turning the {zone} {'on' if on else 'off'} now."}

    # ---- mode: "set it to heat/cool/auto/fan/dry", "heating please" ----
    m = re.search(r"\b(?:set|switch|change|put)\b.*\bto\s+(heat|heating|cool|cooling|auto|fan|dry)\b", t) \
        or re.search(r"\b(heat|heating|cool|cooling)\b\s*(?:mode|please|now|on)?\s$", t)
    if m:
        raw = m.group(1)
        mode = {"heating": "heat", "cooling": "cool"}.get(raw, raw)
        return {"op": "set_ac_mode", "mode": mode,
                "speak": f"Switching to {mode} mode now."}

    # ---- "I am cold / warmer / too cold" -> warm her zone ----
    if re.search(r"\b(i'?m|i am|feeling|it'?s|its|too)\b.*\b(cold|chilly|freezing|cool|warmer|warm up)\b", t) \
            or re.search(r"\b(warm(er)?( me| it| up)?|put the heat(ing)? up|turn up the heat(ing)?|i'?m cold)\b", t):
        return {"op": "warmer", "speak": None}   # speak filled after we know the zone+target

    # ---- "I am hot / cooler / too warm" -> cool her zone ----
    if re.search(r"\b(i'?m|i am|feeling|it'?s|its|too)\b.*\b(hot|warm|stuffy|boiling|cooler|cool down)\b", t) \
            or re.search(r"\b(cool(er)?( me| it| down)?|put the heat(ing)? down|turn down the heat(ing)?|i'?m hot)\b", t):
        return {"op": "cooler", "speak": None}

    return None
