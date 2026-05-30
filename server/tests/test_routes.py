import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

os.environ["JARVIS_API_KEY"] = "test-key"

from fastapi.testclient import TestClient  # noqa: E402

from server.main import app  # noqa: E402
from server.services import live_intel as live_intel_mod  # noqa: E402

client = TestClient(app)
HEADERS = {"Authorization": "Bearer test-key"}


def test_root_open():
    res = client.get("/")
    assert res.status_code == 200
    assert res.json()["service"] == "jarvis-backend"


def test_auth_required():
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_auth_me():
    res = client.get("/auth/me", headers=HEADERS)
    assert res.status_code == 200
    assert res.json()["authenticated"] is True


def test_live_intel_shape(monkeypatch):
    # Avoid hitting USGS / Yahoo from CI — substitute a deterministic value.
    live_intel_mod._cache.update({"ts": 0.0, "value": None})

    async def fake_get_live_intel():
        return {
            "earthquakes": [{"lat": 0, "lng": 0, "mag": 5.2, "place": "test"}],
            "markets": [{"sym": "XRP-AUD", "display": "XRP/AUD", "price": "2.07", "change_pct": 1.2}],
            "corpus": {
                "timeline": [],
                "investment_emails": [],
                "crypto_emails": [],
                "psg_emails": [],
                "travel_emails": [],
                "wedding_emails": [],
                "music_emails": [],
                "facts": {"predicates": {}},
            },
            "panopticon": {"maps": ["city_grid"]},
            "counterstrike": {"maps": ["de_dust2"]},
            "generated_at": 0,
        }

    monkeypatch.setattr("server.routes.functions.get_live_intel", fake_get_live_intel)
    res = client.post("/functions/getLiveIntel", headers=HEADERS)
    assert res.status_code == 200
    body = res.json()
    # Frontend destructures these — they must exist on every response.
    for key in ("earthquakes", "markets", "corpus", "panopticon", "counterstrike"):
        assert key in body, f"missing key: {key}"
    for key in ("timeline", "investment_emails", "psg_emails", "wedding_emails", "music_emails", "facts"):
        assert key in body["corpus"], f"missing corpus.{key}"


def test_entity_crud():
    create = client.put(
        "/entities/RiskSignal",
        json={"id": "rTEST", "title": "Created in test", "severity": 10},
        headers=HEADERS,
    )
    assert create.status_code == 200, create.text

    listed = client.post("/entities/RiskSignal", headers=HEADERS)
    assert listed.status_code == 200
    ids = [x["id"] for x in listed.json()["items"]]
    assert "rTEST" in ids
    assert "r1" in ids  # seeded entries still present

    got = client.get("/entities/RiskSignal/rTEST", headers=HEADERS)
    assert got.status_code == 200
    assert got.json()["title"] == "Created in test"

    patched = client.patch(
        "/entities/RiskSignal/rTEST",
        json={"severity": 11},
        headers=HEADERS,
    )
    assert patched.json()["severity"] == 11

    deleted = client.delete("/entities/RiskSignal/rTEST", headers=HEADERS)
    assert deleted.status_code == 204
    assert client.get("/entities/RiskSignal/rTEST", headers=HEADERS).status_code == 404


def test_stub_function_returns_not_implemented():
    res = client.post("/functions/checkUrgentEmail", headers=HEADERS, json={})
    assert res.status_code == 200
    assert res.json()["status"] == "not_implemented"


def test_live_intel_open_without_auth(monkeypatch):
    # getLiveIntel is a public read endpoint — works without a bearer token.
    live_intel_mod._cache.update({"ts": 0.0, "value": None})

    async def fake():
        return {"earthquakes": [], "markets": [], "corpus": {}, "panopticon": {},
                "counterstrike": {}, "generated_at": 0}

    monkeypatch.setattr("server.routes.functions.get_live_intel", fake)
    assert client.post("/functions/getLiveIntel").status_code == 200


def test_corpus_is_populated_with_honest_counts():
    from server.services.corpus import get_corpus

    c = get_corpus()
    emails = sum(len(c[k]) for k in c if k.endswith("_emails"))
    assert emails > 0
    assert c["totals"]["emails"] == emails
    assert len(c["timeline"]) == c["totals"]["timeline"] > 0
    assert c["facts"]["predicates"]["EMAILS"] == emails


def test_simulation_streams_moving_units():
    import time

    from server.services.simulation import snapshot

    f1 = snapshot("counterstrike")
    assert len(f1["units"]) == 10
    assert {u["team"] for u in f1["units"]} == {"CT", "T"}
    time.sleep(0.4)
    f2 = snapshot("counterstrike")
    assert f2["tick"] > f1["tick"]  # the world advances over time


def test_stream_endpoint_unknown_is_404():
    assert client.get("/streams/bogus").status_code == 404


def test_analyst_local_answer_uses_real_data():
    from server.services.analyst import answer

    assert "Pangani" in answer("tell me about pangani")
    assert "RISK SIGNALS" in answer("what are the risks")
    assert "CORPUS" in answer("how many emails")


def test_analyst_chat_streams_without_kimi_key(monkeypatch):
    # No KIMI_API_KEY in env → wrapper emits a single diagnostic line + [DONE].
    monkeypatch.setattr("server.llm.kimi.KIMI_API_KEY", "")
    res = client.post(
        "/functions/analystChat",
        headers=HEADERS,
        json={"message": "what is psg?"},
    )
    assert res.status_code == 200
    text = res.text
    assert "data:" in text
    assert "[DONE]" in text
