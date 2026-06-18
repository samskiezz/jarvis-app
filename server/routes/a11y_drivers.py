"""Accessibility-driver registry routes (Cluster C4 gap-fixes #1/#2/#5/#6).

Two endpoints:

    GET  /v1/a11y/drivers
        Returns a status snapshot of every driver (gaze, switch, screen
        reader, dwell). Browser-side drivers report ``ok=True`` plus the
        bootstrap config the client needs; server-side drivers report
        whether the SDK / hardware is present.

    POST /v1/a11y/drivers/{name}/activate
        Best-effort activation for a single driver. ``name`` is one of:
        ``webgazer``, ``tobii``, ``web_bluetooth``, ``usb_hid``, ``nvda``,
        ``voiceover``, ``dwell``. Body is an optional JSON object passed
        as kwargs (e.g. ``{"text": "Hello"}`` to make the screen reader
        speak). Never raises 5xx for missing hardware — returns
        ``ok=False`` with a ``reason`` instead, so the UI can route the
        user to the right install/purchase step.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException

from ..services import a11y_drivers as drv

router = APIRouter(prefix="/v1/a11y", tags=["accessibility"])


@router.get("/drivers")
def get_drivers_status() -> dict[str, Any]:
    return drv.status()


@router.post("/drivers/{name}/activate")
def activate_driver(name: str, body: dict[str, Any] | None = Body(default=None)) -> dict[str, Any]:
    d = drv.get_driver(name)
    if d is None:
        raise HTTPException(status_code=404, detail=f"unknown a11y driver: {name}")
    kwargs = body or {}
    if not isinstance(kwargs, dict):
        raise HTTPException(status_code=400, detail="body must be a JSON object")
    return d.activate(**kwargs)
