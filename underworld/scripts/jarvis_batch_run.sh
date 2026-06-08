#!/usr/bin/env bash
# Persistent JARVIS GLB loader. Runs under pm2 so it survives session-close + reboot.
# Each cycle: (1) generate any MISSING preview images (gpt-image-1, medium, cheap, skips
# existing), (2) convert ready previews -> GLBs (Tripo, budget-guarded, skips existing).
# Loops until a full cycle makes NO new progress (converged: stragglers safety-blocked or
# budget floor reached), then idles and re-checks every 30 min. Fully resumable.
set -uo pipefail
cd /opt/jarvis-app-1
set -a; . ./.openai_env 2>/dev/null; . ./.tripo_env 2>/dev/null; set +a
SPECS=underworld/data/master/jarvis_gen_specs_full.jsonl
PY=/opt/jarvis-app-1/.venv/bin/python
TARGET=$(grep -c . "$SPECS" 2>/dev/null || echo 558)
log(){ echo "[$(date '+%F %H:%M:%S')] $*"; }

log "JARVIS GLB loader online — target $TARGET assets"
prev=-1
while true; do
  imgs=$(ls -1 jarvis_assets/*.preview.png 2>/dev/null | wc -l)
  glbs=$(ls -1 jarvis_assets/*.glb 2>/dev/null | wc -l)
  total=$((imgs + glbs))
  log "progress: images ${imgs}/${TARGET}  GLBs ${glbs}/${imgs}"

  if [ "$glbs" -ge "$imgs" ] && [ "$total" -eq "$prev" ]; then
    log "converged (${glbs} GLBs, ${imgs} images) — idling 30m then re-checking (credits/limits may change)"
    prev=-1
    sleep 1800
    continue
  fi
  prev=$total

  log "step 1/2: generating missing images (medium)…"
  JARVIS_IMAGE_MODEL=gpt-image-1 JARVIS_IMAGE_QUALITY=medium \
    "$PY" underworld/scripts/jarvis_generate.py --images --specs "$SPECS" --concurrency 6 || true

  log "step 2/2: converting ready previews -> GLBs (budget floor 120)…"
  JARVIS_CREDIT_FLOOR=120 JARVIS_CONC=6 \
    "$PY" underworld/scripts/jarvis_convert_budget.py || true

  sleep 10
done
