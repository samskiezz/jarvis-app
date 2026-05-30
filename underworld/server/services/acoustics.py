"""Acoustics — sound propagation + communication range (doc I.10).

Sound attenuates with distance (inverse-square law, ~6 dB per doubling) and is
masked by ambient noise that rises with bad weather. The level that reaches a
listener determines whether speech is audible, which sets how far a Minion can be
taught or spoken to. Sound also travels at a finite, medium-dependent speed.
"""

from __future__ import annotations

import math

# ambient noise floor by weather (dB)
AMBIENT = {"clear": 35.0, "cloudy": 38.0, "rain": 50.0, "snow": 30.0, "storm": 65.0}
SPEECH_DB = 60.0          # a raised voice at 1 m
MEDIUM_SPEED = {"air": 343.0, "water": 1480.0, "steel": 5000.0}  # m/s


def sound_level_at(source_db: float, distance_m: float) -> float:
    """Level reaching a listener `distance_m` away (inverse-square, dB)."""
    if distance_m <= 1.0:
        return source_db
    return round(source_db - 20.0 * math.log10(distance_m), 2)


def ambient_for(weather: str) -> float:
    return AMBIENT.get(weather, 35.0)


def audible(source_db: float, distance_m: float, weather: str = "clear") -> bool:
    return sound_level_at(source_db, distance_m) > ambient_for(weather)


def comm_range(source_db: float = SPEECH_DB, weather: str = "clear") -> float:
    """Distance (m) at which the source drops to the ambient floor."""
    amb = ambient_for(weather)
    if source_db <= amb:
        return 0.0
    return round(10.0 ** ((source_db - amb) / 20.0), 2)


def travel_time(distance_m: float, medium: str = "air") -> float:
    return round(distance_m / MEDIUM_SPEED.get(medium, 343.0), 4)


def speech_clarity(weather: str = "clear") -> float:
    """0..1 — how well speech carries now (1 calm, lower as it gets noisy)."""
    return round(max(0.2, min(1.0, comm_range(SPEECH_DB, weather) / comm_range(SPEECH_DB, "clear"))), 3)
