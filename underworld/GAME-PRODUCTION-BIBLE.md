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

<!-- BIBLE-END -->





