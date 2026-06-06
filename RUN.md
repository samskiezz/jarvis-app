# Run the platform

One command:

```bash
./boot.sh
#   backend  → http://127.0.0.1:8000
#   UI       → http://127.0.0.1:5173   (open “World OS” / “Plane Graph” / Jarvis orb)
```

`boot.sh` is idempotent: it starts the LLM (or uses a remote one), starts the
FastAPI backend, loads all data + projects the ontology, restores the scraped
document store, and starts the Vite UI. Re-run it any time — it heals a partial boot.

## LLM backend (pick one; optional)

| Target | Set before `./boot.sh` |
| --- | --- |
| Remote GPU / Ollama server | `export OLLAMA_HOST=http://your-gpu:11434` |
| Cloud (OpenAI-compatible) | `export KIMI_API_KEY=…` |
| Local Ollama (default) | nothing — boot starts it |

With no LLM reachable the agent still answers — it grounds on the real corpus.

## Manual (no boot.sh)

```bash
pip install -r server/requirements.txt
python -m uvicorn server.main:app --host 127.0.0.1 --port 8000 &
curl -XPOST -H "Authorization: Bearer dev-key" localhost:8000/v1/jarvis/system/startup
npm install && npm run dev
```

## Verify it's up

```bash
curl localhost:8000/v1/jarvis/system/status      # Foundry/Gotham/Apollo/AIP rollup
curl localhost:8000/v1/jarvis/scrape/status      # scraped docs + seed progress
python -m pytest server/tests -q --ignore=server/tests/test_brain_migrate.py   # 587 pass
npm run build                                     # UI build
```

## Grow the data (scraper / document finder)

```bash
python -m server.scrapers.find_all --depth 2          # crawl + fetch real docs
curl -XPOST localhost:8000/v1/jarvis/scrape/find -d '{"seeds_limit":6,"depth":2}'
```
Each sweep grows Foundry (fetched docs), Gotham (Topic edges) and Apollo (delivery).

## Config knobs

`OLLAMA_HOST`, `OLLAMA_MODEL`, `KIMI_API_KEY`, `BRAIN_DB`, `API_HOST`, `API_PORT`,
`UI_PORT`, `RECON_ALLOWLIST` (your own hosts for ffuf/kiterunner), `NO_UI=1`, `NO_LLM=1`.

See **docs/PRODUCTION.md** for the full architecture.
