"""Tests for the immersive interaction taxonomy."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from interactions import (INTERACTIONS, GUILD_TOOLS, interaction_for,
                          objects_for, all_required_object_ids)
from design_list import DESIGNS


def test_every_sim_action_has_an_interaction():
    # the real sim actions a Minion can take
    sim_actions = {"rest", "eat", "drink", "study", "kb_lookup", "teach",
                   "meditate", "socialise", "calculate", "propose_invention",
                   "search_patents", "seek_partner"}
    for a in sim_actions:
        assert a in INTERACTIONS, f"no interaction for {a}"


def test_interaction_contract_has_anim_anchor_objects():
    c = interaction_for("eat")
    assert c["anim"] and c["anchor"] == "seat"
    assert "meal_plate" in c["objects"] and "table_dining" in c["objects"]


def test_guild_tool_is_chosen_per_guild():
    mats = objects_for("calculate", "materials")
    elec = objects_for("calculate", "electrical")
    assert "microscope_light" in mats          # materials yields a microscope
    assert "oscilloscope" in elec              # electrical yields an oscilloscope
    assert mats != elec


def test_every_required_object_exists_in_catalog():
    have = {d[0] for d in DESIGNS}
    missing = all_required_object_ids() - have
    assert not missing, f"interaction objects missing from catalog: {sorted(missing)}"


def test_reading_yields_a_book():
    assert "book_open" in interaction_for("study")["objects"]
    assert "book_open" in interaction_for("kb_lookup")["objects"]
