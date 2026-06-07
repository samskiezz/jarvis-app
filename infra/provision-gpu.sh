#!/usr/bin/env bash
# infra/provision-gpu.sh — bring the vast.ai GPU box to the exact state this session
# set up, idempotently, with NO human: disable the VRAM-hogging SGLang, run Ollama
# under supervisor with the throttle env, pull the 3 models, enable Vulkan + NVENC.
# Run ON the GPU box (or via: ssh <box> 'bash -s' < infra/provision-gpu.sh).
set -uo pipefail
say() { printf "\n\033[1;35m[gpu] %s\033[0m\n" "$*"; }

say "1/5 Free the VRAM: disable SGLang autostart, stop it"
sed -i 's/^autostart=.*/autostart=false/' /etc/supervisor/conf.d/sglang.conf 2>/dev/null || true
supervisorctl stop sglang >/dev/null 2>&1 || true

say "2/5 Ollama under supervisor, throttled (models resident on-GPU)"
cat > /opt/supervisor-scripts/ollama.sh <<'SH'
#!/bin/bash
export OLLAMA_HOST=0.0.0.0:8080
export OLLAMA_KEEP_ALIVE=-1
export OLLAMA_MAX_LOADED_MODELS=3
export OLLAMA_NUM_PARALLEL=4
export OLLAMA_CONTEXT_LENGTH=8192
export OLLAMA_FLASH_ATTENTION=1
export OLLAMA_SCHED_SPREAD=1
export OMP_NUM_THREADS=16
exec /usr/local/bin/ollama serve
SH
chmod +x /opt/supervisor-scripts/ollama.sh
cat > /etc/supervisor/conf.d/ollama.conf <<'CONF'
[program:ollama]
command=/opt/supervisor-scripts/ollama.sh
autostart=true
autorestart=true
startsecs=5
stdout_logfile=/var/log/portal/ollama.log
redirect_stderr=true
priority=50
CONF
supervisorctl reread >/dev/null 2>&1 || true
supervisorctl update >/dev/null 2>&1 || true
for i in $(seq 1 30); do curl -sf -m3 http://127.0.0.1:8080/api/version >/dev/null 2>&1 && break; sleep 1; done

say "3/5 Pull the 3 models (chat / embed / OCR-vision)"
export OLLAMA_HOST=127.0.0.1:8080
for m in llama3.1:8b nomic-embed-text minicpm-v; do
  ollama list 2>/dev/null | grep -q "${m%%:*}" || ollama pull "$m" 2>&1 | tail -1
done

say "4/5 Vulkan ICD + NVENC libs (for any future UE5/Omniverse render)"
DEBIAN_FRONTEND=noninteractive apt-get install -y -q vulkan-tools ffmpeg >/dev/null 2>&1 || true
NVVER="$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1 | tr -d ' ')"
mkdir -p /usr/share/vulkan/icd.d
[ -f /usr/share/vulkan/icd.d/nvidia_icd.json ] || cat > /usr/share/vulkan/icd.d/nvidia_icd.json <<JSON
{ "file_format_version": "1.0.0",
  "ICD": { "library_path": "libGLX_nvidia.so.0", "api_version": "1.3.${NVVER%%.*}" } }
JSON

say "5/5 Warm the models onto the GPU"
curl -sf -m60 http://127.0.0.1:8080/api/embed -d '{"model":"nomic-embed-text","input":"warm"}' >/dev/null 2>&1 || true
curl -sf -m90 http://127.0.0.1:8080/api/chat -d '{"model":"llama3.1:8b","stream":false,"messages":[{"role":"user","content":"hi"}]}' >/dev/null 2>&1 || true
echo "GPU box ready:"; ollama ps 2>/dev/null || true
