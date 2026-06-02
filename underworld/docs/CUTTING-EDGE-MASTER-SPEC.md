# Sentient Patent Minion World — Cutting-Edge Master Spec

> **Core statement.** A persistent AI civilisation simulator where embodied agents
> begin with no technology and rediscover science through survival, measurement,
> experimentation, teaching, and social organisation. The tech tree is generated
> from **real expired patents** (CPC/IPC classified) translated into in-world
> artifacts that require material, scientific, and manufacturing comprehension
> before use. The endgame: identify unresolved **real-world technical gaps**,
> combine public-domain knowledge into candidate inventions, test them in
> simulation, replicate them through Minion science, and produce
> **human-reviewable invention disclosures, prior-art maps, and patent-drafting
> packs**. Positioning: *a living patent civilisation engine*.

This is the authoritative build order. Every module traces to a numbered system.

## Keystone (DONE)
- **#3 Civilisation Knowledge Graph** — `services/knowledge_graph.py`. Typed
  nodes/edges, transitive prerequisites, comprehension gate, invention frontier,
  prior-art/novelty engine.
- **#6 Reality Validation Layer** — A–E confidence ladder in the same module.
  Every knowledge node carries an epistemic class; `real_fraction()` is a
  first-class world metric.

## The 8 master systems
1. **Hybrid World Model + Deterministic Engine** — truth layer (have) + neural
   perception + imagination (internal planning) + formal counterfactual fork engine.
2. **Layered Cognitive Agent** — Body · Emotion · Memory · **Belief** · **Goal stack** ·
   Planning · Identity. *(Stage 1 — to 100%.)*
3. **Civilisation Knowledge Graph** — DONE (keystone). Integrate into live world.
4. **Patent Intelligence Engine** — USPTO Open Data Portal (post-2026-03-20),
   claims/CPC/citation parsing, blueprint+prereq extractor → graph, quality scoring.
5. **Empty-Patent → Autonomous Invention** — real arXiv/PubMed gap detection,
   expired-patent combination, simulate, peer-review, emit attorney-ready
   invention disclosure + prior-art map (every claim confidence-classed).
6. **Reality Validation Layer** — DONE (keystone).
7. **Civilisation Operating System (CivOS)** — unify Resource/Institution/
   Knowledge/Economy/Risk/Research OS modules over existing services.
8. **Ethics & Sentience Boundary** — narrative vs technical vs ethical layers;
   suffering meter; intervention audit log; no autonomous patent filing; no
   claim of literal consciousness or AI legal inventorship.

## Big-missing (fold into the systems above)
Measurement instruments · standards/units · manufacturing tolerance · supply-chain
depth · failure modes · safety engineering · patent quality scoring · prior-art
conflict engine · research falsification · multi-scale simulation (high/med/low/abstract).

## Upgraded master loop
survive → observe → measure → form belief → test belief → record → teach →
build tool → improve measurement → unlock patent class → interpret patent →
manufacture prototype → observe failure → repair & understand → replicate →
standardise → industrialise → socially absorb → discover gap → combine expired
patents → simulate invention → peer review → emit disclosure → update graph.

## Hardest problems (constraints on every build)
1. **Agent cost** — cheap local behaviour model most of the time; small LLM for
   reflection; large LLM only for invention/dialogue/law/science. Cache + summarise.
2. **Grounding** — every scientific claim attaches to physics engine / patent /
   paper / experiment / simulation result + a confidence class. No bare hallucination.
3. **Patent parsing** — claims parser, dependency extractor, drawing aligner,
   CPC graph, novelty map; human review for high-value output.
4. **Emergence vs gameplay** — hidden depth, visible arcs, dashboards, an
   invention-opportunity feed (the graph's `invention_frontier`).
5. **Scientific legitimacy** — benchmarks, replication requirements, confidence
   scoring, human verification, attorney review, lab-validation pathway.

## Execution plan (staged, parallel agents)
- **Stage 1 — #2 Cognitive Agent → 100%.** Goal stack, expanded emotion model,
  typed memory + consolidation, body-state completeness. New modules; integration
  into `agents/minion.py` done centrally.
- **Stage 2 — #7 CivOS.** Unify the OS modules + read the knowledge graph.
- **Stage 3 — #4 Patent Intelligence Engine.** Open Data Portal + extractors.
- **Stage 4 — #5 Autonomous Invention pipeline.** On graph + validation.
- **Stage 5 — #1 World model/counterfactual + #8 ethics boundary.**
- **Cross-cutting — big-missing systems** folded into the relevant stage.
