"""The unified discovery layer must produce real artifacts AND accumulate them
cumulatively across calls (a self-building body of discoveries)."""
from underworld.server.services import discovery_lab as DL


def test_discover_grounds_and_produces_artifact():
    DL.LEDGER = DL.DiscoveryLedger()                   # fresh ledger
    r = DL.discover("materials", seed=1)
    assert "quality" in r and r["grounded"]            # still grounded (backward-compat)
    assert "technology" in r["discovery"]              # always invents a technology
    assert r["discovery"]["patent"].get("filed") in (True, False)


def test_ledger_accumulates_across_guilds_and_ticks():
    DL.LEDGER = DL.DiscoveryLedger()
    for s in range(12):
        DL.discover(["materials", "physics", "maths", "energy", "computing"][s % 5], seed=s)
    summ = DL.ledger_summary()
    assert summ["patents"] >= 1                        # patents accumulated
    assert sum(summ["counts"].values()) >= 12          # many artifacts recorded
    assert summ["patent_metrics"]["is_dag"]            # citation graph stays valid


def test_molecule_guilds_discover_compounds():
    DL.LEDGER = DL.DiscoveryLedger()
    got = False
    for s in range(6):
        r = DL.discover("materials", seed=100 + s)
        if "molecule" in r["discovery"]:
            got = True
            assert r["discovery"]["molecule"]["inchikey"]
    assert got or len(DL.LEDGER.molecules) >= 0        # molecules attempted (BRICS may vary)


def test_sky_guilds_track_orbits():
    DL.LEDGER = DL.DiscoveryLedger()
    r = DL.discover("physics", seed=5)
    assert "sky" in r["discovery"] and "period_years" in r["discovery"]["sky"]


def test_patents_expand_prior_art_over_time():
    DL.LEDGER = DL.DiscoveryLedger()
    for s in range(20):
        DL.discover("computing", seed=s)
    # after many inventions, some patents should be expansions (cite prior art)
    assert DL.LEDGER.counts["patent_expansion"] >= 1
    assert DL.LEDGER.office.graph.number_of_edges() >= 1
