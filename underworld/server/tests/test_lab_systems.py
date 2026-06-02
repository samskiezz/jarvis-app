from underworld.server.services import lab_systems as ls
def test_lims_tracks_samples():
    lims = ls.LIMS()
    lims.register("s1", {"type": "blood"})
    assert lims.transition("s1", "assayed", "tech1") is True
    assert lims.status("s1")["state"] == "assayed"
def test_assay_and_reagent_registry():
    assert ls.assay_registry([{"id": "a1", "target": "X"}])["count"] == 1
    inv = ls.reagent_inventory([{"name": "buffer", "qty": 1, "reorder": 5}])
    assert "buffer" in inv["low_stock"]
def test_protocol_compiler_orders():
    p = ls.robotic_protocol_compiler([{"op": "mix", "order": 2}, {"op": "heat", "order": 1}])
    assert p["commands"][0]["op"] == "heat"
def test_scheduler_priority():
    s = ls.lab_task_scheduler([{"id": "t1", "priority": 1, "duration": 2},
                               {"id": "t2", "priority": 5, "duration": 1}])
    assert s["schedule"][0]["id"] == "t2"
    assert s["makespan"] == 3
def test_error_detection():
    assert ls.robotic_error_detection([1.0, 5.0], expected=1.0, tol=0.5)["ok"] is False
