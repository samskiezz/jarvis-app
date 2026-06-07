"""AIP Logic Workflow Engine — no-code / step-by-step LLM workflows over the ontology tool catalog.

Workflows are stored in SQLite (``aip_workflows`` table) and each execution produces a
``derivation`` record for transparent audit.

Built-in workflow types:
  * research  — decompose topic, gather evidence, synthesise.
  * monitor   — periodic tool call + condition evaluation.
  * approve   — human-in-the-loop proposal + approval.
  * alert     — condition → notification.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from typing import Any, Optional

from . import aip_tools as _tools
from . import llm_research as _llm

try:
    from . import audit as _audit
except Exception:  # noqa: BLE001
    _audit = None  # type: ignore[assignment]

_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "aip_logic.db"
)


def _db_path() -> str:
    return os.environ.get("AIP_LOGIC_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _dumps(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else {}, default=str)
    except (TypeError, ValueError):
        return "{}"


def _loads(text: Optional[str]) -> Any:
    if not text:
        return {}
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return {}


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS aip_workflows (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL DEFAULT '',
    workflow_type TEXT NOT NULL DEFAULT 'research',
    steps_json  TEXT NOT NULL DEFAULT '[]',
    created_ts  INTEGER NOT NULL,
    actor       TEXT
);
CREATE INDEX IF NOT EXISTS ix_workflow_type ON aip_workflows (workflow_type, created_ts);

CREATE TABLE IF NOT EXISTS aip_workflow_runs (
    id          TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    inputs_json TEXT NOT NULL DEFAULT '{}',
    status      TEXT NOT NULL DEFAULT 'pending',
    result_json TEXT NOT NULL DEFAULT '{}',
    actor       TEXT,
    started_ts  INTEGER NOT NULL,
    ended_ts    INTEGER
);
CREATE INDEX IF NOT EXISTS ix_run_status ON aip_workflow_runs (status, started_ts);

CREATE TABLE IF NOT EXISTS aip_derivations (
    id          TEXT PRIMARY KEY,
    run_id      TEXT NOT NULL,
    step_index  INTEGER NOT NULL DEFAULT 0,
    step_type   TEXT NOT NULL,
    input_json  TEXT NOT NULL DEFAULT '{}',
    output_json TEXT NOT NULL DEFAULT '{}',
    created_ts  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_der_run ON aip_derivations (run_id, step_index);
"""


def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    path = db_path or _db_path()
    if path != ":memory:":
        parent = os.path.dirname(path)
        if parent and not os.path.isdir(parent):
            try:
                os.makedirs(parent, exist_ok=True)
            except OSError:
                pass
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        if path != ":memory:":
            conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
    except sqlite3.Error:
        pass
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── Workflow definition ──────────────────────────────────────────────────────────
class AIPWorkflow:
    """In-memory representation of a workflow definition."""

    def __init__(
        self,
        name: str = "",
        workflow_type: str = "research",
        steps: Optional[list[dict]] = None,
    ):
        self.name = str(name or "")
        self.workflow_type = str(workflow_type or "research")
        self.steps = list(steps) if steps else []

    def to_dict(self) -> dict:
        return {"name": self.name, "workflow_type": self.workflow_type, "steps": self.steps}

    @classmethod
    def from_dict(cls, data: dict) -> "AIPWorkflow":
        return cls(
            name=data.get("name", ""),
            workflow_type=data.get("workflow_type", "research"),
            steps=data.get("steps") or [],
        )


# ── CRUD ─────────────────────────────────────────────────────────────────────────
def create_workflow(
    workflow: AIPWorkflow,
    actor: Optional[str] = None,
    db_path: Optional[str] = None,
) -> dict:
    """Persist a workflow definition. Returns ``{ok, workflow_id}``."""
    init_db(db_path)
    wid = uuid.uuid4().hex
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                "INSERT INTO aip_workflows (id, name, workflow_type, steps_json, created_ts, actor) VALUES (?,?,?,?,?,?)",
                (wid, workflow.name, workflow.workflow_type, _dumps(workflow.steps), now, actor),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "workflow_id": wid}


def get_workflow(workflow_id: str, db_path: Optional[str] = None) -> Optional[dict]:
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            row = conn.execute("SELECT * FROM aip_workflows WHERE id=?", (str(workflow_id or ""),)).fetchone()
            if not row:
                return None
            return {
                "id": row["id"],
                "name": row["name"],
                "workflow_type": row["workflow_type"],
                "steps": _loads(row["steps_json"]),
                "created_ts": row["created_ts"],
                "actor": row["actor"],
            }
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def list_workflows(workflow_type: Optional[str] = None, db_path: Optional[str] = None) -> list[dict]:
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            if workflow_type:
                rows = conn.execute(
                    "SELECT * FROM aip_workflows WHERE workflow_type=? ORDER BY created_ts DESC",
                    (str(workflow_type),),
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM aip_workflows ORDER BY created_ts DESC").fetchall()
            return [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "workflow_type": r["workflow_type"],
                    "steps": _loads(r["steps_json"]),
                    "created_ts": r["created_ts"],
                    "actor": r["actor"],
                }
                for r in rows
            ]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


# ── Execution ────────────────────────────────────────────────────────────────────
async def execute_workflow(
    workflow_id: str,
    inputs: Optional[dict] = None,
    actor: Optional[str] = None,
    db_path: Optional[str] = None,
) -> dict:
    """Execute a stored workflow with audit derivation records.

    Returns ``{ok, run_id, trace, result}``. Never raises.
    """
    init_db(db_path)
    wf = get_workflow(workflow_id, db_path=db_path)
    if wf is None:
        return {"ok": False, "error": "workflow not found", "trace": []}

    inputs = inputs if isinstance(inputs, dict) else {}
    run_id = uuid.uuid4().hex
    now = _now_ms()
    trace: list[dict] = []

    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                "INSERT INTO aip_workflow_runs (id, workflow_id, inputs_json, status, actor, started_ts) VALUES (?,?,?,?,?,?)",
                (run_id, workflow_id, _dumps(inputs), "running", actor, now),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc), "trace": []}

    def _record_derivation(step_index: int, step_type: str, inp: Any, out: Any):
        try:
            conn = _connect(db_path)
            try:
                conn.execute(
                    "INSERT INTO aip_derivations (id, run_id, step_index, step_type, input_json, output_json, created_ts) VALUES (?,?,?,?,?,?,?)",
                    (uuid.uuid4().hex, run_id, step_index, step_type, _dumps(inp), _dumps(out), _now_ms()),
                )
                conn.commit()
            finally:
                conn.close()
        except sqlite3.Error:
            pass

    steps = wf.get("steps", [])
    overall_ok = True
    final_result: Any = {}

    for i, step in enumerate(steps):
        if not isinstance(step, dict):
            rec = {"step": i, "error": "invalid step", "ok": False}
            trace.append(rec)
            _record_derivation(i, "invalid", step, rec)
            overall_ok = False
            break

        stype = str(step.get("type") or "llm")
        config = step.get("config") if isinstance(step.get("config"), dict) else {}

        if stype == "llm":
            prompt = config.get("prompt", "")
            system = config.get("system", "")
            # interpolate inputs
            prompt = prompt.format(**inputs) if prompt else ""
            system = system.format(**inputs) if system else ""
            raw = _llm.llm_complete(prompt, system=system, max_tokens=config.get("max_tokens", 512))
            out = {"text": raw}
            trace.append({"step": i, "type": "llm", "output": out})
            _record_derivation(i, "llm", {"prompt": prompt, "system": system}, out)
            # store into inputs so downstream steps can reference
            key = config.get("output_key")
            if key:
                inputs[key] = raw

        elif stype == "tool":
            tool_name = str(config.get("tool") or "")
            tool_params = config.get("params") if isinstance(config.get("params"), dict) else {}
            # interpolate params from inputs
            try:
                tool_params = {k: (v.format(**inputs) if isinstance(v, str) else v) for k, v in tool_params.items()}
            except (KeyError, ValueError):
                pass
            res = _tools.call_tool(tool_name, tool_params, actor=actor)
            trace.append({"step": i, "type": "tool", "tool": tool_name, "result": res})
            _record_derivation(i, "tool", {"tool": tool_name, "params": tool_params}, res)
            key = config.get("output_key")
            if key and res.get("ok"):
                inputs[key] = res.get("result")

        elif stype == "condition":
            expr = str(config.get("expression") or "")
            try:
                # Safe-ish evaluation: only bool ops against inputs
                result = bool(eval(expr, {"__builtins__": {}}, inputs))  # noqa: S307
            except Exception as exc:  # noqa: BLE001
                result = False
                overall_ok = False
            out = {"expression": expr, "result": result}
            trace.append({"step": i, "type": "condition", "output": out})
            _record_derivation(i, "condition", {"expression": expr}, out)
            if not result:
                # Stop workflow on false condition
                final_result = out
                break

        elif stype == "loop":
            loop_steps = config.get("steps") or []
            loop_times = int(config.get("times") or 1)
            loop_trace: list[dict] = []
            for iteration in range(loop_times):
                for ls in loop_steps:
                    if not isinstance(ls, dict):
                        continue
                    ltype = str(ls.get("type") or "llm")
                    lcfg = ls.get("config") if isinstance(ls.get("config"), dict) else {}
                    if ltype == "tool":
                        lres = _tools.call_tool(
                            str(lcfg.get("tool") or ""),
                            lcfg.get("params") if isinstance(lcfg.get("params"), dict) else {},
                            actor=actor,
                        )
                        loop_trace.append({"iteration": iteration, "tool": lcfg.get("tool"), "result": lres})
            trace.append({"step": i, "type": "loop", "iterations": loop_trace})
            _record_derivation(i, "loop", {"times": loop_times}, {"iterations": len(loop_trace)})

        else:
            rec = {"step": i, "error": f"unknown step type: {stype}", "ok": False}
            trace.append(rec)
            _record_derivation(i, "unknown", step, rec)
            overall_ok = False
            break

    final_result = {"inputs": inputs, "trace": trace, "overall_ok": overall_ok}
    ended = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                "UPDATE aip_workflow_runs SET status=?, result_json=?, ended_ts=? WHERE id=?",
                ("completed" if overall_ok else "failed", _dumps(final_result), ended, run_id),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass

    if _audit is not None:
        try:
            _audit.record(actor or "anonymous", "aip_logic.execute", workflow_id,
                          {"run_id": run_id, "ok": overall_ok, "steps": len(trace)})
        except Exception:  # noqa: BLE001
            pass

    return {"ok": overall_ok, "run_id": run_id, "trace": trace, "result": final_result}


# ── Built-in workflows ───────────────────────────────────────────────────────────
_BUILTIN: dict[str, AIPWorkflow] = {
    "research": AIPWorkflow(
        name="Research Workflow",
        workflow_type="research",
        steps=[
            {"type": "llm", "config": {"prompt": "Decompose '{topic}' into 3 sub-questions.", "output_key": "subquestions"}},
            {"type": "tool", "config": {"tool": "search", "params": {"query": "{topic}", "k": 5}, "output_key": "hits"}},
            {"type": "llm", "config": {"prompt": "S synthesise an answer for '{topic}' using: {hits}", "output_key": "answer"}},
        ],
    ),
    "monitor": AIPWorkflow(
        name="Monitor Workflow",
        workflow_type="monitor",
        steps=[
            {"type": "tool", "config": {"tool": "ontology.query", "params": {"type": "{entity_type}", "limit": 10}, "output_key": "entities"}},
            {"type": "condition", "config": {"expression": "len(entities) > 0"}},
            {"type": "llm", "config": {"prompt": "Summarise monitoring results: {entities}", "output_key": "summary"}},
        ],
    ),
    "approve": AIPWorkflow(
        name="Approval Workflow",
        workflow_type="approve",
        steps=[
            {"type": "tool", "config": {"tool": "ontology.get", "params": {"object_id": "{object_id}"}, "output_key": "obj"}},
            {"type": "llm", "config": {"prompt": "Draft rationale for approving object {object_id}: {obj}", "output_key": "rationale"}},
            {"type": "tool", "config": {"tool": "ontology.set_mark", "params": {"object_id": "{object_id}", "mark": "approved"}}},
        ],
    ),
    "alert": AIPWorkflow(
        name="Alert Workflow",
        workflow_type="alert",
        steps=[
            {"type": "tool", "config": {"tool": "search", "params": {"query": "{query}", "k": 3}, "output_key": "hits"}},
            {"type": "condition", "config": {"expression": "len(hits) > 0"}},
            {"type": "llm", "config": {"prompt": "Alert: findings for {query}: {hits}", "output_key": "alert_text"}},
        ],
    ),
}


def ensure_builtin_workflows(actor: Optional[str] = None, db_path: Optional[str] = None) -> dict:
    """Seed built-in workflows if none exist for each type. Returns counts."""
    init_db(db_path)
    created = 0
    skipped = 0
    for wf in _BUILTIN.values():
        existing = list_workflows(wf.workflow_type, db_path=db_path)
        if existing:
            skipped += 1
            continue
        res = create_workflow(wf, actor=actor, db_path=db_path)
        if res.get("ok"):
            created += 1
        else:
            skipped += 1
    return {"created": created, "skipped": skipped}
