"""Pytest wiring for the standalone contract-validation harness.

This module loads test-harness/contract_validate.py by absolute path (the
directory name contains a hyphen, so it is not importable as a normal package)
and exercises each validator. Every test resolves paths from the repo root,
which is two parents up from this file (server/tests/ -> server/ -> repo root),
so the suite is robust to the current working directory.
"""

import importlib.util
import sys
from pathlib import Path

# server/tests/ -> server/ -> repo root
REPO_ROOT = Path(__file__).resolve().parents[2]
HARNESS_PATH = REPO_ROOT / "test-harness" / "contract_validate.py"

# Make the repo root importable for anything downstream that may need it.
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def _load_harness():
    spec = importlib.util.spec_from_file_location("contract_validate", HARNESS_PATH)
    assert spec is not None and spec.loader is not None, f"cannot load {HARNESS_PATH}"
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


cv = _load_harness()


def test_harness_resolves_repo_root():
    # The harness must resolve the repo root from __file__, not cwd.
    assert cv.REPO_ROOT == REPO_ROOT


def test_contracts_json_all_valid():
    count = cv.validate_json_contracts()
    assert count >= 1


def test_openapi_files_have_openapi_key():
    count = cv.validate_openapi()
    assert count >= 1


def test_asyncapi_files_have_asyncapi_key():
    count = cv.validate_asyncapi()
    assert count >= 1


def test_protobuf_balanced_and_has_messages():
    count = cv.validate_protobuf()
    assert count >= 1


def test_twelve_platform_schemas_exist():
    # validate_sql raises if any of the 12 platform_* schemas is missing.
    sql_count = cv.validate_sql()
    assert sql_count >= 1
    assert len(cv.PLATFORM_SCHEMAS) == 12


def test_at_least_ten_target_runtime_planes():
    plane_files = sorted(REPO_ROOT.glob("*/TARGET_RUNTIME.md"))
    assert len(plane_files) >= 10


def test_full_summary_counts():
    summary = cv.validate_all()
    assert set(summary) == {"json", "openapi", "asyncapi", "proto", "sql", "planes"}
    assert summary["planes"] >= 10
