"""INTERIORS — every building instance has real rooms, furniture, lighting and scenes.

The φ/fractal layout places building SHELLS (one GLB per slot). This turns any shell into a
walkable INTERIOR: it fractally subdivides the footprint into rooms appropriate to the
building's function (a hospital gets wards/surgery/pharmacy/lobby; a home gets living/kitchen/
bedrooms/bath), furnishes each room from the catalog, lights it, sets occupancy, and binds the
SCENES (design_spec situations) that can play there.

Like chunks, interiors are generated **deterministically on demand** from the instance's
identity — so every one of millions of instances HAS a full interior without storing any of
them. Same instance → identical interior on every client and across restarts.

  interior = building_interior(function="hospital", category="civic",
                               footprint_w=18, footprint_d=14, seed=instance_seed,
                               catalog=asset_catalog)
  -> {"rooms":[{id,type,purpose,bounds,height,floor,walls,door,furniture[],lights[],
                capacity,scenes[]}...], "scenes":[...], "floors":1}
"""
from __future__ import annotations

import os
from typing import Optional

# ── room programs: building function → the rooms it must contain ────────────────────
# Each entry: (room_type, base_count, per_area) — count = base + floor(area/per_area), so
# bigger buildings get more wards/classrooms/offices. Mirrors how needs drive the city.
_PROGRAMS: dict[str, list[tuple[str, int, float]]] = {
    "hospital":   [("lobby",1,0), ("ward",2,40), ("surgery",1,90), ("pharmacy",1,0), ("office",1,120), ("waiting",1,80)],
    "clinic":     [("waiting",1,0), ("exam",2,30), ("pharmacy",1,0), ("office",1,0)],
    "school":     [("hall",1,0), ("classroom",2,35), ("office",1,120), ("library",1,150), ("gym",1,200)],
    "academy":    [("hall",1,0), ("classroom",2,40), ("library",1,120), ("lab",1,100), ("office",1,0)],
    "library":    [("hall",1,0), ("stacks",2,60), ("reading",1,80), ("office",1,0)],
    "office":     [("lobby",1,0), ("openplan",2,50), ("meeting",1,90), ("breakroom",1,150)],
    "bank":       [("lobby",1,0), ("teller",1,0), ("vault",1,0), ("office",1,120)],
    "hotel":      [("lobby",1,0), ("room",4,30), ("restaurant",1,0), ("office",1,200)],
    "gym":        [("lobby",1,0), ("floor",1,0), ("locker",1,0), ("studio",1,120)],
    "store":      [("shopfloor",1,0), ("storeroom",1,0), ("counter",1,0)],
    "restaurant": [("dining",1,0), ("kitchen",1,0), ("counter",1,0)],
    "market":     [("shopfloor",1,0), ("storeroom",1,0), ("counter",1,0)],
    "church":     [("nave",1,0), ("altar",1,0), ("vestry",1,0)],
    "police":     [("lobby",1,0), ("office",1,80), ("cell",2,60), ("armory",1,0)],
    "fire_station":[("bay",1,0), ("office",1,0), ("dorm",1,0)],
    "factory":    [("floor",1,0), ("storeroom",1,80), ("office",1,150), ("loading",1,0)],
    "workshop":   [("floor",1,0), ("storeroom",1,0), ("office",1,200)],
    "power_plant":[("control",1,0), ("turbine_hall",1,0), ("storeroom",1,0)],
    "water_works":[("control",1,0), ("pump_hall",1,0)],
    "home":       [("living",1,0), ("kitchen",1,0), ("bedroom",1,55), ("bathroom",1,0)],
    "apartment":  [("living",1,0), ("kitchen",1,0), ("bedroom",2,40), ("bathroom",1,0)],
    "house":      [("living",1,0), ("kitchen",1,0), ("bedroom",1,55), ("bathroom",1,0)],
    "storehouse": [("floor",1,0), ("storeroom",2,60), ("office",1,0)],
    "bus_station":  [("concourse",1,0), ("ticket",1,0), ("waiting",1,0)],
    "train_station":[("concourse",1,0), ("ticket",1,0), ("platform",1,0), ("waiting",1,0)],
    "subway":       [("concourse",1,0), ("platform",1,0), ("ticket",1,0)],
}
# category-level fallback when a precise function has no program
_CATEGORY_FALLBACK: dict[str, str] = {
    "residential": "home", "commercial": "store", "industrial": "workshop",
    "civic": "office", "tower": "office", "monument": "church",
}

# furniture/props to place per room type — matched against the catalog by keyword.
_ROOM_FURNITURE: dict[str, tuple[str, ...]] = {
    "ward": ("bed", "hospital_bed", "chair"), "surgery": ("table", "lamp", "cabinet"),
    "exam": ("bed", "chair", "cabinet"), "pharmacy": ("shelf", "cabinet", "counter"),
    "waiting": ("chair", "bench", "table"), "lobby": ("desk", "chair", "bench", "plant"),
    "classroom": ("desk", "chair", "board", "bookshelf"), "hall": ("bench", "banner", "plant"),
    "library": ("bookshelf", "table", "chair"), "stacks": ("bookshelf", "shelf"),
    "reading": ("table", "chair", "lamp"), "lab": ("table", "beaker", "cabinet", "lamp"),
    "office": ("desk", "chair", "cabinet", "bookshelf"), "openplan": ("desk", "chair", "plant"),
    "meeting": ("table", "chair", "board"), "breakroom": ("table", "chair", "fridge"),
    "teller": ("counter", "chair"), "vault": ("cabinet", "crate"),
    "room": ("bed", "table", "lamp", "chair"), "restaurant": ("table", "chair", "counter"),
    "dining": ("table", "chair"), "kitchen": ("stove", "counter", "fridge", "sink"),
    "counter": ("counter", "shelf"), "floor": ("crate", "barrel", "shelf"),
    "shopfloor": ("shelf", "counter", "crate"), "storeroom": ("crate", "barrel", "shelf"),
    "studio": ("ball", "bench"), "locker": ("cabinet", "bench"),
    "nave": ("bench", "altar", "brazier"), "altar": ("altar", "brazier", "banner"),
    "vestry": ("cabinet", "table", "chair"), "cell": ("bed", "bench"),
    "armory": ("cabinet", "crate"), "bay": ("crate", "barrel"), "dorm": ("bed", "cabinet"),
    "control": ("desk", "board", "chair"), "turbine_hall": ("battery", "crate"),
    "pump_hall": ("barrel", "crate"), "loading": ("crate", "barrel"),
    "living": ("armchair", "sofa", "table", "tv", "lamp"), "bedroom": ("bed", "cabinet", "lamp"),
    "bathroom": ("bathtub", "sink"), "concourse": ("bench", "board"), "ticket": ("counter", "chair"),
    "platform": ("bench",), "plaza": ("bench", "plant"),
}

# scenes (design_spec SITUATIONS) that can play in each room type
_ROOM_SCENES: dict[str, tuple[str, ...]] = {
    "ward": ("rest", "death"), "surgery": ("research", "conflict"), "exam": ("research", "idle"),
    "classroom": ("research", "discovery"), "lab": ("research", "discovery"), "library": ("research", "idle"),
    "stacks": ("research",), "reading": ("research", "rest"), "office": ("idle", "trade"),
    "openplan": ("research", "build"), "meeting": ("trade", "discovery"), "lobby": ("idle", "travel"),
    "waiting": ("idle", "rest"), "shopfloor": ("trade",), "counter": ("trade",), "storeroom": ("build",),
    "dining": ("festival", "trade"), "kitchen": ("harvest", "build"), "restaurant": ("festival", "trade"),
    "room": ("rest",), "bedroom": ("rest", "breed"), "living": ("rest", "festival"), "bathroom": ("rest",),
    "nave": ("ritual", "festival"), "altar": ("ritual", "birth", "death"), "vestry": ("ritual",),
    "cell": ("rest", "conflict"), "armory": ("conflict",), "bay": ("disaster", "travel"),
    "floor": ("build", "harvest"), "control": ("build", "disaster"), "turbine_hall": ("build",),
    "platform": ("travel",), "concourse": ("travel",), "vault": ("trade",), "gym": ("festival",),
    "studio": ("festival",), "hall": ("festival", "ritual"),
}
_DEFAULT_SCENES = ("idle",)

WALL_H = 3.2          # room height (metres)
WALL_T = 0.2
MIN_ROOM = 3.0        # don't subdivide below this


def _hash(*parts) -> int:
    h = 1469598103934665603
    for p in parts:
        for b in str(p).encode():
            h = ((h ^ b) * 1099511628211) & 0xFFFFFFFFFFFFFFFF
    return h


def _program(function: str, category: str) -> list[tuple[str, int, float]]:
    fn = (function or "").lower()
    if fn in _PROGRAMS:
        return _PROGRAMS[fn]
    fb = _CATEGORY_FALLBACK.get((category or "").lower(), "office")
    return _PROGRAMS.get(fb, _PROGRAMS["office"])


def _room_list(function: str, category: str, area: float) -> list[str]:
    rooms: list[str] = []
    for rtype, base, per in _program(function, category):
        n = base + (int(area // per) if per else 0)
        rooms.extend([rtype] * max(1, n))
    return rooms


def _split_rects(w: float, d: float, n: int, seed: int) -> list[tuple[float, float, float, float]]:
    """Recursively golden-split a w×d footprint into ~n room rectangles (x,z,w,d), local
    origin at centre. Splits the longer side at φ so parcels read organically (fractal)."""
    import heapq
    rects = [(-w / 2, -d / 2, w, d)]
    # max-heap by area so we keep splitting the biggest room until we have n
    pq = [(-(w * d), 0, rects[0])]
    out: list[tuple[float, float, float, float]] = []
    idx = 1
    while pq and (len(out) + len(pq)) < n:
        _, _, (rx, rz, rw, rd) = heapq.heappop(pq)
        if rw < 2 * MIN_ROOM and rd < 2 * MIN_ROOM:
            out.append((rx, rz, rw, rd)); continue
        phi = 0.5 + ((_hash(seed, idx) % 24) - 12) / 100.0   # ~0.38..0.62 split
        if rw >= rd:
            a = (rx, rz, rw * phi, rd); b = (rx + rw * phi, rz, rw * (1 - phi), rd)
        else:
            a = (rx, rz, rw, rd * phi); b = (rx, rz + rd * phi, rw, rd * (1 - phi))
        for r in (a, b):
            heapq.heappush(pq, (-(r[2] * r[3]), idx, r)); idx += 1
    out.extend(r for _, _, r in pq)
    return out[:max(1, n)]


def _furniture_pool(catalog: Optional[dict]) -> list[str]:
    cats = (catalog or {}).get("categories", {})
    return list(cats.get("furniture", [])) + list(cats.get("prop", []))


_UW_BINDINGS = None


def _bindings() -> dict:
    """The generated-asset bindings (room_contents etc.), built by build_underworld_catalog.py."""
    global _UW_BINDINGS
    if _UW_BINDINGS is None:
        import json
        # interiors.py -> services -> server -> underworld (3 dirnames), then web/public/models
        uw_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        path = os.environ.get("UW_BINDINGS") or os.path.join(
            uw_root, "web", "public", "models", "uw_bindings.json")
        try:
            _UW_BINDINGS = json.load(open(path))
        except Exception:  # noqa: BLE001
            _UW_BINDINGS = {}
    return _UW_BINDINGS


def _pick_furniture(room_type: str, pool: list[str], seed: int, n: int,
                    function: str = "") -> list[dict]:
    """Fill a room with its contents. Prefer the GENERATED, room-qualified Underworld assets
    (e.g. 'hospital bed', 'kitchen fork') from uw_bindings; fall back to the catalog pool."""
    kws = _ROOM_FURNITURE.get(room_type, ("table", "chair"))
    items: list[dict] = []

    # 1) generated bindings: room_contents keyed by room AND by building function
    rc = _bindings().get("room_contents", {})
    bound = {}
    for key in (room_type, function):
        bound.update(rc.get(key, {}))
    # match the room's wanted item keywords to bound generated assets
    for kw in kws:
        for item_name, glb in bound.items():
            if kw in item_name.lower():
                items.append({"glb": glb, "kind": item_name, "generated": True})
                break
        if len(items) >= n:
            break

    # 2) top up from the catalog pool (existing photoreal assets) by keyword
    if len(items) < n and pool:
        matches = [u for u in pool if any(k in os.path.basename(u).lower() for k in kws)]
        src = matches or pool
        for i in range(n - len(items)):
            u = src[_hash(seed, room_type, i) % len(src)]
            items.append({"glb": u, "kind": os.path.basename(u).rsplit(".", 1)[0]})
    return items[:n]


def building_interior(*, function: str, category: str, footprint_w: float, footprint_d: float,
                      seed: int, catalog: Optional[dict] = None, floors: int = 1) -> dict:
    """Deterministic interior for ONE building instance: rooms + furniture + lights + scenes."""
    w = max(MIN_ROOM * 2, float(footprint_w or 8.0))
    d = max(MIN_ROOM * 2, float(footprint_d or 8.0))
    area = w * d
    room_types = _room_list(function, category, area)
    rects = _split_rects(w, d, len(room_types), seed)
    pool = _furniture_pool(catalog)

    rooms = []
    for i, (rtype, (rx, rz, rw, rd)) in enumerate(zip(room_types, rects)):
        rseed = _hash(seed, i, rtype)
        cap = max(1, int((rw * rd) // 6))                      # ~6 m² per occupant
        n_furn = max(1, min(8, int((rw * rd) // 5)))
        scenes = list(_ROOM_SCENES.get(rtype, _DEFAULT_SCENES))
        cx, cz = round(rx + rw / 2, 2), round(rz + rd / 2, 2)
        rooms.append({
            "id": f"r{i}", "type": rtype, "purpose": rtype,
            "bounds": [round(rx, 2), round(rz, 2), round(rw, 2), round(rd, 2)],
            "center": [cx, cz], "height": WALL_H, "floor_index": 0,
            "door": [round(rx + rw / 2, 2), round(rz, 2)],     # door on the -z wall, centred
            "furniture": _pick_furniture(rtype, pool, rseed, n_furn, function=function),
            "lights": [{"pos": [cx, round(WALL_H - 0.3, 2), cz],
                        "intensity": 1.0, "color": "#fff2da"}],
            "capacity": cap, "scenes": scenes,
        })
    # building-level scene set = union of room scenes
    scene_set = sorted({s for r in rooms for s in r["scenes"]})
    return {
        "function": function, "category": category,
        "footprint": [round(w, 2), round(d, 2)], "floors": max(1, int(floors)),
        "wall_height": WALL_H, "wall_thickness": WALL_T,
        "room_count": len(rooms), "rooms": rooms, "scenes": scene_set,
    }


def interior_for_structure(structure: dict, *, world_seed: int = 1,
                           catalog: Optional[dict] = None) -> dict:
    """Convenience: build the interior for a chunk/world-map placement dict (carries
    function/category/pos/footprint). Per-instance seed derived from world seed + position."""
    pos = structure.get("pos", [0, 0, 0])
    inst_seed = _hash(world_seed, round(float(pos[0]), 1), round(float(pos[-1]), 1),
                      structure.get("function") or structure.get("slot") or "b")
    fw = structure.get("footprint_w") or structure.get("footprint", [10, 10])[0] if isinstance(
        structure.get("footprint"), list) else structure.get("footprint_w", 10)
    fd = structure.get("footprint_d") or (structure.get("footprint", [10, 10])[1]
                                          if isinstance(structure.get("footprint"), list) else 10)
    return building_interior(
        function=structure.get("function") or structure.get("slot") or "office",
        category=structure.get("category") or "civic",
        footprint_w=float(fw or 10), footprint_d=float(fd or 10),
        seed=inst_seed, catalog=catalog,
        floors=int(structure.get("floors", 1) or 1))
