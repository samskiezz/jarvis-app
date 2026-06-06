# Production Runbook — Jarvis / Palantir-class Platform

One-command boot, configurable LLM backend (laptop → GPU servers), and the
runtime pieces that make the bot a real agent rather than a shell.

## Boot it

```bash
./boot.sh
# backend  : http://127.0.0.1:8000
# UI       : http://127.0.0.1:5173   (open “World OS” / “Plane Graph”)
```

`boot.sh` is idempotent and plug-and-play. It: starts/locates the LLM, starts the
FastAPI backend, runs the governed data load AND **projects the corpus into the
ontology graph**, then starts the Vite UI. Re-running heals a partial boot.

The projection (`services/jarvis_corpus_projection.py`, run by `/system/startup`)
turns the acquisition corpus into the Gotham graph so the maths actually maths:

| | loaded (Foundry) | projected into Gotham |
| --- | --- | --- |
| domain subjects | 10,000 | → **10,000 neurons** (DomainSubject objects) |
| endpoints | 92,000 | → 92,000 DataSource objects (+ SERVES links) |
| OCR docs | 30,000 | → 30,000 Document objects (+ DESCRIBES links) |
| typed flow edges | 55,000 | → flow links |
| | | **≈132k ontology objects · 177k links** |

Idempotent (`INSERT OR IGNORE` on the PK), so re-running never duplicates.

Env knobs (all optional): `OLLAMA_HOST`, `OLLAMA_MODEL`, `KIMI_API_KEY`,
`KIMI_BASE_URL`, `BRAIN_DB`, `API_HOST`, `API_PORT`, `UI_PORT`, `NO_UI=1`,
`NO_LLM=1`.

## LLM backend (AIP) — configurable, GPU-scalable

The same image runs anywhere; only env changes:

| Target | Set |
| --- | --- |
| **Remote GPU / Ollama server** (prod) | `export OLLAMA_HOST=http://gpu-box:11434` |
| **Cloud (OpenAI-compatible)** | `export KIMI_API_KEY=… [KIMI_BASE_URL=…]` |
| **Local Ollama** (default, dev) | nothing — started by `boot.sh` |

The backend auto-selects whatever is reachable (`services/llm_research.backend()`):
Ollama → OpenAI-compatible → none. With **no** LLM reachable the agent still works
— it grounds on the real corpus (see below) instead of fabricating answers.

### Intel AMX (local CPU inference)

AMX is supported on this class of CPU and **works** — verified by executing real
tile ops (`scripts/amx_probe.c`). Two facts matter:

1. AMX `XTILEDATA` must be granted per-process via `arch_prctl(ARCH_REQ_XCOMP_PERM)`,
   and that grant is **not** inherited across `execve`. ggml/ollama never request
   it, so AMX kernels fault. `scripts/amx_enable.c` → `libamx_enable.so` is an
   `LD_PRELOAD` constructor that performs the request inside every process
   (including the llama-server runner). `boot.sh` builds and preloads it for local
   Ollama. This is the kernel-mandated enable, not a workaround.
2. Separately, **ollama ≤ 0.30.6 ships a prebuilt AMX GEMM (`ggml_backend_amx_mul_mat`
   in `libggml-cpu-sapphirerapids.so`) with a memory bug** that SIGSEGVs during the
   first forward pass even with the permission correctly granted (gdb-confirmed).
   Until a fixed AMX build is installed, run inference on a GPU/remote server
   (`OLLAMA_HOST`) — the shim stays in place and will light up AMX automatically the
   moment a non-broken build is present.

## The agent (AIP tool-use)

The bot is a real planner/executor, not regex or a plain text stream.

- `POST /v1/jarvis/agent/chat {message, history?}` →
  `{answer, trace, backend, steps, used_tools}`
  (`services/jarvis_agent.py`). It plans with the LLM, **calls governed tools**, keeps
  step memory, and synthesises a grounded answer. Read tools execute; **write tools
  become PENDING approval proposals — never silent mutations.**
- Tool registry + dispatcher: `services/aip_tools.py` (`list_tools`/`call_tool`).
  Tools include `corpus.search`, `search`, `ontology.query/get`, `science.*`, and the
  governed `ontology.*` write actions.
- Frontend: the omnipresent `JarvisAssistant` (voice in/out already present via
  `lib/jarvisVoice.js`) and the terminal `AnalystPanel` both run this loop through one
  unified client (`lib/jarvisApi.js` → `kimiClient`), showing the tool trace.

## Scraping the catalogue (real fetched content)

The catalogue lists ~235 distinct real sources. To turn them into REAL fetched
content (not catalogue rows), the platform ships a concurrent scraping bundle:

The bundle is a registry (`services/scrape_engines.py`); `GET /v1/jarvis/scrape/engines`
reports what's installed here vs. install hints (real `import`/ELF-verified probe — a
python `httpx` shim never masquerades as the Go tool).

**Content engines** (safe on public open-data sources):

| engine | what it is | when |
| --- | --- | --- |
| **Scrapling** + `curl_cffi` | concurrent fetch with browser-TLS impersonation (beats 403/503 blocks) | default — `POST /v1/jarvis/scrape` (engine=auto) |
| **cloudscraper** | clears Cloudflare/anti-bot JS challenges | `engine=cloudscraper` |
| **Scrapy** | large async crawler, AutoThrottle, robots-obeying | bulk — `python -m server.scrapers.run` |
| **katana** | JS-rendering link discovery (read-only crawl) | `POST /v1/jarvis/scrape/discover` |
| sequential (`net_ratelimit`) | stdlib polite fetch, no deps | fallback |

**Browser engines** (JS / bot-walled pages, need browser binaries ~80-400MB):
camoufox, undetected-chromedriver, botasaurus — registered, install on a host with disk.

**Recon engines — GOVERNED** (`katana`/`ffuf`/`kiterunner`/`arjun`): endpoint/param
discovery + fuzzing. These are dual-use: a fuzzer pointed at third-party infra gets the
platform IP-banned and can DoS them. So `POST /v1/jarvis/scrape/recon` runs them ONLY
against an authorised, allow-listed target you own (`RECON_ALLOWLIST` env + `authorized:true`).
katana (read-only crawl) is the gentle option and is also usable for content discovery.

Each fetched page becomes an `ont_object` of type `Document` with **honest
provenance** — HTTP status, byte/char counts, a SHA-256 of the body, fetch
timestamp, excerpt — and a `DESCRIBES` link to its subject (`services/jarvis_scrape.py`,
`services/jarvis_scrape.store_document` is the single storage path for every engine).
Governance: only legal-gate **CLEARED** hosts and public open-standard / open-data /
gov / open-science hosts are fetched; everything else stays `review_required`.

```bash
# concurrent (Scrapling)        # large crawl (Scrapy)
curl -XPOST :8000/v1/jarvis/scrape -d '{"engine":"scrapling","limit":60}'
python -m server.scrapers.run --limit 200
```

`status().gotham.scraped_live` reports the count of genuinely-fetched documents —
distinct from the catalogue projection counts, so real vs catalogue is never blurred.
Install: `pip install -r server/requirements.txt` (scrapy, scrapling, curl_cffi,
browserforge). Playwright/Puppeteer (JS rendering) are optional and need browser
binaries (~400MB) — enable on a host with the disk for them.

## Grounding on the REAL corpus

`services/world_search.py` (`corpus.search` tool) does ranked keyword search across
the actual acquisition corpus — **92k endpoint candidates, 10k domain subjects, 30k
OCR docs, 30k benchmarks** — returning real sources with provenance (NASA CMR,
OpenSky, USGS, Crossref, NOAA…). This is what the agent cites, online or offline.

## Live graph (Gotham)

- `WS /v1/graph/stream` streams the ontology as **binary delta frames** (not JSON):
  a snapshot on connect, then add/change/remove deltas as the graph mutates, plus
  heartbeats (`services/graph_stream.py`). When a governed action changes the
  ontology, the change streams to every client.
- `src/pages/GraphCanvas.jsx` consumes it via `engine/binaryTransport.BinaryDeltaSocket`,
  with GPU colour-buffer picking (`engine/gpuPicking`) and a quaternion-slerp camera
  (`engine/quaternionCamera`).
- `src/pages/PlaneGraph.jsx` renders the radial plane constellation
  (`engine/layoutEngine` + governed `engine/graphPolicy`).

## Health & status

- `GET /v1/jarvis/system/status` — Foundry/Gotham/Apollo/AIP/Security rollup + counts.
- `GET /v1/jarvis/research/status` — LLM backend + availability.
- `GET /v1/jarvis/agent/tools` — the tool catalogue the agent can call.

## Tests

```bash
python -m pytest server/tests -q --ignore=server/tests/test_brain_migrate.py
npm run build
```
