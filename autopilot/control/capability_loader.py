"""Loads the capability + subsystem + resource registries from intelligence/*.json."""
from __future__ import annotations

import json
import os
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
INTEL_DIR = os.path.join(ROOT, "autopilot", "intelligence")


def _load(name: str) -> dict[str, Any]:
    p = os.path.join(INTEL_DIR, name)
    if not os.path.exists(p):
        return {}
    try:
        with open(p) as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {}


def load_capabilities() -> dict[str, Any]:
    return _load("capability-registry.json")


def load_subsystems() -> dict[str, Any]:
    return _load("subsystem-registry.json")


def load_resources() -> dict[str, Any]:
    return _load("resource-map.json")


def load_planes() -> dict[str, Any]:
    return _load("plane-map.json")


def load_dbs() -> dict[str, Any]:
    return _load("db-catalogue.json")


def load_integration() -> dict[str, Any]:
    return _load("integration-graph.json")


def load_unknowns() -> dict[str, Any]:
    return _load("unknown-systems.json")


def load_limitations() -> dict[str, Any]:
    return _load("system-limitations.json")


def load_all() -> dict[str, Any]:
    return {
        "capabilities": load_capabilities(),
        "subsystems": load_subsystems(),
        "resources": load_resources(),
        "planes": load_planes(),
        "dbs": load_dbs(),
        "integration": load_integration(),
        "unknowns": load_unknowns(),
        "limitations": load_limitations(),
    }
