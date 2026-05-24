# Jarvis

Personal intelligence terminal — global ontology, live risk, AI analyst over Sam Kazangas's real personal/business universe (PSG, Pangani, Dubai, $100M target).

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Browser (Vite/React SPA)                                │
│    src/pages/JarvisTerminal.jsx — workspace shell         │
│    src/panels/registry.js      — panel manifest           │
│    src/domain/*                — ontology + risk + colors │
│    src/components/Globe3D etc. — visualisations           │
└──────────────────────────────────────────────────────────┘
                        │ HTTPS (Bearer)
                        ▼
┌──────────────────────────────────────────────────────────┐
│  FastAPI backend (server/)                                │
│    /auth/me              — real bearer check              │
│    /functions/getLiveIntel — USGS + CoinGecko aggregator  │
│    /functions/analystChat  — Kimi K2 streaming SSE        │
│    /functions/*            — pipeline stubs (Phase C)     │
│    /entities/{Name}        — generic CRUD (seeded)        │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
            USGS · CoinGecko · Moonshot Kimi K2
```

## Quick start

```bash
# 1. Backend
pip install -r server/requirements.txt
JARVIS_API_KEY=dev-key \
KIMI_API_KEY=<your_moonshot_key> \  # optional — analyst falls back to a diagnostic if unset
python -m uvicorn server.main:app --reload

# 2. Frontend (in a second shell)
cp .env.example .env.local            # then edit if you want
npm install
npm run dev
```

Open http://localhost:5173, enter `dev-key` when prompted.

## Environment

| Variable | Where | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | frontend `.env.local` | Backend URL. Defaults to `http://localhost:8000`. |
| `VITE_API_KEY` | frontend `.env.local` | Sent as `Authorization: Bearer …`. Must match `JARVIS_API_KEY`. |
| `JARVIS_API_KEY` | backend env | Validated by `/auth/me`. |
| `KIMI_API_KEY` | backend env | Moonshot Kimi K2 key. Without this the analyst returns an ontology-summary diagnostic instead of an LLM response. |
| `KIMI_MODEL` | backend env | Default `kimi-k2-0905-preview`. |
| `JARVIS_CORS_ORIGINS` | backend env | Comma-separated allowed origins. |

URL overrides: `?api_key=…`, `?api_base_url=…`, `?clear_api_key=true` (all persisted to localStorage).

## Verify

```bash
npm run lint        # eslint
npm run typecheck   # tsc
npm run test        # vitest — domain modules + panel registry
npm run build       # production bundle
JARVIS_API_KEY=test-key python -m pytest server/tests -q   # backend contract tests
```
