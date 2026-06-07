"""WORLD_LAYOUT — deterministic world structure from Fibonacci + φ (golden ratio) + fractals.

The renderer-agnostic "matrix" that decides WHAT GOES WHERE: districts, plots, the
buildings/walls/props on them, the road network, and the perimeter — all from three
natural-structure primitives, seeded so the same world always rebuilds identically:

  * FIBONACCI  — concentric district *rings* sized by the Fibonacci sequence
                 (1,2,3,5,8,13,21,34): obelisk → guild HQs → commercial → residential
                 → wall → wilderness. The counting/zoning skeleton.
  * φ (PHI)    — placement by the golden ANGLE (137.507°) phyllotaxis spiral (the way
                 sunflowers pack seeds — organic, even, never gridlike), and plot
                 splits by the golden RATIO (1.618) so subdivisions feel proportioned.
  * FRACTALS   — self-similar recursion: districts subdivide into plots into sub-plots
                 (golden-rectangle quadtree to a depth), boundaries are warped by fBm
                 (fractional Brownian motion), and roads/walls branch by an L-system.

Output is a layout MANIFEST (plain JSON): every slot carries a position, facing,
scale, a GLB *category* (wall / residential / commercial / tower / tree / rock / prop),
and a deterministic GLB pick — so "which wall goes where" is fully determined. Both the
Three.js scene and the Omniverse RTX pipeline consume the same manifest.

stdlib only. Never raises on normal use.
"""

from __future__ import annotations

import hashlib
import math
from typing import Callable, Optional

PHI = (1.0 + 5.0 ** 0.5) / 2.0            # 1.6180339887…
GOLDEN_ANGLE = 2.0 * math.pi * (1.0 - 1.0 / PHI)  # 137.50776° in radians


# ── deterministic RNG (seed-stable across runs/renderers) ──────────────────────────
def _rng(seed: int) -> Callable[[], float]:
    state = seed & 0xFFFFFFFF

    def nxt() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = (t ^ (t >> 15)) * (t | 1) & 0xFFFFFFFF
        t ^= t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF) & 0xFFFFFFFF
        t &= 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return nxt


def _hash_int(*parts) -> int:
    h = hashlib.md5("|".join(str(p) for p in parts).encode()).digest()
    return int.from_bytes(h[:4], "big")


# ── Fibonacci ──────────────────────────────────────────────────────────────────────
def fibonacci(n: int) -> list[int]:
    seq = [1, 1]
    while len(seq) < n:
        seq.append(seq[-1] + seq[-2])
    return seq[:n]


# ── fractal noise: fractional Brownian motion (value noise, summed octaves) ─────────
def _vnoise(x: float, y: float, seed: int) -> float:
    xi, yi = math.floor(x), math.floor(y)
    xf, yf = x - xi, y - yi

    def corner(cx, cy):
        return (_hash_int(seed, cx, cy) & 0xFFFF) / 65535.0

    def smooth(t):  # smoothstep
        return t * t * (3 - 2 * t)

    u, v = smooth(xf), smooth(yf)
    a = corner(xi, yi)
    b = corner(xi + 1, yi)
    c = corner(xi, yi + 1)
    d = corner(xi + 1, yi + 1)
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v


def fbm(x: float, y: float, *, seed: int = 1, octaves: int = 5,
        lacunarity: float = 2.0, gain: float = 0.5) -> float:
    """Fractional Brownian motion in [0,1] — self-similar fractal noise for organic
    boundaries, terrain influence and biome edges."""
    total, amp, freq, norm = 0.0, 1.0, 1.0, 0.0
    for o in range(max(1, octaves)):
        total += amp * _vnoise(x * freq, y * freq, seed + o * 1013)
        norm += amp
        amp *= gain
        freq *= lacunarity
    return total / norm if norm else 0.0


# ── φ phyllotaxis: even, organic point spread (sunflower packing) ───────────────────
def phyllotaxis(n: int, *, r_inner: float, r_outer: float, jitter: float = 0.0,
                seed: int = 1) -> list[tuple[float, float, float]]:
    """N points spread by the golden angle between r_inner and r_outer.
    Returns (x, z, facing_yaw) — facing points outward from the centre."""
    out: list[tuple[float, float, float]] = []
    if n <= 0:
        return out
    rnd = _rng(seed)
    span = max(0.0, r_outer - r_inner)
    for i in range(n):
        theta = i * GOLDEN_ANGLE
        # radius ∝ √i gives equal-area spacing (Vogel's model)
        frac = (i + 0.5) / n
        r = r_inner + span * math.sqrt(frac)
        if jitter:
            r += (rnd() - 0.5) * jitter
            theta += (rnd() - 0.5) * jitter * 0.05
        x = math.cos(theta) * r
        z = math.sin(theta) * r
        facing = math.degrees(math.atan2(-z, -x)) % 360.0  # face the centre/obelisk
        out.append((x, z, facing))
    return out


# ── fractal golden-rectangle subdivision (districts → plots → sub-plots) ────────────
def fractal_plots(cx: float, cz: float, w: float, h: float, depth: int,
                  seed: int) -> list[dict]:
    """Recursively split a rectangle by the golden ratio, alternating axis, down to
    `depth`. Each leaf is a buildable plot. Self-similar — the fractal skeleton of a
    district's parcels."""
    if depth <= 0 or w < 4 or h < 4:
        return [{"cx": cx, "cz": cz, "w": w, "h": h, "depth": depth}]
    rnd = _rng(seed)
    plots: list[dict] = []
    if w >= h:  # split along x by φ
        wa = w / PHI
        wb = w - wa
        if rnd() < 0.5:
            wa, wb = wb, wa
        plots += fractal_plots(cx - (w - wa) / 2, cz, wa, h, depth - 1, seed * 2 + 1)
        plots += fractal_plots(cx + (w - wb) / 2, cz, wb, h, depth - 1, seed * 2 + 2)
    else:       # split along z by φ
        ha = h / PHI
        hb = h - ha
        if rnd() < 0.5:
            ha, hb = hb, ha
        plots += fractal_plots(cx, cz - (h - ha) / 2, w, ha, depth - 1, seed * 2 + 3)
        plots += fractal_plots(cx, cz + (h - hb) / 2, w, hb, depth - 1, seed * 2 + 4)
    return plots


# ── GLB category assignment (deterministic "what goes where") ──────────────────────
# Categories the renderer maps to the operator's photoreal PBR GLBs. The layout is
# category + slot driven; the actual GLB pick per slot is deterministic so a given
# world always places the same asset in the same spot.
_RING_KINDS = [
    ("plaza",        "obelisk"),       # ring 0 — centre monument + plaza
    ("civic",        "tower"),         # ring 1 — guild HQs / towers
    ("commercial",   "commercial"),    # ring 2 — markets / shops
    ("residential",  "residential"),   # ring 3 — homes
    ("wall",         "wall"),          # ring 4 — the curtain wall (what wall goes where)
    ("wilderness",   "nature"),        # ring 5+ — trees / rocks / props
]


def _pick_glb(category: str, slot_seed: int, catalog: Optional[dict]) -> Optional[str]:
    """Deterministically pick a GLB path from the catalog for a category, or None
    (renderer falls back to its own category→asset table)."""
    if not catalog:
        return None
    pool = catalog.get(category) or catalog.get("prop") or []
    if not pool:
        return None
    return pool[_hash_int(category, slot_seed) % len(pool)]


# ── the matrix: assemble the whole world layout ────────────────────────────────────
def build_layout(*, seed: int = 1, world_size: float = 200.0,
                 density: float = 1.0, catalog: Optional[dict] = None) -> dict:
    """Build the full world-structure manifest from Fibonacci + φ + fractals.

    `catalog` (optional): {category: [glb_path, …]} of the operator's photoreal PBR
    GLBs; when given, each slot gets a concrete GLB. `density` scales item counts.
    Returns a JSON-able manifest consumed identically by Three.js and Omniverse.
    """
    R = world_size / 2.0
    fib = fibonacci(8)                       # 1,1,2,3,5,8,13,21
    fib_sum = sum(fib[1:7])                   # ring weights (skip the duplicate 1)
    # Fibonacci ring radii — cumulative, scaled to the world radius.
    radii: list[float] = [0.0]
    acc = 0.0
    for f in fib[1:7]:
        acc += f
        radii.append(R * acc / fib_sum)

    zones: list[dict] = []
    placements: list[dict] = []
    walls: list[dict] = []

    for ring in range(len(radii) - 1):
        r_in, r_out = radii[ring], radii[ring + 1]
        kind, category = _RING_KINDS[min(ring, len(_RING_KINDS) - 1)]
        zones.append({"ring": ring, "kind": kind, "category": category,
                      "r_inner": round(r_in, 3), "r_outer": round(r_out, 3)})

        if kind == "plaza":
            placements.append({"slot": "obelisk", "category": "obelisk",
                               "pos": [0.0, 0.0, 0.0], "rot_y": 0.0, "scale": 1.0,
                               "ring": ring, "glb": _pick_glb("obelisk", seed, catalog)})
            continue

        if kind == "wall":
            # The curtain wall: segments evenly along the ring circumference, each
            # facing tangentially. "What wall goes where" — fully determined.
            circumference = 2 * math.pi * r_in
            seg_len = 6.0
            n_seg = max(8, int(circumference / seg_len))
            for i in range(n_seg):
                a = (i / n_seg) * 2 * math.pi
                x, z = math.cos(a) * r_in, math.sin(a) * r_in
                facing = (math.degrees(a) + 90.0) % 360.0   # tangent to the ring
                walls.append({"slot": "wall", "category": "wall",
                              "pos": [round(x, 3), 0.0, round(z, 3)],
                              "rot_y": round(facing, 2), "length": seg_len,
                              "glb": _pick_glb("wall", _hash_int(seed, "wall", i), catalog)})
            # Gates at the four cardinal points (φ-indexed break in the wall handled
            # by the renderer skipping the nearest segment).
            continue

        # Buildable rings: fractal-subdivide the annulus into plots, then place an
        # asset per plot via golden-angle phyllotaxis, warped by fBm for organic feel.
        ring_area = math.pi * (r_out ** 2 - r_in ** 2)
        base_count = max(4, int(ring_area / (90.0 / max(0.2, density))))
        pts = phyllotaxis(base_count, r_inner=r_in + 2, r_outer=r_out - 2,
                          jitter=3.0, seed=_hash_int(seed, ring))
        for i, (x, z, facing) in enumerate(pts):
            # fBm warp: nudge organically + drive scale variation (fractal terrain feel)
            n = fbm(x * 0.03 + 100, z * 0.03 + 100, seed=seed, octaves=4)
            x += (n - 0.5) * 4.0
            z += (fbm(x * 0.03, z * 0.03, seed=seed + 7) - 0.5) * 4.0
            scale = round(0.8 + n * 0.6, 3)
            slot_seed = _hash_int(seed, ring, i)
            placements.append({
                "slot": kind, "category": category,
                "pos": [round(x, 3), 0.0, round(z, 3)],
                "rot_y": round(facing + (n - 0.5) * 30.0, 2),
                "scale": scale, "ring": ring,
                "glb": _pick_glb(category, slot_seed, catalog),
            })

    # Fractal plots for the central civic core (fine parcels for the hero district).
    core_r = radii[2] if len(radii) > 2 else R * 0.3
    core_plots = fractal_plots(0, 0, core_r * 1.4, core_r * 1.4, depth=4,
                               seed=_hash_int(seed, "core"))

    # L-system-ish radial road network: golden-angle spokes + Fibonacci ring roads.
    roads: list[dict] = []
    for k in range(8):
        a = k * GOLDEN_ANGLE
        roads.append({"kind": "spoke",
                      "from": [0.0, 0.0],
                      "to": [round(math.cos(a) * R, 2), round(math.sin(a) * R, 2)]})
    for r in radii[1:5]:
        roads.append({"kind": "ring", "radius": round(r, 2)})

    return {
        "version": 1,
        "seed": seed,
        "world_size": world_size,
        "primitives": {"phi": round(PHI, 6),
                       "golden_angle_deg": round(math.degrees(GOLDEN_ANGLE), 4),
                       "fibonacci": fib},
        "zones": zones,
        "placements": placements,
        "walls": walls,
        "roads": roads,
        "core_plots": [{"cx": round(p["cx"], 2), "cz": round(p["cz"], 2),
                        "w": round(p["w"], 2), "h": round(p["h"], 2)} for p in core_plots],
        "counts": {"placements": len(placements), "walls": len(walls),
                   "plots": len(core_plots), "roads": len(roads)},
    }
