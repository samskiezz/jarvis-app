#!/usr/bin/env bash
# infra/automate.sh — THE one command. A fresh container (or a reboot) runs this and
# everything this session built comes up with NO human in the loop, then self-tests:
#
#   1. provision the GPU box (Ollama 3 models + Vulkan/NVENC) — if reachable
#   2. one-time prep (deps, OCR, asset catalog, design bible, underworld web build,
#      seed a world)
#   3. start ALL services under PM2 (jarvis backend+frontend, underworld backend+web)
#      and persist them across reboots (pm2 save + pm2 startup)
#   4. verify — print PASS/FAIL per component + overall % complete
#
# Idempotent: re-running heals a partial bring-up. Knobs: GPU_SSH (e.g.
# "-p 41154 root@211.72.13.201") to auto-provision the GPU box over SSH; NO_GPU=1 skip.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
say() { printf "\n\033[1;33m══ %s ══\033[0m\n" "$*"; }

say "STEP 1 — GPU box (Ollama + Vulkan/NVENC)"
if [ -n "${NO_GPU:-}" ]; then
  echo "  NO_GPU set — skipping."
elif [ -n "${GPU_SSH:-}" ]; then
  ssh -o BatchMode=yes -o ConnectTimeout=20 ${GPU_SSH} 'bash -s' < "$ROOT/infra/provision-gpu.sh" 2>&1 | sed 's/^/  /' || echo "  GPU provision skipped (ssh failed)"
else
  echo "  GPU_SSH not set — assuming the box is already provisioned (Ollama @ ${OLLAMA_HOST:-211.72.13.201:41137})."
fi

say "STEP 2 — one-time prep (deps, OCR, catalog, design bible, web build, seed)"
bash "$ROOT/infra/setup.sh" 2>&1 | sed 's/^/  /'

say "STEP 3 — start ALL services under PM2 + persist"
command -v pm2 >/dev/null 2>&1 || npm install -g pm2 >/dev/null 2>&1 || true
pm2 start "$ROOT/ecosystem.config.cjs" >/dev/null 2>&1 || pm2 restart "$ROOT/ecosystem.config.cjs" >/dev/null 2>&1
pm2 save >/dev/null 2>&1
pm2 startup >/dev/null 2>&1 || true   # generate the boot hook (so a reboot restarts everything)
pm2 list 2>/dev/null | grep -E 'jarvis|underworld' | sed -E 's/│/ /g' | awk '{print "  "$2" -> "$10}' || true

say "STEP 4 — verify (self-test to 100%)"
sleep 6
bash "$ROOT/infra/verify.sh"
