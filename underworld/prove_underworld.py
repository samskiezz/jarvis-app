"""
PROOF SCRIPT — spawn an Underworld world, run real ticks, print actual DB counts.

No mocks, no narration. Uses the same services + DB the app uses, then queries
the rows that were created. Run from the underworld/ directory:

    python prove_underworld.py
"""
import asyncio
import os
import sys
import tempfile
from pathlib import Path

# Make the repo root importable as `underworld.*` and point at a fresh DB,
# exactly like the test conftest does.
_REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO_ROOT))
_TMP = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_TMP.close()
os.environ.setdefault("UNDERWORLD_API_KEY", "proof-key")
os.environ["UNDERWORLD_DB_PATH"] = _TMP.name
os.environ.pop("UNDERWORLD_KIMI_API_KEY", None)  # force offline heuristic minds
os.environ["UNDERWORLD_SCHEDULER_ENABLED"] = "false"

from sqlalchemy import func, select  # noqa: E402

from underworld.server.db.session import init_db, session_scope  # noqa: E402
from underworld.server.db import models as M  # noqa: E402
from underworld.server.services import factory  # noqa: E402
from underworld.server.services.simulation import advance_world  # noqa: E402


async def n(s, model, **filt):
    q = select(func.count()).select_from(model)
    for k, v in filt.items():
        q = q.where(getattr(model, k) == v)
    return (await s.execute(q)).scalar_one()


async def main():
    await init_db()

    print("=" * 64)
    print("1) SPAWN A WORLD  (CPC H02J = power grids, ~60 minions)")
    print("=" * 64)
    plan = factory.SeedingPlan(aptitude_pool=50, patent_guild_seats=5,
                               safety_guild_seats=5, population_cap=400)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Proof", cpc_class="H02J", plan=plan)
        wid = world.id

    async with session_scope() as s:
        born = await n(s, M.Minion, world_id=wid)
        guilds = (await s.execute(
            select(M.Minion.guild, func.count()).where(M.Minion.world_id == wid)
            .group_by(M.Minion.guild))).all()
        print(f"   world id      : {wid}")
        print(f"   MINIONS BORN  : {born}")
        print(f"   guilds        : {{{', '.join(f'{g.name}:{c}' for g, c in guilds)}}}")

    print("\n" + "=" * 64)
    print("2) RUN 20 TICKS  (offline heuristic minds — no API key)")
    print("=" * 64)
    async with session_scope() as s:
        world = await s.get(M.World, wid)
        reports = await advance_world(s, world, ticks=20, use_llm=False)
    for i, r in enumerate(reports, 1):
        d = {k: v for k, v in vars(r).items() if isinstance(v, int)}
        if i % 5 == 0 or i == 1:
            print(f"   tick {i:2}: " + "  ".join(f"{k}={v}" for k, v in list(d.items())[:8]))

    print("\n" + "=" * 64)
    print("3) WHAT EXISTS IN THE DATABASE NOW  (queried, not claimed)")
    print("=" * 64)
    async with session_scope() as s:
        print(f"   minions total      : {await n(s, M.Minion, world_id=wid)}")
        print(f"   minions alive      : {await n(s, M.Minion, world_id=wid, alive=True)}")
        print(f"   inventions         : {await n(s, M.Invention, world_id=wid)}")
        print(f"   discoveries        : {await n(s, M.Discovery, world_id=wid)}")
        print(f"   events             : {await n(s, M.Event, world_id=wid)}")
        print(f"   memories           : {await n(s, M.Memory)}")
        print(f"   peer reviews       : {await n(s, M.PeerReview)}")
        print(f"   population snapshots: {await n(s, M.PopulationSnapshot, world_id=wid)}")

        invs = (await s.execute(
            select(M.Invention).where(M.Invention.world_id == wid).limit(6))).scalars().all()
        if invs:
            print("\n   SAMPLE INVENTIONS (real rows minions proposed):")
            for iv in invs:
                title = getattr(iv, "title", None) or getattr(iv, "name", "?")
                status = getattr(iv, "status", "")
                print(f"     - [{status}] {title}")

        evs = (await s.execute(
            select(M.Event.kind, func.count()).where(M.Event.world_id == wid)
            .group_by(M.Event.kind).order_by(func.count().desc()).limit(8))).all()
        if evs:
            print("\n   EVENT TYPES LOGGED:")
            for kind, cnt in evs:
                print(f"     {cnt:4}  {kind}")

    print("\nDONE. Re-run anytime: python prove_underworld.py")


if __name__ == "__main__":
    asyncio.run(main())
