# JARVIS / Alfred — Voice + Persona Settings Reference

Every knob for the voice + personality, what it does, and the research-backed value we run.
Sources for the recommendations: Coqui XTTS source + docs, HF model card, SillyTavern/Baseten
streaming guides (full research in `.proof_jarvis_research.md`).

---

## 1. The voice (XTTS-v2 clone) — `server/services/voice_clone_gpu.py`

Runs on the GPU box (`:8096`), reached over the SSH tunnel. Clones the owner's real voice from the
reference clips. The CPU service (`voice_clone_service.py`, `:8097`) is the automatic fallback.

### Inference tuning — all env-overridable (set in `/root/tts_keep.sh` on the box, or `.env`)

| Env var | Default | What it does | Tune toward… |
|---|---|---|---|
| `XTTS_TEMP` | `0.70` | Sampling temperature. The #1 naturalness knob. | ↓ steadier/flatter (0.6), ↑ more expressive but wobbly/robotic (0.8+) |
| `XTTS_REP_PENALTY` | `5.0` | Penalizes repeats → stops stutter/drone. Method default 10 can clip/rush. | 2–5 natural; raise if you hear stutters |
| `XTTS_TOP_P` | `0.85` | Nucleus sampling. | ↓ 0.8 = more consistent |
| `XTTS_TOP_K` | `50` | Top-k cutoff. | leave at 50 |
| `XTTS_SPEED` | `0.92` | Delivery speed. <1.0 = slower, older, weightier. | 0.88–0.95 older; far from 1.0 = artifacts |
| `XTTS_STREAM_CHUNK` | `40` | Streamed-audio chunk size (GPT tokens). | ↑ smoother but later first-audio (20 was choppy) |
| `XTTS_GPT_COND_LEN` | `24` | Seconds of reference used for prosody. | more = steadier voice |
| `XTTS_CACHE_VER` | `v2-alfred-low` | Salt in the disk-cache key. **Bump to force re-render after any change.** | — |
| `XTTS_LANG` | `en` | Language. | — |

Also on by default in code: `enable_text_splitting=True` (stable long text), `sound_norm_refs=True`
(loudness-normalize refs), `max_ref_length=30`. Output is 24 kHz mono; clips cross the tunnel as 64k MP3.

### Text cleaning before synth (`_clean_for_tts`)
Strips markdown/emoji/code/URLs, turns `…`/`...`→`.`, `—`/`–`→`,`, removes bullets, and ensures every
line ends in punctuation (unterminated text makes XTTS hallucinate). This kills a big source of "robotic".

### Reference clips (the timbre) — `scripts/build_voice_refs.sh`
Built from the owner's 14.6-min master (`server/voices/raw_user/master_recording.input`) into
6 clean ~12s clips: light denoise → high-pass → EBU-R128 loudness-normalize → **formant-preserving
pitch shift** → 22 050 Hz mono. The pitch shift is what makes him **lower/older**, baked into the refs so
it's identical on the streaming AND full paths (no runtime cost, no artifacts).

**Re-tune the age/pitch with ONE command** (then redeploy — see §3):
```bash
SEMITONES=-3 scripts/build_voice_refs.sh    # default — mature, lower (measured ~134 Hz F0)
SEMITONES=-5 scripts/build_voice_refs.sh    # deeper / older still
SEMITONES=-2 scripts/build_voice_refs.sh    # a touch higher / younger
SEMITONES=0  scripts/build_voice_refs.sh    # the owner's natural pitch
```
Owner's natural F0 ≈ 159 Hz; −3 ST → ≈134 Hz. Beyond −5/−6 ST starts to sound unnatural/muddy.

---

## 2. The personality (Alfred) — `server/jarvis_persona.md`

This markdown file **is** the system prompt — loaded verbatim, hot-reloaded on save (no restart needed).
Edit it to change how he talks. He's a refined English butler: calm, dry-witted, addresses the owner as
"sir"/"Master Kazangas", business/solar focus, never breaks character, no markdown/emoji in speech.

Instant on-box fallbacks (used when the brain is briefly unreachable) live in `_local_reply()` in
`dashboard.py` and are also in Alfred's voice, varied so they never loop.

**Address:** owner = Sam Kazangas = "sir". Defaults are now `"sir"` everywhere; the UI sends a detected
gender only when it hears a clearly female voice (→ "madam").

---

## 3. The LLM brain (text Alfred speaks) — `.env` tier ladder

| Env var | Value | Role |
|---|---|---|
| `OLLAMA_STRONG_MODEL` | `qwen2.5:14b` | Everyday chat (≈1–2s, stays warm on GPU0) |
| `OLLAMA_BASE_MODEL` | `llama3.1:8b` | Lighter tasks |
| `HEAVY_MODEL` / `LLM_ENABLE_70B` | `llama3.3:70b` / `1` | Deep reasoning, bursts to a temp box |
| `JARVIS_DASHBOARD_CHAT_TIMEOUT_S` | `20` | Chat hard timeout |

Kimi (Moonshot) + Claude (sonnet-4-6) are wired via `.env.secrets` for the self-improvement loop /
OpenClaw. See `MEMORY.md` → multi-llm-openclaw-feedback.

---

## 4. Deploy a voice change to the box

After editing refs or `voice_clone_gpu.py`:
```bash
set -a; . ./.env; set +a
KEY="${VAST_SSH_KEY:-$HOME/.ssh/id_ed25519}"
SSHO="-o BatchMode=yes -o StrictHostKeyChecking=no"
# push refs + code
ssh $SSHO -i "$KEY" -p "$VAST_SSH_PORT" "$VAST_SSH_USER@$VAST_SSH_HOST" 'rm -f /root/voices/ref/user_0*.wav'
scp $SSHO -i "$KEY" -P "$VAST_SSH_PORT" server/voices/ref/user_0*.wav        "$VAST_SSH_USER@$VAST_SSH_HOST:/root/voices/ref/"
scp $SSHO -i "$KEY" -P "$VAST_SSH_PORT" server/services/voice_clone_gpu.py   "$VAST_SSH_USER@$VAST_SSH_HOST:/root/voice_clone_gpu.py"
# clear stale cache + restart (keeper respawns)
ssh $SSHO -i "$KEY" -p "$VAST_SSH_PORT" "$VAST_SSH_USER@$VAST_SSH_HOST" 'rm -rf /root/voices/clone_cache/*; pkill -f voice_clone_gpu.py'
```
The keeper (`/root/tts_keep.sh`) restarts it within ~4s; model reload is ~10–30s. Health:
`curl http://127.0.0.1:8096/health`. Then on the VPS: `pm2 restart jarvis-dashboard`.

---

## 5. Live UI cache-bust
`server/jarvis_live.html` top: `var KEY='__jv',VER='22'` — **bump VER** on any UI change so phones/PWAs
drop the old cached page (a service-worker-killer + cache clear runs on load).
