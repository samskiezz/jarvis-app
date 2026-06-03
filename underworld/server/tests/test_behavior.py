"""The behavior bridge must cover a >1M lived space, fully bound to assets."""
import random

from underworld.server.services import behavior as B
from underworld.server.services.behavior_coverage import catalog_ids, report


def test_space_exceeds_one_million():
    assert B.valid_context_count() > 1_000_000


def test_every_sampled_context_resolves_fully_bound():
    rng = random.Random(13)
    for _ in range(3000):
        stage = rng.choice(B.LIFE_STAGES)
        action = rng.choice(sorted(B.ALLOWED_BY_STAGE[stage]))
        ctx = B.Context(action, rng.choice(B.GUILDS), rng.choice(B.ROLES),
                        rng.choice(B.MOODS), stage, rng.choice(B.PROJECT_STAGES),
                        rng.choice(B.TIMES_OF_DAY), rng.choice(B.BIOMES), rng.choice(B.ERAS))
        steps = B.expand(ctx)
        assert steps, ctx.key()
        for s in steps:
            assert s.anim and s.anchor, (ctx.key(), s)


def test_deterministic():
    ctx = B.Context("calculate", "physics", "formula_oracle", "flow", "adult",
                    "in_silico", "night", "hills", "information")
    assert B.expand(ctx) == B.expand(ctx)


def test_every_referenced_object_is_in_the_catalogue():
    # The behavior layer must not reach for a GLB we have no design for.
    unbound = B.referenced_object_ids() - catalog_ids()
    assert not unbound, f"behavior references unbound objects: {sorted(unbound)}"


def test_report_shape():
    r = report(sample=500)
    assert r["exceeds_million"] and r["sample_unresolved"] == 0


def test_work_action_includes_guild_or_role_tool():
    ctx = B.Context("calculate", "materials", "generalist", "content", "adult",
                    "bench_plan", "day", "plains", "bronze")
    objs = {s.obj for s in B.expand(ctx)}
    # bronze-era calculation should reach for the abacus
    assert "abacus" in objs


def test_infant_cannot_work_but_still_resolves():
    ctx = B.Context("propose_invention", "physics", "generalist", "content",
                    "infant", "hypothesis", "day", "plains", "iron")
    steps = B.expand(ctx)
    assert steps and all(s.anim for s in steps)  # falls back to a bound idle/observe
