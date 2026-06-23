#!/usr/bin/env bash
# WC2026 daily continuous-learning wrapper.
# Exports single-threaded BLAS env vars, then runs the full update.
# Intended for cron: scripts/wc2026_cron.txt line 14.
set -euo pipefail
cd /opt/jarvis-app-1
export OMP_NUM_THREADS=1
export OPENBLAS_NUM_THREADS=1
export MKL_NUM_THREADS=1
export NUMEXPR_NUM_THREADS=1
exec /opt/jarvis-app-1/.venv/bin/python /opt/jarvis-app-1/scripts/update_model_daily.py \
    --mode full-update --strategy balanced "$@"
