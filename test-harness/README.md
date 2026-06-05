# Contract Validation Harness

`contract_validate.py` is a standalone, runnable validator for the platform's
machine-readable **contract layer**. It is the source of truth that every plane
(`*/TARGET_RUNTIME.md`) is built against, so breaking a contract should break
the build.

## What it validates

| Area      | Check |
|-----------|-------|
| `json`    | Every file under `contracts/json-schema/`, `contracts/policy/`, and `contracts/events/` parses as valid JSON. The `event-envelope.schema.json` `required` fields must all be defined in `properties`. |
| `openapi` | Every YAML under `contracts/openapi/` declares the `openapi` key. |
| `asyncapi`| Every YAML under `contracts/asyncapi/` declares the `asyncapi` key. |
| `proto`   | Every `.proto` under `contracts/protobuf/` has balanced braces and at least one `message`. |
| `sql`     | `database/postgres/` has at least one `.sql` file and `schemas/0001_platform_schemas.sql` defines all 12 `platform_*` schemas. |
| `planes`  | Counts the per-plane `*/TARGET_RUNTIME.md` specifications. |

`validate_all()` returns a summary dict of counts:
`{json, openapi, asyncapi, proto, sql, planes}`.

## Dependencies

Standard library plus `pyyaml` (already installed). No network access and no
additional pip installs are required.

## Running directly

```bash
python test-harness/contract_validate.py
```

It prints the summary and exits non-zero on the first validation failure. The
repo root is resolved robustly from `__file__` (repo root = parent of
`test-harness/`), so it runs identically from any working directory.

## Pytest wiring

The harness is wired into the existing pytest suite via
`server/tests/test_contracts.py`, which loads `contract_validate.py` by absolute
path using `importlib.util.spec_from_file_location` (the `test-harness` directory
name contains a hyphen and is therefore not importable as a normal package).

```bash
cd server && python -m pytest tests/test_contracts.py -q
```
