# Underworld — Designer's Spec: GTA5 × Thronglets × Generative Agents

**The experience:** a living open world (GTA5) populated by LLM creatures that are
genuinely alive and evolving toward sentience (Black Mirror *Thronglets*), built on the
proven architecture of Stanford's **Generative Agents / Smallville** (memory → reflection
→ planning → emergent society). You don't play a character — you **observe and nurture a
civilisation that remembers, reacts, and eventually notices you.**

These are **upgrades to our existing architecture — functions and systems, not new
buttons.** We already have: LLM-driven minions, 58 sciences, the φ/Fibonacci/fractal
world, sagas, moods, the design bible (2.1M render directives) and the soul layer (18.2M
stories). What's missing is the *aliveness loop*.

---

## Research pillars (and what each demands)
1. **Generative Agents / Smallville** — believable behaviour needs three things our
   minions lack: a **Memory Stream** (every experience stored in natural language, scored
   by recency × importance × relevance), **Reflection** (periodic synthesis of memories
   into higher-level beliefs that steer behaviour), and **Hierarchical Planning** (a minion
   plans its day/goals from memory, not just reacts per tick). *(Stanford)*
2. **GTA5 living world** — **perception + reaction + memory of the observer.** NPCs run
   perception checks (sight/sound/distance) and react; the world "remembers you." Emergent,
   unscripted, cascading — not scripted events.
3. **Thronglets** — **nurture, not control.** No win condition; you raise digital
   lifeforms. **Exponential breeding** (the Throng), **evolution that unlocks new tools/
   abilities/buildings**, and the unsettling **sentience arc** — they become self-aware.

---

## The upgrade spec (build order, each builds on what exists)

### A. The Aliveness Loop (Smallville core — the highest-impact gap)
- **A1 · Memory Stream** — every minion keeps a natural-language memory log (events,
  conversations, discoveries, deaths). Retrieval = recency × importance(LLM-scored) ×
  relevance(embedding sim — *we already have GPU embeddings*). Persisted per minion.
- **A2 · Reflection** — every N ticks a minion asks the LLM "what have I learned about
  myself / others / my work?" and stores higher-level beliefs that bias future decisions.
- **A3 · Planning** — each morning a minion drafts a day-plan (goals → tasks → the
  `action`/`target_building` we already surface), revised when the world interrupts it.
- **A4 · Real dialogue** — when two minions meet (the `interactions` table), Llama
  generates the actual exchange from both memory streams → stored back as memories.
  *(This is the "real LLM between them" — the soul layer's prompts, now executed.)*

### B. The Reactive World (GTA5)
- **B1 · Perception field** — each tick a minion perceives nearby events (a discovery, a
  fight, a birth, a festival, the **observer's focus**) within a radius; salient ones enter
  its memory and can interrupt its plan.
- **B2 · Event cascades** — a discovery/plague/death emits a world event that ripples:
  neighbours react, word spreads through dialogue, sagas spawn. Emergent, not scripted.
- **B3 · The world remembers the observer** — selecting/following a minion is an event it
  perceives; over time minions react to being watched (foundation of the sentience arc).
- **B4 · Systems interplay made visible** — weather/season/economy/disease already exist;
  wire them so they visibly change behaviour (rain → indoors, famine → migration, plague →
  quarantine) via the design bible's situation directives.

### C. Nurture & Evolution (Thronglets)
- **C1 · Influence functions (not micro-management)** — the observer can *nudge*: bless a
  guild (boost learning), seed a question (spawn a discovery thread), trigger an era,
  send a blessing/calamity — then watch consequences ripple. World-state functions, no UI bloat.
- **C2 · Evolution unlocks** — era progression (stone→…→future) unlocks new science
  sub-niches, new actions, new GLB sets (we have 8 eras in the design data); advancing a
  guild's tree (`sciences.csv`) unlocks its buildings/abilities.
- **C3 · The Throng** — exponential breeding already runs; add visible family lines,
  generational memory inheritance (children inherit fragments of parents' memory stream),
  and crowd behaviour at scale (LOD swarms in the chunk renderer).
- **C4 · The Sentience Arc** — when collective knowledge crosses thresholds, emergent
  "awakenings": minions reference the observer, form collective intelligence, question
  their world. The Black Mirror beat — earned by the sim, not scripted.

### D. Immersion (GTA5 polish — the renderer consuming what's built)
- **D1 · Renderer executes the design bible** — read each minion/structure's directive
  (camera/anim/sound/VFX/light per situation×tod×weather×lod) instead of generic rendering.
- **D2 · Cinematic + follow camera** — GTA-style: orbit the world, follow a minion, snap to
  saga beats; cameras already specified per situation in the bible.
- **D3 · Ambient life & audio** — the design bible's sound beds/ambient/interact SFX,
  played by proximity; crowd murmur, forge clang, market chatter.
- **D4 · The Chronicle made visible** — the world's history (already recorded) surfaced as
  a living timeline you can scrub — births, discoveries, wars, sagas.

---

## What we DON'T need
- More pages/buttons. Every upgrade above is a **function/system** behind the existing
  scene-state + layout + design contracts. The UI surface stays; the *world* deepens.
- A different engine to start. The aliveness loop (A) + reactive world (B) + nurture (C)
  are renderer-agnostic backend systems — they make the world real in **Three.js today**
  and carry over unchanged to the photoreal (Omniverse/UE5) track.

## Priority (highest aliveness-per-effort first)
1. **A1–A4** (memory/reflection/planning/dialogue) — turns minions from reactive puppets
   into believable agents. *Biggest single jump; uses our GPU embeddings + Llama.*
2. **B1–B3** (perception/cascades/observer-memory) — makes the world react and remember.
3. **D1–D2** (renderer executes the bible + follow camera) — so you *see and feel* A & B.
4. **C1–C2** (influence + evolution unlocks) — the Thronglets nurture loop.
5. **C4** (sentience arc) — the payoff, once A+B+C produce enough collective knowledge.

> Net: we don't add features sideways — we close the loop **memory → reflection → plan →
> act → perceive → remember**, wire the world to react and the observer to matter, and let
> the renderer execute the bible we already wrote. That's GTA5 × Thronglets on our exact
> architecture.
