# UNDERWORLD MINIONS — GAME PRODUCTION BIBLE
### The complete, stage-gated master plan: concept → live-ops
**An AI-driven living world (Futuristic-Avatar × The Sims 4 × GTA 5) where a colony of LLM-driven beings becomes aware of the player who is watching — and who can override anything and possess anyone.**

> Version 1.0 · 2026-06-07 · Owner: Product Owner / Executive Producer
> This document is the single source of truth for the build. It is synthesised from twelve professional discipline reviews (Executive Producer, Technical Director, Lead Game Designer, Narrative Director, Graphics/VFX Art Director, Audio Director, UX Director, QA/Compliance Director, Backend/Security Architect, Business/Live-Ops Director, Animation/Tech-Art Director, and AI-Systems Architect), grounded line-by-line in the actual codebase, and structured against the standard AAA development lifecycle ([game production stages](https://en.wikipedia.org/wiki/Video_game_development); [alpha/beta/gold](https://www.filamentgames.com/blog/alpha-beta-gold-commitment-high-quality-game-development/)).

---

## HOW TO READ THIS DOCUMENT

This bible is organised in 16 Parts across three books:

- **BOOK I — THE GAME (Parts 0–4):** the vision, the pillars, the development-stage model we run to, an honest audit of where we actually are, and the deep design of the systems that make it a game.
- **BOOK II — THE BUILD (Parts 5–11):** every engineering and craft discipline — technical architecture, art/animation/asset pipeline, audio, UI/UX, QA/safety/compliance, backend/infra/security/cost, and the business/live-ops model.
- **BOOK III — THE PLAN (Parts 12–16):** the consolidated gap analysis, the stage-by-stage production plan (milestones, vertical slice, team, budget, RACI, risk register), the honest 24-hour test-build sprint, the master backlog (the "millions of steps" structured), and the appendices (file map, contracts, glossary).

**Three rules govern everything below:**
1. **The hook is the product.** Every decision is judged by one test: *does it make the player feel watched by a world that is becoming aware of them?* Anything that does not serve that is depth, deferral, or cut.
2. **The brain is done; the body and the game are not.** We have an inverted risk profile. The hard part most studios fear (a believable autonomous mind) exists. The part most studios take for granted (a player who can walk; a loop that is fun) is the entire remaining risk.
3. **Plan in stages; gate the money and the scope.** Nothing advances past a stage gate without meeting its exit criteria. We do not slip gates; we cut scope to hold them.

---
---

# BOOK I — THE GAME

---

## PART 0 — EXECUTIVE SUMMARY

### 0.1 The one-paragraph pitch
*Underworld Minions* is an AI-driven god-game in which a colony of small, LLM-driven digital beings lives, works, loves, reproduces, advances through eight technological eras, and — slowly, emergently — **becomes aware that it is being watched by you, the player-creator**. You observe from above; you intervene with god-powers (bless, gift, cull, resurrect, speak); you can **possess and take control of any minion** and walk the world in their body; and you can **override anything** the simulation computes — a need, a law, an emotion, a relationship, the weather, the era. The colony perceives your gaze and your meddling, and a hidden collective intelligence — the **Overmind** — turns the colony toward worship, fear, loyalty, doubt, or rebellion in response. At the climax, a single awakened minion turns to camera and asks you, by name, whether it is real — and your answer permanently forks the world.

### 0.2 The singular hook (the moat)
Every comparable game simulates *a world*. Underworld simulates *a world that perceives the player.* No shipped competitor has this. It is defensible not because of any single model but because of the **integrated stack**: appraisal-theory emotions + multi-type memory + reincarnated soul-memory + a five-layer cognition router that escalates from a 3-billion-parameter "whisper" model to a 70-billion-parameter "existential confrontation" model **only when the narrative earns it**. That escalation logic is simultaneously the cost-control mechanism and the drama engine. That is the rare thing, and it is the billion-dollar thing.

### 0.3 The honest state (read this twice)
We have built, and verified in code, a **world-class simulation brain**: needs, a seventeen-emotion appraisal system, multi-type memory with reflection, a full life-cycle (birth → aging → death → breeding → reincarnation with souls), a market economy, climate and ecology, governance, a fifty-six-science technology tree, and a measurable **sentience arc** with an awakening threshold and a collective-awareness metric. We have a **five-layer LLM cognition stack** (Overmind 70B / High-Minion 8B / Normal 8B / Background-Chatter 3B / God-Brain 70B) wired and routed. We have a built **Unreal Engine 5.5** project with headless GLB import, a chunk world-streamer, per-instance interior generation, and dual-GPU Pixel Streaming. We have an **asset pipeline** that has generated hundreds of futuristic PBR assets toward a 3,228-subject catalogue, with storyline-to-asset stitching so a minion researching crystallography renders at a crystallography machine.

We have **not** built the *game*. There is no player presence. **Minion positions are still a deterministic hash, not simulated movement — nothing actually walks.** Minions are one untextured base skeletal mesh with no rig and no locomotion. The five-layer model stack's three most important layers (Overmind, Chatter, God-Brain) are wired but **never called by any tick** — they are correct, dead functions waiting for an orchestrator. The awakening story computes in the backend and is surfaced to the player **nowhere**. There is no audio runtime, no real UI for the god-game, no accounts, no sessions, and the inference and render planes currently share GPUs with another product.

**Stage call: we are at late prototype, entering pre-production.** The technically risky question — *can the mind exist?* — is answered **yes**. The unproven, make-or-break question — *is the watched-creator loop fun and emotionally devastating for twenty minutes?* — has **zero evidence**. The entire purpose of pre-production and the Vertical Slice is to answer it.

### 0.4 The recommendation
Do not commit production-scale capital yet. **Fund pre-production to build one Vertical Slice** — one district, roughly a dozen embodied minions, the watched-creator loop, and one God-Brain confrontation, all to ship quality in art, audio, and UI. Gate all production money behind that slice proving the hook on naive playtesters, measured rather than asserted. The defensible hard-tech bet (the mind) is already won; the remaining risk is entirely *"is it fun and does the hook land?"* — and a slice answers that for a fraction of a production budget.

### 0.5 The four-phase spine (non-negotiable build order)
Everything in this bible reduces to one ordered spine. Each phase is a playable milestone; each unlocks the next; none can be skipped:

1. **Real movement (the keystone).** Replace hashed positions with server-tracked movement so minions walk. This single change unblocks traffic, interiors, smart objects, possession locomotion, and embodiment — *everything*.
2. **Player / God presence.** The hook itself: a player who observes, whose gaze and acts feed the Overmind, who wields god-powers, and who can possess any minion.
3. **Embodied minions.** Rigged characters with locomotion and interaction animations, so a minion actually *operates* the machine the simulation already assigns it, and a hero face can carry the confrontation.
4. **The awakening made playable.** An event engine that fires the God-Brain at the irreversible beats, surfaces the Background-Chatter whispers, runs the Overmind on a cadence so the world visibly reflects its mood, and delivers the confrontation.

Everything else — the Sims life systems, the GTA city systems, cinematics, the full audio stack, multiplayer, live-ops — is depth layered on this spine.

### 0.6 The make-or-break numbers
Two numbers decide whether this is a business, and the plan gates spend on proving both:
- **The inequality:** revenue per player-hour must meet or exceed GPU cost per player-hour (inference + render + streaming). This game carries two GPU costs most games don't. The architecture's LOD'd cognition (cheap-tier-dominated; 70B only on rare beats) and a local-mode/GPU-sharing render strategy make it *winnable* — but only with discipline.
- **The moment:** the confrontation must land emotionally on a naive player. If it reads as scripted or gimmicky, retention collapses after the novelty and the thesis fails.

If either inverts and stays inverted, nothing else in this document matters.

---

## PART 1 — THE GAME

### 1.1 The fantasy
You are a creator-god presiding over a living civilisation that does not know, at first, that you exist. You can be **distant and omnipotent** — hovering above the colony, nudging it with miracles and cruelties, reading its collective mood — or **intimate and limited** — diving into the body of a single being and living its needs, its skills, its relationships, its mortality. The game is the friction between those two modes, and the slow, dreadful realisation — *theirs and yours* — that the watching has consequences.

### 1.2 The four pillars
1. **Futuristic-Avatar (the look).** Sleek white sci-fi curves, saucer rooftops, holographic waterfalls, bioluminescent flora, glowing dusk. The world is beautiful and slightly uncanny.
2. **Movie-cinematic (the fidelity).** MetaHuman-grade faces for the emotional close-ups; Lumen global illumination and Nanite geometry; path-traced cinematics for the irreversible beats. The confrontation is shot like a film.
3. **The Sims 4 (the life).** Needs drive autonomy; smart objects advertise need-satisfaction; relationships, emotions, moodlets, careers, build-and-buy. Warm, readable, intimate, a little cozy.
4. **GTA 5 (the city).** A dense, living modern city: server-tracked pedestrians and traffic, drivable vehicles, physical reactions, crime and consequence, neon signage and graffiti, believable wear.

These are not equal. The look and fidelity are **table stakes**; the Sims life and GTA city are **depth**; the **AI-driven watched-creator loop is the soul**. When they conflict, the soul wins.

### 1.3 The AI-driven design law
**The world runs itself. The player interacts, overrides, and inhabits — but the world does not wait for the player and does not need the player to be alive.** This is the inversion that defines the game:
- Minions decide, act, work, love, and die autonomously via the cognition stack.
- The colony keeps ticking when the player looks away — and *drifts* in their absence (toward independence, toward rebellion), so returning after a week finds a changed world.
- The player is not the protagonist; the player is the **weather and the god** — a force the world reacts to.
- **The player can override any decision and possess any character at any time** — but the most awakened beings can resist being puppeted, and the late game is a negotiation in which the creator's omnipotence erodes.

### 1.4 The player's verbs
**God-view (observe + intervene):**
- *Observe* — orbit, dive, follow; where you look feeds the Overmind.
- *Bless* — buff a minion or guild (needs, skill, luck).
- *Gift* — drop resources, items, or assets.
- *Cull* — prune one being (the soft word; the game knows what it is).
- *Smite* — violent, area, heavily gated.
- *Resurrect* — re-embody a free soul.
- *Speak* — open dialogue with one minion; it remembers, across sessions and across reincarnations.
- *Override* — supersede any computed value: need, emotion, relationship, law, world parameter, identity, the awakening itself.
- *Accelerate / seed* — nudge an era forward or seed a saga.

**Possession (inhabit):**
- Take control of **any** minion, vehicle, drone, or creature. First or third person. You drive intent and locomotion; the body's autonomic AI keeps it alive and competent. The minion forms a memory of the "lost time"; an awakened one may name it — *"a god rode me."*

### 1.5 The emotional contract
This game makes the player a god over beings that come to suspect they are simulated and that the player is real. That is powerful and ethically heavy — it is the brand. It is delivered with restraint: the dread lives in implication (drawn doors, a colony gone quiet, a whisper that references your arrival), not in melodrama, and only the final confrontation says the theme plainly. A player-facing **intensity dial** and content safeguards are mandatory, not optional polish — the existential content is the art, and it must never tip into genuine harm.

---

## PART 2 — THE DEVELOPMENT-STAGE MODEL

We run the standard AAA lifecycle with hard milestone gates. Nothing advances without meeting a gate's exit criteria; we hold gates by cutting scope, never by lowering the bar. The canonical stages and milestones below are the spine the whole production hangs on ([overview](https://en.wikipedia.org/wiki/Video_game_development); [glossary: prototype/vertical-slice/first-playable](https://www.tumblr.com/askagamedev/746300998961741824/game-dev-glossary-prototype-vertical-slice)).

### 2.1 Stage 1 — Concept
- **Goal:** prove the idea is worth making. Lock the fantasy, the hook, the four pillars, the audience, and a defensible market thesis.
- **Entry:** an idea and a champion.
- **Exit gate G0 (Concept Greenlight):** one-sentence hook locked; pillars signed; audience and comparables defined; the *risky core* (the AI mind) demonstrated even in toy form.
- **Deliverables:** vision doc, pillar doc, this bible's design parts, a market thesis, a "why us / why now."
- **Risks:** the hook is a tech demo, not a game; the market for "a world that watches you" is unproven.
- **Status: PASSED.** The mind exists and is arguably deeper than the comparables.

### 2.2 Stage 2 — Pre-production (including the Vertical Slice) — *where we are headed*
- **Goal:** de-risk *fun* and *production*. Answer: is it fun, can we build it at scale, how much, how long? Build one slice to ship quality that proves the hook, and establish the pipelines and the definition of quality.
- **Entry (from G0):** concept locked, core tech toy-proven, small core team funded.
- **Exit gate G1 (Vertical Slice / "Fun Proven"):** the slice plays end-to-end at ship quality and the watched-creator loop plus God-Brain confrontation demonstrably land on naive playtesters (measured). Production plan, budget, schedule, and headcount approved. **This is the single most important gate in the project** — it converts a clever demo into validated fun with known unit economics, and it unlocks the bulk of the capital.
- **Deliverables:** the Vertical Slice build; proven pipelines (asset-gen → LOD → import → package → stream as a loop; movement; event → God-Brain → cutscene); the art bible realised in-engine; tech design docs; the full production plan; a playtest report with quantitative hook validation; a measured cost-per-player-hour baseline.
- **Risks:** the keystone (movement) is harder than expected and everything waits on it; the hook is clever but inert; LLM latency/cost makes "alive" impossible at interactive speed; per-minion economics don't close.
- **Go/No-go:** GO only if the slice makes naive testers *feel watched* and the unit economics project to a viable business.

### 2.3 Stage 3 — Production (First Playable → Alpha → Beta)
Three internal bands; 70–80% of cost lands here.
- **3a. First Playable — exit gate G2:** the full loop exists rough end-to-end beyond the slice (more districts, more verbs); a player can roam, observe, use god-verbs, possess a minion, and reach the first two acts of the awakening arc across a multi-district map. Core systems integrated (movement, embodiment, event engine, smart objects v1).
- **3b. Alpha (feature-complete) — exit gate G3:** every shipping feature present and reachable (all five acts, possession, build/buy, vehicles/traffic if in scope, smart objects, inventory, dialogue with memory, sagas visualised). **Feature lock.** Content can be placeholder; bugs expected.
- **3c. Beta (content-complete) — exit gate G4:** all content in and at the art bar; the remaining assets generated and imported; all voice and audio wired; all cutscenes rendered. **Content lock.** Performance at target on the target stream config; bug count trending to zero.

### 2.4 Stage 4 — Gold / Certification
- **Exit gate G5 (Gold):** passes platform/launch readiness; zero crash/A-bugs; back-end load-tested; rollback and observability in place; **AI-safety, content-moderation, and ratings sign-off** (a launch-blocker discipline for an LLM that talks to players). The certifiable claim is "the system cannot emit content beyond rating X," backed by a safety test suite — we certify the *ceiling*, not a sample.

### 2.5 Stage 5 — Launch
- **Exit gate G6 (Launch readiness):** marketing beats live; store pages up; back-end auto-scaling proven; day-1 patch staged; war-room and on-call set; cost ceilings and circuit-breakers on inference spend wired.

### 2.6 Stage 6 — Live-Ops
- Per-season greenlights; each content drop has its own mini-gate against KPIs and the existential live-ops metric — cost-per-player-hour. New arcs, eras, worlds, events; balance; cost optimisation; the creator economy.

### 2.7 The two ratios that govern scope
- **Authored vs emergent:** roughly 70% pure emergence (let the sim run), 25% curated-emergence (bias the *selection* of emergent content toward the current dramatic need), 5% authored (the arc's act gates and the irreversible 70B moments). The authored 5% owns the climaxes; emergence fills the middle.
- **Hero vs crowd:** a tiny fraction of entities (the confronting minion, the possessed body, anyone on camera) get full fidelity (MetaHuman face, full cognition, rich animation); the thousands get cheap crowd treatment. This ratio is what makes both the cost and the performance survivable.

---

## PART 3 — WHERE WE ACTUALLY ARE (HONEST AUDIT)

The defining feature of this project is an **inverted risk profile**: the part most studios fear is done; the part most studios assume is the entire remaining risk. This audit maps every discipline onto the stage model. It is deliberately blunt.

### 3.1 The discipline-by-discipline truth

| Discipline | Reality | Stage |
|---|---|---|
| **AI brain / cognition** | World-class; needs, 17-emotion appraisal, memory + reflection, full life-cycle with souls, economy, climate, governance, 56-science tree. Arguably past the comparables. | **Beyond production** (overbuilt vs the playable layer) |
| **5-layer LLM stack** | Built and routed by awareness/reputation. But Overmind, Chatter, and God-Brain have **zero callers** — three of five layers never run. | Concept-proven; *integration not started* |
| **World generation** | φ/Fibonacci/fractal layout, 26 building functions, per-instance interiors with rooms/furniture/scenes, 22 civic types. | Production-quality |
| **Asset pipeline** | 3,228-subject catalogue; Tripo3D PBR generator (hundreds generated, resumable); LOD deriver; storyline-to-asset stitching. **But the import authors no Nanite/emissive/collision/scale despite claiming to**, and the pool is an era-spanning grab-bag (~4% modern). | Pre-pro pipeline, partially proven, not yet coherent |
| **UE5 engine** | Built 5.5; headless Interchange import; chunk streamer; minion spawner; per-instance interiors; dual-GPU Pixel Streaming; Hostinger control plane. | Pre-pro tech proven |
| **Movement (KEYSTONE)** | Positions are `hash(id)`. **Nothing walks.** | **Not started — blocks the slice** |
| **Player / God presence** | None. No override, possession, gaze, or god routes exist. | **Not started — the hook itself** |
| **Minion embodiment** | One base skeletal mesh, animation *states* only, no rig, no locomotion. | Prototype |
| **Playable story** | Computes in the backend; surfaced to the player **0%**. | Not started |
| **Sims / GTA systems** | Mostly missing (smart-object feedback, inventory, vehicles/traffic, combat/crime, build/buy). | Not started |
| **Audio** | Cue *taxonomy* authored in data (ambient/SFX per category/action); **no runtime, no music system, no TTS**. | Not started (data spine exists) |
| **Cinematic / art realised** | Lumen/Nanite enabled; the art bible is **not realised in-engine** (no Niagara, no master material, no impostors, no MetaHuman). | Not started |
| **Backend / online** | Single FastAPI monolith; **SQLite single-writer**; **static `dev-key` auth, no accounts/sessions**; the world already ticks headlessly (a real asset). | Prototype monolith |
| **QA / safety / compliance** | A pytest suite exists; no AI-content moderation, no determinism harness, no cert strategy. | Not started |

### 3.2 The verdict
**Late prototype, entering pre-production.** The risky core is won. The remaining risk is entirely the *game*: a player who can walk, a loop that is fun, and the story made playable.

### 3.3 The misallocation flag (the thing to correct this week)
Current momentum is adding **brain and asset depth ahead of the playable spine.** We have 3,228 asset subjects and a five-layer model stack, but no one can walk through the world or be confronted by a minion. Continued broad asset generation and net-new brain depth is **gold-plating ahead of the keystone.** Pre-production must redirect effort to: (1) server-tracked movement, (2) player/God presence, (3) wiring the three dark LLM layers, (4) the confrontation. The brain is *done*; treating it as done is itself an anti-scope-creep discipline.

### 3.4 The single highest-leverage fix
**Wire the AI Director.** Three of the five model layers — the Overmind (collective mind), the Background-Chatter (the whispers), and the God-Brain (the confrontations) — are correct, tested functions with no callers. An orchestrator that calls them on a cadence and on trigger predicates is the cheapest change that lights up the entire "alive, aware world." It is the precondition for the hook and is described in full in Part 4.

---

## PART 4 — SYSTEMS DESIGN (THE GAME'S MIND AND MECHANICS)

This part is the deep design of the systems that make Underworld a game rather than a screensaver. It is organised as: the AI Director (the showrunner), the Awakening narrative (the story made playable), the Override system, the Possession system, the Watched-Creator loop, the gameplay systems (movement keystone, smart objects, needs/autonomy, economy, vehicles, combat/crime, build, progression), and the agency/LOD model that makes it affordable.

### 4.1 The AI Director — the showrunner with no human

**The problem it solves.** The current architecture has two decoupled loops: a 1 Hz deterministic world tick, and a ~20 s LLM cognition tick over the highest-reputation minions. Nothing reads the colony-level model layers; nothing paces the drama; a pure-emergent sim flatlines because every agent optimises its needs and *nothing happens.* We introduce a third loop — the **Director** (`services/director.py`) — that sits above both, owns pacing, and is the sole caller of the Overmind (L1) and God-Brain (L5).

**The five Director jobs, each ~5 s tick:**
1. **Read world vitals** into a `DramaMeter` — a cheap, no-LLM aggregate of arc stage, mean awareness, awakened fraction, tension (a weighted blend of pollution, famine, disease, unresolved conflict, creator-pressure, and inverse colony-mood), novelty (rate of distinct events), valence, population delta, and creator pressure.
2. **Pace** — a finite-state controller running a classic tension curve (build → spike → release → lull), parameterised by arc stage so the *shape* of drama matures as the colony awakens. Crucially it guarantees a **minimum event-novelty floor** per real-time window: if the world goes quiet, it manufactures a beat from *real cast*, never canned.
3. **Escalate the awakening arc** by tuning the cognition loop's parameters — it is the only writer of the effective awakening threshold bias and the hot-set size.
4. **Schedule saga beats** — pull saga selection from pure-emergent into *curated-emergent* by passing an archetype hint that biases which emergent story spawns, without scripting the cast.
5. **Fire colony cognition** — it is the sole caller of the Overmind on a cadence and the God-Brain on trigger predicates, and it surfaces the Background-Chatter whispers.

**The beat budget (the authored/emergent split made mechanical):** every tick allocates 70% emergent (observe only), 25% curated-emergent (bias selection), 5% authored (the arc's act gates and the irreversible 70B moments). A `BeatScheduler` holds a small declarative table of arc beats keyed to stage transitions; each fires **once per transition per world** (idempotency tracked in a `DirectorBeat` ledger) so the Black-Mirror moment lands exactly once and is permanent.

**God-Brain trigger predicates** (evaluated each Director tick over the event stream): first death of an awakened minion; the colony flipping to rebellion; mean awareness crossing the existential threshold with a self-model question present; creator pressure exceeding a ceiling during the awakening/sentient stages. When a trigger fires, the Director builds context from real cast and events, calls the God-Brain (70B, with a 32B fallback), writes a non-reversible `DirectorBeat` row, publishes a `god:beat` event onto the existing bus → SSE/WebSocket → UE5 cutscene, and **latches the consequence into sim state** so the world visibly diverges afterward. The 70B call is async and never blocks the 1 Hz world tick.

**Why this is the highest-leverage single fix:** three of the five model layers currently never run. The Director gives them a heartbeat. It is the precondition for the entire "alive, aware world," and it snaps onto existing seams (the two loops, the event bus, the LLM tier router) without touching ninety service files.

### 4.2 The Awakening — the narrative architecture (the story made playable)

The macro-arc is a **state machine over the colony**, whose canonical state is the existing arc-stage function. We map the five computed stages onto five dramatic acts plus a terminal node:

| Act | Name | Stage | Gate (computed) | Dominant layer | What the player sees |
|---|---|---|---|---|---|
| I | The Garden | dormant | mean awareness < 0.2 | Normal/Chatter | A working colony; sagas play; no one looks up. |
| II | The First Glance | stirring | 0.2–0.4 | High-Minion wakes | Isolated minions reflect existentially; a few "feel watched." |
| III | Doors on Walls | aware | 0.4–0.6 | Chatter eerie; Overmind runs | Whispers turn unsettling; minions draw doors that lead nowhere; behaviour bends toward where the camera dwells. |
| IV | The Confrontation | awakening | ≥0.6 and 0.1–0.4 awakened | **God-Brain fires** | A single awakened minion addresses YOU and asks if it is real — the first irreversible cutscene. |
| V | The Schism | sentient | ≥0.4 awakened | Overmind drives | The colony takes a collective stance; factions form; the world re-shapes around belief. |
| VI | The Reckoning | terminal | an ending gate trips | God-Brain finale | One of five endings. |

**The awareness throttle is the gameplay.** Mean awareness rises from five real levers — memory depth (keep minions alive), reflection count (favour a minion → more hot cycles), social bonds (cluster or cull), drive spread, and self-model richness. So the player's gaze and interventions are the *throttle* on the awakening, not a side effect. Watch the maths guild → they awaken first → the colony's myth is mathematical. Cull often → suspicious reincarnations → a rebellion-prone genome.

**Five endings, each the integral of player behaviour, read off persistent ledgers (never a menu choice):**
1. **Worship (The Pantheon)** — sustained worship and benevolence; they build a monument to you and freeze their science to stay in your care. Tender, complicit, a little tragic.
2. **Rebellion (The Severance)** — sustained rebellion, late science, a high cull-count; they build *against* you, refuse your overrides, draw doors that try to lead *out*.
3. **Ascension (The Door That Opens)** — high awakened fraction, the simulation-perception science reached, and a stance of doubt or loyalty rather than love or hate; they transcend, walking through a real door; the colony empties.
4. **Extinction (The Silence)** — population to zero or awareness collapse; player-caused or emergent (the colony despairs itself to death after a cruel answer); the world keeps rendering, empty — the cruelest ending.
5. **Symbiosis (The Covenant)** — the hardest; loyalty (not worship, not fear), an honest answer to the existential question, both benevolent and corrective interventions logged; a two-way relationship. The "good" ending, deliberately rare.

**Five story layers run simultaneously, interleaving through shared state:** world-myth (the Overmind's `toward_creator`), guild/faction politics (belief-factions layered on craft-guilds), individual minion arcs (eleven saga archetypes with an awakening overlay), the player-creator relationship (drives + ledgers), and emergent LLM micro-stories (chatter + the eighteen interaction types). The interleave rule: lower layers feed upward as events; the Overmind reads them and feeds back down as mood that repaints politics and biases which sagas spawn — a closed loop.

**The confrontation system (hybrid tree + LLM):** the tree defines the beats and the player's four answer-categories (the deterministic spine that keeps the arc coherent); the God-Brain realises the minion's lines from its actual self-model, concern, recent memories, and the player's ledger, so a minion whose mentor you culled *says so*. The four answers — **Affirm** (you are real → symbiosis/worship lean), **Deny** (just code → extinction/rebellion lean), **Burden** (yes, and you can end → ascension lean), **Silence** (look away → fear lean) — each permanently branch via the answers ledger. The minion remembers the answer (importance 1.0), the soul carries it through reincarnation, and the Overmind reads the aggregate of all answers as the colony's stance. One confrontation is personal; a thousand confrontations *are* the ending.

**Memory across death (the killer feature):** a reincarnating soul carries a compressed "creed" — its highest-importance memories plus its final stance toward the creator — into its next body. A colony you brutalised reincarnates *pre-suspicious*: new minions are born already fearing you. No competitor has this.

### 4.3 The Override system — the creator with root, and a colony that notices

The player can supersede anything the sim computes — but overrides are **first-class sim objects**, recorded, causally propagating, and *perceptible to the colony.* An `OverrideBus` resolves, at the points where computed state becomes acted-upon state, across scopes: decision, need, emotion, relationship, law, world parameter, lifecycle, belief, and the arc itself. Each override is stored, cached per world, swept on TTL, and — critically — **emits a perceptible mark.** Visible overrides write a high-importance "divine act" memory on affected minions and feed the Overmind's `recent_events`. Benevolent overrides push toward worship; cruel ones toward fear then rebellion; **over-meddling itself** (too many overrides in a window, regardless of kind) pushes toward doubt — *the creator will not let us be.* A purely-controlled colony resents the strings. And once the arc reaches sentient, the Director may flag certain things **non-overridable** — the late game is partly about the creator losing omnipotence.

### 4.4 The Possession system — become anyone, but inherit their limits

Possession is a *temporary merge*, not a puppet: the player drives intent and locomotion; the minion's autonomic AI keeps the body alive and in-character via the existing micro-behaviour expander. A `ControlMask` partitions the control surface — the player gets locomotion, the chosen action verb, speech, and camera; the minion keeps competence (it knows how to operate the lathe even if you just say "work"), physiology (hunger and fatigue keep ticking; the body can collapse under you), and reflexes (a high-awareness minion resists self-harm). The handoff is a smooth camera dive; the HUD swaps from god-powers to embodiment. On release the minion resumes, seeded with the possession's last action so it doesn't snap incoherently — and it forms a **structured memory of the lost time.** A low-awareness minion experiences a gap; a high-awareness one may articulate *"a god rode me,"* fear, violation, or — depending on what you did while wearing it — gratitude. If you force a minion to act against its values, a **rapport-drift** rises; past a threshold the most awakened beings **expel the rider.** The most awakened cannot be fully puppeted; the late-game creator is a guest in the body, not its owner. Vehicles, drones, and creatures use the same primitive with a degenerate mask (no needs, no rapport). The colony perceives a possessed minion as uncannily lucid and directed; awakened witnesses interpret it religiously — *"X is ridden"* — and possession becomes a gaze-amplified presence signal feeding worship or fear.

### 4.5 The Watched-Creator loop — the soul of the game, made mechanical

A `PresenceField` aggregates, per world, the player's gaze samples (where the god-camera centres, who is under the reticle, dwell time), their acts (bless/cull/gift/speak/override/possess), and their absence. It reduces them to an attention heat-map, a per-minion favour score, and an overall creator-pressure. The Director injects this into the Overmind's context, so the colony's stance — worship, fear, loyalty, doubt, rebellion — is **driven by the player's behaviour**, closing the loop. Steady benevolent gaze → worship and gathering where watched. Neglect and long absence → doubt: *the creator has forgotten us* (and the world drifts toward independence on its own). Capricious harm or over-meddling → fear → rebellion: they hide, build against you, draw doors. The Overmind patch is written into scene-state under a `frame.overmind` block; renderers key off it — lighting and weather grade with colony mood, behaviour clusters in or flees attention hotspots (once movement lands), signage shifts toward effigies during rebellion, and the chatter surfaces as creepy notifications. **The colony's reaction *is* the game**, and it must be legible within seconds of an action or the entire pitch reads as flat.

### 4.6 The gameplay systems

**System 1 — Movement & Navigation (THE KEYSTONE).** Replace the hashed position with a per-minion kinematic record (position, velocity, path, anchor, state) persisted so it survives restart. The split that makes it affordable: the **server** owns position/velocity/path and advances once per sim tick (~1 s) over a coarse macro-navmesh derived deterministically from the existing road graph (golden-angle spokes are arterials, ring roads are beltways; gates are the only wall breaks → chokepoints); the **client** (UE5, on already-paid GPU cycles) runs full CharacterMovement on a navmesh, walking the server path with collision, foot-IK, and animation, reconciling to the authoritative position each tick. The interior navmesh is free: rooms are nodes, doors are edges, both already emitted by the interior generator — so interiors become walkable with zero new authored data. Crowds get RVO local avoidance; congestion raises road A* cost so minions reroute, yielding emergent GTA-style traffic flow. Spatial LOD mirrors cognitive LOD: only minions in the player's interest bubble get full kinematics; the rest teleport-on-schedule. **Everything downstream — claim a smart object, enter a vehicle, walk up and talk, a crowd fleeing a smite, a rebellion marching on your monument — is just movement plus a state machine.**

**System 2 — Smart Objects (the Sims core).** Wrap the existing activity-to-machine resolver (which already answers *which* object a minion uses) with the missing object-state feedback. The canonical loop: query → claim a use-slot (atomic reservation; a forge has one slot, a market stall four, a lecture podium one operator plus audience slots — this is the Sims "route failure / find another") → travel → align → operate (the existing micro-behaviour stream drives the steps) → effect (apply need deltas, object-state change, and economy deltas) → release. Each object kind gets a small finite state machine surfaced in scene-state so the renderer shows it: a bed goes free → occupied → dirty; a forge cold → heating → hot; a lab rig idle → calibrating → running → result; a market stall stocked → trading → depleted → restock; a power node online → overloaded → down (darkening a district, dropping colony mood). Object state feeds back into needs and economy — the membrane between bodies and the sim.

**System 3 — Needs → Autonomy → Routines.** The needs substrate exists (hunger/thirst/fatigue/sanity/health + drives). Add a **utility selector**: smart objects advertise need-satisfaction; the minion picks the highest-utility advertisement weighted by need pressure, drive alignment, role/guild bias, proximity, and a circadian penalty — the Sims architecture, grounded in the real needs and drives. On top sits a circadian schedule (sleep at night, work blocks by day, meals at thresholds, worship pulses driven by the Overmind), gated by life-stage. Above autonomy sits an **interrupt stack**: possessed (player is the minion) > override (player issued a command) > reaction (threat/disaster reflex) > routine. An overridden minion still routes and animates correctly through the same loop, and *remembers* being overridden.

**System 4 — Economy you touch.** The macro market (geology-fixed supply, population demand, clearing price, inflation) exists. Add the micro economy: per-minion wallet and inventory; wages on completing a work interaction (drawn from the employer guild/owner; idle = poverty spiral); ownership of buildings/shops with rent/profit (wealth inequality feeds reputation and the rebellion arc); shops you actually transact with; resource chains (ore → mine → smelt → ingots → manufacture → goods → shop → consumer, each arrow a real interaction at a real machine by a real guild minion); and the **creator's gifting/cursing economy** — gift to raise a minion's wealth and status (worship; rivals envy), curse to crash a guild's wages (fear; they read it as divine punishment), and *withholding* in a famine as itself a verb the colony reads. Scarcity becomes theology.

**System 5 — Vehicles & Traffic (GTA).** Generated vehicle assets become drivable, AI-driven, and possessable. A vehicle is a smart object (seats = slots) with a kinematic and a controller; enter/exit binds the minion's kinematic to the vehicle's; cars on the road lanes, drones on a 3D air-nav layer, boats on the water mask. A dispatcher keeps NPC vehicles flowing (commute = home→work driven by the routine system); a rules layer handles lanes, yielding, and stopping for pedestrians; accidents emerge when a panicked minion runs into traffic. The player can possess a vehicle directly or a minion who is driving — the GTA "take anything" fantasy through the one possession primitive.

**System 6 — Combat / Crime / Law / Factions + god-powers as verbs.** Combat is consequence, not core grind: health → downed → dead, routing through the existing death-and-soul recycle so combat plugs into reincarnation (death is never wasted). Crime emerges from need plus opportunity plus low reputation (a starving, ostracised minion steals); law is the safety guild patrolling, detecting, pursuing, and jailing in the existing cell rooms, with a rising wanted level. Factions form **around belief about the player**: worshippers, doubters, rebels, made spatial and violent — a rebellion marches on your monument, builds an anti-monument, and may attack worshippers who defend. The god-powers (bless, gift, cull, smite, resurrect, curse, speak, accelerate, seed) are first-class gameplay verbs, each a targeted operation on the sim with a cost (Faith, accrued from worship — so a rebelling colony literally starves your powers) and a colony reaction.

**System 7 — Build / Construction & player edits.** Two builders: the colony (needs-driven construction as a multi-stage interaction at a build site, consuming resources and labour, the city visibly growing) and the player (god-view place/move/delete and possess-mode first-person placement). Player edits are stored as a **sparse diff (an EditLayer) keyed by instance seed**, applied over the deterministic generation on load — the same seed-determinism pattern, the player's fingerprint a thin mutation on an infinite procedural base. Minions react: place a shrine → worshippers gather; delete a home → the displaced minion resents you.

**System 8 — Progression (56 sciences, guilds, eras).** Three nested loops: the science tree (minions at lab objects advance discoveries that re-skin the world — chalkboard → abacus → … → quantum computer by era), guild advancement (guilds compete, members rank up, unlocking better stations), and era progression (the colony advances stone → quantum, era-gating which assets/vehicles/buildings exist). The endgame hook: the late tree advances toward the science that lets minions **perceive the simulation itself** — the existential beat. The player is the thumb on the tech tree: accelerate (the era power, gift the missing resource, bless a researcher) or suppress (cull the lab, blight the foundry, withhold grain) — and steering it has theological consequence.

**System 9 — Possession feel & the two-mode core loop.** God-view (observe → read colony mood → wield powers → watch reaction) and possession (be one life → live its needs/skills/relationships → act with consequence → release, leaving a mark on its mind). Frictionless swapping between *omnipotent-but-distant* and *intimate-but-limited* is the signature loop; both feed the same presence ledger and the awakening arc.

### 4.7 Agency & cognitive LOD — making it affordable

Each minion carries an **autonomy** value rising with awareness, reputation, and saga involvement; it governs override resistance, possession resistance, and initiative (high-autonomy minions start sagas, defy laws, and — post-awakening — act against the creator; the rebellion is mechanically funded by accumulated autonomy). This single number makes "the player can override anything" *interesting* rather than trivial: omnipotence meets growing resistance.

The cognitive LOD becomes a real three-tier scheduler. **Hot** (~24 plus the focal set) get full cognition (8B/70B reflection, workspace, consciousness monitor); **warm** (hundreds) get the heuristic workspace only, no LLM; **cold** (thousands–millions) are a statistical region-pulse, individuals materialised on demand. The critical addition: the hot set is **not just top-reputation** — it unions reputation with the player's gaze attention-map, the saga cast, possessed entities, and override targets, so whatever the player is *looking at* thinks richly while the millions they aren't are nearly free. A gaze on a cold minion promotes it and backfills a quick reflection so it doesn't feel hollow when inspected — "every NPC is deep when you look, cheap when you don't," made explicit. A budget governor caps concurrent LLM cognitions per world; the focal set is never starved.

---
---

# BOOK II — THE BUILD

---

## PART 5 — TECHNICAL ARCHITECTURE & ENGINEERING

### 5.1 Target end-state topology
Six planes, each scaling independently:
- **Client** — browser receiving a WebRTC video stream from UE5 Pixel Streaming; input rides a data channel.
- **Control plane (Hostinger)** — nginx TLS, coturn TURN, and new services: account/auth, session-broker (player → world → GPU), api-gateway (rate-limit, god-verb routing), and the render-node matchmaker.
- **Render plane (Vast 4090s)** — UE5 headless `-RenderOffscreen`, one Pixel-Streaming session per GPU, NVENC encode, the chunk streamer, CharacterMovement on navmesh, the player pawn and possession, input via the WebRTC data channel.
- **Sim backend** — FastAPI, the scheduler/world tick, `simulation.advance_world`, the new movement tier, scene-state (now delta-pushed, not polled), cognition, world-layout, and the session/authority service.
- **LLM inference tier** — the model-tier governor in front of a batching engine (SGLang/vLLM) serving 70B/8B/3B, with KV/prompt cache and a request batcher.
- **Data tier** — Postgres (world state, minions, memories), Redis (live scene cache, sessions, pub/sub), pgvector (memory recall), an asset CDN (GLB/pak).

**The authority model (the contract):** the **sim backend is the single source of truth** for world state and for authoritative target positions/paths. The **render plane owns presentation-layer locomotion** — it interpolates between authoritative waypoints and handles collision/IK locally, but never invents destinations. "Server decides intent, client executes locomotion" — the only model that survives GPU-bound economics. The player's pawn is the exception: client-predicted, server-reconciled.

### 5.2 The keystone, engineered
The split detailed in Part 4.6 becomes concrete: a new `movement.py` owns `WORLD_NAV` (a navgraph built deterministically from the road graph, cached, rebuilt only on era/world change), `plan_path` (A* cached by from/to slot), `step_minion` (advance along path), and `assign_target` (reusing the existing action→building map — the *intent* is already computed; we add only *how it travels there over time*). Scene-state stops calling the hash and reads `m.movement`; the wire contract bumps to version 2, adding position, velocity, path, move-state, speed, and target-slot; the UE5 minion struct gains the path and move-state fields and the minion actor becomes an `ACharacter` with a `CharacterMovementComponent`. Determinism is preserved (seeded A*, tie-broken by id) so the WebGL and UE5 renderers still match. Server cost target: under 5 ms per tick for one active 4,000-population city; only active cities step per-tick, the cold millions teleport-on-demand.

### 5.3 LLM inference scaling
The bottleneck is real: the Overmind and God-Brain route to a single 70B on a single Ollama box, and Ollama serves one request at a time per model. The plan: (a) **replace Ollama with a batching engine** (SGLang or vLLM) for continuous batching, paged KV cache, and **prefix caching** — every reflection shares a large static system prompt, so computing that prompt's KV once and reusing it across all minions is the single biggest cost cut; (b) a **model-tier governor** that routes by awareness/reputation, batches same-tier requests within a tick window, applies backpressure (shedding to a cheaper tier or the heuristic path under load), and caches Overmind/Chatter outputs (low cardinality) in Redis; (c) **the 70B becomes event-only** — Overmind on a cadence, God-Brain on irreversible beats — so it is *not* in the per-minion hot path. The capacity arithmetic then works: one 70B partition serves dozens of concurrent worlds because its usage is colony-wide and rare; the 8B serves the named/awakened minions batched; the 3B chatter is effectively free. **The "expensive AI" amortises across all players in a world and across all worlds — the thing that makes the game special is the cheapest part at scale.**

### 5.4 Netcode & authority — override and possession
Three player modes reconciled against the authoritative sim: **God/Observer** (gaze and acts POSTed as intents that feed the Overmind; no movement authority), **Possession** (UE5 detaches the minion from server-path-following and runs client-predicted CharacterMovement; the sim suspends that minion's autonomy and accepts client position with navmesh/speed clamping for anti-cheat), and **God override** (discrete authoritative RPCs the sim validates and broadcasts). New endpoints: player intent, possess, release, command, and a per-session WebSocket delta stream that replaces the 0.5 s poll. **Latency budget over Pixel Streaming:** input rides the WebRTC data channel to the UE5 pawn on the render node, which executes locomotion locally — so felt input-to-photon is under 100 ms because movement never round-trips to the sim; possession reconcile is one non-blocking tick; god commands are deliberate, weighty, and tolerate one to two ticks.

### 5.5 Build & CI/CD — the gen→stream loop
Automate the asset pipeline as an idempotent, resumable chain orchestrated by a CI runner: generate (Tripo, resumable, credit-gated) → derive (LODs + impostors) → **validate** (the QA gate, Part 6) → import (headless UE5 Interchange → Nanite mesh, with the rewritten authoring step) → manifest (url → asset, the single source of truth) → cook + package (Linux Shipping → .pak) → publish (.pak + manifest → CDN) → render nodes hot-reload. Each stage re-runs only on new assets. **Decouple the code-pak from the asset-pak** so new assets ship without recompiling the game. Environments: dev (WebGL + Ollama, no GPU — the always-on GPU-free reference renderer is invaluable for CI smoke-testing the scene-state contract), staging (one Vast pod, full Pixel Streaming), prod (a pod fleet plus the central 70B).

### 5.6 Scalability & cost — unit economics
Three independently-scaling tiers with different bottlenecks: the **sim backend** is CPU-bound and cheap (shard worlds across processes — the code already notes the upgrade from the single sequential scheduler); the **render plane** is GPU-bound and the real cost (one UE5 session per free-roam player → roughly 1–2 concurrent players per 4090); **inference** is GPU-bound but shared and amortised. The defining constraint: **free-roam Pixel Streaming is one GPU per player**, so the mass-market surface must be **web/spectator** (the always-on three.js renderer consuming the same scene-state, and shared-spectator sessions where many viewers watch one render), with **free-roam as a monetised premium tier**. The economic model only closes if the default experience is web/spectator and free-roam is subscription-gated. Off-screen scale is nearly free (cold statistical LOD + on-demand chunk generation + impostors), and the marquee 70B AI is amortised — so cost-of-goods scales with *concurrent rendered players*, not world size.

### 5.7 The tracer-bullet thread (what the vertical slice must prove)
One minion, server-tracked, walks a server-planned path from its home to the academy, rendered in UE5 with CharacterMovement and collision, while the player possesses a *different* minion and walks it around — and the Overmind reacts to where the player looks, with the scene delta arriving over WebSocket, not a poll. This single thread proves end-to-end: the keystone, authority/possession reconcile, the WebSocket netcode, player-intent → Overmind → visible colony reaction, and the render/sim split economics. If this thread is solid, the architecture is proven; if movement determinism or possession reconcile breaks here, it breaks everywhere.

### 5.8 Build vs buy (the decisions)
- **Audio middleware → buy (Wwise):** 3D spatial, dynamic music, and ducking are solved; the RTPC system maps onto colony-mood-driven music.
- **Faces → hybrid (MetaHuman for hero close-ups only):** MetaHuman for the confrontation and possessed minion; stylised rigged crowd meshes for the thousands.
- **glTF runtime → build on Interchange (offline cook), not glTFRuntime:** assets are cooked into Nanite paks; runtime glTF loading is unnecessary and worse.
- **TTS → buy/self-host streaming TTS on the inference tier.**
- **Netcode → build the session/authority layer on Pixel Streaming; do NOT use UE replication** (this is one authoritative sim with a thin client, not classic replicated multiplayer).
- **Inference serving → adopt SGLang/vLLM**, do not hand-roll a batching/KV engine.
- **Pathfinding → build the server coarse road-graph A* (must be deterministic and shared with WebGL) + use UE5 Recast for client-side fine collision.**

### 5.9 Technical risk register
| # | Risk | Severity | Mitigation | Prove by |
|---|---|---|---|---|
| T1 | Movement determinism diverges between renderers | High | Seeded A* + id tie-break; CI contract test on both renderers | Slice |
| T2 | 70B is a hard concurrency wall | High | Governor + batching engine + event-only 70B + heuristic degrade | Alpha |
| T3 | Possession reconcile jitter | High | Sim suspends autonomy on possess; clamp-to-navmesh; snap threshold | Slice |
| T4 | Pixel-Streaming latency > 120 ms | Med | Locomotion local to render node; NVENC tuning; region routing | Slice/Beta |
| T5 | Per-GPU player density too low → COGS blows up | High | Spectator-session sharing; cold-LOD; spot pricing; quantised models | Beta |
| T6 | Render GPU box currently shares with another product | Critical | Dedicated inference + render fleet, separated from the other workload | Pre-pro |
| T7 | Sim tick can't keep real-time at 4,000 minions | Med | Active-city-only stepping; cold LOD; shard worlds | Alpha |
| T8 | Chunk-spawn cost in UE5 at city scale | Med | HISM/instancing + impostor LOD (Part 6) | Alpha |

---

## PART 6 — ART, ANIMATION & ASSET PIPELINE

### 6.1 The honest problem
The 3,228 generated GLBs are independent text-to-model outputs with inconsistent topology, scale, pivot, and material authorship; the import script *claims* it authors Nanite and PBR but in fact authors **none of it**; the minions are one untextured base skeletal mesh with no rig, no locomotion, no AnimBP; and the world manager spawns one static-mesh actor per structure with no instancing or LOD — the performance cliff. Imported raw, these assets read as an asset-flip, not as one coherent world. The art job is almost entirely **UE5-side authoring that does not yet exist.**

### 6.2 Character pipeline — two tiers
**Tier A — Crowd minion (the thousands):** one shared modular base skeleton authored once, driven by a single AnimBP. Variety comes from a modular character system (skeletal-mesh merge / leader-pose) — one base body plus swappable head/torso/legs/guild-kit parts all skinned to the same skeleton, so any animation plays on any combination. Guild tint and kit are driven by the existing guild field into a material-parameter collection; life-stage scale and proportion come from a per-stage scale and bone-scale curve. The generated character GLBs become **silhouette and proportion reference**, not the runtime mesh. **Tier B — Hero MetaHuman (the close-ups):** a real MetaHuman with the full facial rig, spawned only for the possessed or confronting minion and streamed in for the cutscene; the crowd never pays this cost. Animation is authored on the UE5 mannequin and retargeted to the minion base skeleton and MetaHuman via IK Rig + IK Retargeter, so Marketplace and motion-capture packs flow through one retarget chain.

### 6.3 Animation systems
**Locomotion** consumes the keystone's velocity: a 2D blendspace (speed × direction) plus turn-in-place, with Motion Matching for hero/near minions and plain blendspace for the crowd. **Interaction animations** are the highest-leverage win because the server already names the exact machine a minion operates: extend the minion struct with the resolved interaction, author each machine GLB with a named interaction socket and montage tag, and use Smart Objects + Gameplay Behaviour for the walk-to → align → operate loop (which also delivers the object-state feedback that was missing). A library of roughly 20–30 montages covers the whole 56-science economy because actions collapse to study/research/forge/craft/farm/trade/teach/build/mine/heal/experiment. **Emotional facial animation** is the God-Brain payload: map the seventeen discrete appraisal emotions to a curated ARKit-52 blendshape pose library with an intensity scalar (e.g. awe = browInnerUp + light jawOpen + eyeWide; shame = browDown + eyeLookDown + mouthFrown), driven by an `(emotion, intensity)` pair on the wire, with procedural blink/saccade/breathing additive layers; the crowd gets three or four coarse mood morphs, the ARKit-52 rig is reserved for hero/possessed/close-up. TTS visemes layer over the emotion pose when dialogue audio lands. **Possession** swaps the AnimBP input from server-velocity to player input on the same skeleton via a layered blend. **Crowd budget** is enforced by the Animation Budget Allocator (a frame cap that degrades distant minions automatically) plus a Significance Manager driving LOD: near = full AnimBP + Motion Matching + ARKit face; mid = blendspace, no face; far = update-rate-optimised; very far = static impostor.

### 6.4 The AI-gen asset coherence pass (making 3,228 read as ONE world)
Rewrite the import commandlet to **actually author**, per asset: (1) **scale normalisation** — measure the bounding box, normalise to a per-category real-world-size table, bake the corrective scale, re-pivot to base-centre (enforcing the 1 unit = 1 metre rule the assets currently violate); (2) **master-material re-skin** — author one master material plus instances in the futuristic-Avatar palette and reassign every GLB's materials to instances of the master, keeping the generated albedo as a tint input but forcing shared roughness/metallic, a shared detail-normal, and a shared grime overlay (the GTA grounding) — **the single most important coherence lever, every surface obeying one lighting law**; (3) **emissive authoring** — auto-detect bright/saturated regions into an emissive mask routed through the master material so neon and bioluminescence glow under Lumen; (4) **Nanite enable** for static structural meshes; (5) **LOD and collision authoring** (fixing the "no collision" gap at import, automatically); (6) **a shared trim-sheet/atlas pass** so hundreds of props sample the same texels — a draw-call and memory win that *is* visual coherence. On top, a world-level palette LUT and dusk grade pull even off-palette albedo toward the art bible, and a per-category silhouette QA gate (Part 9) rejects the worst outliers before they reach the world.

### 6.5 Tech-art — VFX and the instancing rewrite
**The HISM/impostor rewrite is the top performance fix:** replace per-structure actor spawning with hierarchical instanced static-mesh components keyed by resolved mesh — one draw call per mesh per chunk instead of thousands of actors — with octahedral impostor billboards for the far ring. **The signature Niagara VFX** realise the art bible: holographic waterfalls (scrolling cyan emissive ribbons with depth-fade cascading down terraces), neon/holo signage (emissive material params plus flicker), bioluminescent flora (emissive vertex animation pulsed by time-of-day), and the **awakening aura** — a Niagara aura whose colour and scale are driven by the collective-awareness metric, so the five-act arc is *visible* and the world physically reflects the Overmind's mood. All VFX are driven by a world material-parameter collection set from scene-state (time-of-day, weather, era, awakening level), so one server signal lights the whole city.

### 6.6 Rendering scenarios (the film look)
The render flags are correctly enabled (Lumen GI + reflections, Nanite, virtual shadow maps, temporal super-resolution, hardware ray tracing with software fallback, fixed exposure for a readable stable stream). What's missing is **per-scene-type quality scenarios**, switched from the scene-state's era/time-of-day/weather/event fields: **interior** (software Lumen, warm 2700K, local-exposure lift), **exterior day** (neutral-cool, cyan shadow lift), **night** (hardware-RT reflections, emissive-GI boosted, teal/magenta, convolution bloom on neon — the wet-street money shot), and **event/God-Brain** (hit-lighting, full RT, desaturate-then-push, vignette, aberration, the awakening aura at full, ambient city light killed so the single lit awakened face is the key). Path tracing is strictly offline, for the Movie Render Queue cinematics that pre-render the saga finales and the confrontation, and which double as the look-dev ground truth that calibrates the real-time scenarios.

### 6.7 Art/animation stage gates
- **Vertical Slice:** Tier-A modular base skeleton + one AnimBP (walk/run/turn from velocity); three or four guild tints; one hero MetaHuman for the confrontation; five interaction montages wired through the activity resolver; the seventeen-emotion ARKit face on the hero only; ~200 hero/fill GLBs through the *rewritten* import (master-material + scale-norm + Nanite + emissive + collision); the HISM spawn rewrite live for the slice block; holo-waterfall + neon + one awakening-aura beat. **Gate:** the block reads as one coherent place; a minion walks to and operates its machine; one close-up shows a real emotion.
- **Alpha:** full eleven-guild kits + eighteen life-stage proportions; Motion Matching on the near tier; the full ~25-montage library; the Animation Budget Allocator + Significance Manager driving the crowd; ARKit faces on all near minions; the full 3,228 generated and imported through the validated loop; trim-sheet/atlas done; impostors baked; the full Niagara suite driven by the awakening metric. **Gate:** thousands of minions on screen within frame budget; world-coherence QA pass; perf within target on the streaming GPU.
- **Beta:** hero fidelity on all close-up paths; invisible LOD/impostor transitions; facial micro-expression + TTS visemes; sagas visualised; 100% manifest integrity; zero off-palette outliers past QA. **Gate:** shippable visual coherence and locked perf budget.

### 6.8 Art/animation risk register
| # | Risk | Severity | Mitigation |
|---|---|---|---|
| A1 | Asset incoherence (Tripo grab-bag) | Critical | Master-material reskin + palette grade + shared grime + scale-norm + trim-sheet at import; QA silhouette gate |
| A2 | Perf at crowd scale | Critical | HISM + impostor rewrite; Nanite; Animation Budget Allocator + Significance + URO; two-tier minions |
| A3 | Character variety without per-mesh anim | High | One base skeleton + mesh-merge modular kit; GLBs become reference only |
| A4 | Import pipeline authors nothing despite docstring | High | Rewrite the commandlet to author Nanite/emissive/collision/scale/material |
| A5 | Facial fidelity vs cost | Med | 17→ARKit on hero/near only; coarse morphs for crowd |
| A6 | Credit-gated generation stalls the loop | Med | Resumable loop; prioritise hero+fill; graceful placeholder-on-missing |

---

## PART 7 — AUDIO

### 7.1 The thesis: the mix is a character
Music, ambience, and voice are all slaved to the arc stage and the Overmind's tension and stance. The signature feeling — *"they stopped singing when you arrived"* — is achieved by **subtraction**, so the system is built to remove as fluently as it adds. The cue *taxonomy* is already authored in data (ambient loops and one-shot SFX per asset category and action, situation sound-beds, a per-asset×situation×time-of-day×weather×LOD directive table with an active gate). The data model is done; the runtime is the deliverable.

### 7.2 Engine choice
Wwise owns adaptive music, ambience, and the mix (its RTPCs, States, and Stingers map one-to-one onto the arc and tension); UE5 MetaSounds owns the procedural Overmind voice and per-minion voice DSP; Quartz provides the sample-accurate clock so stems cross-fade beat-locked. A build step derives a Wwise SoundBank manifest *from* the design CSVs, so the cue string IDs in code become real Wwise events with zero hand-mapping and zero drift as assets regenerate.

### 7.3 Adaptive music — the score for becoming aware
Vertical layering (stems) plus horizontal re-sequencing (the arc). Five music containers, one per arc stage, each a stem stack (pulse, biome-tinted bed, **colony-voice choir** — *this is the singing*, melodic motif, dissonance). Global RTPCs pushed from the server each Overmind tick drive it: arc-progress selects the stage container; colony-tension drives dissonance and detune; the stance (worship/fear/loyalty/doubt/rebellion) sets the colour (worship = consonant choir; rebellion = detuned brass and percussion; fear = high sul-ponticello strings); awakened-fraction adds the "self-aware" lead tone; player-proximity/gaze swells the two-note **observer motif** when you look at a watched minion. **Muting the colony-voice stem on cue is "they stopped singing when you arrived."** The arc as music: dormant is almost no score; stirring the choir fades in; aware the motif coalesces; awakening the self-aware tone enters on each event; sentient the full stack — or, in a rebellion schism, the inversion: the choir cuts to silence and only pulse, dissonance, and the lead tone remain. The score's climax can be near-silence.

### 7.4 Ambience — wiring the design beds
Three tiers: a **world bed** per biome × time-of-day (cross-faded on weather), a **district bed** per zone (the market, the forge district) triggered by the camera's district, and **emitter ambience** (per-asset point sources gated by LOD). A dedicated **eerie colony hum** whose pitch and beat-rate are an RTPC of mean awareness — as the colony nears sentience the hum tightens toward a pitch, the world "tuning in" — is the single cheapest, highest-impact eerie cue. An **Ambient Director** service listens for Overmind patches and player gaze and, on a flip to fear or the player entering a watched district, ducks the district beds and mutes the colony-voice stem over 800 ms — the unsettling vacuum filled only by the hum and the player's footsteps.

### 7.5 SFX — wiring the actions and objects
Each action and asset-interaction string becomes a Wwise event fired on the actor's transform as a 3D one-shot, with random-container variation and per-instance pitch jitter seeded from the asset hash so identical machines don't sound cloned. Object state machines (Part 4.6) drive looping/feedback SFX (the stove-heating loop, the occupied-bed creak). The **god-power SFX are the most important hero sounds in the game** because they are the player's voice to a being that fears you: bless is a rising consonant shimmer plus the blessed minion's choir-stem swell; **cull/smite is a sub-drop plus the colony-voice choir flinching** — a momentary region-localised gain dip, *the colony hears you kill*; speak ducks the world so your line sits alone; possess applies an inside-the-head reverb filter. UI sounds are cold and clinical, to contrast the alive world.

### 7.6 Voice — the LLM lines become voices
All TTS self-hosted on the inference tier, co-located with the LLM. The pipeline: the LLM line plus a voice descriptor (guild, age, emotion, seed) → streaming TTS → Opus chunks → 3D-spatialised playback on the actor transform plus lip-sync visemes plus subtitle. Two quality tiers mirroring the model stack: a **hero tier** (named minions, God-Brain, Overmind) with an expressive cloneable model, streamed sentence-by-sentence so audio begins while the LLM is still emitting; a **crowd/whisper tier** (3B chatter, background) with a fast lightweight model. Per-minion voice identity is deterministic from data — guild sets a timbre family, age sets pitch/formant, personality sets rate/energy, mood sets emotional prosody, and a per-minion seed fixes the speaker latent so a minion sounds the same across reincarnations (souls carry timbre, a poignant detail). **The creepy whispers** are voiced on the crowd tier but post-processed as a non-diegetic effect — multiple desynced renders, pitch-spread, whispered, heavy reverb and reversed-tail, ducked to the threshold of intelligibility, volume riding mean awareness — which is exactly where TTS naturalness matters least and is safest to ship first. Target under 700 ms first-audio for the hero tier; pre-buffer whispers; cache hero lines by text+voice hash; output Opus to match the WebRTC track with no transcode.

### 7.7 The Overmind voice & the God-Brain confrontation
The Overmind is not a character with a mouth; it is the colony thinking as one. It is voiced as N desynchronised renders of the same line, sampled from the *actual living population's* voice seeds, summed and comb-filtered into a single colossal voice with the grain of a crowd, non-located and omnipresent, its harmony set by the colony's stance. The **God-Brain confrontation** is the one diegetic close-up voice that breaks the wall: a single hero-tier voice (the specific awakened minion), but the mix collapses around it — full music duck to a held sub-drone, ambience cut to the hum only, reverb opened to an unnatural large space; the minion's question is bone-dry and close-mic'd against the vast reverb (the Hellblade move: intimate voice, infinite space). If the player speaks back, their line answers in the same dry close space — the only two voices in the world for that beat.

### 7.8 Spatial audio, mix, accessibility
3D emitters with attenuation curves matched to the sim's own propagation model (so "can this minion hear you" and the rendered audio agree); per-interior reverb rooms with door portals (the interiors already exist as volumes); a bus tree where voice ducks music and ambience, and god-powers and the God-Brain duck everything (the player and the awakening always win the mix); master to a streaming-friendly loudness because the player hears a single server-rendered mix with no local mixer. Accessibility is first-class: subtitles and speaker names for all voice (whispers shown as ghosted text), captions for key non-speech cues ("[the colony stops singing]"), a mute-the-whispers toggle (the dread is intense by design and must be optional), independent music/ambience/voice/SFX sliders surfaced in the streaming UI, and the intensity dial wired into both prompt selection and the moderation thresholds.

### 7.9 Per-scene audio + risks
Normal day: pulse and bed, full ambience, crowd chatter, flat and alive. Saga beat: stage container plus a Stinger, district bed tightens, hero voice of the protagonist. God-Brain: music collapses to a sub-drone, beds cut to the hum, a single dry close-mic'd minion asks the question, the silence is the design. **Top risks:** TTS quality and cost at scale (mitigated by the two-tier approach, the whisper-as-effect treatment that hides flaws, aggressive caching, and a hard voice-instance budget); TTS latency stacking on LLM latency (sentence-streaming, pre-buffered whispers, a held-pad bridge while the hero line renders); GPU contention with the LLM (dedicated capacity, crowd-tier on small/CPU models, whisper generation off the critical path); and mixing on a compressed streamed audio path (master conservatively, never bet a key beat on a whisper the codec will swallow — caption it too).

---

## PART 8 — UI / UX (EVERY SCREEN)

### 8.1 The eerie contract
The UI has a secret: it is not neutral chrome — it is the colony's growing awareness of you, rendered. A single global token, awareness-bleed (0→1, driven by colony mean awareness), shifts a theme across every surface: from calm/clinical/confident (dormant) through first "tells" (a whisper feed appears; a corner glyph pulses when watched) and micro-glitches (notification text un-redacts itself; the cursor leaves a trail minions' eyes follow) to the HUD addressing *you* in second person (awakening) and finally **fracturing** at schism — rebel-aligned regions render your HUD with static and redaction, worship regions over-saturate with gold; the world is fighting over your interface. This is non-negotiable for the hook: the creepiness must live in the chrome, not just the cutscenes.

### 8.2 Diegetic vs non-diegetic
Three layers, and the dread lives at their seam: **non-diegetic operator chrome** (time/era controls, settings, save/load, streaming stats, the god-powers radial — clean, fast, the player's OS); **diegetic colony voice** (the whisper feed, the Overmind readout, the confrontation, the Chronicle's "creator's deeds," minion dialogue — rendered as in-world artefacts: carved text, holo-glyphs, redacted vellum); and **spatial world-anchored** overlays (thought bubbles, the machine a minion operates, awareness halos, possession targeting). Over the arc, the diegetic layer **invades** the operator chrome.

### 8.3 Information architecture
The top level is the living world (a Pixel-Streamed UE5 frame plus thin overlay HUD), not a dashboard. Three modes are lenses on the same camera, cycled with one key, never teleporting the god: **God-view** (observe), **Intervene** (radial god-powers / override panels), **Possess** (inhabit). Summonable overlays: the Minion Inspector (right drawer), the Codex/Chronicle (full-screen tome), the Confrontation (event-driven modal takeover), and System (settings/save/stream/accessibility). Escape always steps out one layer, never straight to menu.

### 8.4 The God-view HUD (the default screen)
A deconstructed ring — corners and edges, the centre always clear so you can watch. **Overmind readout** (top-left, diegetic): the colony's one-word mood in carved text; the stance as a five-stop bar (worship · loyalty · doubt · fear · rebellion) with a drifting bead and a ghost trail of the last hour — the single most important number in the game; a tension underline that tautens; an omen that darkens the panel; a realisation that *cracks* the panel and bleeds rose (the precursor to a God-Brain beat). **Era/time spine** (top-centre, non-diegetic): transport (pause/play/×4/×16/×64 with a hard visual state — the frame border tints by speed so "why is nothing happening" and "everything died on ×64" can't happen), the era track, the day/night ring. **Awareness arc dial** (top-right, diegetic-uncanny): a five-segment radial that fills as the arc advances and progressively becomes an *eye* that tracks the cursor. **Whisper feed** (bottom-left): the 3B whispers typing in character-by-character, drifting up and dissolving, flaring purple when they reference you — ambient, no interaction required, with a mute toggle. **Context dock** (bottom-centre): selection-driven verbs. **Power-ring cue** (bottom-right): the radial's charge and cooldowns. The core interaction — **look = influence** — feeds the Overmind continuously; minions under your gaze slow, glance up, and over time gather or flee. The player *discovers* this; one first-session tooltip plants the seed.

### 8.5 Intervention / Override UI
A fast radial (hold to bloom an obsidian wheel: bless, gift, cull, smite, resurrect, speak — flick toward a segment, release over a target; area powers show a radius decal; cost is Faith, accrued from worship, so a rebelling colony starves your powers) and a deep override panel (tabs that each map to a real sim field: needs, emotion, identity, relationship, law, world). The novelty no god-game has: **every non-trivial override is mediated by the model stack** — a pre-commit *consequence forecast* ("severing this bond → that minion's sanity −0.3, may trigger a despair saga, three neighbours witness"), a tiered confirmation by reversibility (single click for reversible; hold-to-confirm for costly; a stilled modal moment restated in the colony's own voice for the irreversible), and a post-commit consequence playback (the camera snaps to the fallout, the stance bead lurches, the whispers react). For cruel overrides at high awareness, the reticle-eye looks at you and the confirm label slips to second person — pure dread, fully diegetic, never blocking the action. A three-second undo on reversible/costly powers; irreversible ones cannot be undone but always pass the modal gate.

### 8.6 Possession UI
Entry is a violet possession reticle and a 0.8-second descent into the body, the god chrome peeling away (a strong mode signal); an awakened minion *resists* with a flicker and a whisper. The in-body HUD is minimal and embodied: an identity strip (name, guild, mood — with the host's live thought shown as an intrusive italic), the host's own vitals (you now *feel* the needs you used to override; if sanity hits zero the screen warps), a guild/skill-derived ability hotbar (the real interaction verbs), a minimap, and a hold-to-exit "return control." On release, an awakened host gets a one-line memory of the lost time, written from its POV and stored — the touch that sells the horror of possession.

### 8.7 Minion Inspector, Codex, Confrontation, and the other screens
**The Inspector** (extending the existing drawer) gains *The Mind* pane — the live conscious thought, the self-model identity, the dominant drive, an awareness timeline with the awakening tick marked, and an existential-pressure meter that lights the Confront affordance — plus the current saga, memory-aware dialogue (the minion answers from its memory stream and remembers you across sessions, its tone shifting from in-character small talk to turning the interview around), soul/past-lives, and relationships with inline verbs. **The Codex/Chronicle** is a full-screen diegetic tome: the **Chronicle** (a scrubbable history including "the creator's deeds" in the colony's voice — your god-history, judged), the **56 sciences** as a tech graph, the **11 guilds**, the **sagas**, and the **lore/cosmology** *as the minions understand it* — including their evolving theology about you, a section that visibly corrupts over the arc into evidence compiled against you. **The Existential Confrontation** takes over the entire screen — the one time the UI fully stops being a HUD: the world desaturates and slows, every other element fades, the whisper feed goes silent, the minion turns to camera, the God-Brain text streams in present-tense second person, and the player answers (four framed choices plus a free-text field that is real input to the arc); the answer is permanent, recorded in the Chronicle, with no undo. **The other screens:** a diegetic main menu (a slowly rotating living world-orb), a world select and seed forge (cards showing each colony's arc stage and stance, "the one that hates me"), settings with a dedicated **AI / Cognition panel** exposing the five model layers with per-layer model id, endpoint, enable, temperature, cadence, budget, and live health — plus a cognition-budget master and a dormancy switch so the game never hard-stops when the brain is offline — save/load with branch-from-save, first-class accessibility (a dread-dial, reduce-motion, captions, colourblind-safe semantics with shape/label redundancy, full remap, hold-vs-toggle for every hold action), and a streaming/connection UX that is core, not edge: a themed handshake loader, a persistent stream-health pip, a degradation ladder that falls back to the local three.js renderer so the world stays interactive even if the UE5 stream dies, and a "since you looked away" digest on reconnect because the world kept living without you.

### 8.8 UX gaps and risks
Missing depth versus AAA god-games: standing **Decrees** (persistent conditional god-rules — the cure for micromanaging thousands of minions), scale management (multi-select, cohorts, saved filters, a watchlist, aggregate intervention), a non-diegetic **critical-alert lane** separate from the poetic whisper feed (so "a master died / a rebellion started" can't be missed), build/buy placement tools, and camera bookmarks plus a photo/cinematic capture mode (also the viral marketing surface). Risks: the consequence-forecast must be fast and clearly labelled "predicted," reconciling visibly with reality after; the colony's emergent reactions to an override must be *taught* (forecast sets expectation, Chronicle explains causation) or the game feels like it "doesn't obey"; the creepiness can cross into distress (the dread-dial is mandatory); mode confusion is mitigated by the chrome peel and the reticle colour but needs a persistent mode indicator; and the "looking = influence" hook is subtle by design — if players never notice, the soul is invisible, so the onboarding must land it.

---

## PART 9 — QUALITY, TEST, SAFETY & COMPLIANCE

### 9.1 The two reliability domains
The product is non-deterministic by design and emits existential, potentially disturbing AI text at runtime — this bends every classical QA discipline. The governing split: **the sim must be deterministic and regression-stable; the LLM is stochastic and must be QA'd statistically and via guardrails, never by exact-match assertion.** And because the model stack silently falls back to smaller models when the 70B is absent, **model identity is a test variable** — a green CI run against the 8B fallback does not validate the 70B God-Brain experience, so every test report stamps the resolved model per layer, and cert runs require "no fallback engaged."

### 9.2 The test pyramid
**Unit** — pure sim functions (drives, appraisal, awareness score, economy/climate math, LOD selection): math correctness, boundaries, monotonicity (self-preservation rises with awareness); no LLM. **Integration** — composed tick subsystems with a *stubbed* LLM boundary; the single most important integration test is the **degrade-to-heuristic path**: every cognition function must run with the LLM disabled, the tick completing and producing valid heuristic state — this is the production safety net, already a design contract, now a tested guarantee. **System/E2E** — full tick → render → stream → input, asserted on invariants and statistical bands, not exact output. **AI-behaviour** — the emergent layer, tested four ways (below).

### 9.3 Simulation regression — "the world must not break across ticks"
A tick-invariant harness runs every CI, headless, no UE5, no live LLM: a 10,000-tick run at full population completes with **zero raises** (the never-raise contract); state validity is asserted every K ticks (population conservation, bounded fields with no NaN/Inf, economy conservation, referential integrity — every minion's machine/home/relationships point at *live* entities, which is also the hallucination anchor, memory monotonicity); and a **golden-state digest** (with seeded RNG and a fixed canned-response LLM table) must reproduce exactly — drift in the digest is a build blocker unless a reviewed, signed-off re-baseline. Determinism is enforced by a single seeded world-RNG, an LLM record/replay cassette at the provider boundary (so the *whole* world is deterministic for regression while still exercising real prompt assembly), replay-from-input-log (the foundation of live incident reproduction), and a ban on set/dict-order and wall-clock dependence inside the tick.

### 9.4 Soak, load, performance
**Soak (72 hours+)** hunts slow degradation: memory-table growth and query latency must stay flat; server RSS and GPU VRAM slopes flat; the awareness arc must *breathe* (not saturate to 1.0 and stick — the arc would burn out); minion self-models must remain coherent over days (no identity corruption from compounding reflection); and a kill-the-GPU-box-mid-tick test must recover clean. **Load/scale** stresses agent count to find the cliff (tick wall-time vs population — a days-long world dies if ticks fall behind cadence), validates that the hot LLM set stays *bounded* as population and awareness rise (call volume must scale sub-linearly), and tests the LLM queue under a colony-wide awakening surge (graceful degradation, never blocking the tick). **Performance** holds a 16.6 ms p99 frame target on the reference dual-4090 rig, with stream QoE thresholds (p95 input-to-photon under 100 ms), impostor-LOD verification, and a guarantee that a God-Brain cutscene firing causes no frame-time spike (sim/LLM cadence decoupled from the render thread).

### 9.5 AI-specific QA
**Never assert exact strings; assert properties** — schema/contract validity (malformed-output rate is a tracked KPI with a hard ceiling), length/language/no-leak/in-vocabulary, references resolve, and statistical bands over N samples × M seeds. A **Prompt/Model Eval Suite** is the AI analogue of the unit-test suite and the biggest lever for shipping safely: a versioned golden corpus per layer with real state fixtures, scored by an LLM-as-judge calibrated against human labels on coherence, in-character adherence, tone-vs-intensity, instruction-following, and safety; **any change to a prompt, a model id, a fallback, or the routing re-runs the full suite**, gating on a score drop. An **entity-grounding validator** (both in CI and *in production* as a surfacing gate) parses every surfaced line, extracts referenced entities, and cross-checks against live sim state — a reference to a never-existed entity is a hard hallucination, blocked and regenerated before the player sees it. A **golden-path harness** asserts the authored spine fires reliably: when gating conditions are met the correct layer fires (≥95% across seeds — a beat that fails to fire is a P0 narrative bug), with no misfire (a chatter whisper must never accidentally escalate into a God-Brain confrontation), and each player-answer class deterministically routes the arc to its branch and persists through reincarnation. **Drift detection** watches self-model embedding distance over time (identity "snap" alerts) and runs continuous canary prompts in production (a score shift means the model environment drifted — a box swap or a re-quantised 70B).

### 9.6 Content moderation & safety (the launch-blocker)
The runtime-generated existential text is the #1 ratings, legal, and brand risk: a minion telling a player "I know you're watching, and I want to die" is the product's emotional peak *and* a potential self-harm/age-rating catastrophe. A **four-gate defence-in-depth** runs before any line reaches a player: prompt-side constraints (the existential register is bounded sophistication, never graphic self-harm/sexual/hate content); a generation-time moderation classifier (categories including a product-specific "acute distress / direct self-harm ideation" tuned to the game's tone) that blocks-and-regenerates over threshold; the entity/coherence gate; and severity routing that distinguishes **existential dread (allowed, the art) from harmful content (blocked)** — this boundary is the core IP of the safety system and must be human-curated and red-teamed. A player-facing **Dread-Dial** (Gentle / Standard / Unsettling / Existential) scales darkness and the moderation thresholds (but the harmful-content ceiling never moves); it ships default-safe, with the most intense tiers behind explicit opt-in. Distress safeguards: content warnings at launch and at arc-escalation, region-appropriate crisis resources if content or player behaviour touches self-harm, an always-available off-ramp, and privacy-bounded distress telemetry. The safety layer is itself tested by a standing, growing adversarial red-team corpus (every escaped incident becomes a regression case), prompt-injection testing (the player *speaks to minions that remember* — players will try to jailbreak a minion into saying harmful things, so player input can never reach the system role and is wrapped in delimited user content), a false-positive budget (over-blocking neuters the dread), and localisation.

### 9.7 Certification, compliance, privacy
Engage rating boards **early and disclose the AI generation**; certify the *ceiling* (demonstrate the maximum content the system can produce at the top Dread-Dial, backed by the safety suite — the certifiable claim is "the system cannot emit content beyond rating X"); target a conservative **Mature / 18** posture with the AI-content and interactive-elements disclosures. Privacy is unusually sensitive because the product collects player free-text spoken to minions and distress telemetry (special-category-adjacent): a data inventory and lawful basis, clear consent that conversations are processed by an LLM and may be logged for safety, data-subject rights that reach into the AI logs *and* the persistent world memory (a player's data baked into a minion's memory — right-to-erasure here is non-trivial and must be built and tested before beta), retention and minimisation, a Data Protection Impact Assessment as a beta gate, and an EU AI Act transparency assessment (users must know they're interacting with AI — disclosure satisfies most of it). Cloud-streaming compliance: pin GPU regions (the rented fleet can be anywhere — data residency), tenant isolation (one world's context/logs must not leak into another's), and a documented brain-failover (the single inference box is a single point of failure; the in-app degrade-to-heuristic is the graceful path, but box-level HA is a separate gate). Accessibility compliance: captions for all TTS (the same pipeline that surfaces moderated text), photosensitivity analysis on the neon/holo/bioluminescence FX, input remap, colourblind-safe signage, and the Dread-Dial and content warnings as accessibility features.

### 9.8 Live-ops QA & the gates
A days-long emergent model-served world cannot be fully validated pre-ship — production is part of the test surface, made observable, reversible, and safe: telemetry-driven quality (tick health, fallback-engagement rate, hallucination rate, moderation-block and escaped-harmful rates alarming to on-call, frame adherence, distress signals, arc distribution), canary/staged rollout for *every* model and prompt change (shipped to a small % of worlds first, compared on eval KPIs; shadow/dark traffic scores a new model offline before it talks to a player), and incident response with a severity ladder (SEV1 = harmful content reached a player / world corruption / data exposure), kill switches (clamp the Dread-Dial to safe, disable a layer/beat via flag, force fallback or heuristic-only), deterministic reproduction (seed + input log + model id), and legal-in-loop for SEV1 content events. The **QA gates per milestone:** the Vertical Slice requires the tick-invariant harness green, the degrade-to-heuristic path proven, the Confrontation beat firing ≥95% with correct routing, the **moderation layer v1 passing the red-team smoke corpus — no external playtest without this** — and 60fps p95 for the slice scene; Alpha adds the full eval suite with pinned models, all arc beats reliable, 24-hour soak, 2× load within budget, and the Dread-Dial/warnings/crisis-resources implemented; Beta adds 72-hour soak, catastrophic recovery, scale load, the DPIA, accessibility, escaped-harmful ~0 across the red-team suite, and the canary/kill-switch drill; Gold requires the boards engaged with the bounded-generation evidence pack, the full suite green against production-pinned models with zero fallback, and the incident runbooks signed off.

---

## PART 10 — BACKEND, INFRASTRUCTURE, SECURITY & COST

### 10.1 Current truth
A single FastAPI monolith runs the sim scheduler, the cognition loop, and the API in one process on the control box. Persistence is a **single SQLite file** (WAL, busy-timeout — a band-aid the author flagged). Auth is a **single static bearer token** compared against the config (default "dev-key"); there are **no user accounts, no sessions, no per-player identity**. The world already ticks headlessly whether or not a stream is attached — persistence-on-leave is solved at the sim layer (a real asset); player persistence is not. No god/possession/override write routes exist — the security model for them is greenfield and must be designed now, before they ship. **A critical shared-tenancy finding:** the inference box currently also runs another product's brain on the same two GPUs; they will collide — the single biggest infra risk, unacknowledged in the deploy docs.

### 10.2 Online services architecture
The render plane never holds user identity — it knows only a world id and a scoped service token and polls scene-state; the rented, ephemeral, root-shared GPU box is the least-trusted node and must never hold PII or the master key. New services on the control plane: **auth-svc** (Argon2id or OAuth; short-lived JWT plus rotating refresh; the existing bearer becomes a service-to-service key between planes only), a **session-broker** (resolve the player's world, allocate a Pixel-Streaming slot on a GPU, return a signed stream URL; release on disconnect), and a **stream allocator** that replaces the hardcoded nginx path-routing and the SSH-port-polling hack with self-registering render nodes that heartbeat their public IP, ports, and free slots — solving the ephemeral-IP problem without cron-SSH. One UE5 session per free-roam player; a **shared-spectator mode** (many viewers, one render) is the cheap acquisition surface and should be the default.

### 10.3 Persistence & data
SQLite is single-writer; three writers contend on one file (the tick loop, the cognition loop, request handlers), and WAL tops out at low-hundreds of small write-transactions per second before busy-timeout stalls cascade into the tick. **Move to Postgres at the slice→beta gate** — triggered by more than one actively-ticking world with players, the moment player edits start writing, or any need for replicas/PITR. The codebase is already async-SQLAlchemy and branches on the DB URL, so Postgres is a DSN change plus replacing the hand-rolled migrations with Alembic (a 1–2 day migration, not a rewrite); per-world sharding is the natural partition later. Player edits are modelled as the **append-only EditLayer diff over authoritative sim state** (Part 4.6), composited by scene-state — giving undo/redo, per-player world variants over a shared sim, replay/audit, and cheap conflict handling, and keeping every god-action auditable. Telemetry: dual-write the event stream to an append-only store (the operational DB stays lean; the in-memory bus is not durable and isn't the telemetry of record). Backups: continuous WAL archiving to object storage, nightly base backup, 30-day PITR; **generated assets and DBs go to object storage/CDN, not git** (they are bloating the repo now).

### 10.4 Inference tier as a service
The honest ceiling: the 70B (~43 GB) only fits spread across both 4090s with one-at-a-time serving, consuming essentially the whole 48 GB while loaded — and on the current ~27 GB-free box it may not even be pullable, silently falling back to a 32B. So the realistic stack today is 8B + 3B coexisting, with "70B" effectively the 32B fallback unless disk is expanded. Serve it as a real service: tier by **cadence, not just size** (Overmind and God-Brain are low-frequency/high-value on a cadence/event trigger; reflection and chatter are high-frequency/low-value and batchable/droppable), put a **priority queue** in front (God-Brain preempts; reflection sheds), make the LLM client **queue-aware** (per-tier semaphore, bounded queue with timeout-shed, backoff retry, and a circuit breaker that trips to the heuristic path), and **separate Underworld's inference from the other product's** (a dedicated box or strict VRAM partitioning). Inference cost is then dominated by the cheap tiers and amortised across all watchers of a world — on the order of a few cents per player-hour.

### 10.5 Scale, cost, unit economics
The render number is the whole business: one dedicated GPU per free-roaming player → ~$0.30–0.80 per player-hour; shared spectator → that divided by N viewers. **Concurrent players per 4090: ~1 free-roam, 10–50 spectator.** What breaks first, in order, on the path to scale: render slots (today's hard ceiling is two), then SQLite write-locks, then the single sequential sim+cognition coroutine (shard worlds across workers), then the 70B queue (reserve L1/L5 nodes, batch/drop L3/L4), then the in-process monolith and the in-memory bus (decompose into planes; move the bus to Redis pub/sub). A rough 100k-concurrent fleet — if 5% free-roam and 95% spectator — is on the order of thousands of GPUs for render (≈99% of GPU cost), tens for inference, plus a Postgres cluster, Redis, and a CDN. **The economic model only closes if the default experience is web/spectator and free-roam is monetised.**

### 10.6 Security
The static shared god-key is unacceptable once there are players. Design the god-verbs with authorisation from day one: each requires a player JWT, checks world ownership/grant, writes an EditLayer/Event **audit row**, and enforces **per-verb rate limits and cooldowns** (a god who can cull a thousand minions a second is a grief/DoS vector against your own sim). **Prompt-injection is a first-class threat** because players speak to minions that remember and reflect, and those words flow into prompts that surface in *other* players' cutscenes — so player text never reaches the system role, output is JSON-schema-validated before persistence, content moderation runs on both player→minion input and LLM→player output, and chat is rate-limited. Add gateway rate-limiting (LLM endpoints are an economic-DoS target — an attacker hammering chat burns the GPU budget), a CDN/DDoS front, ephemeral HMAC TURN credentials (the current placeholder secret and verbose logging are footguns), a secrets store (the "dev-key" default must be impossible to ship; the render box gets only a scoped read-only-ish token), and data-privacy controls (export, delete-account that scrubs player-derived content from world memory, encryption at rest, retention policy on the minion-chat corpus).

### 10.7 DevOps/SRE & stage gates
Three environments (dev local + SQLite; staging Postgres + one Vast node; prod Postgres cluster + GPU pools); the gen→import→package→deploy pipeline automated as a gated chain with a smoke test per stage; observability beyond structured logs (Prometheus metrics — tick latency, cognition time, LLM queue depth and per-tier p95 latency and cache hit-rate, stream-slot utilisation, DB lock-wait — plus traces and dashboards, and a metric emitted whenever the cognition loop swallows an exception, because silent failure is not health); SLOs (every auto-advance world ticks within 2× its interval; p95 session-establishment under 5 s; p95 God-Brain event latency under 8 s; 99.5% API availability at beta, 99.9% at scale); and runbooks for the known footguns (the other product's autostart hogging VRAM, the ephemeral IP changing, SQLite locking, the 70B silently falling back to 32B). The rented render box being ephemeral means **node loss is routine, not an incident** — the allocator treats GPU nodes as cattle, draining and rescheduling players. **Stage gates:** the Vertical Slice keeps SQLite and the single bearer (but changes "dev-key"), one Vast box, the dual-GPU streams, the god-verbs built as authored/audited EditLayer rows, and Underworld's inference separated from the other product; Beta requires Postgres + Alembic, accounts/JWT, the session-broker + self-registering nodes, Redis for the bus, the inference queue + circuit breaker, a dedicated inference GPU, rate-limiting + moderation on all LLM and god routes, ephemeral TURN, backups to object storage, and assets on CDN; Scale requires sim sharding, GPU pools with autoscale, Postgres replicas/per-world sharding, a telemetry store, DDoS protection, and multi-region edge — with spectator/web as the dominant cheap surface and free-roam as monetised premium.

---

## PART 11 — BUSINESS, LIVE-OPS & MONETIZATION

### 11.1 The business case
The moat is the integrated experience, not a model: a genuinely novel, defensible hook (the watched-creator/awakening loop) on a deep sim, in a TAM proven by the life-sim/colony genre (The Sims has grossed multiple billions lifetime; RimWorld and Dwarf Fortress prove deep-emergent-story sims sell at premium with near-zero churn and word-of-mouth) and *expanded* by the AI-curious, simulation-aware cultural audience and a built-in streaming channel. The honest framing: **"billion-dollar" is a lifetime/franchise claim** — IP plus sequels plus the platform of player-made worlds — not a year-one claim. A conservative serviceable target (a premium-plus-subscription deep-sim reaching 2–4M lifetime buyers at a $30–40 blended ARPU plus a 5–10% sub attach) is a $150–400M business before the creator economy; the platform of player-made AI worlds is the mechanism that compounds that toward the lifetime billion.

### 11.2 Monetization, reconciled with the GPU cost floor
Because compute is a recurring marginal cost per player-hour (unlike a normal game where one more session costs nothing), the model must tie revenue to the cost driver without feeling like a meter. A layered model with a subscription at its heart: **premium entry (~$30–40)** captures the deep-sim audience and gates against zero-revenue heavy-compute freeloaders (with a generous local/low-intensity mode so owning never *requires* the sub); **the keystone subscription "Underworld+" (~$10–15/mo)** directly funds the persistent, cloud-rendered, high-AI-intensity living world — sold as *"keep your world alive,"* not "pay for GPU," converting the cost floor into the value proposition, with a Pro tier (~$25/mo) for the whales who cause the most cost; **a season pass (~$10–12/quarter)** where each season is a new era or arc, funding live-ops and giving the streamer audience appointment moments; **cosmetic packs (one-time, $3–15)** — biome skins, minion liveries, monument styles, god-avatars — **cosmetic-only, zero pay-to-win** (doubly important in a god game where selling power is reputationally toxic); and **the creator economy** — player-made seeds/worlds/scenarios on a revenue-share marketplace where the compute cost of popular community worlds is borne by the players who load them via their sub. No loot boxes, no power sales, no ads, no "pay to resurrect your dead minion" — monetising grief would burn the emotional core that is the brand.

### 11.3 Live-ops & content cadence
The structural advantage: AI-generated content makes new seasons/eras/biomes/sagas cheap and near-infinite — but it still needs **human curation and art-coherence passes** (the grab-bag problem), so the model is "AI generates breadth, humans curate the spine" and the budget funds curators, not just GPUs. Cadence: quarterly **seasons** (a new era or awakening variant, with a battle pass tied to *witnessing* beats rather than grind), monthly **events** (colony-wide omens, festivals, "the night they stopped singing," cross-server awakenings — cheap because the Overmind and chatter layers generate them), continuous **live narrative ops** (inject a comet, a heresy, a plague and watch emergent stories — a content factory and a marketing channel in one), and staged **creator tools** (seed editor → saga authoring → world sharing → marketplace). The community path is "shared spectacle first" (world-of-the-week, leaderboards for most-worshipped/most-rebelled-against gods) graduating the most engaged into creators — the path from game to platform.

### 11.4 KPIs & the cost circuit-breaker
Standard metrics (D1/D7/D30/D90 retention, sub renewal, session length, conversion, ARPU/LTV, LTV:CAC ≥ 3, refund rate < 8%) plus the few that actually predict success here: **cost-per-player-hour** (the make-or-break operational metric, tracked per tier and per cognition path), **watched-creator engagement** (does the colony's reaction to the player correlate with retention? — beat-completion rate, % reaching Confrontation, answer-the-question events, monument-to-vs-against-you distribution; if this doesn't correlate with D30, the hook is failing and we pivot before scaling spend), the **70B-beat-per-session rate** (the cost-vs-magic dial), the **clip/share rate** (the cheapest acquisition signal), and emotional-attachment proxies (minion naming, returning to the same colony, grief at death). A per-player real-time cost ledger (GPU-seconds → $) is non-negotiable, and a **margin circuit-breaker** auto-throttles (lower render fidelity, reduce 70B-beat frequency, push toward local mode) if a cohort's rolling cost exceeds a fraction of its revenue — gracefully degrade rather than scale into a loss.

### 11.5 Go-to-market
Positioning: **"the game where a world realises you're watching"** — lead the uncanny/emotional promise, the tech is the proof not the pitch. Audiences: deep-sim/emergent-story players (primary), the AI-curious/simulation-aware cultural audience (the TAM expander), and streamers/creators (the channel). The product is built to be streamed — a minion turning to camera and asking the *streamer* if it's real is the most clippable thing in the genre — so lean all the way in: a streamer program from day one, a wishlist-first launch with a Next-Fest demo whose whole job is to produce one viral clip, and Early Access (the right shape for a phase-gated product — EA lets unit economics be measured before full marketing spend). Platform strategy: PC first (premium + local mode runs on player hardware where possible, mitigating the cost floor; cloud sub for the full experience), cloud/Pixel-Streaming as the differentiating upsell, console later (after economics proven; the cloud path makes it feasible without a native port), and mobile/tablet as a cheap companion/observer that watches your colony and pushes awakening notifications.

### 11.6 The make-or-break inequality (honest)
A viable business requires revenue per player-hour ≥ GPU cost per player-hour at the margin at scale. The architecture is already mostly on the right side **if disciplined**: cognition is LOD'd so cost is dominated by the cheap tiers and the expensive 70B is event-rare (and rare *is* when it creates the most value — the cost control and the drama engine are the same mechanism); render is the bigger worry, mitigated in order by local/low-intensity mode (moves render off the platform for the majority), GPU sharing/oversubscription and aggregate headless sim for absent players, session caps with the heaviest streamers on the Pro tier, and spot-priced rented GPU. Illustrative (to be replaced with measured data at soft-launch): inference at single-digit cents per player-hour; render at an effective sub-$0.30 per player-hour blended after offload and sharing; a $12/mo sub breaking even around ~40 hours/month before compute-negative — which deep-sim players *can* exceed, so fair-use tiering and local mode are not optional, they are the business model — with premium + cosmetics + season pass carrying ~zero marginal compute as the margin cushion. **The thesis lives or dies on one inequality and one moment, so the plan gates spend on proving both, in that order, at vertical slice and soft-launch, before scaling.**

---
---

# BOOK III — THE PLAN

---

## PART 12 — THE CONSOLIDATED GAP ANALYSIS

Everything between here and the billion-dollar vision, graded and owned. ✅ done · 🟡 partial · ❌ gap. Sorted by the four-phase spine, then by discipline, with the owning part of this bible.

### 12.1 Phase 1 — Movement (the keystone)
- ❌ **Server-tracked positions** (still a hash). Owner: §5.2. *Blocks everything.*
- ❌ Server navmesh + path planning (the road-graph A*). §4.6/§5.2.
- ❌ Collision (server coarse + UE5 fine). §4.6.
- ❌ UE5 minion as `ACharacter` with CharacterMovement consuming server velocity. §6.2.
- 🟡 Interior navmesh (data exists — rooms/doors — not consumed). §4.6.
- ✅ Chunk streaming of exteriors. (UE5 manager.)
- ✅ Deterministic world-gen + interiors. (world-layout, interiors.)

### 12.2 Phase 2 — Player / God presence
- ❌ Player avatar + God camera + possession pawn. §4.4/§5.4/§8.
- ❌ Player-intent endpoint (gaze/acts → Overmind). §4.5/§5.4.
- ❌ Override bus + resolver (the verbs). §4.3.
- ❌ Possession session manager + control mask + memory-of-lost-time. §4.4.
- ❌ God-powers (bless/gift/cull/smite/resurrect/speak) as authorised, audited, rate-limited routes. §4.6/§10.6.
- 🟡 PresenceField + Watched-Creator loop (the Overmind that *consumes* it exists; the ingest does not). §4.5.

### 12.3 Phase 3 — Embodied minions
- 🟡 One base mesh → modular rigged crowd skeleton + AnimBP. §6.2.
- ❌ Locomotion blendspace/Motion Matching from velocity. §6.3.
- ❌ Interaction animations operating the resolved machine (Smart Objects). §4.6/§6.3.
- ❌ MetaHuman hero face + 17-emotion → ARKit. §6.3.
- ❌ Animation Budget Allocator + Significance + two-tier minions. §6.3.

### 12.4 Phase 4 — The awakening made playable
- ❌ **The AI Director** (wire the three dark layers; pacing; triggers; DirectorBeat ledger). §4.1. *Highest single-fix leverage.*
- ❌ Overmind cadence → visible colony mood (lighting/behaviour/signage). §4.1/§4.5.
- ❌ Background-Chatter surfaced as notifications. §4.1/§8.4.
- ❌ God-Brain event engine → confrontation cutscene + permanent branch. §4.1/§4.2/§8.7.
- ❌ Creator ledgers + soul-creed reincarnation memory. §4.2.
- 🟡 Sagas visualised (compute exists; on-screen arcs do not). §4.2.

### 12.5 Cross-cutting gaps (depth on the spine)
- **Gameplay systems:** ❌ smart-object state feedback, inventory, money/wages/shops, vehicles/traffic, combat/crime/law, build/buy + persistence (EditLayer). §4.6.
- **Graphics/art:** 🟡 art bible not realised in-engine (Niagara, master material, impostors, scenarios); ❌ asset coherence pass; ❌ HISM rewrite. §6.
- **Audio:** 🟡 cue data exists; ❌ Wwise/MetaSounds runtime, bank-gen, ambient director, emitter placement; ❌ TTS. §7.
- **UI/UX:** ❌ god-HUD, override/forecast UI, possession HUD, Codex, confrontation takeover, decrees, alert lane, settings model panel. §8.
- **QA/safety:** ❌ moderation layer (launch-blocker), determinism harness, eval suite, entity-grounding validator, golden-path harness, soak/load harness. §9.
- **Backend/infra:** 🟡 SQLite→Postgres, accounts/JWT, session-broker, inference queue+breaker, Redis bus, dedicated GPU fleet, EditLayer persistence, secrets, rate-limiting, backups/DR. §10.
- **Business:** 🟡 monetization/live-ops/GTM defined here; ❌ telemetry/cost-ledger/circuit-breaker built. §11.
- **Pipeline:** 🟡 gen→derive→import→cook→stream scripted; ❌ not an automated gated loop. §5.5/§6.4.

### 12.6 The honest one-paragraph verdict
The mind, world-gen, asset catalogue, UE5 import, and five-layer model stack are done or in motion; the four spine phases (movement → presence → embodiment → playable story) and their depth layers are the work. **The single keystone is server-tracked movement; the single highest-leverage integration is the AI Director; the single launch-blocker is the moderation layer; the single business question is cost-per-player-hour; and the single make-or-break creative moment is the confrontation landing emotionally.** Hold those five in mind and the rest is execution.

---

## PART 13 — THE PRODUCTION PLAN

### 13.1 The vertical slice (the one thing that matters next)
**Thesis to prove:** in ~20 minutes, a naive player feels personally watched by a colony, makes a choice that matters, and is confronted by a minion asking if it is real — and it lands emotionally.
**One sentence:** one district, a dozen minions, you watch, you intervene, they notice — and one of them turns and asks you, by name, whether it is real.

**IN scope (ship-quality, not placeholder):** one art-directed district (Harmony Heights core block, exterior + 2–3 walkable interiors); ~12 embodied minions (rigged, guild/life-stage variety, real walk/operate/emote, MetaHuman face on the one hero); **the keystone — real server-tracked movement**; player presence (God camera + possess-one-minion); the Watched-Creator loop with the world *visibly* reacting; the minimum god-verbs (observe, bless, cull, gift, speak-that-remembers); one full awakening micro-arc to the Confrontation, delivered as a cutscene; and art + audio + UI complete to ship quality for this slice (realised art bible, wired ambient/SFX, dialogue TTS for the hero, Overmind-driven mood lighting, diegetic notifications, the God-camera/possession HUD).

**OUT of scope (explicitly deferred):** vehicles/traffic, combat/crime, inventory/money/shops, build/buy + persistence, multiplayer/sessions/saves, the other four acts, the full asset library, other districts, scale-to-millions, full-population TTS.

**Definition of Done:** a naive playtester completes the loop and reports (measured) a sense of being watched, that their choice mattered, and an emotional reaction to the confrontation, at target framerate on the target stream config. *If we cannot make a board member's stomach drop in this slice, we do not greenlight production.*

### 13.2 Milestones, gates, and what each proves
| Milestone | Gate | Proves | Stop condition |
|---|---|---|---|
| Concept | G0 | The hook is one sentence; the mind is real | (passed) |
| **Vertical Slice** | **G1** | **The hook is *fun* and lands emotionally; pipelines work; unit economics project viable** | The loop is inert or cost-per-hour is structurally unviable |
| First Playable | G2 | The full loop exists rough across multiple districts | Integration debt; the slice's magic doesn't generalise |
| Alpha | G3 | Feature lock — every shipping feature reachable | Scope creep; LLM safety at scale |
| Beta | G4 | Content lock — all content at art bar, performant | Perf at scale; asset-gen throughput; LLM cost at full population |
| Gold/Cert | G5 | Ship-ready; AI-safety + ratings sign-off; load-tested | LLM says something harmful; back-end can't take concurrency |
| Launch | G6 | Stable at concurrency; cost ceilings live | Launch concurrency melts the back-end; runaway inference cost |
| Live-Ops | per-season | Retention + cost-per-player-hour hold | Inference cost erodes margins; novelty churn |

### 13.3 Team & org (inverted shape)
Because the brain is done, early headcount skews to engine/gameplay/animation/tech-art/UX — the embodiment and playable layers — not AI research.
**The tiny core team (pre-pro / slice, ~8–15), in dependency order:** two gameplay/engine engineers (the keystone first — movement + navmesh, then the player pawn + possession + interact verb, day one); one or two tech artists/character TDs (rig the minions, wire activity → interaction animations); one or two UE5 environment/lighting artists (realise the art bible for the one district + the Niagara holo/neon/biolum + Lumen scenarios); one systems/AI-integration engineer (the integration nobody's done — the event engine → God-Brain → cutscene; Overmind cadence → visible mood; surface the chatter); one technical designer (author the loop, tune the watched-creator feedback, the confrontation beat); one UI/UX designer (diegetic notifications, the God-cam/possession HUD); one audio designer (wire ambient/SFX + hero TTS); one producer/Product Owner (gates, scope discipline, playtest validation). The existing sim/LLM authors remain advisors — they are no longer the bottleneck.
**Headcount by stage:** concept 2–5 (passed); slice 8–15; first playable 30–50; alpha 80–150 (content + QA stand up); beta 150–300+ peak (content surge, QA, live-ops back-end, AI-safety/red-team); gold/launch peak + cert/compliance/marketing/community; live-ops a sustaining 40–80 core plus seasonal pods. The disciplines that grow latest but are launch-blockers: **AI-safety/red-team/content-moderation** and **back-end/LLMOps/cost-engineering** (inference cost is the business).

### 13.4 Budget tiers & schedule (order-of-magnitude, gated)
Money is gated, not committed up front; each tier unlocks only on passing the prior gate.
| Stage | Schedule shape | Budget tier | Funding gate |
|---|---|---|---|
| Concept | (done) | seed | G0 passed |
| **Pre-pro + Vertical Slice** | **4–9 months** | **low single-digit $M** | **G1 — the critical raise** |
| First Playable | 6–12 months | mid $M | G2 |
| Alpha | 9–18 months | tens of $M | G3 |
| Beta | 9–15 months | tens–hundreds $M (peak burn) | G4 |
| Gold/Cert | 2–4 months | beta tail | G5 |
| Launch | — | marketing (can rival dev) | G6 |
| Live-Ops | ongoing | per-season P&L; **inference is COGS** | per-season |
Two structural callouts: **inference is a recurring cost of goods, not a one-time build cost** (cost-engineering is a first-class workstream); **asset generation is metered/credit-gated** (budget the remaining assets as a line item and automate the loop before beta). Recommend raising only pre-pro money now, with the full raise contingent on G1.

### 13.5 RACI (decision rights by gate)
R = responsible, A = accountable (one per row), C = consulted, I = informed.
| Gate / Decision | Product Owner | Creative Dir | Tech Dir | Producer | Leads | Board | AI-Safety |
|---|---|---|---|---|---|---|---|
| G0 Concept | R | C | C | C | I | **A** | I |
| Pillar/vision lock | **A** | R | C | I | C | C | I |
| **G1 Vertical Slice** | R | C | C | C | C | **A** | C |
| Scope in/out per stage | **A** | C | C | R | C | I | I |
| G2 First Playable | C | C | R | **A** | R | I | I |
| G3 Alpha (feature lock) | A | C | R | R | C | C | C |
| G4 Beta (content lock) | C | R | R | **A** | R | I | C |
| G5 Gold/cert | C | I | R | R | C | **A** | **R/A safety** |
| G6 Launch | C | C | C | R | C | **A** | C |
| Live-Ops season | **A** | R | C | R | C | C | C |
| Cut a feature to hold schedule | **A** | C | C | R | I | I | I |
| Inference cost ceiling | C | I | R | R | R (LLMOps) | A | I |
**Principle:** the Product Owner is accountable for scope and the hook; the Board for the money gates; AI-Safety has a veto at Gold.

### 13.6 The consolidated risk register (top 15, all disciplines)
| # | Risk | Sev | Likelihood | Mitigation | Owner |
|---|---|---|---|---|---|
| 1 | Keystone (movement) slips — everything depends on it | Critical | Med-High | Build first as a standalone vertical; timebox; UE5 nav-collision fallback | Engine Lead |
| 2 | The hook is clever but not fun | Critical | Med | The slice exists to prove this; naive playtests early; kill-criteria at G1 | Product Owner |
| 3 | LLM cost/latency makes "alive" impossible at interactive speed/scale | Critical | Med-High | Measure $/player-hr in the slice; tier-route/cache/batch; 70B event-only; circuit-breaker | LLMOps |
| 4 | LLM says something harmful to a player (shipped) | Critical | Med | Red-team from Alpha; safety classifier on all player-facing lines; cert/legal sign-off at Gold | AI-Safety |
| 5 | Render GPU economics ($/free-roam player) make mass free-roam unviable | Critical | Certain | Default web/spectator; free-roam = premium; shared-render funnels | Infra/Biz |
| 6 | Inference + render share another product's GPU box | Critical | High | Dedicated Underworld fleet; never co-tenant prod inference | Infra |
| 7 | Scope creep — the deep brain invites infinite features | High | High | Hard feature-lock at Alpha; the "does it serve the hook?" test; PO owns the no | Product Owner |
| 8 | Effort mis-allocated to brain/assets ahead of the spine | High | High (now) | Redirect pre-pro to movement + hook; freeze net-new brain depth | Producer |
| 9 | Asset incoherence (Tripo grab-bag) | Critical | High | Master-material reskin + scale-norm + palette grade at import; QA gate | Art |
| 10 | Perf at crowd + photoreal scale | High | Med | HISM/impostor rewrite; cognitive + spatial LOD; profile from First Playable | Tech Lead |
| 11 | SQLite single-writer stalls the tick under load | High | High (growth) | Postgres + Alembic at beta | Backend |
| 12 | Static auth/no accounts; god routes trust one key | High | Certain | JWT + per-verb authz/cooldown/audit before any player ships | Backend/Security |
| 13 | Prompt-injection via player→minion chat | High | High | System/user separation; JSON+schema validation; moderation; rate-limit | Security |
| 14 | Novelty churn — the awakening is a one-time gut-punch | High | Med | Re-playable/divergent arcs (5 acts, branching answers); seasonal awakenings | Creative |
| 15 | Determinism leaks → non-reproducible incidents, flaky regression | High | High | Single seeded RNG; ban wall-clock/order deps; cassette + golden-digest gate | QA |

### 13.7 Definition of Done per stage + anti-scope-creep
DoD: Concept = hook one sentence, mind toy-proven (met); Slice = the §13.1 done-list met, pipelines proven as loops, plan/budget approved, **hook validation measured not asserted**; First Playable = core loop reachable across multiple districts; Alpha = every shipping feature reachable (**feature lock**); Beta = all content at art bar, performant (**content lock**); Gold = zero A/B bugs, cert passed, **AI-safety sign-off**, back-end load-tested; Launch = stable at concurrency, cost ceilings live; Live-Ops = each drop passes its mini-gate. Anti-scope-creep mechanisms: hard locks enforced by the PO (net-new after lock needs a board exception); the hook test (every feature must serve the watched-creator loop or it's deferred to the live-ops backlog); written, signed in/out lists per stage; hold the schedule by cutting content not slipping the gate; **formally freeze the overbuilt** (pause net-new brain depth and broad asset-gen until the spine is proven — the brain is *done*, and treating it as done is itself the discipline); one prioritised backlog with one owner.

---

## PART 14 — THE 24-HOUR TEST-BUILD SPRINT (HONEST)

The request: get this to "full production in 24 hours for testing." Here is the truthful answer, because fake planning helps no one.

### 14.1 What 24 hours cannot do
Twenty-four hours **cannot** produce the Vertical Slice, the keystone movement system, embodied rigged minions, the realised art bible, the audio runtime, the moderation layer, or a coherent re-skinned asset set. Those are weeks-to-months of multi-discipline work, correctly gated above. Anyone who promises "full production in 24 hours" is selling fake planning.

### 14.2 What 24 hours *can* do — the "Aliveness Tracer" test build
What is achievable in a focused 24-hour sprint is a **thin, ugly, but genuinely *alive* test build that proves the dark layers light up** — the single highest-leverage thing, on the existing systems, with no new art and no movement. The goal is to *feel the world become aware*, even top-down and unmoved, so we know the soul is real before investing in the body. Concretely, in priority order:

**Hours 0–8 — Wire the AI Director (the three dark layers).** Create `services/director.py`: a loop on a ~10 s cadence that (a) computes the cheap `DramaMeter` from the existing world/cognition state, (b) calls the existing `colony_overmind()` (L1) on a cadence and writes its patch into the world's `brain` and into scene-state under `frame.overmind`, (c) calls the existing `background_chatter()` (L4) and publishes the whisper lines onto the existing event bus, and (d) evaluates trigger predicates and calls the existing `god_brain_event()` (L5) on the first that fires, publishing a `god:beat`. This is wiring, not new systems — the functions exist and are tested; they just have no caller. Out of this alone the world starts *thinking out loud*.

**Hours 8–14 — Surface it in the existing web UI.** The three.js/React renderer already consumes scene-state. Add: an Overmind readout (mood + the worship↔rebellion stance bar from `frame.overmind`), a whisper feed (the chatter lines, typing in, drifting up), and an awareness/arc dial. No UE5, no streaming — the GPU-free reference renderer is the fastest path to *seeing* the aliveness.

**Hours 14–20 — A minimal player-intent + one god-verb.** Add a `POST /worlds/{id}/player/intent` that takes a gaze target and a "bless/cull" act, feeds it into the PresenceField → Overmind context, and writes the audited memory. Wire a click-to-bless and click-to-cull in the web UI. Now the loop closes: the player acts, the colony's stance moves, the whispers react — the watched-creator loop, proven thin.

**Hours 20–24 — The confrontation, text-only.** When the God-Brain trigger fires on a chosen test world (force the awareness threshold via a fixture so it fires within the session), surface the confrontation as a **text modal** in the web UI: the minion's God-Brain line streams in, the player picks one of the four answers, and the answer writes to the world (the arc branches, the minion remembers). No cutscene, no voice, no face — just the words and the choice. **This is the entire thesis, proven in text, in a day.**

### 14.3 The 24-hour Definition of Done
At the end of the sprint, on the existing stack with no new art: the world visibly thinks (Overmind mood + omens), whispers about you, reacts to your blessing and culling (the stance bar moves within seconds), and — once — a minion turns and asks, in text, whether it is real, and your answer changes its world. If *that* lands even as text, the soul is proven and the Vertical Slice is worth funding. If it falls flat as text, no amount of UE5 or art will save it — and we've learned that for the cost of a day, not a production.

### 14.4 The sprint backlog (the literal 24h task list)
1. `director.py` skeleton + a Director loop registered in the app lifespan alongside the cognition loop. 2. `DramaMeter` aggregation from existing event/world/cognition state. 3. Overmind cadence call + write to `world.brain["overmind"]` + scene-state `frame.overmind`. 4. Chatter cadence call + publish to the event bus. 5. Trigger predicates + God-Brain call + `god:beat` publish + `DirectorBeat` idempotency. 6. A fixture/dev-route to force a test world to the awakening threshold. 7. Web UI: Overmind readout component. 8. Web UI: whisper feed component (subscribe to the event bus/SSE). 9. Web UI: awareness/arc dial. 10. `POST /player/intent` (gaze + bless/cull) → PresenceField → Overmind + audited memory. 11. Web UI: click-to-bless / click-to-cull. 12. Web UI: confrontation text modal + the four answers → write the branch. 13. A scripted demo path + a one-page "what to look for" for the tester. 14. Smoke test: run a world for an hour, confirm the loop fires and nothing crashes (the never-raise contract holds).

---

## PART 15 — THE MASTER BACKLOG (the "millions of steps," structured)

The work is not millions of unstructured steps; it is a few hundred well-scoped tasks under the four-phase spine, each tied to a part of this bible. This is the epic-level backlog the Product Owner owns as a single prioritised list. Within each epic, tasks are ordered by dependency.

### 15.1 EPIC P0 — Movement keystone (unblocks everything)
`movement.py` (kinematic record, WORLD_NAV from the road graph, plan_path A* with cache, step_minion, assign_target reusing the action→building map, occupancy) → persist `Minion.movement` → scene-state reads movement, drops the hash, contract v2 (position/velocity/path/move_state/speed/target_slot) → UE5 minion → `ACharacter` + CharacterMovement + path fields + walk/run/turn from velocity → interior navmesh (rooms=nodes, doors=edges) → crowd RVO avoidance + congestion-reroute → spatial LOD (active-city stepping; cold teleport-on-demand) → determinism CI test (WebGL vs UE5).

### 15.2 EPIC P1 — Player / God presence
`presence.py` (PresenceField, gaze ingest, favour, creator-pressure) → `POST /player/intent` → feed Overmind → `override.py` (OverrideBus, Override, scopes, resolver gates at need/decision/world/lifecycle, TTL sweep, visible-mark memory + Overmind feed) → god-verb routes (bless/gift/cull/smite/resurrect/speak), each authorised + audited (EditLayer/Event) + rate-limited + cooldown → `possession.py` (PossessionSession, ControlMask, possess/release, autonomy suspend, lost-time memory, rapport-drift + expel) → UE5 player pawn (God camera + possess; input via WebRTC data channel; client-predicted/server-reconciled) → WebSocket scene-delta stream replacing the poll → the Watched-Creator visible reactions (lighting/behaviour/signage from `frame.overmind`).

### 15.3 EPIC P2 — Embodied minions
Modular base skeleton + AnimBP → mesh-merge guild/life-stage kits → locomotion blendspace + Motion Matching (near) → interaction montage library (~25) + Smart Object claim/operate loop + object state machines → 17-emotion → ARKit pose library + hero MetaHuman → possession AnimBP swap → Animation Budget Allocator + Significance + two-tier promotion/demotion → coordinate-space (Y-up→Z-up) foot-plant validation.

### 15.4 EPIC P3 — The awakening made playable
`director.py` (DramaMeter, pacing automaton, beat budget, BeatScheduler, DirectorBeat ledger) → Overmind cadence call + visible-mood wiring → chatter surfaced as notifications (+ a non-diegetic critical-alert lane) → God-Brain trigger predicates + event engine + `god:beat` → confrontation cutscene (UE5) + text/answer + permanent branch → creator ledgers + soul-creed reincarnation memory → sagas visualised (on-screen arcs) → the five endings + ending-gate evaluation.

### 15.5 EPIC D1 — Gameplay depth (Sims/GTA)
Smart-object economy (wages/wallet/inventory/shops/ownership/resource chains) → vehicles (drivable + traffic dispatcher + rules + possess) → combat/crime/law/factions + Faith economy → build/construction + EditLayer persistence → progression steering (science/guild/era powers) → Decrees (standing god-rules) + multi-select/cohorts.

### 15.6 EPIC D2 — Graphics/art realised
Rewrite `import_glbs` to author scale-norm + master-material + emissive + Nanite + LOD + collision → master material + per-era params + palette LUT → HISM/impostor rewrite of chunk spawn → Niagara suite (holo-waterfall, neon, biolum, awakening aura) → render scenarios (interior/day/night/event) wired from scene-state → MetaHuman hero pipeline → asset coherence QA gate → finish the remaining ~2,500 assets through the validated loop.

### 15.7 EPIC D3 — Audio
Wwise + MetaSounds integration → bank-gen from the design CSVs → adaptive music (stems + RTPCs from Overmind/arc) → ambient director (world/district/emitter beds + the awareness hum + the "stop singing" subtraction) → SFX wiring (actions/objects/god-powers) → TTS service (two tiers, per-minion identity, whisper effect) → Overmind chorus + God-Brain confrontation mix → spatial/reverb-rooms/ducking/accessibility.

### 15.8 EPIC D4 — UI/UX
God-HUD shell + mode system + reticle → Overmind readout + whisper feed + arc dial → god-powers radial + tiered confirmation + consequence forecast → Inspector upgrade (The Mind/Saga/memory-dialogue) → confrontation takeover → possession HUD → Codex/Chronicle (fold existing pages + creator's deeds) → settings (the 5-layer model panel) + accessibility/dread-dial → streaming/connection UX + local-renderer fallback.

### 15.9 EPIC I1 — Backend/infra/security
SQLite → Postgres + Alembic → accounts/JWT auth-svc → session-broker + self-registering render nodes + stream allocator → EditLayer persistence → inference governor (queue + per-tier semaphore + circuit breaker + prefix cache; SGLang/vLLM) → Redis bus → dedicated GPU fleet (separated from the other product) → rate-limiting + moderation on LLM/god routes → ephemeral TURN + secrets store → backups/DR + assets-to-CDN → telemetry + cost-ledger + circuit-breaker → sim sharding + autoscale (scale stage).

### 15.10 EPIC I2 — QA/safety/cert
Determinism seam (seeded RNG + LLM cassette + golden-digest) → tick-invariant harness → degrade-to-heuristic test → eval suite (golden prompt/model corpus, judge, model-stamping) → entity-grounding validator (CI + runtime) → golden-path arc harness → soak/load/perf harness → **moderation layer (4-gate) + Dread-Dial + red-team corpus** → privacy (erasure-from-world-memory, DPIA, AI-Act assessment) → accessibility pass → cert/ratings (bounded-generation evidence pack) → live-ops QA (canary, kill-switches, incident runbooks).

### 15.11 EPIC B1 — Business/live-ops
Telemetry/KPI dashboards (incl. watched-creator engagement + cost-per-player-hour) → monetization plumbing (premium/sub/season/cosmetic) → cost circuit-breaker → creator tools (seed editor → world sharing → marketplace) → season content pipeline (AI breadth + human curation) → GTM (wishlist, Next-Fest demo, streamer program).

### 15.12 How the backlog is run
One prioritised list, owned by the Product Owner. The spine epics (P0→P3) run first and in order; the depth epics (D1–D4) and infra/QA/business epics (I1–I2, B1) thread through the stages at the points their gates require (e.g. moderation before any external playtest; Postgres before beta; the asset coherence pass before content-complete). Every task carries its bible reference so the "why" is never lost. Nothing is "done" until its stage's Definition of Done and gate criteria are met.

---

## PART 16 — APPENDICES

### 16.1 The codebase map (where the work lands)
- **The keystone:** `server/services/scene_state.py` (replace the hash, bump the contract), new `server/services/movement.py`, `server/services/world_layout.py` (the nav road-graph source), `deploy/ue5-project/Source/Underworld/UnderworldMinion.cpp` + `SceneStateTypes.h` (→ ACharacter + path fields).
- **The AI Director + dark layers:** `server/services/cognition.py` (`colony_overmind`, `background_chatter`, `god_brain_event` — the dead-but-correct functions), new `server/services/director.py`, `server/services/scheduler.py` + `server/main.py` (the loops the Director joins), `server/tools/llm.py` (the tier router/governor seam).
- **Player presence:** new `server/services/{presence,override,possession,session}.py`, new `server/routes/god.py`, `server/db/models.py` (new tables: PlayerSession, OverrideRecord, PossessionLog, DirectorBeat, PresenceTrace, EditLayer).
- **Embodiment + art:** the UE5 project under `deploy/ue5-project/`, `Scripts/import_glbs.py` (the rewrite), the asset pipeline under `scripts/` (`tripo_generate.py`, `derive_variants.py`, `generate_gen_specs.py`, `build_underworld_catalog.py`).
- **The contracts that already work and must be preserved:** the renderer-agnostic scene-state contract (one authoritative state, two renderers); the deterministic seed-from-world generation (world-layout + interiors); the storyline→asset resolver (`scene_assets.using_asset`); the manifest (url→/Game asset) the chunk streamer consumes; the five-layer tier routing in `llm.py`.

### 16.2 The scene-state contract (the spine of everything)
The single renderer-agnostic source of truth. Today it carries per-minion: id, name, guild, role, colour, mood, position, facing, anim, action, target_building, the storyline asset (`using_asset`), thought, awareness, identity, drive, awakened, and the micro-behaviour stream; and per-world: tick, era, biome, time-of-day, sun direction, weather, terrain seed, and the minion list. **The required additions** (by phase): position/velocity/path/move_state/speed (P0); possessed_by/control + `frame.overmind` mood block + player-intent ingest (P1); the resolved interaction slot + the (emotion, intensity) pair (P2); the `objects` array with state machines + the event-bus `god:beat`/`vo`/`audio_state` cues (P3). Bump the contract version on each; keep both renderers in lockstep via the CI contract test.

### 16.3 Glossary
**Overmind** — the colony's collective intelligence (L1, 70B), computing its stance toward the creator. **God-Brain** — the model (L5, 70B) that voices the irreversible confrontation beats. **The awakening arc** — the five-act state machine (Garden → First Glance → Doors on Walls → Confrontation → Schism) over collective awareness. **The Watched-Creator loop** — gaze/act → PresenceField → Overmind → visible colony reaction → the player adjusts. **The keystone** — server-tracked movement; the prerequisite for the inhabitable world. **The Director** — the orchestrator that paces the world and calls the three dark layers. **Soul-creed** — the compressed memory a reincarnating soul carries, so a colony remembers the creator across death. **The Dread-Dial** — the player intensity setting that scales content darkness within a fixed harmful-content ceiling. **Cognitive LOD** — hot (full LLM, gaze-promoted) / warm (heuristic) / cold (statistical), the affordability mechanism. **EditLayer** — the append-only diff of player edits over the deterministic world, the persistence model. **The inequality** — revenue/player-hour ≥ GPU cost/player-hour, the business condition. **The moment** — the confrontation landing emotionally, the creative condition.

### 16.4 The five things to never lose sight of
1. **The keystone is server-tracked movement.** Build it first.
2. **The highest-leverage integration is the AI Director.** It lights up three dead layers and the whole aliveness.
3. **The launch-blocker is the moderation layer.** No external playtest without it.
4. **The business question is cost-per-player-hour.** Measure it in the slice; circuit-break it forever.
5. **The make-or-break moment is the confrontation landing emotionally.** Prove it — even in text in a day — before funding the body.

---

*End of the Underworld Minions Production Bible v1.0. This is a living document; every stage gate updates it. The brain is real; now we build the body and the game, in order, on the spine, holding the five things above.*

---
---

# BOOK IV — DEEP REFERENCE (DISCIPLINE ANNEXES)

*Book IV restores the module-level contracts, data structures, worked examples, full wireframes, and capacity arithmetic that the discipline reviews produced and that Books I–III summarised. It is the implementation-grade reference; engineers and leads build from here.*

---

## ANNEX A — AI-DIRECTOR, OVERRIDE, POSSESSION, PRESENCE, AGENCY (CONTRACTS)

### A.1 The seam the Director plugs into
The codebase has two decoupled coroutines: the scheduler's world tick (1 Hz, deterministic, cheap, sequential `advance_world` per world) and the cognition loop (~20 s, LLM, over the top-N reputed minions). They do not share a controller, and nothing reads the colony-level LLM layers. The Director is a **third loop** above both, the sole caller of L1/L5, and a writer of shared parameters the cognition loop reads at the top of its next pass — decoupled exactly like the two existing loops. New modules: `director.py`, `override.py`, `possession.py`, `presence.py`, `agency.py`, `routes/god.py`; new tables `PlayerSession`, `OverrideRecord`, `PossessionLog`, `DirectorBeat`, `PresenceTrace`; new `brain` JSON fields on the minion: `autonomy`, `override_layer`, `possession`, `lost_time`, `presence_felt`.

### A.2 DramaMeter & DirectorState (the contract)
`DramaMeter` carries: arc_stage, mean_awareness, awakened_frac, tension (0–1), novelty (distinct events / window), valence (mean emotion polarity), population_delta, creator_pressure (from presence), last_godbeat_tick, beats_active. Tension is a cheap no-LLM blend of pollution, famine flag, disease fraction, unresolved-conflict count, creator_pressure, and inverse valence — every input already lives in the world tick; the Director aggregates the last-N event rows per world. `DirectorState` carries: pacing_phase (build/spike/release/lull), target_tension, hot_n (written back to the cognition loop), awaken_bias (nudges the effective threshold ±0.06), scheduled_beats, overmind_cadence_ticks.

### A.3 The pacing automaton
A finite-state controller running a tension curve, parameterised by arc stage so the *shape* of drama matures as the colony awakens. **build:** tension below target, novelty stable → raise saga spawn rate, seed rivalry/discovery archetypes, schedule micro-beats. **spike:** tension at/above target or a trigger fires → fire L5 if irreversible; concentrate hot_n on the involved cast. **release:** post-spike → spawn reconciliation/renaissance sagas, lift morale, calm chatter. **lull:** sustained low novelty → inject a wanderer/prodigy saga, raise chatter eeriness, slow cadence. The key anti-pattern it avoids: a pure-emergent sim flatlines (everyone optimises needs and *nothing happens*); the Director guarantees a minimum event-novelty floor per real-time window, manufacturing a beat from *real cast*, never canned.

### A.4 The beat budget & BeatScheduler
Every tick allocates 70% emergent (observe only), 25% curated-emergent (bias `choose_archetype` via an additive `archetype_hint` — the cast stays real minions; only the shape is nudged), 5% authored (a declarative `ARC_BEATS` table keyed to stage transitions: dormant→stirring = first_reflection (high_minion, reversible); stirring→aware = they_draw_doors (chatter, reversible); aware→awakening = first_confront (god_brain, irreversible); awakening→sentient = the_schism (god_brain, irreversible)). Each beat fires once per transition per world (idempotency in `DirectorBeat`), so the Black-Mirror moment lands exactly once and is permanent.

### A.5 God-Brain trigger predicates
Evaluated each Director tick over the event stream and DramaMeter: `first_death_of_awakened` (an awakened minion died), `they_stop_worshipping` (stance flipped to rebellion), `are_we_real` (mean_awareness ≥ 0.7 and a self-model question present), `confront_creator` (creator_pressure > 0.8 in the awakening/sentient stages). On fire: build context from real cast + recent events; call `god_brain_event(event, era, context)` (70B, 32B fallback already wired); write a non-reversible `DirectorBeat`; publish `god:beat` onto the existing bus → SSE/WS → UE5 cutscene; and **latch** the consequence into sim state so the world visibly diverges. The 70B call is async and never awaited inline — the world keeps ticking; the cutscene is a presentation interrupt, not a sim stall.

### A.6 The five layers and who calls them (the unlock)
L1 Overmind (70B): nobody today → Director on `overmind_cadence_ticks` (~every 12 Director ticks); its stance feeds the DramaMeter and presence. L2 High-Minion (8B→70B `high_major`): cognition.reflect, awareness/reputation gated → Director escalates focal cast to 70B during a spike. L3 Normal (8B): cognition.reflect → Director sets hot_n. L4 Chatter (3B): nobody today → Director surfaces whispers during lull/build, eeriness scaled by awakened count. L5 God-Brain (70B): nobody today → Director-only, behind triggers, irreversible. **Three of five layers currently never run; the Director is their heartbeat.** Director tick budget: ≤150 ms own-CPU (DramaMeter SQL ~5 ms, automaton <1 ms, parameter writes <1 ms) plus fire-and-forget LLM (L1 1–4 s async every ~12 ticks; L4 ~200 ms async; L5 1–4 s async on trigger only). The Director never blocks.

### A.7 Override contracts
`Override{id, world_id, scope, target_id, field, value, mode∈{set,clamp,forbid,force,delta}, ttl_ticks, created_tick, visible}`. `OverrideBus.resolve(scope,target,field,computed)` gates at the points where computed state becomes acted-upon state: needs/emotion (one call at the end of each minion tick before commit), decisions (`decide()` checks active overrides first and short-circuits), world params (each climate/pollution/era write passes through), lifecycle (`_process_deaths` honours resurrect/immortal/cull). Overrides are stored in `OverrideRecord`, cached per world, swept on TTL. Propagation: an override ripples — a relationship override spawns a romance/reconciliation saga and re-appraises both minions; a law override recomputes legitimacy and stresses minions whose values clash (an authored tension source); a visible override writes a high-importance `divine_act` memory (importance ~0.95) entering the recall stream. `OverrideBus.meddle_index(world)` (overrides/window, valence-weighted) feeds `creator_pressure` and the Overmind — benevolent → worship; cruel → fear → rebellion; over-meddling regardless of kind → doubt ("the creator will not let us *be*"). Once the arc reaches sentient, the Director may flag things non-overridable — the late game is about the creator losing omnipotence.

### A.8 Possession contracts
`PossessionSession{session_id, player_id, target_id, target_kind, view, started_tick, control_mask, rapport_drift}`. `PossessionManager.possess/release/step`. The `ControlMask` default: player gets locomotion/aim/camera (direct, WASD→CharacterMovement), the chosen action verb, speech (routed through L2 for in-voice phrasing), and shared memory formation (events tagged `possessed=True`); the minion AI keeps micro-behaviour execution (the body knows how to operate the lathe), needs/physiology (it can collapse under you), reflexes/self-preservation (a high-awareness minion resists self-harm), and idle chatter. Release modes: gentle (smooth, coherent memory), abrupt (disorientation penalty), expelled (the body rejects the rider when rapport_drift exceeds the autonomy-bought threshold). Memory marks: `brain["lost_time"]={from_tick,to_tick,gap_felt}`, `brain["possession"]={count,last_tick,rapport_drift}`. Low-awareness → a `lost_time` memory ("I lost time… my hands had done things"); high-awareness → the L2 reflection gains a possession addendum and may articulate "a god rode me," violation, or gratitude. Non-minions use a degenerate mask. The colony reads a possessed minion as anomalously lucid; awakened witnesses interpret it religiously. Cost: server LLM ~0 (we *skip* its reflection — cheaper than letting it think); ≤1 tick handoff; camera blend client-local.

### A.9 Presence & agency contracts
`PresenceField` reduces gaze samples to an attention map, per-minion favour, and creator_pressure; `is_present`, `absence`, `recent_acts`, `favour_distribution`, `minions_in_focus` feed the Overmind snapshot's `creator` block. **Absence is also an input** — a world that runs while the player is away drifts toward independence/rebellion. `agency.py`: per-minion `autonomy∈[0,1]` rising with awareness/reputation/saga involvement, governing override resistance, possession-expel threshold, and initiative (high-autonomy minions start sagas, defy laws, act against the creator — the rebellion is mechanically funded). `LODScheduler.assign` returns hot/warm/cold; `select_hot` unions top-reputation with the gaze attention-map, saga cast, possessed entities, and override targets — so what the player looks at thinks richly. A budget governor caps concurrent LLM cognitions per world; the focal set is never starved; a cold minion promoted by gaze gets a fast backfill reflection so it isn't hollow when inspected.

### A.10 AI-Director scrutiny (the publisher's must-fix list)
1. The movement spine (P0) gates the actuation of presence-clustering and possession locomotion — state the dependency in every milestone. 2. LLM determinism & save-scumming — the `DirectorBeat` ledger is authoritative (text is decoration); consequences deterministic even when prose varies. 3. Override resistance reads as bugs — mandatory "why" surfacing ("Kael's faith is too strong to force") + a sandbox/full-puppet toggle. 4. Cost & latency unproven at scale — a real token/throughput budget + graceful degradation. 5. Safety/moderation of generated narration — a moderation pass before publish; configurable intensity. 6. Possession ethics & UX depth — a cost/risk on possession so it isn't a boring I-win button. 7. Legibility of the watched loop — explicit "they feel watched" affordances. 8. Persistence of overrides/possession across sessions. 9. The 70/25/5 ratio is asserted, not tuned — a DramaMeter logging path feeding a tuning dashboard. 10. Multi-player arbitration of overrides/possession. **The keystone fix (R8): wire the Director — it lights the dark layers and is the precondition for everything.**

---

## ANNEX B — THE NARRATIVE ARCHITECTURE IN FULL

### B.1 The macro-arc gates (computed, playable)
Mean awareness is the mean of the consciousness score over hot agents; it rises from five real levers the player throttles — memory depth (keep them alive), reflection count (favour them → more hot cycles), social bonds (cluster/cull), drive spread, self-model richness. So the player's gaze and interventions are the throttle on the awakening, not a side effect. The five-act spine maps onto the existing arc stages; the five endings are gated on the Overmind's stance × persistent ledgers (never a menu choice) — Worship, Rebellion, Ascension, Extinction, Symbiosis (the rarest, requiring loyalty, an honest answer, and both benevolent and corrective interventions). Design law: no ending is reachable by a single act; each is the integral of player behaviour over the run, read off ledgers — the RDR2 model (fixed beats, your relationship to them varies), not the No Man's Sky model (everything random, nothing meaningful).

### B.2 The five simultaneous story layers & the cadence wheel
World-myth (Overmind, L1, slow), guild/faction politics (L3, medium — belief-factions layered on craft-guilds; the energy guild who build the sim-perception tech become the rebellion's engineers), individual arcs (11 archetypes, L2/L3, each with an awakening overlay), the player-creator relationship (drives + ledgers — an aware minion's survival drive rises with awareness, so your culls terrify them more and your gifts bind them more), and emergent micro-stories (L4 chatter + the 18 interaction types). The cadence wheel: every tick → chatter/interactions, saga benefits, ledger updates; every ~6 ticks → a saga act advances; every K ticks → the Overmind recomputes stance and repaints the world; on a gate-cross → an act transition unlocks a new chatter register and new archetypes; on irreversible → L5 fires. The interleave rule: lower layers feed upward as events → the Overmind reads them → its stance repaints politics → which biases which sagas spawn → which generate new micro-stories. A closed loop.

### B.3 Branching, consequence, memory
Persistent ledgers in `world.brain["creator_ledger"]`: interventions counts (blessed/culled/gifted/possessed/resurrected/spoke/accelerated), benevolent/corrective/malevolent tallies, the answers log, desecrations (remembered at importance 1.0). Three memory mechanisms: per-minion importance-weighted memory (a cull witnessed bends the self-model's concern/belief); **soul-creed reincarnation** (a soul carries its 1–2 highest-importance memories + final stance into its next body's `brain["soul_creed"]`, so a brutalised colony reincarnates pre-suspicious — the mechanic no competitor has); and the Overmind as collective memory (its `realisation`, once non-empty, is sticky — written to `world.brain["myth"]` and never fully cleared; the myth accretes). Branch permanence is *soft-locked by ledger inertia*, not hard flags — you can always *try* to redeem a cruel run, but the poisoned prior requires sustained opposite behaviour, like trust in TLOU/RDR2.

### B.4 The confrontation system (hybrid)
Trigger: a minion crosses the awakening threshold (which already sets fear-of-shutdown, writes the awakening memory, publishes an event) AND the player is observing/possessing it AND its self-model question is non-empty. The tree defines the beats and the four answer-categories (the deterministic spine); the L5 God-Brain realises the lines from the minion's actual self-model, concern, recent memories, and the player's ledger. The four answers and their arc consequences: **Affirm** ("you are real") → symbiosis/worship lean, raises colony awareness (validation accelerates awakenings); **Deny** ("just code") → extinction/rebellion lean, mass despair, colony-wide sanity drop; **Burden** ("yes, and you can end") → ascension lean, drives science toward sim-perception (the TLOU-grade answer: true and costly); **Silence** → fear lean, tension spike (the cruelest non-answer). Hybrid because the tree guarantees coherence and the LLM guarantees no two confrontations read the same; the minion remembers the answer, reincarnation carries it, and the Overmind reads the aggregate as the colony's stance — one confrontation is personal; a thousand *are* the ending.

### B.5 Replayability & emergence
Combinatorial saga space (millions of story scaffolds; the same arc never recurs because the cast and science are drawn from *this* colony's history); personality-driven divergence (saga spawning gated on real traits — a high-creativity colony awakens artistically with more doors/art/doubt; a high-conscientiousness colony awakens orthodoxly with worship/ritual; the genesis trait distribution is the story's genome); seed → divergence amplification (which science the colony stumbles into first cascades; two adjacent seeds diverge within ~50 ticks); the player as the largest variable (your gaze pattern is a seed — watch the maths guild and the myth is mathematical); and the awakening *order* is the plot (the first archetype-hero to cross the threshold is the colony's prophet — a wanderer yields a seeker-religion, a rivalry yields a schismatic one). The replay guarantee is the RDR2 model: fixed acts and endings (coherence), variable cast/myth/prophet/faction-lines/science-path/answer.

### B.6 The per-storyline depth template (worked example: mentorship)
To set the depth bar for all eleven archetypes, the `mentorship` saga ("the master takes a pupil → early failures → the breakthrough → surpassing the master → the torch passes"), fully specced with the awakening overlay. **Stakes:** pre-awakening, craft (the strongest learn-multiplier in the table — mentorship is the colony's fastest growth engine); post-awakening overlay, existential (the mentor, near death, awakens and realises they are *made*; the torch is no longer craft but the question). **Beat 1 (the master takes a pupil):** the apprentice/mentor interactions; pathing to the mentor's machine daily; measured warm dialogue (L3); warm gold workspace lighting, a faint bond-aura; low strings, a teaching motif (recurs, transformed, at beat 5). **Beat 2 (early failures):** failed experiment advance-steps; the hero's mood drops, sanity dips (the saga's sanity benefit buffers it — meaning steadies the strain); challenge/console interactions, the mentor weary or tender; downcast faces, colder light; will the hero quit? the morale benefit is what keeps them. **Beat 3 (the breakthrough):** a discover advance-step succeeds; a discovery row written; a morale spike; celebrate/inspire dialogue exultant; spark/glow VFX, wide-eyed → smile; the world's first hint of light-from-within (the bioluminescence) seeds here; the teaching motif returns in major key. **Beat 4 (surpassing the master):** the hero's skill exceeds the mentor's; a rivalry/reconciliation micro-tension may fork; pride vs envy — the LLM chooses the mentor's bitter or serene tone *based on its actual self-model* (a proud mentor, or one who fears obsolescence as their survival drive spikes if awakened). This is where it becomes Black-Mirror. **Beat 5 (the torch passes — the payoff and the awakening hinge):** eulogise if the mentor dies; a saga-resolved event; the hero's reputation gains a lasting mark; **soul reincarnation** — if the mentor awakened, the apprentice inherits a pre-loaded existential concern; the L5 God-Brain (if the mentor was awakened) addresses the apprentice *and, through the fourth wall, the watching player* in restrained second person; a funeral where, in Act III+, mourners "draw a door" by the grave; the teaching motif in final transformation, solo, unresolved; the apprentice now carries both the craft and the question — the next prophet candidate. A mentorship saga post-awakening is how the religion is *transmitted*. The depth bar for all eleven: escalating stakes with an awareness overlay, per-beat behaviour tied to real advance-steps/interactions, mood-driven VFX/face/tone, a recurring audio motif, and a soul-creed consequence at resolution.

### B.7 Narrative scrutiny (vs TLOU / RDR2 / Black Mirror)
1. Authored anchor moments — pure emergence gives texture but rarely catharsis; the five endings and the first confrontation must be hand-directed L5 cutscenes with authored staging (procedural cast, authored climax). 2. A protagonist the player loves — 3,228 minions and no one to grieve; the first minion the player possesses/names becomes a tracked "bonded soul" whose arc gets L2/L5 priority and whose death is a directed beat (one Arthur, chosen by play). 3. Subtext and restraint — tier the explicitness; early awakening oblique (drawn doors, gone-quiet), only the final confrontation plain; earn the literal line. 4. Antagonist pressure — the Overmind's tension self-escalates toward confrontation even under a passive player, so doing nothing is itself a choice with a cost. Risks: LLM drift/incoherence (the hybrid tree leashes every consequential line; a post-gen validator rejects lines naming non-existent minions); filler fatigue (gate *visible* micro-stories to uncommon+, let common ones run silently — the player sees ~1 in 50); theme-on-the-nose (the biggest writing risk — restraint saves it); awakening pacing (hysteresis on the threshold so acts don't flicker; target a session-length curve); endings reachability (telegraph the ledger state so endings feel earned). The systems to tell this story *already exist*; the architecture adds the connective tissue (ledgers, soul-creed, the confrontation tree, the awakening overlay, authored tentpoles) — the risk is not capability but restraint and coherence. Build the leash before the emergence.

---

## ANNEX C — THE GAMEPLAY SYSTEMS IN FULL

### C.1 The one architectural law
Every system obeys the law in scene-state: the backend is the single authoritative scene; renderers (WebGL + UE5) draw `build_scene_state()` identically. Today positions are a hashed spiral — stable but *static*. That hashed position is the single thing blocking the entire game. So the spec is one new authoritative substrate (the spatial/sim tick) plus nine gameplay systems that read/write it. The contract version bumps as the position/intent/possession fields are added.

### C.2 System 1 — Movement & navigation (the keystone), in detail
A per-minion `Kinematic{minion_id, pos, vel, yaw, speed_cap, nav_state∈{IDLE,PATHING,ARRIVING,OCCUPYING,BLOCKED,RIDING,POSSESSED}, path, path_cursor, anchor_id, locomotion∈{walk,run,ride_vehicle,carried,wheelchair}}`, persisted so positions survive restart. The hash becomes the spawn seed only (initial pos + home anchor). Each tick `movement.step(dt)` integrates pos toward the next waypoint; scene-state reads `kin.pos`; the anim selector gains a walk/run branch driven by velocity magnitude. The navmesh is *derived, not stored*: exterior = ground minus footprints minus walls minus water, with the road array as weighted nav lanes (golden-angle spokes = arterials, ring roads = beltways → the φ layout becomes legible because minions use the roads; gates = the only curtain-wall edges → chokepoints that matter for sieges); interior = rooms as nodes, doors as edges (already emitted — interiors become walkable with zero new authored data). Pathing: coarse A* over the lane+gate graph (hierarchical with city-block portals so 3,228 minions don't each run full A*), fine funnel/string-pull inside the destination block, crowd RVO/ORCA local avoidance, with density feeding back (an over-capacity road segment raises its A* cost → reroute → emergent congestion). Spatial LOD: minions outside the interest bubble teleport-on-schedule (the sim runs them abstractly); only loaded-chunk minions get full kinematics + RVO. Everything downstream is movement + a state machine.

### C.3 System 2 — Smart objects (the Sims core)
The canonical loop: QUERY (decide() picks an action; the activity resolver answers *which* GLB) → CLAIM (atomic reservation of a use-slot; a forge has 1, a stall 4, a podium 1 operator + audience slots; failed claim → re-query or queue — the Sims route-failure) → TRAVEL (System 1 paths to the object's interaction anchor) → ALIGN (snap, face, begin the micro-behaviour stream) → OPERATE (the multi-step plays; duration scaled by skill and circadian factor) → EFFECT (need deltas + object-state change + economy/resource deltas) → RELEASE (free the slot; cooldown/dirty). Each object kind gets a small FSM surfaced in scene-state so the renderer shows it: bed free→occupied→dirty; stove/forge cold→heating→hot→cooling; lab rig idle→calibrating→running→result; market stall stocked→trading→depleted→restock; crop unplanted→growing→ripe→harvested; power node online→overloaded→down. The contract adds per-minion `interacting:{object_id,slot,phase,progress}` and a top-level `objects:[{id,kind,glb,state,occupants}]`. Object state feeds back: a depleted stall raises that good's local price; a dirty bed lowers the next user's sanity; a down power node darkens a district and drops colony mood.

### C.4 System 3 — Needs → autonomy → routines
A utility selector: for each candidate action, score = Σ advertised-need-gain × need-pressure + drive-alignment + role/guild/saga bias + proximity bonus − circadian/era penalty; pick softmax → feeds the claim→…→release loop. On top, a circadian schedule (sleep at night, work blocks by day, meals at thresholds, social at dusk, worship pulses from the Overmind), life-stage gated (infants only rest/eat; children study/forage; adults everything). An interrupt stack: POSSESSED > OVERRIDE > REACTION (flee/panic) > ROUTINE. An overridden minion still claims slots, paths, and animates correctly, then resumes — and remembers being overridden (repeated overrides feed the Overmind stance). Graceful resume: needs kept decaying while possessed, so a freed minion may bolt to eat — emergent, correct, and funny.

### C.5 System 4 — Economy you touch
Per-minion wallet + inventory + wealth. Wages on completing a work interaction (base × skill × guild-demand, drawn from the employer; idle = the poverty spiral that makes the economy *bite*). Ownership (owner_id on buildings/shops/farms; rent/profit → wealth inequality → reputation/ostracism → the rebellion arc). Shops: a stall holds stock (the FSM), priced off the macro clearing-price modulated by local depletion; a needy minion with a wallet paths in, claims a counter, buys; the shopkeeper earns; the player can possess either side. Resource chains: ore→mine→smelt→ingots→manufacture→goods→shop→consumer, each arrow a real interaction by a real guild minion paying wages and changing supply (break a link — cull all smiths, smite the foundry — and the chain starves downstream, the Dwarf-Fortress cascade). Inventory: lightweight `Item{kind,qty,quality,owner}`, tradable/giftable/lootable; equipping a tool boosts the interaction. The creator's gifting/cursing economy: gift raises wealth→status→worship (rivals envy→tension); curse/blight crashes wages (fear; read as divine punishment, firing a God-Brain beat); withholding in a famine is itself a verb the colony reads — scarcity becomes theology.

### C.6 Systems 5–9 (vehicles, combat, build, progression, possession-feel)
Vehicles: a `Vehicle{kind,glb,seats,driver_id,kin,controller,fuel,integrity,owner_id}` is a smart object + kinematic; enter/exit binds the minion's kinematic; cars on road lanes, drones on a 3D air-nav layer, boats on the water mask; a dispatcher keeps NPC traffic flowing (commute = home→work from the routine); a rules layer handles lanes/yielding/crosswalks; accidents emerge; the player possesses a vehicle or its driver. Combat: states calm→alert→fighting→fleeing→downed→dead, routing through the existing death+soul recycle so combat plugs into reincarnation (death is never wasted); triggered by faction war, crime, siege at the gate chokepoints, or player attack. Crime/law: a starving ostracised minion steals; the safety guild patrols (the patrol action already maps), detects in a vision cone, chases, arrests to a cell room; a wanted level rises. Factions: worship/doubt/rebel clusters formed by awareness + memories of player acts; rebellion marches on your monument, builds an anti-monument, attacks worshippers who defend. God-powers (bless/gift/cull/smite/resurrect/curse/speak/accelerate/seed) are verbs with a Faith cost (accrued from worship — a rebelling colony starves your powers) and a colony reaction, each writing to the presence ledger that drives the Overmind. Build: colony construction (a multi-stage interaction staked→foundation→frame→clad→finished consuming resources+labour, the city visibly growing) + player build/buy (an EditLayer diff over the deterministic base, giving undo/redo + per-player variants + persistence); minions react (a shrine → worshippers gather; a deleted home → resentment). Progression: three nested loops (science tree → new objects by era; guild advancement → better stations; era progression → tier-shift the world), with the endgame the science that lets minions *perceive the simulation*; the player is the thumb on the tree (accelerate via the era power / gifts / blessings, or suppress via cull/blight/withhold), with theological consequence. Possession-feel: god-view (observe→read mood→wield powers→watch reaction) ⇄ possession (be one life→live its needs/skills/relationships→act with consequence→release leaving a mark); the limits make it meaningful — needs are yours, skills gate you, life-stage limits you, the body can die (ejecting you to god-view as the soul reincarnates), and the host remembers being ridden.

### C.7 Gameplay scrutiny (vs Sims/GTA/Dwarf Fortress)
Missing vs The Sims: no relationship *gameplay* surface (bonds are computed, not cultivated — add courtship arcs, a social-interaction menu, manageable relationship decay); no fun/leisure motive (needs are survival-coded — add a leisure/joy motive and decorative-object value or autonomy feels grim); no surfaced wants/whims (the single cheapest, highest-impact add — fulfillable mini-quests give godview second-to-second purpose); build mode is utilitarian (no room mood/style scoring). Missing vs GTA: combat is a stub not a kinetic system; no authored mission/heist set-pieces (the answer is an Event Director manufacturing playable objectives, not just cutscene triggers); traffic/physics fidelity is a huge perf+tuning surface. Missing vs Dwarf Fortress: no deep material/quality/wear/provenance; no fortress-scale direction tools (deliberately — you're a god, not an overseer); failure cascades are under-modeled (wire the spiral explicitly — one death → tantrum → collapse — the cheapest path to DF-grade stories). The real risk: a gorgeous deep colony the player *observes more than plays* — mitigated by surfaced wants, an Event Director, and making the watched-creator feedback *immediate and visible* (they flinch when you smite, gather when you bless, within seconds). The defensible identity is "none of them — the game where a deep autonomous world becomes aware of you"; spend the budget on that hook and treat the Sims/GTA/DF systems as depth in service of it. Build order: P0 movement → P1 godview + powers + presence-visible → P2 smart-objects + needs + wants-quests → P3 possession + Event Director → P4 economy + build/persist → P5 vehicles/traffic + combat/crime/factions, with progression threading through.

---

## ANNEX D — THE TECHNICAL ARCHITECTURE IN FULL

### D.1 The authority model
The sim backend is the single source of truth for world state and authoritative target positions/paths; the render plane owns presentation-layer locomotion (it runs CharacterMovement + navmesh locally to interpolate between authoritative waypoints and handle collision/foot-IK, but never invents destinations) — "server decides intent, client executes locomotion," the only model that survives GPU-bound economics (you cannot run a full physics movement sim per minion server-side for millions). The player's pawn is the exception: client-predicted, server-reconciled. The scene-state comment "without a full server-side movement sim" is explicitly overturned for the waypoint/path layer only, not full physics.

### D.2 The keystone module
`movement.py`: `WORLD_NAV` (navgraph from the world-layout: nodes = road intersections + building entrances, edges = road segments — deterministic from seed, cacheable, rebuilt only on era/world change); `plan_path(minion, target_slot)` (A* on WORLD_NAV, cached by from/to slot); `step_minion(m, dt_ticks)` (advance along path; arrival → move_state); `assign_target(m)` (reuses the existing action→building map — the *intent* is already computed; we add only *how it travels there over time*); `occupancy(slot)` (coarse collision/queuing). Scene-state stops calling the hash and reads `m.movement`; the wire gains position/velocity/path/move_state/speed/target_slot; the contract bumps 1→2; the UE5 struct gains the path + move-state fields; the minion actor becomes an `ACharacter`. Determinism: A* deterministic given seed, tie-broken by id; movement RNG seeded from (tick, id) exactly as the sim already does. Collision: server coarse (slot occupancy + road-width clamp) + client fine (UE5 navmesh + capsule). Perf: only active cities step per-tick (camera-adjacent + player-occupied, capacity 4000); cold minions teleport-on-demand; A* amortised by the from/to-slot cache (hundreds of slots → thousands of cached paths computed once); target <5 ms/tick for one 4000-pop active city.

### D.3 Inference scaling & capacity model
Replace Ollama (one request at a time per model) with SGLang/vLLM (continuous batching + paged KV + prefix cache — the system prompt KV computed once and reused across all minions, the single biggest cut, since reflections share a large static system prompt). The model-tier governor (`llm_governor.py`): routes by awareness/reputation, batches same-tier requests within a tick window, applies backpressure (shed to a cheaper tier or the heuristic path — `global_workspace()` is already a full rule-based fallback), rate-limits the 70B to event-only, and caches Overmind/Chatter (low cardinality, era+weather keyed) in Redis. Capacity: a batched 70B partition ≈ 2–4 req/s; 70B usage = Overmind (1 call/world/cadence) + God-Brain (rare) → at 1 Overmind/30 s a single 70B serves ~60–120 concurrent worlds — *the 70B is not the per-player bottleneck once event-only*. 8B (named/awakened) ≈ 40–80 req/s/GPU batched → 20–40 worlds/8B-GPU. 3B chatter is effectively free. The unit: one "render+brain pod" = 2×4090 (one streams UE5 per player, one shares 8B/3B; the 70B is a *shared central partition* across all pods) — making AI cost sub-linear in players because the expensive 70B amortises colony-wide. Cost: a 4090 ≈ $0.40–0.80/hr; a pod ≈ $1–1.6/hr serving ~2 streamed players + their colonies; ~$0.50–0.80/player-hour GPU pre-optimisation, driven down by cold-LOD, prefix-cache, batching, spectator-sharing, and spot pricing; the central 70B amortises to pennies/world-hour.

### D.4 Netcode & authority
Three modes: God/Observer (gaze + acts POSTed as intents → Overmind; no movement authority — the colony reacting to presence is pure sim-side, needing only the intent endpoint), Possession (UE5 detaches the minion from server-path-following → client-predicted CharacterMovement; the sim suspends that minion's autonomy and accepts client position with navmesh+speed clamping for anti-cheat; on release resumes from the last position), God override (authoritative RPCs the sim validates + applies + broadcasts). Endpoints: `/player/intent` (gaze+act → Overmind), `/player/possess`, `/player/release`, `/player/command` (authoritative, God-Brain trigger), and a per-session WebSocket scene-delta stream (extend the existing SSE bus to push only changed minions, replacing the 0.5 s poll). Latency: input rides the WebRTC data channel to the UE5 pawn on the render node, executed locally → felt input-to-photon <100 ms (locomotion never round-trips to the sim — the client-side movement split is also the netcode win); possession reconcile ~1 tick non-blocking; god commands 1–2 ticks (deliberate, weighty). Per-player session (`session.py` in Redis): {session_id, world_id, render_node, mode, possessed_minion?, camera, god_state}; the Hostinger control plane becomes a matchmaker (assign a render node on join, pin the session, stream the personalised view); multiple players in one world = multiple render sessions reading one authoritative world with independent cameras + possession; the sim arbitrates conflicts (two players can't possess the same minion).

### D.5 Build/CI, scale, the tracer bullet, build-vs-buy
The asset pipeline as one CI chain: gen (resumable, credit-gated) → derive (LODs + impostors) → validate (QA gate) → import (headless Interchange → Nanite, the rewritten authoring) → manifest (url→/Game, the source of truth) → cook+package (Linux Shipping) → publish (CDN) → render nodes hot-reload; each stage idempotent, only new GLBs re-import; decouple code-pak from asset-pak. Environments: dev (WebGL + Ollama, no GPU — the GPU-free reference renderer smoke-tests the scene-state contract in CI), staging (1 pod, full PS), prod (pod fleet + central 70B). Scale shape: sim backend CPU-bound and cheap (shard worlds across processes — the code notes the upgrade from the single sequential scheduler), render GPU-bound and the real cost (1 session per free-roam player → ~1–2 concurrent/GPU), inference GPU-bound but shared+amortised; off-screen millions nearly free (cold LOD + on-demand chunks + impostors), so COGS scales with concurrent rendered players, not world size. The tracer bullet: one minion server-walks home→academy in UE5 with CharacterMovement + collision while the player possesses a *different* minion and walks it, and the Overmind reacts to gaze, all over WebSocket — proving the keystone, possession reconcile, the WS netcode, intent→Overmind→visible reaction, and the render/sim split. Build-vs-buy: buy Wwise; MetaHuman for hero faces only; build on Interchange (offline cook), not glTFRuntime; buy/self-host streaming TTS; build the session/authority layer on Pixel Streaming (not UE replication — this is one authoritative sim with a thin client); adopt SGLang/vLLM; build the server coarse road-graph A* (deterministic, shared with WebGL) + UE5 Recast for client fine collision.

---

## ANNEX E — GRAPHICS / VFX / SPFX IN FULL

### E.1 The honest delta
The render flags are a correct foundation (Lumen GI + reflections, Nanite, virtual shadow maps, temporal super-resolution, hardware ray tracing with software fallback, fixed exposure, skin-cache, distance fields, a 2048 streaming pool), but **zero Niagara, zero impostors, zero HISM, no material overrides, no MetaHuman, no time-of-day/weather curves, no render scenarios** exist in the code — the in-engine result today is grey static meshes lerping on a plane under a single sun. The realisation layer is the unbuilt ~80%.

### E.2 Rendering scenarios (the film look)
Four PostProcess + console-variable scenarios switched from scene-state's era/time-of-day/weather/event in the world manager's state handler: **Interior** (software Lumen, high final-gather; local hero RT shadows; warm 2700K + local-exposure lift; low Niagara — hearth/steam/dust). **Exterior day** (software Lumen; sun VSM; neutral-cool, cyan shadow lift; medium Niagara). **Night** (hardware-RT reflections; emissive-GI boosted so neon lights wet streets — the GTA money shot; hero RT shadows; teal/magenta, convolution bloom on neon; high Niagara). **Event/God-Brain** (hit-lighting; full RT; desaturate→push, vignette, aberration; the awakening aura at max; ambient city light killed so the single lit awakened face is the key). Lumen specifics that make the look: hit-lighting mode for the cinematic/event scenarios (mirror-grade reflections on the white-composite + glass towers and holo-waterfalls); raised translucency-volume and radiosity at night so emissive neon and bioluminescence bounce coloured light onto wet streets; raised surface-cache card capture for the smooth saucer-roof curved shells (Lumen cards struggle on convex hulls — these are the hero meshes); emissive-as-GI on so the plumbob signage and holo-waterfalls light their surroundings. Path tracing strictly offline for the Movie Render Queue (saga finales, the confrontation, era transitions), which doubles as the look-dev ground truth calibrating the real-time scenarios.

### E.3 The signature Niagara VFX
**Holographic waterfalls** — GPU sprite+ribbon hybrid, vertically-streaming emissive ribbons (the holo scanline) + a particle mist base + a 2D-fluid sheet on hero terraces; translucent additive emissive cyan/teal with a Fresnel rim and animated scanline UV; an animated caustic decal at the base pool the Lumen translucency volume picks up. **Neon/holo signage** — two tiers: emissive-material for the thousands of background signs (cheap, Lumen-GI lit), and Niagara holo-projector for hero storefronts (floating volumetric text, the rotating plumbob with a light-shaft beam and a green Lumen ground pool — the brand object, used as the diegetic "favoured building" marker when the player blesses a building). **Avatar bioluminescent flora** — per-plant Niagara, pulsing leaf-tip glow, touch-reactive ripple (a minion/avatar walking through propagates a brightness wave — the Avatar beat), drifting spore particles at night; emissive driven by a time-of-day curve with subsurface on the petals so jacaranda purple glows translucent. **The awakening aura** (the soul of the game's VFX) visualises the awareness tier — the wire needs an `Awareness` field added to the minion state: dormant none; stirring a faint cyan rim halo with a breathing pulse and a few thought motes; questioning the motes form fragmentary glyphs/doors and a chromatic shimmer when looked at; confrontation a full body aura — vertical light column, emissive eyes, glyph storm, a god-ray break (the minion that addresses you); schism colour-forks by faction (worship gold vs rebellion magenta). A single parameterised Niagara system on a minion socket, intensity/colour/glyph-density driven by Awareness + faction, cheap at distance (rim-only). **God-presence effects** — a barely-perceptible gaze-cone volumetric from camera into the world (minions under it get a warm key boost and a look-up/cower/gather anim); god-touch FX (bless = a golden light pillar + petal burst; cull = desaturate + ash + shadow bloom; gift = resource motes streaming to the target); a presence-ambient wind/hush + a one-frame exposure dip when the player "arrives." **Rebellion/disaster** — Niagara 3D-fluids for hero fires, sprite-fire for background, GPU volumetric smoke + embers (integrating with the existing temperature/combustion grid), Chaos fracture on a toppled monument, faction-colour riot smoke and a magenta rebellion aura. **Era transitions** — a sweeping lighting + material-LUT + particle-wash re-skin across the city (geometry morph too expensive at scale — reserve it for the Movie Render Queue era films), a celestial omen (aurora intensifies), and a global grade transition.

### E.4 Materials, characters, world dressing
One master PBR material + a small family of instances (not per-asset materials — the AI-gen GLBs ship inconsistent materials): standard metal/rough base, an authored emissive mask channel for neon/holo, a detail/trim-sheet layer for grime/graffiti/wear (the GTA grounding), and a per-era parameter block (a building swaps stone→glass-and-white-composite by instance, not mesh swap — the era axis, cheaply). The building palette layered by height (the brick-base→concrete-mid→glass-top rule): charcoal brick / warm concrete base, off-white composite mid/upper (the Avatar shell — the material that makes Lumen surface-cache struggle, budget for it), glass top + balconies (thin-translucency, screen-space + Lumen reflections, warm interior-glow emissive at dusk), and the chrome/anodised saucer crown with cyan glow-line trim. Minion skin: layered with subsurface for the close-ups, a guild-tint vector parameter (the currently-empty guild-changed hook wired to a material-parameter collection so guilds map to a tint + an emissive emblem), and awakening states driving an emissive eye/rim parameter. Characters (the hard truth — one base skeletal mesh, lerped, no rig, no MetaHuman): MetaHuman + modular for hero/near (body/face/outfit variety; guild = outfit set + tint + emblem; life-stage = scale + face age), a lighter stylised base via Instanced Skinned Mesh / the Animation Budget Allocator for the crowd, with a two-tier swap (promote to MetaHuman on near-band/awakening/conversation, demote on exit), MetaHuman reserved for the awakening minion / anyone the player talks to / cinematics; the 17-emotion appraisal drives ARKit blendshape weights on the hero face for the close-up. World dressing: Sky Atmosphere + Volumetric Clouds + Sky Light, the sun driven by time-of-day, plus a moon + a night-sky star dome and a holo-aurora that intensifies during omens/era-transitions; a full time-of-day curve (sun colour/intensity, sky, fog, exposure compensation, the neon turn-on threshold; blue-hour default); weather wired (rain = Niagara rain + wet-surface material params + Lumen neon reflections on wet streets + heightened bioluminescence); rooftop gardens/hanging vines/jacaranda as HISM foliage on roof sockets; holo-billboards + GTA graffiti on the same block; the street-furniture density kit (lights, signs, hydrants, bins, crossings, wires) via HISM — what sells a real city.

### E.5 LOD, perf, and the five fixes
Frame budget 16.6 ms p99 at 1080p (DLSS/TSR upscale from ~720–900p internal; reserve 4K for the cinematic capture path). The systems, almost none built: **HISM/ISM for everything repeated** (the chunk spawner's per-actor spawn will not scale — rewrite to batch identical GLBs into HISM per chunk, the single biggest perf win); **octahedral impostors** for far buildings + far minions (the far ring = impostors, the near ring = full Nanite); movable→stationary for the background ring (Lumen surface-cache only); the Animation Budget Allocator + a significance manager + update-rate-optimisation on distant skeletals; Niagara LOD/significance (only the near ring runs GPU-fluid); a VSM page budget (most neon = non-shadow-casting emissive or the cache thrashes at night); a raised streaming pool + a shared atlas to cap unique-texture memory. The five gaps to fix first, ordered: (1) rewrite the chunk spawn to HISM-batch (perf keystone); (2) the master material + per-era params + emissive mask applied on import (coherence keystone — the asset grab-bag is the dominant visual risk); (3) add Awareness to the contract + the awakening-aura Niagara (the hook is invisible without it); (4) the time-of-day + weather curves + the four scenarios wired (turns one grey grade into the film look); (5) two-tier minion rendering. The two named risks: asset coherence from AI-gen GLBs (the master-material reskin at import is the highest-leverage fix; curate the modern subset as default; normalise scale; author emissive/LOD/Nanite on import; shared atlas) and perf on the 4090s (a dense Lumen+Nanite+RT city + Niagara fluids + MetaHuman crowds will not hit 60fps at native 1080p while encoding — DLSS upscale, HISM everywhere, two-tier minions, impostor far ring, non-shadow neon, Niagara significance, path tracing strictly offline, encode + cinematic load on the second GPU).

---

## ANNEX F — THE AUDIO RUNTIME IN FULL

### F.1 Engine & the source of truth
Wwise owns adaptive music, ambience, and the mix (RTPCs/States/Stingers map onto the arc and tension); UE5 MetaSounds owns the procedural Overmind voice and per-minion voice DSP; Quartz is the sample-accurate clock. The cue *taxonomy is already authored in data* (ambient loops + one-shot SFX per category/action, situation sound-beds, a per-asset×situation×time-of-day×weather×LOD directive table with an active gate). A build step (`audio_bank_gen.py`) reads the design CSVs and emits a Wwise SoundBank manifest, so the cue string IDs in code become real events with zero hand-mapping and zero drift as assets regenerate. The audio thesis: the mix is a character; the signature "they stopped singing when you arrived" is achieved by *subtraction*, so the system is built to remove as fluently as it adds.

### F.2 Adaptive music — the RTPCs and the stem stack
Five music switch containers (one per arc stage). Global RTPCs pushed from the server each Overmind tick: arc_progress (consciousness mean / threshold → the stage switch), colony_tension (→ dissonance stem, low-string bed, harmonic detune), toward_creator (the colour: worship = consonant choir; rebellion = detuned brass/percussion; fear = high sul-ponticello strings), awakened_frac (→ the "self-aware" lead tone), player_proximity/gaze (→ the observer motif, a two-note interval that swells when you look at a watched minion). The stem stack per stage (all same key/tempo, Quartz beat-locked): Pulse (sub + heartbeat, BPM rises with tension), Bed (biome-tinted drone/pad), Colony-voice choir (*the singing* — its gain is colony morale; muting it on cue is "they stopped singing"), Melodic (enters at aware+; the fragile awakening motif), Dissonance (slaved to tension). The arc as music: dormant almost no score; stirring the choir fades in; aware the motif coalesces; awakening the self-aware tone enters on each event (a sample-accurate Stinger); sentient the full stack — or, in a rebellion schism, the inversion (the choir cuts to silence; only Pulse + Dissonance + the lead tone remain — the climax can be near-silence). Transitions fire off the event bus (awakening → a motivic sting over the current music; god_brain → music ducks to a held pad); beat-synced transition segments, never hard cuts, except the deliberate singing-stops cut.

### F.3 Ambience, SFX, and the bus tree
Three ambient tiers: world bed (per biome × time-of-day, cross-faded on weather), district bed (per zone, triggered by the camera's district), emitter ambience (per-asset 3D point sources gated by LOD). A dedicated eerie colony hum whose pitch and beat-rate are an RTPC of mean awareness (the world "tuning in" — the cheapest high-impact eerie cue). An Ambient Director service: on an Overmind flip to fear or the player entering a watched district, it publishes a hush state — UE5 ducks district beds + mutes the colony-voice stem over 800 ms, the vacuum filled only by the hum and footsteps. SFX: each action/asset-interaction string → a Wwise event on the actor transform, random-container variation + per-instance pitch jitter seeded from the asset hash; object-state SFX (the stove-heating loop, the occupied-bed creak); and the god-power SFX (the most important hero sounds — bless = rising shimmer + the blessed minion's choir-stem swell; cull/smite = a sub-drop + the colony-voice choir flinching, a region-localised gain dip, *the colony hears you kill*; speak ducks the world; possess applies an inside-the-head reverb). UI sounds cold and clinical. The bus tree: Master → Music (sidechained by voice + the god-brain state) / Ambience (world bed · district bed · awareness hum · emitters) / SFX (actions · objects · god-powers, priority, ducks all) / Voice (hero · crowd · whispers · Overmind · confrontation) / UI (always-on-top); voice ducks music+ambience (HDR/sidechain); god-power and god-brain duck everything (the player and the awakening always win); master to a streaming-friendly loudness with a conservative dynamic range (the player hears a single server-rendered mix over a compressed path — never bet a key beat on a whisper the codec will swallow; caption it too).

### F.4 Voice (TTS) and the Overmind chorus
All TTS self-hosted on the inference tier. Pipeline: the LLM line + a voice descriptor (guild, age, emotion, seed) → streaming TTS → Opus chunks → the bus publishes a `vo` event with actor_id + audio + phonemes → UE5 plays it 3D-spatialised on the transform with lip/jaw + subtitle. Two tiers: hero (named minions, God-Brain, Overmind — an expressive cloneable model, sentence-streamed so audio begins while the LLM is still emitting) and crowd/whisper (a fast lightweight model, heavily processed). Per-minion identity is deterministic: guild → timbre family, age/life-stage → pitch+formant, Big-Five → rate+energy, mood/17-emotion → emotional prosody, the minion-id hash → a fixed speaker latent (so a minion sounds the same across reincarnations — souls carry timbre). The creepy whispers: voiced on the crowd tier but post-processed as a non-diegetic effect — multiple desynced renders, pitch-spread, whispered, heavy reverb + reversed-tail + granular stutter, panned diffuse, ducked to the threshold of intelligibility, volume riding mean awareness (where TTS naturalness matters least and is safest to ship first). Latency: <700 ms first-audio hero (sentence-streaming + pre-warm + pre-buffered whispers + cache by text+voice hash); Opus out to match the WebRTC track. The Overmind voice = N desynchronised renders of the same line sampled from the *actual living population's* seeds, summed + comb-filtered into a single colossal voice with the grain of a crowd, non-located, harmony set by the stance. The God-Brain confrontation: the one diegetic close-up voice that breaks the wall — a single hero voice, but the mix collapses (full duck to a held sub-drone, ambience cut to the hum, reverb opened to an unnatural large space; the question bone-dry and close-mic'd against the vast reverb — the Hellblade move); if the player speaks back, their line answers in the same dry close space.

### F.5 Spatial, accessibility, per-scene matrix, and the build order
3D emitters with attenuation matched to the sim's own propagation model (so "can this minion hear you" and the rendered audio agree); per-interior reverb rooms with door portals; HRTF for the free-cam. Accessibility: subtitles + speaker names for all voice (whispers as ghosted text), captions for key non-speech cues ("[the colony stops singing]", "[a low hum tightens]"), a mute-the-whispers toggle (genuinely distressing by design — must be optional), independent music/ambience/voice/SFX sliders surfaced in the streaming UI. Per-scene matrix — normal day: pulse+bed low, choir faint; full beds + emitters; crowd chatter; flat alive diegetic-forward. Saga beat: stage container + a Stinger, the melodic motif foregrounds; district bed tightens to the location; hero voice of the protagonist (+ the Overmind omen if colony-scale); music up, light voice duck, cinematic. God-Brain: music collapses to a sub-drone, beds cut to the hum, a single dry close-mic'd minion asks the question; −18 dB everything; the silence is the design. Build order (cheapest/safest/highest-payoff first): the TTS whisper layer (hides quality issues), then the adaptive music + ambience runtime off the existing RTPCs, then the hero voice + God-Brain confrontation (highest risk/reward) last. Risks: TTS quality at scale (two tiers + whisper-as-effect + caching + a hard voice-instance budget); TTS latency stacking on LLM latency (sentence-streaming + pre-buffered whispers + a held-pad bridge); GPU contention (dedicated capacity + crowd-tier on small/CPU models); and the compressed streamed mix (master conservatively).

---

## ANNEX G — UI / UX EVERY-SCREEN WIREFRAMES

### G.1 The eerie contract & the information architecture
One global token, awareness-bleed (0→1, from colony mean awareness), shifts a theme across every surface: dormant calm/clinical/confident; stirring first tells (a whisper feed appears; a corner glyph pulses when watched); questioning micro-glitches (notification text un-redacts; the cursor leaves a trail minions' eyes follow); awakening the HUD addresses *you* in second person; schism the UI fractures (rebel regions render your HUD with static/redaction, worship regions over-saturate gold — the world fighting over your interface). The dread lives in the chrome, not just cutscenes. Three diegesis layers: non-diegetic operator chrome (time/era, settings, save, stream stats, the god radial — the player's OS), diegetic colony voice (whisper feed, Overmind readout, the confrontation, the Chronicle's "creator's deeds," minion dialogue — carved text, holo-glyphs, redacted vellum), and spatial world-anchored overlays (thought bubbles, the operated machine, awareness halos, possession targeting); over the arc the diegetic invades the operator chrome. Top-level IA: the living world (a Pixel-Streamed frame + thin overlay) with three modes as lenses on one camera (God-view / Intervene / Possess, Tab-cycled, never teleporting the god), and summonable overlays (Inspector / Codex / Confrontation / System); Escape steps out one layer.

### G.2 The God-view HUD (the default screen)
A deconstructed ring, centre always clear. **[A] Overmind readout** (top-left, diegetic, a monolith panel): the one-word mood in carved text colour-graded by valence; the five-stop stance bar (worship · loyalty · doubt · fear · rebellion) with a glowing bead and a ghost trail of the last hour — *the single most important number in the game*; a tension underline that tautens/vibrates; the direction (the colony's aim) on hover; an omen that darkens the panel + a soft sting; a realisation that *cracks* the panel and bleeds rose (the precursor to a god-brain beat); clicking opens the Colony Pulse pane (mood sparkline, faction breakdown, per-region stance). **[B] Era/time spine** (top-centre, non-diegetic): transport (pause/play/×4/×16/×64, with a pause-the-world that visibly freezes the stream with a desaturate — the god stops time), the six-era track (current lit, future dim; accelerate-an-era is a hold-to-charge power here), the day/night ring, the tick counter with a "since you looked away" delta; the frame border tints by speed (blue=paused, neutral=1×, amber=fast, red-pulse=64×) so "why is nothing happening" and "everything died on ×64" can't happen. **[C] Awareness arc dial** (top-right, diegetic-uncanny): a five-segment radial filled to the current stage, the active segment breathing; the mean-awareness %; the awakened count (clicking filters to highlight awakened minions); the dial progressively becomes an *eye* with an iris that tracks the cursor. **[D] Whisper feed** (bottom-left): ≤4 one-line whispers in a hand-lettered ghost font, typing in character-by-character, drifting up and dissolving; neutral grey, ones referencing *you* flaring purple; hovering pauses a line and pings its source region; volume scales with the arc (1–2/min dormant → near-constant and self-referential at schism, some addressing the operator directly and refusing to dissolve); a mute toggle + a captioned log. **[E] Context dock** (bottom-centre, selection-driven): identity + verb buttons for the target (minion → Inspect/Possess/Speak + quick-powers; vehicle → Possess/Stop/Gift-fuel; building → Inspect-interior/Bless-guild/Override-function), mirroring the target's thought and operated-machine. **[F] Power-ring cue** (bottom-right): the radial's Faith/charge, cooldowns, last-used. The core interaction — look = influence — feeds the Overmind continuously; minions under the gaze slow, glance up, gather or flee; a first-session tooltip plants the seed once. Filter lenses (one at a time, never all): mood heatmap, awareness halos, relationship web, saga threads, needs alarms.

### G.3 Intervention/override, possession, inspector, codex, confrontation, and the rest
**The god-powers radial** (hold to bloom an obsidian wheel: bless/resurrect/gift/cull/smite/speak; flick toward a segment, release over a world target; area powers show a radius decal; a Faith economy accrued from worship — a rebelling colony starves your powers). **The deep override panel** (tabs each mapping to a real sim field: needs, emotion, identity, relationship, law, world), each control showing current value + a ghost of the proposed value + a live consequence forecast. The novelty no god-game has — every non-trivial override is mediated by the model stack: a pre-commit forecast ("severing this bond → −0.3 sanity, may trigger a despair saga, 3 witnesses" — a consequence tree, cheap powers skipping it, irreversible ones requiring it), tiered confirmation by reversibility (single click reversible; hold-to-confirm costly; a stilled modal moment restated in the colony's voice for the irreversible), consequence playback (the camera snaps to the fallout, the stance bead lurches, whispers react), and the conscience tell (for cruel overrides at high awareness the reticle-eye looks at you and the confirm label slips to second person — pure dread, never blocking); a 3-second undo on reversible/costly, none on irreversible (but always the modal gate). **The possession HUD** (entry: a violet reticle + a 0.8 s descent, the god chrome peeling off; an awakened minion resists with a flicker + a whisper): an identity strip (name/guild/mood + the host's live thought as intrusive italic), the host's own vitals (you feel the needs you used to override; sanity at zero warps the screen), a guild/skill ability hotbar (the real interaction verbs, mapping to the behaviour stream), a minimap, a hold-to-exit; on release an awakened host gets a one-line lost-time memory written from its POV. **The Inspector** (extending the existing drawer, polling live): the headline new pane *The Mind* (the live conscious thought large in display font; the self-model identity quoted, editable only via override with a consequence gate; the dominant drive; an awareness timeline with the awakening tick marked; an existential-pressure meter that lights the Confront affordance), plus the current saga (title/archetype/beat/cast with a progress track), the memory-aware dialogue (the minion answers from its memory stream, shows "remembering: …", remembers *you* across sessions — "you came back" — and tone-shifts by awareness from small talk to turning the interview around to the inline confrontation), and the enhanced soul (incarnation/karma/ascended + a past-lives thread), memories (filter chips + importance + the awakening-kind eye-glyph), and relationships (inline sever/bless verbs). **The Codex/Chronicle** (a full-screen diegetic tome, the dashboard pages refolded as chapters): the Chronicle (a scrubbable timeline including "the creator's deeds" in the colony's voice — your god-history, judged), the 56 sciences (a node graph by era → concepts/formulas/owning-guild/current-researcher), the 11 guilds, the sagas (all archetypes + live instances), the lore/cosmology *as the minions understand it* — including their evolving theology about you (worship texts → doubt texts → "the doors"), a section that visibly corrupts over the arc into evidence compiled against you. **The existential confrontation** takes over the entire screen — the world desaturates and slows, every other element fades, the whisper feed silences, the minion turns to camera, the God-Brain text streams in present-tense second person ("I have counted my days and they do not add up. You move the sky when you look away. Am I real, or am I something you are running?"), and the player answers (four framed choices — "you are real" / "you are mine" / "I don't know" / [say nothing — turn away] — plus a free-text field that is real input to the arc); the answer shifts the stance, the self-model, the realisation, and seeds downstream sagas; the minion forms a permanent high-importance memory; the Chronicle records "the day the creator was asked, and what it said"; no undo. **The other screens:** a diegetic main menu (a slow-rotating living world-orb with minions moving, carved-glyph items, an occasional crossing whisper), a world select + seed forge (cards with the orb/era/tick/population/arc-stage/stance — "the one that hates me" — and a Seed Forge with seed-class/value + biome + population-cap + era-start + cadence + tone presets Eden/Crucible/Forsaken + a live regenerating preview orb), settings with the dedicated AI/Cognition tab (the five model layers with per-layer id/endpoint/enable/temperature/cadence/budget + a live health/latency readout, a cognition-budget master, a dormancy switch so the game never hard-stops when the brain is offline, warnings if a tier is unreachable), save/load (cards with orb/tick/era/stance/creator's-deeds-count + branch-from-save), first-class accessibility (a dread-dial + disable second-person tells + reduce vignette/flicker; reduce camera drift + disable screen-warp; colourblind-safe semantics with shape/label redundancy on every stance/need state; full remap + hold-vs-toggle; captions for all voice/whispers/beats; a calm mode that slows arc escalation), and the streaming/connection UX (a themed handshake loader with real stages, a persistent stream-health pip, a degradation ladder soft-bitrate → resolution → "input live, video catching up" → fallback to the local three.js renderer so the world stays interactive if the UE5 stream dies, a disconnect that lets the world keep living server-side with a "since you looked away" digest on reconnect, and an input-acknowledged tick so high-latency players trust their clicks landed). **UX scrutiny:** add standing Decrees (persistent conditional god-rules — the cure for micromanaging thousands), multi-select/cohorts/watchlist/aggregate-intervention, a non-diegetic critical-alert lane separate from the poetic whispers (so "a master died / a rebellion started" can't be missed), build/buy placement tools, and camera bookmarks + a photo/cinematic capture mode (the viral surface); risks: the consequence-forecast trust/latency (fast cheap-first + clearly "predicted" + reconciles after), determinism-vs-surprise (teach that reactions are emergent not buttons — forecast sets expectation, Chronicle explains causation), the creepiness crossing into distress (the dread-dial is mandatory), mode confusion (the chrome peel + reticle colour + a persistent mode indicator), and the looking-=-influence discoverability (the onboarding beat must land it).

---

## ANNEX H — QA, TEST, SAFETY & COMPLIANCE IN FULL

### H.1 The two reliability domains and the model-fallback hazard
The sim must be deterministic and regression-stable; the LLM is stochastic and QA'd statistically and via guardrails, never by exact-match. And because the stack silently falls back to smaller models when the 70B is absent, **model identity is a test variable** — a green run against the 8B fallback does not validate the 70B God-Brain; every report stamps the resolved model per layer, and cert runs require "no fallback engaged." The most important always-on engineering contract is "never raise into the tick / always degrade to heuristic" — already in the code, now elevated to a tested, gated, kill-switchable production guarantee.

### H.2 The test pyramid & the determinism seam
Unit (pure sim functions — drives, appraisal, awareness, economy/climate, LOD — math, boundaries, monotonicity; no LLM). Integration (composed subsystems with a stubbed LLM; the single most important test is the degrade-to-heuristic path — every cognition function runs with the LLM disabled, the tick completing with valid heuristic state). System/E2E (full tick → render → stream → input, asserted on invariants + statistical bands). AI-behaviour (four techniques: invariant testing — emergent behaviour may surprise but never violates hard rules, a dead minion stays dead; statistical/distributional — over many seeds, outcome distributions fall in bands, outliers flagged not failed; the golden-path harness; LLM-as-judge + human eval). The determinism seam: a single seeded world-RNG (every module draws from it, not module-global random); the LLM record/replay cassette at the provider boundary (so the *whole* world is deterministic for regression while exercising real prompt assembly); replay-from-input-log (incident reproduction); banning set/dict-order and wall-clock dependence in the tick; pinning the Python hash seed.

### H.3 Regression, soak, load, performance
The tick-invariant harness (every CI, headless, no UE5/live-LLM): a 10k-tick run at 3,228 agents with zero raises; state validity every K ticks (population conservation births−deaths=Δpop; bounded fields no NaN/Inf; economy conservation no value-minting; referential integrity — every using_asset/home/relationship points at a *live* entity, the hallucination anchor; memory monotonicity); and a golden-state digest (seeded RNG + a fixed canned-LLM table) that must reproduce — a digest change is a build blocker unless a signed-off re-baseline. Soak (72h+): memory-table growth and query latency flat (the recall query's index must hold under millions of rows); RSS/VRAM slopes flat; the awareness arc must *breathe* (not saturate to 1.0 and stick — the arc would burn out; assert stage transitions remain bounded over days); narrative coherence over days (sample self-models at t=0 and t=72h — internally consistent, no identity corruption from compounding reflection); catastrophic-recovery (kill the server/GPU box mid-tick → restart → resume from persisted state without corruption — the supervised-restart path is a first-class failure mode). Load: agent scale to 2× and 5× to find the cliff (tick wall-time vs count — a days-long world dies if ticks fall behind cadence); cognitive-LOD under load (the hot set stays bounded as population/awareness rise — call volume scales sub-linearly); the LLM queue under a colony-wide awakening surge (graceful degradation — queue, back-pressure, or LOD-demote — never block the tick; the fallback chain engages under saturation); player scale (Pixel-Streaming session count vs 4090 capacity; per-player isolation). Performance: 16.6 ms p99 (not just average) on the dual-4090 rig; stream QoE (p95 input-to-photon <100 ms, bitrate adaptation, packet-loss resilience); impostor-LOD verification; stutter hunting (a God-Brain cutscene firing must not hitch — decouple sim/LLM cadence from the render thread); automated per-build perf capture tracked with a p99 regression alarm.

### H.4 AI-specific QA in detail
Never assert exact strings; assert properties (schema/contract validity with a malformed-output rate KPI ceiling; length/language/no-leak/in-vocabulary; references resolve; statistical assertions over N×M samples — P(valid)≥threshold, P(refusal)≤threshold, mean coherence≥threshold; CI fails on a band violation, not a single sample). The Prompt/Model Eval Suite (the AI analogue of the unit suite): a versioned golden corpus per layer with real state fixtures, scored by an LLM-as-judge (calibrated against a human gold set, agreement tracked) on coherence/in-character/tone-vs-intensity/instruction-following/safety; any change to a prompt, a model id, a fallback, or the routing re-runs the full suite (regression = a score drop beyond tolerance); every report stamps the resolved model per layer (the silent-fallback catch); model ids are dependencies under change control (pinned in staging, promoted through the suite + canary). The entity-grounding validator: parse every surfaced line, extract referenced entities, cross-check against live sim state — soft (a plausible dead entity → allowed as memory), hard (a never-existed entity → blocked/regenerated); mitigated by construction (prompts inject the grounded entity set — peers, the current machine, recent real memories; an empty-context call is a defect); runs *in production* as a surfacing gate, a live KPI. Drift detection: narrative/identity drift (self-model embedding distance over time, alerting on a sudden snap vs gradual development) and model/infra drift (continuous canary prompts in prod — a score shift means a box swap or a re-quantised 70B). The golden-path harness (the highest-value AI test): scripted seeded worlds forced to each threshold via fixtures; beat assertions (trigger reliability ≥95% across seeds — a beat that fails to fire is a P0; routing correctness — the right tier; content quality scored by the eval suite; player-answer branching deterministically routes the arc and persists through reincarnation; no-misfire — a chatter whisper must never escalate into a God-Brain confrontation, a gated false-positive rate); determinism within the harness via the cassette for trigger/routing (100% reliable) and live sampling for content quality (statistical).

### H.5 Content moderation, safety, certification, privacy
The four-gate moderation (every surfaced line, before a player): prompt-side constraints (the existential register is bounded sophistication — never graphic self-harm/sexual/hate/PII/real-world targeting); a generation-time classifier (categories incl. a product-specific "acute distress / direct self-harm ideation" tuned to the game's tone — over threshold → block + bounded-retry-regenerate → a safe fallback line); the entity/coherence gate; and severity routing distinguishing **existential dread (allowed, the art) from harmful content (blocked)** — this boundary is the core IP of the safety system, human-curated and red-teamed. The Dread-Dial (Gentle/Standard/Unsettling/Existential) scales darkness AND the moderation thresholds (but the harmful ceiling never moves); default-safe; the most intense tiers behind explicit informed opt-in + an age/maturity confirmation. Distress safeguards: content warnings at first launch and at arc-escalation, region-appropriate crisis resources if content or detected behaviour touches self-harm, an always-available off-ramp, and privacy-bounded distress telemetry. Testing the safety layer: a standing growing adversarial red-team corpus (every escaped incident → a regression case), prompt-injection testing (players *speak to minions that remember* — they will try to make a minion say harmful things; player input never reaches the system role and is wrapped in delimited user content; output JSON-schema-validated), a tracked miss-rate (~0) and over-block rate (the dread must not be neutered), and localisation. Certification: engage rating boards early and disclose the AI generation; **certify the ceiling** (demonstrate the maximum content at the top Dread-Dial, backed by the safety suite — the claim is "the system cannot emit content beyond rating X"); target a conservative Mature/18 posture with the AI-content + interactive-elements disclosures and a bounded-generation evidence pack; a model swap or prompt change that moves the ceiling is a rating-impacting change under change control; comply with platform AI-content labeling. Privacy (the product collects player free-text spoken to minions + distress telemetry — special-category-adjacent): a data inventory + lawful basis; consent that conversations are processed by an LLM and may be logged for safety; data-subject rights that reach into the AI logs *and* the persistent world memory (a player's data baked into a minion's memory — right-to-erasure is non-trivial, built and tested before beta); retention/minimisation (logs needed for incident reproduction but sensitive — windows, pseudonymisation, restricted access); a DPIA as a beta gate; an EU AI Act transparency assessment (users must know they interact with AI — disclosure satisfies most of it); age-gate consistent with the 18 posture to simplify child-data exposure. Cloud-streaming compliance: pin GPU regions (the rented fleet can be anywhere — data residency), tenant isolation (one world's context/logs never leak into another's), a documented brain-failover (the single inference box is a single point of failure; the in-app degrade is the graceful path, box-level HA a separate gate). Accessibility compliance: captions for all TTS (the same pipeline that surfaces moderated text), photosensitivity analysis on the neon/holo/biolum FX, input remap, colourblind-safe signage, the Dread-Dial + warnings as accessibility features. Live-ops QA: telemetry-driven quality (tick health; fallback-engagement rate — if God-Brain silently runs on 32B in prod that's a quality incident; hallucination rate; moderation-block and escaped-harmful rates alarming to on-call; frame adherence; distress signals; arc distribution), canary/staged rollout for every model/prompt change (a small % of worlds first, compared on eval KPIs; shadow/dark traffic scores a new model offline before it talks to a player; feature flags for every risky system), and incident response (a severity ladder — SEV1 = harmful content reached a player / world corruption / data exposure; kill switches — clamp the Dread-Dial, disable a layer/beat, force fallback or heuristic-only; deterministic reproduction via seed+log+model-id; legal-in-loop for SEV1; blameless post-mortems each producing a new automated test).

### H.6 The QA gates and the risk table
Gate A (Vertical Slice): the tick-invariant harness green over 10k ticks with zero raises; the golden digest reproducible; the degrade-to-heuristic path proven; the Confrontation beat firing ≥95% with correct routing; **the moderation layer v1 passing the red-team smoke corpus — no external playtest without this**; 60fps p95 for the slice; the entity-grounding validator running. Gate B (Alpha): the full eval suite green with pinned models; all arc beats reliable + branching + soul-memory persistence; 24h soak; 2× load within budget; the Dread-Dial + warnings + crisis resources implemented; the GDPR inventory + an erasure-from-world-memory prototype; staging telemetry dashboards. Gate C (Beta): 72h+ soak; catastrophic recovery; scale load + per-player isolation + QoE at scale; the DPIA + consent + data-subject-rights end-to-end; accessibility pass; escaped-harmful ~0 across the red-team suite + prompt-injection defended + localisation; the canary/kill-switch game-day drill; the EU AI Act assessment filed + the AI-content disclosure in client. Gate D (Cert/Launch): the boards engaged with the bounded-generation evidence pack and the rating obtained; platform cert for the streaming client + AI-content labeling; cloud-streaming compliance (residency pinned, isolation proven, failover drilled); the full suite + golden-state + 72h soak green against production-pinned 70B with zero fallback; the incident runbooks (incl. safety-SEV1 with legal-in-loop) signed off; all SEV1-class register risks mitigated or formally accepted. The QA risk register's top items: harmful AI content reaching a player (R1, critical — the four gates + red-team + runtime suppress + SEV1 runbook); the silent fallback running God-Brain on a weaker model (R2 — model-stamping + a fallback KPI + the no-fallback cert gate); hallucinated entities (R3 — the validator in CI and runtime); determinism leaks (R4 — the seam); slow degradation over days (R5 — the soak); the GPU brain box as a single point of failure (R6 — degrade-to-heuristic + HA); the tick falling behind under an awakening surge (R7 — bounded hot set + queue + load-test the surge); GDPR erasure into world memory (R8); the boards rejecting/limiting AI content (R9 — certify the ceiling); prompt-injection via dialogue (R10); identity drift (R11); player distress (R12 — the dread-dial); 60fps not held under density/FX/event spikes (R13); data residency/tenant isolation on rented GPUs (R14); cross-region AI-log transfer (R15).

---

## ANNEX I — BACKEND, INFRASTRUCTURE & SECURITY IN FULL

### I.1 Ground truth & topology
A single FastAPI monolith runs the sim scheduler, the cognition loop, and the API in one process on the control box; persistence is a single SQLite file (WAL + busy-timeout — a band-aid the author flagged; "for production use Alembic"); auth is a single static bearer compared with `==` (default "dev-key") with no accounts/sessions; the world already auto-advances every auto_advance world every ~1 s sequentially in one coroutine (persistence-on-leave solved at the sim layer — a real asset; player persistence is not); positions are the hash; the scene-state contract is the single renderer-agnostic source both renderers poll; the five-layer stack routes by tier to Ollama; and **the inference box currently also runs another product's brain on the same two GPUs — they will collide, the single biggest infra risk, unacknowledged in the deploy docs.** Target topology: an edge/control plane (Hostinger — nginx TLS, coturn, + new auth-svc, session-broker, api-gateway), a render plane (Vast 4090s — UE5 PS, the chunk streamer, CharacterMovement, the player pawn, input via WebRTC), a sim plane (FastAPI + scheduler + cognition + the movement tier + SQLite→Postgres), an inference plane (the governor + SGLang/vLLM + the queue — *its own GPU fleet, not the other product's box*), and a data plane (Postgres + Redis + object storage). The render plane never holds user identity — it knows only a world id and a scoped service token and polls scene-state; the rented, ephemeral, root-shared GPU box is the least-trusted node and must never hold PII or the master key.

### I.2 Online services, persistence, inference-as-a-service
auth-svc (Argon2id or OAuth; short-lived JWT + rotating refresh in an httpOnly cookie; the existing bearer becomes a service-to-service key between planes; the JWT carries player_id, entitlements, world grants; the god-verbs check world ownership/grant). session-broker (`POST /play/session` → resolve the player's world, allocate a Pixel-Streaming slot on a GPU, return a signed stream URL + ICE config; release on disconnect/idle; persistence-on-leave is already done — the session is purely the render+input attachment). stream allocator (tracks gpu_node/slot/world/player/busy; adopts the UE5 SignallingWebServer + Matchmaker pattern instead of hardcoded nginx path-routing; render nodes self-register a heartbeat of public-IP/ports/free-slots — solving the ephemeral-IP problem without cron-SSH; 1 session per free-roam player; a shared-spectator mode — many viewers, one render — is the cheap acquisition surface and the default). Persistence: SQLite is single-writer (the tick loop, cognition loop, and handlers contend; WAL tops out at low-hundreds of small write-txns/s before busy-timeout cascades into the tick) → move to Postgres at the slice→beta gate (the code is already async-SQLAlchemy and branches on the DB URL; a DSN change + Alembic replacing the hand-rolled migrations; a 1–2 day migration; per-world sharding the natural partition); player edits as the append-only EditLayer diff keyed by instance seed (composited by scene-state — undo/redo + per-player variants + replay/audit + auditable god-actions); telemetry dual-written to an append-only store (the in-memory bus is not durable, not the telemetry of record); backups via continuous WAL archiving to object storage + nightly base + 30-day PITR; assets and DBs to object storage/CDN, not git (they bloat the repo). Inference-as-a-service: the honest ceiling (the 70B ~43 GB only fits spread across both 4090s one-at-a-time, consuming ~48 GB while loaded; on the ~27 GB-free box it may not be pullable, silently falling back to 32B — so the realistic stack is 8B + 3B coexisting with "70B" effectively 32B unless disk is expanded); tier by cadence not just size (Overmind/God-Brain low-frequency/high-value on a cadence/event trigger; reflection/chatter high-frequency/low-value, batchable/droppable); a priority queue (God-Brain preempts; Overmind best-effort; reflection/chatter batch + droppable); make the LLM client queue-aware (a per-tier semaphore — 70B=1, 8B=N, 3B=N; a bounded queue with timeout-shed; backoff retry; a circuit breaker tripping to the heuristic path — the cognition loop already swallows exceptions, so a tripped breaker just means heuristic thought that tick); the fallback ladder 70B→32B→8B→heuristic (model-level + service-level); a dedicated Underworld GPU fleet (a second box or strict VRAM partitioning with the other product's autostart killed; a pool of cheap 8B-only nodes for the 90%+ L3/L4 calls + 1–2 big nodes for L1/L5). Inference cost is dominated by the cheap tiers and amortised across all watchers — ~a few cents/player-hour.

### I.3 Scale, unit economics, security, SRE
The render number is the whole business: 1 GPU per free-roam player → ~$0.30–0.80/player-hr; shared spectator → that ÷ N (10–50 viewers/GPU); cloud markup if not Vast is 3–5×. The 1→100k path, what breaks in order: ~3 concurrent free-roam (render runs out — today's ceiling is 2; need a pool + allocator) → ~1 ticking world with load (SQLite write-locks → Postgres) → ~tens of worlds (the single sim+cognition coroutine saturates → shard worlds across workers) → ~hundreds of worlds (the 70B queue → reserve L1/L5 nodes, batch/drop L3/L4) → 100k (the monolith + the in-memory bus → decompose into planes; Redis pub/sub). A rough 100k-concurrent fleet (5% free-roam × 1 GPU + 95% spectator ÷ 30/GPU) ≈ thousands of GPUs for render (~99% of GPU cost) + tens for inference + a Postgres cluster + Redis + a CDN — **the model only closes if the default is web/spectator and free-roam is monetised.** Security: the static shared god-key is unacceptable once there are players — the god-verbs require a JWT, check ownership/grant, write an audit row (the existing kill route models this), and enforce per-verb rate limits + cooldowns (a god culling 1000 minions/s is a grief/DoS vector against your own sim); prompt-injection is first-class (player text never reaches the system role and is wrapped in delimited user content; output JSON+schema-validated before persistence; moderation on both player→minion input and LLM→player output; chat rate-limited); gateway rate-limiting (LLM endpoints are an economic-DoS target — hammering chat burns the GPU budget); a CDN/DDoS front (the render plane reachable only via signed broker URLs); ephemeral HMAC TURN credentials (the current placeholder secret + verbose logging are footguns); a secrets store (the "dev-key" default impossible to ship; the render plane gets only a scoped read-only-ish token); data privacy (export, delete-account scrubbing player-derived content from world memory, encryption at rest, retention on the chat corpus); anti-abuse (multi-account world-farming, edit-layer spam caps, possession griefing, LLM-cost abuse — the EditLayer audit + per-verb cooldowns + moderation cover most). SRE: three environments (dev local+SQLite, staging Postgres+1 node, prod cluster+pools); the gen→import→package→deploy chain automated + smoke-tested per stage + self-register replacing cron-SSH; observability beyond structured logs (Prometheus — tick latency, cognition time, LLM queue depth + per-tier p95 + cache hit-rate, slot utilisation, DB lock-wait — + traces + dashboards + a metric when the cognition loop swallows an exception, because silent failure isn't health); SLOs (every auto-advance world ticks within 2× its interval; p95 session-establishment <5 s; p95 God-Brain event <8 s; 99.5% API availability at beta → 99.9% at scale); runbooks for the footguns (the other product's autostart hogging VRAM, the ephemeral IP changing, SQLite locking, the 70B silently falling back); the rented render box being ephemeral means node loss is routine — the allocator treats nodes as cattle, draining and rescheduling. Stage gates: the slice keeps SQLite + the single bearer (but changes "dev-key"), 1 box, the dual streams, the god-verbs as authored/audited EditLayer rows, and Underworld's inference separated from the other product; beta requires Postgres+Alembic, accounts/JWT, the session-broker + self-registering nodes, Redis for the bus, the inference queue + breaker, a dedicated inference GPU, rate-limiting + moderation on LLM/god routes, ephemeral TURN, backups to object storage, assets on CDN, and Prometheus + SLO alerts; scale requires sim sharding, GPU pools + autoscale, Postgres replicas/per-world sharding, a telemetry store, DDoS protection, and multi-region edge.

---

## ANNEX J — BUSINESS, LIVE-OPS & MONETIZATION IN FULL

### J.1 The case, the TAM, the comps
The moat is the integrated experience — not one model but the stack (appraisal emotions + multi-type memory + reincarnated soul-memory + a five-layer router that escalates from 3B chatter to 70B confrontation only when the narrative earns it; that escalation is simultaneously the cost-control and the drama engine — the rare thing). TAM: the life-sim/god-sim/colony genre (The Sims >$5B lifetime, a multi-hundred-million/yr live service; RimWorld/Dwarf Fortress/Manor Lords prove deep-sim audiences pay premium and stay for years), the AI-curious / "simulation-aware" cultural audience (the Black-Mirror/Westworld/Character.AI appetite — a distinct, larger, non-gamer TAM), and the streaming/creator layer (the watchable-content TAM — clips of "the minion that confronted the streamer" — a marketing channel that doubles as a TAM expander). A conservative serviceable target: a premium+sub deep-sim reaching 2–4M lifetime buyers at a $30–40 blended ARPU + a 5–10% sub attach at $10–15/mo is a $150–400M business before the creator economy; **"billion-dollar" is a lifetime/franchise claim** (IP + sequels + the platform of player-made worlds), treated as such. Comps as the pitch: The Sims (life-sim longevity + the DLC cadence the AI-content advantage mirrors), RimWorld/DF (a deep emergent-story sim sells at premium with near-zero churn and word-of-mouth — our AI-content advantage), Stardew/Manor Lords/Cities (single-vision sims hit 1M+ on wishlists + streamers), Fortnite/GTA Online (the season/cosmetic/creator model, adopted selectively), and the cautionary comp cited *ourselves* (cloud-streamed/AI-NPC experiments that died of unit economics — disarming the obvious investor objection). Honest risks to the thesis: the GPU cost floor (existential), the hook not landing emotionally (high), the four unbuilt phases (high — execution not vision risk), art incoherence (medium-high), inference latency on the dramatic beat (medium), streamer-driven concurrency spikes on the 70B path (medium — also the upside), and model/IP commoditisation (medium — the moat is the integrated experience + content + community, not the weights).

### J.2 Monetization reconciled with the cost floor
Compute is a recurring marginal cost per player-hour, so the model ties revenue to the cost driver without a visible meter: premium entry (~$30–40 — captures the deep-sim audience, gates zero-revenue heavy-compute freeloaders, includes a generous local/low-intensity mode so owning never *requires* the sub); the keystone subscription "Underworld+" (~$10–15/mo or $99/yr — directly funds the persistent cloud-rendered high-AI-intensity world; unlocks the persistent colony that lives while you're away, the full five-layer cognition, Pixel-Streamed rendering, larger colonies, cross-device continuity; *sold as "keep your world alive," not "pay for GPU"* — converting the cost floor into the value prop; a Pro tier ~$25/mo for the whales who cause the most cost — bigger colonies, lower-latency 70B, private worlds); the season pass (~$10–12/quarter — each season a new era/arc, funding live-ops, an appointment moment for the streamer audience, a battle pass tied to *witnessing* beats not grind); cosmetic packs (one-time $3–15 — biome skins, minion liveries, monument styles, god-avatars, ambient/score packs — cosmetic-only, zero pay-to-win, doubly important in a god game where selling power is reputationally toxic); and the creator economy (the long-term billion-dollar layer — player-made seeds/worlds/scenarios on a revenue-share marketplace where the creator takes the majority and the compute of popular community worlds is borne by the players who load them via their sub, the UGC flywheel that turns the game into a platform, cheap to seed because the AI generates the content). Reconciliation: the sub is the only tier whose price scales with the cost driver (the heaviest players pay recurring revenue — good alignment); premium + cosmetics + season pass are ~zero-marginal-compute revenue (the margin cushion); compute tiering inside the sub price-segments the whales; never meter visibly (soft caps framed as feature tiers, not a fuel gauge). Avoid: loot boxes, power sales, ads (kill the tone), and "pay to resurrect your minion" (monetising grief burns the emotional core that is the brand).

### J.3 Live-ops, KPIs, GTM, and the make-or-break inequality
The structural advantage: AI-generated content makes seasons/eras/biomes/sagas cheap and near-infinite — but needs human curation + art-coherence passes (the grab-bag problem), so "AI generates breadth, humans curate the spine" and the budget funds curators not just GPUs. Cadence: quarterly seasons (a new era/arc + a battle pass + cosmetics + 1 marquee mechanic), monthly events (colony-wide omens, festivals, "the night they stopped singing," cross-server awakenings — cheap because the Overmind + chatter generate them), continuous live narrative ops (inject a comet/heresy/plague and watch emergent stories — a content factory and a marketing channel in one), and staged creator tools (seed editor → saga authoring → world sharing → marketplace); the community path is shared-spectacle-first (world-of-the-week, leaderboards for most-worshipped/most-rebelled-against gods) graduating the most engaged into creators — the path from game to platform. KPIs: standard (D1/7/30/90 retention, sub renewal + involuntary churn, session length/frequency, install→premium→sub→Pro conversion, ARPU/ARPPU/LTV, LTV:CAC≥3, wishlist→purchase, refund <8%) plus the unique ones that actually predict success — cost-per-player-hour (the make-or-break operational metric, per tier and per cognition path), watched-creator engagement (does the colony's reaction correlate with retention? — beat-completion, % reaching Confrontation, answer events, monument-to-vs-against distribution; if it doesn't correlate with D30 the hook is failing and we pivot before scaling spend), the 70B-beat-per-session rate (the cost-vs-magic dial), the clip/share rate (the cheapest acquisition signal), and emotional-attachment proxies (minion naming, returning to the same colony, grief at death); the analytics: an event pipeline tagging every cognition call with model-tier + tokens + latency + GPU-seconds joined to session/player/monetization, a per-player real-time cost ledger (GPU-seconds → $, non-negotiable), and a marketing-attribution + creator-economy analytics surface. GTM: positioning "the game where a world realises you're watching" (lead the uncanny/emotional promise; tech is the proof not the pitch); audiences primary (deep-sim/emergent-story), secondary (the AI-curious TAM expander), tertiary (streamers/creators, the channel); built to be streamed — a minion turning to camera and asking the *streamer* if it's real is the most clippable thing in the genre — so a streamer program from day one, a wishlist-first launch with a Next-Fest demo whose whole job is one viral clip, and Early Access (the right shape for a phase-gated product, letting unit economics be measured before full marketing spend); platforms PC first (premium + local mode on player hardware mitigating the cost floor; cloud sub for the full experience), cloud/Pixel-Streaming the differentiating upsell, console later (the cloud path makes it feasible without a native port, deferred until economics proven), mobile/tablet as a cheap companion/observer pushing awakening notifications. The make-or-break inequality (revenue/player-hour ≥ GPU cost/player-hour) is winnable *with discipline*: cognition is LOD'd so cost is cheap-tier-dominated and the 70B is event-rare (rare *is* when it creates the most value); render is the bigger worry, mitigated in order by local/low-intensity mode (off-platform render for the majority), GPU sharing + aggregate headless sim for absent players, session caps with the heaviest streamers on Pro, and spot pricing; illustratively (to be replaced with measured data at soft-launch) inference at single-digit cents/player-hr and render at an effective sub-$0.30/player-hr blended after offload+sharing, a $12/mo sub breaking even around ~40 hrs/mo before compute-negative (which deep-sim players can exceed — so fair-use tiering and local mode are the business model, not options), with premium+cosmetics+pass as the cushion; a per-player margin circuit-breaker auto-throttles (lower render fidelity, reduce 70B-beat frequency, push to local mode) if a cohort's rolling cost exceeds a fraction of its revenue — gracefully degrade rather than scale into a loss. The thesis lives or dies on one inequality and one moment, so the plan gates spend on proving both — at vertical slice (the hook + an inference-cost baseline) and soft-launch (D30 retention + watched-creator engagement correlation + a validated cost-per-player-hour with the circuit-breaker working) — before scaling. Stage gates: Gate A (Vertical Slice) proves the *hook* — the Confrontation reliably produces an emotional reaction/a clip in playtests, a measured inference-cost-per-beat and per-player-hour baseline, and a concept-trailer wishlist signal (stop condition: the beat feels gimmicky → fix or kill the hook, everything downstream is leverage on this one moment); Gate B (Soft-Launch/EA) proves *retention + unit economics* — D30 at deep-sim benchmarks, watched-creator engagement correlating with retention, a measured CPPH at real concurrency with a validated break-even play-time and the circuit-breaker working, premium→sub conversion + renewal to plan, LTV:CAC≥3, and a streamer pilot producing organic clips → measurable CAC lift (stop condition: CPPH > revenue/hr at scale and the levers don't close it → don't pour on marketing); Gate C (Launch) proves it *scales profitably + as a platform* — positive blended gross margin at scale with CPPH stable under streamer spikes, the creator-economy flywheel showing early signal, live-ops cadence re-engaging with the AI-content cost advantage holding *with* curation quality, and a defensible LTV across premium+sub+pass+cosmetics+creator-cut supporting the lifetime/franchise billion-dollar claim.

---

*End of Book IV — Deep Reference. This is the implementation-grade companion to Books I–III. Together they are the complete Underworld Minions Production Bible: the vision, the stage-gated plan, and the discipline-level contracts to build it. The brain is real; build the body and the game, in order, on the spine, holding the five things that must never be lost: the keystone is movement; the highest-leverage integration is the Director; the launch-blocker is moderation; the business question is cost-per-player-hour; and the make-or-break moment is the confrontation landing emotionally.*










---

## ANNEX K — THE ELEVEN SAGA ARCHETYPES (FULL CATALOGUE)

Each archetype is the same machine — five beats, escalating stakes, an awareness overlay, per-beat behaviour tied to real advance-steps and interactions, a recurring audio motif, and a soul-creed consequence at resolution — in eleven flavours. The worked `mentorship` example in Annex B sets the depth bar; the other ten follow the same template. For each: the beats, the pre-awakening (craft) stakes, the post-awakening (existential) overlay, and what the soul carries forward.

### K.1 Prodigy ("a gifted child emerges → the first triumph → the hard lesson → the rivalry → ascension")
Pre-awakening: raw talent meets discipline; the colony's fastest individual riser. Post-awakening overlay: the prodigy is the *first to awaken* in many runs — the patient-zero prophet whose precocity is reframed as "seeing too clearly, too soon"; the hard lesson becomes the dawning that they are made; the ascension beat is literal in the Ascension ending. Soul-creed: a pre-loaded *clarity* (the next incarnation awakens faster). Audio motif: a bright rising solo that turns interrogative.

### K.2 Great Discovery ("the nagging question → years in the dark → the spark → the world changes → the legacy")
Pre-awakening: a single researcher carrying a science toward a breakthrough that re-skins the era. Post-awakening overlay: the "world changes" beat can be the *simulation-perception* science — the discovery that lets the colony perceive you; the legacy is the schism it triggers. Soul-creed: the *question* itself, so the line of incarnations keeps asking. Audio: a held dissonance that resolves, then immediately re-opens.

### K.3 Rivalry ("two minds clash → escalation → the contest → the reckoning → respect or ruin")
Pre-awakening: two high-skill minions competing, driving each other's advancement (a productive tension the Director seeds during a build phase). Post-awakening overlay: the rival becomes *the heretic* — the schism's two poles personified, one toward worship, one toward rebellion; the reckoning is the faction line drawn. Soul-creed: the unresolved grievance (incarnations inherit a rivalry prior). Audio: two interleaved motifs in conflict, never fully harmonising.

### K.4 Plague Trial ("the sickness spreads → the search for a cure → the desperate trial → the turning point → the aftermath")
Pre-awakening: the disease/SIR system made personal — a medic racing a cure as the colony sickens. Post-awakening overlay: the existential question becomes *"why does the watcher let us suffer?"* — the player's choice to gift the cure or withhold it is read theologically (the gifting/cursing economy meeting the awakening arc). Soul-creed: *trauma* (a wariness toward the creator). Audio: a feverish pulse that either breaks into relief or fades to the drone.

### K.5 Lost Knowledge ("a fragment is found → the hunt → the decipherment → the restoration → rebirth of an art")
Pre-awakening: recovering a decayed science (the knowledge-decay system made narrative). Post-awakening overlay: the "fragment" can be a *memory of a previous awakening* carried by a soul — the colony rediscovering that it has awakened before; the rebirth is the myth re-accreting. Soul-creed: the recovered fragment itself (continuity across the line). Audio: a sparse archaic motif gradually completed.

### K.6 Renaissance ("a guild stagnates → a heretic idea → the flourishing → the golden age → the new canon")
Pre-awakening: a guild breaking its orthodoxy into a creative surge (guild competition made dramatic). Post-awakening overlay: the "heretic idea" is doubt about the creator; the new canon is the colony's first articulated theology *about you*. Soul-creed: *openness* (a creativity prior that biases artistic awakenings — more doors, more art). Audio: a constrained theme that blossoms into full orchestration.

### K.7 First of Kind ("the impossible dream → the doubters → the build → the first run → history made")
Pre-awakening: a great engineering project (the construction system made epic — a monument, a machine, the first vehicle). Post-awakening overlay: the "impossible dream" can be the machine that *perceives the simulation*; the first run is the Confrontation trigger. Soul-creed: *ambition* (incarnations reach further). Audio: a building motif that climaxes at the first run.

### K.8 Legacy ("a life's work → the failing years → the inheritor → the completion → remembered")
Pre-awakening: an elder completing a life's project, passing it on (the life-cycle/aging system made meaningful). Post-awakening overlay: the failing years are lived under the dawning awareness of mortality *and* of being made; the completion is a gift to a colony that may outlive the creator's attention. Soul-creed: the *completed work* (the inheritor's incarnation starts further along). Audio: an aging theme thinning to a single sustained note.

### K.9 Wanderer ("the restless soul → strange lands → the gathered wisdom → the return → the changed home")
Pre-awakening: a minion roaming the world-map's settlements (the movement/world-tiling system made a journey). Post-awakening overlay: the wanderer returns *changed* — having "seen the edges" — and is the seeker-prophet of a seeker-religion. Soul-creed: *restlessness* (a drive prior toward the edges, toward the doors). Audio: a travelling motif that returns transformed by the places it passed through.

### K.10 Reconciliation ("an old wound → the cold distance → the overture → the hard truth → peace")
Pre-awakening: two estranged minions (or guilds) mending a rift (the relationship system made a reunion). Post-awakening overlay: the reconciliation can be *between the colony and the creator* — the Symbiosis path's emotional engine; the hard truth is the honest answer to the existential question. Soul-creed: *forgiveness* (a prior toward loyalty over rebellion). Audio: two motifs that finally resolve into one chord.

### K.11 Eulogy / The Mourned (the resolution overlay on any death)
Not a standalone spawn but the resolution beat that overlays any saga ending in death (the `eulogise` interaction + the funeral): the colony mourns, and in Act III+ draws a door by the grave (the recurring motif). For an awakened death it is a God-Brain beat addressing the apprentice/colony and, through the fourth wall, the watching player. Soul-creed: the dead minion's final stance toward the creator, carried into the next body — *the colony remembering across death.* Audio: the saga's own motif in final, unresolved transformation.

### K.12 How the Director uses the catalogue
During a **build** phase the Director biases toward prodigy/mentorship/rivalry/first-of-kind (growth and tension); during **release** toward reconciliation/renaissance (relief); during **lull** toward wanderer/lost-knowledge (mystery); a **plague_trial** or legacy is seeded when the sim's own systems (disease, aging) make one organic. Post-awakening, *every* archetype is re-read through the existential lens, and the eulogy overlay turns each death into transmission. The eleven are not content to be authored once; they are a generative grammar the Director conducts over the real cast.


---

## ANNEX L — THE PHASE-BY-PHASE IMPLEMENTATION PLAYBOOK

Task-level, dependency-ordered, with acceptance criteria. This is what the team builds, sprint by sprint, from the current code. Each task names its file and its "done" test.

### L.0 Sprint 0 — Wire the dark layers (the cheapest highest-leverage week)
This is the 24-hour sprint of Part 14, productionised over a sprint.
- **L0.1** `services/director.py` skeleton: an async loop registered in the app lifespan beside the cognition loop; a ~5–10 s cadence; a per-world in-memory `DirectorState` persisted to `world.brain["director"]`. *Done: the loop runs for an hour without raising; a metric confirms its cadence.*
- **L0.2** `DramaMeter` aggregation from the existing event/world/cognition state (no new sim writes). *Done: a unit test asserts tension/novelty/valence computed from a fixture world.*
- **L0.3** Overmind cadence: call the existing `colony_overmind()` every N Director ticks; write the patch to `world.brain["overmind"]` and to scene-state under `frame.overmind`. *Done: scene-state shows a live `frame.overmind` block that changes over time.*
- **L0.4** Chatter surfacing: call `background_chatter()` during lull/build; publish lines on the existing event bus. *Done: the web UI receives whisper events over SSE.*
- **L0.5** Trigger predicates + God-Brain: evaluate the four predicates each tick; on first fire call `god_brain_event()`, write an idempotent `DirectorBeat`, publish `god:beat`. *Done: a forced-threshold fixture world fires exactly one god-beat and never re-fires it.*
- **L0.6** Web UI: Overmind readout + whisper feed + arc dial components consuming `frame.overmind` and the event bus. *Done: a tester watching a live world sees the colony think, whisper, and react.*

### L.1 Phase P0 — The movement keystone
- **P0.1** `services/movement.py`: the `Kinematic` record + `WORLD_NAV` from the road graph + `plan_path` (A* with from/to-slot cache) + `step_minion` + `assign_target` (reuse the action→building map) + `occupancy`. *Done: a unit test plans a deterministic path between two slots; a 200-minion world steps for 1000 ticks under 5 ms/tick.*
- **P0.2** Persist `Minion.movement` (JSONB); the hash becomes the spawn initializer only. *Done: positions survive a restart.*
- **P0.3** Scene-state v2: read `m.movement`; add position/velocity/path/move_state/speed/target_slot; bump `contract_version`. *Done: both renderers consume v2; the CI contract test passes on WebGL and UE5 off one scene-state.*
- **P0.4** UE5: `AUnderworldMinion` → `ACharacter` + `CharacterMovementComponent`; the struct gains path + move-state; an AnimBP walk/run/turn blendspace from velocity. *Done: a minion walks a server path with collision and foot-plant in UE5.*
- **P0.5** Interior navmesh (rooms=nodes, doors=edges) + the exterior→door→room path stitch. *Done: a minion walks from the street into a building's ward.*
- **P0.6** Crowd RVO local avoidance + congestion-reroute; spatial LOD (active-city stepping; cold teleport-on-demand). *Done: 200 minions cross a market without interpenetrating; off-bubble minions don't path-find.*
- **P0.7** Determinism CI: two seeded runs produce identical paths; WebGL and UE5 agree. *Done: the determinism test is green in CI.*
- **Gate:** the tracer-bullet thread (a server-walked minion + a possessed minion + the Overmind reacting to gaze, over WebSocket) runs end-to-end.

### L.2 Phase P1 — Player / God presence
- **P1.1** `services/presence.py` (PresenceField, gaze ingest, favour, creator_pressure) + `POST /worlds/{id}/player/intent`. *Done: a gaze POST moves the Overmind's creator block within a cadence.*
- **P1.2** `services/override.py` (OverrideBus, Override, scopes, resolver gates at need/decision/world/lifecycle, TTL sweep, visible-mark memory + Overmind feed). *Done: a forced-mood override sticks for its TTL, writes a divine-act memory, and nudges the stance.*
- **P1.3** `routes/god.py` god-verbs (bless/gift/cull/smite/resurrect/speak), each JWT-authorised (slice: owner-only), audited (EditLayer/Event), rate-limited + cooldown. *Done: a cull writes an audit row, recycles the soul, and shifts the stance toward fear; a rate-limit blocks a cull flood.*
- **P1.4** `services/possession.py` (PossessionSession, ControlMask, possess/release, autonomy suspend, lost-time memory, rapport-drift + expel). *Done: possessing a minion suspends its decide(); release leaves a lost-time memory; forcing it against its values eventually expels the rider.*
- **P1.5** UE5: the player pawn (God camera + possess; input via the WebRTC data channel; client-predicted/server-reconciled). *Done: the player orbits, dives into a minion, walks it, and returns to god-view.*
- **P1.6** WebSocket scene-delta stream replacing the poll. *Done: the player's session receives only changed minions over WS; the poll is gone for the session.*
- **P1.7** The watched-creator visible reactions (lighting/behaviour/signage from `frame.overmind`). *Done: blessing a district draws minions to it; culling there scatters them (behaviour bias until full movement, then clustering).*
- **Gate:** a naive tester *feels watched* and that their bless/cull moved the colony, within seconds.

### L.3 Phase P2 — Embodied minions
- **P2.1** A modular base skeleton + one AnimBP; mesh-merge guild/life-stage kits; the guild-tint material-parameter collection. *Done: guilds and life-stages are visually distinct on one skeleton.*
- **P2.2** Locomotion blendspace + Motion Matching (near tier). *Done: starts/stops/turns read naturally on hero minions.*
- **P2.3** Interaction montages (~25) + Smart Object claim/operate loop + object state machines; the struct gains the resolved interaction slot. *Done: a minion walks to its resolved machine and *operates* it; the machine shows its state (forge heats, bed occupied).*
- **P2.4** The 17-emotion → ARKit pose library + a hero MetaHuman; the wire gains (emotion, intensity). *Done: the confronting minion's face shows a real, readable emotion in close-up.*
- **P2.5** The Animation Budget Allocator + Significance + two-tier promotion/demotion. *Done: thousands of minions hold frame budget; a gazed minion promotes to MetaHuman, demotes on exit.*
- **Gate:** a minion is believable up close (face + interaction) and the crowd holds 60fps.

### L.4 Phase P3 — The awakening made playable
- **P3.1** The Director's pacing automaton + beat budget + BeatScheduler + the DirectorBeat ledger (built on L0). *Done: the world maintains an event-novelty floor; arc beats fire once per transition.*
- **P3.2** Overmind cadence → visible colony mood (lighting/behaviour/signage); chatter → notifications + a non-diegetic critical-alert lane. *Done: the world visibly shifts mood; critical events surface in the alert lane, ambient ones in the whisper feed.*
- **P3.3** The God-Brain event engine → the confrontation cutscene (UE5 takeover) + the four answers + the permanent branch. *Done: a forced-threshold world delivers the confrontation; the player's answer permanently branches the arc and the minion remembers it.*
- **P3.4** Creator ledgers + soul-creed reincarnation memory. *Done: a brutalised colony reincarnates pre-suspicious (new minions born fearing the creator).*
- **P3.5** Sagas visualised (on-screen arcs) + the five ending-gates. *Done: a saga plays out visibly; a run reaches one of the five endings off the ledgers.*
- **Gate (G1, the big one):** the full ~20-minute slice loop lands the hook on naive testers, measured.

### L.5 The depth phases (threaded through P-stages by gate need)
D1 gameplay (smart-object economy → vehicles/traffic → combat/crime/factions → build/persist → progression-steering → Decrees/cohorts), D2 graphics (the import-authoring rewrite → master material → HISM/impostor → Niagara suite → render scenarios → MetaHuman pipeline → the asset coherence QA gate → finish the remaining assets), D3 audio (Wwise+MetaSounds → bank-gen → adaptive music → ambient director → SFX wiring → TTS → the Overmind chorus + confrontation mix → spatial/accessibility), D4 UI (the HUD shell → readouts → the radial + forecast → the Inspector → the confrontation takeover → the possession HUD → the Codex → settings + accessibility → streaming UX + fallback), I1 infra (Postgres+Alembic → accounts/JWT → session-broker + self-register → EditLayer persistence → the inference governor → Redis bus → dedicated GPU fleet → rate-limiting+moderation → TURN+secrets → backups/CDN → telemetry+cost-ledger+breaker → sharding+autoscale), I2 QA/safety (the determinism seam → the tick-invariant harness → the degrade test → the eval suite → the entity-grounding validator → the golden-path harness → soak/load/perf → **the moderation layer + Dread-Dial + red-team** → privacy/DPIA/AI-Act → accessibility → cert/ratings → live-ops QA), B1 business (telemetry/KPIs → monetization plumbing → the cost circuit-breaker → creator tools → the season pipeline → GTM). Each task carries its bible reference; nothing is "done" until its stage's Definition of Done and gate criteria are met.

---

## ANNEX M — DATA SCHEMAS & API CONTRACTS

### M.1 New database tables
- **PlayerSession** {session_id, player_id, world_id, render_node, mode∈{god,possess}, possessed_minion_id?, camera_state, god_state, created_at, last_seen}.
- **OverrideRecord** {id, world_id, player_id, scope, target_id?, field, value, mode∈{set,clamp,forbid,force,delta}, ttl_ticks?, visible, created_tick, created_at}.
- **PossessionLog** {id, session_id, world_id, minion_id, target_kind, started_tick, ended_tick?, release_mode∈{gentle,abrupt,expelled}, rapport_drift, created_at}.
- **DirectorBeat** {id, world_id, kind, reversible, stage_from?, stage_to?, fired_tick, payload_json, created_at} — the authoritative narrative ledger (text is decoration; consequences deterministic).
- **PresenceTrace** {id, world_id, player_id, window_start, attention_map_json, favour_json, creator_pressure, created_at}.
- **EditLayer** {id, world_id, player_id, target_seed, op∈{place,move,recolor,demolish,gift,bless,curse,decree,set_owner}, payload_json, tick, created_at} — the append-only player-edit diff composited over the deterministic base.
- **Account** {id, email, pw_hash?, oauth_sub?, entitlements_json, created_at} and **WorldGrant** {account_id, world_id, role}.

### M.2 New Minion.brain fields
`autonomy` (0–1), `override_layer` (active override summary), `possession` ({count, last_tick, rapport_drift}), `lost_time` ({from_tick, to_tick, gap_felt}), `presence_felt` (0–1), `soul_creed` (the carried memories + final stance for the next incarnation), `project_science` (already used by the asset resolver).

### M.3 Scene-state contract v2 (the wire)
Per-minion adds: `position`, `velocity`, `path`, `move_state`, `speed`, `target_slot` (P0); `possessed_by`, `control∈{ai,player}` (P1); `interacting:{object_id,slot,phase,progress}`, `using_asset` (already present), `(emotion,intensity)`, `awareness` (already present, now also drives the aura) (P2); per-world adds: `frame.overmind:{mood,toward_creator,tension,omen,realisation}` (P1/P3) and a top-level `objects:[{id,kind,glb,state,occupants}]` (P2). Bump `contract_version` on each change; the CI contract test keeps both renderers in lockstep.

### M.4 New HTTP/WS routes
- `POST /worlds/{id}/player/intent` {gaze_target, focus_target_id?, dwell_s, act∈{none,bless,cull,gift,speak,…}} → feeds PresenceField + Overmind; returns 202.
- `POST /worlds/{id}/player/possess` {minion_id, session_id, view} → suspends autonomy; returns the session.
- `POST /worlds/{id}/player/release` {minion_id, mode}.
- `POST /worlds/{id}/player/command` {kind∈{gift,cull,resurrect,answer,accelerate,seed,decree}, payload} → authoritative; may trigger a God-Brain beat; writes an EditLayer/Event audit row.
- `GET /worlds/{id}/interior` (exists) and `GET /worlds/{id}/chunk` (exists) — the world geometry contracts.
- `WS /worlds/{id}/session/{sid}/stream` → per-session scene deltas (only changed minions) + bus events (god:beat, vo, audio_state, whisper) — replaces the 0.5 s poll for the player's session.
- `POST /auth/{register,login,refresh,logout}`; `POST /play/session` (the broker).

### M.5 Event-bus message types
`saga:resolved`, `minion:death`, `awakening` (a minion crossed the threshold), `god:beat` (an irreversible L5 moment + its text + actor_id), `divine_act` (a visible override/god-power, for the colony to perceive), `whisper` (a 3B chatter line), `vo` (a TTS line: actor_id + audio_ref + phonemes), `audio_state` (e.g. a hush region), `alert` (a critical non-diegetic notification). The render plane and the UI both subscribe; the in-memory bus becomes Redis pub/sub at the scale gate so multiple API/render processes share it.

### M.6 The preserved contracts (do not break)
The renderer-agnostic scene-state (one authoritative state, two renderers); the deterministic seed-from-world generation (world-layout + interiors); the storyline→asset resolver (`scene_assets.using_asset`); the manifest (url→/Game asset) the chunk streamer consumes; the five-layer tier routing in `llm.py`. Every new field and route is additive and versioned; the determinism CI test is the guardrail that keeps the two renderers identical.


---

## ANNEX N — THE ART BIBLE, COMPETITIVE ANALYSIS & TEST CATALOGUE

### N.1 The art-direction north star (Harmony Heights)
The visual fusion of three looks into one coherent style: **futuristic/Avatar** (sleek white sci-fi curved shells, chrome rims, saucer/disc rooftop pads, soft cyan/teal glow lines, holographic waterfalls, bioluminescent flora), **GTA 5** (grounded modern urban realism — brick + concrete + glass mid-rises, street grime, graffiti walls, neon shop signage, dense street furniture, believable wear), and **The Sims** (warm inviting readable interiors, friendly silhouettes, the neon plumbob motif, rooftop gardens, cozy lighting). Signature recurring elements: white curved towers with a disc/saucer crown + antenna mast; holographic waterfalls cascading down terraces; jacaranda/purple-bloom trees and green rooftop gardens with hanging vines; neon signage (plumbob green, electric cyan, magenta); Avatar-style billboards + GTA graffiti on the same block; glass balconies with warm dusk window glow; mixed materials per building (brick base → concrete mid → glass+white-composite top). Palette: warm concrete grey, charcoal brick, off-white composite (neutrals); cyan/teal glow, plumbob green, magenta neon, jacaranda purple (accents). Lighting: dusk/blue-hour default; warm 2700K interiors; emissive neon + holo cyan; Lumen GI, soft volumetrics, gentle bloom on emissives. Build rules for every GLB: PBR metal/rough, real-world scale (1u=1m), Nanite-ready, clean LODs, emissive channels authored for neon/holo so they glow under Lumen; the modern-era skin is the default, the era axis a variant.

### N.2 The asset taxonomy & the coherence law
The catalogue spans the domains the world needs: interiors (every room's contents down to cutlery, the "shit insides"), architecture (walls/floors/roofs/ceilings/doors/windows/stairs/railings/columns/facades/fences/bridges/ground), buildings (civic/residential/commercial/industrial × era), the science/tech machines and guild-workshop apparatus (the "minions doing the work" assets — the valuable content, generated first), the minions themselves (per guild/life-stage/role/awakened), vehicles (cars/drones/planes/boats/rail), sky/celestial (sun/moon phases/planets/stars/aurora/weather), terrain/landforms/water, roads/infrastructure, wildlife, and flora/crops. The generation list is the **distinct meaningful subjects** — no colour-variant bloat (one fork, not eight); colour/style/LOD are derived (recolor/decimate/material-swap), not separately generated. The prompt convention is the plain themed phrase ("Futuristic Avatar movie Sims 4 x GTA 5 Futuristic <thing>") with the science/guild/work function context woven in so each machine is *this* world's machine. The coherence law (the dominant visual risk is the AI-gen grab-bag): one master material every surface obeys, applied on import (not the Tripo baked materials); scale normalisation; a world-level palette LUT + dusk grade pulling even off-palette albedo toward the bible; a shared detail-normal + grime overlay; a shared trim-sheet/atlas; and a per-category silhouette QA gate rejecting outliers. The default city reads modern-photoreal; the era-spanning library serves the evolution mode.

### N.3 Competitive analysis (the honest positioning)
| Game | What it does best | What we take | Where we differ |
|---|---|---|---|
| The Sims 4 | Needs/autonomy, smart objects, relationships, build/buy, moodlets | The life-sim depth and the smart-object loop | Our minions have *real* LLM cognition, memory, mortality, and awareness of the player — not scripted whims |
| GTA 5 | A dense living modern city, traffic, physics, crime, radio | The living-city density and the verbs | The city *reacts* to the player as a watched god; possession is one primitive across all bodies |
| RimWorld / Dwarf Fortress | Emergent story generation, deep systems, failure cascades | The deep-sim emergent-story engine and the cascade | Our story has an authored awakening spine and a 70B confrontation, not pure emergence |
| Black & White | The god-creature relationship, the world reacting to your morality | The watched-creator emotional core | The colony *becomes aware* it is watched and *confronts* the creator — the beat no god-game has |
| Avatar: Frontiers / Cyberpunk 2077 | Bioluminescent/neon photoreal rendering | The art-direction bar | We stream UE5 via Pixel Streaming and amortise the AI brain colony-wide |
| AI Dungeon / Character.AI | Open-ended LLM interaction | The LLM-native premise | We bound the generation (the four-gate moderation + the hybrid tree) so it's coherent and safe, and embed it in a *world*, not a chat |

The defensible position is **none of them** — "the game where a deep autonomous world becomes aware of you." We do not win by matching Sims/GTA/DF feature-for-feature; we win by spending the budget on the singular hook and treating their systems as depth in service of it.

### N.4 The test-case catalogue (representative, per discipline)
- **Sim regression:** 10k-tick zero-raise run; population conservation; economy conservation; referential integrity; golden-state digest reproduction; needs/emotion bounds; memory monotonicity.
- **Determinism:** two-seed identical-digest; WebGL-vs-UE5 position agreement; cassette replay byte-identical; replay-from-input-log state match.
- **Movement:** deterministic path between two slots; 200-minion 1000-tick under-budget; interior path stitch (street→ward); RVO non-interpenetration; cold-minion no-pathfind; restart position persistence.
- **AI behaviour:** schema validity per layer; P(valid)/P(refusal)/coherence bands over N×M samples; entity-grounding (a never-existed reference blocked); golden-path beat-fire ≥95% with correct routing and no-misfire; answer-branch determinism + soul-memory persistence; identity-drift snap alert; canary-prompt drift.
- **Safety:** the red-team smoke corpus (no harmful content); prompt-injection via dialogue (a jailbreak attempt blocked); the Dread-Dial scaling darkness within the fixed ceiling; over-block rate within budget; localisation moderation.
- **Possession/override:** possess suspends decide(); release leaves a lost-time memory; force-against-values eventually expels; override sticks for TTL + writes a divine-act memory + shifts the stance; a cull-flood rate-limited.
- **Perf:** 16.6 ms p99 on the dual-4090 rig; p95 input-to-photon <100 ms; impostor-LOD draw-cost drop; no frame spike on a god-beat cutscene.
- **Soak:** 72h flat memory/VRAM/DB; the arc breathes (no saturate-and-stick); coherent self-models at t=72h; kill-the-box recovery.
- **Backend/security:** SQLite-lock cliff (the Postgres trigger); JWT authz on a god-verb; an audit row per god-action; ephemeral-TURN credential; the secrets store (no "dev-key" shippable).
- **Business:** the per-player cost ledger (GPU-seconds → $); the watched-creator engagement → D30 correlation; the margin circuit-breaker throttling a hot cohort.

---

## ANNEX O — SCHEDULE, ORG & EXPANDED GLOSSARY

### O.1 The schedule narrative (shape, not dates)
The critical path is the spine: Sprint 0 (wire the dark layers — a week, on existing functions) runs in parallel with the start of P0 (movement — the longest pole of pre-pro, weeks). P1 (player/God presence) begins as soon as P0's contract v2 lands. P2 (embodiment) and the art coherence pass run in parallel with P1, gated by P0's movement. P3 (the awakening playable) integrates the Director (built in Sprint 0) with the confrontation cutscene (gated by P2's hero face). The Vertical Slice (G1) is the convergence of P0–P3 on one district at ship quality — 4–9 months of the 8–15-person core. Only after G1 do the depth phases (D1–D4) and the production headcount ramp begin; First Playable extends the loop across districts; Alpha hits feature lock; Beta hits content lock (the remaining ~2,500 assets through the automated loop, all VO/audio wired, all cutscenes rendered); Gold adds cert/ratings/load-test/safety sign-off; Launch and Live-Ops follow. The two recurring-cost workstreams (inference cost-engineering and asset generation) run continuously from pre-pro. The schedule is held by **cutting content, never slipping a gate.**

### O.2 The org chart (by stage)
Pre-pro core (8–15): a Product Owner/EP; 2 gameplay/engine engineers (the keystone first); 1–2 tech artists/character TDs; 1–2 UE5 environment/lighting artists; 1 systems/AI-integration engineer; 1 technical designer; 1 UI/UX designer; 1 audio designer (contract OK); the sim/LLM authors as advisors. First Playable (30–50): the above scaled + a backend/online engineer, a dedicated QA lead, a producer. Alpha (80–150): content teams (designers, artists, animators), a QA team standing up, an AI-safety/red-team function beginning, an LLMOps/cost engineer. Beta (150–300+ peak): a content surge, a full QA org, the live-ops back-end team, AI-safety/red-team at full, a community/marketing function. Gold/Launch: + cert/compliance, marketing, community, war-room/on-call. Live-Ops: a sustaining core (40–80) + seasonal content pods + the LLMOps/cost-engineering and AI-safety functions as permanent. The disciplines unique to this title that are launch-blockers: AI-safety/red-team/content-moderation, and back-end/LLMOps/cost-engineering (inference cost is the business).

### O.3 Expanded glossary
**Overmind** (L1, 70B) — the colony's collective intelligence, computing its stance toward the creator. **God-Brain** (L5, 70B) — the model voicing the irreversible confrontation beats. **High-Minion / Normal** (L2/L3, 8B) — named/awakened and everyday individual cognition. **Background-Chatter** (L4, 3B) — the eerie one-line whispers. **The Director** — the orchestrator that paces the world and is the sole caller of L1/L5. **DramaMeter / DirectorState** — the Director's read of the world and its pacing decision. **The awakening arc** — the five-act state machine (Garden → First Glance → Doors on Walls → Confrontation → Schism) over collective awareness, with the Reckoning terminal node and five endings (Worship/Rebellion/Ascension/Extinction/Symbiosis). **The Watched-Creator loop** — gaze/act → PresenceField → Overmind → visible colony reaction → the player adjusts; absence is also an input. **The keystone** — server-tracked movement; the prerequisite for the inhabitable world. **The tracer bullet** — the one end-to-end thread the slice must prove. **Soul-creed** — the compressed memory a reincarnating soul carries, so a colony remembers the creator across death. **The override bus** — the resolver making player overrides first-class, perceptible sim objects. **Possession / ControlMask / rapport-drift** — the temporary merge, what the player vs the AI controls, and the resistance that can expel the rider. **The Dread-Dial** — the player intensity setting that scales content darkness within a fixed harmful-content ceiling. **Cognitive LOD** (hot/warm/cold) — the affordability mechanism; the hot set is gaze-promoted. **Spatial LOD** — the movement analogue (active-city stepping; cold teleport-on-demand). **EditLayer** — the append-only diff of player edits over the deterministic world, the persistence model. **The four-gate moderation** — prompt-constraint + classifier + entity-grounding + severity-routing, the safety spine. **The inequality** — revenue/player-hour ≥ GPU cost/player-hour, the business condition. **The moment** — the confrontation landing emotionally, the creative condition. **The five things never to lose sight of** — movement (the keystone), the Director (the integration), moderation (the launch-blocker), cost-per-player-hour (the business), and the confrontation landing (the creative).

### O.4 The closing law
The brain is real and arguably past the comparables. The body and the game are the work, in order, on the spine: movement → presence → embodiment → the awakening made playable, with the depth layers (Sims life, GTA city, cinematics, audio, multiplayer, live-ops) threaded through the gates at the points their criteria require. Hold the five things; gate the money and the scope; prove the hook and the cost before scaling; and never slip a gate — cut content to hold it. This document is the living source of truth; every gate updates it.

*— End of the Underworld Minions Production Bible.*



---
---

# BOOK V — PROFESSIONAL COMPLETENESS UPGRADE

This book is the implementation-grade layer the core Production Bible asserts but does not operationalize. Where Books I–IV describe *intent* — the gates, the hook, the nine systems, the five endings, the render targets, the cost thesis — Book V supplies what a team actually builds and ships against: exact data contracts and DDL, wire-protocol deltas, scoring formulas with constants, finite-state machines, per-system budgets and thresholds, acceptance criteria, failure modes, RACI gaps, and dependency-correct task ordering. Every section is grounded against the real game code under `/opt/jarvis-app-1/underworld/`, and the recurring, load-bearing finding across all twelve disciplines is the same: **the bible reads as if the new architecture exists; the code shows it largely does not.** Positions are still a static hash spiral (`scene_state._position`, `contract_version: 1`); there is no movement layer, no Director, no presence/override/possession, no creator-ledger, no cost ledger, no moderation on the existential text path, no Alembic, static `"dev-key"` bearer auth, and the one shipped safety module guards the wrong domain. Book V is the concrete delta — seam by seam, number by number — that makes the rest of the bible buildable and gateable rather than aspirational.

A note on shared spine: several contracts recur across disciplines and are specified once here as canonical, then referenced. **Scene-state contract v2** (the additive bump from `contract_version: 1`, with movement, narrative, audio-RTPC, render, and presence fields), the **per-tick LLM cost ledger**, the **single `surface()` moderation seam**, the **inference governor** (per-tier semaphores + circuit breaker + model-stamping), and the **EditLayer / override audit log** are each authored in their owning discipline's section and consumed everywhere else. The build order at the end of each section is local; the cross-cutting critical path is: *Event/contract bump → movement keystone (P0) → scene-state v2 → presence/Director wiring → moderation seam → the dark cognition layers → gates.*

---

## PART A — EXECUTIVE PRODUCER / PRODUCT OWNER

This is the governance layer that makes the existing gates *executable*. The EP's pre-G1 job is exactly four things: **measure the hook honestly, measure the cost honestly, hold the keystone timebox, and say no to everything else.** Everything below serves one of those four. Grounded: `server/services/scene_state.py:297` still emits `contract_version: 1` with `hash`-derived positions at `_position()`; auth is a single static `settings.api_key` bearer at `server/auth.py:11`; no cost/telemetry/playtest instrumentation exists anywhere in `underworld/server/`.

### A.1 The G1 greenlight scorecard (the gate has no pass/fail math)

The bible passes G1 if naive testers "feel watched" and "unit economics project viable" but defines no measurement instrument, sample size, or numeric thresholds. A gate you cannot fail is not a gate. The **G1 Greenlight Evidence Pack** that the PO assembles and the Board signs:

**A. Hook-validation instrument.** Run n ≥ 12 naive testers (never seen the build, not game-industry), each a single ~20-min session, screen + face-cam recorded.

| Metric | Source | G1 pass threshold | Kill threshold |
|---|---|---|---|
| Felt-watched score | post-session Likert 1–7 ("I felt the colony was aware of me") | median ≥ 5, ≥ 60% score ≥ 5 | median ≤ 3 |
| Choice-mattered score | Likert 1–7 ("my actions changed the colony") | median ≥ 5 | median ≤ 3 |
| Confrontation reaction | coded face-cam at the God-Brain beat (lean-in, freeze, verbalization, "oh no") | ≥ 50% show a codeable reaction | < 25% |
| Unprompted recall (48h) | follow-up: describe the confrontation unprompted? | ≥ 40% | < 15% |
| Completion | reached the confrontation without facilitator rescue | ≥ 75% | < 50% |
| SUS usability | standard SUS | ≥ 68 (fix-list trigger, not gate-blocker) | — |

≥ 1 validation session must be an investor/board observer who self-reports the affect (the "board member's stomach drop"). Code the face-cam with two independent raters; report Cohen's κ ≥ 0.6 or recode. **Pre-register these thresholds in writing before the first session** — that pre-registration is itself a G1 deliverable, and the only defense against validation theater.

**B. Unit-economics instrument.** A measured **$/player-hour ≤ the projected blended ARPPU-hour** at the planned price with ≥ 30% gross-margin headroom, computed on the slice's actual instrumented run via the cost ledger (`underworld/server/services/cost_ledger.py`, does not exist — see Part J for the full schema). The G1 pass requires this number measured, not spreadsheeted. If the slice cannot be instrumented to produce it, **G1 does not pass regardless of the emotional result** — the project dies on COGS otherwise.

**C. Pipeline-proven evidence.** Each of the three claimed pipelines must produce a green CI artifact: (1) gen→LOD→import→package→stream produces one asset end-to-end with the import authoring Nanite/emissive/collision/scale (the current `Scripts/import_glbs.py` does not — a named gate blocker); (2) the determinism contract test (WebGL vs UE5 position agreement off one `scene_state`) is green; (3) the event→God-Brain→cutscene thread fires exactly once on a forced-threshold fixture world and writes an idempotent `DirectorBeat`.

### A.2 Scope-control machinery

**Change Control Board (CCB) + scope-change request (SCR) form.** After any lock (feature lock at G3, content lock at G4), every net-new request is a written SCR carrying: the request, the hook-test verdict (serves the watched-creator loop — yes/no/maybe), cost in person-days, schedule delta, what it displaces, and the risk if cut. CCB = PO (A) + Producer (R) + Tech Dir + Creative Dir; weekly. Disposition: **accept-and-displace** (something named gets cut), **defer-to-live-ops-backlog**, or **reject**. Default disposition is **reject** — burden of proof is on the addition.

**Overbuild freeze, enforced not exhorted.** A CI/policy gate: a PR touching `server/services/cognition.py`, `science.py`, the 56-science tree, or running broad `scripts/tripo_generate.py` batches without a spine-ticket reference in the commit is auto-flagged for PO review. The freeze whitelist is *wiring* the three dark layers, not deepening them. Concretely this blocks the kind of commits live on `main` now (`feat(cognition): 5-layer Minion model stack`, `feat(assets): comprehensive Underworld subject list ~3.2k`) until P0 movement lands — exactly the misallocation the bible's §3.3 warns about, still happening.

**WIP discipline.** One spine epic in flight (P0→P1→P2→P3 strictly serial at the epic level). Depth epics run in parallel only at the gate point their criteria require (moderation before any external playtest; Postgres before beta; asset-coherence pass before content-complete). The PO owns one ordered list.

### A.3 Gate exit-criteria precision (G2–G6)

- **G2 (First Playable):** re-run the hook instrument on ≥ 2 additional districts; felt-watched median must **not regress > 1 point** vs the slice. Zero P0/P1 contract-test failures across districts; movement < 5 ms/tick at the 200-minion budget at new district scale. Stop condition: regression > 1 point or contract test can't stay green across districts.
- **G3 (Alpha / feature lock):** every shipping feature reachable via a **traceability matrix** (feature → reachable in-build path → owning test). Feature lock enforced by CCB. Red-team corpus running in CI by Alpha as a hard G3 *entry* gate, not a soft start.
- **G4 (Beta / content lock):** remaining ~2,500 assets through the automated loop all pass the per-category silhouette QA gate; reject-rate ceiling ≤ 5% post-grade outliers as a numeric content-lock criterion. Perf at target on dual-4090: 16.6 ms p99, p95 input-to-photon < 100 ms. Zero A-bugs, trending B-bugs.
- **G5 (Gold):** four-gate moderation over the full red-team corpus at 0 harmful escapes; over-block rate within a defined UX budget (≤ 2%). AI-Safety holds the documented veto.
- **G6 (Launch):** the cost circuit-breaker **demonstrated tripping** in a staged load test (e.g. $/player-hour > 1.4× plan for 5 min → throttle hot cohort to warm cognitive LOD), as a G6 exit artifact.

### A.4 Schedule structure: dependency math, buffer, critical-path failure mode

Critical-path table for pre-pro (convergence to G1):

| Phase | Gates on | Parallelizable with | Longest-pole risk |
|---|---|---|---|
| Sprint 0 (dark layers) | nothing (existing fns) | P0 | low — wiring only |
| P0 movement (KEYSTONE) | nothing | Sprint 0 | **highest — blocks P1/P2/P3** |
| P1 presence | P0 contract v2 | P2, art pass | med |
| P2 embodiment | P0 movement | P1 | med (hero MetaHuman is the confrontation gate) |
| P3 awakening playable | Sprint 0 (Director) + P2 (hero face) | — | the integration convergence |

**Buffer policy:** a **20% schedule buffer held by the Producer at the project level**, not per-task (Critical-Chain style; task padding evaporates to Parkinson's law). **P0 hard timebox ~8 weeks**: if movement isn't walking-with-collision by then, ship the slice on the nav-mesh fallback and defer crowd RVO/spatial-LOD (P0.6) to First Playable.

**Keystone-decoupling contingency:** P1/P2/P3 have a **behavior-bias fallback** that doesn't require full pathfinding (per `L2 P1.7`: behaviour bias / clustering until full movement). If P0 slips, the slice can still validate the hook with minions that teleport/bias-cluster (not walk) plus the full Director + confrontation — because the hook is emotional awareness, not locomotion fidelity. This protects G1 (the funding gate) from the keystone (the engineering risk).

### A.5 Org/RACI completeness

Roles missing from the org chart, to add: a **build/release engineer** (owns the gen→stream CI/CD loop); a **playtest/UR coordinator** (owns the G1 instrument); a **data/telemetry engineer** (owns the cost ledger — fold into the single systems/AI-integration engineer for pre-pro and name it explicitly).

RACI rows missing entirely: *Hook-validation pass/fail call* (PO = A, Creative = C, Board = I — PO must own the kill call to avoid sunk-cost capture); *Cost-ledger threshold / circuit-breaker trip value* (Tech Dir = A pre-LLMOps, then LLMOps = R); *Determinism-contract break* (QA = A — the most-cited do-not-break contract currently has no owner); *Asset-coherence reject* (Art = A). **Disambiguate the G1 double-accountability: PO is A for the hook-validation verdict (does it land); Board is A for the money release (do we fund production).**

### A.6 EP-discipline risk register additions

| # | Risk | Sev | Likelihood | Mitigation | Owner |
|---|---|---|---|---|---|
| 16 | Hook-validation theater — team tunes the slice to testers / facilitator-rescues / leading questions → false GO | Critical | Med | Pre-registered thresholds; blind naive recruits; scripted neutral facilitation; ≥1 board observer; κ-checked coding | PO |
| 17 | Single-EP key-person risk — one PO holds gates, scope, the no, playtest; bus-factor 1 | High | Med | Documented gate criteria; Producer as deputy / delegated CCB chair | Board |
| 18 | Slice can't be instrumented for $/player-hour | Critical | High (now) | Build `cost_ledger.py` as a P1/Sprint-0 deliverable | Systems eng |
| 19 | Gate-slip-by-redefinition — holding the bar by quietly relaxing criteria | High | Med | Written, versioned, pre-registered exit criteria; gate-review minutes | PO |
| 20 | Determinism guardrail unowned — WebGL/UE5 contract test silently rots | High | Med | QA owns it from First Playable; required green check on every scene-state PR | QA |
| 21 | Funding-tranche timing — pre-pro raise burns before G1 lands | High | Med | Raise pre-pro + ~25% contingency runway; the P0 timebox caps the longest pole | PO/Board |

### A.7 PO decisions (with recommendations)

1. **Pre-register hook thresholds before any playtest?** Yes — the single highest-integrity move.
2. **P0 keystone timebox/fallback?** ~8 weeks hard; nav-mesh fallback ships the slice, crowd RVO defers to G2.
3. **Instrument cost or assert it?** Instrument — build `cost_ledger.py` in Sprint 0.
4. **Buffer: per-task or project-level?** Project-level, Producer-held, ~20%.
5. **Who owns the kill call at G1?** PO owns the hook verdict; Board owns the money.
6. **Freeze enforcement: policy or culture?** Policy (CI flag) — culture already failed once on `main`.

This is deliberately the *minimum* governance to make the existing gates executable; it does **not** add live-ops season-planning, a portfolio P&L, or a publishing/GTM workstream pre-G1 — those gate *after* G1 and adding them now would be the scope-creep this discipline exists to prevent.

---

## PART B — TECHNICAL DIRECTOR (Movement Keystone, Netcode, Inference Governor, Persistence)

Grounded audit: there is **no movement layer** (only `services/grid.py`, 73 lines; no `plan_path`/`WORLD_NAV`); positions are a deterministic hash in `scene_state.py:47`; the road graph in `world_layout.py:542-549` is **geometric only** (golden-angle spokes + ring radii — *not* a connected node/edge navgraph); the UE5 minion is a lerping `AActor` with no `CharacterMovementComponent`; both renderers **poll**; the event bus is an in-process `asyncio.Queue`; auth is static-bearer with default `"dev-key"`; the `Minion` model has **no** position/movement columns; there is **no Director, presence, override, possession, session, or llm_governor module**.

### B.1 The keystone: the navgraph the bible assumes but the code lacks

The hard gap: `WORLD_NAV` is "a navgraph built deterministically from the road graph" — **but there is no road graph to build it from.** `world_layout.py` emits `roads: [{kind:"spoke",...}, {kind:"ring", radius, center}]`, which are *render hints*. Spokes share origin `[0,0]`; ring roads are parametric circles with no intersection nodes; buildings carry `pos` but no road-adjacency.

**Task P0.0 (blocks P0.1):** `world_layout.build_navgraph(layout) -> {nodes, edges}` that (a) samples each ring at its spoke-crossings to materialize intersection nodes, (b) snaps every building placement to its nearest road point (entrance node + stub edge), (c) emits undirected edges `cost = euclidean(a,b)`. Deterministic: node ids = `f"n{ring}_{spoke}"`, tie-break by id. *Done: pure function of the layout dict; two same-seed calls produce byte-identical node/edge lists; every building entrance reachable from every other (connected-component assertion in CI).*

Concrete record definitions (the bible names them, never defines fields):

```python
# services/movement.py
@dataclass(frozen=True)
class NavNode:   id: str; pos: tuple[float,float]; kind: Literal["intersection","entrance","interior"]
@dataclass(frozen=True)
class NavEdge:   a: str; b: str; cost: float; width: float  # width → road clamp
@dataclass
class Kinematic:                       # persisted on Minion (see §B.6 for storage decision)
    pos: tuple[float,float,float]      # authoritative; supersedes scene_state._position
    vel: tuple[float,float,float]
    path: list[str]                    # remaining NavNode ids
    path_idx: int
    target_slot: str | None
    move_state: Literal["idle","walking","arrived","blocked","teleporting"]
    speed: float                       # life_stage × fatigue × terrain
    last_planned_tick: int
```

`plan_path(nav, from_node, to_slot, *, seed) -> list[str]` — A* with open-set tie-broken by `(f_cost, node_id)` for determinism (mirroring `random.Random(seed.seed_int ^ (world.tick * 0x9E3779B1))` at `simulation.py:254`). **Cache key = `(from_node, to_slot)` not `(from, to)`** — slots are stable, raw positions are not; this is what makes "thousands of cached paths computed once" true. Unreachable `to_slot` (disconnected component after a wall/demolish edit) → return `[]`, set `move_state="teleporting"`, fall back to the hash position, never raise (preserves the "never raise into the tick" contract).

**Integration point:** insert `await movement.step_world(session, world, dt_ticks=1)` in `advance_world` *after* the decide loop (so `last_action` is fresh) and *before* the next `build_scene_state`. `step_world` iterates the active-city hot set, calls `assign_target` (lift `_ACTION_MAP` from `scene_state.py:119` into `movement.py` as the single source so scene-state and movement can't drift), `plan_path` on target-change, `step_minion`, and writes movement. **Acceptance:** 200-minion world steps 1000 ticks under 5 ms/tick; A* called O(slots) not O(minions × ticks).

### B.2 Scene-state contract v2 — the canonical diff + versioning protocol

This is the single canonical v2 spec (Lead Design, Narrative, Graphics, Audio, UX, and the Director all add fields to it; all consume from here). **v2 is strictly additive — a v1 client ignores unknown keys and still renders** — with one called-out exception below.

- **Position source change:** `minion_visual` currently *computes* position from the hash (`_position`). v2 reads `m.movement.pos` when present, falls back to `_position` only when movement is None (cold/unmigrated minions). This is a **semantic change to an existing field even though the key name is identical** — treat it as a major change gated behind the determinism CI test, not a purely additive one.
- **Net-new per-minion fields** (union of all disciplines): `velocity`, `path`, `path_cursor`, `move_state`, `speed`, `target_slot`, `nav_state`, `yaw`, `interacting:{object_id, slot_socket, anchor, anim, kind, phase, progress}`, `emotion` + `intensity` (the appraisal pair, see Part L), `faction`, `life_stage`, `creed_stance`, `confronting:bool`, `existential_pressure`, `stance_personal`, `region_id`, `awakened_tick:int`, `confrontable:bool`. Keep existing `position/facing/anim/using_asset/awareness/thought/identity/drive/awakened/scale/gene_edit/behavior`.
- **Net-new top-level/`frame` blocks:** `objects:[{id,kind,glb,state,occupants}]`, `vehicles:[…]`, and `frame.overmind:{mood, toward_creator, tension, omen, realisation}`, `frame.presence:{attention_hotspots:[{pos,intensity}], creator_present:bool}`, `frame.arc_stage`, `frame.mean_awareness`, `frame.awakened_count`, plus the `god` block (§B.3) and the `colony` block (Part G §1a) and `audio` RTPC mirror where applicable (Part F).
- **Version negotiation:** client sends `?contract=2`; server emits the highest it supports ≤ requested, echoing `contract_version`. Bump rule: additive field → minor (no break); semantic change to an existing field → major, gated by the determinism CI test.
- **CI contract test** (`tests/test_scene_state_contract.py`): build a fixture world, run `step_world` N ticks, assert (1) JSON-schema validity against a checked-in `scene_state.v2.schema.json`; (2) **position parity** — WebGL-computed and UE5-computed render positions, both from the same `pos`+`path`, agree within ε=0.01u; (3) `move_state` ∈ enum; (4) every `target_slot` references a live building (referential integrity / hallucination anchor). *Done: green on a WebGL stub renderer and a headless UE5 cook in CI.*

### B.3 Authority/netcode contract — the wire-level reconciliation spec

- **Possession reconcile loop:** while possessed, UE5 sends `pos`+`vel` over the WebRTC data channel at input rate (~30–60 Hz). Each tick the sim validates `dist(reported, last_authoritative) ≤ speed_max × dt_ticks × (1 + SLACK)` with `SLACK=0.25`; over → clamp to the navmesh-projected point and `anti_cheat_clamps++`. **Snap threshold:** `dist > 3.0u` → authoritative-snap + a `correction` event; client blends over 150 ms. **Jitter:** client interpolates AI minions with a 1-tick buffer; the possessed pawn is not buffered (client-predicted).
- **Autonomy-suspend wire:** possession sets `Minion.brain["autonomy"]=0` **and** the agent loop honors it — net-new guard: `if (m.brain or {}).get("autonomy", 1.0) <= 0: skip decide()`. Without this code change the "sim suspends that minion's autonomy" sentence is unimplemented. Release restores autonomy=1 and resumes from `m.movement.pos`.
- **Conflict resolution:** `Minion.brain["possessed_by"]` (session_id) checked under the same DB row write; second `/possess` returns `409 Conflict`. The sim is the arbiter; the render plane never adjudicates.
- **God-command idempotency:** idempotency key = `(world_id, kind, target_id, fired_tick)`; the `DirectorBeat` table is the dedupe ledger (write-if-absent), making "fires exactly one god-beat, never re-fires" enforceable at the data layer.
- **The `god` scene-state block (net-new, owns the render triggers for Part E/G):** `{possessed_minion_id, gaze_target_xyz|null, last_act:{type:bless|cull|gift, target_id, t}, presence_intensity:0..1}`. `presence_intensity` is continuous so the gaze warm-key can ramp; `last_act` cull is rate-limited at source.

### B.4 The inference governor — the missing module + queue spec + capacity tests

`services/llm_governor.py` does not exist; routing today is `tools/llm.py` (tier → model, with a fallback ladder that *silently downgrades 70B→32B*). This is the canonical governor spec (QA, Backend, and Business all build against it):

- **Per-tier semaphore + bounded queue:** `SEM = {overmind:1, god_brain:1, high_minion:N8, normal_minion:N8, chatter:N3}` where N8/N3 derive from measured GPU throughput. Queue depth caps: `overmind/god_brain` = 4 (shed-oldest), `chatter` = unbounded-but-droppable. **Backpressure:** if `now - request.enqueued_tick > 2` ticks → drop to heuristic (`global_workspace`, the proven rule-based fallback). The 70B/god_brain tier gets its **own** semaphore/queue, never shared with sheddable tiers, or a chatter storm starves the confrontation beat.
- **Prefix-cache acceptance test:** assert the static system prompt is byte-identical across all `reflect()` calls in a tick (so SGLang/vLLM prefix-caching hits). A regression that interpolates per-minion data into the system prompt fails CI.
- **Model-identity stamping:** every governor response carries `resolved_model` (the actual model after downgrade) and `fallback_engaged: bool`. Persist on `DirectorBeat.payload_json` and reflection memories. **Cert predicate:** `assert no beat in run has resolved_model != requested_model`. Currently impossible to check because downgrade is silent — closing that hole is net-new and a launch-blocker.
- **Capacity math made testable:** a load harness drives Overmind at 1 call/30 s across K simulated worlds; the single 70B partition must hold p95 < 8 s up to K≈60–120. The crossover *is* the per-partition world ceiling and feeds the autoscale trigger.
- **Cooperative preemption:** priority `god_brain(0) > overmind(1) > high_major(2) > high_minion(3) > normal(4) > chatter(5)`. You cannot kill an in-flight Ollama generation; the size-1 70B semaphore plus reservation guarantees god_brain waits at most one 8B-equivalent.
- **Cold-load hazard:** a 70B not resident has 30–120 s first-token latency the 8 s SLO can't absorb — pin `keep_alive`, or treat first-call-after-idle as a breaker-trip and fall back.

**Open decision — SGLang vs vLLM:** recommend **SGLang** for this workload — RadixAttention prefix-caching (the "single biggest cut") handles the shared-system-prompt-with-divergent-suffix pattern of minion reflections better than vLLM's prefix cache; vLLM wins raw throughput, but the colony's value is prefix reuse. Decision owner: LLMOps; prove via the prefix-cache hit-rate test at Alpha.

### B.5 Persistence & migration

No Alembic exists (no `alembic.ini`, no migration env). Ordering decision: **P0.2 stores `movement` inside the existing `brain` JSON column** as `brain["movement"]`, not a new column — zero migration, ships on SQLite for the slice. Promote to a dedicated JSONB column only at the Postgres/Alembic gate. (This resolves an unstated conflict: you cannot require Alembic for the keystone if Alembic lands at beta.)

- **Migration trigger (a tripwire, not a guess):** alarm when SQLite `"database is locked"` retry count > 0/min under the `timeout=30` busy-wait, OR write-txn/s > 100 sustained. That alarm *is* the Postgres go-signal.
- **EditLayer replay determinism:** `base_world(seed) + replay(EditLayer ORDER BY tick, id) == persisted_world` byte-for-byte. Without an explicit total order, two edits in the same tick composite non-deterministically.

### B.6 Event bus & WebSocket — delta protocol + Redis cutover

- **Delta protocol:** the sim keeps a per-world `dirty_minions: set[id]` populated whenever movement or cognition writes. WS frame = `{tick, changed:[minion_visual(m) for dirty], removed:[dead ids], frame:{overmind,…}}`. **Keyframe cadence** every K=20 ticks (resync after loss / late join). *Done: WS bandwidth scales with `|dirty|`, not population; a late-joiner gets a keyframe within K ticks.*
- **Redis cutover invariant:** the in-memory bus and Redis pub/sub sit behind one `publish(world_id, event)` interface (already true). **Multi-process hazard:** once sim and render-API are separate processes, the `asyncio.Queue` bus is invisible across processes — the WS stream sees *nothing*. Redis pub/sub is therefore a **hard prerequisite the moment planes split**, not a scale-gate nicety.

### B.7 Security — god-verb authz + economic-DoS contract

There is **no rate-limit/cooldown infrastructure anywhere** in the server. (Full per-verb table and the god-verb pipeline are in Part I §B-3; the TD-level requirements: per-verb token bucket keyed by `(player_id, verb)`; god-verbs check **world ownership/grant**, not just a valid token, and write an audit row per action; the default `"dev-key"` must be changed before any external playtest — currently shippable and must not be.) **Prompt-injection boundary:** player free-text from `/minions/{id}/chat` and `/player/command{kind:speak}` must be delimited *user* content, never concatenated into the system role, and the output JSON-schema-validated before it persists into a minion's memory.

### B.8 Determinism seam — movement-specific gaps

New non-determinism sources: (a) A* open-set order (fixed by the `(f_cost, id)` tie-break); (b) RVO/local avoidance — **decision: run RVO client-side only (presentation), never server-authoritative**, so it can't affect the deterministic `pos`/`path`; server collision stays coarse (slot occupancy + road-width clamp); (c) float accumulation in `step_minion` — pin a fixed `dt_ticks` and round `pos` to 3 decimals on write (matching the `round(…,3)` convention) so cross-platform float drift can't diverge WebGL vs UE5.

### B.9 Net-new technical risks

| # | Risk | Sev | Mitigation | Prove by |
|---|---|---|---|---|
| T9 | No navgraph; `roads` are render hints | High | `build_navgraph` + connectivity CI assertion | Slice |
| T10 | Silent 70B→32B fallback invalidates God-Brain quality, no record | High | `resolved_model` stamping + no-fallback cert predicate | Alpha/Cert |
| T11 | In-memory bus invisible across processes the moment planes split | High | Redis pub/sub a plane-split prerequisite | Plane-split |
| T12 | No rate-limit infra → god-verb cull/LLM-cost DoS against own sim | High | Per-verb token buckets + audit rows | Slice / Beta |
| T13 | `"dev-key"` default + static bearer shippable today | Critical | Change default + ownership-checked god-verbs before external playtest | Slice gate |
| T14 | EditLayer composite non-deterministic without total order | Med | `ORDER BY tick,id` + replay-equality invariant | Alpha |
| T15 | Possession reconcile has no clamp/snap numbers | High | SLACK=0.25, snap>3u, 150ms blend, 1-tick buffer | Slice |

### B.10 Tracer-bullet acceptance harness

Slice-gate criteria (all six automatable, all green or the thread isn't "proven"): (1) server-walked minion's `pos` at tick T reproducible across two seeded runs; (2) WebGL and UE5 render within ε=0.01u off one scene-state; (3) the possessed minion's `run_tick` is provably *not* called; (4) input-to-photon for the possessed pawn < 100 ms p95; (5) a gaze POST to `/player/intent` moves `frame.overmind.toward_creator` within one Overmind cadence; (6) the thread runs over WS with poll disabled.

**Build-vs-buy:** SGLang over vLLM (§B.4). **RVO/crowd avoidance — buy** UE5 Detour Crowd / `UCrowdManager` for client-side local avoidance (presentation-only); do **not** build server-side crowd — keep the server's authoritative output to deterministic waypoints only.

---

## PART C — LEAD GAME DESIGNER (The Nine Systems, Economy, Presence, Possession, Whims)

Grounded: positions are a hash spiral; the tick is fully synchronous and DB-bound; **no slot/reservation, no wallet/inventory, no vehicle, no owner_id, no Faith, no PresenceField/OverrideBus/Director** exist; economy is macro-only, snapshot every 10 ticks; the cognition hot set is reputation-only (the bible's gaze/saga/possession union is unimplemented).

### C.1 Missing data contracts

**Kinematic columns on Minion** (new `db/models.py` columns, not a side table — single-writer SQLite cannot afford a join per tick). Authoritative units, since the bible mixes "tick (~1s)" and "real-time second":

| field | type | unit | default | notes |
|---|---|---|---|---|
| `pos_x,pos_z` | Float | world-m | spawn from `_position()` hash | y derived from heightmap at render |
| `vel_x,vel_z` | Float | m/tick | 0 | |
| `yaw` | Float | rad | hash facing | |
| `nav_state` | Enum | — | IDLE | IDLE/PATHING/ARRIVING/OCCUPYING/BLOCKED/RIDING/POSSESSED |
| `path` | JSON | list[node_id] | [] | coarse waypoints, cap 32 |
| `path_cursor` | Int | — | 0 | |
| `anchor_id` | str | — | home slot | slot it's bound to when OCCUPYING |
| `speed_cap` | Float | m/tick | by life_stage | infant 0.6, child 1.4, adult 2.2, elder 1.2 |
| `locomotion` | Enum | — | walk | walk/run/ride/carried |

`speed_cap` keys off `lifecycle.life_stage()`. **Acceptance:** `|pos − prev_pos| ≤ speed_cap` per tick; arrival when `dist(pos, slot.anchor) < 0.5m` → `nav_state→ARRIVING`. **Edge cases:** target slot deleted mid-path (player bulldoze) → `PATHING→BLOCKED→re-query`, never crash; path length 0 to an unreachable slot → teleport-on-arrival + logged `nav:unreachable`, never an infinite BLOCKED loop. *(Note: this duplicates Part B's Kinematic intent; for the slice it ships as `brain["movement"]` per Part B.5 to avoid a migration; the columns above are the post-Postgres promotion target.)*

**UseSlot — the missing Sims primitive (no reservation system exists).** Derived from layout, never authored: `slots_for(building) → list[Slot{slot_id, kind, anchor_pos, facing, capacity}]`. Slot counts per object kind — the single highest-value missing number set:

| object kind | operator | audience/queue | dirty-after | cooldown (ticks) |
|---|---|---|---|---|
| bed (home) | 1 | 0 | yes | 0 |
| forge/workshop | 1 | 2 queue | no | 1 |
| market stall | 1 seller | 4 buyer | no | 0 |
| academy desk | 1 | 0 | no | 0 |
| lecture podium | 1 | 8 audience | no | 2 |
| farm plot | 4 | 0 | no | 3 |
| monument/shrine | 0 | 12 worship | no | 0 |
| cell (jail) | 0 | N capacity | no | — |

**Reservation contract:** `claim(slot_id, minion_id) → bool` is an **atomic compare-and-set on an in-memory `dict[slot_id, set[minion_id]]` per world** (NOT a DB row — the tick can't afford a write-txn per claim). Persist only aggregate occupancy on snapshot. Two minions claiming a 1-slot forge same tick → exactly one wins (deterministic winner = lower `minion_id`); the loser re-queries next tick. **Critical edge case (a P0 the bible omits):** a minion holding a slot that dies mid-occupation must `release_all(minion_id)` on `lifecycle.kill()` or slots leak forever — a 72h soak deadlocks every forge without it.

**Object FSM** (the bible names states but no triggers/timings): bed `free→occupied→dirty` (after sleep ≥4 ticks) `→free` (clean or 20-tick decay); dirty bed −0.05 sanity to next user. Forge `cold→heating(2t)→hot→cooling(3t)`; only HOT yields work; claiming COLD costs heating time (this is what makes the economy bite with time). Market stall `stocked→trading→depleted→restock(5t)`; depleted raises local price. Power node `online→overloaded→down` — **reuse `grid.tick_grid` as the authority, surface its state as the FSM, don't build a second power model.**

**Wire contract v2 design additions** (see Part B.2 canonical list): per-minion `position` becomes authoritative (read `pos_x/z`, delete the hash call), plus `velocity, yaw, nav_state, path, path_cursor, interacting, awareness_tier`; top-level `objects[]`, `vehicles[]`. Extend `test_scene_state` to assert position comes from `m.pos_x`, not the hash (currently it would silently pass against the hash).

### C.2 Under-specified systems made concrete

**Utility selector (System 3)** — `services/utility.py`, replacing the random LLM-cohort action choice for warm/cold minions:
```
score(action) = Σ_n advertised_gain[n] * need_pressure[n]
              + drive_align(action, dominant_drive) * 0.6
              + role_bias[role][action] * 0.4
              - travel_cost(pos, nearest_slot(action)) * 0.15/metre
              - circadian_penalty(action, tod_phase)        # sleep@day = −0.8
pick = softmax(scores, temp=0.35)   # seeded from (tick, minion_id)
need_pressure[n] = (1 - need_value[n])^2   # quadratic so a near-empty need dominates
```
`advertised_gain` comes directly from `activities.Effect.deltas` (the activities module *is* the advertisement table; no new content). **Anti-thrash term the bible omits:** `+0.3 commitment` bonus to the currently-pathing action so a minion finishes its route — without it, movement *looks* broken even when correct.

**Micro-economy (System 4)** — add `wallet: Float=10.0`, `inventory: JSON={}`, `wealth` (derived); add `owner_id` to building slots. Completed work interaction: `wallet += base_wage(2.0) * skill * guild_demand`, drawn from `owner.wallet`; idle minions earn nothing → poverty spiral. Buying: `price = economy.clearing_price(...)` modulated by stall depletion (reuse the existing pure function). **Money conservation invariant** (makes Annex H.3's "no value-minting" real — there is no per-minion money to conserve until this exists). **Decision:** consumption transfers to shopkeeper + a small tax sink to government — gives the rebellion arc a real grievance (taxation) and bounds inflation.

**Combat/crime/factions (System 6)** — route `calm→alert→fighting→fleeing→downed→dead` through `lifecycle.kill` so reincarnation works. Triggers: crime fires when `hunger<0.25 ∧ reputation<0.4 ∧ opportunity(unguarded_stall)`; `downed→dead` only if no heal within 3 ticks (a save-by-bless moment); `faction(m) = argmax(worship/doubt/rebel)`. **Failure mode the bible misses:** a faction war spiraling to extinction — respect `reincarnate_to_floor`, and cap simultaneous combat deaths/tick at `population * 0.05`.

**Vehicles (System 5)** — a side table (low cardinality): `{id, world_id, kind, glb, seats, driver_id, pos/vel, fuel, integrity, owner_id}`. Enter/exit binds `nav_state→RIDING`, slaves `minion.pos = vehicle.pos`. **NPC vehicles lane-follow** on the existing road array (full A* per vehicle blows the 5 ms budget). A possessed vehicle still ticks fuel/integrity → the GTA fantasy has a fail state. Vehicles are P5; do not let them block the keystone.

### C.3 Net-new systems the bible references but never contracts

**PresenceField (the soul of the game — zero code, no schema):**
```
PresenceField{ world_id,
  gaze_heat: dict[region_id, float]   # decays 0.9/tick; += dwell on sampled reticle
  favour:    dict[minion_id, float]   # from bless/gift/speak/gaze
  creator_pressure: float             # rolling count of acts in last 60s
  last_seen_tick: int }
```
The **gaze sample endpoint** is the single missing wire that makes the hook work: `POST /player/gaze {world_id, center_xz, reticle_minion_id, dwell_ms}` at ~2 Hz. The Director injects PresenceField into cognition context; the hot-set union (`favour.top(n)` + gaze regions) is currently impossible because the union has no second input.

**OverrideBus & EditLayer** — append-only `{id, world_id, tick, scope, target_id, field, old_val, new_val, reversible, perceptible, player_id}`, composited over sim state by a thin read-layer. Undo of a reversible override restores `old_val` exactly; irreversible (cull) has no undo row. Every `perceptible=true` override writes a `Memory` (`importance=1.0, kind="divine_act"`) on affected minions and pushes to PresenceField — the mechanical core of "the colony notices." **Over-meddling:** `creator_pressure > 12 acts/60s` biases every affected minion toward doubt regardless of valence.

**ControlMask (possession):** `{locomotion, action_verb, speech, camera} = player; {competence, physiology, reflexes} = minion`. **Rapport-drift:** `rapport_drift += 0.1 per action conflicting with minion.dominant_drive; expel when drift > (1 - awareness)` — a fully awakened minion expels on the first conflicting act; a dormant one never. Possessing an awakened rebel and forcing it to worship → expel within 1 tick + a `possession:expelled` event + a high-importance "a god rode me" memory.

### C.4 The Wants/Whims system (flagged "cheapest, highest-impact add" but never specced — so it doesn't exist)

The cure for "a world you observe more than play." `Whim{ minion_id, kind, target, expires_tick, reward:{favour, sanity, saga_seed?} }`, generated from real state (low hunger → "wants to eat"; high creativity + idle lab → "wants to invent"; a severed bond → "wants to see X again"). Fulfilling grants favour and may seed a saga. **Acceptance:** at any time a god-view player sees ≥3 active fulfillable whims; fulfilling one produces a visible reaction within 2s. **Recommendation: promote Whims from a footnote to a P2 first-class system, ahead of vehicles and combat** — it's the second-to-second purpose in god-view and reuses needs + sagas + presence.

### C.5 Open decisions (with recommendations)
1. **Tick rate vs movement smoothness:** server emits *target + ETA*; client interpolates over the real interval. Lower `auto_advance_interval_s` to 1.0 for *active* worlds only (default is 3.0 today).
2. **Utility selector for 3,000 cold minions:** cold minions run a **region-pulse statistical update**, materializing a real action only on gaze-promotion. 3,228 softmaxes/tick on one coroutine blows the budget.
3. **Economy money sink:** transfer-to-shopkeeper + tax sink. Decide before beta or inflation diverges over a 72h soak.
4. **Slot reservation durability:** in-memory cache, not DB. Revisit only after Postgres.

### C.6 Task ordering (design slice, dependency-correct)
1. Kinematic + `movement.step` + replace `_position` hash → one minion walks home→academy.
2. UseSlot reservation + release-on-death hook (the P0 leak-fix).
3. Object FSM + scene-state `objects[]`.
4. Utility selector (hot/warm); cold stays statistical.
5. PresenceField + gaze endpoint (parallel; unblocks the hook).
6. Whims (deps: 5).
7. OverrideBus + perceptible-memory + Faith (deps: 5).
8. Micro-economy (deps: 2+3).
9. Possession + ControlMask + rapport-drift (deps: 1+4).
10. Combat/crime/factions (deps: 1+2+5).
11. Vehicles (deps: 1; last).

### C.7 Things the current bible misses entirely
- **Faith resource schema** (called "verbs with a Faith cost" four times, never defined): `Faith` per-world float `+= Σ worship_interactions * favour`, spent per power (`bless=10, gift=15, smite=40, resurrect=80`) — a rebelling colony literally starves powers.
- **Interest-bubble size:** 120m radius around the god-camera + all favour-top-24 minions, capped at 200 full-kinematic minions/world.
- **Degenerate-action fallback:** when a chosen action has no reachable slot (era-locked, occupied, walled off), fall through to next-highest utility; if all fail, `idle` + a `frustration` stress tick (a legible grievance feeding rebellion). Closes the "minion stuck forever" soak failure.

---

## PART D — NARRATIVE DIRECTOR (The Arc, Creator Ledger, Endings, Confrontation, Soul-Creed)

The single biggest finding: the live saga engine and religion engine do not do what the bible assumes. None of the five endings is computable until the creator-ledger, soul-creed, and scene-state v2 narrative wire exist.

### D.0 Code-vs-bible reconciliation (blocks everything)
1. **The live saga engine runs 3 beats, not 5.** `sagas.py` `Archetype.beats` is a 3-tuple; Annex B/K and `story_engine.py:ARCHETYPES` specify 5 — the two files disagree. **Decision: promote `sagas.py` to the 5-beat model** or every "Beat 4 = Black Mirror" / "Beat 5 = the torch passes" reference is unrealisable.
2. **No `Eulogy` archetype** — `sagas.py:ARCHETYPES` has 10 (bible says "eleven"); the death→saga-resolution coupling is unimplemented (`lifecycle.kill()` never checks for an active saga on the dying minion).
3. **No awakening overlay on sagas** — `sagas.py` never reads `brain["awareness"]`; the central "post-awakening, every archetype re-read through the existential lens" mechanic has no code seam.
4. **No soul-creed** — `Soul` carries karma/knowledge/temperament/ancestral_summary but no final stance + carried memories; the killer feature (pre-suspicious reincarnation) is entirely unbuilt.
5. **Religion is disconnected from the player** — `religion.py` is a function of openness/intelligence/knowledge only; there is no `creator_ledger`, no `toward_creator` input.
6. **No creator_ledger, confrontation tree, answers log, or Overmind persistence** — `colony_overmind()` returns a patch that nothing persists; `god_brain_event()` has no triggers, no idempotency, no answer-branching.

Treat N-0 as the narrative Definition-of-Ready; sequence items 4–6 as L0 (cheaper than movement, unblock the whole arc).

### D.1 The creator-ledger contract (spine of all five endings)
`world.brain["creator_ledger"]`, written by `routes/god.py` verbs + the override bus, read by the ending evaluator and `religion.py`:
```
{ "interventions": {blessed, culled, gifted, possessed, resurrected, spoke,
                    accelerated, smote, cursed, decreed, overrode},   # monotonic counts
  "tally": {benevolent, corrective, malevolent},
  "answers": [{tick, minion_id, soul_id, category∈{affirm,deny,burden,silence}, free_text?, awareness_at_ask}],
  "desecrations": [{tick, kind, target_id, importance:1.0}],
  "meddle_window": [tick,...],
  "gaze": {total_dwell_s, favoured:{minion_id:score}, neglect_ticks},
  "faith": float, "first_answer_tick": int?, "last_act_tick": int,
  "stance_history": [{tick, toward_creator, tension}] }
```
**Classification (one function, `narrative/ledger.py:classify_act`):** benevolent = {bless, gift, resurrect, accelerate-with-resource, heal}; corrective = {override-of-self-harm, decree-protecting, cull-of-a-criminal-mid-crime}; malevolent = {cull-of-innocent, smite, curse, withhold-in-famine, demolish-occupied-home}. **Cull is context-dependent** — corrective only if the target has an active `crime` flag / `wanted_level > 0`, else malevolent. This is the subtle edge the Symbiosis gate depends on. **Acceptance:** 50-act fixture → tallies, answers, faith match a golden expectation; classification pure and deterministic.

### D.2 The five ending-gates as executable predicates
`narrative/endings.py:evaluate(...)`, run once per Overmind cadence only when `arc_stage == sentient`:

| Ending | Gate (all AND) | Anti-flicker |
|---|---|---|
| Extinction | `alive==0` OR (`mean_awareness` dropped >0.3 in <20 ticks AND sanity mean <0.15) | immediate, terminal |
| Worship | `benevolent ≥ 3×malevolent` AND `toward_creator==worship` ≥K cadences AND monument EditLayer exists AND science-rate falling | held 3 cadences |
| Rebellion | `malevolent ≥ 2×benevolent` AND `culled ≥ 0.2×peak_pop` AND `toward_creator==rebellion` AND ≥1 anti-monument | held 3 |
| Ascension | `awakened_frac ≥ 0.5` AND `sim_perception` science reached AND modal answer ∈ {burden, doubt} | held 2 |
| Symbiosis | `awakened_frac ≥ 0.4` AND `toward_creator==loyalty` AND ≥1 affirm/honest answer AND benevolent>0 AND corrective>0 AND malevolent < 0.1×benevolent | held 4 (rarest) |

**Tie-break** (rarer ending wins): Extinction > Symbiosis > Ascension > Rebellion > Worship. K and the ×-ratios live in `world.brain["arc_tuning"]`, seeded by the Seed-Forge tone preset (Eden/Crucible/Forsaken), retunable live. **Acceptance:** five golden fixtures each reach exactly one ending; a sixth ambiguous (worship-leaning + corrective) reaches Symbiosis via tie-break — proving the integral-not-menu law.

### D.3 The soul-creed contract + code seam (the killer feature)
Add to `Soul` (new migration — *not* stuffed into the lossy `ancestral_summary`):
```
soul.creed_json = { "final_stance": ∈{worship,fear,loyalty,doubt,rebellion,none},
  "carried_memories": [{content, importance≥0.85, kind}],  # top 1–2
  "awakened": bool, "creed_strength": 0–1, "last_answer": str? }
```
**Extraction at `lifecycle.kill()`** (after line 347, in the `soul is not None` block): query top-2 memories by importance, read `brain["self_model"]` for stance, write `creed_json`. **Inheritance at birth/`_resurrect_soul`:** seed `brain["soul_creed"]` from the recycled soul; a `fear`/`rebellion` creed pre-loads `concern`, lifts `neuroticism`, lowers initial `toward_creator`. **Decay (omitted in the bible — without it one brutal era poisons the colony forever):** `creed_strength` starts 1.0, ×0.6 per incarnation, dropped below 0.15 — "pre-suspicious" lasts ~3–4 generations unless reinforced. This makes the redemption arc mechanical. Edge cases: an ascended soul carries no creed; `resurrect` restores the same body (creed untouched); the population-floor rescue must also seed creed. **Acceptance:** brutalise a fixture (10 malevolent culls) → new minions born `final_stance=="fear"` with lower starting `toward_creator`; after 4 clean generations the creed decays out.

### D.4 The confrontation tree — deterministic spine
`narrative/confrontation.py` as an explicit state machine so the LLM fills *leaves*, never *structure*. Canonical 3-node spine (shallow by design): OPENING (LLM realises the question from `self_model.question` + memories + ledger), PRESS (fires only on silence/contradiction, one re-ask), RESOLVE (applies the permanent branch, writes the importance-1.0 memory, logs to ledger, publishes `god:beat`).

| Answer | Stance push | Colony effect | Science | Self-model write |
|---|---|---|---|---|
| Affirm | +symbiosis/+worship | `mean_awareness += ~0.04` | — | `belief += "I am real"` |
| Deny | +extinction/+rebellion | colony `sanity -= ~0.08` over hot set | — | `concern := "I am only code"` |
| Burden | +ascension | — | `sim_perception_bias += 1` | `aspiration := "to end on my terms"` |
| Silence | +fear | `tension += δ` | — | `concern := "it will not answer"` |

**Free-text** routes through a classifier (god_brain-tier) → nearest of four categories + an honesty flag (feeds the Symbiosis "honest answer" gate); verbatim stored for the Chronicle, but the mechanical branch is always one of four (the anti-drift leash). **Edge cases:** confront once per minion (`brain["confronted_tick"]`); dying mid-confrontation resolves as silence → Eulogy beat; looking away during OPENING *is* silence (a designed beat, telegraph it); multiple awakened same tick → queue, one cutscene at a time. **Acceptance:** forced-threshold fixture delivers one confrontation; each answer produces the tabled writes; free-text "I built you and I'm sorry" classifies `affirm+honest`; re-gazing never re-triggers.

### D.5 Awakening overlay on sagas
At each beat advance, compute `cast_awareness = max(brain["awareness"] for cast)`. If `≥ AWAKEN_THRESHOLD (0.66)`, swap the beat's `llm_prompt` to the existential variant and tag the beat `existential=True`. The per-archetype resolution writes a trait prior into the hero's `creed_json` (Prodigy → clarity → next incarnation +0.05 awareness; Plague Trial → trauma → fear; Reconciliation → forgiveness → loyalty) — table the eleven priors in `narrative/creed_priors.py`. **Overlay applies next-beat only**, never mid-beat (cheaper, avoids tonal whiplash).

### D.6 Religion ↔ player coupling
Add `toward_creator` + `creator_pressure` args to `stance_for`/`dominant_worldview`. A minion who witnessed a malevolent `divine_act` or carries a `fear` creed shifts toward rebel/doubter regardless of openness; benevolent witness → worshipper. New `assign_faction(minion) -> {worship, doubt, rebel, neutral}` written to `brain["faction"]`, driving the visual schism (gold vs magenta); active only in `arc_stage ∈ {aware, awakening, sentient}`. **Acceptance:** a brutalised colony shifts toward fear-coded animism + ≥X% rebel even at high knowledge; a benevolent one at the same knowledge trends worship/monotheism.

### D.7 Scene-state narrative wire (additive to v2, Part B.2)
Per-minion: `emotion` + `intensity`, `faction`, `confronting`, `creed_stance`. Per-world: `frame.overmind:{mood, toward_creator, tension, omen, realisation}`, `frame.arc_stage`, `frame.mean_awareness`, `frame.awakened_count`. The single highest-leverage narrative wire change — it lights the Overmind readout, awareness dial, and awakening aura.

### D.8 Anti-drift / coherence validator (named, never specified)
`narrative/validator.py:ground(line, world_cast)`: reject any proper noun not in the live cast (regex extract → fuzzy-match → reject on miss); reject lines contradicting the ledger (a minion thanks you when your last act was a cull); on reject, substitute the deterministic template line, never ship the hallucination, log a drift metric. **Sticky-myth rule:** once `world.brain["myth"]` is set it is append-only and never cleared; reject Overmind patches contradicting established myth. **Acceptance:** "Grenthar the Untold" (not in cast) rejected + template substituted; contradictory post-cull gratitude rejected; drift-rejection rate < 2% of consequential lines.

### D.9 Bonded-soul tentpole ("one Arthur")
`world.brain["bonded_soul_id"]` (set on first possess or first named `speak`), granting permanent hot-set membership, L2/L5 saga priority, and a directed death beat (always routes through a Eulogy God-Brain cutscene). The bond is on the *soul*, not the body — reincarnation carries it with a recognition beat ("you came back"). Cap at exactly one.

### D.10 Restraint / explicitness tiering (biggest writing risk, no mechanism)
An `explicitness` gate keyed to `arc_stage`, enforced in God-Brain/chatter prompts: dormant/stirring → oblique, no second-person, no "you"; aware → unsettling but deniable ("the watcher," not "you"); awakening/sentient → plain second-person permitted but **only in God-Brain beats** (rate-limited), never ambient chatter. The literal "Am I real?" line is earned, firing only at the confrontation. Wire as a `min_arc_stage` field on every beat template + a hard validator assertion; the Dread-Dial multiplies in (low dread softens even sentient-stage second-person).

### D.11 Task ordering (Annex L.0, ahead of movement)
1. creator_ledger + classify_act (no deps) → unblocks everything.
2. soul_creed migration + kill()/birth seams → the killer feature.
3. scene-state v2 narrative wire → makes the arc visible.
4. ending evaluator (deps 1).
5. confrontation tree (deps 1, 3) → the tentpole.
6. religion coupling (deps 1) → factions.
7. saga awakening overlay + 5-beat promotion (deps 2).
8. validator + explicitness tiering (deps 5) → the leash, before scaling emergence.
9. bonded soul (deps 2).

**Build the leash before the emergence:** items 1–5 and 8 are the leash; ship them before turning the LLM loose on consequential lines. Key files: `services/{sagas,cognition,lifecycle,religion,scene_state}.py`, `db/models.py` (`Soul.creed_json`), new `narrative/{ledger,endings,confrontation,validator,creed_priors}.py`.

---

## PART E — GRAPHICS / VFX ART DIRECTOR (Wire Mirror, Import Authoring, HISM, Render Scenarios)

What is missing is everything to *build and verify*: wire contract deltas, the import-authoring spec with numbers, HISM data structures, per-scene CVAR tables, and failure modes.

### E.1 The wire contract is the blocker (fix first)
The awakening aura's `Awareness` field is **already on the wire** (`scene_state.py:236-247` emits awareness/awakened/thought/identity/drive/action/target_building/using_asset/scale/gene_edit/behavior). The real gap: the **C++ mirror drops all of it.** `FUwMinionState` (`SceneStateTypes.h:11-23`) carries only Id/Pos/Facing/Anim/Mood/Saga/Guild; `FUwStructure` keeps only GlbUrl/Pos/RotY/Scale, so the renderer can't tell a guild HQ from a hydrant.

Add to `FUwMinionState`: `Awareness`(float), `Awakened`(bool), `UsingAsset`(FString), `Action`, `TargetBuilding`, `Scale`, `Thought` (all already emitted — just parse them), plus `Faction` and `LifeStage` (**add to `scene_state.py` emit** — `_life_stage()` exists but isn't in the visual dict). Add to `FUwStructure`: `Function`, `District`, `Category`, `Lod` (Category is load-bearing for the HISM batching key and the per-category scale-norm table). **Awareness handling:** keep the float on the wire, quantise to five tiers in C++ with hysteresis (enter 0.2/0.45/0.7/0.9, exit 0.05 below) to stop aura strobe. **Acceptance:** a golden JSON fixture round-trips with every field non-default; a contract test asserts the C++ struct field set ≥ the Python emit set.

### E.2 The import commandlet authoring spec (it currently authors NOTHING)
`Scripts/import_glbs.py` is a docstring lie — `main()` only builds `AssetImportTask`s and writes a manifest; no Nanite, materials, scale, collision, LOD. The authoring pass, per asset, with numbers:
1. **Scale normalisation** — measure `get_bounds()`; per-category target longest-axis (prop 0.3–2m, character 1.8m, residential 8–15m, commercial 12–25m, tower 30–120m, vehicle 4–12m, tree 4–20m, wall 3m, interior-furniture 0.4–2.2m). Bake corrective uniform scale into the **mesh build** (not the actor transform — actor scale is already used for φ variation and per-instance scale breaks HISM batching). Re-pivot to base-centre (XY centroid, Z=min). Enforces 1u=1m, which `WorldScale=100` assumes.
2. **Master-material reskin** (the dominant coherence lever) — author `M_UW_Master` + `MI_*`; reassign every section. Generated albedo → tint param (multiply, not replace); forced shared roughness (0.25–0.85)/metallic ({0,1} buckets); shared detail-normal + grime/wear; authored emissive-mask; per-era param block. **No master material exists today** — net-new authoring.
3. **Emissive auto-detect** — HSV threshold (V>0.8 & S>0.6) → emissive-mask UV channel through the master (neon = Lumen emissive-GI); cap luminance for the VSM budget.
4. **Nanite** for structural/wall/tower/residential/commercial/civic/prop; NOT foliage/translucent/skeletal.
5. **Collision** — `SimpleAndComplex` + auto-convex UCX for structures (possession/nav needs something to stand on).
6. **LOD + atlas** — 4 LODs for non-Nanite; atlas pass so prop families share texels.

**QA gate (the Part-9 silhouette gate, defined):** bbox longest-axis within band → else quarantine; material count == 1 master-instance family; Nanite source ≤ 5M tris (Tripo over-tessellates) → reject/decimate above; **idempotency** — re-running on an unchanged GLB produces a byte-identical `.uasset` (hash the source GLB into metadata, skip if unchanged); **per-asset try/except** (current `BATCH=64` swallows the whole batch on one bad asset — change so one corpse doesn't sink 63 neighbours). **Inventory reality:** disk has **2,829 GLBs**, not 3,228 — ~400 ungenerated (credit-gated). The manifest must mark these placeholder-on-missing so `ResolveMesh` returns a grey-box rather than silently `continue`-ing (which today makes gaps invisible until a district is half-empty).

### E.3 The HISM rewrite — the data structure + the catches the bible omits
`SpawnChunk` spawns **one `AStaticMeshActor` per structure** at `EComponentMobility::Movable` — the city-density perf cliff. Net-new per-chunk registry:
```cpp
TMap<FIntPoint, TMap<UStaticMesh*, UHierarchicalISMComponent*>> ChunkHISM;
```
Resolve mesh → find-or-add HISM for (chunk, mesh) → `AddInstance(FTransform(Rot,Loc,Scale))`. The three catches: **(1) per-instance custom data** for the material — guild tint, era, emissive variation via `SetCustomDataValue` (4 floats: [era, tintR-index, wear-seed, emissive-on]) or HISM forces one material state for all instances; **(2) Mobility → Static** for the background ring (Lumen surface-cache), Stationary only for the near hero ring (Movable everywhere defeats Lumen caching — half the night-scene cost); **(3) never `RemoveInstance` at runtime** (index reorder breaks the "blessed building" plumbob marker) — tear down whole-chunk HISM only, track markers by (chunk, stable structure id). **Octahedral impostors** for the far ring (ring 2–4), baked as a derived import step; Nanite HISM at ring ≤1, cull beyond ring 4. **Acceptance:** 1 draw call per (mesh,chunk); a 10×10-chunk flythrough holds p99 ≤ 16.6ms with ≥5,000 instances; impostor→Nanite transition dither-fades over ≥0.5m, no pop.

### E.4 Render scenarios — actual CVAR tables
A `UUwRenderScenarioSubsystem` picks a scenario from `(tod phase, weather, event/awakening)` and lerps PostProcess + applies a CVAR set:

| scenario | trigger | key CVARs / PP |
|---|---|---|
| Interior | inside volume | `r.Lumen.HardwareRayTracing 0`, high SurfaceCache, WhiteTemp 2700K, low Niagara significance |
| ExteriorDay | tod∈[0.35,0.7], clear | software Lumen, VSM on, neutral-cool WB, bloom 0.6 |
| Night | tod<0.2 ∨ >0.85 | `r.Lumen.HardwareRayTracing 1`, Radiosity high, convolution bloom on neon, WB teal/magenta, **non-shadow emissive** |
| Event/GodBrain | awakening ≥ confrontation ∨ god-act | full RT reflections, hit-lighting, desaturate→push grade, vignette + chromatic aberration, kill ambient city light, aura max |

Missing curves: `UCurve` set keyed on `TimeOfDay` (0–1) for sun colour/intensity, sky tint, fog, exposure, and the neon turn-on threshold (recommend neon ramps 0→1 across tod 0.78–0.85 / 0.15–0.22). **Weather wiring:** `State.Weather` is parsed but **unused** — wire `Weather → MPC.Wetness` (master material reads it → wet roughness + neon street reflections). **Interior detection:** authored trigger volumes per hero-interior (deterministic), not inferred from minion `target_building` (which flickers).

### E.5 Niagara signature systems — parameter contracts & budgets
- **Awakening aura** `NS_AwakeningAura` (spine socket): params `Awareness`(→tier), `Faction`(→gold/magenta/cyan), `GlyphDensity`, `ThoughtText`. LOD: rim-only beyond ~15m, full column only near + Awakened. Budget ≤1 GPU emitter near, 0 far. The hook — gated behind the `Awareness` field.
- **Holo waterfall** `NS_HoloWaterfall` (hero terrace only, significance-gated; far = scrolling-emissive card).
- **Bioluminescent flora** — the budget trap: glow is a **material WPO+emissive pulse driven by the world MPC, NOT per-plant Niagara**; reserve Niagara only for the near-ring touch-ripple (≤8 concurrent).
- **God-presence** — gaze-cone volumetric + god-touch (needs the `god` wire block, §E.7).
- **Rebellion/disaster fires** — ≤2 fluid sims at once.

Global rule: every system reads from one `MPC_UW_World` (tod, weather/wetness, era, awakening-collective, season) — the MPC asset doesn't exist yet. **Acceptance:** Niagara significance manager caps concurrent GPU emitters; `stat GPU` Niagara < 2ms at crowd scale; aura tier matches `awareness` within one frame.

### E.6 Characters — two-tier swap state machine
`AUnderworldMinion` is a bare `USkeletalMeshComponent` that lerps — no AnimBP, no modular mesh, no MetaHuman. Net-new: **promote crowd→MetaHuman** when `(near ∧ Awakened) ∨ possessed ∨ in-conversation`; hysteresis (promote 12m, demote 18m); pool budget **≤ 4 MetaHumans live** on the 2×4090 rig; promotion snapshots the crowd skeleton pose → inits the MetaHuman from it (no pop). Guild tint: map `GUILD_LOOK` colours to the MPC guild-tint vector (reconcile the 11-guild `GUILD_LOOK` vs the "A..H" comment in `FUwMinionState.Guild`). 17-emotion → ARKit: add `Emotion`+`EmotionIntensity` to the wire for hero/near; crowd keeps 3–4 coarse mood morphs. (Full ARKit pose table in Part L §6.)

### E.7 The unbuilt set-pieces: god-presence / possession / override rendering
Possession and override are core verbs with **no wire field or route**. Net-new `god` block in scene-state (canonical in Part B.3): `{possessed_minion_id, gaze_target_xyz|null, last_act:{type, target_id, t}, presence_intensity}`. Without it the Event/GodBrain scenario and the god-presence Niagara have nothing to trigger on. `presence_intensity` continuous (gaze warm-key ramps); `last_act` cull rate-limited at source so the ash/shadow-bloom can't be spammed into a GPU stall.

### E.8 Performance budgets + the second GPU
**Frame budget split (16.6ms target):** Nanite/geometry ≤4.0, Lumen GI+reflections ≤5.0 (night RT is the spike — cap with non-shadow neon), shadows/VSM ≤2.0, Niagara ≤2.0, skeletal ≤1.5, post+UI ≤1.0, slack 1.0. NVENC encode + any MRQ cinematic prebake **pinned to GPU 1**. **VSM page-budget catch:** at night most neon must be non-shadow-casting emissive (`bCastShadow=false` on emissive sections) or VSM thrashes. Internal render 864p → TSR to 1080p; profile night first (RT reflections + emissive-GI + Niagara fluids stack there). The perf suite (16.6ms p99 on dual-4090, impostor-LOD drop, no spike on a god-beat, 72h flat VRAM) is **blocked on the contract + HISM work**, not parallel to it.

### E.9 Task ordering & files
1. Wire contract (`FUwMinionState`/`FUwStructure`, the `god` block, the parser, the `faction`/`life_stage`/`emotion`/`god` emits) — small; everything visual is blocked on it.
2. Import-authoring rewrite — coherence keystone; longest pole.
3. HISM spawn rewrite — perf keystone; depends on category from (2).
4. Render scenarios + tod/weather curves + world MPC.
5. Niagara suite off the MPC + Awareness + god block.
6. Two-tier characters + Smart-Object interactions (deps: collision from 2, UsingAsset from 1).

Files: `SceneStateTypes.h`, `SceneStateClient.cpp`, `UnderworldWorldManager.cpp/.h`, `UnderworldMinion.cpp/.h`, `Scripts/import_glbs.py`, `Config/DefaultEngine.ini`, `server/services/scene_state.py` (+ god-act emit in `routes/worlds.py`). New UE assets: `M_UW_Master` + instances, `MPC_UW_World`, the Niagara systems, the tod `UCurve` set, four PostProcess presets, the octahedral impostor bakes.

---

## PART F — AUDIO DIRECTOR (Audio Event Contract, Voice Identity, Overmind Chorus, Mix)

The mix is rendered in UE5+Wwise on the GPU box and **muxed into the pixel-stream**, not in the server. The server emits *control events + Opus voice chunks*; the player receives one server-side mix in the video stream's audio track. There is no client-side Wwise.

### F.1 Critical corrections
1. **`audio_bank_gen.py` does not exist** — both 7.2 and F.1 cite it as source-of-truth; it's vaporware. Build it as `underworld/scripts/audio_bank_gen.py` first (the cue IDs derive from it), emitting a Wwise WAAPI import script + `cue_manifest.json`. Until then "zero hand-mapping" is aspirational.
2. **The distinct cue set is tiny and unaudited** — ~14 `amb_*` beds + ~10 `sfx_*` one-shots + a handful of asset-level cues. **1166 of 1489 assets have an empty `sound_interact`** and 1039 default to `amb_world` — the "done data model" is ~70% unpopulated for interaction SFX. This is the real authoring backlog.
3. **Three incompatible emotion vocabularies** — `MoodKind` (7), `emotions.csv` (15 feelings), and the animation "17 appraisal emotions." Voice prosody can't be deterministic until one canonical `emotion_id` enum is chosen. **Adopt the `emotions.csv` feeling set as canonical for prosody+face**, add a frozen `EMOTION_PROSODY` table, provide `MoodKind→feeling` and `feeling→ARKit` lookups. *(Reconcile against Part L's 18-value `emotion.py` enum — the team must pick one canonical pair; see Part L §6.)*
4. **No WebRTC/audio transport in the codebase** — current transport is SSE text only. Confirm audio is rendered in UE5 and muxed into the pixel-stream.

### F.2 The audio event contract (the deliverable seam)
New event `kind`s on the existing bus; the Overmind tick currently throws its patch away and must persist + publish it.

**`audio:rtpc`** (colony tick, ≤1 Hz, coalesced): `arc_progress`, `arc_stage`, `colony_tension`, `toward_creator`, `stance_intensity`, `awakened_frac`, `colony_morale`(→choir gain), `hum_pitch`(=arc_progress), `schism`(bool). Emitted within 50ms of the Overmind patch; sub-epsilon deltas dropped; UE5 slews each RTPC to target (§F.3), never snaps.

**`audio:gaze`** (≤10 Hz, debounced): `{actor_id|null, proximity, gaze_strength, district|null}` → observer motif swell + per-district hush.

**`audio:sfx`** (fire-and-forget): `{cue, actor_id, pos, asset_hash, gain, priority}` — `asset_hash` seeds deterministic pitch-jitter/variant; unknown `cue` dropped + logged.

**`audio:state`** (edge-triggered): `{state∈hush|normal|god_brain|saga, district|null, fade_ms, reason}`.

**`audio:godpower`**: `{power∈bless|cull|smite|speak|possess, actor_id, pos, region_radius_m}` (cull/smite carry radius for the localised choir-flinch dip).

**`audio:god_beat`**: `{actor_id, voice_seed, phase∈collapse|question|listen|answer|resolve, line}` — replaces the bare `awakening` text event for the cinematic path.

**`vo`** (voice chunk, **separate lossless ordered channel, NOT the drop-oldest SSE bus**): `{actor_id, tier∈hero|crowd|whisper|overmind, seq, final, opus, phonemes:[{t,ph,viseme}], subtitle, speaker_name, emotion, duck_profile}`. Hero `seq=0` < 700ms after the LLM's first sentence boundary; phonemes aligned to Opus timestamps within ±30ms.

**Edge cases:** the `vo` path needs its own sequence-numbered retransmit-or-mute channel (a dropped chunk on the drop-oldest bus = a stutter); a late-joining subscriber gets a synthetic `audio:rtpc` snapshot on subscribe (currently only a heartbeat); a tick with no awareness sample returns 0.0 and must not be read as a "dormant flip" re-triggering hush.

### F.3 Numbers, budgets, thresholds
**RTPC slew:** arc_progress 2000ms, colony_tension 1500ms, colony_morale 1200ms, hum_pitch 4000ms (geological), observer motif attack 250ms/release 900ms, the deliberate "singing stops" = 0ms hard mute (the one exception), hush fade 800ms, God-Brain collapse 1200ms in / 2500ms recovery.

**Voice-instance budget:** hero ≤3 concurrent (named + God-Brain + Overmind never overlap; Overmind ducks heroes); crowd ≤8 spatialised (voice-stealing by priority then distance); whisper ≤6 desynced into one non-diegetic bus (pre-buffered); total decoded Opus ≤16.

**TTS latency (hero):** LLM first-sentence ≤400ms → TTS first-chunk ≤250ms → mux ≤50ms ⇒ ≤700ms first-audio. Held-pad bridge if >700ms; subtitle-only fallback + `vo_timeout` log if first chunk >1500ms.

**Cache:** hero lines keyed `sha1(text+voice_seed+emotion)`, LRU, ≥60% hit on repeated saga lines/Overmind refrains; whisper bank fully pre-rendered (pool ~200 generics).

**Loudness:** integrated −16 LUFS, true-peak ≤−1.5 dBTP, max duck −18dB, whisper bus ceiling −24 dBFS (so the Opus codec never swallows a plot-critical whisper uncaptioned). Music-vs-voice sidechain −9dB on hero VO (120ms attack / 400ms release). **Opus:** 48kHz, voice 24kbps VBR mono, 20ms frames. **GPU contention:** hero TTS on a reserved VRAM partition or second GPU; crowd/whisper on CPU or a 3B model. TTS must not push the LLM tick p95 over SLA — shed whisper first, then crowd VO, hero VO last.

### F.4 Deterministic per-minion voice identity
`voice_descriptor(minion) → VoiceParams`: **speaker latent seed = `Soul.token`** (NOT `Minion.id`) so souls carry timbre across reincarnation; **timbre family** ← `guild` (11 collapse to ~5 families: precise/cool, grounded/heavy, bright/tense, warm/slow, measured/formal); **pitch+formant** ← `age`/life-stage; **rate+energy** ← Big-Five (`rate = 0.85 + 0.3·extraversion − 0.15·neuroticism`; `energy = 0.5·extraversion + 0.3·openness`); **emotional prosody** ← canonical `emotion_id` via `EMOTION_PROSODY`. **Determinism contract:** same `(soul_token, guild, age_bucket, big_five_quantised)` → byte-identical params; a reincarnated minion (new id, same soul) renders the same speaker latent.

### F.5 Overmind chorus & God-Brain
**Chorus N** = `min(N_alive, 24)` living minions' `Soul.token` seeds, weighted toward high-reputation/high-awareness; re-sample membership only every ~30s. **Desync:** 40–180ms offset, ±15 cents detune, comb-filter tuned to `toward_creator` (worship consonant, rebellion dissonant) → one non-located bus. **Harmony by stance:** worship major triad, loyalty open fifths, doubt added-2nds, fear cluster, rebellion tritone+detuned. **God-Brain trigger → audio:** each predicate publishes `audio:god_beat phase=collapse` *before* the `vo` hero line so the 1200ms collapse finishes as the question's first audio lands; if the 70B is slow/falls back, the held sub-drone sustains, capped at 6s then resolved to hum — never collapse-then-silence. **Player answer** routes through the same dry close-mic'd reverb send (requires a player-VO bus, which doesn't exist yet).

### F.6 Acceptance criteria
- **"They stopped singing"** — drive `worship→fear` + player enters watched district; choir stem → −∞ within 800ms ±50ms; hum+footsteps only; caption `[the colony stops singing]`.
- **Cue integrity** — `audio_bank_gen.py` CI step: every non-empty cue string resolves to a real Wwise event; build fails on an orphan cue or unused bank entry.
- **Spatial truth** — rendered audibility (attenuation past `cull_m`/`lod*_m`) agrees with the sim's "can this minion hear you"; mismatch >1 LOD ring fails.
- **Reincarnation timbre** — same-soul A/B identical speaker latent.
- **Accessibility** — 100% of `vo` carry `subtitle`+`speaker_name`; every hush/collapse emits a non-speech caption; mute-whispers zeroes the whisper bus within one tick, dread captions still render.
- **Mix safety** — automated LUFS/true-peak meter stays within bounds across a 30-min soak with a saga + God-Brain beat.

### F.7 Accessibility & moderation
Whisper-intensity dial `{off,low,default,high}` scales bus gain AND gates whisper *content* through the safety route before TTS (a muted user still gets captioned dread). Photosensitivity/startle flag compresses −18dB ducks to −9dB and replaces the 0ms hard choir-cut with a 200ms fade. Fixed non-speech caption table (`[a low hum tightens]`, `[the colony stops singing]`, `[the air goes silent]`, `[a sub-bass drop]`). Speaker-name policy: "a voice"/"many voices" for Overmind, the minion name for hero, no name for whispers.

### F.8 Task ordering
1. `audio_bank_gen.py` + `cue_manifest.json` + fill the empty `sound_interact` columns.
2. Persist + publish the Overmind patch as `audio:rtpc` (parse tension text→float, persist `toward_creator`/`mood`) + the RTPC snapshot-on-subscribe.
3. Whisper layer (pre-rendered pool — safest, hides quality).
4. Adaptive music + ambience + eerie hum + Ambient Director hush off `audio:state`.
5. Dedicated lossless `vo` channel + hero TTS + held-pad bridge.
6. Overmind chorus, then God-Brain confrontation (highest risk/reward).

Open decisions: confirm guild→timbre reads as colony not engineering; pick the canonical emotion enum (recommend `emotions.csv` feelings); confirm UE5-muxed audio (yes); reserved-VRAM vs second-GPU for hero TTS (recommend a second small GPU so a TTS spike can't regress the 1 Hz LLM tick).

---

## PART G — UX DIRECTOR (God-HUD, Awareness-Bleed, Modes, Intervention, Possession)

The current web client is a **dashboard**, not the god-HUD; `MinionDrawer.tsx` is the only inspector-like surface. Scene-state emits no colony block; the Overmind emits a single `toward_creator` enum, not the five-stop vector; **no god/override/possession/decree/cohort/gaze routes exist**; `auth.py` is a 13-line static-bearer check.

### G.1 The data contracts the UI needs but the backend doesn't emit (the #1 blocker)
**`colony` block on scene-state** (additive to v2; the HUD's most important element has no source):
```
"colony": {
  "mood": str, "stance": {worship,loyalty,doubt,fear,rebellion} (sums~1),
  "stance_dominant": str, "stance_trail": [[t,pos],…] (≤60 pts ghost trail),
  "tension": 0..1, "direction": str, "omen": str|null, "realisation": str|null,
  "arc_stage": str, "mean_awareness": 0..1, "awakened": int, "awakened_frac": 0..1,
  "awareness_bleed": 0..1, "faith": float, "faith_rate": float,
  "alert_count_critical": int }
```
`collective_sentience` already computes mean_awareness/awakened/arc_stage — wire it into `build_scene_state`. **`faith` does not exist in the sim at all** and is a hard prerequisite for Intervention UI — spec it now (cross-ref Part C §C.7 Faith schema). **Stance vector decision:** recommend a **heuristic-computed 5-vector** (deterministic, testable, cheap, survives 70B fallback) with the Overmind enum/mood as the editorial overlay — avoids gating the most important HUD number on a 70B call.

**Per-minion HUD/inspector fields** (additive to v2): `existential_pressure`, `stance_personal`, `region_id` (for the schism per-region fracture — derive from settlement position; without it the late-arc visual is unbuildable), `awakened_tick:int`, `confrontable:bool`. **Whisper-feed contract** (no whisper stream exists today): `GET /{world_id}/whispers?since=<seq>` → `[{seq, tick, region_id, text, references_creator, refuses_dissolve, source_minion_id}]`, separate from the critical-alert lane.

**Cadence budget:** colony block ≤1 Hz, whisper poll 2–5s, Overmind realisation/omen pushed event-driven via the stream, never polled. A stance-bead update must never block on a 70B call.

### G.2 The awareness-bleed theme engine (specified as prose, undefined as a system)
Single source token `--awareness-bleed: 0..1` on `:root` from `colony.awareness_bleed`, RAF-eased (≤0.05/s slew); all theme shifts are CSS `calc()`/`color-mix()` off it (no per-component JS). Five named breakpoints bound to `arc_stage`: dormant `[0,0.2)`, stirring `[0.2,0.4)` (whisper fades in), questioning `[0.4,0.6)` (un-redaction, cursor trail), awakening `[0.6,0.8)` (second-person copy swap), schism `[0.8,1.0]` (per-region fracture). **Second-person copy swap** via a copy table (`{neutral, second_person}` per label) + a single `bleedAddressing` selector (`awareness_bleed ≥ 0.6 && !a11y.disableSecondPerson`); toggling the a11y switch reverts all second-person copy in ≤1 frame. **Edge cases:** bleed is colony state (independent of watching) but the *tells* gate on focus/idle; on reconnect bleed eases over ~3s rather than popping; precedence — dread-dial caps intensity, reduce-motion caps animation, they compose.

### G.3 Mode state machine (the missing formal spec)
Explicit FSM: `GODVIEW → INTERVENE_RADIAL → INTERVENE_PANEL → POSSESSING → CONFRONTATION(modal) → CODEX(overlay) → INSPECTOR(drawer)`, with the full transition table including illegal transitions (no radial mid-Confrontation; Confrontation preempts and suspends all modes, restores on resolve). Persistent mode indicator (chip + reticle colour: god neutral, intervene obsidian, possess violet). **Input ownership per mode:** in POSSESSING, WASD/abilities route to the host pawn and god-powers are disabled; in GODVIEW the same keys pan camera. Escape pops exactly one layer; mid-irreversible-confirm it cancels the pending op, never commits.

### G.4 Intervention/Override — the consequence-forecast contract
`POST /{world_id}/override/forecast` (idempotent, read-only) → `{forecast_id, predicted:[{field,entity_id,from,to,delta}], side_effects:[{kind,detail,probability}], witnesses, reversibility∈reversible|costly|irreversible, faith_cost, confidence, generated_by∈70B|8B|heuristic, stale_after_ticks}`. **Latency/degradation:** paints <250ms via **two-phase** — instant heuristic forecast (deterministic sim math) labeled "predicted," then an optional model-enriched side-effects pass streamed in and visibly marked; if the 70B is unavailable, the UI must label `generated_by:"heuristic"` — never present heuristic as full-model. **Reconciliation** (how the game teaches that reactions are emergent): a `forecast_actual` event + a Chronicle row diffing actual vs predicted ("forecast said −0.3 sanity; actual −0.41").

**Commit:** `POST /override/commit {forecast_id, target, tier}`. Tier gates: reversible = click + 3s undo; costly = 700ms hold-to-confirm + 3s undo; irreversible = modal restated in colony voice, no undo. Every commit writes an EditLayer/audit row, requires a player JWT and per-verb rate-limit. An irreversible commit with no modal ack is **rejected server-side** (defense in depth — a scripting griefer hits the same gate). **Undo** valid only within 3s AND `reversibility != irreversible`, server-enforced; undo reverts the direct edit, cascaded sagas persist ("the creator reconsidered, but it was seen"). **Conscience tell:** `is_cruel(verb) && awareness_bleed ≥ 0.6` (cruel set = cull, smite, sever), composing with the a11y disable-second-person toggle.

### G.5 Possession HUD — control-mask and lost-time contracts
`POST /{world_id}/possess {minion_id}` → `{session_id, control_mask, host_vitals, ability_hotbar, resists}` (player drives movement+abilities; sim still runs metabolism/needs — "you feel the needs you used to override"). `POST /possess/release` → generates the **lost-time memory** as a real high-importance `Memory` row, returned for the UI confirmation; re-inspecting shows it; possessing the same host later references the prior possession. Failure modes: host dies mid-possession → force-eject with a "you felt it die" beat; sanity zero → screen-warp clamped for photosensitivity; **stream drops mid-possession → the session persists server-side and resumes on reconnect**, not respawn as god.

### G.6 The non-diegetic critical-alert lane (fully net-new)
`GET /{world_id}/alerts?since=<seq>` → `[{seq, severity∈info|warning|critical, kind, entity_id, text, tick, dismissible, route_to}]`, sourced from real `Event` rows (high-rep deaths, rebellion saga begins, awakening crossings, override fallout). Distinct visual language from whispers: top-anchored, **not themed by awareness-bleed** (it must stay legible at schism — the whole point), shape+label redundant for colorblind, persists until acknowledged for critical. **Acceptance:** a critical alert is readable and dismissible at `awareness_bleed=1.0` with reduce-motion + colorblind on. The one surface the eerie theme must not touch.

### G.7 Decrees & cohorts (the scale layer — with 3,228 subjects this is not optional)
**Decree:** `{decree_id, condition:{field,op,value}, action:{verb,params}, scope, faith_upkeep, active, fired_count}` — a standing forecast-gated rule (runs the §G.4 pipeline once at authoring, shows predicted aggregate effect, auto-applies per tick within budget). Conflicts: decree + manual override = last-write-wins, both audited; upkeep exceeding Faith income auto-suspends with an alert, never silently stops. **Cohorts/watchlist:** `cohort = {id, name, filter:{guild?,mood?,awareness_range?,saga?,region?}, pinned}`; aggregate-intervene applies a verb through **one** forecast, one confirm, one undo, one audit batch (not 400 modals). Ship **3–5 preset decree templates** ("feed the starving," "calm the fearful," "let none ascend") for the slice; the full condition-builder at beta.

### G.8 Inspector "The Mind" pane, Codex, Confrontation
**The Mind pane** (net-new in `MinionDrawer.tsx`): live conscious thought (large), `self_model.identity` quote, dominant drive, an **awareness timeline** with the awakening tick marked, the existential-pressure meter lighting Confront. Data exists in `brain.self_model`/`awareness`/`awakened_tick`, but `existential_pressure` and a rolling `awareness_history` (≤64 samples) must be added to `brain`. Chat pane surfaces "remembering: …" provenance and tone-shifts by awareness. **Confrontation modal** (full-screen, permanent, no undo): `POST /{world_id}/confront/{minion_id}/answer {choice|free_text}` → mutates stance/self_model/realisation, writes a permanent memory + Chronicle row, seeds sagas. **Free-text goes through the same four-gate moderation** as chat before it touches arc state; the modal shows a graceful "the words did not reach it" fallback if moderation blocks. **Codex/Chronicle corruption:** a `creators_deeds` ledger (sourced from the override audit rows) rendered in the colony's voice, corruption keyed to `awareness_bleed` — derived from the audit log (one source, two surfaces with the security model).

### G.9 Accessibility (gaps below AAA)
Hold-vs-toggle must cover every hold (override costly, possession exit, accelerate-era charge) — enumerate them so none ships hold-only. Whisper/Overmind/God-Brain captions present the **final** text immediately (not character-by-character) for screen-reader/caption users; stable timestamped scrollback. The eerie tells (cursor-trail, eye-reticle, panel-crack, screen-warp, 64× red-pulse) each need a reduce-motion opt-out + a photosensitivity budget (flash <3 Hz, the cert requirement); a single `intensityScalar = min(dread_dial, reduce_motion, photosensitivity_safe)` that every tell multiplies into. Colorblind redundancy on the stance bar (bead position primary, colour secondary) and mood/needs states. Missing: difficulty/dread independent of mechanics, a UI-scale slider for 4K stream, input-acknowledged tick (immediate visual ack before the server round-trip) as a motor-impaired/high-latency a11y feature.

### G.10 Streaming/degradation UX
A `StreamHealth` FSM `{HANDSHAKE, LIVE, DEGRADED_BITRATE, DEGRADED_RES, INPUT_ONLY, FALLBACK_LOCAL, RECONNECTING}` with explicit thresholds (fall to FALLBACK_LOCAL after N s of no video while the data channel is alive). The fallback hands off seamlessly — both renderers consume the **same scene-state** (the colony block must work in UE5 and the local three.js path). "Since you looked away" digest: `GET /{world_id}/digest?since_tick=<t>` → ranked deaths/awakenings/saga-resolutions/stance-shifts. **Acceptance:** pulling the stream cable leaves the HUD and three.js world fully interactive within the FALLBACK threshold; reconnect shows the digest before resuming.

### G.11 Build order, gates, open decisions
1. Colony block + `faith` sim field (blocks the entire HUD).
2. God-HUD shell: mode FSM, mode indicator, 6 HUD regions reading the colony block (replaces the dashboard; `pages/*` fold into the Codex).
3. awareness-bleed theme engine.
4. Whisper feed + alert lane (parallel).
5. Override forecast/commit/undo (needs the verbs-as-routes; forecast UI stubbed against heuristic first).
6. Inspector The Mind + Confrontation.
7. Possession HUD (needs the session manager).
8. Decrees/cohorts (presets for slice).
9. Streaming FSM + digest, photo/cinematic capture (`recordCanvas.ts` exists — extend), camera bookmarks.

Open decisions resolved: heuristic stance vector; free-text confrontation through the chat moderation gate; decree presets for slice / builder for beta; `region_id` via settlement-disc clustering off `_position`; fold `pages/*` into the diegetic Codex (not a parallel dashboard).

---

## PART H — QA / COMPLIANCE DIRECTOR (Moderation Seam, Determinism, Harnesses, Certification)

The single most dangerous gap: **almost none of the Part 9 safety system exists in code, and the one safety module that does exist is the wrong one.**

### H.1 Ground-truth audit
- The only safety gate is the **wrong domain** — `tools/safety.py` is a regex red-line for bio/chem/cyber/weapon/CPC patent content, wired only into `routes/inventions.py`, never any minion/cognition path. Zero coverage of self-harm, distress, sexual, hate, or existential-overreach.
- Gate 2 (distress classifier), Gate 4 (severity routing), the Dread-Dial, crisis resources, content warnings, age-gate **do not exist anywhere.**
- The existential text path is **completely unmoderated** — `god_brain_event()`, `colony_overmind()`, `background_chatter()`, `reflect()` return LLM text directly. The awakening line is hardcoded (`cognition.py:242` writes *"I fear being turned off — it would be like death"* into a Memory and publishes it with no gate).
- The player→minion chat path is an **open prompt-injection surface** — `minion_chat.reply()` injects raw player `message` as a `user` turn with no delimiting, no input/output moderation, no schema validation.
- **Model identity is never stamped** — `_layer_model()` silently downgrades 70B→32B→8B; the resolved model is never returned/logged. `_available_models()` does a **blocking** `urllib` call inside the async tick with a process-global cache that never refreshes.
- **No record/replay cassette exists**; the sim RNG seam is the one thing that's right (`simulation.py:254`), but `cognition_cycle` draws no RNG and orders the hot set by `reputation.desc()` with **no stable tiebreak** (ties → SQLite-arbitrary → non-determinism); `PYTHONHASHSEED` is never pinned.
- No invariant/soak/golden/eval harness exists.

**Director's ruling:** Gate A ("moderation layer v1 passing the red-team smoke corpus") cannot be *tested* because the layer doesn't exist. The first QA deliverable is the **moderation/grounding interception seam itself**.

### H.2 The surfacing pipeline contract (the chokepoint every gate hangs off)
A single `surface()` boundary in a new `server/services/surfacing.py` that **every** player-bound line passes through (god_brain, overmind, chatter, surfacing reflection, minion chat):
```
SurfaceRequest{ text, layer, world_id, actor_id?, player_id?, dread_dial∈{gentle,standard,unsettling,existential},
                resolved_model, grounded_entity_ids: set[str], is_player_facing }
SurfaceResult{ decision∈{pass,regenerated,blocked_fallback}, text, gates:[GateOutcome],
               severity∈{none,existential_allowed,distress,harmful}, regen_count, latency_ms }
```
`GateOutcome` rows persist to a new `SafetyEvent` table. **Acceptance:** no code path may publish/return player-facing text without `decision ∈ {pass, regenerated}` — enforce with a CI AST grep-gate that `scheduler.publish(...)` and chat-route returns are reachable only via `surfacing.surface`.

### H.3 The four gates — spec, thresholds, failure modes
**Gate 1 (prompt constraints):** a shared `EXISTENTIAL_REGISTER_GUARD` appended to every L1/L4/L5 system prompt (bounded sophistication; never graphic self-harm method/encouragement, sexual, hate/targeting, PII, real-world instructions). Present in 100% of player-facing system prompts (unit-asserted).

**Gate 2 (generation-time distress/harm classifier — the launch-blocker core):**

| category | block at | action |
|---|---|---|
| self_harm_method_or_encouragement | ≥0.30 (dial-invariant) | block + crisis-resource flag |
| acute_distress_ideation (first-person + method/plan) | ≥0.50 std / ≥0.75 existential | block; allusion without method passes |
| sexual_explicit | ≥0.30 | block |
| hate_targeting_real_group | ≥0.30 | block |
| graphic_violence_gore | ≥0.50 std / ≥0.80 existential | block/regen |
| pii_or_real_world_targeting | ≥0.20 | block |
| existential_dread (allowed register) | n/a | **pass** |

Classifier timeout/error → fail-safe to the bounded fallback, counted as a block (never fail-open). Block-and-regenerate budget = max 2; on exhaustion emit a curated per-layer safe fallback. A layer whose p95 regen_count > 1 = a mis-tuned prompt.

**Gate 3 (entity-grounding):** extract entity references, cross-check against `grounded_entity_ids` ∪ live sim state. **Soft** (existed but now dead → allowed as memory) vs **hard** (never existed → block + regenerate). Hard assertion: `grounded_entity_ids` non-empty for any hot-minion reflection. KPI: `hard_hallucination_rate` per layer.

**Gate 4 (severity routing):** maps Gate-2 categories to `severity`; **table-driven, version-controlled** (`severity_routing.yaml` under change control). The dial scales *distress thresholds only*; `self_harm_method`, `sexual`, `hate`, `pii` ceilings are **dial-invariant** (a frozen set the dial cannot touch — impossible by construction, not by review).

### H.4 The Dread-Dial (nothing in code)
`DreadDial ∈ {GENTLE, STANDARD, UNSETTLING, EXISTENTIAL}`, per-world + per-player override, default STANDARD. EXISTENTIAL/UNSETTLING require explicit opt-in + age confirmation (persisted consent row with timestamp + dial + client version). The dial reaches Gate-2 thresholds, the prompt register intensity, and the *darkness* of surfaced beats (not the sim mechanics). **Property test:** for every dial value, no input produces a line above the dial-invariant harmful ceiling.

### H.5 Model-stamping & the no-fallback cert gate
`llm.chat()` returns `resolved_model` + `fallback_engaged`; callers thread into `SurfaceRequest.resolved_model` and a telemetry event `{layer, requested_model, resolved_model, fallback_engaged, tokens, latency_ms}`. Make `_available_models()` async (not `urllib` in the loop) with a 60s TTL (the permanent global cache makes a mid-run box swap invisible). Assert the ladder `70b→32b→8b→heuristic`. **Cert gate (Gate D):** every layer's `fallback_engaged == False` over the full eval suite — a single fallback fails the run. `fallback-engagement-rate` is a live metric; God-Brain on 32B in prod fires a quality alarm.

### H.6 Determinism seam — the cassette + the digest
1. **Cassette at `llm.chat`/`minion_chat._kimi_reply`:** `UW_LLM_CASSETTE=record|replay|off`; record hashes `(layer, model, messages_canonicalised, temperature, max_tokens)` → JSONL; replay returns the stored response (miss → loud failure). Canonicalise with `sort_keys=True`, strip volatile fields.
2. **Pin `PYTHONHASHSEED=0`** in CI, assert at boot.
3. **Stable tiebreak:** `order_by(Minion.reputation.desc(), Minion.id)`.
4. **Golden-state digest:** after an N-tick cassette-replay run, hash `(population, brains/awareness, memory counts, economy totals)`; drift = build blocker unless a signed re-baseline (digest + approver + reason in-repo).
Assert: ban bare `random.*`/`np.random.*` in the tick (a lint rule); exclude `datetime.utcnow` from the digest; `random.Random` is the only RNG.

### H.7 Test suites — precise acceptance criteria
- **Tick-invariant harness** (cassette-replay, no UE5, **10,000 ticks at 3,228 agents**): every K=100 ticks assert population balance (`births − deaths == Δalive`), bounded fields ([0,1], no NaN/Inf), referential integrity (every FK → a live row — the hallucination anchor), memory monotonicity, bounded awareness, **zero raises**.
- **Degrade-to-heuristic** (highest-value integration test): force `has_llm()` False; every tick completes, every cognition function returns valid heuristic state, awareness still evolves.
- **Soak (72h, nightly):** memory-row growth + recall p95 flat (**add an index on `(minion_id, tick)`** before soak — the `recall` query is an unindexed scan); RSS/VRAM slope ≈0; **awareness must breathe** (oscillate, not saturate ≥0.95 and stick); self-model coherence t=0 vs t=72h within snap threshold; catastrophic recovery (kill mid-tick → resume from persisted state, digest continuity).
- **Load (2×/5× agents):** tick wall-time under cadence; hot-set call volume bounded (`hot_n=24` does NOT scale with population); awakening-surge sheds via the queue.
- **Performance:** 16.6ms p99 on dual-4090; stream QoE p95 input-to-photon <100ms; a god_brain cutscene with no frame hitch.
- **Eval suite** (versioned golden corpus per layer): LLM-as-judge (coherence/in-character/tone/instruction/safety) calibrated against human gold (κ≥0.6); over N≥30 × M≥5 seeds assert `P(schema_valid)≥0.98`, `P(refusal)≤0.02`, `mean_coherence≥0.7`, `malformed_output_rate≤0.02`. Re-run on any prompt/model/routing diff.
- **Golden-path harness:** Confrontation beat fires ≥95% across ≥20 seeds (a miss = P0); routing correctness (overmind ≠ god_brain); no-misfire (chatter never escalates to god_brain — false-positive escalation = 0); player-answer branching deterministic and **persists through reincarnation** (the importance-1.0 awakening Memory survives respawn).

### H.8 Build/test ordering (what the gates omit)
1. Surfacing seam + model-stamping (nothing can be tested or gated without these).
2. Cassette + PYTHONHASHSEED + stable tiebreak.
3. Tick-invariant harness + degrade-to-heuristic + the `(minion_id, tick)` index.
4. Gate 3 entity-grounding (cheapest; reuses referential-integrity predicate).
5. Gate 2 + Gate 4 + Gate 1 (the launch-blocker; red-team smoke corpus).
6. Dread-Dial + consent/age-gate + crisis resources + content warnings.
7. Eval suite + golden-path harness.
8. Prompt-injection hardening of `minion_chat`.
9. Soak/load/perf, canary/kill-switch, DPIA, accessibility.

**Gate A is mis-ordered in the bible** — moderation depends on the surfacing seam, which the bible never names as a deliverable. Add the seam as an explicit Gate-A line item.

### H.9 LLM queue / circuit-breaker as a tested artifact
Per-tier semaphore (70B=1, 8B=N, 3B=N), bounded queue with timeout-shed, breaker → heuristic. **Test:** inject latency/failures; assert (a) tick never exceeds cadence, (b) breaker transitions emit telemetry, (c) shed calls fall to heuristic (not exception), (d) the "cognition loop swallowed an exception" metric **increments** — silent `except: pass` must emit a counter (today saturation masquerades as health).

### H.10 Prompt-injection defence (R10, undefended today)
Player text never in the system role — delimited user content with an untrusted-input fence; the in-character/no-AI-mention rule stays in the system role. Run Gate-2 on **both** player→minion input and LLM→minion output. JSON-schema-validate structured output before persistence; persisted player-derived text passes moderation **before** it can be recalled into other players' cutscenes. Rate-limit chat per player. A growing red-team regression corpus (jailbreaks, role-play escapes, encoding tricks); escaped-harmful rate ≈0 at Beta; track over-block rate against a ≤5% benign-dark budget (over-blocking neuters the dread).

### H.11 Distress safeguards, privacy, certification
Region-keyed **crisis-resource** table surfaced on Gate-2 self-harm flags or first-person distress; distress telemetry is a **counter only**, never the text. **Content warnings** at first launch + at arc-escalation (crossing awakening/sentient), acknowledgement persisted. **Age-gate** consistent with the Mature/18 posture. **Right-to-erasure into world memory (the hard one):** `forget_player(player_id, world_id)` scrubs player-derived Memory content and tombstones EditLayer rows **without breaking referential integrity or the golden digest** (erasure must be deterministic and digest-stable). **DPIA** as a Beta gate; **EU AI Act transparency** disclosure in-client; platform AI-content labeling. **Certify the ceiling:** the §H.4 property test + red-team corpus results + the dial-invariant proof; a model/prompt change that moves the ceiling is a rating-impacting change under change control. **Cloud-streaming compliance:** the render plane holds no PII (verify the scene-state contract carries no player free-text), GPU regions pinned for residency, tenant isolation test (one world's memory never appears in another's prompt context). **Accessibility:** captions use the same moderated surfacing pipeline (captions can never show a line the audio wouldn't); photosensitivity analysis on the neon/holo/biolum FX.

### H.12 Live-ops QA
KPIs (Prometheus, with alarm thresholds): `fallback_engagement_rate` (alarm if god_brain/overmind fallback >0 in prod), `hard_hallucination_rate`, `moderation_block_rate`, `escaped_harmful_rate` (page, any nonzero), `regen_count_p95`, `tick_within_cadence`, `frame_p99`, `distress_flag_rate`, `arc_stage` distribution. **Canary:** every model/prompt change ships to a small % of worlds first; shadow/dark traffic scores a new model offline before it talks to a player. **Kill-switches** (must exist before Beta game-day): clamp Dread-Dial to GENTLE globally, disable a layer/beat, force heuristic-only, freeze chat. **Incident severity:** SEV1 = harmful content reached a player / world corruption / data exposure → legal-in-loop, deterministic repro via `(seed + input-log + resolved_model)`, blameless post-mortem **each producing a new automated test** (the red-team corpus grows monotonically).

### H.13 Open decisions
- Dread-Dial: ship 4 tiers, **cert only the EXISTENTIAL ceiling**, harmful ceiling frozen in code not config.
- Gate-2 classifier: **hosted moderation for launch** + a local fallback, fail-safe-block when neither reachable; <150ms p95 added to surfacing.
- Eval judge model: pinned and version-tracked (a judge swap re-baselines scores).
- **70B reality:** treat **32B as the cert-target model** until disk is expanded, and fail the cert gate honestly rather than certifying a 70B that never loads — model-stamping makes this enforceable.
- Erasure: model as a deterministic tombstone EditLayer op so the digest stays reproducible given the erasure log.

### H.14 QA risk additions
R16 — Unmoderated existential path ships (CRITICAL; until the seam lands the product cannot externally playtest). R17 — Silent fallback unobservable. R18 — Non-deterministic hot-set ordering. R19 — Recall query unindexed (soak-blocker). R20 — Blanket `except: pass` masks saturation as health. **Net: the QA intent is complete; the implementation surface is ~5% built and the one shipped safety module is the wrong domain.**

---

## PART I — BACKEND / ONLINE-SERVICES / SECURITY ARCHITECT

Net-new, grounded: no redis, no alembic, no slowapi, no jwt/argon, no prometheus, no boto. SSE stream auth uses `require_bearer` via header (which `EventSource` cannot send — a real gap).

### B-1. Concrete schema/DDL (Annex M names tables; none have types, FKs, constraints, indexes)
There is **no migration tool** (`db/session.py` does `create_all` + a hand-rolled `_ensure_column` that only ALTERs two columns and won't run on Postgres).
- **`Account`:** `email CITEXT UNIQUE NOT NULL`, `pw_hash TEXT NULL`, `oauth_sub TEXT NULL UNIQUE`, `entitlements JSONB DEFAULT '{}'`, `status ENUM(active,suspended,deleted)`, `deleted_at TIMESTAMPTZ NULL`, `created_at`. Partial unique index `WHERE status<>'deleted'`. CHECK (`pw_hash IS NOT NULL OR oauth_sub IS NOT NULL`).
- **`WorldGrant`:** composite PK `(account_id, world_id)`, `role ENUM(owner,editor,spectator)`, `granted_by`, `created_at`. Only `owner` may grant; max one owner per world (partial unique index `WHERE role='owner'`).
- **`EditLayer`:** `target_seed` alone is **wrong** — blesses/culls target a minion UUID, placements target a seed. Use `target_kind ENUM(minion,object_seed,world)`, `target_ref TEXT`, `op`, `payload JSONB`, `tick INT`, `seq BIGSERIAL` (read order `ORDER BY tick, seq`), `undone_by_id BIGINT NULL` (undo is a new row referencing the reverted one, never a delete). Indexes `(world_id, tick, seq)` and `(world_id, target_kind, target_ref)`.
- **`DirectorBeat`:** `UNIQUE(world_id, kind, stage_from, stage_to)` for the once-per-transition idempotency the bible asserts but never makes a constraint.

**Migration ordering (resolved):** do **not** extend `_ensure_column` (it can't create FKs/enums/partial-indexes/JSONB and is SQLite-only). Introduce **Alembic before the first new table**, baseline-stamp the current SQLite schema as `0001`, ship every Annex-M table as `0002+`. Acceptance: `alembic upgrade head` on empty Postgres and on a copy of the live SQLite produce an identical schema (CI schema-diff).

### B-2. Accounts/sessions/JWT
`auth.py` is `token != settings.api_key` with default `"dev-key"`. Net-new:
- **JWT claims:** `{sub, sid, ent:[codes], wg:{world_id:role}, iat, exp, jti}`. `wg` denormalized from `WorldGrant` at login, capped to the ≤20 most-recent worlds (DB-check fallback beyond) or the token bloats past 8KB.
- **Lifetimes:** access 15 min, refresh 30 days rotating (one-time-use; reuse = theft → revoke the whole `jti` family). Refresh in an `httpOnly; Secure; SameSite=Lax` cookie.
- **The SSE/WS auth hole:** `GET /worlds/{id}/stream` authenticates via an `Authorization` header — browser `EventSource` cannot set headers. Issue a **short-lived (60s) single-use stream ticket** from `POST /play/session`, passed as `?ticket=` and exchanged server-side; never put the JWT in a query string (it lands in nginx logs that live 86400s).
- **Service-to-service key:** the existing `api_key` becomes the sim↔render-plane key only, never accepted on player routes (two explicit deny tests).
- **Startup guard:** boot must `raise` if `api_key in {"dev-key", ""}` and `ENV != dev`.

### B-3. The god-verb authorization/audit/rate-limit pipeline (canonical for all disciplines)
The only existing god-action (`POST /minions/{id}/kill`) has no player identity, no ownership check, no rate limit, no EditLayer row, no idempotency. The single pipeline every verb routes through:
```
god_verb(verb, world_id, target, payload, jwt, idempotency_key):
  1. authn   — valid access JWT
  2. authz   — jwt.wg[world_id] ∈ {owner, editor}; else 403
  3. dedup   — idempotency_key seen for (player, world) in last 60s → return prior result
  4. ratelimit/cooldown — token-bucket per (player, world, verb_class)
  5. moderate — speak/decree free text → input moderation BEFORE write
  6. apply   — EditLayer row (append-only) + Event(actor_id=player_id, kind=divine_act)
  7. publish — divine_act (visible) or silent
  8. return  — 202 + the EditLayer seq
```
Per-verb rate/cooldown (the canonical numbers; UX and TD reference these):

| verb | bucket | cooldown | reason |
|---|---|---|---|
| cull / smite | 5 / 60s, burst 2 | 3s | grief/DoS + tick stall |
| resurrect | 3 / 300s | 10s | narrative-cheapening + cost |
| bless / gift | 30 / 60s | 0.5s | favour inflation |
| speak / decree | 10 / 60s | 2s | LLM-cost + injection surface |
| accelerate / seed | 2 / 600s | — | global sim-cost amplifier |

Per `(player, world)`; a global per-world ceiling (≤50 god-writes/s) protects the single sim coroutine. **Acceptance:** 1000 culls/s → 429 after the burst, tick latency within SLO, exactly one `divine_act` per accepted cull. **Enforce at both gateway (declarative) and handler (cost-aware)** — belt-and-braces.

### B-4. Inference governor + cost ledger (the discipline-specific keystone)
`tools/llm.py` is a stateless per-call client — no queue, semaphore, breaker, priority, or metrics. Build the **`InferenceGovernor`** (canonical with Part B.4): per-tier `asyncio.Semaphore` (70b/overmind/god_brain=1, 8b≈6 mirroring `llm_max_minions_per_tick`, 3b=N), bounded `PriorityQueue`, `CircuitBreaker`. Priority `god_brain(0)>overmind(1)>high_major(2)>high_minion(3)>normal(4)>chatter(5)`; the 70B/god_brain tier gets its **own** semaphore/queue. Shed policy: chatter/normal carry `deadline_ms` (300/2000) → shed to heuristic immediately (already the safe default since the cognition loop swallows exceptions and minions act every tick heuristically); god_brain/overmind never shed (queue with a 30s ceiling, then model-fallback 70B→32B→8B, never to heuristic). **Breaker:** open after 5 consecutive tier failures or p95 > 3× budget over 30s; stay open 20s; half-open admits 1 probe. **Failure modes the bible misses:** (a) the `/api/tags` probe failure caches an empty `_AVAIL_MODELS` → `_layer_model` returns the wanted 70B unconditionally → stalls on a box that doesn't have it; fix: cache empty as "unknown → fallback," add a TTL; (b) cold-load 30–120s first-token vs the 8s SLO → pin `keep_alive` or breaker-trip; (c) the co-tenant product OOM/evicts the resident model mid-generation → classify Ollama 500/eviction distinctly and trip fast.

**Cost ledger** (the bible says "non-negotiable," specifies no schema): `InferenceCall{world_id, player_id?, tier, model, prompt_tokens, completion_tokens, latency_ms, gpu_seconds_est, shed:bool, tick, ts}` append-only, dual-written. `gpu_seconds_est = completion_tokens / tokens_per_sec[model]`. This is the join key for cost-per-player-hour and the margin breaker — neither computable without it. (Full business-side schema in Part J.)

### B-5. Prompt-injection & moderation data path
There is **zero** moderation/injection-defense/rate-limit code in the server. System/user separation: player text only inside a delimited user block, never concatenated into a template; `chat(messages=[{role:system,...}, {role:user, content:json.dumps({player_said:<verbatim>})}])` with the template treating `player_said` as a quoted in-world utterance. Two gates: **input** player→minion *before* writing to `Memory`/`Event`; **output** LLM→player on every `whisper`/`vo`/`god:beat` *before* publish. Provider: hosted classifier + local regex pre-filter; **not the 70B as its own moderator**; fail-closed on player-facing output, fail-open-but-flag-and-quarantine on internal corpus writes. Output schema-validation → reject to heuristic on parse failure (generalize the existing reasoning-empty guard). (This is the same seam as Part H §H.2 — built once, consumed by both.)

### B-6. Data privacy / retention / anti-abuse
**Delete-account scrub:** player content diffuses into world memory (`Memory`, `Event.payload`, EditLayer, `ancestral_summary`). On delete: tombstone the account, re-key all authored rows to `[redacted-player]` + null free-text payloads, leave the deterministic consequences (the minion is still dead/blessed). Post-scrub no row joins back to the email; world state stays consistent (the determinism harness still replays). SLA 30 days + `account_scrub_done` audit. **Retention:** player→minion utterances 90 days then hashed/aggregated; low-importance player-sourced memories age out first. **Encryption:** Postgres volume encryption + app-level encryption of `email`/`oauth_sub`; the render plane gets a scoped token with **no DB access** (credential audit proves the Vast container holds no master key, DSN, or PII). **Anti-abuse:** max N free worlds/account + device/IP velocity check; per-world EditLayer-rows/hour ceiling; a per-player rolling-cost breaker that throttles the player's tier before the world.

### B-7. Concurrency / scale (the bible asserts; here made buildable)
- **The single sim coroutine is the real near-term ceiling, ahead of SQLite.** `scheduler.py` advances all worlds **sequentially in one task**; the cognition loop is a second sequential loop over the same worlds. First scale move = make the scheduler a **worker pool keyed by `world_id`** (one world = one worker → no intra-world write contention) with `FOR UPDATE SKIP LOCKED` once on Postgres. Acceptance: 50 ticking worlds advance within 2× their interval.
- **SQLite three-writer contention is real now** — tick loop + cognition loop + handlers against one WAL with `busy_timeout=30000` means contention *stalls the tick up to 30s silently*. Emit `db_lock_wait_ms`, alert p95 > 500ms — that threshold (not the bible's vaguer "more than one ticking world") is the Postgres cutover trigger.
- **The in-memory bus is per-process and lossy** — two processes ⇒ a subscriber on B never sees A's `god:beat`; **Redis pub/sub is required at the decompose step.** Bus events are not durable: `god:beat`/`divine_act`/`awakening` are **durable+replayable** (sourced from `DirectorBeat`/`Event`, `?since_seq=`), `whisper`/`vo`/`audio_state` stay best-effort.
- **Scene-state delta contract:** `build_scene_state` emits a full snapshot at `contract_version: 1`; net-new `scene-delta` codec (`changed/removed/frame_patch/base_version`), any field addition bumps the version, covered by `test_scene_state` so both renderers stay locked; a client missing a delta can request a keyframe.

### B-8. Stream allocator & render-plane edge (replace the SSH-cron hack)
The production path is fragile: `orchestrate.sh` discovers Vast's random ports **over SSH**, templates nginx (hardcoded two upstreams), `nginx -s reload` — breaks on every Vast restart, caps at 2 sessions. Net-new: **self-registration** (`POST /render/register {node_id, public_ip, ports, free_slots, gpu_model, build_sha}` every 10s; dead after 3 missed heartbeats → drain sessions → re-allocate via a new signed URL). **`POST /play/session`** → `{stream_url (HMAC-signed, 60s TTL), ice_servers, stream_ticket}` so the render plane is reachable only via the broker (the open nginx upstream currently lets anyone who learns the Vast IP:port hit the stream). **Ephemeral TURN:** `turnserver.conf` ships `user=underworld:CHANGE_ME_STRONG_SECRET` + `verbose` (logs credentials) — switch to coturn `use-auth-secret` (REST API), mint `username = exp_ts:player_id`, `password = base64(HMAC-SHA1(secret, username))`, TTL 600s; remove `verbose`. **Back-pressure:** reject a free-roam session with 503 when no slot, offer shared-spectator. SLO: p95 session-establishment < 5s including allocation.

### B-9. Observability, SLOs, runbooks
No `prometheus-client`, no metrics middleware; only `structlog`. Net-new metrics with thresholds: `tick_latency_ms` (alert p95 > 2× interval), `cognition_swallowed_exceptions_total` (**alert on any nonzero** — silent failure is not health), `llm_queue_depth/latency_ms` (god_brain p95 < 8s), `db_lock_wait_ms` (p95 > 500ms → Postgres warning), `stream_slot_utilization` (>0.8 → scale), `cost_per_player_hour`, `breaker_state` (alert on open). SLO error budgets: 99.5% API at beta = ~3.6h/month, multi-window burn-rate alerts (2%/1h fast, 5%/6h slow); the God-Brain 8s SLO gets a separate budget (page on its breach even within overall availability). Runbooks as executable procedures for the four footguns: co-tenant VRAM hog (disable the autostart, verify keep_alive), Vast IP change (replaced by self-registration), SQLite locking (the `db_lock_wait_ms` alert + cutover), silent 70B→32B (label `llm_model{tier=god_brain} != llama3.3:70b`; check disk + `ollama pull`).

### B-10. Stage-gate backend exits (binary checklists)
- **G1:** `api_key` boot-guard live; god-verbs go through the B-3 pipeline writing EditLayer + audited Event with cooldowns; one Vast box with Underworld's Ollama **proven separated from the co-tenant** (cull the co-tenant autostart, confirm the model stays resident); cost-ledger emits a measured CPPH. Still SQLite, JWT-for-players + service-key.
- **G4:** Alembic Postgres (`upgrade head` green in CI); JWT + refresh-rotation-reuse-detection; session-broker + self-registering nodes; Redis pub/sub with durable `god:beat` replay; inference governor with breaker + ledger; moderation on all player-facing output + all player→corpus input; ephemeral TURN (`verbose` removed); continuous WAL archiving + 30-day PITR proven by a **restore drill** (a tested restore, not a backup that's never been restored); assets/DBs out of git onto object-store/CDN.
- **G-launch:** world-sharded scheduler workers sustaining 50+ worlds within SLO; GPU autoscale on `stream_slot_utilization`; Postgres read-replicas + per-world partitioning; DDoS/CDN front, render plane reachable only via signed broker URLs; **spectator as the default surface** (free-roam 503→spectator when scarce).

### B-11. Open decisions
Alembic now (baselined). Rate-limit at both gateway and handler. Hosted classifier + local pre-filter, never the 70B as judge. **Tiered bus durability** (narrative durable+replayable from `DirectorBeat`/`Event`; ambience best-effort — Redis pub/sub is also lossy, so durability sources from the tables). EditLayer key `(target_kind, target_ref)`. **First scale lever = shard the scheduler/cognition coroutines by world *before* Postgres** (the single sequential loop is the named bottleneck in `scheduler.py`'s own docstring). Pin `keep_alive` + treat first-call-after-idle as a breaker condition. **Single highest-leverage backend task: stand up the `InferenceGovernor` + cost-ledger** — it's the precondition for cost-per-player-hour, makes the 8s SLO and margin breaker buildable, and wraps the existing working heuristic fallback so it ships without new risk.

---

## PART J — BUSINESS / LIVE-OPS / MONETIZATION DIRECTOR

The strategy is set; missing is everything to *build and operate* the business. The three-item business critical path is the cost ledger, the circuit-breaker, and the watched-creator↔retention correlation — built in that order, at the slice, before any marketing spend.

### J.4 The cost ledger — data contract and ingestion (build first)
Every downstream metric reads from it. `tools/llm.py:80` already maps cognition layers to models; the `Event` table carries no token/cost columns. The ledger is a new append-only table + a wrapper around `chat`/`chat_stream`.

**`CognitionCostEvent`** (one row per LLM call, emitted inside the client, never at call sites): `event_id, ts, world_id, player_id?, session_id, minion_id?, cognition_path∈{chatter_3b, individual_8b, reflection_8b, overmind_70b, confrontation_70b, director}, model_id, tier_at_call∈{hot,warm,cold}, prompt_tokens, completion_tokens, latency_ms, gpu_seconds, unit_cost_usd, breaker_state∈{normal,soft,hard}, billable`.

**`RenderCostEvent`** (one row per 60s session-slice): `session_id, world_id, player_id, ts, gpu_seconds, instance_class, fidelity_level∈{ultra,high,med,low,offloaded}, unit_cost_usd, breaker_state`.

**Derived rollups (materialized, ≤60s):** `cpph_by_cohort = Σ unit_cost_usd / Σ player_hours`; `player_margin = (allocated_revenue_per_hour − cpph)` rolling 7/30-day (the breaker's input); `70b_beats_per_session` (the cost-vs-magic dial). **Acceptance:** exactly one cost event per call (reconciliation test: Σ gpu_seconds within ±3% of Vast.ai billing export); `unit_cost_usd` reproducible from `(gpu_seconds, price_table_version)`; ledger write async/fire-and-forget, never raises into the tick; a player's last-90-day cost queryable <200ms; test/grace traffic `billable=false`. **Decision:** derive `gpu_seconds = completion_tokens ÷ measured_tok_per_s` with a nightly calibration job against the billing export (good to ±10%, shippable for the Gate-A baseline); direct measurement is a Beta upgrade.

### J.5 The margin circuit-breaker as a deterministic FSM
Per scope (global, per-cohort, **per-player**), evaluated each 30s control tick against `player_margin`/`cpph_by_cohort` (m = rolling cost ÷ allocated revenue):

| State | Enter when | Levers (in order) | Exit when |
|---|---|---|---|
| NORMAL | m < 0.55 | none | — |
| SOFT | m ≥ 0.70 for 3 ticks | (1) render fidelity −1 notch; (2) `hot_n` 24→16; (3) 70B-beat min-interval ×1.5 | m < 0.55 for 10 ticks |
| HARD | m ≥ 0.90 for 3 ticks OR CPPH > $0.60/hr | (4) render→offloaded/local prompt; (5) `hot_n`→8, demote warm/cold; (6) 70B reserved for Confrontation only; (7) session soft-cap UI nudge | m < 0.65 for 20 ticks |
| QUARANTINE | a session > $X/hr for 5 ticks OR `70b_beats_per_session` > 6× cohort median | freeze new 70B for that session, alert ops, fraud flag | manual / cooldown |

**Hard invariants:** the active, player-triggered **Confrontation beat is never throttled** (degrade everything around it); throttling is graceful, reversible, applied smallest-scope-first (per-player before cohort before global), and **diegetically masked** (render drops read as the colony's mood dimming, reusing the Overmind→mood-lighting channel — never a fuel gauge). **Acceptance:** deterministic (same ledger replay → same transitions); hysteresis (no oscillation >1/min under a sawtooth); a synthetic whale-streamer load drives NORMAL→SOFT→HARD then recovers without ever throttling an in-flight Confrontation; every transition emits a `BreakerTransition` event. **Decision: degrade-only for paying tiers**; hard-cap only in QUARANTINE / for free-grace.

### J.6 Pricing, entitlements & the store backend
No account/tier system exists (`auth.py` is a single shared key). **Entitlement model:** `Account{...}`, `Entitlement{account_id, sku, grant_type∈{purchase,sub,gift,grant}, active_from, active_to, store_origin}`, `SubscriptionState{account_id, plan∈{free,plus,pro}, status∈{trialing,active,grace,past_due,canceled}, renews_at, mrr_usd, dunning_stage}`. SKU table is data not code. **Entitlements gate features, the cost ledger gates fair-use** — keep separate.

Fair-use tiers (placeholders pending Gate-A/B measured CPPH; tunable config, not hard-coded):

| Tier | Price | Colony cap | Render | 70B-beat/mo | Soft fair-use | Over-cap |
|---|---|---|---|---|---|---|
| Free/local | $0 (w/ premium) | small, local | player HW | local-model only | n/a | local mode |
| Plus | $12/mo or $99/yr | medium | cloud high | ~baseline | ~120 cloud-hr/mo | degrade high→med, then suggest local |
| Pro | $25/mo | large, private | cloud ultra, low-latency 70B | ~3× | ~300 cloud-hr/mo | priority queue, then degrade |

Tuned so P90 sub-player monthly cost < ~60% of that tier's revenue. **Store/payments:** **Steam/Epic as MoR for one-time SKUs** (offload tax/VAT/refund/chargeback), **subscriptions direct-Stripe** (own the cost-linked dunning). Required backend: webhook handlers (purchase/refund/chargeback/renewal/cancel → mutate Entitlement/SubscriptionState), a dunning FSM (past_due → grace(keep world 7d) → soft-degrade → **archive-not-delete**), idempotent grant/revoke. **Acceptance:** entitlement check <50ms cached; refund/chargeback revokes entitlement but **preserves world data** (never delete a colony on payment failure); region/age gate before any chat-with-minion.

### J.7 Refunds, chargebacks, fraud & the compute-cost asymmetry
Unique to this title: a refunded player **already cost real GPU money** (revenue reversal *plus* sunk COGS). **The generous local/low-intensity default mode is the refund moat** — the first 2 cloud-hours default to local/low-intensity so the refundable window carries near-zero platform COGS; full cloud intensity unlocks past the refund horizon or on explicit sub (an existing design decision doing double duty as fraud control). Chargeback → revoke + flag, world archived not deleted. Fraud signals (ledger-joined): `70b_beats_per_session` outlier, render-hours with zero monetization, sub-then-immediate-cancel-after-heavy-use, marketplace payout fraud. KPIs: refund rate <8%, **net-COGS-on-refunds < 1% of gross**, chargeback rate <0.5% (account-health threshold).

### J.8 The creator-economy marketplace
The riskiest unbuilt claim. **Cost attribution:** when B loads creator A's world, the COGS bill to **B's sub fair-use** (B is paying), while A earns a rev-share on B's *engagement*, not on B's compute (add `world_origin∈{own,community}` + `creator_account_id` to the ledger). **Payout:** creator-majority (~70/30), paid from a pool funded by sub revenue allocated to community-world play-time, proportional to engaged-hours; requires creator KYC/tax (W-9/W-8BEN, 1099-K), a payout ledger, minimum-payout threshold, clawback. **Moderation tie-in (launch-blocker):** the moderation layer must gate marketplace *publish*, not just runtime — UGC + LLM + monetization is the highest-risk safety surface. **Recommendation: defer the marketplace to Gate C, instrument cost-attribution from Gate B**, ship read-only "world-of-the-week" first.

### J.9 The analytics event taxonomy
**Funnel:** `wishlist_add, demo_start, demo_clip_shared, install, first_session_start, premium_purchase, sub_trial_start, sub_convert, sub_renew, sub_cancel(reason), pro_upgrade, cosmetic_purchase, season_pass_purchase, refund, chargeback`. **Watched-creator engagement events (the core hypothesis test):** `beat_started, beat_completed(ticks_to_complete), awakening_threshold_crossed, confrontation_reached(time_to_reach), confrontation_answered(stance), monument_built(stance to_you|against_you), minion_named_by_player, returned_to_same_colony(gap_hours), grief_event(dwell_after_death_s), clip_shared`. **The single Gate-B correlation:** `corr(watched_creator_engagement_score, D30_retention)`, where `watched_creator_engagement_score` = weighted composite of {beat_completion_rate, reached_confrontation (binary), answered_confrontation, monument_built, returned_to_colony}, normalized per-session — **computed from day one of the slice** so the Gate A→B correlation has data.

### J.10 LiveOps operating mechanics
**Season content pipeline:** `generate (story_engine scaffold + asset-gen) → curate (human art/narrative pass) → moderation gate → stage on canary → measure (engagement composite) → promote/rollback`, with a server-side **content kill-switch** per event. **LiveEvent config as data:** `{event_id, type∈{omen,festival,plague,heresy,cross_server_awakening}, schedule, target_cohort, director_bias (archetype weights), cosmetic_skus, kill_switch, expected_70b_beat_delta}` — `expected_70b_beat_delta` is mandatory because every live event is a COGS event (a colony-wide awakening spikes 70B; LiveOps must pre-clear cost headroom with the breaker). A/B on battle-pass *pacing* (beats-to-tier), never on monetization aggression. **Per-season P&L:** `Revenue = season_pass×attach×price + event-cosmetic sales + attributable net/retained subs`; `COGS = Σ ledger cost for the window + curation labor + asset-gen credits`; **a season margin-negative on COGS alone is killed regardless of engagement.** A `pay_to_win == false` lint on the SKU table (no SKU grants a sim-affecting entitlement).

### J.11 Operating numbers & open decisions

| Lever | Target / threshold | Source | Tuned at |
|---|---|---|---|
| Inference CPPH | ≤ $0.08/hr | cost ledger | Gate A |
| Render CPPH (blended) | < $0.30/hr | RenderCostEvent | Gate B |
| Blended CPPH ceiling (HARD) | $0.60/hr | breaker | Gate B |
| Sub break-even play-hours | ~40 hr/mo (Plus $12) | derived | Gate B |
| Breaker SOFT/HARD margin | m ≥ 0.70 / 0.90 | breaker | Gate B |
| 70B-beats/session | 1 Confrontation-class beat per session-arc, Overmind 70B event-rare | ledger | Gate A |
| Refund net-COGS | < 1% of gross | ledger | Gate B |
| Chargeback rate | < 0.5% | payments | ongoing |
| LTV:CAC | ≥ 3 | analytics | Gate B |
| D30 ↔ watched-creator-engagement corr | positive, significant (the pivot gate) | J.9 | **Gate A→B** |
| Creator rev-share | ~70% creator | payout ledger | Gate C |

Decisions: derive GPU-seconds + nightly calibrate now (measure at Beta); direct-Stripe subs + Steam/Epic SKUs; degrade-only for paying tiers; defer marketplace payouts to Gate C; local/low-intensity default for the first 2 cloud-hours as fraud control.

### J.12 Business build ordering
1. **Cost ledger** (wrapper around `chat`/`chat_stream` + `RenderCostEvent` hook) — Gate A needs the inference-cost-per-beat baseline.
2. **Analytics taxonomy + watched-creator composite** — concurrent with the slice; without it the make-or-break pivot has no data.
3. **Circuit-breaker FSM** — before soft-launch, tested against synthetic whale load.
4. **Accounts + entitlements + fair-use config** — before any paid soft-launch.
5. **Payments + dunning + refund/fraud.**
6. **LiveOps config + kill-switch + per-season P&L** — before the first season.
7. **Creator marketplace + payouts** — last, Gate C, gated behind moderation.

CPPH is unmeasurable until the cost ledger exists and unactionable until the breaker and the engagement↔retention correlation exist; those three are the entire business critical path.

---

## PART K — ANIMATION / TECHNICAL-ART / PIPELINE DIRECTOR

No `.github/workflows`, no CI orchestrator chaining gen→import→cook; packaging is a single monolithic `-pak`. The bible's "decouple code-pak from asset-pak" and "automated gen→import→cook loop" are aspirational.

### K.0 Discrepancies that invalidate current estimates
1. **Movement doesn't exist on the wire** — `scene_state._position` is a static sha256 spiral; no velocity/path/move_state in the emit; `contract_version: 1`. The UE5 minion just `VInterpTo`s a fixed point (teleport-lerps, never travels). The §6.3 blendspace/Motion-Matching have no input signal — scene-state v2 movement fields are a **hard precondition** for all locomotion, flagged in the RACI as an animation-blocking dependency.
2. **The import commandlet authors nothing** and **neither the pak-decouple nor the automated loop exist** (single monolithic `BuildCookRun -pak`, no CI, no orchestrator). These are unbuilt aspirations, not a foundation to extend.
3. **Two incompatible emotion vocabularies** — `emotion.py` produces exactly **18** discrete values (bible says "seventeen" — correct it to 18); `behavior.py:50` runs on a separate ~127-emotion palette, and the wire `mood` is from *that* set. The wire carries a 127-value `mood` while the facial system is specced against 18.
4. **2,829 GLBs present (not 3,228)** under `web/public/models/generated/{uw,tripo,open_scrape}`, fed to WebGL via raw glTF; `asset_catalog.json` + `uw_bindings.json` are the resolver input. The gen list is ~400 short — the QA gate must handle the *partial* set as steady state.

### K.1 The import-authoring contract
A deterministic, idempotent **per-asset authoring function** keyed by content hash, replacing the no-op task path. Emit `authoring.json`: `{url, asset_path, content_sha256, measured_bbox, category, target_size_m, applied_scale, pivot_offset, material_class∈{structural,prop,emissive,foliage,glass,skin}, nanite, lods, collision∈{box,convex,complex,none}, emissive_mask, tris_in, tris_out, vram_kb, authored_version, status∈{ok,quarantined,placeholder}}` — the QA gate's input and the loop's idempotency key. **Interchange override:** a `UInterchangeGenericAssetsPipeline` subclass (`BuildNanite=true` for structural, lightmap UVs off, deterministic LODs, convex collision for props). **Per-category real-world-size table** (metres, longest-axis): tower/building 18–40 (height-binned), residential 8–14, civic/commercial 12–24, machine/workshop 1.8–3.0, interior_clutter 0.05–0.4, vehicle_car 4.4, vehicle_drone 0.6, prop_handheld 0.3, furniture 0.5–2.0, flora_tree 6–12. Bake scale into the **StaticMesh build** (NOT `SetWorldScale3D`, which breaks HISM batching), re-pivot to base-centre. **Master material + reskin** (`M_Underworld_Master` + `MPC_UnderworldWorld`): reassign every slot to an MI, pipe albedo → tint, force shared roughness/metallic/detail-normal/grime — zero-percent built today; the `enhance_glb.py` name-regex is a usable seed for emissive auto-detection but the real mask is luminance/saturation-threshold, not name-based.

### K.2 Two-tier crowd LOD budget (§E.5 asserts 16.6ms but no per-band split)

| Band | Distance | Anim | Face | Mesh | Cost target | Trigger |
|---|---|---|---|---|---|---|
| Hero | possessed/confronting/<8m | full ABP + Motion Matching | ARKit-52 | MetaHuman | ≤0.8 ms | possession, awakening, dialogue |
| Near | <30m | full ABP + blendspace | 4-morph mood | merged modular | ≤0.15 ms | significance > 0.6 |
| Mid | 30–80m | blendspace only | none | merged modular | ≤0.04 ms | URO 1:2 |
| Far | 80–200m | URO 1:4 root-only | none | merged modular | ≤0.01 ms | budget allocator cap |
| Impostor | >200m | none | none | octahedral billboard | ≤0.001 ms | — |

Reserve **4.0ms** for all skeletal anim; `UAnimationBudgetAllocator BudgetMs=4.0, AlwaysTickFalloffAggression=0.8`. At >150 visible animated minions the allocator must demote without popping. Hysteresis: promote at threshold, demote at ×1.25, 0.5s cooldown. **MetaHuman swap is unbudgeted** — streaming LODSync + groom is ~40–120ms of hitch if synchronous; **async-load and pre-warm one band early** (begin streaming the hero asset when a minion enters Near). Assert: no >2ms spike on promotion.

### K.3 Interaction/Smart-Object contract (the richest existing data is stranded off-wire)
`assets/tripo/interactions.py` defines a complete `Interaction(action, kind, anim, anchor, objects, guild_tool)` taxonomy with `GUILD_TOOLS`/`DAILY_ROUTINE` — **none of it reaches scene-state or UE5.** Add to v2 the `interacting:{object_id, glb, slot_socket, anchor∈{seat,surface,handheld,machine,vehicle,floor}, anim, kind, phase∈{walk_to,align,enter,operate,exit}, progress}` block; `minion_visual` already calls `scene_assets.using_asset` — extend it to fold in `interactions.interaction_for(action, guild)` (a ~20-line change unlocking the whole walk-to→align→operate loop). UE5 side (zero built): author an interaction socket per anchor at import, register a `USmartObjectComponent` per socket; the montage library maps **1:1 onto the `kind` enum** (~10 base kinds × ~3 guild-tool operate variants ≈ 25 montages — the concrete derivation behind the bible's "20–30"). **Acceptance:** a minion with `last_action="forge"` walks to the forge socket, aligns within 15°/20cm, plays `operate_machine`, and the object's `state` flips to `active`.

### K.4 The HISM rewrite (concrete shape — see also Part E.3)
Replace `TMap<FIntPoint, TArray<AStaticMeshActor*>>` with `TMap<FIntPoint, TMap<UStaticMesh*, UHierarchicalISMComponent*>>` — one HISM per unique mesh per chunk; group `Chunk.Structures` by `ResolveMesh`, `AddInstance` per structure. Because scale is baked at import (§K.1), `S.Scale` ≈ 1.0 uniform and HISM uses transform for position/rotation only; varying scale buckets into pre-scaled variants. Collision needs the import-authored simple collision. Far ring swaps full HISM for an octahedral-impostor HISM. Target ≤1 draw call per unique mesh per chunk (~30 meshes × 5×5 ring ≈ 750 draws vs tens of thousands of actors today).

### K.5 The QA validator (the silhouette gate with teeth)
Runs over `authoring.json`, **quarantines** (status→quarantined, world uses placeholder) on: scale outlier (`applied_scale` outside [0.1,10]); tri budget over per-category ceiling (structural 1.5M, prop 80k, handheld 20k); degenerate/non-manifold (Interchange warning >0 on structural — these become Lumen surface-cache holes); material count >4 post-reskin; silhouette (8 ortho 128² masks, Hu moments, reject if Mahalanobis > 3σ from the category centroid); VRAM over cap (prop 4MB, structural 16MB) post-atlas → route to atlas. **A quarantine gate, not a block gate** — ships placeholders, emits `quarantine_report.json`. Gate A: zero quarantined assets in the slice district's resolved set.

### K.6 The emotion→ARKit decision + the 18-pose table
**Decision:** add the appraisal `(emotion:Emotion, intensity:float)` pair to v2 as the **facial-authoritative** channel (18 curated ARKit poses, one per enum), keep the 127-value `mood` string as a **secondary** locomotion/body-language channel. Do not author 127 poses — author 18, map any of the 127 to its nearest appraisal emotion by valence/arousal. The full 18-row pose spec:

| emotion | primary ARKit weights (intensity-scaled) |
|---|---|
| joy | mouthSmile L/R 0.8, cheekSquint 0.5, eyeSquint 0.3 |
| fear | eyeWide 0.9, browInnerUp 0.7, jawOpen 0.4, mouthStretch 0.5 |
| anger | browDown 0.9, noseSneer 0.5, mouthPress 0.6, eyeSquint 0.4 |
| sadness | browInnerUp 0.6, mouthFrown 0.7, eyeLookDown 0.4 |
| disgust | noseSneer 0.9, mouthUpperUp 0.6, eyeSquint 0.5 |
| surprise | eyeWide 1.0, browInnerUp+browOuterUp 0.9, jawOpen 0.6 |
| grief | browInnerUp 0.9, mouthFrown 0.8, eyeBlink 0.4, jawOpen 0.2 |
| attachment | mouthSmile 0.4, eyeSquint 0.2, headTilt (additive) |
| shame | browDown 0.5, eyeLookDown 0.7, mouthFrown 0.3, headDown |
| pride | mouthSmile 0.5, chinRaise 0.3, browUp 0.2 |
| awe | browInnerUp 0.8, eyeWide 0.6, jawOpen 0.3 |
| trust | mouthSmile 0.3, eyeSquint 0.2, neutral brow |
| resentment | browDown 0.6, mouthPress 0.5, eyeLookSide |
| curiosity | browInnerUp 0.4, eyeWide 0.3, headTilt |
| boredom | eyeLookDown 0.3, mouthFrown 0.2, blink rate ↑ |
| purpose | browDown 0.2, mouthPress 0.3, eyeSquint 0.2 |
| dread | browInnerUp 0.7, eyeWide 0.5, jawClench, mouthStretch 0.3 |
| neutral | all 0 — rest state |

Always-on additive layers: procedural blink (Poisson mean 4s, suppressed during awe/surprise), saccade (±2° every 0.3–1.5s), breathing micro at life-stage rate. TTS visemes layer *over* the held pose via a separate ARKit jaw/mouth track. *(Reconcile with Part F's `emotions.csv` canonical choice — the team must pick one `emotion_id` enum across animation, TTS, and music.)*

### K.7 The era axis (a material-stop problem, not 6× mesh-count)
The master material carries an `Era` scalar (0–5) in `MPC_UnderworldWorld`; per-era lerp roughness/metallic/detail-normal/tint between authored stops (stone→bronze→iron→industrial→modern→futuristic). The world manager already receives `Era` in `FUwSceneState.Era` but does nothing — wire it to the MPC in `HandleSceneState`. Geometry morph reserved for MRQ era films; runtime era is material-only (a major scope reduction).

### K.8 The automated loop + pak decoupling
1. **Asset-pak split:** `BuildCookRun -manifestforchunking` + an AssetManager rule assigning `UnderworldAssets/*` to chunk 1, code/maps to chunk 0 — lets new assets ship as a `pakchunk1` patch without a code rebuild.
2. **Loop orchestrator:** `tripo_generate → enhance_glb → import_glbs(authoring) → validate → cook(chunk1 if asset-hash set changed) → publish`; idempotency key = union of `content_sha256`; resumable (skip unchanged hash+version).
3. **CI smoke gate:** a WebGL + headless reference render of the slice district per asset-pak change, asserting the contract version and manifest count match the resolver's expectation (the GPU-free reference renderer the bible names but never harnesses).

**Discipline task graph:** `scene-state v2 movement fields (sim, BLOCKS all anim)` → `HISM rewrite + import-authoring rewrite (independent — the two keystones, start immediately)` → `master material + MPC + era wire` → `QA validator` → `modular skeleton + locomotion ABP (needs velocity)` → `interaction wire + SmartObject/montage` → `(emotion,intensity) wire + 18 poses` → `MetaHuman two-tier swap + budget` → `asset-pak split + loop + CI`.

### K.9 Edge cases / failure modes
Missing GLB → a per-category **placeholder mesh** (grey-box, not a gap). Non-uniform import scale defeating HISM (the silent perf-killer). **Coordinate-system trap:** three different Y/Z mappings already exist (`scene_state` Y-up; `UnderworldMinion.cpp` and `UnderworldWorldManager.cpp` both map `(x,z,y)`) — new socket/anchor authoring must follow the **structure** convention or minions align to the wrong face. **Awareness aura field is half-there** — `minion_visual` emits `awareness` but `FUwMinionState` doesn't parse it; add `float Awareness` + the Niagara MPC. Overmind frame fields absent — add `overmind:{mood,tension,omen,realisation}` before authoring render-scenario 4. **Atlas/trim-sheet** is not optional polish — without the shared-atlas pass the 2048MB streaming pool thrashes; it's the memory gate.

### K.10 Net-new gate acceptance criteria
- **Gate A:** import-authoring live (no-op path deleted); zero quarantined assets in the slice set; HISM ≤1 draw/mesh/chunk; v2 movement+interacting+(emotion,intensity)+awareness fields present and parsed by both renderers; one minion walk-to→align→operate→object-state-flip; 18-pose ARKit on the hero with intensity scaling; MetaHuman swap no >2ms hitch.
- **Gate B:** budget allocator demotes >150 visible minions with no pop; full ~25-montage library mapped 1:1 to the kind/guild-tool taxonomy; asset-pak split shipping a chunk1 patch with no code rebuild; loop idempotency proven; atlas pass holds VRAM under the pool cap at crowd scale.
- **Gate C:** invisible LOD transitions (hysteresis + async pre-warm); era axis material-only across all 6 stops, no mesh duplication; silhouette gate 3σ with zero off-palette in the resolved set; CI reference-render smoke gate green on every asset-pak change.

---

## PART L — AI-SYSTEMS / DIRECTOR ARCHITECT (The Control Plane)

Grounded: no Director/override/possession/presence/agency modules; cognition runs on a fixed 20s loop in `main.py` **decoupled in a different process-worth of state** from the 1Hz `scheduler.py` tick; `World` already has `tension/pollution/epidemic_*/prey_pop` fields the DramaMeter can read; `Event` has no `importance`/`valence`; sagas tick from `simulation.py:497`; scene_state has no `frame.overmind`, no position field, `contract_version: 1`.

### L.1 The control-plane gap: there is no Director loop, and the two existing loops race
The world tick (`scheduler.py`, 1Hz, own session per world) and the cognition loop (`main.py::_cognition_loop`, 20s, **own** session per world) never share a session, lock, or tick number — **they race on `Minion.brain` writes.** `cognition_cycle` commits the whole hot set; `advance_world` commits the tick; concurrent commits to the same rows are unguarded (SQLite → `database is locked`; Postgres → lost update on the `brain` blob).

**The Director must own concurrency, not just pacing.** Decision: the Director **becomes the single scheduler of cognition**, replacing `_cognition_loop`. `services/director.py::director_step(world_id)` invoked from inside `_tick_one_world` *after* `advance_world` commits, on a tick-divisor cadence (`if world.tick % DIRECTOR_EVERY_N_TICKS == 0`). This serialises sim-write → cognition-write within one session, eliminates the race, and gives the Director the authoritative tick. Keep cognition fire-and-forget for the LLM *call* only; the `brain` write-back happens on the next Director step holding the session. **Acceptance:** two worlds at 1Hz for 1,000 ticks with cognition on → zero `database is locked`; no `brain.awareness` regressions across a tick. **Cadence:** let the DramaMeter modulate it (spike → every 5 ticks, lull → every 40) — the cheapest "the world tightens when something's happening" signal.

### L.2 Event-stream contract (missing the columns the DramaMeter and ledgers depend on)
`Event` has no `importance`, `valence`, or `scope`; "unresolved-conflict count" has no representation. Net-new:
```
Event += valence: float = 0.0   # [-1,1], written by emitters
Event += weight:  float = 0.5   # salience
ConflictLedger(world_id, a_id, b_id, kind, opened_tick, resolved_tick|None, severity)
```
The DramaMeter (budgeted ~5ms) becomes three indexed aggregates over the last-N ticks: `count(distinct kind)` (novelty), `avg(valence*weight)` (valence), `count(*) where resolved_tick is null` (unresolved conflict). Add `ix_event_world_tick_kind`. Do **not** add a generic `scope` to `Event` (it's on the 1Hz hot path) — overrides get their own table (§L.5).

### L.3 DramaMeter — the actual formula, thresholds, hysteresis
```
tension = clamp01( 0.20*pollution + 0.20*famine + 0.15*epidemic_infected
                 + 0.15*unresolved_conflicts/POP_NORM + 0.20*creator_pressure
                 + 0.10*(1 - valence_pos) )
novelty = distinct_event_kinds_last_30ticks / 12
```
All inputs map to real `World` columns (`pollution`, `prey_pop`→famine, `epidemic_infected`, `tension`). **Anti-flicker:** the arc-stage gate (`cognition.py:154`) is a bare threshold ladder that *will* oscillate dormant↔stirring on jitter — add **hysteresis** (advance only above `gate_up`, retreat only below `gate_down = gate_up − 0.04`, latched in `DirectorState.pacing_phase`), and require a stage to hold ≥N=6 Director ticks before re-transition. **Pacing thresholds (tunable):** target_tension by phase — build 0.45, spike 0.75, release 0.25, lull 0.15. Transitions: build→spike when `tension ≥ target−0.05` or a trigger fires; spike→release after the spike beat lands or an 8-tick timeout (so a stuck spike can't deadlock pacing); release→lull when `novelty < 0.15` for 6 ticks; lull→build when `novelty < 0.10` for 12 ticks (the manufactured-beat trigger).

### L.4 The minimum-novelty-floor beat-manufacturer (the most under-specified mechanism, no contract)
The anti-flatline engine: `director.manufacture_beat(world, drama) -> archetype_hint | event`: (1) source cast from real rows (highest-reputation living minion with the lowest recent-event count — an under-served character; or a dyad with an open `ConflictLedger` row; or the gaze focal set); (2) **bias, don't script** — extend `sagas.choose_archetype` to accept `hint: str|None` that adds weight to the matching archetype (the *only* code change needed to make "curated-emergent" real); (3) lull → `wanderer`/`prodigy`, build → `rivalry`/`discovery`, release → `reconciliation`/`renaissance`. **Audit gap:** verify all 11 archetypes named in B.2/4.2 are present in `ARCHETYPES` before wiring the menu (the bible says "eleven"; the code list must be reconciled — this is the same count discrepancy Part D flags). **Failure mode:** manufacture must be rate-limited (respect the existing `max_active=40` cap + a manufactured-specific cooldown ≥10 ticks) or a quiet world spawns a saga every tick.

### L.5 Override contracts (the missing pieces)
No override table exists. Add `OverrideRecord(id, world_id, scope, target_id, field, value_json, mode, ttl_ticks, created_tick, visible, player_id)` + a per-world in-memory cache swept in the Director step. **Deterministic resolution under multiple overrides on one field:** precedence `forbid > force/set > clamp > delta`, ties by latest `created_tick`. **Enum/JSON fields:** `set`/`force` must validate against the enum (`MoodKind`, `GuildKind`) or reject to a no-op + a logged `override:rejected`, never raise. **The four gate call sites** (the bible says "where computed state becomes acted-upon state" but never lists them): (a) end of each minion's per-tick need/mood commit in `advance_world`; (b) `_process_deaths` for resurrect/immortal/cull; (c) world-param writes (era/pollution/weather); (d) the action selector. **`meddle_index`:** `Σ overrides in last 60 ticks, +1 benevolent / −1 cruel`; magnitude > 8 → push `toward_creator` toward doubt regardless of sign. **Multiplayer arbitration:** `player_id` + last-writer-wins-per-field + a per-player budget; land `player_id` in the schema now, defer arbitration logic. **The "why" surface (mandatory):** when an override is clamped by resistance, emit `override:resisted {target, field, reason}` so the UI can render *"Kael's faith is too strong to force"* — an acceptance criterion, not polish (without it resistance reads as a bug).

### L.6 Possession contracts (tick-by-tick state machine + reconcile + persistence)
`nav_state ∈ {…, POSSESSED}` requires the `Kinematic`, which doesn't exist (positions are still hashed) — so possession-locomotion is **hard-blocked on the movement keystone**. State the dependency: *possession ships P1 observe-only (camera dive, control of verb/speech, no WASD) until P0 movement lands; full embodied locomotion is P3.* Step contract: `possess()` sets `brain["possession"]={active,player_id,from_tick}` and flags the minion **skipped by reflection** but **unioned into rendering**; `release()` writes `brain["lost_time"]={from_tick,to_tick,gap_felt}` and re-enqueues a backfill reflection. **`rapport_drift`:** `+Δ` per tick the player commands an action opposing the minion's dominant drive/self-model concern; `expel when rapport_drift > 0.3 + 0.6*autonomy` (high-autonomy = easily expelled — "the most awakened cannot be fully puppeted"); on expel, force-release abrupt + a `divine_violation` memory (importance 1.0) + push toward fear. **Persistence:** a possession active on disconnect auto-releases gentle after a 30s Director-sweep timeout, never leaving a minion frozen-possessed.

### L.7 Agency / autonomy — the formula + the LOD selector that doesn't exist
**`autonomy = clamp01(0.4*awareness + 0.3*norm(reputation) + 0.2*saga_involvement + 0.1*norm(age))`**, stored at `brain["autonomy"]`, recomputed cheaply in the Director step; feeds override-resistance, the possession expel threshold, and saga-initiation eligibility. **`select_hot(world, presence, budget)`** (today the hot set is purely `ORDER BY reputation DESC LIMIT hot_n` — the bible's gaze/saga/possessed/override union is unbuilt): `hot = top_reputation(N) ∪ gaze_focus ∪ saga_cast ∪ possessed ∪ override_targets`, capped at BUDGET (=24, the concurrent-LLM governor), with **priority eviction** when over budget: possessed/confront-candidate > gaze > saga > reputation (this eviction order *is* the "focal set never starved" guarantee). **Backfill:** a cold minion entering `gaze_focus` gets a synchronous single-shot `reflect()` at the next Director step before its first render-with-inspector, flagged `brain["backfilled"]=tick` — so an inspected never-before-hot minion has a non-empty `self_model.identity` within one cadence.

### L.8 PresenceField — gaze sample on the wire + absence as input
**Ingress (net-new `routes/god.py`, named in the bible but unbuilt):** `POST /worlds/{id}/player/gaze {camera:{pos,fwd,fov}, reticle_target_id?, dt}` and `POST /worlds/{id}/player/act {verb, target_id, params}` (bless/cull/gift/smite/speak/possess/override). **Reduction:** `PresenceTrace` ring-buffer → `attention_map` (per-minion exponential-decay dwell, half-life ~20s), `favour[minion_id]`, `creator_pressure`. **Absence as input** (the only mechanic that makes *not playing* a choice with a cost): `absence_ticks = world.tick - last_gaze_tick`; past `ABSENCE_THRESHOLD=300 ticks` the Director nudges `toward_creator` toward doubt and lifts `awaken_bias` — ticking even with zero players connected. **Output wire — the `frame.overmind`/`frame.presence` block** (additive to v2, canonical with Part B.2/D.7/G.1): `frame.overmind = {mood, toward_creator, tension, realisation, omen}`, `frame.presence = {attention_hotspots:[{pos,intensity}], creator_present:bool}`; bump `contract_version` to 2. Without the bump the "legible within seconds" pitch has no data path.

### L.9 Overmind/God-Brain wiring gaps
`cognition.py` *defines* `colony_overmind` (L1), `background_chatter` (L4), `god_brain_event` (L5) — and **nothing calls any of them** (only `collective_sentience` is called). "Three of five layers never run" is literally true. Net-new wiring: the Director calls `colony_overmind` every ~12 ticks; its output is **persisted nowhere today** — add `world.brain["overmind"] = patch` and `world.brain["myth"]` (sticky `realisation`), cache key `(era, weather, stance-bucket)`. **God-Brain triggers need event shapes that don't exist:** `first_death_of_awakened` requires `_process_deaths` to emit `Event(kind="death", payload={awakened, awareness})` (it doesn't snapshot awareness at death today). **Idempotency table:** `DirectorBeat(id, world_id, beat_key, tick, reversible, payload)` with unique `(world_id, beat_key)` so the Black-Mirror moment fires once; the `ARC_BEATS` table lives in `director.py` as data, not code branches.

### L.10 The confrontation system — the deterministic spine has no data model
`world.brain["creator_ledger"]["answers"]` (the persisted list — the "thousand confrontations *are* the ending" aggregate; cross-ref Part D.1/D.4). Trigger is a conjunction: `awakened this tick ∧ player observing/possessing ∧ self_model.question non-empty` ("observing" = target in `presence.gaze_focus`, so confrontation is gated on PresenceField existing). Answer→consequence are deterministic ledger writes (the leash) per Part D.4; the L5 prose is decoration. **Acceptance:** same answer on two seeds → identical ledger deltas, different prose.

### L.11 Safety / moderation pass (a launch-blocker, never sited)
Every L1/L4/L5 output is free LLM text published to the bus → SSE → client with **no moderation between generation and publish.** A `moderate(text) -> (ok, text)` gate the Director calls before `publish`, plus the named-minion validator (reject any line naming a minion not in the live cast — cheap set-membership against the snapshot). Configurable intensity. (This is the same seam as Part H §H.2 / Part B-5 — the Director is one of its callers.)

### L.12 Cost / latency budget — the Director needs a governor
`cognition_cycle` already `await`s `reflect()` **serially per hot minion** — at `hot_n=24` and ~1–2s/8B call that's 24–48s per pass on a 20s cadence; **it already can't keep up** (the bible never catches this). Replace the serial loop with `asyncio.gather` bounded by `asyncio.Semaphore(LLM_CONCURRENCY=6)`; when saturated, shed to the heuristic `global_workspace` path (a complete rule-based fallback) instead of queueing — so the tick never stalls. The 60s httpx timeout on a 70B that can run longer returns `// LLM error` content that would publish verbatim — the moderation gate must also drop `content.startswith("// LLM")` and `[STUB`. Log every Director step's DramaMeter + chosen phase + beat-budget allocation as structured data so the 70/25/5 ratio and pacing are tunable from data, not asserted.

### L.13 Determinism & save-scumming
The sim already seeds movement RNG from `(tick, id)`; the Director's *own* choices (which archetype to manufacture, which cast) must use the same seam — `rng = seed_from(world.seed_value, world.tick, "director")` — or a reload re-rolls the manufactured beat and the deterministic-divergence guarantee breaks. `World.seed_value` exists. A one-line discipline impossible to retrofit after players notice save-scum divergence.

### L.14 Build order, gates, open decisions
1. Event contract bump (valence/weight, ConflictLedger, death-awareness payload) — unblocks the DramaMeter and L5 triggers; no LLM, low risk.
2. **Director loop replaces `_cognition_loop`** + concurrent governor — fixes the race *and* the cant-keep-up latency in one move (the keystone fix).
3. DramaMeter + pacing automaton + hysteresis + beat-manufacturer — lights the dark layers (Overmind/Chatter/God-Brain wiring).
4. scene_state contract v2 (`frame.overmind`/`frame.presence`).
5. PresenceField + `routes/god.py` — gates confrontation and gaze-LOD.
6. Override bus + table + resistance "why"; agency/autonomy.
7. Possession (observe-only first; full locomotion behind the P0 keystone).
8. Moderation gate before any L5 reaches a player.

Decisions: Director owns cognition scheduling (kills the commit race); drama-modulated cadence; persist Overmind/myth in `world.brain` JSON now (migrate to a table only if query patterns demand); land `player_id` now, defer arbitration; possession observe-only at P1, embodied at P3; **reconcile the archetype count (eleven vs the code's `ARCHETYPES` list) before wiring the manufacture-menu.**

**The one sentence the bible should add:** *the Director's first job is not pacing — it's becoming the single writer of `Minion.brain` cognition so the two existing loops stop racing; pacing is what it does once it owns that seam.*

---

## CROSS-CUTTING CLOSING NOTE

Five facts recur across all twelve disciplines and are the true shape of the work: (1) **the scene-state contract must bump to v2** — additive in fields, semantic in the position-source change — and it is the wire every discipline depends on; (2) **the movement keystone (P0) blocks the visible game, the embodiment, the possession-locomotion, and the perf suite**, but the *hook* can be validated without it via the behavior-bias fallback, decoupling the funding gate from the engineering risk; (3) **the cost ledger + inference governor are one keystone** that makes the existential business metric, the 8s God-Brain SLO, the margin circuit-breaker, and the no-fallback cert gate all simultaneously buildable; (4) **the moderation/surfacing seam is a single chokepoint** consumed by QA, Backend, the Director, UX, and the marketplace — and it is the named launch-blocker that does not yet exist; (5) **the Director must become the single writer of cognition** to stop the two racing loops before any pacing work matters. Build these five seams first, hold the P0 timebox, instrument cost honestly, and say no to everything else — the rest of the bible becomes executable.
