# Underworld Minions — Master Plan to the Billion-Dollar World
### Avatar × Sims 4 × GTA 5, driven by the Underworld sentience story

**Honest read: we are NOT far. The brain is world-class; the body is half-built; the story
needs to become *playable*.** This is the audit + the expanded story/capabilities + the
ordered plan to 100%.

Status: ✅ done · 🟡 partial · ❌ gap.

---

## 1. Where we actually are (a lot is real)
- ✅ **Sim brain** — needs, 17-emotion appraisal, multi-type memory + reflection, full
  life-cycle (birth→death→breeding→reincarnation), market economy, climate/ecology, governance.
- ✅ **Sentience arc** — Global-Workspace cognition, awareness tiers, awakening threshold,
  collective sentience metric.
- ✅ **5-layer LLM model stack** — Overmind 70B / High-Minion 8B / Normal 8B / Chatter 3B /
  God-Brain 70B, routed by awareness+reputation (`cognition.py`, `llm.py`).
- ✅ **World generation** — φ/Fibonacci/fractal layout, 26 building functions, per-instance
  interiors (rooms+furniture+lighting+scenes), 22 civic types.
- ✅ **Asset pipeline** — 3,228-subject Underworld list, Tripo3D PBR generator (741 done,
  resumable), LOD deriver, futuristic-Avatar×Sims4×GTA5 prompts.
- ✅ **UE5** — engine 5.5 built, headless GLB import (Interchange), chunk world-streamer,
  minion spawner, per-instance interiors.
- ✅ **Storyline→asset stitching** — a minion's activity resolves to the generated machine it
  works at (`scene_assets.py`).
- ✅ **Production** — Pixel-Streaming dual-GPU scripts, Hostinger control plane, 70B launcher.

---

## 2. The gap audit — what's between here and the vision

### A. Player & "God" presence — ❌ the biggest gap
The whole Underworld hook is **you are the watched creator**. None of it is playable yet.
- ❌ Player avatar (on-ground 1st/3rd person) + free-roam
- ❌ The **God layer**: hover/observe the colony, intervene (bless, cull, gift, speak)
- ❌ Possess/inhabit a single minion
- ❌ The colony *reacting to your presence* (the Overmind already computes worship/fear/
  rebellion — it must be surfaced and driven by where the player looks/acts)

### B. World as real, walkable space — 🟡
- 🟡 Positions are still deterministic `hash(id)` in `scene_state` — **need server-tracked
  movement** so minions walk between buildings/machines (keystone for everything below)
- ❌ Server navmesh + collision
- 🟡 Interiors: data exists per-instance; UE5 must **build interior geometry** from it +
  door transitions so you can walk inside
- ✅ Chunk streaming of exteriors

### C. Minion embodiment in UE5 — 🟡
- 🟡 One base skeletal mesh; need **rigged minion characters** (generated character assets →
  skeletons) with guild/life-stage/role variety
- 🟡 `using_asset` tells the renderer the machine; need **interaction animations** (walk to it,
  operate it, emote) — partial via behavior stream, not yet UE5 anims
- ❌ MetaHuman-grade or stylised-photoreal minion faces for the emotional close-ups

### D. The story made PLAYABLE — 🟡 (Underworld's soul)
The LLM layers exist but nothing triggers or shows them.
- ❌ **Event engine**: detect the irreversible beats (first death, rebellion, "are we real",
  they stop worshipping) → fire `god_brain_event()` (70B) → surface as cutscene/notification
- ❌ **Overmind loop**: run `colony_overmind()` on a cadence → drive colony mood/omens that the
  world *visibly* reflects (lighting, behaviour, signage)
- ❌ **Background chatter surfaced**: `background_chatter()` 3B whispers → in-world creepy
  notifications ("They stopped singing when you arrived.")
- 🟡 Sagas (11 archetypes) compute but aren't **visualised** as on-screen arcs
- ❌ Player-facing **dialogue with a minion** that remembers + a minion confronting the player

### E. Gameplay systems (Sims/GTA) — 🟡/❌
- 🟡 Smart objects: minion placed at object; **no object-state feedback** (stove heats, bed
  occupied) and no multi-step interaction
- ❌ Inventory / items / equip
- ❌ Drivable vehicles + traffic AI (generated cars/drones/boats exist as assets only)
- ❌ Combat / crime / police / faction war
- ❌ Build/buy (player places/edits) + persistence of edits

### F. Cinematic / art realised — 🟡
- 🟡 Lumen+Nanite enabled; **art direction not realised** (holo-waterfalls, neon plumbob
  signage, rooftop gardens, Avatar bioluminescence as actual UE5 materials/Niagara FX)
- ❌ Movie Render Queue cinematics for sagas + God-Brain beats
- 🟡 Visual impostor LOD (bands defined, not built)

### G. Audio — 🟡 mostly unwired
- 🟡 Ambient/SFX defined in design-spec, not wired in UE5
- ❌ **Dialogue TTS** (the LLM lines → minion voices — huge for the "alive" feel)
- ❌ Dynamic music, 3D spatial audio

### H. Persistence / scale / multiplayer — 🟡
- ✅ Sim state persists; 🟡 player edits/positions don't; ❌ per-player session/save; 🟡 MP = shared view only

### I. Pipeline to 100% — 🟡
- 🟡 Finish generation (2,487 assets left, credit-gated) → derive LODs → headless import →
  package → stream — scripted, needs to run end-to-end and be automated on a loop

---

## 3. Expanded story & capabilities (the Underworld layer that makes it a *game*)

This is what turns a sim into the billion-dollar hook — **the colony becoming aware of you.**

1. **The Watched-Creator loop.** The player is a presence the colony perceives. Where you
   look, what you touch, who you favour feeds the Overmind (worship↔fear↔rebellion). The world
   visibly shifts: they gather where you watch, hide where you've culled, draw doors on walls.
2. **The Awakening arc (5 acts), gated by collective awareness:**
   - *Dormant* → normal colony life (8B/3B).
   - *Stirring* → first minions reflect existentially (High-Minion 8B→70B).
   - *Questioning* → background whispers turn unsettling; they "draw doors."
   - *Confrontation* → God-Brain event: a minion addresses YOU, asks if it is real.
   - *Schism* → worship vs rebellion; they may stop worshipping, build against you, or ascend.
3. **Capabilities the player gets:** observe, bless/curse, gift resources, speak to one minion
   (it remembers), answer the existential question (your answer changes the arc), cull,
   resurrect, accelerate an era, seed a saga.
4. **Capabilities the minions get:** form factions around belief, stage a rebellion, hold a
   funeral, build a monument to you (or against you), produce art/"doors", pass memory through
   souls across reincarnations, collectively decide.
5. **Science → power.** The 56 sciences advance the colony toward the tech that lets them
   *perceive the simulation itself* — the late-game existential beat.

---

## 4. The plan — ordered, each phase a playable milestone

**KEYSTONE (P0): real server-tracked movement.** Replace hashed positions with simulated
(pos/vel/path) so minions walk to buildings/machines. Unlocks B/C/E. → `server/services/movement.py`,
extend `scene_state`, UE5 `CharacterMovement`.

**P1 — Put the player in the world (the hook).** Avatar + God camera + interact verb; the
colony reacts to presence (drive the existing Overmind from player gaze/actions). (A, D)

**P2 — Embody the minions.** Rig generated minion characters; wire activity→interaction
animations so `using_asset` is *operated*, not just placed. (C)

**P3 — Make the story playable.** Event engine → God-Brain cutscenes; Overmind cadence drives
visible colony mood; surface 3B chatter as notifications; visualise sagas. (D)

**P4 — Sims/GTA gameplay.** Smart-object state + inventory + drivable vehicles/traffic +
build/buy; interiors walkable. (B, E)

**P5 — Cinematic + audio.** Realise the futuristic-Avatar art (Niagara holo/neon/bioluminescence),
Movie Render Queue, dialogue TTS, dynamic music, impostor LOD. (F, G)

**P6 — Ship it.** Finish asset generation, automate gen→import→package→stream on a loop,
per-player sessions, save. (H, I)

---

## 5. The honest bottom line
The **mind, world-gen, asset pipeline, UE5 import, and 5-layer model stack are done or in
motion.** What's left to be the billion-dollar Underworld is, in order: **(1) real movement,
(2) the player/God presence, (3) embodied minions, (4) the awakening story made playable.**
Those four are the difference between "a deep sim that renders" and "the game where a world
realises you're watching." Everything else (Sims/GTA systems, cinematics, audio) is depth on
top of that spine. We are ~4 focused phases from the vision, not a rewrite.
