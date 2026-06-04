"""The 11 guilds must form a hierarchy spanning hundreds of thousands of sciences."""
from underworld.server.services import guild_structure as GS


def test_eleven_guilds_each_with_divisions():
    assert len(GS.GUILDS) == 11
    for g in GS.GUILDS:
        assert len(GS.divisions(g)) >= 5            # each guild has many fields/divisions


def test_each_guild_covers_thousands_of_sciences():
    for g in GS.GUILDS:
        assert GS.sciences_in_guild(g) > 1000       # guild → field → niche tree


def test_total_sciences_is_hundreds_of_thousands():
    assert GS.total_sciences() > 90_000             # 11 guilds together


def test_minion_specialisation_is_stable_and_deep():
    a = GS.specialisation_for("minion-42", "physics")
    b = GS.specialisation_for("minion-42", "physics")
    assert a == b                                   # lifelong, deterministic
    assert a["division"] in GS.divisions("physics")
    assert "::" in a["niche"] and a["title"]


def test_hierarchy_shape():
    h = GS.guild_hierarchy("materials")
    assert h["n_divisions"] >= 5 and h["total_sciences"] > 1000
    assert h["divisions"][0]["specialisations"] > 100


def test_org_summary():
    s = GS.org_summary()
    assert s["guilds"] == 11 and s["total_divisions"] > 100
    assert s["total_sciences"] > 90_000
