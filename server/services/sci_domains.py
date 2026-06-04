"""Science Domains Catalog — curated capability consoles over the science engine.

This module composes :mod:`server.services.science_bridge` (it never imports the
underworld registry directly and never edits the bridge). It groups the live
489-method registry into ~14 human-named *consoles* (Sonar/Submarine,
Meteorites/Asteroids, Buoys/Ocean, ppm/Air-quality, Flight/Aerospace,
Frequency/RF, Neuron/Neural, Seismic, Satellites, Clusters, Epidemic-network,
Quantum, Materials, Trajectory) so the UI (P14 #91-104) can present focused
dashboards.

Design rules (mirroring the bridge):
  * Never raise. Every public function returns a JSON-safe shape; if the engine
    is unavailable the catalog stays honest (counts 0, methods empty + a note).
  * Honest counts/methods only — we never fabricate a method or a result. The
    actual run is delegated straight to ``science_bridge.run_method``.

Console selection is keyword-driven: each console declares ``keywords`` that are
matched as case-insensitive substrings against a method's key, domain, aliases
and first doc line. This keeps the mapping resilient as the registry grows.
"""
from __future__ import annotations

from typing import Any

from . import science_bridge

# ---------------------------------------------------------------------------
# Curated console catalog. ``keywords`` are substrings used to select methods
# from the live registry; ``examples`` are sensible, runnable {field, value}
# defaults so each console ships with working demos.
# ---------------------------------------------------------------------------
_DOMAINS: list[dict[str, Any]] = [
    {
        "id": "sonar",
        "label": "Sonar / Submarine Acoustics",
        "icon": "waveform",
        "blurb": "Underwater acoustics: transmission loss, Doppler, speed of sound, reverberation.",
        "keywords": ["sonar", "acoustic", "transmission_loss", "doppler", "speed_of_sound",
                     "reverberation", "decibel", "beat_freq", "organ_pipe"],
        "examples": [
            {"field": "transmission_loss", "value": {}},
            {"field": "doppler", "value": {}},
            {"field": "speed_of_sound_air", "value": {}},
        ],
    },
    {
        "id": "meteor",
        "label": "Meteorites / Asteroids",
        "icon": "comet",
        "blurb": "Impact craters, orbits, escape velocity, Roche limits and planetary bodies.",
        "keywords": ["crater", "meteor", "asteroid", "impact", "escape_veloc", "roche",
                     "orbital_period", "planetary_mass", "chandrasekhar"],
        "examples": [
            {"field": "crater", "value": {}},
            {"field": "escape_veloc", "value": {}},
            {"field": "orbital_period", "value": {}},
        ],
    },
    {
        "id": "ocean_buoys",
        "label": "Buoys / Oceanography",
        "icon": "buoy",
        "blurb": "Ocean dynamics: buoyancy frequency, Ekman transport, tides, waves, tsunami.",
        "keywords": ["buoy", "ocean", "ekman", "geostrophic", "seawater", "stokes_drift",
                     "tidal", "tsunami", "wave_dispersion", "buoyancy_freq"],
        "examples": [
            {"field": "buoyancy_freq", "value": {}},
            {"field": "tsunami", "value": {}},
            {"field": "wave_dispersion", "value": {}},
        ],
    },
    {
        "id": "air_quality",
        "label": "ppm / Air Quality",
        "icon": "smog",
        "blurb": "Atmospheric chemistry: ozone, aerosols, smog, radiative forcing, residence time.",
        "keywords": ["atmoschem", "ppm", "ozone", "aerosol", "smog", "henry_law", "gwp",
                     "radiative_forcing", "residence_time", "lcl"],
        "examples": [
            {"field": "ozone", "value": {}},
            {"field": "aerosol", "value": {}},
            {"field": "smog", "value": {}},
        ],
    },
    {
        "id": "aerospace",
        "label": "Flight / Aerospace",
        "icon": "plane",
        "blurb": "Aerodynamics: lift, drag, Mach, isentropic flow, glide and airfoil theory.",
        "keywords": ["aerodynamic", "flight", "aerospace", "lift", "drag_polar", "mach",
                     "isentropic", "glide", "pitot", "prandtl_glauert", "thin_airfoil"],
        "examples": [
            {"field": "lift_force", "value": {}},
            {"field": "mach_number", "value": {}},
            {"field": "glide", "value": {}},
        ],
    },
    {
        "id": "rf_spectrum",
        "label": "Frequency / RF Spectrum",
        "icon": "antenna",
        "blurb": "RF link budgets: path loss, antenna gain, Friis, radar range, skin depth.",
        "keywords": ["rf", "antenna", "friis", "path_loss", "link_budget", "radar_range",
                     "rf_doppler", "skin_depth", "beamwidth", "frequency"],
        "examples": [
            {"field": "friis", "value": {}},
            {"field": "path_loss", "value": {}},
            {"field": "radar_range", "value": {}},
        ],
    },
    {
        "id": "neuro",
        "label": "Neuron / Neural",
        "icon": "neuron",
        "blurb": "Neural dynamics: membrane potential, integrate-and-fire, cable equation, STDP.",
        "keywords": ["neuro", "neuron", "neural", "membrane_potential", "integrate_fire",
                     "firing_rate", "cable_eq", "epsp", "fitzhugh", "stdp", "refractor"],
        "examples": [
            {"field": "firing_rate", "value": {}},
            {"field": "membrane_potential", "value": {}},
            {"field": "integrate_fire", "value": {}},
        ],
    },
    {
        "id": "seismic",
        "label": "Seismic",
        "icon": "seismograph",
        "blurb": "Earthquake science: magnitude, moment, epicenter, Gutenberg-Richter, Omori.",
        "keywords": ["seism", "richter", "epicenter", "gutenberg", "moment_magnitude",
                     "omori", "p_s_wave", "seismic_energy", "seismic_moment"],
        "examples": [
            {"field": "richter", "value": {}},
            {"field": "moment_magnitude", "value": {}},
            {"field": "epicenter", "value": {}},
        ],
    },
    {
        "id": "satellites",
        "label": "Satellites / Geodesy",
        "icon": "satellite",
        "blurb": "Orbital and geodetic computation: orbital period, ECEF, haversine, trilateration.",
        "keywords": ["satellite", "orbital_period", "ecef", "haversine", "trilaterat",
                     "vincenty", "geodesy", "mercator", "utm", "bearing", "cross_track"],
        "examples": [
            {"field": "orbital_period", "value": {}},
            {"field": "haversine", "value": {}},
            {"field": "ecef", "value": {}},
        ],
    },
    {
        "id": "clusters",
        "label": "Clusters / ML",
        "icon": "scatter",
        "blurb": "Clustering and graph/ML methods: k-means, PageRank, Dijkstra, entropy.",
        "keywords": ["cluster", "kmeans", "pagerank", "dijkstra", "random_forest",
                     "knapsack", "huffman", "edit_distance", "cs_ai"],
        "examples": [
            {"field": "kmeans", "value": {}},
            {"field": "pagerank", "value": {}},
            {"field": "dijkstra", "value": {}},
        ],
    },
    {
        "id": "epidemic",
        "label": "Epidemic Network",
        "icon": "virus",
        "blurb": "Epidemic modelling: SIR/SEIR, R0, herd immunity, doubling time, case fatality.",
        "keywords": ["epidem", "sir_model", "seir", "reproduction_number", "herd_immunity",
                     "doubling_time", "case_fatality", "final_epidemic_size", "logistic_epidemic"],
        "examples": [
            {"field": "sir_model", "value": {}},
            {"field": "reproduction_number", "value": {}},
            {"field": "herd_immunity", "value": {}},
        ],
    },
    {
        "id": "quantum",
        "label": "Quantum",
        "icon": "atom",
        "blurb": "Quantum mechanics & computing: Bohr, de Broglie, tunnelling, qubits, Grover.",
        "keywords": ["quantum", "qcomputing", "bohr", "de_broglie", "compton", "tunnel",
                     "rabi", "larmor", "qubit", "grover", "bell_state", "entanglement", "qft"],
        "examples": [
            {"field": "bohr", "value": {}},
            {"field": "de_broglie", "value": {}},
            {"field": "tunnel", "value": {}},
        ],
    },
    {
        "id": "materials",
        "label": "Materials",
        "icon": "crystal",
        "blurb": "Materials science: Hooke's law, Hall-Petch, Griffith fracture, diffusion, crystals.",
        "keywords": ["material", "hooke", "hall_petch", "griffith", "fick", "lever_rule",
                     "vacancy", "wiedemann", "bragg", "crystallograph", "metallurg"],
        "examples": [
            {"field": "hooke", "value": {}},
            {"field": "hall_petch", "value": {}},
            {"field": "griffith", "value": {}},
        ],
    },
    {
        "id": "trajectory",
        "label": "Trajectory / Robotics",
        "icon": "path",
        "blurb": "Motion and robotics: trajectory planning, kinematics, Jacobian, odometry.",
        "keywords": ["trajectory", "robotics", "forward_kinematic", "inverse_kinematic",
                     "jacobian", "odometry", "path_planning", "rotation_matrix", "pd_control"],
        "examples": [
            {"field": "trajectory", "value": {}},
            {"field": "forward_kinematic", "value": {}},
            {"field": "jacobian", "value": {}},
        ],
    },
]

_DOMAIN_INDEX: dict[str, dict[str, Any]] = {d["id"]: d for d in _DOMAINS}

_UNAVAILABLE_NOTE = "science engine not importable in this process"


def _live_methods() -> list[dict]:
    """Return the live registry methods as a list, or ``[]`` if unavailable.

    Never raises — a non-list (unavailable/error dict) from the bridge becomes
    an empty list so callers can treat it uniformly.
    """
    try:
        methods = science_bridge.list_methods()
    except Exception:  # noqa: BLE001 - defensive; the bridge should not raise
        return []
    if isinstance(methods, list):
        return methods
    return []


def _matches(method: dict, keywords: list[str]) -> bool:
    """True if any keyword is a substring of the method's searchable text."""
    parts = [
        str(method.get("key", "")),
        str(method.get("domain", "")),
        str(method.get("doc", "")),
    ]
    aliases = method.get("aliases") or []
    if isinstance(aliases, (list, tuple)):
        parts.extend(str(a) for a in aliases)
    haystack = " ".join(parts).lower()
    return any(kw.lower() in haystack for kw in keywords)


def _select(domain: dict, methods: list[dict]) -> list[dict]:
    """Return the registry methods matching a console, de-duplicated by key."""
    seen: set[str] = set()
    out: list[dict] = []
    for m in methods:
        if not _matches(m, domain["keywords"]):
            continue
        key = str(m.get("key", ""))
        if key in seen:
            continue
        seen.add(key)
        out.append(m)
    return out


def domains() -> dict[str, Any]:
    """Return the console catalog with a live method ``count`` for each console.

    Honest: when the engine is unavailable every count is 0 and ``available`` is
    False. Never raises.
    """
    available = science_bridge.available()
    methods = _live_methods()
    consoles = []
    for d in _DOMAINS:
        matched = _select(d, methods) if methods else []
        consoles.append(
            {
                "id": d["id"],
                "label": d["label"],
                "icon": d["icon"],
                "blurb": d["blurb"],
                "keywords": list(d["keywords"]),
                "count": len(matched),
            }
        )
    out: dict[str, Any] = {
        "available": available,
        "total": len(consoles),
        "domains": consoles,
    }
    if not available:
        out["note"] = _UNAVAILABLE_NOTE
    return out


def domain_methods(domain_id: str) -> dict[str, Any]:
    """Return the live methods matching ``domain_id`` as {key, doc, engine}.

    Returns an empty ``methods`` list plus an honest ``note`` if the console is
    unknown or the engine is unavailable. Never raises.
    """
    domain = _DOMAIN_INDEX.get(domain_id)
    if domain is None:
        return {
            "id": domain_id,
            "available": science_bridge.available(),
            "methods": [],
            "count": 0,
            "note": f"unknown console {domain_id!r}",
        }

    available = science_bridge.available()
    methods = _live_methods()
    matched = _select(domain, methods) if methods else []
    result = [
        {
            "key": m.get("key"),
            "doc": m.get("doc"),
            "engine": m.get("engine"),
            "domain": m.get("domain"),
        }
        for m in matched
    ]
    out: dict[str, Any] = {
        "id": domain_id,
        "label": domain["label"],
        "available": available,
        "methods": result,
        "count": len(result),
    }
    if not available:
        out["note"] = _UNAVAILABLE_NOTE
    return out


def suggested_inputs(domain_id: str) -> list[dict[str, Any]]:
    """Return a few curated, runnable {field, value} examples for a console.

    Always returns a non-empty list for a known console (sensible defaults that
    run with no parameters). Returns ``[]`` for an unknown console.
    """
    domain = _DOMAIN_INDEX.get(domain_id)
    if domain is None:
        return []
    return [dict(ex) for ex in domain.get("examples", [])]


def run(domain_id: str, field: str, value: Any = None) -> dict[str, Any]:
    """Thin pass-through to ``science_bridge.run_method`` for a console.

    ``value`` is forwarded as the bridge's ``params`` (a dict of keyword args).
    A non-dict ``value`` is ignored (treated as no params) so the bridge runs
    its normalised default path. Returns the bridge result verbatim (already
    carrying status ok/error/unavailable). Never raises.
    """
    if domain_id not in _DOMAIN_INDEX:
        return {"status": "error", "error": f"unknown console {domain_id!r}"}
    params = value if isinstance(value, dict) else None
    try:
        return science_bridge.run_method(field, params)
    except Exception as exc:  # noqa: BLE001 - never raise to the route
        return {"status": "error", "error": f"{type(exc).__name__}: {exc}"}
