"""Correctness tests for the sovereign systems-internals engines:
Roaring bitmap + query planner, bitemporal MVCC, Merkle-DAG sync."""

import random

from server.services import jarvis_roaring as rr
from server.services import jarvis_mvcc as mvcc
from server.services import jarvis_merkle as mk


# ───────────────────────────── Roaring bitmap ─────────────────────────────
def test_roaring_setops_match_python_sets():
    rng = random.Random(7)
    a = {rng.randrange(0, 200000) for _ in range(3000)}
    b = {rng.randrange(0, 200000) for _ in range(3000)}
    ra = rr.RoaringBitmap.from_iterable(a)
    rb = rr.RoaringBitmap.from_iterable(b)
    assert (ra | rb).to_set() == (a | b)
    assert (ra & rb).to_set() == (a & b)
    assert (ra - rb).to_set() == (a - b)
    assert ra.cardinality == len(a)


def test_roaring_dense_container_compresses():
    # 60k consecutive ids in one high-key -> dense bitmap container (~8KiB),
    # far smaller than 60k*4 bytes naive.
    rb = rr.RoaringBitmap.from_iterable(range(60000))
    assert rb.cardinality == 60000
    assert rb.contains(59999) and not rb.contains(60000)
    assert rb.nbytes < 20000          # compressed, not 240000


def test_query_planner_and_or_not_and_ordering():
    idx = rr.BitmapIndex()
    # 1000 people; 50 flagged; 10 also cleared
    for i in range(1000):
        props = {"type": "Person",
                 "state": "flagged" if i < 50 else "active",
                 "cleared": "yes" if i < 10 else "no"}
        idx.add(f"person:{i}", props)
    res = idx.query({"and": [{"eq": ["type", "Person"]},
                             {"eq": ["state", "flagged"]},
                             {"not": {"eq": ["cleared", "yes"]}}]})
    assert len(res) == 40                      # 50 flagged minus 10 cleared
    assert "person:0" not in res and "person:25" in res
    # planner intersects the smallest operand first (state=flagged card 50 < type=Person 1000)
    plan = idx.plan({"and": [{"eq": ["type", "Person"]}, {"eq": ["state", "flagged"]}]})
    cards = [k["card"] for k in plan["plan"]["and"]]
    assert cards == sorted(cards) and cards[0] == 50


# ───────────────────────────── bitemporal MVCC ────────────────────────────
def test_mvcc_snapshot_isolation():
    s = mvcc.Store(); s.seed("k", "v0")
    t1 = s.begin()                     # snapshot before any concurrent write
    t2 = s.begin(); t2.put("k", "v2"); t2.commit()
    assert t1.get("k") == "v0"         # t1 still sees its snapshot
    assert s.begin().get("k") == "v2"  # a fresh txn sees the new commit


def test_mvcc_write_conflict_aborts():
    s = mvcc.Store(); s.seed("bal", 100)
    t1 = s.begin(); t2 = s.begin()
    t1.get("bal"); t1.put("bal", 110); t1.commit()        # wins
    t2.get("bal"); t2.put("bal", 120)
    try:
        t2.commit(); assert False, "expected ConflictError"
    except mvcc.ConflictError:
        assert t2.state == "aborted"
    assert s.begin().get("bal") == 110


def test_mvcc_bitemporal_as_of():
    s = mvcc.Store()
    t = s.begin(); t.put("role", "analyst", valid_from=100); t.commit()
    t = s.begin(); t.put("role", "manager", valid_from=200); t.commit()
    t = s.begin(); t.put("role", "director", valid_from=300); t.commit()
    assert s.as_of("role", valid_time=150) == "analyst"
    assert s.as_of("role", valid_time=250) == "manager"
    assert s.as_of("role", valid_time=999) == "director"
    # "as known at tx_time=1" (only the first commit was known) -> analyst at any later valid time
    assert s.as_of("role", valid_time=999, tx_time=1) == "analyst"


# ───────────────────────────── Merkle-DAG sync ────────────────────────────
def _build_remote():
    d = mk.MerkleDAG()
    leaf_a = d.add({"fact": "A"})
    leaf_b = d.add({"fact": "B"})
    mid = d.add({"node": "mid"}, [leaf_a, leaf_b])
    root = d.add({"node": "root"}, [mid])
    return d, root, leaf_a


def test_merkle_content_addressing_and_integrity():
    d, root, _ = _build_remote()
    # identical content dedups to the same hash
    h1 = d.add({"fact": "A"}); h2 = d.add({"fact": "A"})
    assert h1 == h2
    assert d.verify()["ok"]


def test_merkle_tamper_detected():
    d, root, leaf_a = _build_remote()
    d.nodes[leaf_a]["data"] = {"fact": "EVIL"}     # mutate in place
    v = d.verify()
    assert not v["ok"] and leaf_a in v["broken"]


def test_merkle_store_and_forward_sync():
    remote, root, leaf_a = _build_remote()
    bundle_all = remote.export_bundle(root)

    local = mk.MerkleDAG()
    local.import_bundle({leaf_a: bundle_all[leaf_a]})   # local has only one leaf
    want = local.want_list(root, bundle_all)
    assert leaf_a not in want and root in want and len(want) == 3
    transfer = {h: bundle_all[h] for h in want}
    added = local.import_bundle(transfer)
    assert added == 3
    assert root in local.reachable(root) and local.verify()["ok"]


def test_merkle_import_rejects_corrupt_bundle():
    remote, root, _ = _build_remote()
    bundle = remote.export_bundle(root)
    # corrupt one node's data without changing its key -> hash mismatch on import
    some = next(iter(bundle))
    bundle[some] = {"data": {"x": "tampered"}, "links": bundle[some]["links"]}
    local = mk.MerkleDAG()
    try:
        local.import_bundle(bundle); assert False, "expected ValueError"
    except ValueError:
        pass
