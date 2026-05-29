"""Pytest config — point Underworld at a fresh sqlite DB per session."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

# Make the repo root importable as `underworld.*`.
_REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_REPO_ROOT))

# Env must be set BEFORE the settings cache is built.
_TMP = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_TMP.close()
os.environ["UNDERWORLD_API_KEY"] = "test-key"
os.environ["UNDERWORLD_DB_PATH"] = _TMP.name
os.environ.pop("UNDERWORLD_KIMI_API_KEY", None)
# The background scheduler holds a sqlite connection and ticks every second.
# With many TestClients each spawning their own scheduler over the same db
# file, we hit "database is locked" intermittently. Tests don't need it.
os.environ["UNDERWORLD_SCHEDULER_ENABLED"] = "false"


@pytest.fixture(scope="session", autouse=True)
def _init_db():
    """Force-create the schema in the test DB before any tests run.

    We use a fresh path per session so schema changes don't conflict with a
    DB from a prior run.
    """
    import asyncio

    from underworld.server.db.session import init_db, _reset_for_tests

    _reset_for_tests()
    asyncio.run(init_db())
    yield
    try:
        Path(_TMP.name).unlink(missing_ok=True)
    except OSError:
        pass


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from underworld.server.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def headers():
    return {"Authorization": "Bearer test-key"}
