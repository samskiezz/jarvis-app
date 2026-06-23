"""JARVIS acoustic-analysis pipeline router (/v1/acoustic/*).

HONEST SCOPE
------------
There is NO trained marine / submarine / cetacean classifier in this repo. This
router wires the *pipeline plumbing* (classify -> contact -> map layer) around the
ONLY real classifier we have: YAMNet (room-audio, 521 AudioSet classes) via
``server/services/audio_classifier.py``. Every response is labelled
``"yamnet-general (marine model pending)"`` so nothing here can be mistaken for a
working underwater detector. The contact store is a small in-memory ring so the
Osiris map can plot operator/analyst-tagged acoustic contacts; swapping in a
trained marine model later is a one-function change (replace the classify call).

Mirrors the additive Nexus routers (registry.py / bus.py / control.py): imports
only the in-process services, never raises at import or request time, and emits
onto the shared event bus via ``jarvis_events.emit``.
"""
from __future__ import annotations

import threading
import time
from collections import deque
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..services import jarvis_events as _bus

router = APIRouter()

ACOUSTIC_MODEL = "yamnet-general (marine model pending)"
_MAX_CONTACTS = 500
_CONTACTS: "deque[dict]" = deque(maxlen=_MAX_CONTACTS)
_CONTACTS_LOCK = threading.Lock()
_seq = 0


class ClassifyBody(BaseModel):
    audio_path: str
    top_k: int = 5


class ContactBody(BaseModel):
    lat: float
    lon: float
    label: str = ""
    classification: str = ""
    confidence: Optional[float] = None
    source: str = "operator"
    meta: dict = Field(default_factory=dict)


@router.post("/v1/acoustic/classify")
async def classify(body: ClassifyBody):
    """Run the existing general-audio classifier on a wav file.

    Reuses YAMNet (room-audio, 521 classes). Returns ``available:false`` if the
    classifier service / its weights are not installed — never raises.
    """
    try:
        from ..services import audio_classifier as _ac
    except Exception as exc:  # noqa: BLE001
        return {"available": False, "classes": [], "model": ACOUSTIC_MODEL,
                "error": f"classifier_unavailable: {exc!r}"}

    try:
        res = _ac.classify(body.audio_path, top_k=body.top_k)
    except Exception as exc:  # noqa: BLE001
        return {"available": False, "classes": [], "model": ACOUSTIC_MODEL,
                "error": f"classify_failed: {exc!r}"}

    if not res.get("ok"):
        return {"available": bool(res.get("available")), "classes": [],
                "model": ACOUSTIC_MODEL, "error": res.get("error")}

    classes = [
        {"label": c.get("label"), "score": c.get("score")}
        for c in res.get("top_classes", [])
    ]
    return {
        "available": True,
        "classes": classes,
        "model": ACOUSTIC_MODEL,
        "duration_s": res.get("duration_s"),
        "latency_ms": res.get("latency_ms"),
    }


@router.post("/v1/acoustic/contact")
async def contact(body: ContactBody):
    """Store an acoustic contact (in-memory ring) and emit it on the bus.

    A contact is an operator/analyst-tagged point: a location plus whatever the
    classifier (or a human) called it. It is NOT a verified marine detection.
    """
    global _seq
    payload = {
        "lat": float(body.lat),
        "lon": float(body.lon),
        "label": body.label or "",
        "classification": body.classification or "",
        "confidence": body.confidence,
        "source": body.source or "operator",
        "model": ACOUSTIC_MODEL,
        "ts": time.time(),
        "meta": dict(body.meta or {}),
    }
    with _CONTACTS_LOCK:
        _seq += 1
        payload["id"] = _seq
        _CONTACTS.append(payload)
    try:
        _bus.emit("acoustic", "contact", payload, actor="acoustic")
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "contact": payload}


@router.get("/v1/acoustic/contacts")
async def contacts(limit: int = 200):
    """Recent acoustic contacts, newest first."""
    n = max(1, min(int(limit or 200), _MAX_CONTACTS))
    with _CONTACTS_LOCK:
        items = list(_CONTACTS)[-n:]
    items.reverse()
    return {"count": len(items), "model": ACOUSTIC_MODEL, "contacts": items}
