# Underworld — High-Level Architecture for a Million-Agent Living World

Renderer-agnostic. This is the systems architecture that makes GTA5 × Thronglets ×
generative-agents real **at scale** — millions of LLM minions, persistent, reactive,
evolving — synthesised from the 2024-2026 research that actually did it. The renderer
(Three.js today, UE5/Omniverse later) is just **Layer 6**; everything above is where the
aliveness and the scale live.

## What the research proved (the canon we build on)
- **Project Sid / PIANO (Altera, 1000+ agents)** — agents run **~10 cognitive modules
  CONCURRENTLY** (memory, action-awareness, goal-gen, social-awareness, talking, skill
  exec), aggregated by a **cognitive controller**. This parallelism is *why* it's real-time
  and coherent. 30 identical agents self-specialised into roles; tax/voting governance
  emerged; memes/religion propagated — **dependent on population size.** Gap they flagged:
  no innate **drives** (survival/curiosity/community). [arXiv 2411.00114]
- **Scaling to millions (AAMAS 2025; AgentSociety, OASIS, AgentScope; SALLMA; ScaleSim)** —
  LLM agents now reach **population-scale (millions)** via a **layered architecture** (separate
  operational tick from the knowledge/memory layer) + **invocation-distance memory
  management** (keep near agents hot, summarise far ones) + distributed messaging
  (10k agents × ~500 interactions/day). [MIT AAMAS 2025]
- **MMO world architecture** — **server-authoritative spatial partitioning** (zones/cells,
  coordinate hashing) + **interest management** (each entity an *area of interest*) streams
  only what matters. Renderer-independent.

## The 6-layer architecture (build the gaps top-down)

```
 OBSERVER (you) ─ interest/area-of-interest ─┐
                                             ▼
 L6  RENDER-STREAMING   scene-state / layout-chunks / design-directives → ANY renderer
        (HAVE: scene-state + φ/fractal chunk API; design bible. GAP: interest-managed push)
 L5  DRIVES & EMOTION   innate drives (survive/curiosity/community/reproduce) → goals;
        emotion-aware decisions (Sentipolis)        (HAVE: needs+moods. GAP: drives→goals)
 L4  ORCHESTRATION/BUS  distributed event/message bus; event cascades; tick scheduler
        (HAVE: scheduler. GAP: pub/sub event bus, cascades)
 L3  KNOWLEDGE LAYER    per-agent Memory Stream (vector) + Reflection + Planning;
        SHARED CULTURE (memes/religion/governance/language, pop-dependent)
        (HAVE: GPU embeddings, sagas, brain. GAP: memory stream, reflection, culture layer)
 L2  COGNITION (PIANO + COGNITIVE LOD)   concurrent modules per HOT agent; cognitive
        controller; tiers: hot=full LLM, warm=heuristic+periodic LLM, cold=statistical
        (HAVE: single decide() call. GAP: parallel modules + LOD tiering — the big one)
 L1  WORLD/SPATIAL      server-authoritative regions; zone/cell partition; persistence
        (HAVE: chunk partitioning + deterministic gen + sqlite. GAP: interest mgmt, regions)
```

### L1 · World / Spatial (server-authoritative)
Partition the continent into **zones → cells** (we already chunk it). Each region is
authoritative over its entities and persists them. **Interest management:** the observer's
area-of-interest (camera frustum + selected lineages) marks cells **hot**; everything else
is warm/cold. *Have: deterministic φ/fractal chunks + DB. Gap: the interest manager + region
ownership so cognition + streaming key off it.*

### L2 · Cognition — PIANO + **Cognitive LOD** (the single biggest upgrade)
Replace the one-LLM-call-per-tick with a **tiered** cognitive system:
- **Hot agents** (in area-of-interest): **PIANO** — concurrent modules (Memory, Perception,
  Goal, Social, Dialogue, Skill, Emotion) running in parallel, merged by a **Cognitive
  Controller** that picks the coherent action. Real-time, on the GPU.
- **Warm agents**: cheap heuristic policy + an LLM reflection every N ticks.
- **Cold agents** (the millions off-screen): **statistical aggregate** — population dynamics,
  not per-agent LLM (births/deaths/economy/discovery as distributions).
- **Invocation-distance memory:** near agents keep full memory; far agents' memory is
  summarised/compressed (ScaleSim). This is how millions fit on finite GPU.

### L3 · Knowledge — Memory Stream + Reflection + Shared Culture
- **Memory Stream** per agent: experiences in natural language, retrieved by
  **recency × importance(LLM) × relevance(our GPU embeddings)**.
- **Reflection**: periodic synthesis → higher-level beliefs steering behaviour.
- **Planning**: day-plans from memory → the `action`/`target_building` we already surface.
- **Shared Culture layer**: memes, religion, governance, language, fashion — propagate
  through the population (size-dependent, per Project Sid), separate from private memory.

### L4 · Orchestration / Event Bus
A **pub/sub event bus**: discoveries, deaths, fights, festivals, the observer's focus →
events. Agents subscribe by area-of-interest; salient events enter memory and **cascade**
(word spreads via dialogue → sagas spawn). Replaces per-interaction DB polling.

### L5 · Drives & Emotion
**Innate drives** (survival, curiosity, community, reproduction, status) generate goals
(the gap Project Sid named). **Emotion-aware** decisions: the mood/feeling state biases
which drive wins and the dialogue tone (Sentipolis). *Have: needs + 7 moods + 15 feelings.*

### L6 · Render-Streaming (interest-managed, renderer-agnostic)
The scene-state + layout-chunk + design-directive contracts (all built) are pushed by
**interest management** — only hot cells stream full detail; warm = impostors; cold = stats.
**Three.js, UE5 Pixel-Streaming, and Omniverse all consume the same contracts** — the engine
is swappable; the architecture above is not.

## Gap summary (what to build, in priority)
1. **L2 Cognitive LOD + PIANO** — concurrent modules for hot agents, tiers for the rest.
   *The keystone: makes minions believable AND lets millions run.*
2. **L3 Memory Stream + Reflection + Planning** — the aliveness loop (uses our embeddings).
3. **L4 Event bus + cascades** + **L1 interest manager** — the reactive, observer-aware world.
4. **L5 Drives** + **L3 Shared Culture** — emergent specialisation, governance, memes.
5. **L6 interest-managed streaming** — so any renderer shows it at scale.

## Why this is the right architecture (not Three.js)
- It's **renderer-agnostic** — the same contracts feed Three.js, UE5, or Omniverse.
- It's **how the field actually scales LLM societies to millions** (PIANO + layered +
  invocation-distance memory + interest management) — not a toy.
- It maps onto **what we already have**: chunk partitioning (L1), GPU embeddings (L3),
  scene-state/layout/design contracts (L6), the sim + sagas + moods (L2/L3/L5 substrate).

> The renderer is the last 10%. The other 90% — tiered cognition, memory/reflection,
> the event-driven reactive world, drives, shared culture, interest-managed streaming — is
> the high-level architecture that makes a *living, scaling, sentient* civilisation. Build
> that and any engine renders a world worth watching.
```

## Sources
- Project Sid / PIANO — arXiv:2411.00114 · github.com/altera-al/project-sid
- Scaling LLM agents to millions — MIT Media Lab, AAMAS 2025 · AgentSociety/OASIS · SALLMA · ScaleSim (arXiv:2601.21473)
- Emotion-aware agents — Sentipolis (arXiv:2601.18027)
- MMO interest management / spatial partitioning — UCL LCS; distributed MMORPG architecture
- Generative Agents / Smallville — Stanford (ACM 3586183.3606763)
