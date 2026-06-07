# Underworld Minions — The Honest Full List to reach **Avatar + Movie-quality × Sims 4 × GTA 5**

**What this is:** a no-bullshit inventory of everything needed to take Underworld from what it
is today to the target bar. Every line is tagged with its real status, verified against the
code (file:line from the audit), not aspiration.

**The four pillars (corrected to your brief — *not* Morrowind):**
1. **Avatar** — you *are* a character in the world: walk/drive/interact, first/third-person,
   and Sims-style "possess/direct a minion." Today there is **no player at all** (top-down
   observer + chat only).
2. **Movie / cinematic quality** — photoreal: MetaHuman-grade humans, Lumen GI + Nanite,
   cinematic cameras, film lighting/materials, Movie Render Queue for cutscenes.
3. **Sims 4** — moment-to-moment life: needs→autonomy, **smart objects** (use bed/stove/desk →
   multi-step + object state change), traits→emotions→moodlets, relationship interactions,
   build/buy. ([Motives](https://sims.fandom.com/wiki/Motive), [Traits](https://sims.fandom.com/wiki/Trait_(The_Sims_4)))
4. **GTA 5** — a *living modern city*: server-tracked pedestrians/traffic with avoidance &
   lights, drivable vehicles, ragdoll/physical reactions, police/wanted, radio, reactive crowds.
   ([Euphoria](https://gta.fandom.com/wiki/Euphoria), [features](https://gta.fandom.com/wiki/Grand_Theft_Auto_IV/Features))

**The honest headline.** The simulation **brain** (needs, appraisal-theory emotions, multi-type
memory + reflection, relationships, full life-cycle, market economy, climate, sentience arc) is
real and arguably *deeper* than Sims/GTA. The **body** — an inhabitable, avatar-driven,
photoreal, modern world — is ~80% unbuilt. Minion positions are a deterministic `hash(id,seed)`
(`scene_state.py:47-54`); nothing actually moves through space on the server, there is no
avatar, no collision/physics, no interiors, no inventory, no driving, almost no audio — and the
**art pool is an era-spanning grab-bag, not a coherent modern-photoreal city**.

Status legend: ✅ **HAVE** · 🟡 **PARTIAL** (exists, shallow/render-only) · ❌ **MISSING**.

---

## ★ M. Art Direction & Asset Vibe — the "make the GLBs that vibe" item (NEW, top priority)

Audited the 1,488-GLB catalog: only **~4% read as modern/urban**, ~5% explicitly
medieval/fantasy, the rest era-spanning (guild halls, forges, obelisks, battlements *and*
skyscrapers, hovercars, solar arrays, plasma carbines). It's tuned to the 8-era
stone→quantum science arc — **not** to a coherent Sims-4/GTA-5 contemporary photoreal look.

| Capability | Now | Target | Work to close |
|---|---|---|---|
| Coherent modern-photoreal art set | 🟡 ~4% modern, mixed eras | GTA5/Sims4 contemporary city | curate a **modern-era subset** as the default skin; tag every asset with era+style |
| Photoreal humans | 🟡 1 base mesh tinted by guild (34 character assets) | MetaHuman crowd | **MetaHuman** + modular bodies/faces/outfits; retarget anims |
| Modern building kit (glass towers, condos, retail, civic) | 🟡 5 skyscrapers, 1 modern apartment | dense modern skyline | author/source modern photoreal building GLBs (the civic-gap list feeds this) |
| Modern vehicles (real cars/buses/trucks) | 🟡 81 vehicles, mixed (carts, hovercars) | GTA traffic | curate/author a modern car set with interiors + drivable rigs |
| Urban street dressing (lights, signs, hydrants, bins, crossings, wires) | 🟡 sparse | GTA density | a street-furniture kit — this is what *sells* "a real city" |
| Material/PBR consistency (one lighting model) | 🟡 mixed authorship | film look | standard PBR + Nanite; consistent scale/units; trim sheets |
| Interiors art (rooms/furniture/lighting) | ❌ | Sims/GTA interiors | modular interior kit (the single biggest art lift) |

**Net:** keep the era-spanning library for the "evolution" mode, but stand up a **Modern
Photoreal skin** (curated subset + MetaHuman + modern building/vehicle/street kits) as the
default look. The civic-gap list (`scripts/civic_coverage.py`) is the authoring backlog;
re-skin or replace the medieval/sci-fi outliers so the *default* city reads GTA5/Sims4.

---

## A. World, Space & Streaming
| Capability | Now | Target | Work |
|---|---|---|---|
| Server-authoritative **positions** | ❌ deterministic `hash(id,seed)` (scene_state.py:47-54) | real (x,y,z) that moves | add `pos/vel/heading` to Minion DB; sim writes movement each tick; stream real pos |
| **Pathfinding in the sim** | 🟡 A* in `web/navmesh.ts` only | agents walk real routes | server navmesh; move agents along paths |
| **Collision** in sim | ❌ render-side spheres only | agents/vehicles don't overlap | server collision or UE5 nav-collision authoritative |
| **Chunk streaming** of structures | ✅ `/chunk` φ/fractal; UE5 consumes (just built) | GTA streaming | tune radius/LOD; add interiors to chunks |
| **Interiors** (enter buildings) | ❌ exterior-only | Sims/GTA interiors | interior cells, door transitions, interior kit, camera entry |
| Scale to millions | ✅ cognitive-LOD + aggregate queries (cognition.py:14-17) | — | wire visual impostor LOD (designed, not built) |

## B. Avatar Presence & Camera  *(Pillar 1)*
| Capability | Now | Target | Work |
|---|---|---|---|
| **Player avatar** | ❌ top-down observer + chat | GTA 1st/3rd person; Sims direct-control | UE5 character pawn; possess/spectate toggle |
| First/third-person camera | 🟡 spectator pawn only (UnderworldSpectatorPawn) | full character cam | camera modes: FPS, shoulder, Sims top-down |
| **Direct/possess a minion** | ❌ select + chat only | be/steer a Sim | input→action bridge; issue interactions as the avatar |
| Interact verb ("E": talk/use/enter/pick up) | ❌ | all pillars | context-interaction system |

## C. Locomotion, Physics & Vehicles  *(Pillar 4)*
| Capability | Now | Target | Work |
|---|---|---|---|
| Walk/run/turn locomotion | 🟡 anim *states* only (scene_state.py:68-92) | GTA/Sims motion | UE5 CharacterMovement + AnimBP blendspaces, root motion |
| **Ragdoll / physical reactions** | ❌ no physics body | GTA signature | UE5 PhysicalAnimation + ragdoll + hit reactions |
| Rigid-body props / destruction | 🟡 *building* structural math only (physics_advanced.py) | knockable props | Chaos physics on prop class |
| **Drivable vehicles** | ❌ cosmetic loops (Vehicles.tsx) | GTA driving | Chaos Vehicle pawn; enter/exit; player + AI drivers |
| **Traffic AI** (lights, avoidance, sirens) | ❌ none in sim | GTA living roads | traffic agents on the road graph; signals; yield/avoid |

## D. Agent Daily Life & Smart Objects  *(Pillar 3)*
| Capability | Now | Target | Work |
|---|---|---|---|
| Needs/motives | ✅ hunger/thirst/fatigue/sanity/health → mood (lifecycle.py:179-191) | Sims motives | add hygiene/fun/social/bladder for parity (optional) |
| Emotions & traits | ✅ 17-emotion appraisal + Big Five (emotion.py) | Sims moodlets | surface moodlets in UI; trait→interaction unlocks |
| Autonomy | ✅ mood/need/role-driven selection | Sims autonomy | strong; add player-overridable action queue |
| **Smart objects** (multi-step + object state) | 🟡 render maps action→building+anim; **no object-state feedback** (scene_state.py:119-160) | Sims smart objects | interaction graph: claim→animate→deliver-need→change object state |
| Movement between activities | ❌ teleport-like | walk there | depends on **A** (real positions + pathing) |
| Authored schedules for named NPCs | 🟡 emergent circadian only (lifecycle.py:195) | richer routines | per-NPC schedule data for hero characters |

## E. Items, Inventory & Economy-you-touch  *(Pillars 3+4)*
| Capability | Now | Target | Work |
|---|---|---|---|
| **Inventory / carry / equip** | ❌ tools location-bound (behavior.py:91) | Sims/GTA | inventory table; item defs; pick up/drop/equip; socket attach |
| Money / wages / wallet | 🟡 market *prices* only (economy.py) | Sims economy | per-minion currency; wages; buy/sell |
| Shops you transact with | 🟡 abstract market clearing | Sims/GTA stores | shop inventory + purchase interaction |
| Ownership (homes/objects/cars) | 🟡 home assignment implicit | Sims lots | ownership records; private/lockable space |

## F. Combat, Crime & Law  *(Pillar 4)*
| Capability | Now | Target | Work |
|---|---|---|---|
| Melee / ranged combat | ❌ conflict is morale-only | GTA | attack actions; damage model; hit detection |
| Health as damageable | 🟡 scalar from disease/starvation | combat damage | wire combat→health; downed/death states |
| **Police / wanted system** | ❌ | GTA signature | crime events; witnesses; wanted escalation; responders |
| Crime / justice loop | 🟡 safety-review blocks harmful *inventions* (ethics.py) | law enforcement | criminal acts → arrest → punishment |

## G. Conversation, Quests & Direction  *(Sims/GTA style, not Morrowind)*
| Capability | Now | Target | Work |
|---|---|---|---|
| NPC dialogue (LLM in-character + fallback) | ✅ minion_chat.py | — | already strong |
| Social interaction menu (Sims: chat/flirt/insult/…) | 🟡 15 minion↔minion types (story_engine.py:81) backend only | Sims social UI | expose as player-issuable interactions w/ relationship deltas |
| Quests / objectives / mission markers | 🟡 procedural *sagas* (sagas.py), no player quests | GTA missions / Sims aspirations | quest defs; objectives; markers; rewards; journal |
| Cutscenes / scripted set-pieces | ❌ | movie pillar | Sequencer + Movie Render Queue scenes |

## H. Rendering, Animation & Cinematics  *(Pillar 2)*
| Capability | Now | Target | Work |
|---|---|---|---|
| GLBs render in UE5 | ✅ Interchange import + chunk spawn (just built) | — | verify after engine build |
| **Photoreal humans (MetaHuman)** | 🟡 1 mesh, guild tint | movie crowd | MetaHuman + modular variety + retargeted anims |
| Lumen GI + Nanite | 🟡 enabled (DefaultEngine.ini) | film look | per-asset polish; lighting scenarios; exposure/auto-exposure |
| **Cinematic cameras + Sequencer** | ❌ | movie pillar | camera rigs, DoF, cuts; Movie Render Queue path-traced output |
| Visual impostor LOD | 🟡 bands defined (design_spec.py:73), not built | GTA crowds | HISM/impostors for far minions+buildings |
| Animation sets | 🟡 coarse states | GTA/Sims rich anims | locomotion blendspaces, interaction & gesture anims |

## I. Audio
| Capability | Now | Target | Work |
|---|---|---|---|
| Music | 🟡 loader theme only (loaderMusic.ts) | GTA radio / Sims score | dynamic music system; zones; states |
| Ambient zones + SFX | 🟡 defined in design_spec.py:78-130, **not wired** | GTA ambience | wire ambient loops + SFX per district/action in UE5 |
| **Dialogue VO / TTS** | ❌ text only | movie/GTA VO | TTS on the GPU box (per-guild voices) from the LLM line |
| Radio (GTA) | ❌ | GTA flavour | stations + tracks (optional) |
| 3D spatial audio in UE5 | ❌ | all | attenuation/occlusion in engine |

## J. Build / Construction (Sims build-buy)
| Capability | Now | Target | Work |
|---|---|---|---|
| Procedural city (φ/fractal + needs) | ✅ world_layout.py | — | strong |
| Named civic buildings mapped + gaps reported | ✅ civic_assets.py / civic_coverage.py | — | author the 11 stand-in types |
| Player place/move/delete + furnish | ❌ layout deterministic | Sims build-buy | runtime add/remove; grid snap; **persist edits** |

## K. Persistence, Save & Sessions
| Capability | Now | Target | Work |
|---|---|---|---|
| World/agent state persists (24 tables) | ✅ survives restart | — | strong |
| **Player edits / positions persist** | ❌ positions not stored | Sims saves | depends on A + J |
| Per-player session/input (multi-viewer) | 🟡 Pixel Streaming = shared *view* | per-player avatar | session manager + input routing per stream |

## L. Production & Infra (the render path)
| Capability | Now | Target | Work |
|---|---|---|---|
| UE5 5.5 install + build | 🟡 **building now** (~1845/4247, ~2h11m) | — | finish → auto-import GLBs → package Linux |
| Auto GLB import + Linux package | ✅ scripted (install-ue5.sh→run-import.sh→BuildCookRun) | — | runs after build |
| Pixel Streaming dual-GPU (Vast 2×4090) | ✅ scripted (vast-worker/) | — | run after package |
| Hostinger control plane (nginx/TURN/orchestrator) | ✅ scripted (hostinger/) | — | deploy when render box ready |

---

## Honest verdict & build order

**Brain: deeper than Sims/GTA already. Body: missing.** To *feel* like an avatar-driven,
movie-quality Sims4 × GTA5 world, build the inhabitable layer in this order — each phase is a
playable milestone:

**P0 — Make it a place, not a diagram** *(unblocks everything)*
1. Server-tracked positions + velocity on Minion (replace the hash). → **A**
2. Server/UE5 navmesh + real walking between activities. → **A, D**
3. Finish UE5 build → import GLBs → first Pixel-Streamed walkable city. → **L**

**P1 — Put you in it (Avatar + Movie, Pillars 1+2)**
4. Player avatar + first/third-person camera + interact verb. → **B**
5. Locomotion + ragdoll/hit reactions. → **C**
6. MetaHuman photoreal humans + cinematic cameras/Sequencer. → **H**

**P2 — Modern photoreal skin (your "GLBs that vibe", Pillar art)**
7. Curate the modern-era subset as default; tag assets by era+style. → **M**
8. Modern building + vehicle + street-furniture kits; close civic-gap authoring. → **M, J**
9. Material/PBR/Nanite consistency pass for the film look. → **M, H**

**P3 — Make it a living city (GTA 5, Pillar 4)**
10. Drivable vehicles + traffic AI on the road graph. → **C**
11. Police/wanted + crime/justice; faction conflict. → **F**
12. Radio + wired ambient/SFX + 3D spatial audio. → **I**

**P4 — Make it interactive life (Sims 4, Pillar 3)**
13. Smart objects: claim→animate→satisfy-need→change object state. → **D**
14. Inventory + equip + money/wages + shops. → **E**
15. Interiors (enter buildings; modular interior kit). → **A, H**
16. Build/buy + persistent player edits. → **J, K**

**P5 — Sing**
17. Quests/objectives/markers/journal (LLM-hybrid). → **G**
18. Dialogue TTS voices; dynamic music. → **I**
19. Impostor LOD; animation & outfit richness; Movie Render Queue cinematics. → **H**

Anything tagged ❌/🟡 is a real task; nothing is hidden behind "done." `scripts/civic_coverage.py`
prints the live asset-gap list. **The single keystone is P0.1 — real server-tracked movement —
because the avatar, traffic, smart-object walking, and physics all depend on it.**
