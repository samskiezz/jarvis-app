"""
OBSERVE — watch the minions think as individuals. No steering, no forced
outcomes. Spawn a world, let each minion freely decide via its own LLM-driven
mind (private personality + DNA + memory), then print who they are and what
they chose.

This is the honest test of the design's core promise (Sentient spec lines
308, 317, 401): minions start with zero knowledge, are individuals, and choose
their own field/niche/profession emergently — they are not aimed at any goal.

Run from repo root with the Kimi key loaded:
    export $(grep ^UNDERWORLD_KIMI underworld/.env | xargs)
    python underworld/observe_minds.py [CPC_CLASS] [TICKS]

CPC_CLASS defaults to G06N (AI/computing). TICKS defaults to 3.
"""
import asyncio
import os
import sys
import tempfile
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO_ROOT))
_TMP = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_TMP.close()
os.environ.setdefault("UNDERWORLD_API_KEY", "observe-key")
os.environ["UNDERWORLD_DB_PATH"] = _TMP.name
os.environ["UNDERWORLD_SCHEDULER_ENABLED"] = "false"

from sqlalchemy import desc, func, select  # noqa: E402

from underworld.server.db.session import init_db, session_scope  # noqa: E402
from underworld.server.db import models as M  # noqa: E402
from underworld.server.services import factory  # noqa: E402
from underworld.server.services.simulation import advance_world  # noqa: E402
from underworld.server.agents.minion import llm  # noqa: E402

CPC = sys.argv[1] if len(sys.argv) > 1 else "G06N"
TICKS = int(sys.argv[2]) if len(sys.argv) > 2 else 3


async def latest_thought(s, minion_id):
    row = (await s.execute(
        select(M.Memory).where(M.Memory.minion_id == minion_id, M.Memory.kind == "thought")
        .order_by(desc(M.Memory.tick)).limit(1))).scalars().first()
    return row.content if row else "(no recorded thought)"


async def main():
    print(f"LLM minds active: {llm.has_llm()}   world seed-class: {CPC}   ticks: {TICKS}")
    await init_db()
    plan = factory.SeedingPlan(aptitude_pool=8, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Observe", cpc_class=CPC, plan=plan)
        wid = world.id
    for _ in range(TICKS):
        async with session_scope() as s:
            world = await s.get(M.World, wid)
            await advance_world(s, world, ticks=1, use_llm=True)

    async with session_scope() as s:
        minions = (await s.execute(
            select(M.Minion).where(M.Minion.world_id == wid, M.Minion.alive == True))  # noqa: E712
        ).scalars().all()
        print(f"\n=== {len(minions)} LIVING INDIVIDUALS — each chose its own action ===")
        for m in minions:
            t = await latest_thought(s, m.id)
            print(f"  {m.name} {m.surname}  [{m.guild.value}/{m.swarm_role.value}]  "
                  f"crea={m.creativity:.2f} intel={m.intelligence:.2f} open={m.openness:.2f}")
            print(f"      thinks: \"{t[:110]}\"")

        evs = (await s.execute(
            select(M.Event.kind, func.count()).where(
                M.Event.world_id == wid, M.Event.kind.like("minion:%"))
            .group_by(M.Event.kind).order_by(desc(func.count())))).all()
        print("\n=== what they FREELY chose (no steering) ===")
        for k, c in evs:
            print(f"  {c:4}  {k}")

        # Knowledge accrues in individual memory — show growth, not goals.
        nmem = (await s.execute(select(func.count()).select_from(M.Memory))).scalar_one()
        ndisc = (await s.execute(
            select(func.count()).select_from(M.Discovery).where(M.Discovery.world_id == wid))).scalar_one()
        print(f"\n  individual memories formed: {nmem}   ·   discoveries earned: {ndisc}")
        print("  (inventions come later — only once individuals have learned enough to make them)")


if __name__ == "__main__":
    asyncio.run(main())
