"""Deterministic Test Harness for LLMs — exact, semantic, schema, regex metrics.

Test cases stored in SQLite ``aip_evals`` table.
Benchmark runs suites across multiple models and produces accuracy / latency / token reports.
"""

from __future__ import annotations

import json
import math
import os
import re
import sqlite3
import time
import uuid
from typing import Any, Optional

from . import llm_research as _llm

try:
    from . import audit as _audit
except Exception:  # noqa: BLE001
    _audit = None  # type: ignore[assignment]

_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "aip_evals.db"
)


def _db_path() -> str:
    return os.environ.get("AIP_EVALS_DB", _DEFAULT_DB)


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
CREATE TABLE IF NOT EXISTS aip_evals (
    id          TEXT PRIMARY KEY,
    suite_id    TEXT NOT NULL DEFAULT 'default',
    name        TEXT NOT NULL DEFAULT '',
    prompt      TEXT NOT NULL DEFAULT '',
    system      TEXT NOT NULL DEFAULT '',
    expect_json TEXT NOT NULL DEFAULT '{}',
    created_ts  INTEGER NOT NULL,
    actor       TEXT
);
CREATE INDEX IF NOT EXISTS ix_eval_suite ON aip_evals (suite_id, created_ts);

CREATE TABLE IF NOT EXISTS aip_eval_runs (
    id          TEXT PRIMARY KEY,
    eval_id     TEXT NOT NULL,
    model       TEXT NOT NULL,
    output      TEXT NOT NULL DEFAULT '',
    metrics_json TEXT NOT NULL DEFAULT '{}',
    latency_ms  INTEGER NOT NULL DEFAULT 0,
    tokens      INTEGER NOT NULL DEFAULT 0,
    passed      INTEGER NOT NULL DEFAULT 0,
    created_ts  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_run_eval ON aip_eval_runs (eval_id, model);
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


# ── Metrics ──────────────────────────────────────────────────────────────────────
def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip().lower()


def metric_exact(predicted: str, expected: str) -> float:
    return 1.0 if _normalize(predicted) == _normalize(expected) else 0.0


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def metric_cosine(predicted: str, expected: str) -> float:
    """Simple token-level cosine similarity (0..1)."""
    a = _tokenize(predicted)
    b = _tokenize(expected)
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    inter = len(a & b)
    return inter / (math.sqrt(len(a)) * math.sqrt(len(b)))


def metric_json_schema(predicted: str, schema: Optional[dict]) -> float:
    """Validate predicted text parses as JSON and contains expected keys/types."""
    if not schema:
        return 1.0
    try:
        data = json.loads(predicted)
    except Exception:  # noqa: BLE001
        return 0.0
    required = schema.get("required", [])
    if isinstance(required, list):
        for key in required:
            if key not in data:
                return 0.0
    properties = schema.get("properties", {})
    if isinstance(properties, dict):
        for key, ptype in properties.items():
            if key not in data:
                continue
            val = data[key]
            if ptype == "string" and not isinstance(val, str):
                return 0.0
            if ptype == "number" and not isinstance(val, (int, float)):
                return 0.0
            if ptype == "boolean" and not isinstance(val, bool):
                return 0.0
            if ptype == "array" and not isinstance(val, list):
                return 0.0
            if ptype == "object" and not isinstance(val, dict):
                return 0.0
    return 1.0


def metric_regex(predicted: str, pattern: str) -> float:
    try:
        return 1.0 if re.search(pattern, predicted) else 0.0
    except re.error:
        return 0.0


def score_run(predicted: str, expect: dict) -> dict:
    """Compute all metrics for a single prediction. Returns ``{exact, cosine, schema, regex, overall}``."""
    exact = metric_exact(predicted, expect.get("text", ""))
    cosine = metric_cosine(predicted, expect.get("text", ""))
    schema = metric_json_schema(predicted, expect.get("json_schema"))
    regex = metric_regex(predicted, expect.get("regex", ""))
    weights = expect.get("weights", {"exact": 0.25, "cosine": 0.25, "schema": 0.25, "regex": 0.25})
    overall = (
        exact * weights.get("exact", 0.25)
        + cosine * weights.get("cosine", 0.25)
        + schema * weights.get("schema", 0.25)
        + regex * weights.get("regex", 0.25)
    )
    return {
        "exact": round(exact, 4),
        "cosine": round(cosine, 4),
        "schema": round(schema, 4),
        "regex": round(regex, 4),
        "overall": round(overall, 4),
    }


# ── CRUD ─────────────────────────────────────────────────────────────────────────
def create_test_case(
    test_case: dict,
    actor: Optional[str] = None,
    db_path: Optional[str] = None,
) -> dict:
    """Persist an eval test case. Returns ``{ok, eval_id}``."""
    init_db(db_path)
    eid = uuid.uuid4().hex
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                "INSERT INTO aip_evals (id, suite_id, name, prompt, system, expect_json, created_ts, actor) VALUES (?,?,?,?,?,?,?,?)",
                (
                    eid,
                    str(test_case.get("suite_id") or "default"),
                    str(test_case.get("name") or ""),
                    str(test_case.get("prompt") or ""),
                    str(test_case.get("system") or ""),
                    _dumps(test_case.get("expect")),
                    now,
                    actor,
                ),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "eval_id": eid}


def list_test_cases(suite_id: Optional[str] = None, db_path: Optional[str] = None) -> list[dict]:
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            if suite_id:
                rows = conn.execute(
                    "SELECT * FROM aip_evals WHERE suite_id=? ORDER BY created_ts DESC",
                    (str(suite_id),),
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM aip_evals ORDER BY created_ts DESC").fetchall()
            return [
                {
                    "id": r["id"],
                    "suite_id": r["suite_id"],
                    "name": r["name"],
                    "prompt": r["prompt"],
                    "system": r["system"],
                    "expect": _loads(r["expect_json"]),
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
async def run_eval(test_case: dict, model: str, db_path: Optional[str] = None) -> dict:
    """Run a single eval test case against a model. Returns ``{ok, eval_id, output, metrics, latency_ms, passed}``."""
    init_db(db_path)
    prompt = str(test_case.get("prompt") or "")
    system = str(test_case.get("system") or "")
    expect = test_case.get("expect") if isinstance(test_case.get("expect"), dict) else {}

    # Use llm_research for single-shot completion (synchronous).
    start = time.perf_counter()
    output = _llm.llm_complete(prompt, system=system, max_tokens=expect.get("max_tokens", 512), fmt=expect.get("fmt"))
    latency_ms = int((time.perf_counter() - start) * 1000)
    output = output or ""

    metrics = score_run(output, expect)
    passed = metrics["overall"] >= expect.get("threshold", 0.8)

    # Persist run if eval_id provided
    eval_id = test_case.get("id") or test_case.get("eval_id") or ""
    rid = uuid.uuid4().hex
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                "INSERT INTO aip_eval_runs (id, eval_id, model, output, metrics_json, latency_ms, tokens, passed, created_ts) VALUES (?,?,?,?,?,?,?,?,?)",
                (rid, eval_id, model, output, _dumps(metrics), latency_ms, 0, int(passed), now),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass

    if _audit is not None:
        try:
            _audit.record("eval", "aip_evals.run", test_case.get("name", ""),
                          {"model": model, "passed": passed, "overall": metrics["overall"]})
        except Exception:  # noqa: BLE001
            pass

    return {
        "ok": True,
        "eval_id": eval_id,
        "run_id": rid,
        "output": output,
        "metrics": metrics,
        "latency_ms": latency_ms,
        "passed": passed,
    }


async def benchmark(models: list[str], suite_id: str, db_path: Optional[str] = None) -> dict:
    """Run a full benchmark suite across models. Returns report with accuracy, latency, token usage."""
    init_db(db_path)
    cases = list_test_cases(suite_id, db_path=db_path)
    if not cases:
        return {"ok": False, "error": "no test cases found", "suite_id": suite_id}

    per_model: dict[str, dict] = {}
    for model in models:
        passed = 0
        total_latency = 0
        total_tokens = 0
        results: list[dict] = []
        for case in cases:
            res = await run_eval(case, model, db_path=db_path)
            if res.get("passed"):
                passed += 1
            total_latency += res.get("latency_ms", 0)
            total_tokens += res.get("tokens", 0)
            results.append({"case": case.get("name"), **res})
        per_model[model] = {
            "accuracy": round(passed / len(cases), 4) if cases else 0.0,
            "avg_latency_ms": round(total_latency / len(cases), 2) if cases else 0.0,
            "total_tokens": total_tokens,
            "passed": passed,
            "total": len(cases),
            "results": results,
        }

    report = {
        "suite_id": suite_id,
        "models": per_model,
        "summary": {
            "cases": len(cases),
            "models_tested": len(models),
        },
    }

    if _audit is not None:
        try:
            _audit.record("eval", "aip_evals.benchmark", suite_id,
                          {"models": models, "cases": len(cases)})
        except Exception:  # noqa: BLE001
            pass

    return {"ok": True, "report": report}


def get_report(run_id: str, db_path: Optional[str] = None) -> dict | None:
    """Fetch a single eval run record by id."""
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            row = conn.execute("SELECT * FROM aip_eval_runs WHERE id=?", (str(run_id or ""),)).fetchone()
            if not row:
                return None
            return {
                "id": row["id"],
                "eval_id": row["eval_id"],
                "model": row["model"],
                "output": row["output"],
                "metrics": _loads(row["metrics_json"]),
                "latency_ms": row["latency_ms"],
                "tokens": row["tokens"],
                "passed": bool(row["passed"]),
                "created_ts": row["created_ts"],
            }
        finally:
            conn.close()
    except sqlite3.Error:
        return None
