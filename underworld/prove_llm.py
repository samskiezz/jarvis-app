"""
PROOF #2 — LLM-driven minds. Spawn a world, run a few ticks with real Kimi K2
reasoning, and query the DB for INVENTIONS the minions chose to propose.

Run from repo root with the key loaded:
    export $(grep ^UNDERWORLD_KIMI underworld/.env | xargs)
    python underworld/prove_llm.py
"""
import asyncio
import os
import sys
import tempfile
import time
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO_ROOT))
_TMP = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_TMP.close()
os.environ.setdefault("UNDERWORLD_API_KEY", "proof-key")
os.environ["UNDERWORLD_DB_PATH"] = _TMP.name
os.environ["UNDERWORLD_SCHEDULER_ENABLED"] = "false"

from sqlalchemy import func, select  # noqa: E402

from underworld.server.db.session import init_db, session_scope  # noqa: E402
from underworld.server.db import models as M  # noqa: E402
from underworld.server.services import factory  # noqa: E402
from underworld.server.services.simulation import advance_world  # noqa: E402
from underworld.server.agents.minion import llm  # noqa: E402


async def cnt(s, model, **f):
    q = select(func.count()).select_from(model)
    for k, v in f.items():
        q = q.where(getattr(model, k) == v)
    return (await s.execute(q)).scalar_one()


async def main():
    print(f"LLM active: {llm.has_llm()}   model: {os.environ.get('UNDERWORLD_KIMI_MODEL')}")
    await init_db()

    # Small population so the LLM call budget per tick is sane, but enough
    # creative minions to propose inventions.
    plan = factory.SeedingPlan(aptitude_pool=18, patent_guild_seats=3, safety_guild_seats=3)
    async with session_scope() as s:
        world = await factory.create_world(s, name="LLMProof", cpc_class="A61K", plan=plan)
        wid = world.id  # A61K = medical/pharmaceutical preparations — the "cures" class
    async with session_scope() as s:
        born = await cnt(s, M.Minion, world_id=wid)
    print(f"world {wid}  seed-class A61K (pharma/medical)  minions born: {born}")

    TICKS = 6
    print(f"running {TICKS} ticks with real LLM reasoning (this calls Moonshot per minion)…")
    t0 = time.time()
    async with session_scope() as s:
        world = await s.get(M.World, wid)
        reports = await advance_world(s, world, ticks=TICKS, use_llm=True)
    print(f"  {TICKS} ticks in {time.time()-t0:.1f}s")
    for i, r in enumerate(reports, 1):
        d = {k: v for k, v in vars(r).items() if isinstance(v, int)}
        print(f"   tick {i}: reviewed={d.get('inventions_reviewed')} "
              f"approved={d.get('inventions_approved')} births={d.get('births')} "
              f"deaths={d.get('deaths')} alive={d.get('alive')}")

    print("\n=== DATABASE (queried) ===")
    async with session_scope() as s:
        ninv = await cnt(s, M.Invention, world_id=wid)
        print(f"  INVENTIONS proposed : {ninv}")
        print(f"  peer reviews        : {await cnt(s, M.PeerReview)}")
        print(f"  safety reviews      : {await cnt(s, M.SafetyReview)}")
        print(f"  discoveries         : {await cnt(s, M.Discovery, world_id=wid)}")
        print(f"  events              : {await cnt(s, M.Event, world_id=wid)}")

        invs = (await s.execute(
            select(M.Invention).where(M.Invention.world_id == wid).limit(10))).scalars().all()
        if invs:
            print("\n  INVENTIONS (real rows the minions wrote):")
            for iv in invs:
                print(f"    [{iv.status.value}] feas={iv.feasibility_score:.2f}  {iv.title[:90]}")
        else:
            print("\n  (no invention rows — minions did not propose this run)")


if __name__ == "__main__":
    asyncio.run(main())
