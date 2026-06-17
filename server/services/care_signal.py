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

Reliability hardening (the lifeline is a vulnerable person's link): stale peers are evicted on a
heartbeat window (not only when the whole room dies); the patient's "tap to connect" is recorded as a
first-class CONSENT event; every remote co-control action (cam/mic/flip/ring/speak/sos) is written to
an append-only audit trail (with `speak` text redacted to <text> for data-minimisation), mirrored to
the `care.audit` process logger so a durable record survives the bounded in-memory ring.
"""
from __future__ import annotations

import logging
import threading
import time

_LOCK = threading.Lock()
_ROOMS: dict[str, dict] = {}          # room -> {seq, msgs:[...], presence:{role:ts}, audit:[...], _name}
_MSG_TTL = 90                         # seconds a signalling msg lives before pruning
_PEER_TTL = 14                        # a peer is "online" if it polled/posted within this many s
_PRESENCE_TTL = 30                    # evict a peer absent this long (>> 800ms poll, < the 40s client alarm)
_ROOM_TTL = 1800                      # drop a whole room idle this long
_AUDIT_MAX = 500                      # per-room append-only audit ring cap (memory bound)

_AUDIT_LOG = logging.getLogger("care.audit")


def _now() -> float:
    return time.time()


def _room(room: str) -> dict:
    r = _ROOMS.get(room)
    if r is None:
        r = {"seq": 0, "msgs": [], "presence": {}, "audit": [], "_name": room}
        _ROOMS[room] = r
    return r


def _audit(r: dict, now: float, actor: str, action: str, detail) -> None:
    """Append-only care audit: bounded in-memory ring + a structured process-log line
    (so a durable trail survives outside the ring). Never rewrites history; drops oldest."""
    ev = {"ts": now, "actor": (actor or "?")[:16], "action": (action or "?")[:24], "detail": detail}
    log = r.setdefault("audit", [])
    log.append(ev)
    if len(log) > _AUDIT_MAX:
        del log[: len(log) - _AUDIT_MAX]
    try:
        _AUDIT_LOG.info("care_audit room=%s actor=%s action=%s detail=%s",
                        r.get("_name", "?"), ev["actor"], ev["action"], detail)
    except Exception:  # noqa: BLE001
        pass


def _prune(now: float) -> None:
    dead = []
    for name, r in _ROOMS.items():
        r["msgs"] = [m for m in r["msgs"] if now - m["ts"] < _MSG_TTL]
        # Evict peers that have gone silent past the heartbeat window, recording a "left" event,
        # so `peers`/presence reflect reality instead of holding a long-dead role.
        for who, ts in list(r.get("presence", {}).items()):
            if now - ts > _PRESENCE_TTL:
                r["presence"].pop(who, None)
                _audit(r, now, who, "left", {"silent_for": round(now - ts, 1)})
        last = max(r["presence"].values()) if r["presence"] else 0
        if not r["msgs"] and not r["presence"] and now - last > _ROOM_TTL:
            dead.append(name)
    for name in dead:
        _ROOMS.pop(name, None)


def post(room: str, frm: str, to: str, kind: str, payload) -> dict:
    """Queue a signalling/control message addressed to the other role."""
    room = (room or "mum")[:48]
    frm = (frm or "?")[:16]
    to = (to or "?")[:16]
    kind = (kind or "")[:24]
    now = _now()
    with _LOCK:
        r = _room(room)
        r["seq"] += 1
        r["presence"][frm] = now
        r["msgs"].append({"seq": r["seq"], "to": to, "from": frm,
                          "kind": kind, "payload": payload, "ts": now})
        # Consent + co-control audit (best-effort; never affects signalling).
        if kind == "hello":
            if frm == "patient":
                # the patient announcing presence on the care page == she tapped "TAP TO CONNECT"
                _audit(r, now, frm, "consent",
                       {"surface": "care", "granted": True,
                        "sos": bool(isinstance(payload, dict) and payload.get("sos"))})
            else:
                _audit(r, now, frm, "joined", {"role": frm})
        elif kind == "ctrl" and isinstance(payload, dict):
            for key in ("cam", "mic", "flip", "ring", "sos", "speak"):
                if key in payload:
                    # data-minimisation: record THAT the guardian spoke + when, never the text body
                    redacted = "<text>" if key == "speak" else payload[key]
                    _audit(r, now, frm, f"control:{key}", {key: redacted})
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
        # server-clock freshness of the OTHER peer, so the guardian dead-man's-switch can cross-check
        # against the server (defence in depth) rather than only its own loop.
        peer_seen = [now - ts for who, ts in r["presence"].items() if who != role]
        _prune(now)
        return {"ok": True, "seq": top, "msgs": msgs, "peer_online": peer_online,
                "peers": peers, "room": room, "role": role,
                "peer_last_seen": round(min(peer_seen), 1) if peer_seen else None}


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


def audit(room: str, since_ts: float = 0.0) -> list:
    """Append-only care audit trail for a room (read-only; newest events have larger ts).

    Surfaces consent / remote co-control / presence events for caregiver accountability.
    No delete/edit accessor is exposed by design."""
    room = (room or "mum")[:48]
    with _LOCK:
        r = _ROOMS.get(room)
        return [dict(e) for e in r["audit"] if e["ts"] > since_ts] if r else []
