#!/usr/bin/env bash
# gpu-voice-link.sh — run the JARVIS voice clone (XTTS-v2) ON the Vast GPU box and link it to the VPS.
#
# Why: CPU XTTS takes ~14s for a novel phrase, so her real voice "glitched" to the female web fallback
# while it synthesised. On the GPU it's ~1.4s. This script (idempotent, safe to re-run any time):
#   1. SSHes to the box (VAST_SSH_* from .env)
#   2. ensures a python venv with a Blackwell-capable torch (cu128) + coqui-tts 0.27.5 + transformers 4.57.1
#   3. rsyncs the reference voice clips (server/voices/ref/*.wav) to the box
#   4. runs voice_clone_gpu.py on GPU 3 (Ollama is pinned to GPUs 0-2 so the voice always has a free GPU),
#      under a respawn keeper, serving 0.0.0.0:8096
#   5. holds a self-healing SSH tunnel so the box's :8096 is always at 127.0.0.1:8096 on the VPS
#      (the dashboard's XTTS_GPU_URL default). Port-map independent, like the Ollama link.
#
# The dashboard tries GPU(8096) -> local CPU(8097) -> Piper, so if the box/tunnel is down the voice still
# works (just slower) and never silently breaks.
set -uo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; . ./.env; set +a; }
U="${VAST_SSH_USER:-root}"; H="${VAST_SSH_HOST:-}"; P="${VAST_SSH_PORT:-}"
TPORT="${XTTS_GPU_PORT:-8096}"; GPU="${XTTS_GPU_INDEX:-3}"
KEY="${VAST_SSH_KEY:-$HOME/.ssh/id_ed25519}"
SSHO="-o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10"
say(){ printf '\033[35m[gpu-voice]\033[0m %s\n' "$*"; }
[ -z "$H" ] || [ -z "$P" ] && { say "VAST_SSH_HOST/PORT not set in .env — skipping."; exit 0; }

# already linked?
if curl -s -m3 http://127.0.0.1:$TPORT/health 2>/dev/null | grep -q '"ready": *true'; then
  say "voice clone already reachable at 127.0.0.1:$TPORT ✓"; exit 0
fi
ssh $SSHO -i "$KEY" -p "$P" "$U@$H" true 2>/dev/null || { say "SSH to box not ready (run scripts/gpu-link.sh first)."; exit 0; }

# 1) rsync the active reference voice to the box
ssh $SSHO -i "$KEY" -p "$P" "$U@$H" 'mkdir -p /root/voices/ref' 2>/dev/null
scp $SSHO -i "$KEY" -P "$P" server/voices/ref/*.wav "$U@$H:/root/voices/ref/" >/dev/null 2>&1 || true

# 2) ensure the venv + deps on the box (idempotent — the import check skips the multi-GB install if present)
ssh $SSHO -i "$KEY" -p "$P" "$U@$H" 'bash -s' <<'REMOTE' 2>/dev/null || true
export HOME=/root COQUI_TOS_AGREED=1 TTS_HOME=/root/tts_cache
# ffmpeg: encodes the cloned WAV -> MP3 on-box so the clip crosses a slow VPS tunnel ~6x faster.
command -v ffmpeg >/dev/null 2>&1 || { apt-get update -qq; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg >/dev/null 2>&1; }
if ! /root/tts-venv/bin/python -c "import torch,TTS" 2>/dev/null; then
  # Minimal images (e.g. ollama/ollama) ship python3 but no pip/venv — install them first.
  python3 -c "import ensurepip" 2>/dev/null || { apt-get update -qq; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-venv python3-pip >/dev/null 2>&1; }
  python3 -m venv /root/tts-venv
  . /root/tts-venv/bin/activate
  pip install -q --upgrade pip
  pip install -q torch==2.7.0 torchaudio==2.7.0 --index-url https://download.pytorch.org/whl/cu128
  # cu128 wheels run fine on newer drivers (e.g. CUDA 13.x) via backward-compat. Pin numpy<2.3 +
  # install scipy explicitly — coqui-tts needs them and a partial dep-resolve left numpy missing once.
  pip install -q coqui-tts==0.27.5 "transformers==4.57.1" "numpy<2.3" scipy
fi
REMOTE

# 3) (re)launch the GPU voice service under a respawn keeper, pinned to GPU $GPU
ssh $SSHO -i "$KEY" -p "$P" "$U@$H" "GPU=$GPU TPORT=$TPORT bash -s" <<'REMOTE' 2>/dev/null || true
cat > /root/tts_keep.sh <<EOF
#!/usr/bin/env bash
export HOME=/root COQUI_TOS_AGREED=1 TTS_HOME=/root/tts_cache
export XTTS_REF_DIR=/root/voices/ref XTTS_CACHE_DIR=/root/voices/clone_cache XTTS_HOST=0.0.0.0 XTTS_PORT=$TPORT
export CUDA_VISIBLE_DEVICES=$GPU PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
while true; do /root/tts-venv/bin/python /root/voice_clone_gpu.py >/tmp/voiceclone_gpu.log 2>&1; sleep 4; done
EOF
chmod +x /root/tts_keep.sh
pgrep -f voice_clone_gpu >/dev/null 2>&1 || (setsid bash /root/tts_keep.sh >/tmp/tts_keep_boot.log 2>&1 </dev/null &)
REMOTE
# copy the service code up (in case it changed)
scp $SSHO -i "$KEY" -P "$P" server/services/voice_clone_gpu.py "$U@$H:/root/voice_clone_gpu.py" >/dev/null 2>&1 || true

# 4) self-healing tunnel  box:$TPORT -> 127.0.0.1:$TPORT
if ! pgrep -f "L *$TPORT:localhost:$TPORT" >/dev/null 2>&1; then
  nohup bash -c "while true; do ssh -N -C $SSHO -i '$KEY' -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes -o TCPKeepAlive=yes \
    -p $P -L $TPORT:localhost:$TPORT $U@$H; sleep 3; done" >/tmp/tts-tunnel.log 2>&1 &
  say "voice tunnel keepalive started ✓"
  sleep 3
fi
curl -s -m4 http://127.0.0.1:$TPORT/health 2>/dev/null | grep -q '"ready": *true' \
  && say "LINKED ✓ — GPU voice at 127.0.0.1:$TPORT (her real voice, ~1.4s/line)." \
  || say "tunnel up; voice model still loading on the box (first run downloads XTTS ~2GB)."
