# Overnight build — what ran while you slept (2026-06-08 → 09)

Open the control panel anytime: **https://app.projectsolar.cloud/jarvis/**
Every task below has a labeled **ON/OFF toggle** there (secured: token + your-own-daemons only).

## The 10 daemons now running (pm2, all saved → survive reboot)
| Task | What it does | Cadence |
|---|---|---|
| 🌍 jarvis-orchestrator (`live_data.py`) | **Live measurements** — weather/air (100 cities) + crypto + earthquakes | weather/air every 30m, crypto/quakes every 5m |
| 📰 jarvis-ingestor (`live_docs.py`) | **Documents** — fresh arXiv papers → Document objects linked to topics | every 30m (+~430/cycle) |
| ⚙ jarvis-worker | **Knowledge growth** — autobuild (scrape→GPU-embed→enrich) + doc-backlog enrich | autobuild 15m, enrich 30s |
| 🧠 jarvis-batch-loader | Topic enrichment (7,000 topics — build complete, now maintains) | continuous |
| 🔗 jarvis-correlator (`correlator.py`) | **Cross-correlation** — resolves duplicate entities, wires SAME_AS links | adaptive (backs off when caught up) |
| 🤖 jarvis-feedback | **Self-learning** — turns errors from every .py into lessons (Llama→Kimi→Claude) | every 60s |
| 🛰 jarvis-backend / 🖥 jarvis-frontend / 🎨 jarvis-glb-loader / 📊 jarvis-dashboard | API, UI, 3D models, this dashboard | — |

## The big fix tonight
The live-data producer was committing **one measurement per DB transaction (~180ms each)** and fetching
cities sequentially → a full cycle took **~1 hour and produced nothing** within any timeout. Rewrote it
**concurrent + batched** → **4,223 measurements in 163s**. Same proven pattern for the document ingestor.

Also: revived `jarvis-worker` (was crashing — the redundant orchestrator/ingest loops threw at boot; disabled
those since `live_data` replaces them, kept autobuild+enrich). Made the correlator back off when idle (was
pinning a CPU core full-scanning for nothing). Made earthquakes dedupe (no fake repeated counts).

## What's growing (verified)
- **Measurements** — +1,793 per 30-min weather sweep, plus crypto every 5 min
- **Documents** — +~430 per 30-min arXiv cycle
- **Cross-correlation** — 187k raw objects resolved to ~34k distinct entities, 152k+ SAME_AS links
- **Self-learning** — 1,063 modules watched

## Honest caveats / what's left
- **Topics & the 7,000-topic notes are DONE** (plateaued = completed, not broken).
- **DB grows** ~80k+ weather time-series measurements/day. Fine short-term; add a retention trim later.
- **Weather is rate-limited** (open-meteo ~10k calls/day) → 30-min sweeps is the sustainable max for 100 cities.
- **Auto-backup**: run `bash scripts/snapshot.sh db` anytime (safe on live). Automating it needs cron, which the
  harness blocked as "persistence" — paste the one-liner from chat to enable it yourself.
- **Git bloat (7.3 GB)**: `CONFIRM=yes bash scripts/trim_git_history.sh` in a calm window (backs up .git first).
- The document ingestor uses arXiv only so far — more reliable feeds (bioRxiv/PubMed) can be added.

## Files added/changed this session
`server/services/`: live_data.py, live_docs.py, correlator.py, feedback_bus.py, feedback_improver.py,
orchestrator_daemon.py · `server/dashboard.py` (panels, toggles, /control) · `scripts/`: snapshot.sh,
trim_git_history.sh · tiered_llm.py (lesson preamble + failure routing)
