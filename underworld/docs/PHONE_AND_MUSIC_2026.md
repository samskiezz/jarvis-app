# Phone + Awakening Music — 2026 Provider Plug-In Guide

Cluster C7 ships two integration scaffolds. Code is live; only credentials (or
audio files) activate them.

## 1. Phone dialer (gap #24)

Backend auto-selects: **Twilio → Telnyx → Asterisk PJSIP → dry-run**.

| Provider | Voice (US out) | SMS | Setup | When to pick |
|---|---|---|---|---|
| Twilio | ~$0.014/min | ~$0.0083/msg | `TWILIO_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Best docs + ecosystem; OpenAI Realtime path |
| Telnyx | ~$0.007/min (SIP ~$0.005) | ~$0.004/msg | `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER`, optional `TELNYX_CONNECTION_ID` | 30–70% cheaper than Twilio; p95 latency 118ms vs 161ms |
| Asterisk PJSIP | free + trunk cost | trunk-dependent | `ASTERISK_ARI_URL`, `ASTERISK_ARI_USER`, `ASTERISK_ARI_PASS`, `ASTERISK_ENDPOINT` | Fully self-hosted; you supply the SIP trunk |

### Activate Twilio (recommended start)
1. Sign up at <https://twilio.com> ($15 trial credit).
2. Buy a US local number (~$1.15/mo).
3. From Account info copy SID + auth token.
4. Export the three env vars above and restart the API server.

### Verify
```
curl -s http://localhost:8000/v1/phone/status | jq
curl -s -X POST http://localhost:8000/v1/phone/sms \
     -H 'content-type: application/json' \
     -d '{"number":"+15555550100","text":"JARVIS test"}'
```

### Endpoints
- `POST /v1/phone/dial`  body `{number, message?}`
- `POST /v1/phone/sms`   body `{number, text}`
- `GET  /v1/phone/status`

Sources:
- <https://www.twilio.com/en-us/pricing>
- <https://telnyx.com/pricing/voice-api>
- <https://callsphere.ai/blog/vw1d-telnyx-vs-twilio-ai-voice-2026>
- <https://docs.asterisk.org/Configuration/Channel-Drivers/SIP/Configuring-res_pjsip/PJSIP-Configuration-Sections-and-Relationships/>

## 2. Awakening music bank (gap #50)

Backend auto-selects: **Suno → Stable Audio → MusicGen local → pre-baked bank**.

| Provider | Cost | Setup | When to pick |
|---|---|---|---|
| Suno (third-party reseller) | $0.014–$0.111/song | `SUNO_API_KEY`, `SUNO_API_BASE` (default sunoapi.org) | Best song-grade output; no official API yet |
| Suno Pro (direct) | $10/mo (2,500 credits) | n/a — UI only; resellers wrap it | Personal use, manual export |
| Stable Audio (Stability AI) | $0.0206/generation, up to 6 min | `STABILITY_API_KEY` | Best for ambient/atmospheric loops |
| MusicGen (audiocraft, self-host) | free | `pip install audiocraft torch`; needs 16 GB+ GPU for `medium` | Owner's Vast GPU box |
| Bank fallback | free | drop mp3/ogg/wav into `server/data/music_bank/` | Guarantees Awakening always has audio |

### Endpoints
- `POST /v1/music/generate` body `{prompt, duration_s?, tags?}`
- `GET  /v1/music/status`
- `GET  /v1/music/bank`

### Activate Stable Audio (best ambient)
```
export STABILITY_API_KEY=sk-...
curl -s -X POST http://localhost:8000/v1/music/generate \
     -H 'content-type: application/json' \
     -d '{"prompt":"warm ambient drone, soft synth pads, 70 bpm","duration_s":30,"tags":["awakening"]}'
```

### Activate Suno
```
export SUNO_API_KEY=...
export SUNO_API_BASE=https://api.sunoapi.org   # or evolink/apiframe
```

### Run MusicGen on the Vast box
```
pip install -U audiocraft torch torchaudio
export MUSICGEN_MODEL=facebook/musicgen-medium
```

### Drop pre-baked loops (zero-cost path)
```
cp ambient_*.mp3 /opt/jarvis-app-1/server/data/music_bank/
```
Generated audio is written to `server/data/music_generated/` with an
`index.jsonl` log; URLs are served under `/jarvis/data/...`.

Sources:
- <https://suno.com/pricing>
- <https://sunor.cc/blog/suno-api-pricing-2026>
- <https://platform.stability.ai/pricing>
- <https://github.com/facebookresearch/audiocraft>
- <https://facebookresearch.github.io/audiocraft/docs/MUSICGEN.html>

## Cost summary (typical month, owner-scale use)

| Use | Provider | Est. monthly |
|---|---|---|
| ~50 outbound calls (3 min avg) | Twilio | $2.10 + number $1.15 ≈ $3.25 |
| ~50 outbound calls (3 min avg) | Telnyx | $1.05 + number $1.00 ≈ $2.05 |
| ~30 ambient awakening loops | Stable Audio | ~$0.62 |
| ~30 ambient awakening loops | Suno reseller | $0.42–$3.33 |
| MusicGen / Asterisk | self-hosted | $0 (electricity) |
