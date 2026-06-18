"""state_store: JSONL append, KV read/write, new_run_id."""
import json
import os
import autopilot.control.state_store as ss


def test_new_run_id_unique(monkeypatch, tmp_path):
    a = ss.new_run_id()
    b = ss.new_run_id()
    assert a != b
    assert a.startswith("ap-")


def test_write_kv_and_read_kv(monkeypatch, tmp_path):
    monkeypatch.setattr(ss, "STATE_DIR", str(tmp_path))
    ss.write_kv("foo.json", {"hello": "world"})
    assert ss.read_kv("foo.json") == {"hello": "world"}


def test_read_kv_default_on_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(ss, "STATE_DIR", str(tmp_path))
    assert ss.read_kv("nonexistent.json", {"d": 1}) == {"d": 1}


def test_observe_writes_jsonl(monkeypatch, tmp_path):
    monkeypatch.setattr(ss, "BLACKBOARD_DIR", str(tmp_path))
    ss.observe("run-1", "kind.x", {"a": 1})
    p = os.path.join(tmp_path, "observations.jsonl")
    assert os.path.exists(p)
    with open(p) as fh:
        lines = fh.readlines()
    assert len(lines) == 1
    rec = json.loads(lines[0])
    assert rec["run_id"] == "run-1"
    assert rec["kind"] == "kind.x"
