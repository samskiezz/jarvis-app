"""The behavior bridge must cover a >1M lived space, fully bound to assets."""
import random

from underworld.server.services import behavior as B
from underworld.server.services.behavior_coverage import catalog_ids, report


def _rand_ctx(rng):
    stage = rng.choice(B.LIFE_STAGES)
    action = rng.choice(sorted(B.ALLOWED_BY_STAGE[stage]))
    return B.Context(action, rng.choice(B.GUILDS), rng.choice(B.ROLES),
                     rng.choice(B.MOODS), stage, rng.choice(B.PROJECT_STAGES),
                     rng.choice(B.TIMES_OF_DAY), rng.choice(B.BIOMES), rng.choice(B.ERAS),
                     rng.choice(B.WEATHERS), rng.choice(B.SEASONS), rng.choice(B.COMPANIONS),
                     rng.choice(B.HEALTH_BANDS), rng.choice(B.MASTERY_TIERS))


def test_space_exceeds_one_billion():
    # 23 actions × the 13 contextual dimensions — a genuine civilisation-scale space.
    assert B.valid_context_count() > 1_000_000_000


def test_every_sampled_context_resolves_fully_bound():
    rng = random.Random(13)
    for _ in range(4000):
        ctx = _rand_ctx(rng)
        steps = B.expand(ctx)
        assert steps, ctx.key()
        for s in steps:
            assert s.anim and s.anchor, (ctx.key(), s)


def test_new_dimensions_change_behavior():
    # Each new dimension must GENUINELY alter the produced sequence (no padding).
    base = B.Context("forage", "agriculture", "generalist", "content", "adult",
                     "hypothesis", "day", "forest", "iron")
    import dataclasses as dc
    assert B.expand(base) != B.expand(dc.replace(base, weather="snow"))
    assert B.expand(base) != B.expand(dc.replace(base, companion="partner"))
    assert B.expand(base) != B.expand(dc.replace(base, health="sick"))
    work = dc.replace(base, action="calculate")
    assert B.expand(work) != B.expand(dc.replace(work, mastery="master"))


def test_deterministic():
    ctx = B.Context("calculate", "physics", "formula_oracle", "flow", "adult",
                    "in_silico", "night", "hills", "information", "storm", "winter",
                    "rival", "hurt", "expert")
    assert B.expand(ctx) == B.expand(ctx)


def test_every_referenced_object_is_in_the_catalogue():
    # Invariant: the behavior layer must never reach for a GLB we have no design
    # for. behavior_coverage.py surfaces gaps; design_list.py must then cover them.
    unbound = B.referenced_object_ids() - catalog_ids()
    assert not unbound, f"behavior references unbound objects (add to design_list): {sorted(unbound)}"


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
