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


# ── catalog binding: map the asset-catalog categories onto the layout's slot kinds ──
# The layout thinks in zone categories (obelisk/tower/commercial/residential/wall/
# nature); the asset catalog has finer categories. This pools the right GLBs per slot.
_LAYOUT_FROM_CATALOG: dict[str, tuple[str, ...]] = {
    "obelisk":     ("monument", "tower"),
    "tower":       ("tower", "civic"),
    "commercial":  ("commercial", "industrial"),
    "residential": ("residential",),
    "wall":        ("wall", "gate"),
    "nature":      ("tree", "rock", "plant"),
}


def catalog_pools(catalog: dict) -> dict:
    """Build {layout_category: [glb_url…]} from an asset_catalog manifest so the layout
    places the operator's real photoreal GLBs per slot. Falls back across related
    categories and finally to 'prop' so no slot is ever empty."""
    cats = (catalog or {}).get("categories", {})
    pools: dict[str, list[str]] = {}
    for layout_cat, src in _LAYOUT_FROM_CATALOG.items():
        pool: list[str] = []
        for s in src:
            pool.extend(cats.get(s, []))
        if not pool:
            pool = cats.get("prop", [])
        pools[layout_cat] = pool
    # pass-through for any direct matches the layout might request
    for c, urls in cats.items():
        pools.setdefault(c, urls)
    return pools


def build_world(*, seed: int = 1, world_size: float = 200.0, density: float = 1.0,
                catalog: Optional[dict] = None) -> dict:
    """Full pipeline: bind the asset catalog → pools → φ/Fibonacci/fractal layout with
    real GLBs assigned to every slot. This is what the layout API serves."""
    pools = catalog_pools(catalog) if catalog else None
    return build_layout(seed=seed, world_size=world_size, density=density, catalog=pools)


# ── SIM-DRIVEN MASSIVE WORLD: structure derived from the minions' needs ────────────
# A real civilisation, not a token village. The world's size, districts and every
# building are demanded by the actual population: housing per minion, farms to feed
# them, a workshop per guild cohort, markets/wells/storehouses per N, academies per
# research level. Guilds get their own districts (golden-angle sectors) sized by their
# headcount; each district is fractal-subdivided into plots populated by need.

def world_profile(world, minions) -> dict:
    """Extract the demand profile from the live sim: population + per-guild headcount +
    research/era signals. Defensive — works with whatever fields the models expose."""
    pop = len(minions) if minions is not None else 0
    guilds: dict[str, int] = {}
    for m in (minions or []):
        g = str(getattr(m, "guild", None) or getattr(m, "cpc_class", None) or "computing").lower()
        guilds[g] = guilds.get(g, 0) + 1
    era = str(getattr(world, "era", None) or getattr(world, "epoch", None) or "stone")
    tick = int(getattr(world, "tick", 0) or 0)
    research = max(1, tick // 50 + len(guilds))
    return {"population": pop, "guilds": guilds or {"computing": max(1, pop)},
            "era": era, "research_level": research}


def structure_needs(profile: dict) -> dict:
    """Translate the profile into concrete structure demand — what the world must
    contain to serve its minions."""
    pop = max(1, int(profile.get("population", 0)))
    guilds = profile.get("guilds", {})
    research = int(profile.get("research_level", 1))
    import math as _m
    return {
        "housing":     pop,                              # a home per minion
        "farms":       _m.ceil(pop * 0.45),              # feed the population
        "wells":       max(1, _m.ceil(pop / 50)),
        "storehouses": max(1, _m.ceil(pop / 45)),
        "markets":     max(1, _m.ceil(pop / 35)),
        "academies":   max(1, research),                 # research → libraries/academies
        "monuments":   max(1, _m.ceil(research / 3)),
        # per-guild production workshops (a cohort of ~4 minions shares one)
        "workshops":   {g: max(1, _m.ceil(c / 4)) for g, c in guilds.items()},
    }


def _civic_landmarks(pop: int, research: int) -> dict[str, int]:
    """How many of each civic building a settlement of ``pop`` needs — plausible
    city ratios (one hospital per ~300, a school per ~100, transit hubs per ~700…).
    Counts are per-settlement; the world-map tiles many settlements for millions."""
    import math as _m
    p = max(1, int(pop))

    def per(n: int, lo: int = 1, cap: int = 60) -> int:
        return max(lo, min(cap, _m.ceil(p / n)))

    return {
        "school":        per(100), "clinic":     per(120, 1),
        "hospital":      per(300), "library":    per(400),
        "gym":           per(200), "store":      per(40, 2),
        "restaurant":    per(60, 2), "hotel":    per(250),
        "church":        per(350), "bank":       per(400),
        "police":        per(500), "fire_station": per(600),
        "park":          per(150, 2), "bus_station": per(400),
        "train_station": per(800, 1, 6), "subway": per(700, 1, 6),
        "power_plant":   per(900, 1, 4), "water_works": per(700, 1, 6),
        "office":        per(120), "apartment":  per(80, 1),
    }


def build_world_from_profile(profile: dict, *, seed: int = 1, density: float = 1.0,
                             catalog: Optional[dict] = None,
                             center: tuple = (0.0, 0.0)) -> dict:
    """Generate ONE settlement (city/town) — needs-driven: guild districts (golden-angle
    sectors) sized by headcount, each populated to demand (housing/workshops), a farm
    belt, civic core, curtain wall + gates, and roads. Placed at ``center`` so the
    world-map can tile many settlements for millions of minions. Deterministic."""
    needs = structure_needs(profile)
    pools = catalog_pools(catalog) if catalog else None

    def pick(cat: str, s: int) -> Optional[str]:
        return _pick_glb(cat, s, pools)

    guilds = profile.get("guilds", {}) or {"computing": 1}
    total_guild = sum(guilds.values()) or 1

    # World scales with the built footprint: area ∝ total structures × spacing².
    total_struct = (needs["housing"] + needs["farms"] + needs["markets"]
                    + needs["academies"] + needs["storehouses"]
                    + sum(needs["workshops"].values()))
    spacing = 7.0
    settled_r = max(60.0, (total_struct ** 0.5) * spacing / math.sqrt(math.pi) / density)
    world_size = settled_r * 2.6   # wilderness margin beyond the wall

    placements: list[dict] = []
    walls: list[dict] = []
    districts: list[dict] = []

    # Civic core (inner φ disc): academies, markets, monuments, central obelisk.
    core_r = settled_r * 0.18
    placements.append({"slot": "obelisk", "category": "obelisk", "pos": [0, 0, 0],
                       "rot_y": 0, "scale": 1.4, "district": "civic",
                       "glb": pick("obelisk", seed)})
    civic_items = (["academy"] * needs["academies"] + ["market"] * needs["markets"]
                   + ["monument"] * needs["monuments"] + ["storehouse"] * needs["storehouses"])
    for i, (x, z, fy) in enumerate(phyllotaxis(len(civic_items), r_inner=6,
                                               r_outer=core_r, jitter=2.0,
                                               seed=_hash_int(seed, "civic"))):
        kind = civic_items[i]
        cat = {"academy": "civic", "market": "commercial",
               "monument": "monument", "storehouse": "industrial"}[kind]
        placements.append({"slot": kind, "category": cat, "function": kind,
                           "pos": [round(x, 2), 0, round(z, 2)], "rot_y": round(fy, 1),
                           "scale": 1.0, "district": "civic",
                           "glb": pick(cat, _hash_int(seed, "civic", i))})

    # Modern civic landmarks — a real city has schools, hospitals, hotels, gyms, stores,
    # churches, transit hubs… placed in a ring around the civic core, counts scaled to the
    # population. Each resolves to the best matching real GLB (civic_assets), falling back
    # to a category stand-in so a slot is never empty. See scripts/civic_coverage.py.
    civic_plan = _civic_landmarks(pop=int(profile.get("population", 0)),
                                  research=int(profile.get("research_level", 1)))
    if civic_plan and catalog:
        from . import civic_assets as _ca
        resolved = _ca.resolve_civic(catalog)
        ring = [(ct, k) for ct, n in civic_plan.items() for k in range(n)]
        for i, (x, z, fy) in enumerate(phyllotaxis(len(ring), r_inner=core_r + 2,
                                                   r_outer=core_r * 1.9, jitter=3.0,
                                                   seed=_hash_int(seed, "landmarks"))):
            ctype, _k = ring[i]
            entry = resolved.get(ctype) or {}
            # layout category for the chunk consumer: prefer the resolved asset's bucket
            lcat = (_ca.CIVIC_TYPES.get(ctype, ((), ("civic",)))[1] or ("civic",))[0]
            glb = _ca.pick_civic(ctype, _hash_int(seed, "lm", i), resolved) or pick(lcat, _hash_int(seed, "lm", i))
            placements.append({"slot": ctype, "category": lcat, "function": ctype,
                               "civic": True, "covered": entry.get("status") == "covered",
                               "pos": [round(x, 2), 0, round(z, 2)], "rot_y": round(fy, 1),
                               "scale": 1.0, "district": "civic", "glb": glb})

    # Guild districts — one golden-angle sector per guild, radius-banded between the
    # core and the wall, area ∝ guild headcount. Each is fractal-subdivided into plots.
    band_in, band_out = core_r + 8, settled_r - 10
    for gi, (guild, gcount) in enumerate(sorted(guilds.items(), key=lambda kv: -kv[1])):
        ang = gi * GOLDEN_ANGLE
        share = gcount / total_guild
        # district centre on a φ spiral; size scales with the guild's share
        dr = band_in + (band_out - band_in) * (0.35 + 0.5 * ((gi + 0.5) / len(guilds)))
        dcx, dcz = math.cos(ang) * dr, math.sin(ang) * dr
        dsize = max(24.0, math.sqrt(share) * (band_out - band_in) * 1.4)
        districts.append({"guild": guild, "pop": gcount,
                          "center": [round(dcx, 1), round(dcz, 1)],
                          "size": round(dsize, 1), "angle_deg": round(math.degrees(ang) % 360, 1)})
        # guild HQ tower at the district centre
        placements.append({"slot": "guild_hq", "category": "tower", "function": "guild_hq",
                           "guild": guild, "pos": [round(dcx, 2), 0, round(dcz, 2)],
                           "rot_y": round(math.degrees(ang), 1), "scale": 1.2,
                           "district": guild, "glb": pick("tower", _hash_int(seed, guild, "hq"))})
        # Populate the district to EXACT demand: one home per guild minion + the
        # guild's workshops. Buildings placed by golden-angle phyllotaxis WITHIN the
        # district disc (radius ∝ √count for even packing); fractal plots give the
        # parcel grain via fBm jitter. This is what makes the world massive + real.
        homes = gcount
        shops = needs["workshops"].get(guild, 1)
        n_build = homes + shops
        drad = max(10.0, math.sqrt(n_build) * spacing * 0.62)
        local = phyllotaxis(n_build, r_inner=2.0, r_outer=drad, jitter=spacing * 0.4,
                            seed=_hash_int(seed, guild, "fill"))
        for pi, (lx, lz, lfy) in enumerate(local):
            kind = "home" if pi < homes else "workshop"
            cat = "residential" if kind == "home" else "industrial"
            bx, bz = dcx + lx, dcz + lz
            jx = (fbm(bx * 0.05, bz * 0.05, seed=seed) - 0.5) * spacing * 0.5
            jz = (fbm(bx * 0.05 + 9, bz * 0.05, seed=seed) - 0.5) * spacing * 0.5
            placements.append({"slot": kind, "category": cat, "function": kind,
                               "guild": guild,
                               "pos": [round(bx + jx, 2), 0, round(bz + jz, 2)],
                               "rot_y": round(lfy + (_hash_int(seed, guild, pi) % 40), 1),
                               "scale": round(0.85 + (pi % 5) * 0.06, 2),
                               "district": guild,
                               "glb": pick(cat, _hash_int(seed, guild, pi))})

    # Farm belt — feeds the population, ringed just outside the districts.
    farm_pts = phyllotaxis(needs["farms"], r_inner=band_out + 4, r_outer=settled_r,
                           jitter=4.0, seed=_hash_int(seed, "farm"))
    for i, (x, z, fy) in enumerate(farm_pts):
        placements.append({"slot": "farm", "category": "plant", "function": "farm",
                           "pos": [round(x, 2), 0, round(z, 2)], "rot_y": round(fy, 1),
                           "scale": 1.0, "district": "farmland",
                           "glb": pick("plant", _hash_int(seed, "farm", i))})

    # Wells scattered through the settled area.
    for i, (x, z, fy) in enumerate(phyllotaxis(needs["wells"], r_inner=core_r,
                                               r_outer=band_out, jitter=6.0,
                                               seed=_hash_int(seed, "well"))):
        placements.append({"slot": "well", "category": "water", "function": "well",
                           "pos": [round(x, 2), 0, round(z, 2)], "rot_y": round(fy, 1),
                           "scale": 1.0, "district": "civic",
                           "glb": pick("water", _hash_int(seed, "well", i))})

    # Curtain wall + gates around the settled radius (φ-placed gate breaks).
    wall_r = settled_r
    circ = 2 * math.pi * wall_r
    n_seg = max(24, int(circ / 6.0))
    gate_every = max(6, n_seg // 6)
    for i in range(n_seg):
        a = (i / n_seg) * 2 * math.pi
        x, z = math.cos(a) * wall_r, math.sin(a) * wall_r
        is_gate = (i % gate_every == 0)
        walls.append({"slot": "gate" if is_gate else "wall",
                      "category": "gate" if is_gate else "wall",
                      "pos": [round(x, 2), 0, round(z, 2)],
                      "rot_y": round((math.degrees(a) + 90) % 360, 1), "length": 6.0,
                      "glb": pick("gate" if is_gate else "wall", _hash_int(seed, "wall", i))})

    # Wilderness beyond the wall — trees & rocks via phyllotaxis (fractal scatter).
    wild_n = max(40, int(needs["housing"] * 0.5))
    for i, (x, z, fy) in enumerate(phyllotaxis(wild_n, r_inner=wall_r + 6,
                                               r_outer=world_size / 2, jitter=8.0,
                                               seed=_hash_int(seed, "wild"))):
        cat = "tree" if (i % 3) else "rock"
        n = fbm(x * 0.02, z * 0.02, seed=seed)
        placements.append({"slot": cat, "category": cat, "function": "wilderness",
                           "pos": [round(x, 2), 0, round(z, 2)], "rot_y": round(fy, 1),
                           "scale": round(0.7 + n * 0.8, 2), "district": "wilderness",
                           "glb": pick(cat, _hash_int(seed, "wild", i))})

    # Roads: golden-angle spokes + ring roads at the Fibonacci bands.
    roads: list[dict] = []
    for k in range(max(6, len(guilds))):
        a = k * GOLDEN_ANGLE
        roads.append({"kind": "spoke", "from": [0, 0],
                      "to": [round(math.cos(a) * wall_r, 1), round(math.sin(a) * wall_r, 1)]})
    for r in (core_r, band_in, band_out, wall_r):
        roads.append({"kind": "ring", "radius": round(r, 1)})

    # Translate the whole settlement to its world-map ``center`` (so many settlements
    # tile a continent for millions of minions).
    ox, oz = float(center[0]), float(center[1])
    if ox or oz:
        for p in placements:
            p["pos"][0] = round(p["pos"][0] + ox, 2)
            p["pos"][2] = round(p["pos"][2] + oz, 2)
        for w in walls:
            w["pos"][0] = round(w["pos"][0] + ox, 2)
            w["pos"][2] = round(w["pos"][2] + oz, 2)
        for rd in roads:
            if "from" in rd:
                rd["from"] = [round(rd["from"][0] + ox, 1), round(rd["from"][1] + oz, 1)]
                rd["to"] = [round(rd["to"][0] + ox, 1), round(rd["to"][1] + oz, 1)]
            elif "radius" in rd:
                rd["center"] = [round(ox, 1), round(oz, 1)]

    return {
        "version": 2,
        "seed": seed,
        "center": [round(ox, 1), round(oz, 1)],
        "world_size": round(world_size, 1),
        "settled_radius": round(settled_r, 1),
        "profile": profile,
        "needs": {k: (v if not isinstance(v, dict) else v) for k, v in needs.items()},
        "primitives": {"phi": round(PHI, 6),
                       "golden_angle_deg": round(math.degrees(GOLDEN_ANGLE), 4)},
        "districts": districts,
        "placements": placements,
        "walls": walls,
        "roads": roads,
        "counts": {"placements": len(placements), "walls": len(walls),
                   "districts": len(districts), "structures": total_struct},
    }


# ── MACRO LAYER: millions of minions → a CONTINENT of cities, streamed by chunk ─────
# A single settlement caps at CITY_CAPACITY minions; beyond that the population spills
# into more cities spread across a continent. Nothing materialises the whole world —
# the world_map (cheap, always-loaded) lists the cities; each city's full φ/fractal
# structure is generated ON DEMAND when the camera's chunk reaches it. Distant cities
# render as impostors. This is the only way millions of minions can exist + render.
CITY_CAPACITY = 4000


def world_map(profile: dict, *, seed: int = 1, city_capacity: int = CITY_CAPACITY) -> dict:
    """Distribute the whole population across CITIES on a continent (golden-angle
    phyllotaxis, organic spread), each sized by its population share. Cheap overview —
    the minimap + distant impostors. Deterministic."""
    pop = max(1, int(profile.get("population", 0)))
    guilds = profile.get("guilds", {}) or {"computing": pop}
    n_cities = max(1, math.ceil(pop / max(1, city_capacity)))
    extent = max(800.0, math.sqrt(n_cities) * (city_capacity ** 0.5) * 11.0)
    base, rem = divmod(pop, n_cities)
    cities: list[dict] = []
    pts = phyllotaxis(n_cities, r_inner=0.0, r_outer=extent / 2.0,
                      jitter=extent * 0.015, seed=_hash_int(seed, "map"))
    for i, (x, z, _fy) in enumerate(pts):
        cpop = base + (1 if i < rem else 0)
        cguilds = ({g: max(1, round(c * cpop / pop)) for g, c in guilds.items()}
                   if pop else {"computing": cpop})
        radius = max(60.0, math.sqrt(cpop * 2.0) * 7.0 / math.sqrt(math.pi))
        cities.append({"id": f"city-{i}", "center": [round(x, 1), round(z, 1)],
                       "population": cpop, "guilds": cguilds,
                       "radius": round(radius, 1), "seed": _hash_int(seed, "city", i)})
    return {"version": 2, "seed": seed, "population": pop, "city_count": n_cities,
            "extent": round(extent, 1), "city_capacity": city_capacity, "cities": cities}


def build_chunk(profile: dict, *, seed: int = 1, cx: int = 0, cz: int = 0,
                chunk_size: float = 512.0, lod: int = 0,
                catalog: Optional[dict] = None) -> dict:
    """Stream ONE spatial chunk: return the full φ/fractal structure of every city whose
    footprint overlaps the chunk (lod 0), or just impostor nodes (lod ≥ 1) for distant
    rings. The renderer requests chunks around the camera; the rest of the millions-strong
    world stays un-materialised until approached. Deterministic; never raises."""
    wm = world_map(profile, seed=seed)
    half = chunk_size / 2.0
    ccx, ccz = cx * chunk_size, cz * chunk_size       # chunk centre in world units
    x0, x1 = ccx - half, ccx + half
    z0, z1 = ccz - half, ccz + half
    settlements: list[dict] = []
    for city in wm["cities"]:
        gx, gz = city["center"]
        r = city["radius"]
        if gx + r < x0 or gx - r > x1 or gz + r < z0 or gz - r > z1:
            continue   # city footprint doesn't touch this chunk
        if lod <= 0:
            settlements.append(build_world_from_profile(
                {"population": city["population"], "guilds": city["guilds"],
                 "era": profile.get("era", "stone"),
                 "research_level": profile.get("research_level", 1)},
                seed=city["seed"], catalog=catalog, center=tuple(city["center"])))
        else:
            settlements.append({"id": city["id"], "center": city["center"],
                                "radius": city["radius"], "population": city["population"],
                                "impostor": True})
    return {"chunk": [cx, cz], "chunk_size": chunk_size, "lod": lod,
            "settlements": settlements,
            "counts": {"settlements": len(settlements),
                       "placements": sum(len(s.get("placements", [])) for s in settlements)}}
