"""The niche space must exceed 100,000 and every sampled niche must compute for
real (a domain sim + a rendered formula with a real value)."""
import random

from underworld.server.services import science_niches as SN


def test_niche_space_exceeds_100k():
    assert SN.niche_count() > 100_000
    assert SN.formula_count() >= 80          # 82 real physics-law formulas


def test_iter_is_lazy_and_distinct():
    ids = [n[0] for n in SN.iter_niches(limit=1000)]
    assert len(ids) == 1000 and len(set(ids)) == 1000


def test_sampled_niches_compute_real_formulas_and_data():
    rng = random.Random(0)
    fields = list(__import__("underworld.server.services.taxonomy",
                             fromlist=["ALL_FIELDS"]).ALL_FIELDS)
    for _ in range(30):
        field = rng.choice(fields)
        mod = rng.choice(SN.MODIFIERS)
        reg = rng.randrange(len(SN.REGIMES))
        r = SN.simulate_niche(field, mod, reg, seed=3)
        assert r["grounded"], r["summary"]
        assert isinstance(r["data"], dict)
        assert r["formula"]["value"] is not None          # a real rendered formula value
        assert "=" in r["rendered"]


def test_regime_changes_the_computation():
    a = SN.simulate_niche("optics", "resonance", 1, seed=1)
    b = SN.simulate_niche("optics", "resonance", 9, seed=1)
    assert a["rendered"] != b["rendered"] or a["data"] != b["data"]


def test_niche_id_roundtrip():
    r = SN.simulate_niche_id("metallurgy::phase-transition::r4", seed=2)
    assert r["field"] == "metallurgy" and r["regime"] == 4
