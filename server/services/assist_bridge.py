#!/usr/bin/env python3
"""JARVIS Assistant bridge — the web brain ⇄ phone companion command channel.

The Android companion app (AccessibilityService + keyboard) connects here and JARVIS drives the phone
through it: "type this", "tap there", "open WhatsApp", "press home". The web page asks /assist/status to
know whether her companion is connected (so it can auto-offer the install when it isn't).

Endpoints (wired in dashboard.py):
  POST /assist/register {device_id, platform, name}     -> app announces itself (call on launch + heartbeat)
  GET  /assist/status                                    -> {connected, devices:[...]}  (web: is the app live?)
  POST /assist/cmd      {device_id, type, ...}           -> web queues a command for the phone
  GET  /assist/poll?device_id=&since=                    -> app long-ish polls for new commands
  POST /assist/ack      {device_id, cmd_id, ok, result}  -> app reports a command's outcome

Deliberately simple + dependency-free: an in-memory store mirrored to a JSON file so it survives a
dashboard restart. A device counts as "connected" if it registered/polled in the last CONNECT_TTL secs.
"""
import json
import os
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATE_PATH = os.path.join(ROOT, "server", "data", "assist_bridge.json")
CONNECT_TTL = 40           # a device seen within this many seconds is "connected"
CMD_TTL = 120              # unacked commands older than this are dropped
MAX_CMDS = 200

_LOCK = threading.Lock()
_S = {"devices": {}, "cmds": []}   # devices: id -> {platform,name,last_seen}; cmds: [{id,device_id,type,...}]
_SEQ = {"n": 0}


def _now() -> int:
    return int(time.time())


def _load():
    try:
        with open(STATE_PATH) as f:
            d = json.load(f)
            _S["devices"] = d.get("devices", {})
            _S["cmds"] = d.get("cmds", [])
            _SEQ["n"] = d.get("seq", 0)
    except Exception:  # noqa: BLE001
        pass


def _save():
    try:
        tmp = STATE_PATH + ".tmp"
        with open(tmp, "w") as f:
            json.dump({"devices": _S["devices"], "cmds": _S["cmds"], "seq": _SEQ["n"]}, f)
        os.replace(tmp, STATE_PATH)
    except Exception:  # noqa: BLE001
        pass


_load()


def register(device_id: str, platform: str = "", name: str = "") -> dict:
    device_id = (device_id or "").strip()[:64]
    if not device_id:
        return {"ok": False, "error": "device_id required"}
    with _LOCK:
        d = _S["devices"].get(device_id, {})
        d.update(platform=(platform or d.get("platform") or "")[:24],
                 name=(name or d.get("name") or "")[:48], last_seen=_now())
        _S["devices"][device_id] = d
        _save()
    return {"ok": True, "device_id": device_id}


def status() -> dict:
    now = _now()
    with _LOCK:
        devs = []
        for did, d in _S["devices"].items():
            seen = d.get("last_seen", 0)
            devs.append({"device_id": did, "platform": d.get("platform"), "name": d.get("name"),
                         "last_seen": seen, "connected": (now - seen) <= CONNECT_TTL})
        connected = any(x["connected"] for x in devs)
    return {"ok": True, "connected": connected, "devices": devs}


def queue_cmd(device_id: str, ctype: str, payload: dict = None) -> dict:
    ctype = (ctype or "").strip()[:24]
    if not ctype:
        return {"ok": False, "error": "type required"}
    with _LOCK:
        _SEQ["n"] += 1
        cmd = {"id": _SEQ["n"], "device_id": (device_id or "").strip()[:64] or "*",
               "type": ctype, "payload": payload or {}, "ts": _now(), "acked": False}
        _S["cmds"].append(cmd)
        # prune old/over-cap
        cutoff = _now() - CMD_TTL
        _S["cmds"] = [c for c in _S["cmds"] if c["ts"] >= cutoff][-MAX_CMDS:]
        _save()
    return {"ok": True, "cmd_id": cmd["id"]}


def poll(device_id: str, since: int = 0) -> dict:
    device_id = (device_id or "").strip()[:64]
    # polling IS a heartbeat — keep the device "connected"
    if device_id:
        register(device_id)
    with _LOCK:
        out = [c for c in _S["cmds"]
               if c["id"] > since and not c["acked"] and c["device_id"] in (device_id, "*")]
    return {"ok": True, "cmds": out, "now": _now()}


def ack(device_id: str, cmd_id: int, ok: bool = True, result: str = "") -> dict:
    with _LOCK:
        for c in _S["cmds"]:
            if c["id"] == cmd_id:
                c["acked"] = True
                c["result"] = (result or "")[:200]
                c["ok"] = bool(ok)
        _save()
    return {"ok": True}
