"""CARE SIGNAL — tiny in-memory WebRTC signalling for the Guardian / Care-Monitor feature.

Lets a vulnerable person's device (role="patient", e.g. mum's phone) and a carer's device
(role="guardian", e.g. her son's phone/browser) find each other and exchange WebRTC SDP offers,
answers and ICE candidates so a peer-to-peer two-way video+audio "walkie-talkie" can open between
them — plus out-of-band CONTROL messages (turn the camera/mic on or off remotely, switch front/back
camera, make Jarvis speak to her, SOS alert).

No external broker, no DB, no extra deps: just a thread-safe per-room message log served over plain
HTTP short-polling (the dashboard is a ThreadingHTTPServer, so concurrent polls are fine). Messages
and idle rooms are pruned automatically so memory never grows. This is signalling only — the actual
audio/video never touches the server; it flows phone-to-phone via WebRTC (STUN/TURN).
"""
from __future__ import annotations

import threading
import time

_LOCK = threading.Lock()
_ROOMS: dict[str, dict] = {}          # room -> {seq, msgs:[...], presence:{role:ts}}
_MSG_TTL = 90                         # seconds a signalling msg lives before pruning
_PEER_TTL = 14                        # a peer is "online" if it polled/posted within this many s
_ROOM_TTL = 1800                      # drop a whole room idle this long


def _now() -> float:
    return time.time()


def _room(room: str) -> dict:
    r = _ROOMS.get(room)
    if r is None:
        r = {"seq": 0, "msgs": [], "presence": {}}
        _ROOMS[room] = r
    return r


def _prune(now: float) -> None:
    dead = []
    for name, r in _ROOMS.items():
        r["msgs"] = [m for m in r["msgs"] if now - m["ts"] < _MSG_TTL]
        last = max(r["presence"].values()) if r["presence"] else 0
        if not r["msgs"] and now - last > _ROOM_TTL:
            dead.append(name)
    for name in dead:
        _ROOMS.pop(name, None)


def post(room: str, frm: str, to: str, kind: str, payload) -> dict:
    """Queue a signalling/control message addressed to the other role."""
    room = (room or "mum")[:48]
    frm = (frm or "?")[:16]
    to = (to or "?")[:16]
    now = _now()
    with _LOCK:
        r = _room(room)
        r["seq"] += 1
        r["presence"][frm] = now
        r["msgs"].append({"seq": r["seq"], "to": to, "from": frm,
                          "kind": (kind or "")[:24], "payload": payload, "ts": now})
        _prune(now)
        return {"ok": True, "seq": r["seq"]}


def poll(room: str, role: str, since: int = 0) -> dict:
    """Return messages addressed to `role` with seq>since, plus whether the peer is online.

    Polling also marks `role` as alive (presence heartbeat)."""
    room = (room or "mum")[:48]
    role = (role or "?")[:16]
    now = _now()
    with _LOCK:
        r = _room(room)
        r["presence"][role] = now
        msgs = [m for m in r["msgs"] if m["to"] == role and m["seq"] > int(since or 0)]
        top = max([m["seq"] for m in r["msgs"]], default=int(since or 0))
        peers = {who: round(now - ts, 1) for who, ts in r["presence"].items() if who != role}
        peer_online = any(now - ts < _PEER_TTL for who, ts in r["presence"].items() if who != role)
        _prune(now)
        return {"ok": True, "seq": top, "msgs": msgs, "peer_online": peer_online,
                "peers": peers, "room": room, "role": role}


def rooms() -> list:
    """Live room summary for the dashboard (who's present where)."""
    now = _now()
    out = []
    with _LOCK:
        for name, r in _ROOMS.items():
            present = {who: round(now - ts, 1) for who, ts in r["presence"].items()
                       if now - ts < _PEER_TTL}
            if present:
                out.append({"room": name, "present": present})
    return out
