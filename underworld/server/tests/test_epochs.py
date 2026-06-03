"""Tests for the historically-grounded epoch ladder."""
from underworld.server.services import epochs as ep


def test_epochs_are_monotonic_and_chronological():
    assert len(ep.EPOCHS) >= 60
    thresholds = [e.threshold for e in ep.EPOCHS]
    assert thresholds == sorted(thresholds)          # monotonic knowledge index
    # Roughly chronological — contemporary milestones (deep learning, CRISPR,
    # renewables) genuinely overlap within a decade, so allow minor local jitter.
    years = [e.year for e in ep.EPOCHS]
    assert all(b >= a - 15 for a, b in zip(years, years[1:]))


def test_epoch_for_climbs_with_knowledge():
    low = ep.epoch_for(0.0)
    mid = ep.epoch_for(120.0)
    high = ep.epoch_for(700.0)
    assert low.id == "oldowan"
    assert ep.EPOCHS.index(mid) > ep.EPOCHS.index(low)
    assert ep.EPOCHS.index(high) > ep.EPOCHS.index(mid)


def test_knowledge_index_monotonic():
    a = ep.knowledge_index(discoveries=5, avg_expertise=2.0, approved_inventions=10)
    b = ep.knowledge_index(discoveries=10, avg_expertise=3.0, approved_inventions=20)
    assert b > a


def test_epoch_progress_reports_next_horizon():
    prog = ep.epoch_progress(30.0)
    assert prog["next"] is not None
    assert 0.0 <= prog["progress"] <= 1.0
    assert prog["total_epochs"] == len(ep.EPOCHS)
    assert "gift" in prog                            # every epoch helps the Minions


def test_real_milestones_present():
    ids = {e.id for e in ep.EPOCHS}
    for real in ("fire", "agriculture", "writing", "steam", "electricity",
                 "transistor", "internet", "agi", "fusion"):
        assert real in ids
