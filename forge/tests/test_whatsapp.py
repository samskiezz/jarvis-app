"""Tests for the WhatsApp approval channel + webhook + agent integration."""

from __future__ import annotations

import subprocess
from pathlib import Path

from fastapi.testclient import TestClient

from forge import approvals as ap
from forge import forge_agent as fa
from forge import notify
from forge import webhook


# ── parsing + message ────────────────────────────────────────────────────────
def test_parse_decision():
    assert notify.parse_decision("APPROVE a1b2c3d4") == ("approve", "a1b2c3d4")
    assert notify.parse_decision("reject a1b2c3d4") == ("reject", "a1b2c3d4")
    assert notify.parse_decision("👍 a1b2c3d4") == ("approve", "a1b2c3d4")
    assert notify.parse_decision("yes") == ("approve", None)
    assert notify.parse_decision("no") == ("reject", None)
    assert notify.parse_decision("what is this") == (None, None)


def test_build_request_text_has_id_and_actions():
    ch = ap.Change(id="a1b2c3d4", branch="forge/x", base="main", files=["src/app.py"],
                   summary="Improve app.py", diff="- old\n+ new", status=ap.PENDING, created_at=0.0)
    text = notify.build_request_text(ch)
    assert "a1b2c3d4" in text and "APPROVE a1b2c3d4" in text and "app.py" in text


def test_from_env_falls_back_to_console(monkeypatch):
    monkeypatch.setenv("FORGE_WHATSAPP_PROVIDER", "twilio")  # creds missing
    monkeypatch.delenv("TWILIO_ACCOUNT_SID", raising=False)
    assert isinstance(notify.from_env(), notify.ConsoleNotifier)


# ── store ────────────────────────────────────────────────────────────────────
def test_store_roundtrip(tmp_path: Path):
    store = ap.ApprovalStore(tmp_path / "a.db")
    ch = store.create(branch="forge/x", base="main", files=["a.py"], summary="s", diff="d")
    assert store.get(ch.id).status == ap.PENDING
    assert store.latest_pending().id == ch.id
    store.set_status(ch.id, ap.APPROVED, by="me")
    assert store.get(ch.id).status == ap.APPROVED
    assert store.latest_pending() is None


# ── webhook ──────────────────────────────────────────────────────────────────
def _client(tmp_path: Path, calls: list):
    store = ap.ApprovalStore(tmp_path / "a.db")

    def fake_land(root, change, by):
        calls.append(("land", change.id, by))
        return True, "landed"

    def fake_reject(root, change):
        calls.append(("reject", change.id))

    app = webhook.create_app(store=store, app_root=tmp_path, lander=fake_land, rejecter=fake_reject)
    return TestClient(app), store


def test_webhook_meta_verify(tmp_path, monkeypatch):
    monkeypatch.setenv("WHATSAPP_VERIFY_TOKEN", "tok")
    client, _ = _client(tmp_path, [])
    r = client.get("/forge/whatsapp/webhook",
                   params={"hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "42"})
    assert r.status_code == 200 and r.text == "42"
    bad = client.get("/forge/whatsapp/webhook",
                     params={"hub.mode": "subscribe", "hub.verify_token": "nope"})
    assert bad.status_code == 403


def test_webhook_approve_lands_change(tmp_path):
    calls: list = []
    client, store = _client(tmp_path, calls)
    ch = store.create(branch="forge/x", base="main", files=["a.py"], summary="s", diff="d")
    body = {"entry": [{"changes": [{"value": {"messages": [
        {"from": "15551234567", "text": {"body": f"APPROVE {ch.id}"}}]}}]}]}
    r = client.post("/forge/whatsapp/webhook", json=body)
    assert r.json()["status"] == ap.LANDED
    assert ("land", ch.id, "15551234567") in calls
    assert store.get(ch.id).status == ap.LANDED


def test_webhook_reject_via_twilio_form(tmp_path):
    calls: list = []
    client, store = _client(tmp_path, calls)
    ch = store.create(branch="forge/y", base="main", files=["b.py"], summary="s", diff="d")
    r = client.post("/forge/whatsapp/webhook",
                    data={"From": "whatsapp:+1555", "Body": f"REJECT {ch.id}"})
    assert r.json()["status"] == ap.REJECTED
    assert ("reject", ch.id) in calls


def test_webhook_ignores_unknown(tmp_path):
    client, _ = _client(tmp_path, [])
    r = client.post("/forge/whatsapp/webhook", json={"entry": []})
    assert r.json().get("ignored") is True


# ── agent → proposal flow (no merge to base) ─────────────────────────────────
def _init_repo(tmp_path: Path) -> None:
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    for k, v in (("user.email", "t@t"), ("user.name", "t"), ("commit.gpgsign", "false")):
        subprocess.run(["git", "config", k, v], cwd=tmp_path, check=True)
    (tmp_path / "mod.py").write_text("def f():\n    return 1\n" * 12)
    subprocess.run(["git", "add", "."], cwd=tmp_path, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=tmp_path, check=True)


def test_agent_approval_flow_proposes_without_touching_base(tmp_path: Path, monkeypatch):
    _init_repo(tmp_path)
    base_branch = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"],
                                 cwd=tmp_path, capture_output=True, text=True).stdout.strip()
    base_file = (tmp_path / "mod.py").read_text()
    monkeypatch.setattr(fa, "ollama_improve",
                        lambda cfg, p, c, r: c.replace("return 1", "return 1  # improved"))
    cfg = fa.Config(app_root=tmp_path, apply=True, research=False, approval="whatsapp",
                    base_branch=base_branch, test_cmd="true")
    report = fa.run_cycle(cfg)

    assert report["proposed"] >= 1
    assert len(report["pending"]) >= 1
    # base branch file is untouched — change lives only on a forge/* branch
    assert (tmp_path / "mod.py").read_text() == base_file
    branches = subprocess.run(["git", "branch"], cwd=tmp_path, capture_output=True, text=True).stdout
    assert "forge/auto-" in branches
    # a PENDING change was recorded for WhatsApp approval
    store = ap.ApprovalStore(tmp_path / ".forge" / "approvals.db")
    assert store.latest_pending() is not None
