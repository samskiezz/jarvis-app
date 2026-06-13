# JARVIS 15-Phase Mini-App Build Plan

> Compiled from the confirmed explanation set + existing repo capabilities.
> Rule: every mini app wires to a real backend endpoint/service; no fake data, no placeholder logic.

## Phase 0 — Foundation

- Create `server/services/mini_app_state.py` — lightweight JSON/SQLite state store for mini apps that do not need a full DB table.
- Create `server/routes/mini_app_routes.py` umbrella only if needed; prefer one route file per mini app.
- Mount all new routers in `server/main.py` under `/v1/mini/*` or app-specific prefixes.
- Add shared frontend helpers in `server/jarvis_live.html` for common sheet patterns (list, form, detail, toggle).
- Preserve existing UI theme; run `scripts/check_ui_theme_lock.py` after every HTML change.

## Phase 1 — PanicKey + ForgeKey

### PanicKey (existing, enhanced)
- Backend: extend `server/services/panickey.py` and `server/routes/...` with:
  - `GET /v1/panickey/active` — active agents/scripts/model calls from tiered_llm + pm2.
  - `POST /v1/panickey/snapshot` — snapshot current state.
  - `POST /v1/panickey/restore` — restore last snapshot.
  - `POST /v1/panickey/safemode` — enter/exit safe mode.
- Frontend: real control sheet with Stop/Pause/Resume/Snapshot/Restore/Safe Mode + active job list.

### ForgeKey (new)
- Backend: wrap existing `server/routes/forge.py` (`/v1/forge/status`, `/v1/forge/approvals/*`).
- Frontend: approval queue mini app; approve/reject/inspect changes.

## Phase 2 — IntentInbox + DecisionLedger

### IntentInbox
- Backend: `POST /v1/intent/capture`, `GET /v1/intent/list`, `POST /v1/intent/convert`, backed by `second_brain` notes with `kind=intent`.
- Frontend: quick capture form + intent list + convert to spec/reminder/draft.

### DecisionLedger
- Backend: `POST /v1/decision`, `GET /v1/decision/list`, `GET /v1/decision/{id}`, backed by `second_brain` notes with `kind=decision`.
- Frontend: decision cards with evidence, rejected options, risks, review dates.

## Phase 3 — ThoughtCompressor + AssetDNA

### ThoughtCompressor
- Backend: `POST /v1/compress` — takes raw text/logs/chat and returns short/full/structured brief using `llm_router.complete()`; stores packs as second-brain notes.
- Frontend: paste/Upload → compress → save pack → refresh stale packs.

### AssetDNA
- Backend: `POST /v1/asset/register`, `GET /v1/asset/list`, `GET /v1/asset/{id}`; scan repo files + inventory CSV to build identity cards.
- Frontend: asset cards with health, risk, dependencies, dependents, recommendations.

## Phase 4 — RitualDeck + ModeMixer

### RitualDeck
- Backend: `GET /v1/ritual/list`, `POST /v1/ritual/run`, `POST /v1/ritual/pause`, `GET /v1/ritual/status`; store routines in `mini_app_state`.
- Frontend: routine launcher with step tracking + safe-mode guard.

### ModeMixer
- Backend: `GET /v1/mode`, `POST /v1/mode/apply`, `POST /v1/mode/save`; persisted mode profile (tone, detail, speed, cost, safety, autonomy).
- Frontend: sliders/presets + active mode indicator.

## Phase 5 — SpecForge

- Backend: `POST /v1/spec/create` — turns rough idea into structured spec (screens, routes, data, events, guardrails, tests, MVP); uses `llm_router.complete()`; stores as second-brain note.
- Frontend: idea input → generated spec sections → edit/export/approve.

## Phase 6 — FrictionMap + DeadZoneFinder

### FrictionMap
- Backend: `POST /v1/friction/scan` — analyzes command history / chat logs for repeated prompts/actions/waits; returns friction score + suggestions.
- Frontend: ranked friction list + create automation/ritual/spec.

### DeadZoneFinder
- Backend: `GET /v1/deadzone/scan` — scans repo + inventory for stale files, unused routes, broken imports, overlapping mini apps.
- Frontend: findings with evidence + create cleanup spec.

## Phase 7 — ProofPack

- Backend: `POST /v1/proofpack/create` — captures git diff, changed endpoints, test results, logs, risks, rollback notes.
- Frontend: create/read/export proof pack; link specs, decisions, screenshots.

## Phase 8 — VoiceForge

- Backend: `GET /v1/voiceforge/profiles`, `POST /v1/voiceforge/profile`, `POST /v1/voiceforge/test`, `POST /v1/voiceforge/activate`; integrate with `jarvis-voiceclone` service and TTS endpoints.
- Frontend: record/upload/clean samples → create profile → test → set active.

## Phase 9 — Higgsfield + Tripo3D Polish

- Ensure both existing custom sheets expose all backend params.
- Add "Save to Library" handoff and status retry.
- No functional regression.

## Phase 10 — CodePulse VS Code Bridge Foundation

- Backend: `POST /v1/codepulse/connect`, `GET /v1/codepulse/status`, `POST /v1/codepulse/command`; simple HTTP bridge expecting a VS Code extension (to be built later).
- Frontend: connect/disconnect + workspace/running jobs/approval queue.

## Phase 11 — CodePulse AI Popup + Approval Flow

- Floating popup inside `jarvis_live.html` showing current VS Code action.
- Yes/No/Explain/Safe-option controls.
- PanicKey stop integration.

## Phase 12 — Live UI Wiring

- Add all new mini apps to `MINI_APPS` array.
- Add endpoints to `APP_ENDPOINTS` or custom `renderXSheet()` handlers.
- Wire dock items, celestial actions, `tryCommandShortcuts`.
- Ensure no `showCard` fallback for any new surface.

## Phase 13 — Validation

- `npm run lint && npm run typecheck && npm run build && npm run test`
- `python3 scripts/check_ui_theme_lock.py`
- `npm run test:break`
- `node --check` on extracted main JS
- Backend syntax check for every new route/service.

## Phase 14 — Deploy + Cache Buster

- Bump `__jv` in `server/jarvis_live.html` and nginx config.
- Restart `jarvis-backend` and `jarvis-dashboard`.
- Verify public URL + at least 3 new mini apps end-to-end.
