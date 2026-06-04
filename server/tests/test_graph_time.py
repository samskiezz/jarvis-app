"""Temporal graph playback tests (P5 #41) — fully OFFLINE / deterministic.

No network and no API key. A temp ontology DB is used (env ONTOLOGY_DB) so the
real store is never touched; graph_time composes graph.py over that store. Run:

    python3 -m pytest server/tests/test_graph_time.py -q
"""

import importlib
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def gt(tmp_path, monkeypatch):
    """Reload ontology_store + graph + graph_time against a fresh temp DB, seeded
    with objects of known created_ts so time filtering is observable."""
    db = tmp_path / "test_ontology_gt.db"
    monkeypatch.setenv("ONTOLOGY_DB", str(db))

    from server.services import ontology_store as store
    importlib.reload(store)
    store.init_db()

    now = int(time.time() * 1000)
    early = now - 100_000  # ~100s ago
    late = now - 1_000

    # Seed three objects, two early and one late, plus a link.
    # upsert_object stamps created_ts = now, so set it directly via SQL for
    # deterministic, spread-out timestamps.
    store.upsert_object({"id": "a", "type": "person", "label": "A"})
    store.upsert_object({"id": "b", "type": "person", "label": "B"})
    store.upsert_object({"id": "c", "type": "person", "label": "C"})
    store.upsert_link("a", "b", "KNOWS", strength=1)
    store.upsert_link("b", "c", "KNOWS", strength=1)

    conn = store._connect()
    try:
        conn.execute("UPDATE object SET created_ts=?, updated_ts=? WHERE id=?", (early, early, "a"))
        conn.execute("UPDATE object SET created_ts=?, updated_ts=? WHERE id=?", (early, early, "b"))
        conn.execute("UPDATE object SET created_ts=?, updated_ts=? WHERE id=?", (late, late, "c"))
        conn.commit()
    finally:
        conn.close()

    # graph reads the live store; reload it then graph_time so they bind to the
    # temp DB.
    from server.services import graph as graph_mod
    importlib.reload(graph_mod)
    from server.services import graph_time as gt_mod
    importlib.reload(gt_mod)

    return gt_mod, {"now": now, "early": early, "late": late}


def test_graph_at_early_has_fewer_nodes_than_now(gt):
    gt_mod, ts = gt
    early_snap = gt_mod.graph_at(ts["early"])
    now_snap = gt_mod.graph_at(ts["now"])
    assert early_snap["n_nodes"] <= now_snap["n_nodes"]
    # 'c' is created late -> absent in the early snapshot, present now.
    early_ids = {n["id"] for n in early_snap["nodes"]}
    now_ids = {n["id"] for n in now_snap["nodes"]}
    assert "c" not in early_ids
    assert "c" in now_ids
    assert "a" in early_ids and "b" in early_ids


def test_graph_at_never_raises_on_garbage(gt):
    gt_mod, _ = gt
    snap = gt_mod.graph_at("not-a-number")
    assert "n_nodes" in snap and "nodes" in snap and "edges" in snap


def test_playback_returns_n_frames_nondecreasing(gt):
    gt_mod, ts = gt
    res = gt_mod.playback(frames=6, t0=ts["early"] - 1, t1=ts["now"])
    assert res["frames"] == 6
    assert len(res["snapshots"]) == 6
    counts = [s["n_nodes"] for s in res["snapshots"]]
    # the graph only grows over time -> node counts are non-decreasing.
    assert counts == sorted(counts), counts
    # first frame should be before 'c' exists, last frame should include it.
    assert counts[0] <= counts[-1]
    assert counts[-1] >= 3


def test_playback_honest_note_present(gt):
    gt_mod, ts = gt
    res = gt_mod.playback(frames=4, t0=ts["early"], t1=ts["now"])
    # links carry no explicit ts in the ontology store; service must say so via
    # has_link_timestamps + a note. (Edges are dated via endpoint creation here,
    # so has_link_timestamps is True; the field must always be present.)
    assert "has_link_timestamps" in res
    assert "note" in res


def test_playback_each_frame_shape(gt):
    gt_mod, ts = gt
    res = gt_mod.playback(frames=3, t0=ts["early"], t1=ts["now"])
    for s in res["snapshots"]:
        assert {"ts", "n_nodes", "n_edges", "nodes", "edges"} <= set(s.keys())
        assert s["n_nodes"] == len(s["nodes"])
        assert s["n_edges"] == len(s["edges"])


def test_playback_node_cap(gt):
    gt_mod, ts = gt
    res = gt_mod.playback(frames=2, t0=ts["early"], t1=ts["now"], cap=1)
    for s in res["snapshots"]:
        assert s["n_nodes"] <= 1


def test_playback_default_window(gt):
    gt_mod, _ = gt
    # No window supplied -> uses observed object-ts bounds; still returns frames.
    res = gt_mod.playback(frames=4)
    assert res["frames"] == 4
    assert len(res["snapshots"]) == 4
