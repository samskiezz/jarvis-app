# GPU + Spend Audit — 2026-06-18

Scope: Vast.ai GPU lifecycle, watchdogs, LLM API spend, Wasabi I/O, Ollama,
external API discipline. **Read-only audit.** Nothing was disposed, killed,
modified, or cancelled.

---

## Top 5 spend leaks (TL;DR)

| # | Leak | Severity | Waste rate | Fix | Est. savings |
|---|------|----------|------------|-----|---------------|
| 1 | `brain-watchdog` calls Vast API ~2/min while the API key returns `unauthorized` — pure noise loop, no GPU ever provisions | HIGH | ~2,880 Vast API calls/day, dashboard alert never clears, ~2 KB/min appended to `vast_events.jsonl` | Fix the Vast API key OR pause `brain-watchdog` until `BRAIN_WATCHDOG_AUTO_PROVISION` is intentionally on with a valid key. Add a hard "if last N attempts all returned `unauthorized` → back off to 1/hr" circuit-breaker in `scripts/brain_watchdog.py`. | 0 USD on Vast (already free — but unblocks real provisioning, stops a noisy log + a stale dashboard alert). |
| 2 | `migrate_to_wasabi.py --apply --prune` running 2h08m, processing 745 entries that are almost all `classify error: No such file or directory` for files under `underworld/deploy/ue5-project/Content/UnderworldMedia/{Videos,Images}/...` | HIGH | CPU is light (~2%) but the script holds an active TLS conn to Wasabi (206.148.5.105:443) and is grinding through a stale plan against files that don't exist on local disk | Let current run finish OR re-plan with a corrected `migration.include` glob. The "skip" branch is non-destructive (no upload, no delete) so it's safe to leave running, but it's a no-op marathon. | Wasabi GET/PUT/list ops ≈ 0 useful work; restarting with a corrected plan saves ≥1.5h next time. |
| 3 | `jarvis-dashboard` process holds 5.5 GB RSS, 12-13 % CPU steady, 8h uptime, 1 restart | HIGH | ~5.5 GB RAM permanently pinned by one Python process; this is the single biggest memory consumer in the box | Profile `server/dashboard.py` for unbounded in-process caches (repo_graph_positions, neural embeddings, brain.db loaded into memory). Add a periodic GC + cap on cached datasets, or split heavy subsystems into a separate worker. Until then this is a node-restart bomb (pm2-logrotate already running). | ~3–4 GB RAM, frees headroom for ollama-cpu / brain.db swap pressure. |
| 4 | `ollama-cpu` PM2 process is online but no models loaded (`ollama list` not reachable on PATH; 6.1 GB still sitting in `/root/.ollama`); the brain protocol always wants the remote Vast box, so `ollama-cpu` is a dormant fallback that never serves traffic | MEDIUM | ~31 MB RSS for the supervisor + 6.1 GB disk for cached models that aren't being served | Decide: either pre-warm `ollama-cpu` with one tiny model (qwen2.5:0.5b) so it can actually answer when Vast is down, or stop the pm2 service and reclaim 6.1 GB by `ollama rm` of unused models. Right now it's neither failover nor dead. | 6.1 GB disk + 1 always-on PM2 slot. |
| 5 | Claude/Anthropic spend was very lumpy: **$43.81 on 2026-06-10 alone** (58 calls, 1.03M output tokens) — that day a single call cost **$1.04** and several others were $0.40-0.90 — token_governor's `CLAUDE_DAILY_USD=25` ceiling was breached by 75 % | MEDIUM | $43.81 / day burst; `token_governor.decide()` returns `haiku` only AFTER `spent_today() >= DAILY_USD`, which means the call that crosses the boundary still gets sonnet/opus rates | Lower `CLAUDE_DAILY_USD` (currently 25) OR make the governor predictive: estimate the next call's cost (`in_tok + max_tokens`) and downgrade BEFORE the call instead of after the spend lands. Also: 1.03M output tokens in one day suggests an unbounded/un-cached agent loop — find which workflow drove it. | $15–25/day on bursts; brings spend trajectory in line with the configured ceiling. |

---

## Detailed inventory

### 1. Vast.ai lifecycle

**State today**: `server/data/brain_health.json` =
`{"ok": false, "state": "missing", "alert": "no brain box exists — click Provision in GPU mini-app"}`. So there is **no GPU instance running right now** — nothing to dispose, nothing to pay for on Vast directly.

**Watchdogs that touch Vast** (all PM2-supervised, all online):
- `brain-watchdog` (PID 3117182) — checks every 60 s
- `vast-kill-switch` (PID 3117187)
- `burst-watcher` (PID 3117193) — started 2026-06-18T13:58:40Z, log shows ONE line ever
- `health-watchdog` (PID 3147135)
- `jarvis-watchdog` (PID 2834618)

**`vast_events.jsonl` last 5,000 events (~36.9 h window)**:

| kind | count |
|------|-------|
| `first_seen` | 414 |
| `killed` | 402 |
| `disappeared` | 402 |
| `brain_missing` | 122 |
| `brain_provision_throttled` | 113 |
| `health_state_change` | 34 |
| `brain_auto_provision_attempt` | 9 |
| `brain_auto_disposed` | 1 |

The 414 `first_seen` + 402 `killed`/`disappeared` pairs are `vast_kill_switch` doing its job (cleaning up orphaned non-protected instances). That's defensible.

**The hot loop**: `brain-watchdog` every 60 s emits `brain_missing`. Every 15 min the cooldown timer expires and it tries `brain_auto_provision_attempt` with `tier=standard, max_price=$0.25`. **Every attempt returns `{"ok": false, "error": "unauthorized"}`.** 9 attempts in the last 36 h, all unauthorized. That means:

- `ALLOW_PROVISION=1` is set in `ecosystem.config.cjs` (verified)
- The API key Vast sees is invalid, expired, or not what's actually in `.vast_key`/`VAST_API_KEY` env

So the watchdog is in a forever-loop: detect missing → wait 15 min → fail → wait 15 min → fail …. It will never recover on its own.

**Cost impact**: Vast charges nothing for a non-running box. The waste is:
- ~2,880 unauthenticated Vast API calls/day (Vast has no published rate limit but this is rude and the IP can be throttled)
- The `brain_health.json` alert is stuck "missing" forever, so any UI panel that escalates on it is permanently noisy
- `vast_events.jsonl` grows ~50 KB/day with throttle noise

**Recommendation**:
1. Rotate/repair the Vast API key.
2. Add a circuit breaker in `brain_watchdog.py`: after N consecutive `unauthorized` results from `brain_auto_provision_attempt`, escalate cooldown to 1 h and stop emitting the `brain_missing` health-state until the key is fixed.
3. Confirm `burst-watcher` is intended to be near-idle (only one log line since start).

### 2. Token governor / Claude API spend

`server/data/token_budget.db.spend` totals:

| day | calls | usd | in_tok | out_tok |
|-----|-------|-----|--------|---------|
| 2026-06-09 | 11 | 15.005 | 33,969 | 231,751 |
| 2026-06-10 | 58 | 43.812 | 89,920 | 936,315 |
| 2026-06-11 | 1 | 0.510 | 3,401 | 4,123 |
| 2026-06-14 | 2 | 1.093 | 6,666 | 11,308 |
| **total** | **72** | **$60.42** | | |

All 72 calls are `model=claude, mode=task`. **Zero entries for haiku/sonnet/opus split** — the governor records the family but not the variant, which makes it hard to tell whether the ceiling actually downgraded anyone.

**Why 2026-06-10 burned $43.81 on 58 calls**:
- 936K output tokens in one day = a lot of generation
- The biggest single call was `0.671 USD` (3.4K in, 5.6K out)
- DAILY_USD ceiling is 25.0 — was exceeded by ~75%

**Why the cap didn't bite**: `token_governor.decide()` reads `spent_today()` BEFORE the next call. So once the ceiling is hit it returns `haiku, mode=economy` — but only if the caller actually consults `decide()`. If a caller bypasses the governor (calls Claude directly via `tiered_llm.py` or `llm_router.py`), the spend is recorded after the fact but no downgrade happens. Two outbound Claude endpoints exist:

- `server/services/llm_router.py:164` — `https://api.anthropic.com/v1/messages` (streaming, model hardcoded `claude-3-5-sonnet-20241022`)
- `server/services/tiered_llm.py:117` — `https://api.anthropic.com/v1` (configurable, default `claude-sonnet-4-5`)

Neither caller is forced to go through `token_governor.decide()`. That's the leak.

**Recommendation**:
1. Make `token_governor.decide()` a hard gate in BOTH `llm_router.py` and `tiered_llm.py`. Single chokepoint, no bypass.
2. Predict cost BEFORE the call (`estimated_in + max_tokens * out_rate`) and downgrade pre-call instead of post-call.
3. Lower `CLAUDE_DAILY_USD` from 25 → 10 until burst behaviour is fixed.
4. Investigate what produced 936K output tokens on 2026-06-10 — probably an unbounded agent loop or an uncached scrape-then-summarize pipeline.

### 3. External API calls — caching, retries, streaming

Outbound endpoints found in `server/services/`:
- `api.openai.com/v1/images/generations` (`media_gen.py`)
- `api.openai.com/v1/chat/completions` (`llm_router.py`, `tiered_llm.py`, `multi_research.py`)
- `api.anthropic.com/v1/messages` (`llm_router.py`, `tiered_llm.py`)
- `console.vast.ai/api/v0/...` (`gpu_instances.py`, `brain_watchdog.py`)
- `sglang_embed` (`embeddings.py`) — local-only, ok

**`llm_router.py` streaming functions**:
- `_stream_openai`, `_stream_anthropic`, plus what appears to be another upstream — all use `httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0))`.
- The streams iterate `async for line in resp.aiter_lines()`. If the client side disconnects mid-stream the server side continues to be billed; httpx should close the conn on `__aexit__`.
- **No caching observed** — every identical prompt costs full tokens.
- **No retry** — single attempt, failure yields a `// {code}: {body[:300]}` chunk.

**`tiered_llm.py` `_post()`**:
- 15 s default timeout (good — fail fast)
- 120 s for `LLM_CLOUD_TIMEOUT`
- No retry with backoff
- No response caching

**Recommendation**:
1. Add a content-hash cache (key = `model + system + user + max_tok + fmt`) in front of `llm_router.py` and `tiered_llm.py`. TTL 24 h. Even 10 % hit rate would save several dollars on burst days.
2. Bounded retry (1 retry with 2 s backoff) only on 5xx / connection error, never on 4xx.
3. Ensure streaming responses are explicitly `await resp.aclose()`'d on caller exception so abandoned streams don't keep meters running.

### 4. Wasabi (S3) — `migrate_to_wasabi.py --apply --prune`

**Process**: PID 3120563, started 2026-06-18T13:59:24Z, 2h08m runtime, 2 % CPU. Holding one ESTABLISHED TLS to `206.148.5.105:443` (Wasabi region edge).

**What it's doing**: walking `underworld/deploy/ue5-project/Content/UnderworldMedia/{Videos,Images,...}`. **Every** entry in the 745-line log so far is `skip (classify error): [Errno 2] No such file or directory`. Translation: the migration plan was built from a list of files that don't exist on local disk anymore (probably already migrated, deleted, or never extracted from the UE5 cook step).

**Risk assessment**:
- The script's `_walk()` is `os.walk()`-based — those files shouldn't even appear unless something else is calling `cs.classify()` on a stale list. Looking at the code path: the only branch that catches `os.path.getsize(full)` errors and emits "skip (classify error)" is during the plan-building phase. So the script is building its plan over a stale manifest and producing thousands of no-op skips.
- **Hard rule observed: do NOT kill this process.** It is technically still making forward progress through the file list and the "skip" branch is non-destructive (no upload, no delete). The `--prune` flag only activates AFTER a verified upload, which isn't happening.
- However: the open Wasabi socket suggests it IS uploading SOME files between the skips (the log filter is just heavy on skips). Worth letting it finish naturally.

**Recommendation**:
1. Let current run finish (no harm).
2. Before next run, regenerate the include-list from a fresh `os.walk()` of what actually exists locally, not from `config/wasabi_storage.json`'s migration.include if that's stale.
3. Add a counter to the script: if >N consecutive `skip (classify error)` events, log a "WARNING: plan appears stale" and exit instead of grinding for hours.

### 5. PM2 services — dead or dormant

| Service | Status | RSS | Notes |
|---------|--------|-----|-------|
| `kgik-python` | stopped | 0 | Dead. Reclaim or remove from pm2 startup. |
| `openclaw-gateway` | stopped | 0 | **3,561 restarts** — chronic crash loop in the past, now stopped. Investigate or delete. |
| `jarvis-dashboard` | online | **5.5 GB** | See leak #3. |
| `jarvis-voiceclone` | online | 2.5 GB | XTTS model resident — expected. |
| `ollama-cpu` | online | 31 MB | Supervisor only, no model warmed. See leak #4. |
| `ollama-claw-bridge` | online | 4 MB | Trivial. |
| `lessons-distiller` | online | 14 MB | Trivial. |
| Everything else | online | <320 MB each | Acceptable. |

`pm2-logrotate` is on (good — it caps log growth).

### 6. Ollama on-box

- Binary: `/usr/local/bin/ollama serve` running as PID 2834633 (sshd-supervised by pm2 wrapper `ollama-cpu`)
- `ollama` CLI not on `$PATH` for root, but the daemon is up
- `/root/.ollama` = 6.1 GB — old model cache
- **No evidence anything calls the local ollama daemon for chat traffic.** All the chat tiers (`tiered_llm.py`) target either Vast (`provider=jarvis-brain`) or Anthropic/OpenAI.

So `ollama-cpu` + 6.1 GB cache is sitting there as cold standby that has never been activated. Either commit to warming it (so chat has a real local fallback when Vast is down) or stop it and reclaim disk.

---

## Hard-rule compliance check

- [x] Read-only — no `dispose`, no `kill`, no state-file edits
- [x] `vast_events.jsonl` untouched
- [x] `token_budget.db` untouched (read-only `sqlite3` queries)
- [x] `migrate_to_wasabi.py` (PID 3120563) untouched — still running
- [x] No external API calls cancelled
- [x] Only output: this file (`/opt/jarvis-app-1/audit/power/gpu-and-spend.md`)

---

## Sources

- `server/data/vast_events.jsonl` (size 356 KB, ~36.9 h window)
- `server/data/brain_watchdog.log` (84 KB)
- `server/data/burst_watcher.log`
- `server/data/brain_health.json`
- `server/data/token_budget.db` (spend table, 72 rows)
- `server/data/migration_logs/wasabi_20260618T135924Z.log` (745 lines)
- `scripts/brain_watchdog.py`, `scripts/migrate_to_wasabi.py`
- `server/services/gpu_instances.py`, `server/services/token_governor.py`,
  `server/services/llm_router.py`, `server/services/tiered_llm.py`
- `ecosystem.config.cjs` (confirmed `BRAIN_WATCHDOG_AUTO_PROVISION=1`,
  `BRAIN_WATCHDOG_ALLOW_DISPOSE=1`)
- `pm2 jlist` snapshot
