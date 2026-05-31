"""Deterministic world seed derivation from a CPC/IPC class.

Doc reference (section I, point 2): "Terrain procedurally generated from a
seed tied to actual patent classification codes."

For the v1 (Phase 1+2) implementation we don't have a 3D engine, so the
"world" is a 2D heightmap + biome grid that the UI renders schematically.
Tying the seed to the CPC class means an "Aerospace" world consistently
produces high-mountain terrain, an "Agriculture" world consistently
produces fertile plains, etc.
"""

from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass


_CLASS_BIAS = {
    # CPC section → terrain hint
    "A": ("plains", 0.2),       # human necessities (incl. agriculture)
    "B": ("hills", 0.4),        # performing operations
    "C": ("desert", 0.3),       # chemistry & metallurgy
    "D": ("forest", 0.5),       # textiles & paper
    "E": ("mountains", 0.7),    # fixed constructions / mining
    "F": ("hills", 0.5),        # mechanical engineering
    "G": ("plateau", 0.4),      # physics / computing
    "H": ("mountains", 0.6),    # electricity
}


@dataclass(frozen=True)
class WorldSeed:
    cpc_class: str
    seed_int: int
    biome_hint: str
    elevation_bias: float


def derive_seed(cpc_class: str) -> WorldSeed:
    code = (cpc_class or "G06").strip().upper()
    h = hashlib.sha256(code.encode()).digest()
    seed_int = int.from_bytes(h[:8], "big") & 0x7FFFFFFFFFFFFFFF
    section = code[:1] or "G"
    biome, bias = _CLASS_BIAS.get(section, ("plains", 0.3))
    return WorldSeed(cpc_class=code, seed_int=seed_int, biome_hint=biome, elevation_bias=bias)


def heightmap(seed: WorldSeed, *, size: int = 32) -> list[list[float]]:
    """Seeded fractal heightmap — multi-octave sine waves + bias. More octaves at
    higher resolution give continent-scale ranges down to local ridges/valleys."""
    rng = random.Random(seed.seed_int)
    octaves = 7 if size >= 96 else 4
    waves: list[tuple[float, float, float, float]] = []
    for o in range(octaves):
        # higher octaves: smaller amplitude, higher frequency (fractal detail)
        amp = rng.uniform(0.2, 1.0) / (1.0 + o * 0.6)
        freq = rng.uniform(0.5, 4.0) * (1.0 + o * 0.8)
        phase_x = rng.uniform(0, math.tau)
        phase_y = rng.uniform(0, math.tau)
        waves.append((amp, freq, phase_x, phase_y))

    grid: list[list[float]] = []
    for y in range(size):
        row: list[float] = []
        for x in range(size):
            nx = x / size
            ny = y / size
            v = 0.0
            for amp, freq, px, py in waves:
                v += amp * math.sin(freq * math.tau * nx + px) * math.cos(freq * math.tau * ny + py)
            # normalise to [0,1] and apply elevation bias
            v = (v / len(waves) + 1.0) / 2.0
            v = max(0.0, min(1.0, v * (1.0 - seed.elevation_bias) + seed.elevation_bias))
            row.append(round(v, 3))
        grid.append(row)
    return grid


__all__ = ["WorldSeed", "derive_seed", "heightmap"]
