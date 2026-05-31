# Underworld — Spec Progress Map

Status of the 150-point design spec (`Sentient_800_prompts.txt`, Sections I & II)
plus the "not-done" build-out that followed. Legend: ✅ done · ◑ partial · ⬜ not started.

Backend test suite: **294 passing**. Everything below is committed to `main`.

---

## Section I — Foundations (#1–100)

### Physical world
| # | Item | Status | Where |
|---|------|--------|-------|
| 1 | 3D world, day/night, weather | ◑ | `web` scene render + live climate now drives day/night temp |
| 3 | Resource distribution (geology) | ✅ | `world/resources.py`, `/substrate/resources` |
| 4 | Material properties | ✅ | `knowledge/materials.py`, `/substrate/materials` |
| 5 | Thermodynamics (live world field) | ✅ | `services/climate.py` temperature + thermal stress |
| 8/9 | EM / optics | ◑ | `physics/engine.py` computable laws; not live fields |
| 11 | Chemistry (reactions, smelting, combustion, pH) | ✅ | `services/chemistry.py`, `/substrate/chemistry/react` |
| 13 | Agriculture (climate-driven soil + crops feed pop) | ✅ | `services/agriculture.py`, `/worlds/{id}/environment` |
| 28 | Plate tectonics + earthquakes (hazard field) | ✅ | `services/tectonics.py` |
| 6/29 | Fluids / water cycle (drought + flood) | ✅ | `services/hydrology.py` |
| 12/34 | Multi-species biology + evolution | ✅ | `services/biology.py`, `/worlds/{id}/species` |
| 14/15 | Geological epochs + fossil record | ✅ | `services/paleontology.py`, `/worlds/{id}/fossils` |
| 10 | Acoustics (sound propagation, comm range) | ✅ | `services/acoustics.py`, `/substrate/acoustics` |
| 7 | Structural integrity | ✅ | `physics/structures.py`, gates invention feasibility |
| 16 | Dynamic time-scaling | ✅ | `services/timescale.py`, `World.sim_year` |
| 28/29/30 | Weather / water cycle / climate zones | ✅ | `services/climate.py`, `/worlds/{id}/climate` |
| 35 | Ecosystem feedback / overhunting | ✅ | `services/ecosystem.py`, `/worlds/{id}/environment` |
| 36 | Pollution | ✅ | `services/pollution.py` |
| 31–33 | Minor cosmetic physics nuances | ⬜ | low priority |

### Minds & discovery
| # | Item | Status | Where |
|---|------|--------|-------|
| 17 | Start with zero knowledge | ✅ | eras + skills from 0 |
| 18–20 | Soul seed, DNA, mutation | ✅ | `genetics/dna.py`, `Soul` |
| 21 | Natural selection | ✅ | trait-weighted death |
| 22 | Discover tech from scratch | ✅ | `services/discovery.py`, `/worlds/{id}/discoveries` |
| 23 | Causal reasoning | ✅ | `services/reasoning.py`, `/minions/{id}/beliefs` |
| 56/57 | Socratic oracle | ✅ | `services/oracle.py`, `/knowledge/oracle` |
| 58 | Trainable ML models | ✅ | `services/mlmodels.py`, `/minions/{id}/train-model` |
| 61 | Structured skill tree | ✅ | `knowledge/skill_tree.py`, `/knowledge/skill-tree` |
| 62/63 | Skill growth; transfer needs proximity/time | ✅ | study/teach |
| 68–70 | Mastery + knowledge tracking | ✅ | `services/mastery.py` |
| 71 | Peer-review replication | ✅ | `agents/reviewer.py` |
| 72 | Scientific fraud + reputation damage | ✅ | `agents/reviewer.py` (fraud:detected) |
| 74/75/77/78/79/80/81 | Peak information + Internet Gateway (master-gated, real Crossref fetch, read-only) | ✅ | `services/gateway.py`, `POST /minions/{id}/gateway` |
| 82/83/84/85 | Empty-dataset puzzles → combine expired patents → in-world patent + draft | ✅ | `services/puzzles.py`, `/worlds/{id}/gaps` |
| 24/59/60/76 | Ruins, scripting sandbox, gateway comprehension mini-test | ⬜ | — |

### Society & economy
| # | Item | Status | Where |
|---|------|--------|-------|
| 39/40 | Trade & economy | ✅ | `services/economy.py`, `/substrate/economy` |
| 45 | Education institutions | ✅ | `services/education.py` |
| 46 | Religion/philosophy | ✅ | `services/religion.py`, `/worlds/{id}/culture` |
| 49/50/52/55 | In-world patents, real DB, scanner, CPC discovery | ✅ | inventions + `tools/patent_search.py` |
| 66/67 | Guilds + competition | ✅ | `agents/guilds.py`, guild standings |
| 91 | History rewind/replay | ✅ | `/worlds/{id}/timeline` |
| 97 | Persistent, always-running | ✅ | scheduler |
| 41 | Government structures (emergent) | ✅ | `services/governance.py`, `/worlds/{id}/society` |
| 42 | Legal systems (emergent) | ✅ | `services/governance.py` |
| 64/65 | Information loss + libraries | ✅ | `services/knowledge_decay.py` |
| 47 | Art, music & literature (evolving styles) | ✅ | `services/art.py`, `/worlds/{id}/art` |
| 43 | War/strife + diplomacy (tension → conflict/treaty) | ✅ | `services/civics.py` |
| 44 | Urban planning (infrastructure eases crowding) | ✅ | `services/civics.py` |
| 48 | Entertainment (era-appropriate festivals) | ✅ | `services/civics.py` |

---

## Section II — Sentience & Society (#101–150)

| # | Item | Status |
|---|------|--------|
| 103–106 | Soul knowledge/temperament, talent-skip reincarnation | ✅ |
| 107–111 | Appraisal-based emotions (morale, burnout, flow) | ✅ |
| 114–117 | Relationships, breeding, skill inheritance | ✅ |
| 122 | Nicknames | ✅ |
| 126 | Tree-of-thought + Monte-Carlo decision planning | ✅ | `services/planning.py` |
| 124/125 | Thoughts + thought-bubble UI | ✅ |
| 128 | Curiosity-driven exploration | ✅ |
| 130–132 | Sense of purpose; fulfilment vs crisis | ✅ |
| 135 | Meditation | ✅ |
| 137/139 | Ascension + ghost guidance | ✅ |
| 142/143 | Fads/fashion/memes | ✅ |
| 150 | Gossip + ostracism | ✅ |
| 118 | Childhood developmental stages | ✅ | `lifecycle.life_stage/capability` |
| 119 | Parenting quality affects capability | ✅ | `Minion.upbringing` set at birth |
| 147 | Circadian rhythm (night work slower) | ✅ | `lifecycle.circadian_factor` |
| 148/149 | Stimulants & addiction | ✅ | `services/substances.py`, `Minion.addiction` |
| 127 | Meta-cognition (reflect on mistakes) | ✅ | `reasoning.reflect` |
| 144–146 | Appearance / body-mod, unlocked by tech | ✅ | `services/appearance.py` |
| 101/138/140 | Per-minion neural net, digital-assistant ascension, ghost medium | ◑/⬜ |

---

## Per-tick simulation pipeline (current)
1. Each Minion: decide (LLM/heuristic, or tree-of-thought planning #126) → act →
   causal-belief update (#23) → periodic meta-cognition (#127)
2. Needs decay + wounds/infection (#32) + stimulants/addiction (#148) + mood appraisal (#107)
3. Invention safety + peer review + replication (#71) + fraud (#72)
4. Projects pipeline
5. Ghost guidance (#139) · guild competition (#67) · education (#45) · knowledge atrophy (#64)
6. Tech discovery (#22) · calendar advance (#16) · culture/religion (#46) · government/law (#41/42)
7. Climate (#5/28-30) · hydrology (#6/29) · agriculture (#13) · tectonics (#28) · biology (#12) ·
   fossils (#14/15) · memes (#142) · pollution (#36) · ecosystem (#35) · art (#47) ·
   civics: infra/conflict/festivals (#43/44/48)
8. Market snapshot every 10 ticks (#39/40)
9. Births / forks / deaths · population snapshot (knowledge, masters)

## What remains
- #8/#9 EM & optics as *live* world fields (exist today as computable laws)
- #101 per-minion neural network (genuine architectural rewrite; minds currently
  run on a shared LLM/heuristic + causal beliefs + planning)
- #138/#140 ascended-as-digital-assistant, ghost medium device
- #24/#59/#60/#76 ruins, scripting sandbox, gateway comprehension mini-test
- #31–33 minor cosmetic physics nuances

All world systems are surfaced in the web "Systems" dashboard + minion drawer.
