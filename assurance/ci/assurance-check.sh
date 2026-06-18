#!/usr/bin/env bash
# Run the full assurance gate locally / in non-GitHub CI.
#
#   bash assurance/ci/assurance-check.sh
#
# Exits non-zero on any failure.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

PY="${PYTHON:-.venv/bin/python}"
if [[ ! -x "$PY" ]]; then PY="$(command -v python3)"; fi

echo "=== pytest tests/test_assurance/ ==="
"$PY" -m pytest tests/test_assurance/ -q

echo "=== assurance.invariants.runner --once --fail-on-violation ==="
"$PY" -m assurance.invariants.runner --once --fail-on-violation

echo "=== assurance.fuzz.api_fuzzer --smoke ==="
"$PY" -m assurance.fuzz.api_fuzzer --seed 42 --iter 200

echo "=== assurance.fuzz.invariant_fuzz --walks 500 ==="
"$PY" -m assurance.fuzz.invariant_fuzz --walks 500

echo "=== UI theme lock ==="
"$PY" scripts/check_ui_theme_lock.py

echo "=== server.main import check ==="
"$PY" -c "import server.main; print('server.main OK')"

echo "OK — all assurance gates green."
