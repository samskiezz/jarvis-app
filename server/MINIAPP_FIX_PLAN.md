# Mini-App Fix Plan (from the 2026-06-14 deep functional audit)

Audited all 34 apps end-to-end (frontend handler → dashboard proxy → backend route → service, + live curl).
**Most backends are REAL.** The pervasive failures trace to a few root causes, not 34 separate bugs.

## ROOT CAUSES (fix these first — they unblock most apps)

### R1 — No POST proxy in the live UI server (`server/dashboard.py` `do_POST`). KEYSTONE.
`:8095` proxies allow-listed **GET** to the backend `:8001` (`_proxy_backend_get`), but `do_POST` has **no `/v1/*` branch** — every unmatched POST falls to `else: {"ok":false}` (~`dashboard.py:3655`). So EVERY write button is a silent no-op:
intel (generate report / new case), memory (remember), inbox (ack), assets (wire/generate),
intent (capture/convert), decision (create/review), compress (create), spec (create),
proofpack (create/export), mode (apply), ritual (start/advance), friction (log), forgekey (approve/reject).
**Fix:** add a `/v1/*` POST proxy mirroring `_proxy_backend_get` (forward body + inject `Authorization: Bearer <JARVIS_API_KEY>`), with a POST allow-list. **One change revives ~15 apps.** Effort M.

### R2 — Backend `:8001` gets wedged (event-loop blocked) → all reads die too.
AssetDNA's detail endpoint runs a blocking 10k-file scan on the async loop and DoS'd uvicorn during the audit.
**Fix:** `pm2 restart jarvis-backend` + make `asset_dna.get_asset` non-blocking (`run_in_threadpool` / non-async) and route `/{asset_id:path}` (ids contain `/`). Effort M.

### R3 — LLM router points at a dead chat endpoint (Ollama :8080) → compress/spec produce empty/husk output.
The brain now lives on the 3090 (ollama tunnel :11434). Point `llm_router`/`tiered_llm` "chat" at the working brain.
**Fix:** config — set the chat model/base to the live brain. Effort S.

## PER-APP STATUS + FIX

### REAL — work end-to-end (no fix): syshealth, agent, tasks, panickey, deadzone, budget, higgsfield*, tripo3d* (*credential-gated, flow is real)

### Quick wins (UI-only, independent of R1)
- **claw**: chat shows raw JSON — read `d.data.result.payloads[0].text` not `d.data.message` (`jarvis_live.html:6537`). S
- **scale**: "Scale +1" is a placebo (`triggerScaleUp` → alert only, `6201`) — remove or wire a real tick. S
- **search**: replace blocking `prompt()` (`6493`) with an in-sheet `<input>`+button; make results clickable. M
- **library**: 1638 GLBs, 0 images → every tile is a 🧊 placeholder. Add GLB thumbnails or inline `<model-viewer>` preview. M
- **settings/voiceforge**: Test-voice uses browser SpeechSynthesis → route to cloned `/tts`. S
- **theme**: sanitize LLM vars (wrap blur in `blur()`, enforce readable contrast) + also set `--tx`. S

### Surface rich backends (replace generic JSON dump with a real view)
- **suggestions** mini-app: reuse `renderSuggestions()` (the 2nd-dock has approve/build/proposal). S
- **celestial**: friendly summary + "view 3D" (done partially). S
- **architecture**: layer list with status pills. S
- **assets**: add browse/wire/generate buttons (needs R1). M
- **swarms**: add resume/advance/review controls (endpoints exist). M

### Logic/completeness fixes (after R1)
- **inbox**: (a) wire ack button; (b) FIX escalation compounding — `proactive_loop._monitor_pending_alerts` re-emits `severity=action` → "Unresolved action: Unresolved action: …×20"; skip `category==escalation`. M
- **decision**: derive `score` (expected vs actual) + review-reminder scheduler. M
- **ritual**: wire "Runs" list endpoint; make record-only destructive steps real or relabel. M
- **mode**: consume cost/autonomy overrides in `prompt_directive()` (currently inert). S–M
- **spec**: don't save husk on LLM failure; wire approve→forge handoff. M
- **friction**: real duplicate detection (hash prompts, not token-count buckets). M
- **proofpack**: render `screenshot_url` into the export. S
- **intent**: convert→ real spec/task store (currently a shadow note). M
- **forgekey**: web approve→`land_change` / reject→`reject_change` (currently status-only). M

## EXECUTION ORDER
1. **R1 POST proxy** (keystone) → revives ~15 write buttons.
2. **R2 backend restart + AssetDNA async fix** → reads stop dying.
3. **R3 router→live brain** → compress/spec real output.
4. Quick wins (claw, scale, search, library, settings/theme).
5. Surface rich backends (suggestions, architecture, assets, swarms, celestial).
6. Logic fixes (inbox escalation, decision, ritual, mode, spec, friction, proofpack, intent, forgekey).
