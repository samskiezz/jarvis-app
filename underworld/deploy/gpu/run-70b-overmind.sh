#!/usr/bin/env bash
# run-70b-overmind.sh — run llama3.3:70b (the Overmind / God-Brain layers) SPREAD across the
# two RTX 4090s on the Vast box, throttled to coexist with the 8B/3B minion models.
#
# The 2x4090 = 48 GB VRAM total, which DOES fit a 70B Q4 (~43 GB) when Ollama spreads the
# layers across both cards. The only blocker is DISK: the model file is ~43 GB and the box
# has ~27 GB free — so EXPAND the Vast disk to >=100 GB first (or pull a smaller quant below).
#
# Run on the Vast box (ssh -p 41154 root@211.72.13.201), then re-point the app's UW_MODEL_*.
set -euo pipefail

MODEL="${UW_70B_MODEL:-llama3.3:70b}"          # Q4_K_M ~43GB; see SMALLER QUANTS note
# ── throttle / multi-GPU settings (exported into the Ollama server environment) ──────
export CUDA_VISIBLE_DEVICES=0,1                 # use both 4090s
export OLLAMA_SCHED_SPREAD=1                    # SPREAD one model's layers across all GPUs
export OLLAMA_MAX_LOADED_MODELS=2              # 70B + one small model resident; others evict
export OLLAMA_NUM_PARALLEL=1                    # 1 concurrent request to the 70B (VRAM throttle)
export OLLAMA_KV_CACHE_TYPE=q8_0               # quantise KV cache -> big VRAM saving
export OLLAMA_FLASH_ATTENTION=1                 # cheaper attention memory
export OLLAMA_KEEP_ALIVE=30m                    # keep it warm but evictable
export OLLAMA_GPU_OVERHEAD=536870912           # 512MB headroom/GPU so we don't OOM
export OLLAMA_HOST=0.0.0.0:11434

free_gb() { df -BG --output=avail / | tail -1 | tr -dc 0-9; }
echo "== Overmind 70B launcher =="
echo "disk free: $(free_gb) GB   (need ~50 GB for $MODEL Q4)"
nvidia-smi --query-gpu=index,memory.total,memory.free --format=csv,noheader

if [ "$(free_gb)" -lt 48 ]; then
  cat <<'EOF'
WARNING: <48 GB free disk. The 70B Q4 (~43 GB) will not download.
Options:
  1) Expand the Vast volume to >=100 GB (recommended), then re-run.
  2) Use a smaller quant that fits (lower quality):
       UW_70B_MODEL=llama3.3:70b-instruct-q3_K_M   (~35 GB)
       UW_70B_MODEL=llama3.3:70b-instruct-q2_K      (~26 GB, fits ~27 GB but degraded)
  3) Keep the qwen2.5:32b fallback (already pulled, ~20 GB) for L1/L5 — capable + safe.
EOF
fi

echo "== (re)starting Ollama with spread+throttle env =="
pkill -f 'ollama serve' 2>/dev/null || true; sleep 2
nohup ollama serve > /var/log/ollama-70b.log 2>&1 &
sleep 4

echo "== pulling $MODEL (resumable; large) =="
ollama pull "$MODEL"

echo "== loading $MODEL across both GPUs (low context to throttle VRAM) =="
# small num_ctx keeps the KV cache tiny so 70B+small models coexist on 48GB
ollama run "$MODEL" --keepalive 30m "Say only: Overmind online." \
  2>/dev/null || true
echo "== VRAM after load (should show layers on BOTH GPUs) =="
nvidia-smi --query-gpu=index,memory.used,memory.free --format=csv,noheader

cat <<EOF

== DONE. Point the app at the real 70B:
   export UW_MODEL_OVERMIND=$MODEL
   export UW_MODEL_GODBRAIN=$MODEL
   (set these in ecosystem.config.cjs env for the underworld backend, then pm2 restart)
The 8B (high/normal minions) and 3B (chatter) layers already run on this same Ollama.
EOF
