# Sentient Patent Minion World — 2026+ Frontier Spec → Build Map

Authoritative production spec: a civilisation-scale **autonomous science engine**,
not a game tech tree. Comparables: A-Lab closed-loop synthesis, Toronto/CMU/
Liverpool self-driving labs, 2026 lab-operating-system / experiment-as-code work.

**Central law:** `WorldTruth ≠ MinionBelief`. The world holds hidden true
physics/chemistry/biology/materials; Minions only earn knowledge through
observe → measure → believe → hypothesise → experiment → fail → replicate →
teach → institutionalise → manufacture → patent → improve.

## 18 engines → current code status (honest)
| # | Engine | Status | Where |
|---|--------|--------|-------|
| 1 | Digital Twin Kernel (WorldTruth/event-source) | ◑ | `discovery_engine.MaterialTruth` (truth split done); full event store deferred |
| 3 | ECS sim core | ◑ | current tick loop is OO not ECS; deterministic RNG ✅ |
| 4 | World Generation (patent-seeded terrain) | ✅ | `world/seed.py` 128² heightmap from CPC |
| 5 | Multiphysics orchestrator (fidelity tiers) | ◑ | `physics/` has tiered solvers; dispatcher deferred |
| 6 | **Materials Truth Engine** | ✅ | `knowledge/materials.py` + `discovery_engine.py` (hidden→measured) |
| 7 | Chemistry/reaction | ◑ | `services/chemistry.py` |
| 8 | Biology/genetics/disease | ✅ | `services/biology.py` + `genetics/dna.py` + `virtual_cell.py` |
| 9 | Minion Cognition | ✅ | body/emotion/memory/belief(`CausalBelief`)/goal/planning/identity — 100% |
| 10 | **Observation & Experiment** | ✅ | `discovery_engine.py` (instrumented obs, replication, acceptance bar) |
| 11 | Instruments & Metrology | ✅ | `services/instruments.py` (precision/calibration) |
| 12 | Society & Institution | ◑ | `civics/governance/civos`; full institution schema deferred |
| 13 | Self-Driving Lab | ◑ | `invention_pipeline.py` is the closed-loop seed; experiment-as-code deferred |
| 14 | Patent Intelligence | ✅ | `tools/patent_intelligence.py` + `open_data_portal.py` |
| 15 | Knowledge Graph | ✅ | `services/knowledge_graph.py` (typed nodes/edges, prereqs, novelty) |
| 16 | **V&V / UQ** | ✅ | `discovery_engine` (UQ on every obs) + `knowledge_graph` A–E classes |
| 17 | Technology Transfer | ✅ | `invention_pipeline.invention_disclosure` (attorney pack) |
| 18 | Player Console | ✅ | 3D web app + dashboards |

Built-but-spec-adjacent: instruments, standards, manufacturing, failure_modes,
ethics, world_model (counterfactual), civos, virtual_cell.

## The discovery keystone (DONE — spec §35 MVP victory mechanic)
`services/discovery_engine.py` enforces the central law in code:
- `MaterialTruth` — hidden true properties a Minion never reads.
- `measure_property` — instrumented reading with instrument precision + skill
  error + contamination; wrong instrument → no data; deterministic & auditable.
- `update_belief` — inverse-variance-weighted estimate; confidence from
  replication × agreement (a single reading is never a discovery).
- `discover_property` / `is_discovered` — a Minion *earns* "copper conducts"
  through repeated agreeing measurements past the acceptance bar.
- `belief_error` — admin/player-only lens onto truth-vs-belief.
9 tests. This is the engine §39 says everything else grows from.

## Phase roadmap (spec §36) — next tickets, ruthless MVP cut "Fire → Circuit"
- **P1 Deterministic core / event store** — wrap state changes as `WorldEvent`
  (event-sourcing) for replay/audit. *(kernel ◑→✅)*
- **P2 Belief split** — DONE in `discovery_engine`; next: persist Beliefs as DB
  rows + emit `MATERIAL_OBSERVED`/`MATERIAL_TESTED` events; wire into the tick.
- **P3 Survival/fire/heat** — temperature grid + combustion discovery chain.
- **P4 Tools/materials** — hardness/cutting/melting → simple metallurgy.
- **P5 Electricity** — conductor/insulator discovery (uses `discovery_engine`
  CONDUCTIVITY) → crude battery/wire/lamp + DC circuit solver.
- **P6 Instruments** — measurement accuracy gates discovery quality (engine ✅,
  wire instrument-build progression).
- **P7 Institutions** — discovery survives inventor death via record+teach+replicate.
- **P8 Patent engine MVP** — comprehension gate blocks build until prereqs met
  (graph + patent_intelligence ✅; wire the gate to materialisation).
- **P9 Self-driving lab MVP** — experiment-as-code protocol + active learning loop.
- **P10 Advanced labs** / **P11 Peak Information + Gateway**.

## Frontier layer (spec §37) — invariants for every build
experiment-as-code · provenance-first (who/where/sample/instrument/calibration/
uncertainty/reviewer/replicated) · surrogate models · fraud & error · manufacturing
reality · safety & ethics gates (`services/ethics.py` enforced).

## Hard rules (spec §2) already enforced in code
WorldTruth≠Belief ✅ · no measurement→no science (`measure_property` returns None
without the right instrument) ✅ · replication required (`is_discovered`) ✅ · UQ on
every claim ✅ · no AI answer = truth (A–E classes, candidate-only disclosures) ✅ ·
no autonomous patent filing / no AI inventor (`ethics.py`) ✅.
