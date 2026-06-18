#!/usr/bin/env python3
"""JARVIS IMU / motion-sensor service (Gap C3 #12).

In-process ring buffer for accelerometer + gyroscope samples posted by the
mobile UI via the Generic Sensor API / DeviceMotionEvent. The assistant can
query ``recent_motion(window_s=...)`` to reason about the user's posture,
activity, and gesture cues (still, walking, vehicle, falls, etc.).

How it plugs in
---------------

The browser layer (mobile, iOS Safari, modern Chrome) emits samples through
``DeviceMotionEvent``. The mobile UI POSTs batched samples to
``/v1/sensors/imu`` (see ``server/routes/sensors.py``). This service stores
them in a bounded ring buffer (default 30 minutes @ 30 Hz ≈ 54 k samples;
overflow drops the oldest).

The buffer is intentionally process-local — IMU streams are dense and ephemeral
and don't belong in the durable graph store. Downstream code (e.g. the agent)
calls :func:`recent_motion` to summarise the last N seconds.

This file ships with NO heavy deps (only stdlib) so it imports safely whether
or not optional ML libraries are present. The classifier in
``audio_classifier.py`` degrades gracefully the same way.

Wiring checklist
----------------
1. Mount :mod:`server.routes.sensors` in ``server/main.py`` — done by C3 patch.
2. Add the mobile snippet from ``README_sensors.md`` into the mobile shell.
3. Optional: relax ``Permissions-Policy`` to include
   ``accelerometer=(self), gyroscope=(self)`` on the response headers.

Thread-safety
-------------
A single ``threading.Lock`` guards the deque. The hot path is O(1) append, and
``recent_motion`` snapshots under the lock then releases before computing
aggregates so even high-rate POSTs (~100 Hz) do not contend.
"""

from __future__ import annotations

import math
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Deque, Optional

# 30 min @ 50 Hz ≈ 90 000 samples; cap at 200 000 to bound memory (~12 MB).
_MAX_SAMPLES = 200_000

_lock = threading.Lock()
_buffer: Deque["IMUSample"] = deque(maxlen=_MAX_SAMPLES)


@dataclass(frozen=True)
class IMUSample:
    """One IMU reading from the browser.

    Acceleration components are in m/s^2 (DeviceMotionEvent convention; the
    browser reports them in the device's local coordinate frame). Rotation
    components are in deg/s. ``ts`` is the server-side wall clock in seconds.
    """

    ts: float
    ax: float = 0.0
    ay: float = 0.0
    az: float = 0.0
    rx: float = 0.0  # rotationRate.alpha (deg/s)
    ry: float = 0.0  # rotationRate.beta
    rz: float = 0.0  # rotationRate.gamma
    source: str = "browser"
    meta: dict[str, Any] = field(default_factory=dict)


def _coerce_float(value: Any, default: float = 0.0) -> float:
    """Best-effort float coercion that never raises."""
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def ingest(payload: dict[str, Any] | list[dict[str, Any]]) -> dict[str, Any]:
    """Accept one sample dict or a batch list and append to the ring buffer.

    The mobile UI MAY batch (recommended: 10–50 samples per POST to keep
    network overhead low). Invalid samples are silently skipped so a malformed
    field never breaks the stream.
    """
    items: list[dict[str, Any]]
    if isinstance(payload, dict) and "samples" in payload and isinstance(payload["samples"], list):
        items = payload["samples"]
        source = str(payload.get("source") or "browser")
    elif isinstance(payload, list):
        items = payload
        source = "browser"
    elif isinstance(payload, dict):
        items = [payload]
        source = str(payload.get("source") or "browser")
    else:
        return {"ok": False, "ingested": 0, "error": "unsupported_payload"}

    now = time.time()
    ingested = 0
    with _lock:
        for raw in items:
            if not isinstance(raw, dict):
                continue
            acc = raw.get("acceleration") or raw.get("a") or {}
            rot = raw.get("rotationRate") or raw.get("r") or {}
            sample = IMUSample(
                ts=_coerce_float(raw.get("ts"), now),
                ax=_coerce_float(acc.get("x") if isinstance(acc, dict) else None),
                ay=_coerce_float(acc.get("y") if isinstance(acc, dict) else None),
                az=_coerce_float(acc.get("z") if isinstance(acc, dict) else None),
                rx=_coerce_float(rot.get("alpha") if isinstance(rot, dict) else None),
                ry=_coerce_float(rot.get("beta") if isinstance(rot, dict) else None),
                rz=_coerce_float(rot.get("gamma") if isinstance(rot, dict) else None),
                source=str(raw.get("source") or source),
                meta={k: v for k, v in raw.items() if k not in {"acceleration", "rotationRate", "a", "r", "ts", "source"}},
            )
            _buffer.append(sample)
            ingested += 1
    return {"ok": True, "ingested": ingested, "buffered": len(_buffer)}


def _activity_label(rms_acc: float, peak_acc: float, peak_rot: float) -> str:
    """Heuristic activity label derived from the windowed aggregates."""
    if rms_acc < 0.25 and peak_acc < 1.5:
        return "still"
    if rms_acc < 0.8 and peak_rot < 25.0:
        return "fidget"
    if rms_acc < 2.5:
        return "walking"
    if rms_acc < 6.0:
        return "running_or_vehicle"
    if peak_acc > 25.0:
        return "impact_or_fall"
    return "vigorous"


def recent_motion(window_s: float = 60.0) -> dict[str, Any]:
    """Summarise IMU activity over the last ``window_s`` seconds.

    Returns aggregates plus a heuristic activity label so the assistant can
    say "you've been still for the last minute" without re-implementing
    signal processing. Callers needing raw samples should use
    :func:`recent_samples`.
    """
    now = time.time()
    cutoff = now - max(0.5, float(window_s))
    with _lock:
        window = [s for s in _buffer if s.ts >= cutoff]
    if not window:
        return {
            "ok": True,
            "window_s": window_s,
            "samples": 0,
            "activity": "no_data",
            "buffered": len(_buffer),
        }

    n = len(window)
    sum_sq_acc = 0.0
    peak_acc = 0.0
    peak_rot = 0.0
    for s in window:
        a_mag = math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az)
        # Subtract 1 g so a stationary device reads ~0 instead of 9.8.
        a_linear = abs(a_mag - 9.81)
        sum_sq_acc += a_linear * a_linear
        if a_linear > peak_acc:
            peak_acc = a_linear
        r_mag = math.sqrt(s.rx * s.rx + s.ry * s.ry + s.rz * s.rz)
        if r_mag > peak_rot:
            peak_rot = r_mag
    rms_acc = math.sqrt(sum_sq_acc / n)
    label = _activity_label(rms_acc, peak_acc, peak_rot)
    return {
        "ok": True,
        "window_s": window_s,
        "samples": n,
        "activity": label,
        "rms_linear_acceleration_mps2": round(rms_acc, 4),
        "peak_linear_acceleration_mps2": round(peak_acc, 4),
        "peak_rotation_rate_dps": round(peak_rot, 4),
        "buffered": len(_buffer),
        "first_ts": window[0].ts,
        "last_ts": window[-1].ts,
    }


def recent_samples(limit: int = 200) -> list[dict[str, Any]]:
    """Return up to ``limit`` most recent raw samples (newest last)."""
    limit = max(0, min(int(limit), _MAX_SAMPLES))
    with _lock:
        snapshot = list(_buffer)[-limit:] if limit else []
    return [
        {
            "ts": s.ts,
            "ax": s.ax,
            "ay": s.ay,
            "az": s.az,
            "rx": s.rx,
            "ry": s.ry,
            "rz": s.rz,
            "source": s.source,
        }
        for s in snapshot
    ]


def status() -> dict[str, Any]:
    """Lightweight status for the dashboard."""
    with _lock:
        n = len(_buffer)
        last = _buffer[-1] if n else None
    return {
        "ok": True,
        "buffered": n,
        "capacity": _MAX_SAMPLES,
        "last_ts": last.ts if last else None,
        "last_source": last.source if last else None,
    }


def clear() -> dict[str, Any]:
    """Drop all buffered samples (used by tests)."""
    with _lock:
        n = len(_buffer)
        _buffer.clear()
    return {"ok": True, "dropped": n}


# Public API
__all__ = [
    "IMUSample",
    "clear",
    "ingest",
    "recent_motion",
    "recent_samples",
    "status",
]
