# Underworld — Spec Progress Map

Status of the 150-point design spec (`Sentient_800_prompts.txt`, Sections I & II)
plus the "not-done" build-out that followed. Legend: ✅ done · ◑ partial · ⬜ not started.

Backend test suite: **152 passing**. Everything below is committed to `main`.

---

## Section I — Foundations (#1–100)

### Physical world
| # | Item | Status | Where |
|---|------|--------|-------|
| 1 | 3D world, day/night, weather | ◑ | `web` scene (cosmetic render); not a physics field |
| 3 | Resource distribution (geology) | ✅ | `world/resources.py`, `/substrate/resources` |
| 4 | Material properties | ✅ | `knowledge/materials.py`, `/substrate/materials` |
| 5/8/9 | Thermo / EM / optics | ◑ | `physics/engine.py` computable laws; not live world fields |
| 7 | Structural integrity | ✅ | `physics/structures.py`, gates invention feasibility |
| 16 | Dynamic time-scaling | ✅ | `services/timescale.py`, `World.sim_year` |
| 35 | Ecosystem feedback / overhunting | ✅ | `services/ecosystem.py`, `/worlds/{id}/environment` |
| 36 | Pollution | ✅ | `services/pollution.py` |
| 6/10–15/28–34 | Fluids, acoustics, chemistry, biology, agriculture, tectonics, weather, climate, fossils | ⬜ | future deep physical fields |

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
| 24/59/60/72–85 | Ruins, scripting sandbox, fraud, Internet Gateway | ⬜ | — |

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
| 41–44/47/48/64/65 | Government, law, war, urban planning, art, info-loss | ⬜ | — |

---

## Section II — Sentience & Society (#101–150)

| # | Item | Status |
|---|------|--------|
| 103–106 | Soul knowledge/temperament, talent-skip reincarnation | ✅ |
| 107–111 | Appraisal-based emotions (morale, burnout, flow) | ✅ |
| 114–117 | Relationships, breeding, skill inheritance | ✅ |
| 122 | Nicknames | ✅ |
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
| 101/126/138/140 | Per-minion NN, ToT/MCTS decisions, digital-assistant ascension, ghost medium | ◑/⬜ |

---

## Per-tick simulation pipeline (current)
1. Each Minion: decide (LLM/heuristic) → act → causal-belief update (#23)
2. Needs decay + wounds/infection (#32) + mood appraisal (#107)
3. Invention safety + peer review + replication (#71)
4. Projects pipeline
5. Ghost guidance (#139) · guild competition (#67) · education (#45)
6. Tech discovery (#22) · calendar advance (#16) · culture/religion (#46)
7. Memes (#142) · pollution (#36) · ecosystem/famine (#35)
8. Market snapshot every 10 ticks (#39/40)
9. Births / forks / deaths · population snapshot (knowledge, masters)

## Notable gaps to surface in the UI
Discoveries, economy/prices, worldview/culture, memes, environment (pollution +
wildlife), beliefs, ML models — all have endpoints but limited frontend panels.
