"""Behavior coverage — completeness measured against the sim's enums, not a list.

Answers three questions the flat GLB list never could:
  1. How big is the lived-behavior space the bridge covers? (must exceed 1,000,000)
  2. Does every context resolve to a non-empty, fully bound micro-behavior?
  3. Which object ids does the behavior layer need that the GLB catalogue does
     NOT yet have? — that set IS the next asset list (derived from behavior).

Run:  python -m server.services.behavior_coverage
"""
from __future__ import annotations

import random

from underworld.server.services import behavior as B


def catalog_ids() -> set[str]:
    """Every GLB id we already have a design for (assets/tripo + interactions)."""
    ids: set[str] = set()
    try:
        from underworld.assets.tripo.design_list import DESIGNS
        ids |= {d[0] for d in DESIGNS}
    except Exception:
        pass
    try:
        from underworld.assets.tripo.interactions import all_required_object_ids
        ids |= set(all_required_object_ids())
    except Exception:
        pass
    return ids


def report(sample: int = 20000) -> dict:
    space = B.valid_context_count()
    have = catalog_ids()
    referenced = B.referenced_object_ids()
    unbound = sorted(referenced - have)

    # Resolution check on a random sample across the whole space — HALF on the
    # concrete work path (the dominant millions-of-actions space), half lifestyle.
    from underworld.server.services import taxonomy as TX
    rng = random.Random(7)
    bad = 0
    checked = 0
    contexts = []
    actions = list(TX.iter_actions(limit=200000))   # a slice of the action space
    for i in range(sample):
        if i % 2 == 0:                               # concrete work context
            aid, verb, fld, method, subj = rng.choice(actions)
            ctx = B.Context("work", B.FIELD_GUILD_OR(fld), rng.choice(B.ROLES),
                            rng.choice(B.EMOTIONS), rng.choice(B.LIFE_STAGES),
                            rng.choice(B.PROJECT_STAGES), rng.choice(B.TIMES_OF_DAY),
                            rng.choice(B.BIOMES), rng.choice(B.ERAS), rng.choice(B.WEATHERS),
                            rng.choice(B.SEASONS), rng.choice(B.COMPANIONS),
                            rng.choice(B.HEALTH_BANDS), rng.choice(B.MASTERY_TIERS),
                            verb=verb, field=fld, method=method, subject=subj)
        else:                                        # lifestyle context
            stage = rng.choice(B.LIFE_STAGES)
            action = rng.choice(sorted(B.lifestyle_allowed(stage)) or ["rest"])
            ctx = B.Context(action, "materials", rng.choice(B.ROLES), rng.choice(B.EMOTIONS),
                            stage, rng.choice(B.PROJECT_STAGES), rng.choice(B.TIMES_OF_DAY),
                            rng.choice(B.BIOMES), rng.choice(B.ERAS), rng.choice(B.WEATHERS),
                            rng.choice(B.SEASONS), rng.choice(B.COMPANIONS),
                            rng.choice(B.HEALTH_BANDS), rng.choice(B.MASTERY_TIERS))
        steps = B.expand(ctx)
        checked += 1
        if not steps or any(not s.anim or not s.anchor for s in steps):
            bad += 1
            if len(contexts) < 5:
                contexts.append(ctx.key())
    return {
        "space_size": space,
        "exceeds_million": space > 1_000_000,
        "catalog_ids": len(have),
        "objects_referenced_by_behavior": len(referenced),
        "unbound_object_ids": unbound,
        "sample_checked": checked,
        "sample_unresolved": bad,
        "sample_bad_examples": contexts,
    }


def main() -> int:
    r = report()
    print(f"behavior space size : {r['space_size']:,}  (>1M: {r['exceeds_million']})")
    print(f"catalog GLB ids     : {r['catalog_ids']}")
    print(f"objects referenced  : {r['objects_referenced_by_behavior']}")
    print(f"sample resolved     : {r['sample_checked'] - r['sample_unresolved']}/{r['sample_checked']}")
    if r["unbound_object_ids"]:
        print(f"\nNEW assets the behavior layer needs ({len(r['unbound_object_ids'])}) — "
              f"these become the next GLB list:")
        for oid in r["unbound_object_ids"]:
            print(f"  - {oid}")
    else:
        print("\nevery object the behavior layer reaches for is already in the catalogue.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
