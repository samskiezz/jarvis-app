"""CIVIC ASSET RESOLUTION — map a real-city building taxonomy onto the operator's GLBs.

The φ/fractal layout speaks in coarse zone categories (commercial/residential/civic/…).
A believable GTA/Sims-scale city needs NAMED civic types — school, hospital, hotel, gym,
store, church, factory, police/fire, bank, and transit hubs (bus/train/subway). This module:

  • declares that taxonomy (CIVIC_TYPES) with filename keywords + category fallbacks,
  • resolves each type to the best matching GLB in the asset catalog (deterministic),
  • reports exactly which types are COVERED (real match), FALLBACK (stand-in from a related
    category), or MISSING (no asset at all) — the honest "what to author next" list.

Pure data; no side effects. The layout calls resolve_civic(); ops run civic_coverage()
(or scripts/civic_coverage.py) to see the gaps.
"""
from __future__ import annotations

import os
from typing import Optional

# type -> (keywords matched against the GLB filename, fallback layout/catalog categories)
# Keywords are ordered; an earlier keyword is a stronger match. Fallbacks are tried in
# order when no filename keyword hits, so a slot is never empty even before assets exist.
CIVIC_TYPES: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "school":        (("school", "academy", "classroom", "university", "college"), ("civic",)),
    "hospital":      (("hospital", "infirmary", "clinic", "medical", "doctor"), ("civic",)),
    "clinic":        (("clinic", "doctor", "pharmacy", "apothecary", "medical"), ("civic",)),
    "hotel":         (("hotel", "inn", "motel", "lodge", "hostel"), ("commercial", "residential")),
    "gym":           (("gym", "fitness", "arena", "sport", "stadium"), ("civic", "commercial")),
    "store":         (("store", "shop", "market", "mall", "grocer", "retail"), ("commercial",)),
    "church":        (("church", "temple", "cathedral", "chapel", "shrine", "mosque"), ("monument", "civic")),
    "factory":       (("factory", "plant", "warehouse", "assembly", "industrial", "refinery"), ("industrial",)),
    "office":        (("office", "tower", "corporate", "skyscraper"), ("commercial", "tower")),
    "skyscraper":    (("skyscraper", "highrise", "tower-tall", "building-skyscraper"), ("tower", "commercial")),
    "apartment":     (("apartment", "tenement", "condo", "flat", "residential-block"), ("residential",)),
    "bank":          (("bank", "treasury", "vault", "mint"), ("commercial", "civic")),
    "police":        (("police", "precinct", "guard", "station-police"), ("civic",)),
    "fire_station":  (("fire", "firehouse", "fire-station"), ("civic",)),
    "library":       (("library", "archive", "book"), ("civic",)),
    "restaurant":    (("restaurant", "diner", "cafe", "tavern", "eatery", "food"), ("commercial",)),
    "bus_station":   (("bus", "bus-station", "depot", "terminal"), ("civic", "industrial")),
    "train_station": (("train-station", "railway", "station", "rail"), ("civic",)),
    "subway":        (("subway", "metro", "underground", "tram"), ("civic",)),
    "power_plant":   (("power", "grid", "substation", "reactor", "generator"), ("industrial",)),
    "water_works":   (("water", "well", "aqueduct", "cistern", "treatment"), ("civic", "water")),
    "park":          (("park", "garden", "fountain", "plaza"), ("nature", "monument")),
}

# Only these catalog categories are BUILDING-scale — a civic type must resolve to one of
# them to count as real. Props, furniture, vehicles, FX, characters, trees, rocks, floors,
# roofs, stairs are NOT buildings (that's how "campfire"/"hospital_bed"/"tram_car" sneak in).
STRUCTURE_CATEGORIES = frozenset({
    "civic", "commercial", "residential", "industrial", "tower",
    "monument", "gate", "wall", "bridge", "water",
})


def _basename(url: str) -> str:
    return os.path.basename(url or "").rsplit(".", 1)[0].lower()


def _tokens(url: str) -> set[str]:
    """Whole tokens of the filename so 'inn' won't match 'inner' nor 'fire' 'campfire'."""
    import re
    return set(t for t in re.split(r"[^a-z0-9]+", _basename(url)) if t)


# tokens that mark a decor/furniture/sub-component, not a whole building — exclude even if
# the category is structural (kills shop_counter, tavern_bar, hospital_bed, fx_temple…).
_DECOR_TOKENS = frozenset({
    "fx", "bed", "shelf", "counter", "bar", "sign", "fence", "door", "window",
    "light", "banner", "bench", "chair", "table", "desk", "cabinet", "corner",
    "wall", "roof", "stairs", "fountain", "lamp", "post", "crate", "barrel",
})


def _token_match(kw: str, url: str) -> bool:
    """kw matches only as a WHOLE token (or a full hyphen-compound), never as a prefix —
    so 'inn' can't match 'inner' and 'fire' can't match 'campfire'."""
    toks = _tokens(url)
    if toks & _DECOR_TOKENS:          # decor/sub-component, not a building
        return False
    if kw in toks:
        return True
    if "-" in kw:
        return all(part in toks for part in kw.split("-"))
    return False


def _url_category(catalog: dict, url: str) -> str:
    a = (catalog or {}).get("assets", {}).get(url) or {}
    return a.get("category", "")


def _all_urls(catalog: dict) -> list[str]:
    cats = (catalog or {}).get("categories", {})
    out, s = [], set()
    for urls in cats.values():
        for u in urls:
            if u not in s:
                s.add(u); out.append(u)
    return out


def _category_urls(catalog: dict, cat: str) -> list[str]:
    return list((catalog or {}).get("categories", {}).get(cat, []))


def resolve_civic(catalog: dict) -> dict:
    """For every civic type, return {type: {glbs:[…], status, via}}.

    status: 'covered'  — a genuine BUILDING whose name matches the type (real school/hospital)
            'fallback' — no real building; using a stand-in from a related category
            'missing'  — nothing usable at all — author this.
    A keyword hit on a prop/furniture/vehicle/FX does NOT count as covered (it's noise).
    """
    urls = _all_urls(catalog)
    result: dict[str, dict] = {}
    for ctype, (keywords, fallbacks) in CIVIC_TYPES.items():
        matches: list[str] = []
        hit_kw: Optional[str] = None
        for kw in keywords:
            for u in urls:
                # must be a whole-token name hit AND a building-scale category
                if _token_match(kw, u) and _url_category(catalog, u) in STRUCTURE_CATEGORIES:
                    matches.append(u)
                    hit_kw = hit_kw or kw
        matches = list(dict.fromkeys(matches))
        if matches:
            result[ctype] = {"glbs": matches, "status": "covered", "via": f"keyword:{hit_kw}"}
            continue
        # fallback to a related category
        fb: list[str] = []
        used_cat = None
        for cat in fallbacks:
            cu = _category_urls(catalog, cat)
            if cu:
                fb = cu; used_cat = cat; break
        if fb:
            result[ctype] = {"glbs": fb, "status": "fallback", "via": f"category:{used_cat}"}
        else:
            result[ctype] = {"glbs": [], "status": "missing", "via": "none"}
    return result


def pick_civic(ctype: str, seed: int, resolved: dict) -> Optional[str]:
    """Deterministically pick ONE GLB for a civic type from a resolve_civic() result."""
    entry = resolved.get(ctype) or {}
    pool = entry.get("glbs") or []
    if not pool:
        return None
    return pool[seed % len(pool)]


def civic_coverage(catalog: dict) -> dict:
    """Summary the operator can act on: counts + the explicit author-next list."""
    r = resolve_civic(catalog)
    covered = sorted(t for t, v in r.items() if v["status"] == "covered")
    fallback = sorted(t for t, v in r.items() if v["status"] == "fallback")
    missing = sorted(t for t, v in r.items() if v["status"] == "missing")
    return {
        "total_types": len(r),
        "covered": covered,
        "fallback": fallback,          # rendered with a stand-in until a real GLB exists
        "missing": missing,            # nothing at all — must be authored
        "author_next": fallback + missing,
        "detail": {t: {"status": v["status"], "via": v["via"], "n": len(v["glbs"])}
                   for t, v in r.items()},
    }
