"""SECRETS VAULT tests — fully OFFLINE / deterministic, temp DBs only.

Exercises put/get roundtrip, list-never-exposes-values, and $secret resolution
into a connector config (#11) over fresh temp SQLite DBs (env VAULT_DB /
AUDIT_DB / CONNECTORS_DB / DATASETS_DB / HISTORY_LAKE_DB). No network, no API key.
The connector is the OFFLINE ``inline`` kind. Run:

    python3 -m pytest server/tests/test_secrets_vault.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def vault(tmp_path, monkeypatch):
    """Reload audit + datasets + connectors + secrets_vault against temp DBs."""
    monkeypatch.setenv("AUDIT_DB", str(tmp_path / "audit.db"))
    monkeypatch.setenv("HISTORY_LAKE_DB", str(tmp_path / "lake.db"))
    monkeypatch.setenv("DATASETS_DB", str(tmp_path / "datasets.db"))
    monkeypatch.setenv("CONNECTORS_DB", str(tmp_path / "connectors.db"))
    monkeypatch.setenv("VAULT_DB", str(tmp_path / "vault.db"))

    from server.services import audit as a
    importlib.reload(a)
    a.init_db()

    from server.services import history_lake as hl
    importlib.reload(hl)
    hl.init_db()
    from server.services import datasets as d
    importlib.reload(d)
    d.init_db()
    from server.services import connectors as c
    importlib.reload(c)
    c.init_db()

    from server.services import secrets_vault as v
    importlib.reload(v)
    v.init_db()
    return v, c


# ── put → get roundtrip ─────────────────────────────────────────────────────────
def test_put_get_roundtrip(vault):
    v, _c = vault
    res = v.put_secret("api_key", "super-secret-token", owner="alice")
    assert res["ok"] is True
    assert res["obfuscation"] == "base64"
    # the put response carries metadata only — never the value.
    assert "value" not in res
    assert "super-secret-token" not in str(res)

    # server-side getter returns the clear value.
    assert v.get_secret("api_key") == "super-secret-token"
    # missing secret → None, never raises.
    assert v.get_secret("nope") is None


def test_obfuscated_not_plaintext_at_rest(vault):
    v, _c = vault
    v.put_secret("token", "PLAINTEXT-VALUE", owner="bob")
    import sqlite3
    conn = sqlite3.connect(v._db_path())
    row = conn.execute("SELECT value_b64 FROM secret WHERE name='token'").fetchone()
    conn.close()
    # stored obfuscated (base64), not bare plaintext.
    assert row[0] != "PLAINTEXT-VALUE"
    assert "PLAINTEXT-VALUE" not in row[0]


def test_list_never_exposes_values(vault):
    v, _c = vault
    v.put_secret("k1", "value-one", owner="alice")
    v.put_secret("k2", "value-two", owner="bob")
    items = v.list_secrets()
    names = {i["name"] for i in items}
    assert names == {"k1", "k2"}
    # NO value field anywhere in the listing.
    blob = str(items)
    assert "value-one" not in blob and "value-two" not in blob
    for i in items:
        assert "value" not in i
        assert "value_b64" not in i
        assert set(i.keys()) >= {"name", "owner", "obfuscation"}


def test_delete_secret(vault):
    v, _c = vault
    v.put_secret("temp", "x", owner="alice")
    assert v.delete_secret("temp")["deleted"] == 1
    assert v.get_secret("temp") is None
    # deleting again is a no-op, never raises.
    assert v.delete_secret("temp")["deleted"] == 0


# ── $secret resolution into a connector config (#11) ────────────────────────────────
def test_secret_resolution_injects_into_connector_config(vault):
    v, c = vault
    v.put_secret("my_key", "INJECTED-KEY", owner="alice")

    reg = c.register_connector(
        "weather",
        "rest_json",
        {"url": "https://example.test/api", "api_key": "$secret:my_key",
         "headers": {"Authorization": "$secret:my_key"}},
    )
    assert reg["ok"] is True
    cid = reg["id"]

    resolved = v.resolve_for_connector(cid)
    assert resolved["ok"] is True
    cfg = resolved["config"]
    # the $secret reference was replaced by the real value (top-level + nested).
    assert cfg["api_key"] == "INJECTED-KEY"
    assert cfg["headers"]["Authorization"] == "INJECTED-KEY"
    # non-reference values are untouched.
    assert cfg["url"] == "https://example.test/api"

    # the stored connector config still holds the REFERENCE, not the value.
    stored = c.get_connector(cid)
    assert stored["config"]["api_key"] == "$secret:my_key"

    # unknown connector → honest error, never raises.
    assert v.resolve_for_connector("does-not-exist")["ok"] is False

    # a missing secret reference is left untouched (not silently blanked).
    reg2 = c.register_connector("missing", "inline",
                                {"rows": [], "token": "$secret:absent"})
    out = v.resolve_for_connector(reg2["id"])
    assert out["config"]["token"] == "$secret:absent"
