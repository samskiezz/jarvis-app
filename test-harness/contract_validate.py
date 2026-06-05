#!/usr/bin/env python3
"""Contract-layer validation harness for the sovereign platform.

Standalone, stdlib + pyyaml only. Validates the machine-readable contract
layer that every plane in the platform is built against:

  * JSON Schemas / policies / event definitions under contracts/
  * OpenAPI service boundaries under contracts/openapi/
  * AsyncAPI event backbone under contracts/asyncapi/
  * Protobuf wire contracts under contracts/protobuf/
  * The canonical Postgres platform schemas under database/postgres/
  * The per-plane TARGET_RUNTIME.md specifications

The repo root is resolved robustly from __file__ (repo root = parent of the
test-harness/ directory) so the harness behaves identically regardless of the
current working directory.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

# ---------------------------------------------------------------------------
# Path resolution: repo root is the parent of the directory holding this file.
# ---------------------------------------------------------------------------
HARNESS_DIR = Path(__file__).resolve().parent
REPO_ROOT = HARNESS_DIR.parent

CONTRACTS_DIR = REPO_ROOT / "contracts"
JSON_SCHEMA_DIR = CONTRACTS_DIR / "json-schema"
POLICY_DIR = CONTRACTS_DIR / "policy"
EVENTS_DIR = CONTRACTS_DIR / "events"
OPENAPI_DIR = CONTRACTS_DIR / "openapi"
ASYNCAPI_DIR = CONTRACTS_DIR / "asyncapi"
PROTOBUF_DIR = CONTRACTS_DIR / "protobuf"
POSTGRES_DIR = REPO_ROOT / "database" / "postgres"

# The 12 canonical platform_* schemas defined in 0001_platform_schemas.sql.
PLATFORM_SCHEMAS = (
    "platform_control",
    "platform_identity",
    "platform_policy",
    "platform_ontology",
    "platform_objects",
    "platform_links",
    "platform_actions",
    "platform_audit",
    "platform_events",
    "platform_ai",
    "platform_deployment",
    "platform_lineage",
)


class ContractValidationError(AssertionError):
    """Raised when a contract artefact fails validation."""


# ---------------------------------------------------------------------------
# JSON: every file under json-schema/, policy/, events/ must be valid JSON.
# The event envelope's required fields must all be present in properties.
# ---------------------------------------------------------------------------
def validate_json_contracts() -> int:
    json_dirs = [JSON_SCHEMA_DIR, POLICY_DIR, EVENTS_DIR]
    count = 0
    for d in json_dirs:
        if not d.is_dir():
            raise ContractValidationError(f"Missing contracts directory: {d}")
        for path in sorted(d.glob("*.json")):
            try:
                with path.open("r", encoding="utf-8") as fh:
                    data = json.load(fh)
            except (json.JSONDecodeError, OSError) as exc:
                raise ContractValidationError(f"Invalid JSON in {path}: {exc}") from exc
            count += 1

    # Event envelope: every required field must be defined in properties.
    envelope = EVENTS_DIR / "event-envelope.schema.json"
    if not envelope.is_file():
        raise ContractValidationError(f"Missing event envelope schema: {envelope}")
    with envelope.open("r", encoding="utf-8") as fh:
        env = json.load(fh)
    required = env.get("required", [])
    properties = env.get("properties", {})
    if not required:
        raise ContractValidationError("event-envelope.schema.json has no required fields")
    missing = [field for field in required if field not in properties]
    if missing:
        raise ContractValidationError(
            f"event-envelope.schema.json required fields not in properties: {missing}"
        )
    return count


# ---------------------------------------------------------------------------
# OpenAPI: every YAML under contracts/openapi/ must declare key 'openapi'.
# ---------------------------------------------------------------------------
def validate_openapi() -> int:
    if not OPENAPI_DIR.is_dir():
        raise ContractValidationError(f"Missing OpenAPI directory: {OPENAPI_DIR}")
    count = 0
    files = sorted(OPENAPI_DIR.glob("*.yaml")) + sorted(OPENAPI_DIR.glob("*.yml"))
    for path in files:
        with path.open("r", encoding="utf-8") as fh:
            doc = yaml.safe_load(fh)
        if not isinstance(doc, dict) or "openapi" not in doc:
            raise ContractValidationError(f"{path} is missing the 'openapi' key")
        count += 1
    if count == 0:
        raise ContractValidationError("No OpenAPI documents found")
    return count


# ---------------------------------------------------------------------------
# AsyncAPI: every YAML under contracts/asyncapi/ must declare key 'asyncapi'.
# ---------------------------------------------------------------------------
def validate_asyncapi() -> int:
    if not ASYNCAPI_DIR.is_dir():
        raise ContractValidationError(f"Missing AsyncAPI directory: {ASYNCAPI_DIR}")
    count = 0
    files = sorted(ASYNCAPI_DIR.glob("*.yaml")) + sorted(ASYNCAPI_DIR.glob("*.yml"))
    for path in files:
        with path.open("r", encoding="utf-8") as fh:
            doc = yaml.safe_load(fh)
        if not isinstance(doc, dict) or "asyncapi" not in doc:
            raise ContractValidationError(f"{path} is missing the 'asyncapi' key")
        count += 1
    if count == 0:
        raise ContractValidationError("No AsyncAPI documents found")
    return count


# ---------------------------------------------------------------------------
# Protobuf: each .proto must have balanced braces and >= 1 message.
# ---------------------------------------------------------------------------
def validate_protobuf() -> int:
    if not PROTOBUF_DIR.is_dir():
        raise ContractValidationError(f"Missing protobuf directory: {PROTOBUF_DIR}")
    count = 0
    for path in sorted(PROTOBUF_DIR.glob("*.proto")):
        text = path.read_text(encoding="utf-8")
        if text.count("{") != text.count("}"):
            raise ContractValidationError(f"{path} has unbalanced braces")
        messages = re.findall(r"\bmessage\s+\w+", text)
        if len(messages) < 1:
            raise ContractValidationError(f"{path} defines no protobuf messages")
        count += 1
    if count == 0:
        raise ContractValidationError("No protobuf files found")
    return count


# ---------------------------------------------------------------------------
# SQL: database/postgres must hold >= 1 .sql file and 0001_platform_schemas.sql
# must define all 12 platform_* schemas.
# ---------------------------------------------------------------------------
def validate_sql() -> int:
    if not POSTGRES_DIR.is_dir():
        raise ContractValidationError(f"Missing database/postgres directory: {POSTGRES_DIR}")
    sql_files = sorted(POSTGRES_DIR.rglob("*.sql"))
    if len(sql_files) < 1:
        raise ContractValidationError("database/postgres contains no .sql files")

    schema_file = POSTGRES_DIR / "schemas" / "0001_platform_schemas.sql"
    if not schema_file.is_file():
        raise ContractValidationError(f"Missing platform schema file: {schema_file}")
    text = schema_file.read_text(encoding="utf-8")
    missing = [s for s in PLATFORM_SCHEMAS if not re.search(rf"\b{re.escape(s)}\b", text)]
    if missing:
        raise ContractValidationError(
            f"0001_platform_schemas.sql does not define schemas: {missing}"
        )
    return len(sql_files)


# ---------------------------------------------------------------------------
# Planes: count per-plane TARGET_RUNTIME.md specifications.
# ---------------------------------------------------------------------------
def count_planes() -> int:
    return len(sorted(REPO_ROOT.glob("*/TARGET_RUNTIME.md")))


def validate_all() -> dict:
    """Run every validator and return a summary dict of counts.

    Raises ContractValidationError on the first failure.
    """
    summary = {
        "json": validate_json_contracts(),
        "openapi": validate_openapi(),
        "asyncapi": validate_asyncapi(),
        "proto": validate_protobuf(),
        "sql": validate_sql(),
        "planes": count_planes(),
    }
    return summary


def main() -> int:
    try:
        summary = validate_all()
    except ContractValidationError as exc:
        print(f"CONTRACT VALIDATION FAILED: {exc}", file=sys.stderr)
        return 1
    print("Contract layer validation: PASS")
    for key, value in summary.items():
        print(f"  {key:10s}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
