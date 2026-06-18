"""Test fixtures: isolated buses + JSONL sinks per test."""
import os
import sys
import tempfile

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


@pytest.fixture(autouse=True)
def _isolated_sinks(monkeypatch, tmp_path):
    """Redirect every JSONL/JSON sink into a tmp_path so tests don't leak into the real run."""
    from assurance.audit import log as audit_log
    from assurance.events import bus as event_bus
    from assurance.invariants import runner as inv_runner
    audit_log.AUDIT_FILE = str(tmp_path / "audit.jsonl")
    event_bus.EVENTS_FILE = str(tmp_path / "events.jsonl")
    inv_runner.REPORT_DIR = str(tmp_path / "reports")
    os.makedirs(inv_runner.REPORT_DIR, exist_ok=True)
    # Reset singletons.
    event_bus._BUS = None
    from assurance.commands import bus as cmd_bus
    cmd_bus._BUS = None
    yield
    event_bus._BUS = None
    cmd_bus._BUS = None
