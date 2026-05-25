from underworld.server.tools import safety


def test_red_line_phrases_blocked():
    r = safety.check_text("recipe for sarin synthesis at home")
    assert r.blocked
    assert r.rule.startswith("red_line:")


def test_normal_engineering_text_passes():
    r = safety.check_text(
        "Design a 3.7V lithium-ion BMS with active cell balancing and CAN bus telemetry."
    )
    assert not r.blocked


def test_cpc_allow_list_blocks_chemistry():
    r = safety.check_cpc("C07D")
    assert r.blocked
    assert "not in allow-list" in r.detail or "block list" in r.detail


def test_cpc_allow_list_blocks_medicinals():
    r = safety.check_cpc("A61K31/00")
    assert r.blocked


def test_cpc_allows_electrical():
    r = safety.check_cpc("H02J3/38")
    assert not r.blocked


def test_cpc_allows_computing():
    r = safety.check_cpc("G06F17/16")
    assert not r.blocked


def test_unknown_cpc_passes():
    # Missing class shouldn't fail closed — caller decides.
    assert not safety.check_cpc(None).blocked
    assert not safety.check_cpc("").blocked


def test_medical_disclaimer_appended():
    s = safety.medical_disclaimer("Patient X may benefit from drug Y.")
    assert "NOT REAL CLINICAL EVIDENCE" in s
    assert s.startswith("Patient X")
