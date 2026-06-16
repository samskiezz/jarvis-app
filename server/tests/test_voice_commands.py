"""Tests for the voice-command reference endpoint (``GET /v1/voice/commands``).

The Voice Commands mini-app in ``jarvis_live.html`` renders this catalog, so the
endpoint must return the exact shape the frontend consumes:
``{ok: True, categories: [{name, commands: [{phrase, example, description}]}]}``.

We mount only the voice router onto a throwaway app — we do NOT touch
``server/main.py`` — so the test stays offline and independent of the full boot.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server.routes import voice as voice_routes  # noqa: E402

_app = FastAPI()
_app.include_router(voice_routes.router)
_client = TestClient(_app)


def test_voice_commands_ok_and_shape():
    r = _client.get("/v1/voice/commands")
    assert r.status_code == 200
    d = r.json()
    assert d.get("ok") is True
    cats = d.get("categories")
    assert isinstance(cats, list) and cats, "categories must be a non-empty list"
    for cat in cats:
        assert isinstance(cat.get("name"), str) and cat["name"]
        cmds = cat.get("commands")
        assert isinstance(cmds, list) and cmds, "each category needs commands"
        for c in cmds:
            # The frontend reads exactly these three fields for every command.
            assert isinstance(c.get("phrase"), str) and c["phrase"]
            assert isinstance(c.get("description"), str) and c["description"]
            assert "example" in c and isinstance(c["example"], str)


def test_voice_commands_examples_are_handler_safe():
    """The 'Say this' button encodes each example via encodeURIComponent, so any
    string is safe — but a stray newline would still be odd in a one-line phrase.
    Guard against accidental control characters slipping into the catalog."""
    d = _client.get("/v1/voice/commands").json()
    for cat in d["categories"]:
        for c in cat["commands"]:
            ex = c["example"]
            assert "\n" not in ex and "\r" not in ex


def test_voice_commands_includes_open_voice_commands_self_reference():
    """The dashboard advertises an 'open voice commands' phrase that opens this
    very reference; make sure the catalog actually documents it."""
    d = _client.get("/v1/voice/commands").json()
    phrases = " ".join(
        c["phrase"].lower()
        for cat in d["categories"]
        for c in cat["commands"]
    )
    assert "voice command" in phrases
