"""Tests for the 3D Data API (sci_3d routes).

Minimum 10 tests covering molecule, trajectory, orbital endpoints.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

os.environ.setdefault("JARVIS_API_KEY", "test-key")

from fastapi.testclient import TestClient

from server.main import app

client = TestClient(app)


def test_molecule_basic():
    res = client.post("/v1/sci/3d/molecule", json={
        "atoms": [
            {"element": "O", "x": 0, "y": 0, "z": 0},
            {"element": "H", "x": 0.96, "y": 0, "z": 0},
            {"element": "H", "x": -0.24, "y": 0.93, "z": 0},
        ],
        "bonds": [[0, 1], [0, 2]],
    })
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["type"] == "molecule"
    assert body["count"] == 3
    assert len(body["atoms"]) == 3
    assert len(body["bonds"]) == 2


def test_molecule_defaults_no_bonds():
    res = client.post("/v1/sci/3d/molecule", json={
        "atoms": [{"element": "C", "x": 0, "y": 0, "z": 0}],
    })
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 1
    assert body["bonds"] == []


def test_molecule_many_atoms():
    atoms = [{"element": "C", "x": i, "y": 0, "z": 0} for i in range(50)]
    res = client.post("/v1/sci/3d/molecule", json={"atoms": atoms})
    assert res.status_code == 200
    assert res.json()["count"] == 50


def test_trajectory_basic():
    res = client.post("/v1/sci/3d/trajectory", json={
        "waypoints": [[0, 0, 0], [1, 1, 1], [2, 0, 2]],
        "steps": 10,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["type"] == "trajectory"
    assert len(body["interpolated"]) == 10
    assert body["interpolated"][0] == [0, 0, 0]


def test_trajectory_too_few_waypoints():
    res = client.post("/v1/sci/3d/trajectory", json={
        "waypoints": [[0, 0, 0]],
    })
    assert res.status_code == 400


def test_trajectory_default_steps():
    res = client.post("/v1/sci/3d/trajectory", json={
        "waypoints": [[0, 0, 0], [1, 0, 0], [2, 0, 0]],
    })
    assert res.status_code == 200
    body = res.json()
    assert len(body["interpolated"]) == 100  # default steps


def test_orbit_basic():
    res = client.post("/v1/sci/3d/orbital", json={
        "a": 1.0, "e": 0.0, "i": 0, "omega": 0, "raan": 0, "nu_steps": 50,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["type"] == "orbital"
    assert len(body["points"]) == 50


def test_orbit_inclined():
    res = client.post("/v1/sci/3d/orbital", json={
        "a": 7000, "e": 0.1, "i": 45, "omega": 30, "raan": 60, "nu_steps": 100,
    })
    assert res.status_code == 200
    body = res.json()
    assert len(body["points"]) == 100
    assert any(p[2] != 0 for p in body["points"])


def test_orbit_default_params():
    res = client.post("/v1/sci/3d/orbital", json={})
    assert res.status_code == 200
    body = res.json()
    assert body["params"]["a"] == 1.0
    assert body["params"]["e"] == 0.0
    assert len(body["points"]) == 200


def test_catalog_shape():
    res = client.get("/v1/sci/3d/catalog")
    assert res.status_code == 200
    body = res.json()
    assert "datasets" in body
    assert isinstance(body["datasets"], list)
    assert body["total"] == len(body["datasets"])
    assert all("id" in d and "type" in d for d in body["datasets"])


def test_catalog_has_known_datasets():
    res = client.get("/v1/sci/3d/catalog")
    body = res.json()
    ids = {d["id"] for d in body["datasets"]}
    assert "water" in ids
    assert "leo_orbit" in ids
