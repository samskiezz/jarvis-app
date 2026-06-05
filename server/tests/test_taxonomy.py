"""The world taxonomy loads into the operational ontology as real records."""

import os
from server.services import jarvis_taxonomy as tax


def test_taxonomy_loads_300_cells_and_object_types(tmp_path, monkeypatch):
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "tax.db"))
    # reload db-path-dependent modules use env at call-time, so a fresh load() targets tmp
    out = tax.load()
    assert out["topics"] == 30
    assert out["niches"] == 10
    assert out["cells"] == 300                 # 30 x 10 base ontology cells
    assert out["families"] == 20               # acquisition-point families
    assert out["object_types"] == 12           # Palantir-style object types registered

    s = tax.summary()
    assert s["cells"] == 300 and s["families"] == 20

    # frontier drives ingestion
    assert len(tax.frontier(5)) == 5
    assert len(tax.frontier(10, with_niche=True)) == 10
    # cells query
    cz = tax.cells("Earth systems")
    assert len(cz) == 10 and all(c["topic"] == "Earth systems" for c in cz)
