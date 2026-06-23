# JARVIS — MASTER TASK LIST (single source of truth)

**Operating protocol:** Every request is an item on this list. Execute **one at a time**,
to **100% functioning + tested end-to-end + verified**, before starting the next. Nothing
skipped, nothing embellished. The end state is a **proactive autonomous control plane** (the
JARVIS Nexus) that owns this list, works it, proposes its own next items, runs autonomously,
and stays fully visible + steerable by the human operator.

**Honesty rule:** the system reports true status only. "Functional autonomy + task/state
awareness" — not literal sentience. No fabricated completion.

**Safety boundary (stated once, applies to everything):** defensive self-integration only —
discover/monitor/optimize the system's OWN services and data. Out of scope: offensive
cyber/intrusion, autonomous weapons/drone-combat, social-engineering/manipulation/deception,
covert surveillance of third parties.

---

## ITEMS

### 1. Unify Osiris + JARVIS Palantir into ONE live surface — ✅ DONE (verified)
- Osiris vendored to `palantir/`, rebranded JARVIS, upstream token/tracker/donation stripped.
- Runs under PM2 (`jarvis-palantir` :3000, `jarvis-palantir-intel` :4000), `pm2 save`d.
- Evidence: build green (49 routes), HTTP 200, served `<title>`="JARVIS — Palantir-Class…".

### 2. ONE interactive surface rendering the whole world + live data (not 500 tabs) — ✅ DONE
- MapLibre COP + z-stacked panels; ~50 feed routes.
- Evidence: 8.3k–12.4k flights, 18.6k satellites, live USGS quakes (1s-fresh ts), 6k CCTV;
  confirmed updating in-window (flights 8,330→8,446, CCTV 6,041→6,365).

### 3. JARVIS brain wired into the surface (Foundry + Apollo) — ✅ DONE (verified)
- `/api/jarvis/graph` → real `/v1/graph` ontology (7,031 nodes). FOUNDRY button surfaces it.
- `/api/jarvis/health` → Apollo plane, 4/4 tiers operational.

### 4. Route AIP analyst to local Qwen — ✅ DONE (verified)
- `ai-engine.ts` + `/api/ai/analyze` + `/api/ai/briefing` → `qwen2.5:14b` via Ollama
  OpenAI-compatible endpoint (keyless). Model switch via `QWEN_MODEL` in `palantir/.env`.
- Evidence: POST `/api/ai/analyze` → `model: qwen2.5:14b` + real analyst BLUF.

### 5. JARVIS NEXUS — unify the WHOLE repo into one collective system — 🔄 IN PROGRESS
The repo is ~24 PM2 processes + many ports/proxies that don't see each other. Make them one
interconnected, cross-correlating, self-optimizing system.
- [running] Map full topology (runtime/API/proxy/data/orchestration) — workflow `wf_3ba889ec-7c5`.
- [ ] Phase 1: Service Registry + Event Bus → every service mutually visible + shared event stream.
- [ ] Phase 2: Cross-correlation seam over siloed stores (ontology↔geo↔intel↔vectors↔documents).
- [ ] Phase 3: Unified Orchestrator over existing loops + Nexus operator UI on the :3000 surface.

### 6. Proactive autonomous task engine (this list, self-driven) — ⏳ QUEUED (== Nexus Phase 3 + ledger)
- Persistent task ledger the Nexus reads; works items one-at-a-time to verified completion;
  proposes next items from system state; runs autonomously; human-accessible + interruptible.

---

## MISSED / PARTIAL ITEMS (found in the "check for any missed items" audit)

### 7. Formal written AUDIT deliverable — 🟡 PARTIAL
Original ask sequenced: dissect Osiris fully → dissect my app → blending analysis → gap audit →
2nd-round gap audit → then unify/build. The unify+build is DONE; the WRITTEN audit exists only
in condensed form in `docs/PALANTIR_UNIFICATION.md`.
- [ ] Expand to the full multi-section dissection + blending + two explicit gap-audit rounds.

### 8. "Palantir plan for all countries / cities" coverage — 🟡 FUNCTIONALLY COVERED, no standalone doc
The unified surface covers every country/city functionally: global MapLibre COP + per-country
`region-dossier` (RestCountries + Wikipedia + Wikidata head-of-state) on right-click, plus the
`geo`/`gdelt`/`country-risk` feeds. No separate "all countries/cities" plan document was produced.
- [ ] (Optional) generate a standalone coverage document if a doc artifact is wanted.

### 9. Exhaustive "upgrade Osiris where MY code is better" sweep — 🟡 PARTIAL
Done: JARVIS ontology brain wired in (Foundry), JARVIS health (Apollo), JARVIS Qwen LLM (AIP) —
all replacing weaker Osiris equivalents. Not yet done: a file-by-file sweep confirming every
place Jarvis has a superior implementation has superseded the Osiris one.
- [ ] Systematic blend sweep (covered as part of Nexus cross-correlation, Item 5 Phase 2).

### 10. Honest scope note on "1:1 Palantir clone" — ℹ️ CLARIFIED
Delivered: a **Palantir-class** unified surface (Gotham COP + Foundry ontology + AIP + Apollo).
It is NOT a literal pixel-identical clone of Palantir's proprietary Gotham/Foundry UI, and won't
be claimed as such. The Nexus (Item 5) is what deepens functional parity.

---

## EXECUTION POINTER
**NOW:** Item 5 — Nexus topology mapping (workflow `wf_3ba889ec-7c5` running) → then build Phase 1.
**NEXT:** Item 5 Phase 1 (registry + bus) → Phase 2 (correlation, absorbs Item 9) → Phase 3
(orchestrator + UI, delivers Item 6). Items 7–8 are doc artifacts, done on request or after Item 5.

_Last updated: 2026-06-23._
