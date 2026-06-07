# BOOT — how the whole system comes up (clone → running → verified)

This repo is **self-bootstrapping**. A fresh clone, one command, brings up *everything* —
the Llama GPU brain, the JARVIS/Foundry/Gotham/Apollo app, the scrape→embed→enrich
knowledge loops, and the Underworld minion world — and self-tests to 100%. Nothing is
hand-installed; nothing depends on a person being present.

## One command
```bash
git clone https://github.com/samskiezz/jarvis-app.git && cd jarvis-app
GPU_SSH="-p 41154 root@211.72.13.201" bash infra/automate.sh
```
`infra/automate.sh` does, idempotently:
1. **GPU box** (`infra/provision-gpu.sh`) — disables the VRAM-hog SGLang; runs **Ollama**
   under supervisor, throttled, with the 3 models resident on the 4090s:
   `llama3.1:8b` (chat/sim brain), `nomic-embed-text` (GPU embeddings), `minicpm-v` (OCR
   vision); enables Vulkan + NVENC. *(omit `GPU_SSH` if the box is already provisioned.)*
2. **Prep** (`infra/setup.sh`) — Python venv + `requirements.txt`, **npm install** (main
   app + underworld web), OCR engines (Tesseract + pypdf/pymupdf), the **asset catalog**,
   the **design bible**, the underworld **web build**, and a **seeded world**.
3. **Run** — `pm2 start ecosystem.config.cjs` brings up **all four** services and
   `pm2 save` + `pm2 startup` make them **survive reboots**.
4. **Verify** (`infra/verify.sh`) — 18-point health check → prints **% complete**.

## What's running after boot
| Service | Port | What |
|---|---|---|
| `jarvis-backend` | 8001 | Foundry/Gotham/Apollo/AIP + the **JARVIS Iron-Man chat** (`/v1/jarvis/agent/chat`) that controls the system; auto-runs scrape→GPU-embed→LLM-enrich loops |
| `jarvis-frontend` | 5173 | the 86-page APEX app (page-aware Llama assistant on every page) |
| `underworld-backend` | 8091 | Llama-driven minion sim (auto-ticking) + φ/fractal world-map/chunk layout API |
| `underworld-web` | 5180 | the 3D minions world |
| **Ollama** (GPU box) | 41137 | the brain — llama3.1 + nomic + minicpm-v, supervisor-managed |

## The Llama brain (not just Underworld)
Every LLM path points at the one GPU box via env in `ecosystem.config.cjs`:
`OLLAMA_HOST` (JARVIS research/agent), `OLLAMA_EMBED_MODEL` (GPU embeddings),
`KIMI_BASE_URL`+`KIMI_MODEL` (analyst chat, OpenAI-compat), `OCR_VISION_MODEL` (minicpm-v),
and `UNDERWORLD_LLM_*` (the minion sim). One box, all consumers. The box self-restarts
Ollama on reboot (supervisor); the app self-restarts (PM2).

## Verify any time
```bash
bash infra/verify.sh      # 18 checks, prints PASS/FAIL + % complete (exit 0 only at 100%)
```

## Back up the knowledge (state is safe + restorable)
The databases are gitignored (too large/churny for git). Snapshot them:
```bash
bash infra/backup.sh                                  # -> infra/backups/jarvis-knowledge-<ts>.tar.gz
BACKUP_REMOTE=user@host:/backups bash infra/backup.sh # + offsite copy
bash infra/backup.sh restore infra/backups/<file>.tar.gz
```
Put it on a cron for continuous protection:
```bash
echo "0 * * * * cd /opt/jarvis-app-1 && bash infra/backup.sh" | crontab -
```

## Reboot / fresh-container safety
- **App box**: `pm2 resurrect` (after `pm2 startup`) restarts all four services.
- **GPU box**: supervisor restarts Ollama (SGLang stays disabled).
- **Re-run** `bash infra/automate.sh` any time — it heals a partial state, never double-starts.
