# Remaining gaps from the full Jarvis gap audit

Source: in-session full-system gap audit producing a 50-item list. 6 already
shipped: #22, #23, #27, #31 (false alarm), #32, #42. This doc honestly
classifies the remaining 44 by what they actually need.

## Status legend

- ✅ **Already implemented** — gap was a false reading; code already does this.
- 🔧 **Surgical (≤20 LOC)** — can be shipped by an agent in one focused pass.
- 🎨 **Needs UE5 Editor + artist** — `.uasset` / Sequencer / Niagara work an
  agent literally cannot author.
- 🔌 **Needs external hardware + drivers** — gaze tracker, switch hardware,
  cameras, NVDA/JAWS install. Cannot be done in this sandbox.
- 📋 **Needs product spec** — orphaned mini-app shell with no defined
  backend contract; the owner must say what it should do.
- 🧪 **Needs ML model + data** — vision classifier, motor-intent predictor.

## Per-gap status

### Accessibility (gaps 1–8)

| # | Gap | Status | Evidence / Fix |
|---|---|---|---|
| 1 | Gaze tracking driver | 🔌 | Needs eye-tracker hardware + Eye Gaze API. `server/agent/catalog.py:753` mode constant only. |
| 2 | Switch-scan state machine | 🔌 | Needs single-switch input device + scan-loop engine. Mode constant at same file. |
| 3 | Motor-intent prediction | 🧪 | Needs training data + sklearn classifier on action history. |
| 4 | Reduce-motion enforcement | 🔧 | Body class `calm` is applied; CSS rules already include reduce-motion overrides. **VERIFY** — may already be live. |
| 5 | Screen-reader bridge (NVDA/JAWS) | 🔌 | Needs NVDA Controller Client install on Windows host. Read-aloud queues `_cmd` but never speaks. |
| 6 | Dwell-click | 🔌 | Needs pointer hardware + JS dwell timer. Mode constant only. |
| 7 | Voice-only navigation fallback | 🔧 | Partial: voice-commands mini-app exists (5a0bcf1b). Missing: voice-mappable open commands for every dock app. Add to `server/services/voice_commands.py` intent map. |
| 8 | A11y state persistence across restart | 🔧 | `_a11y_write()` writes `server/data/a11y_state.json`. Add startup load + memory-store backup. ~10 LOC in `server/dashboard.py:_a11y_read`. |

### Vision / Sensors (gaps 9–14) — ALL need hardware

| # | Gap | Status |
|---|---|---|
| 9 | Camera capture pipeline | 🔌 + 🧪 |
| 10 | Object/face detection | 🧪 |
| 11 | Vision-LLM bridge | 🔧 (once 9+10 exist — wrap call to Claude with image) |
| 12 | IMU/motion sensors (mobile) | 🔌 |
| 13 | Ambient audio classifier | 🧪 |
| 14 | Multimodal scene description | 🔧 (once 9+10+11 exist) |

### Mini-app backends (gaps 15–26)

All require a product spec. Listed by what the UI is wired to POST/GET.

| # | Mini-app | Status | Missing route |
|---|---|---|---|
| 15 | `app-guardian` | 📋 | `/v1/guardian/*` — owner needs to define guardian actions |
| 16 | `app-vitals` | 📋 | `/vitals` — what vitals source? wearable? manual entry? |
| 17 | `app-worklist` actions | 🔧 | Approve/reject buttons exist in UI; route is `POST /tasks/{id}/approve` — wire to existing `server/services/task_daemon.py` |
| 18 | `run-builder` | 📋 | Needs builder workflow spec |
| 19 | `run-correlator` | 📋 | Same |
| 20 | `inf-swarm` actions | 📋 | Same |
| 21 | VPN management | 📋 | `/vpn` (WireGuard) — owner had this queued per memory |
| 22 | Solar inverter | 📋 | `/solar` — owner had this queued |
| 23 | ✅ Reminders | DONE | `1bff7030` |
| 24 | Phone dialer real backend | 🔌 + 📋 | Needs SIP/Twilio + product spec |
| 25 | Messages backend | 📋 | Needs message-store contract |
| 26 | Photos library backend | 🔧 | Wire `openPhotosOverlay` to existing `library` route (or new `/photos`) — needs scope decision |

### Underworld → JARVIS surfacing (gaps 27–30)

| # | Gap | Status | Fix location |
|---|---|---|---|
| 27 | ✅ Awakening arc | DONE | `1bff7030` — `loadAwakening(worldId)` |
| 28 | Eulogy feed in JARVIS UI | 🔧 | Add `loadEulogies(worldId)` alongside `loadAwakening`. Same proxy pattern. ~5 LOC. |
| 29 | God-camera HUD | 🎨 (UE5 widget) + 🔧 (JS) | UMG widget needs UE Editor; JS bridge to gaze endpoint is ~10 LOC. |
| 30 | Underworld health probe surface | ✅ ALREADY EXISTS | `server/routes/gateway.py:underworld_health()` mounted at `/v1/underworld/health`. UI just needs to call it. Add `loadUnderworldHealth()`. ~5 LOC. |

### Auto-improve loop (gaps 31–35)

| # | Gap | Status | Evidence |
|---|---|---|---|
| 31 | ✅ Audit-verdict enforcement | ALREADY IMPLEMENTED | `scripts/auto_improve.py:627` checks `au.get("merge_ok")` before `land()`. |
| 32 | ✅ Viability bootstrap | DONE | `57204cbd` — thresholds 60→20. |
| 33 | Dead-zone scanner | 🔧 | `dz.scan_assets()` called via `hasattr` safety in `auto_improve.py:159`; service stub returns empty list. Walk `MINI_APPS` JSON, fetch each backend route, flag 404s. ~30 LOC in `server/services/dead_zone_finder.py`. |
| 34 | MINI_APPS regex fallback | 🔧 | `scripts/auto_improve.py:166` regex catches one syntax; HTML now uses `{id:'..',ic:..,t:..}`. Add dual pattern. ~3 LOC. |
| 35 | Post-land mini-app health check | 🔧 | After `land()`, check every claimed mini-app route returns 200. ~15 LOC in `scripts/auto_improve.py:land()`. |

### LLM router / token governor (gaps 36–38)

| # | Gap | Status | Fix |
|---|---|---|---|
| 36 | Mid-stream token budget | 🔧 (substantial) | Token governor only enforces at decide-time. Streaming responses need chunk-callback that counts output tokens and cancels if exceeded. ~50 LOC in `server/services/tiered_llm.py`. |
| 37 | Stream completion marker | 🔧 | Wrap SSE streams in try/finally that emits final `event: end` or `event: error`. ~10 LOC per stream endpoint. |
| 38 | Embedding dimension migration | 🔧 | `server/services/embeddings.py:_resolved["dim"]` learned on first GPU call; no `reindex_vectors()` trigger. Add detection that schedules background reindex. ~20 LOC. |

### Brain / GPU lifecycle (gaps 39–41)

| # | Gap | Status | Fix |
|---|---|---|---|
| 39 | Provision wait-for-ready | 🔧 | `scripts/brain_watchdog.py:_try_provision` returns immediately. Add `_PROVISION_PENDING` dict; skip "degraded" alerts for <600s-old instances. ~15 LOC. |
| 40 | UI dispose button POST endpoint | 🔧 | Add `POST /v1/gpu/dispose` to `server/routes/admin.py` (note: `/v1/gpu/status`, `/v1/gpu/infer`, `/v1/gpu/embed` already exist). ~20 LOC. |
| 41 | GPU cost ceiling alert | 🔧 | `server/services/token_governor.py:spent_today()` + `DAILY_USD`/`ARCHON_USD` exist. Add `spend_status()` returning `{spent, cap, pct_used}` + dashboard pill. ~15 LOC. |

### Memory / retrieval (gaps 42–43)

| # | Gap | Status | Fix |
|---|---|---|---|
| 42 | ✅ user_memory.py | DONE | `1bff7030` |
| 43 | ✅ Cinematic self-heal | ALREADY CALLED | `server/routes/cinematic.py:368, 383` — `_heal()` IS invoked when entity counts fall below threshold. Earlier audit claim "never called" was wrong. |

### UE5 game spine (gaps 44–48) — ALL need UE5 Editor

See `underworld/docs/UE5_EDITOR_HANDOFF.md` for the full list. All are
`.uasset` binary files that cannot be authored without the UE5 Editor GUI.

| # | Gap | Status |
|---|---|---|
| 44 | UMG widgets (10× WBP_*) | 🎨 |
| 45 | Sequencer cutscenes (6× SEQ_*) | 🎨 |
| 46 | BP_PlayableMinion + ABP_Minion | 🎨 |
| 47 | Niagara FX (6× NS_*) | 🎨 |
| 48 | Underworld_Player.umap | 🎨 |

### Studio / TTS (gaps 49–50)

| # | Gap | Status | Fix |
|---|---|---|---|
| 49 | Per-minion voice-seed determinism | 🔧 | Cache `hash(minion_id) → voice_index` in `server/data/tts_voice_seeds.db`. ~25 LOC. |
| 50 | Ambient music banks for Awakening acts | 🔧 + 🎵 | MetaSounds binding to `arc_stage` is engineering; the music tracks need a composer or licensed library. |

---

## Roll-up

| Category | Count |
|---|---|
| ✅ Already implemented (false alarms in original audit) | 5 |
| ✅ Done this session | 6 |
| 🔧 Surgical, shippable in a focused next session | 18 |
| 🎨 Needs UE5 Editor + artist | 5 |
| 🔌 Needs external hardware/install | 7 |
| 📋 Needs product spec from owner | 8 |
| 🧪 Needs ML model + training data | 4 |
| 🎵 Needs composer / licensed audio | 1 |

**Net for the next coding session** — the 18 🔧 surgical items, ordered by
leverage:

1. #30 — `loadUnderworldHealth()` JS fetcher (5 LOC)
2. #28 — `loadEulogies()` JS fetcher (5 LOC)
3. #34 — MINI_APPS regex dual-pattern (3 LOC)
4. #4 — verify reduce-motion CSS active (verification + maybe 5 LOC)
5. #41 — GPU `spend_status()` + dashboard pill (15 LOC)
6. #40 — `POST /v1/gpu/dispose` (20 LOC)
7. #39 — provision wait-for-ready (15 LOC)
8. #37 — SSE completion markers (10 LOC × N streams)
9. #38 — embedding reindex trigger (20 LOC)
10. #35 — post-land mini-app health check (15 LOC)
11. #33 — real dead-zone scanner (30 LOC)
12. #43 — verify cinematic self-heal (may be ✅ already)
13. #49 — TTS voice-seed cache (25 LOC)
14. #8 — a11y state persistence on restart (10 LOC)
15. #17 — wire worklist approve/reject (10 LOC)
16. #7 — extend voice intent map for every dock app (~50 LOC)
17. #36 — mid-stream token budget (50 LOC, biggest)
18. #11 + #14 — vision LLM bridge (waits on hardware first)

**Net for the owner** — these 21 items sit OUTSIDE what an agent in this
sandbox can ship without owner input:

- 🔌 hardware (gaze tracker, switch device, camera, NVDA install) — buy/install
- 📋 product specs (guardian, vitals, run-builder, run-correlator, inf-swarm,
  VPN, Solar, messages, photos scope) — write the contract
- 🧪 ML models (vision classifier, motor predictor, audio classifier) — train
  or acquire
- 🎵 audio tracks for Awakening — commission / license

**Net for an artist on the GPU box** — the 5 UE5 Editor items unblock the
playable game spine. See `UE5_EDITOR_HANDOFF.md`.

---

## Honest note on this audit

The original 50-item audit (delegated to an Explore subagent) included two
false alarms verified during shipping: #31 (claimed `land()` skipped audit
check — actually gated at line 627) and #43 (claimed cinematic `_heal()` was
never called — actually called at lines 368 + 383). Going forward, prefer
direct verification over wholly-delegated audits for the most load-bearing
findings.
