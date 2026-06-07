""""Daddy's Home" Scene Orchestrator — the Iron Man 2 scene parity engine.

Generates a structured greeting for Sam when he arrives, synthesizing:
  * personalized salutation (from persona)
  * status summary — what's happened since last login
  * health alerts — system/user health warnings
  * simulation results — completed/failed background sims
  * pending proposals — items awaiting approval
  * wit — a dry one-liner from the active persona

Must be callable from chat and from the proactive loop. Never raises.
"""

from __future__ import annotations

import os
import time
from typing import Any, Optional

from ..data.ontology import OBJECTS, RISK_SIGNALS

try:
    from ..services import persona_engine as _pe
except Exception:  # noqa: BLE001
    _pe = None  # type: ignore[assignment]

try:
    from ..data import memory_store as _mem
except Exception:  # noqa: BLE001
    _mem = None  # type: ignore[assignment]

try:
    from ..services import jarvis_os as _jos
except Exception:  # noqa: BLE001
    _jos = None  # type: ignore[assignment]

try:
    from ..services import proactive_loop as _pl
except Exception:  # noqa: BLE001
    _pl = None  # type: ignore[assignment]

try:
    from ..services import simulation as _sim
except Exception:  # noqa: BLE001
    _sim = None  # type: ignore[assignment]


# ── Wit bank (fallback if persona engine is unavailable) ─────────────────────
_WIT_LINES = [
    "The house is in order, sir. Relatively speaking.",
    "Welcome home, sir. I have taken the liberty of preparing a status briefing.",
    "All systems functional. Your coffee, however, remains beyond my reach.",
    "Good evening, sir. The world has not ended in your absence. A modest victory.",
    "At your service, sir. I have catalogued the chaos so you need not.",
]


def _pick_wit(persona_id: str | None = None) -> str:
    import random

    if persona_id == "tactical":
        return "Tactical systems online. Standing by for orders."
    return random.choice(_WIT_LINES)


# ── Greeting builder ─────────────────────────────────────────────────────────

async def generate_greeting(user_id: str, context: dict | None = None) -> dict:
    """Return a structured 'Daddy's Home' greeting.

    Args:
        user_id: The principal's identifier.
        context: Optional dict with hints (e.g. ``{"source": "chat"}``).

    Returns::

        {
            "salutation": str,
            "status_summary": str,
            "health_alerts": list[dict],
            "simulation_results": list[dict],
            "pending_proposals": list[dict],
            "wit": str,
            "persona": str,
        }
    """
    uid = str(user_id or "anonymous")
    ctx = context or {}

    # Persona
    persona = "butler"
    if _pe is not None:
        try:
            persona = _pe.get_active_persona(uid)
        except Exception:  # noqa: BLE001
            pass

    # Salutation
    hour = time.localtime().tm_hour
    if 5 <= hour < 12:
        time_greeting = "Good morning"
    elif 12 <= hour < 18:
        time_greeting = "Good afternoon"
    else:
        time_greeting = "Good evening"

    salutation = f"{time_greeting}, sir. Welcome home."
    if persona == "tactical":
        salutation = f"{time_greeting}. Tactical systems nominal."

    # Status summary — ontology changes + recent risk signals
    status_parts: list[str] = []
    high_risks = [r for r in RISK_SIGNALS if r.get("severity", 0) >= 60]
    if high_risks:
        status_parts.append(
            f"{len(high_risks)} elevated risk signal(s) active, highest severity {high_risks[0]['severity']}."
        )
    else:
        status_parts.append("No elevated risk signals at this time.")
    status_summary = " ".join(status_parts)

    # Health alerts
    health_alerts: list[dict] = []
    if _jos is not None:
        try:
            metrics = _jos.metrics()
            if metrics.get("error_rate", 0) > 0.05:
                health_alerts.append({
                    "severity": "warning",
                    "title": "Elevated error rate",
                    "body": f"System error rate is {metrics['error_rate']:.1%} over {metrics.get('spans', 0)} spans.",
                })
        except Exception:  # noqa: BLE001
            pass

    # Simulation results
    simulation_results: list[dict] = []
    if _sim is not None:
        try:
            # simulation module has a list_results or similar function?
            # We introspect gently.
            if hasattr(_sim, "list_results"):
                sims = _sim.list_results(limit=5)
                if isinstance(sims, list):
                    simulation_results = sims
            elif hasattr(_sim, "recent"):
                sims = _sim.recent(limit=5)
                if isinstance(sims, list):
                    simulation_results = sims
        except Exception:  # noqa: BLE001
            pass

    # Pending proposals
    pending_proposals: list[dict] = []
    if _jos is not None:
        try:
            pending = _jos.approvals(status="pending", limit=5)
            pending_proposals = pending if isinstance(pending, list) else []
        except Exception:  # noqa: BLE001
            pass

    # Wit
    wit = _pick_wit(persona)

    # Optionally personalize with memory
    if _mem is not None:
        try:
            mems = await _mem.recall(uid, key="preference", limit=3)
            if mems:
                status_summary += f" I note {len(mems)} stored preference(s)."
        except Exception:  # noqa: BLE001
            pass

    return {
        "salutation": salutation,
        "status_summary": status_summary,
        "health_alerts": health_alerts,
        "simulation_results": simulation_results,
        "pending_proposals": pending_proposals,
        "wit": wit,
        "persona": persona,
        "source": ctx.get("source", "api"),
    }
