#!/usr/bin/env bash
set -euo pipefail
MODEL="${QWEN_HF_MODEL:-Qwen/Qwen3-32B}"
SERVED="${QWEN_MODEL:-qwen32b}"
HOST="${QWEN_HOST:-0.0.0.0}"
PORT="${QWEN_PORT:-8001}"
TP="${QWEN_TENSOR_PARALLEL:-2}"
MAX_LEN="${QWEN_MAX_MODEL_LEN:-32768}"
GPU_UTIL="${QWEN_GPU_MEMORY_UTILIZATION:-0.90}"
exec vllm serve "$MODEL" \
  --host "$HOST" \
  --port "$PORT" \
  --served-model-name "$SERVED" \
  --tensor-parallel-size "$TP" \
  --dtype auto \
  --max-model-len "$MAX_LEN" \
  --gpu-memory-utilization "$GPU_UTIL" \
  --enable-prefix-caching \
  --trust-remote-code
