"""Blackboard tee — wraps assurance EventBus + appends to autopilot JSONL."""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

BLACKBOARD_DIR = os.path.join(ROOT, "autopilot", "blackboard")
STATE_DIR = os.path.join(ROOT, "autopilot", "state")
os.makedirs(BLACKBOARD_DIR, exist_ok=True)
os.makedirs(STATE_DIR, exist_ok=True)


def _now() -> float:
    return time.time()


def new_run_id() -> str:
    return f"ap-{int(_now() * 1000)}-{uuid.uuid4().hex[:6]}"


def _append_jsonl(path: str, obj: dict[str, Any]) -> None:
    try:
        line = json.dumps(obj, ensure_ascii=True, separators=(",", ":"))
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def _tee_to_assurance(name: str, payload: dict[str, Any], run_id: str) -> str | None:
    try:
        from assurance.events.bus import get_bus  # type: ignore
        from assurance.events.types import Event  # type: ignore
        from assurance.audit.redact import redact_value  # type: ignore
        evt = get_bus().append(Event(
            name=name,
            actor="autopilot",
            source="autopilot.control.state_store",
            correlation_id=run_id,
            payload=redact_value(payload),
        ))
        return evt.correlation_id
    except Exception:  # noqa: BLE001
        return None


def observe(run_id: str, kind: str, detail: dict[str, Any]) -> None:
    obj = {"ts": _now(), "run_id": run_id, "kind": kind, "detail": detail}
    _append_jsonl(os.path.join(BLACKBOARD_DIR, "observations.jsonl"), obj)
    _tee_to_assurance("autopilot.observation", {"kind": kind, **detail}, run_id)


def hypothesize(run_id: str, hypothesis: str, evidence: dict[str, Any]) -> None:
    obj = {"ts": _now(), "run_id": run_id, "hypothesis": hypothesis, "evidence": evidence}
    _append_jsonl(os.path.join(BLACKBOARD_DIR, "hypotheses.jsonl"), obj)


def plan(run_id: str, action: dict[str, Any]) -> None:
    obj = {"ts": _now(), "run_id": run_id, **action}
    _append_jsonl(os.path.join(BLACKBOARD_DIR, "plans.jsonl"), obj)


def act(run_id: str, action: dict[str, Any]) -> None:
    obj = {"ts": _now(), "run_id": run_id, **action}
    _append_jsonl(os.path.join(BLACKBOARD_DIR, "actions.jsonl"), obj)
    _tee_to_assurance("autopilot.action", action, run_id)


def result(run_id: str, action_id: str, outcome: dict[str, Any]) -> None:
    obj = {"ts": _now(), "run_id": run_id, "action_id": action_id, **outcome}
    _append_jsonl(os.path.join(BLACKBOARD_DIR, "results.jsonl"), obj)
    _tee_to_assurance("autopilot.result", {"action_id": action_id, **outcome}, run_id)


def learn(run_id: str, lesson: str, detail: dict[str, Any] | None = None) -> None:
    obj = {"ts": _now(), "run_id": run_id, "lesson": lesson, "detail": detail or {}}
    _append_jsonl(os.path.join(BLACKBOARD_DIR, "learnings.jsonl"), obj)


def write_kv(name: str, data: Any) -> str:
    path = os.path.join(STATE_DIR, name)
    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)
    except OSError:
        pass
    return path


def read_kv(name: str, default: Any = None) -> Any:
    path = os.path.join(STATE_DIR, name)
    if not os.path.exists(path):
        return default
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return default
