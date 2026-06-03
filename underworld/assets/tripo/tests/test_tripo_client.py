"""Tests for the Tripo3D client + generator — mocked, no network, no API key."""
import io, json, sys, types
from pathlib import Path
import pytest

import underworld.assets.tripo.tripo_client as tc


def test_requires_api_key(monkeypatch):
    monkeypatch.delenv("TRIPO3D_API_KEY", raising=False)
    with pytest.raises(tc.TripoError):
        tc.create_text_task("a chair")


def test_create_poll_download_flow(monkeypatch, tmp_path):
    monkeypatch.setenv("TRIPO3D_API_KEY", "tsk_test")
    calls = {"create": 0, "poll": 0}

    def fake_post(path, body):
        calls["create"] += 1
        assert body["type"] == "text_to_model" and body["prompt"]
        return {"code": 0, "data": {"task_id": "t123"}}

    def fake_get(path):
        calls["poll"] += 1
        # first poll running, then success
        if calls["poll"] < 2:
            return {"data": {"status": "running"}}
        return {"data": {"status": "success",
                         "output": {"model": "http://x/m.glb",
                                    "pbr_model": "http://x/m-pbr.glb"}}}

    def fake_download(url, dest):
        assert url == "http://x/m-pbr.glb"           # prefers PBR
        Path(dest).write_bytes(b"GLBDATA")
        return 7

    monkeypatch.setattr(tc, "_post", fake_post)
    monkeypatch.setattr(tc, "_get", fake_get)
    monkeypatch.setattr(tc, "download", fake_download)
    monkeypatch.setattr(tc.time, "sleep", lambda s: None)

    rec = tc.generate_to_file("a cosy chair", tmp_path / "chair.glb")
    assert rec["task_id"] == "t123" and rec["bytes"] == 7
    assert (tmp_path / "chair.glb").read_bytes() == b"GLBDATA"
    assert calls["create"] == 1 and calls["poll"] >= 2


def test_poll_raises_on_failure(monkeypatch):
    monkeypatch.setenv("TRIPO3D_API_KEY", "tsk_test")
    monkeypatch.setattr(tc, "_get", lambda p: {"data": {"status": "failed"}})
    monkeypatch.setattr(tc.time, "sleep", lambda s: None)
    with pytest.raises(tc.TripoError):
        tc.poll_task("t1", timeout_s=5)


def test_design_list_and_dry_run(capsys):
    from underworld.assets.tripo import design_list, generate
    assert len(design_list.DESIGNS) >= 20
    assert all(len(d) == 4 for d in design_list.DESIGNS)
    industrial = design_list.designs_for("industrial")
    assert any(d[2] == "industrial" for d in industrial)
    assert any(d[2] == "any" for d in industrial)    # evergreens included
    rc = generate.main(["--dry-run", "--epoch", "industrial"])
    assert rc == 0
    assert "to generate" in capsys.readouterr().out
