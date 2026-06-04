"""The behavior bridge must cover a civilisation-scale lived space (quintillions),
every point fully bound to assets, driven by REAL generative taxonomies."""
import dataclasses as dc
import random

from underworld.server.services import behavior as B
from underworld.server.services import taxonomy as T
from underworld.server.services.behavior_coverage import catalog_ids, report


def test_dimensions_are_at_civilisation_scale():
    c = T.counts()
    assert c["actions"] > 2_000_000          # millions of distinct concrete tasks
    assert c["fields"] >= 150                # hundreds of specialisations
    assert c["emotions"] >= 120              # hundreds of emotional states
    assert len(B.ROLES) >= 120               # hundreds of roles
    assert len(B.LIFE_STAGES) >= 16          # a fine developmental ladder


def test_space_exceeds_one_quadrillion():
    # actions × emotions × roles × era × weather × season × companion × health ×
    # mastery × tod × biome × project-stage, summed over life-stages.
    assert B.valid_context_count() > 1_000_000_000_000_000  # > 1e15


def _rand_work_ctx(rng, actions):
    aid, verb, fld, method, subj = rng.choice(actions)
    return B.Context("work", B.FIELD_GUILD_OR(fld), rng.choice(B.ROLES),
                     rng.choice(B.EMOTIONS), rng.choice(B.LIFE_STAGES),
                     rng.choice(B.PROJECT_STAGES), rng.choice(B.TIMES_OF_DAY),
                     rng.choice(B.BIOMES), rng.choice(B.ERAS), rng.choice(B.WEATHERS),
                     rng.choice(B.SEASONS), rng.choice(B.COMPANIONS),
                     rng.choice(B.HEALTH_BANDS), rng.choice(B.MASTERY_TIERS),
                     verb=verb, field=fld, method=method, subject=subj)


def test_every_sampled_context_resolves_fully_bound():
    rng = random.Random(13)
    actions = list(T.iter_actions(limit=50000))
    for _ in range(4000):
        ctx = _rand_work_ctx(rng, actions)
        steps = B.expand(ctx)
        assert steps, ctx.key()
        for s in steps:
            assert s.anim and s.anchor, (ctx.key(), s)


def test_new_dimensions_change_behavior():
    # Each dimension must GENUINELY alter the produced sequence (no padding).
    base = B.Context("forage", "agriculture", "generalist_journeyman_lead", "content", "adult",
                     "hypothesis", "day", "forest", "iron")
    assert B.expand(base) != B.expand(dc.replace(base, weather="snow"))
    assert B.expand(base) != B.expand(dc.replace(base, companion="partner"))
    assert B.expand(base) != B.expand(dc.replace(base, health="sick"))
    assert B.expand(base) != B.expand(dc.replace(base, mood="intense_anger"))
    # concrete work: method + mastery + field each change the task visibly
    w = B.Context("work", "physics", "formula_oracle_master_lead", "flow", "adult", "in_silico",
                  "night", "hills", "information", verb="derive", field="optics",
                  method="rigorously", subject="optical_bench", mastery="expert")
    assert B.expand(w) != B.expand(dc.replace(w, mastery="master"))
    assert B.expand(w) != B.expand(dc.replace(w, method="playfully"))
    assert B.expand(w) != B.expand(dc.replace(w, field="thermodynamics"))


def test_concrete_actions_are_in_the_millions_and_enumerable():
    sample = list(T.iter_actions(limit=1000))
    assert len(sample) == 1000
    assert len({a[0] for a in sample}) == 1000          # all distinct ids
    assert T.action_count() > 2_000_000


def test_deterministic():
    ctx = B.Context("work", "physics", "formula_oracle_master_lead", "intense_joy", "prime",
                    "in_silico", "night", "hills", "information", "storm", "winter",
                    "rival", "hurt", "expert", verb="prove", field="quantum_mechanics",
                    method="meticulously", subject="chalkboard")
    assert B.expand(ctx) == B.expand(ctx)


def test_every_referenced_object_is_in_the_catalogue():
    # Invariant: the behavior layer must never reach for a GLB we have no design
    # for. behavior_coverage.py surfaces gaps; design_list.py must then cover them.
    unbound = B.referenced_object_ids() - catalog_ids()
    assert not unbound, f"behavior references unbound objects (add to design_list): {sorted(unbound)}"


def test_report_shape():
    r = report(sample=800)
    assert r["space_size"] > 1_000_000_000_000_000 and r["sample_unresolved"] == 0


def test_taxonomy_concrete_action_is_deterministic_and_specific():
    a1 = T.concrete_action("calculate", guild="physics", era="information", seed="ada")
    a2 = T.concrete_action("calculate", guild="physics", era="information", seed="ada")
    assert a1 == a2 and a1[2] in T.FIELDS_BY_GUILD["physics"]
    assert T.concrete_action("calculate", guild="physics", seed="x") != \
        T.concrete_action("calculate", guild="maths", seed="x")
