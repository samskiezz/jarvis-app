# Underworld Core — Per-File Coverage

Scope: every Python file under `underworld/server/` EXCEPT `methods_*.py`, `sim_methods.py`,
`field_science.py`, `methods_registry.py` (covered separately), plus top-level `underworld/*.py`.
Read in full, line by line. WIRED = reachable from a registered route, the simulation engine
(`services/simulation.py`), or the minion/reviewer agents (directly or transitively). DORMANT =
only referenced by tests / comments / docstrings, never imported by live app code.

Routers registered in `main.py`: auth, worlds, minions, patents, inventions, guilds, safety,
knowledge, physics, projects, substrate, science.

---

## Top-level `underworld/*.py`

### underworld/__init__.py (0 lines)
- purpose: empty package marker.
- key: none.
- DORMANT (package init; no code).
- **PROOF-OF-READ:** file is empty (0 lines) — no line past 60% exists.

### underworld/observe_minds.py (90 lines)
- purpose: standalone demo script — spawn a world, run ticks with real LLM minds, print who each minion is and what it freely chose.
- key functions: `latest_thought(s, minion_id)` — fetch a minion's most recent thought memory; `main()` — seed world via `factory`, advance with `use_llm=True`, print living individuals + freely-chosen actions + memory/discovery counts.
- DORMANT (CLI script run via `python underworld/observe_minds.py`; not imported by app).
- **PROOF L70:** `                  f"crea={m.creativity:.2f} intel={m.intelligence:.2f} open={m.openness:.2f}")`

### underworld/prove_llm.py (87 lines)
- purpose: proof script #2 — run a world with real Kimi K2 reasoning and query the DB for inventions minions proposed.
- key functions: `cnt(s, model, **f)` — generic row counter; `main()` — create A61K world, advance 6 ticks with `use_llm=True`, print invention/review/discovery counts and sample invention rows.
- DORMANT (CLI proof script).
- **PROOF L60:** `    print(f"  {TICKS} ticks in {time.time()-t0:.1f}s")`

### underworld/prove_underworld.py (107 lines)
- purpose: proof script — spawn an H02J world, run 20 offline (no-LLM) ticks, print real DB counts.
- key functions: `n(s, model, **filt)` — counter; `main()` — seed 50-pool world, advance 20 ticks `use_llm=False`, print minion/invention/discovery/event/memory counts + sample inventions + event-type histogram.
- DORMANT (CLI proof script; forces offline heuristic minds).
- **PROOF L67:** `        reports = await advance_world(s, world, ticks=20, use_llm=False)`

---

## Core infrastructure

### underworld/server/__init__.py (0 lines)
- purpose: empty package marker.
- WIRED (package root; imported implicitly).
- **PROOF:** file is empty (0 lines).

### underworld/server/main.py (127 lines)
- purpose: FastAPI app entry — lifespan (logging, LLM warn, DB init, KB seed, scheduler autostart), CORS, router registration, optional React SPA static serving.
- key: `lifespan(_app)` — startup/shutdown context; `create_app()` — builds the FastAPI app, mounts 12 routers + `/healthz` + SPA fallback; module-level `app = create_app()`.
- WIRED (the application entrypoint).
- **PROOF L93:** `    if (_WEB_DIST / "index.html").exists():`

### underworld/server/config.py (120 lines)
- purpose: pydantic-settings `Settings` loaded from `UNDERWORLD_*` env — auth key, CORS, DB path, Kimi/LLM provider config, patent API keys, CPC safety allow/block lists, simulation knobs.
- key: `Settings` (all config fields + `database_url` property); `get_settings()` — lru-cached accessor.
- WIRED (imported across the app).
- **PROOF L103:** `    sim_population_floor_pct: float = Field(`

### underworld/server/auth.py (13 lines)
- purpose: bearer-token auth dependency.
- key: `require_bearer(authorization)` — validates `Authorization: Bearer <api_key>` against settings, raises 401 otherwise.
- WIRED (Depends on every protected route).
- **PROOF L11:** `    if token != settings.api_key:`

### underworld/server/logging_setup.py (32 lines)
- purpose: structlog + stdlib logging configuration.
- key: `configure_logging(level)` — sets up console renderer + timestamps; `get_logger(name)` — bound logger accessor.
- WIRED (called from main lifespan; used across modules).
- **PROOF L25:** `        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),`

---

## db/

### underworld/server/db/__init__.py (0 lines)
- purpose: empty package marker.
- WIRED.
- **PROOF:** file is empty (0 lines).

### underworld/server/db/session.py (93 lines)
- purpose: async SQLAlchemy engine/sessionmaker + FastAPI session dependency + in-line SQLite migrations.
- key: `_ensure_engine()`; `init_db()` — create_all + backfill `worlds.era`/`scanner_progress`; `_ensure_column()`; `dispose()`; `session_scope()` (ctx-mgr for sim/scripts); `get_session()` (FastAPI dep); `_reset_for_tests()`.
- WIRED (DB access layer for the whole app).
- **PROOF L65:** `async def session_scope() -> AsyncIterator[AsyncSession]:`

### underworld/server/db/models.py (737 lines)
- purpose: all SQLAlchemy ORM models + enums for the simulation (worlds, souls, minions, skills, memories, discoveries, inventions, reviews, knowledge base, research projects, population snapshots, etc.).
- key classes: enums `GuildKind/TaskStatus/ReviewVerdict/CauseOfDeath/RelationshipKind/SwarmRoleKind/ProjectStage/MoodKind`; models `World, Soul, Minion, Skill, Memory, Discovery, Meme, MLModel, Species, Artwork, Fossil, EmptyDataset, CausalBelief, Relationship, Patent, Invention, PeerReview, SafetyReview, Event, KnowledgeConcept, KnowledgeFormula, KnowledgeSwarmRole, KnowledgeGuardrail, ResearchProject, ProjectContribution, PopulationSnapshot`.
- WIRED (the schema; imported everywhere).
- **PROOF L555:** `    created_at: Mapped[datetime] = mapped_column(default=_now)` (within `Invention`, ~75% mark)

---

## routes/

### underworld/server/routes/__init__.py (0 lines)
- purpose: empty package marker.
- WIRED.
- **PROOF:** file is empty (0 lines).

### underworld/server/routes/auth.py (10 lines)
- purpose: `/auth/me` identity endpoint.
- key: `me()` — returns a fixed admin descriptor behind bearer auth.
- WIRED (registered in main.py).
- **PROOF L8:** `@router.get("/auth/me")`

### underworld/server/routes/guilds.py (39 lines)
- purpose: `/guilds` list endpoint merging guild specs + lore.
- key: `list_guilds()` — combines `agents.guilds.GUILDS` with `guild_lore.get_lore` into a UI payload.
- WIRED (registered).
- **PROOF L26:** `                motto=lore.motto,`

### underworld/server/routes/inventions.py (231 lines)
- purpose: invention CRUD/decision routes.
- key: `CharterInvention`/`charter_invention` — human-seeded invention through safety gate; `get_invention`; `ManualDecision`/`decide_invention` — operator approve/reject/block writing PeerReview+SafetyReview+Event; `list_reviews`.
- WIRED (registered).
- **PROOF L173:** `    if body.verdict == "block_safety":`

### underworld/server/routes/knowledge.py (190 lines)
- purpose: knowledge-base read routes + skill-tree + oracle.
- key: `summary`, `list_concepts`, `get_concept`, `list_formulas` (filtered/paged), `list_swarm_roles`, `list_guardrails`, `skill_tree` (uses `knowledge.skill_tree`), `consult_oracle` (uses `services.oracle`).
- WIRED (registered).
- **PROOF L160:** `    from ..knowledge import skill_tree as st`

### underworld/server/routes/minions.py (526 lines)
- purpose: per-minion read/action routes (chat, dna, soul, skills, models, gateway, appearance, brain, beliefs, memories, relationships, lineage, breed, kill, fork).
- key: `_to_minion_out`/`_to_node`/`_minion_or_404`; `get_minion`, `chat_minion` (services.minion_chat), `get_dna`, `get_soul`, `list_skills`, `list_models`/`train_model` (services.mlmodels), `consult_gateway` (services.gateway), `get_appearance` (services.appearance), `get_brain` (services.neural), `list_beliefs` (services.reasoning), `list_memories`, `list_relationships`, `get_lineage` (BFS ancestors/descendants/siblings/forks), `breed`/`kill_minion`/`fork` (services.lifecycle).
- WIRED (registered).
- **PROOF L448:** `@router.post("/breed", response_model=MinionOut, status_code=201)`

### underworld/server/routes/patents.py (52 lines)
- purpose: `/patents` search + fetch.
- key: `search` (tools.patent_search), `get_patent`.
- WIRED (registered).
- **PROOF L41:** `    p = await session.get(Patent, patent_id)`

### underworld/server/routes/physics.py (172 lines)
- purpose: physics engine routes — laws/constants/limits/solve + the physics kernel (feasibility gate, conservation auditor, unit ledger, Courant stability, dimensional check, Ohm solver).
- key: `list_laws`, `constants`, `limits`, `get_law`, `solve`, `assess`, `kernel_feasibility` (physics.violations), `kernel_conserve` (physics.conservation), `kernel_units` (physics.dimensions), `kernel_stability` (physics.fidelity), `kernel_check_equation`, `electrical_ohm` (physics.electrical).
- WIRED (registered).
- **PROOF L121:** `@router.post("/kernel/stability")`

### underworld/server/routes/projects.py (147 lines)
- purpose: research-project read routes.
- key: `_serialize`; `list_all`, `get_project`, `list_contributions` (joins Minion), `world_summary` (per-stage + flagged counts).
- WIRED (registered).
- **PROOF L116:** `@router.get("/summary/world/{world_id}")`

### underworld/server/routes/safety.py (60 lines)
- purpose: `/safety` text/cpc check + review log.
- key: `SafetyCheckRequest`/`check` (tools.safety), `list_reviews`.
- WIRED (registered).
- **PROOF L43:** `    stmt = (`

### underworld/server/routes/schemas.py (269 lines)
- purpose: shared pydantic request/response schemas for all routes.
- key models: `WorldOut/WorldCreate/WorldAutoAdvanceUpdate, MinionOut/MinionListItem, SkillOut, MemoryOut, RelationshipOut, PatentOut, InventionOut, PeerReviewOut, EventOut, AdvanceRequest/Response, PatentSearchRequest, PopulationSnapshotOut, PopulationStatsOut, LineageNode/LineageOut, BreedRequest, ForkRequest`.
- WIRED (imported by route modules).
- **PROOF L205:** `class PopulationSnapshotOut(BaseModel):`

### underworld/server/routes/science.py (119 lines)
- purpose: science-tooling API (#71-100) — Bayes, measurement stats, formula parse, prior-art, mastery, building-code, ethics-gate, anomaly.
- key: `bayes`, `measurement`, `parse_formula`, `prior_art`, `mastery` (services.science); `building_code`, `ethics_gate`, `anomaly` (services.engineering).
- WIRED (registered).
- **PROOF L101:** `@router.post("/ethics-gate")`

### underworld/server/routes/substrate.py (155 lines)
- purpose: world-substrate API — materials, alloying, structural eval, chemistry react, acoustics, economy, resources.
- key: `_mat_dict`; `list_materials`/`get_material`/`make_alloy` (knowledge.materials), `evaluate_structure` (physics.structures), `chemistry_react` (services.chemistry), `acoustics_query` (services.acoustics), `economy_snapshot` (services.economy), `resource_survey` (world.resources).
- WIRED (registered).
- **PROOF L102:** `@router.get("/acoustics")`

### underworld/server/routes/worlds.py (1713 lines)
- purpose: the large world API — CRUD, map, latest-actions/thoughts, minions/events/inventions lists, population/culture/society/replay/gaps/art/fossils/species/climate/environment/memes/discoveries/timeline, advance, SSE stream, scene-state, chronicle, plus ~20 analytic POST endpoints exposing real engines (civos, knowledge-graph, materials, electronics, photonics, lab-sim, quantum, multiphysics, supply-chain, simulation-quality, instruments-lab, manufacturing, experiment-design, optimize, autonomous-research, invent, counterfactual, discover-cure, lab-campaign).
- key: `_world_or_404`/`_world_out`; `list_worlds`/`create_world_route`/`get_world`/`delete_world` (manual FK cascade); `set_auto_advance`; `get_world_map`/`get_latest_actions`/`get_latest_thoughts`; `list_minions`/`list_events`/`list_inventions`; `population_stats`; `world_culture/society/replay/gaps/solve_gap/art/fossils/species/climate/environment/memes/discoveries/timeline`; `advance`; `stream_events` (scheduler.subscribe SSE); `get_scene_state`; `get_chronicle`; analytic POST handlers wiring civos, knowledge_graph, real_materials, electronics, photonics, spice_sim/cfd_sim/robotic_lab, quantum_sim, multiphysics, supply_chain, simulation_quality, instruments_lab, manufacturing_capability, experiment_design, real_optimizer, research_director, invention_pipeline, world_model, virtual_cell, self_driving_lab; `get_scale_capacity`/`get_feature_audit`.
- WIRED (registered; the main wiring hub for many services).
- **PROOF L1559:** `    report = research_director.autonomous_program(g, known, cycles=cycles)`

---

## agents/

### underworld/server/agents/__init__.py (0 lines)
- purpose: empty package marker.
- WIRED.
- **PROOF:** file is empty (0 lines).

### underworld/server/agents/guild_lore.py (381 lines)
- purpose: narrative/ritual lore per guild (motto, myth, mission, hero, rituals, colour, glyph, nemesis, obsession, open question).
- key: `GuildLore` dataclass; `GUILD_LORE` dict (11 guilds); `get_lore(kind)`.
- WIRED (used by minion system prompt + /guilds route).
- **PROOF L281:** `    GuildKind.AGRICULTURE: GuildLore(`

### underworld/server/agents/guilds.py (168 lines)
- purpose: guild registry — domain, peer-review checklist, starting skills per guild.
- key: `GuildSpec` dataclass; `GUILDS` dict; `get(kind)`.
- WIRED (reviewer + /guilds route).
- **PROOF L137:** `    GuildKind.PATENT: GuildSpec(`

### underworld/server/agents/minion.py (1204 lines)
- purpose: the core per-minion agent — builds the LLM system prompt, decides one action per tick (LLM or heuristic fallback), executes it, and updates state (skills, memory, reasoning beliefs, neural policy, emotion, purpose/morale).
- key: `_ACTIONS`/`_MISSION_ACTIONS`/`_LEARNABLE_ACTIONS` sets; `TickOutcome`; `_build_system_prompt`, `_safe_parse_json`, `_minion_goals` (services.goals), `_heuristic_decision`, `_memory_emotion_delta`, `_recall_salient`, `_maybe_mastery_event`, `_store_memory` (memory.classify), `_record_event`; action handlers `_do_search_patents` (patent_intelligence enrich), `_do_propose_invention` (discovery_lab.discover + physics assess + fraud model), `_do_study`, `_do_kb_lookup`, `_do_calculate` (physics.grade_attempt), `_do_teach`, `_do_build_scanner`, `_do_propose_with_party`, `_do_seek_ascension`; `run_tick(...)` — the per-tick orchestrator.
- WIRED (driven by services.simulation; also routes/minions chat path).
- **PROOF L823:** `    from ..services import acoustics`

### underworld/server/agents/reviewer.py (383 lines)
- purpose: peer-review + safety-review + replication pipeline for inventions.
- key: `_build_review_prompt`, `_VERDICT_MAP`, `_parse_review`; `safety_review` (tools.safety hard gate); `_heuristic_review` (offline verdict from substance/citations/physics); `_ask_reviewer` (LLM or heuristic); `peer_review` (patent+safety+own-guild votes → APPROVED/REJECTED, reputation deltas); `replicate_pending` (doc I.71 independent reproduction + fraud detection).
- WIRED (called from services.simulation).
- **PROOF L289:** `    elif approve_votes >= max(2, n - 1):`

---

## genetics/

### underworld/server/genetics/__init__.py (0 lines)
- purpose: empty package marker.
- WIRED.
- **PROOF:** file is empty (0 lines).

### underworld/server/genetics/dna.py (163 lines)
- purpose: digital DNA — base-pair strings, named loci → trait floats, crossover/mutation/breed/fork, kinship.
- key: `Locus`/`LOCI`/`LOCUS_BY_NAME`; `random_dna`, `trait`, `trait_vector`, `crossover`, `mutate`, `breed`, `fork`, `hamming`, `kinship`.
- WIRED (lifecycle breeding, minion partner-selection, /minions dna route).
- **PROOF L121:** `def breed(`

---

## physics/

### underworld/server/physics/__init__.py (45 lines)
- purpose: physics package facade re-exporting the engine + constants API.
- key: re-exports `LAWS, Law, assess_invention, compute, discipline_for_guild, generate_problem, get_law, grade_attempt, list_laws, world_limits`.
- WIRED.
- **PROOF L32:** `__all__ = [`

### underworld/server/physics/engine.py (585 lines)
- purpose: registry of ~70 computable physics laws + grading + invention feasibility against hard limits.
- key: `Var`/`Law` dataclasses; `_LAW_LIST`/`LAWS`; `discipline_for_guild`, `get_law`, `list_laws`, `laws_for_discipline`, `compute`, `generate_problem`, `AttemptResult`, `grade_attempt` (minion learning), `_structural_modifier`, `InventionAssessment`, `assess_invention` (FTL/over-unity/efficiency limits), `world_limits`.
- WIRED (minion calculate action, reviewer physics gate, /physics routes).
- **PROOF L537:** `def assess_invention(text: str) -> InventionAssessment:`

### underworld/server/physics/conservation.py (47 lines)
- purpose: conservation auditor for mass/energy/momentum/charge.
- key: `CONSERVED`, `AuditResult`, `audit`, `all_conserved`.
- WIRED (/physics/kernel/conserve + violations.py).
- **PROOF L37:** `    for q in CONSERVED:`

### underworld/server/physics/constants.py (60 lines)
- purpose: authoritative SI physical constants.
- key: `Constant`, `CONSTANTS` dict, scalar accessors (C, G, GRAV, H, HBAR, K_B, R_GAS, K_E, PI), `as_dicts()`.
- WIRED (engine + /physics/constants).
- **PROOF L45:** `C = CONSTANTS["c"].value`

### underworld/server/physics/dimensions.py (102 lines)
- purpose: SI unit ledger + dimensional homogeneity checking.
- key: `BASE`, `DimensionError`, `Dimension` (mul/div/pow/str), `_d`, derived dimensions, `UNITS`, `Quantity` (with add/sub homogeneity), `unit`, `is_homogeneous`, `check_equation`.
- WIRED (/physics/kernel/units + check-equation; violations.py).
- **PROOF L67:** `@dataclass(frozen=True)`  (the `Quantity` class definition)

### underworld/server/physics/electrical.py (59 lines)
- purpose: circuit/power-system helper functions.
- key: `ohm_solve`, `kirchhoff_voltage_ok`, `kirchhoff_current_ok`, `joule_heat`, `wire_overheats`, `power_factor`, `reactive_power`, `shannon_capacity`.
- WIRED (/physics/electrical/ohm).
- **PROOF L48:** `def power_factor(real_w: float, apparent_va: float) -> float:`

### underworld/server/physics/epidemiology.py (42 lines)
- purpose: SIR epidemic + population helpers.
- key: `SIR` dataclass, `r0`, `sir_step`, `epidemic_peaks`.
- WIRED (services.disease imports the SIR stepper for the live epidemic).
- **PROOF L28:** `def sir_step(state: SIR, *, beta: float, gamma: float, dt: float = 1.0) -> SIR:`

### underworld/server/physics/fidelity.py (44 lines)
- purpose: solver fidelity ladder + numerical stability (Courant).
- key: `COURANT_LIMIT`, `courant_number`, `is_stable`, `max_stable_dt`, `truncation_error`, `fidelity_tier`.
- WIRED (/physics/kernel/stability).
- **PROOF L36:** `def fidelity_tier(*, observed: bool, importance: float) -> str:`

### underworld/server/physics/structures.py (90 lines)
- purpose: structural integrity model (beam bending / column crushing) over the materials DB.
- key: `DEFAULT_SAFETY_FACTOR`, `StructuralResult`, `evaluate`, `max_safe_span`.
- WIRED (/substrate/structures/evaluate; physics.engine structural modifier).
- **PROOF L78:** `def max_safe_span(`

### underworld/server/physics/violations.py (68 lines)
- purpose: physics violation alarm + patent feasibility gate.
- key: `C_LIGHT`, `speed_ok`, `carnot_limit`, `efficiency_ok`, `energy_balance_ok`, `detect_violations`, `feasibility_gate`.
- WIRED (/physics/kernel/feasibility).
- **PROOF L59:** `def feasibility_gate(claim: dict, *, materials_available: bool = True) -> dict:`

---

## prompts/

### underworld/server/prompts/__init__.py (0 lines)
- purpose: empty package marker (the prompt `.md` files live alongside but are not Python).
- WIRED (package; minion/reviewer read sibling `.md` files via path).
- **PROOF:** file is empty (0 lines).

---

## knowledge/

### underworld/server/knowledge/__init__.py (0 lines)
- purpose: empty package marker.
- WIRED.
- **PROOF:** file is empty (0 lines).

### underworld/server/knowledge/materials.py (123 lines)
- purpose: scientifically-grounded materials database + alloying.
- key: `Material` dataclass (+`conducts`); `_MATERIALS`; `get`, `all_materials`, `by_category`, `strongest`, `best_conductor`; `_ALLOYS`, `alloy` (named recipe or rule-of-mixtures blend).
- WIRED (physics.structures, /substrate/materials, physics.engine structural check).
- **PROOF L99:** `def alloy(a: str, b: str, ratio: float = 0.5) -> Material:`

### underworld/server/knowledge/seed.py (162 lines)
- purpose: seed KB tables from JSON exports (concepts, V2 formulas, swarm roles, guardrails, V4 physics entries); idempotent.
- key: `seed_knowledge_base(force=...)`, `_existing_ids`, `_truncate`.
- WIRED (called in main lifespan at startup).
- **PROOF L112:** `            existing_ids = await _existing_ids(session, KnowledgeFormula)`

### underworld/server/knowledge/skill_tree.py (97 lines)
- purpose: deterministic multi-hundred-node skill dependency tree (domain→concept→4 levels).
- key: `LEVELS`, `_DOMAIN_CONCEPTS`, `SkillNode`, `_build`, `SKILL_TREE`, `get_node`, `prerequisites_satisfied`, `unlockable`, `domain_of`, `stats`.
- WIRED (/knowledge/skill-tree route).
- **PROOF L74:** `def unlockable(owned: set[str]) -> list[str]:`

### underworld/server/knowledge/extract_kb.py (398 lines)
- purpose: offline extractor — parse the V2 Master Reference docx into `knowledge_base.json` (concepts/formulas/roles/guardrails).
- key: `Concept/Formula/SwarmRole/Guardrail` dataclasses; `DISCIPLINE_MAP`, `_SWARM_ROLES`, `_GUARDRAILS`; `_slug`, `_extract_keywords`, `extract(docx_path)`, `main()`.
- DORMANT (build-time CLI; requires python-docx; not imported by app — the JSON it produces is consumed by knowledge/seed.py).
- **PROOF L325:** `    for p in d.paragraphs:`

### underworld/server/knowledge/extract_physics_pdf.py (222 lines)
- purpose: offline extractor — parse the V4 Physics PDF into `knowledge_physics.json` via `pdftotext -layout` + a state machine.
- key: `SECTION_DISCIPLINE`, `Entry`, `_PAGE_CHROME`, `_is_page_chrome`, `_is_section_heading`, `_pdftotext_layout`, `parse_entries`, `write_json`, `main()`.
- DORMANT (build-time CLI; output consumed by knowledge/seed.py).
- **PROOF L169:** `        cur = Entry(`

---

## world/

### underworld/server/world/__init__.py (0 lines)
- purpose: empty package marker.
- WIRED.
- **PROOF:** file is empty (0 lines).

### underworld/server/world/seed.py (82 lines)
- purpose: deterministic world seed + fractal heightmap derivation from a CPC class.
- key: `_CLASS_BIAS`, `WorldSeed`, `derive_seed`, `heightmap`.
- WIRED (factory/world creation, /worlds map + scene-state, /substrate).
- **PROOF L66:** `    for y in range(size):`

### underworld/server/world/resources.py (107 lines)
- purpose: geology — elevation-driven resource deposit distribution + world survey.
- key: `RESOURCE_MATERIALS`, `Deposit`, `_cell_rng`, `deposit_at`, `survey`, `richest_deposits`.
- WIRED (/substrate/resources).
- **PROOF L80:** `def survey(seed: WorldSeed, *, size: int = 32) -> dict[str, dict]:`

---

## tools/

### underworld/server/tools/__init__.py (0 lines)
- purpose: empty package marker.
- WIRED.
- **PROOF:** file is empty (0 lines).

### underworld/server/tools/llm.py (239 lines)
- purpose: OpenAI-compatible LLM client (Kimi K2 / Llama) with offline stub + tiered provider resolution + streaming.
- key: `ChatResponse`; `_warn_stub_once`, `_coerce_temperature`, `_kimi`/`_llama`/`_provider` (tier routing), `has_llm`, `_is_reasoning_model`, `warn_on_misconfig`, `_stub_response`, `chat(...)`, `chat_stream(...)`.
- WIRED (minion + reviewer agents; main lifespan warn).
- **PROOF L172:** `    try:`  (within `chat`, the HTTP POST block)

### underworld/server/tools/safety.py (106 lines)
- purpose: hard safety gate — red-line text patterns + CPC allow/block enforcement + medical disclaimer.
- key: `_RED_LINE_PATTERNS`/`_RED_LINE`; `SafetyResult`; `_norm_cpc`, `check_cpc`, `check_text`, `medical_disclaimer`.
- WIRED (reviewer, patent_search, /safety, inventions route).
- **PROOF L79:** `def check_text(text: str) -> SafetyResult:`

### underworld/server/tools/patent_search.py (203 lines)
- purpose: real USPTO PatentsView v1 search with safe offline corpus fallback + safety filtering.
- key: `PatentRecord`; `_OFFLINE_CORPUS`; `_is_expired`, `_to_record`, `_filter_safe`, `search(...)`.
- WIRED (minion search_patents action; /patents route).
- **PROOF L157:** `async def search(query: str, *, limit: int = 10, only_expired: bool = True) -> list[PatentRecord]:`

### underworld/server/tools/patent_intelligence.py (557 lines)
- purpose: analysis layer over patent records — claims parser, requirement inference, comprehension prerequisites, quality scoring, playable-artifact translation.
- key: `_field/_text/_cpc`; `ClaimKind`/`Claim`, `_CLAIM_HEAD`/`_DEP_TRIGGER`, `_expand_refs`, `parse_claims`; `_DomainProfile`/`_CPC_PROFILES`/`_KEYWORD_HINTS`, `_profile_for`, `extract_requirements`, `comprehension_prerequisites`, `quality_score`, `to_artifact`, `_skill_to_tool`, `_failure_modes`.
- WIRED (minion search_patents enriches scanned patents via quality_score/comprehension_prerequisites/extract_requirements).
- **PROOF L473:** `def to_artifact(patent: Any) -> dict:`

### underworld/server/tools/open_data_portal.py (223 lines)
- purpose: USPTO Open Data Portal adapter (post-PatentsView), mirroring patent_search's contract.
- key: `_DEFAULT_BASE_URL`, `_OFFLINE_SAMPLE`; `_base_url`, `_api_key`, `_to_record`, `_filter_safe`, `_offline`, `search(...)`.
- DORMANT (not imported by any live code — only mentioned in patent_intelligence's docstring; the active patent path uses patent_search).
- **PROOF L169:** `async def search(query: str, *, limit: int = 10, only_expired: bool = True) -> list[PatentRecord]:`

---

## services/

### underworld/server/services/__init__.py (0 lines)
- purpose: empty package marker.
- WIRED.
- **PROOF:** file is empty (0 lines).

### underworld/server/services/acoustics.py (48 lines)
- purpose: sound propagation + communication range (doc I.10).
- key: `AMBIENT`/`SPEECH_DB`/`MEDIUM_SPEED`; `sound_level_at`, `ambient_for`, `audible`, `comm_range`, `travel_time`, `speech_clarity`.
- WIRED (minion teach action; /substrate/acoustics).
- **PROOF L42:** `def travel_time(distance_m: float, medium: str = "air") -> float:`

### underworld/server/services/activities.py (174 lines)
- purpose: seven+ "lived" minion actions (forage/worship/craft/trade/celebrate/heal/mentor/gene_edit) with real bounded well-being effects.
- key: `UNLOCKS_BY_ERA`/`NEW_ACTIONS`; `Effect`, `_clamp01`, `apply_effect`; action fns `forage/worship/craft/trade/celebrate/heal/mentor/gene_edit` (latter does real CRISPR via molecular_genetics); `perform(action, minion, rng, neighbours)`.
- WIRED (minion.run_tick dispatch).
- **PROOF L155:** `_FN = {"forage": forage, "worship": worship, "craft": craft, "trade": trade,`

### underworld/server/services/aerospace.py (66 lines)
- purpose: astrodynamics/propulsion — Tsiolkovsky, vis-viva, circular/escape velocity, Kepler period, Hohmann transfer, launch budget.
- key: `MU_EARTH`/`R_EARTH`/`G0`; `tsiolkovsky`, `vis_viva`, `circular_velocity`, `escape_velocity`, `orbital_period`, `hohmann_transfer`, `launch_budget`.
- WIRED (via field_science.py, reachable from minion discovery_lab/science_niches chain).
- **PROOF L43:** `def hohmann_transfer(*, r1_km: float, r2_km: float, mu: float = MU_EARTH) -> dict:`

### underworld/server/services/agriculture.py (64 lines)
- purpose: live crop growth as a function of climate + soil (doc I.13); feeds/starves population.
- key: `_SEASON_GROWTH`/`_WEATHER_GROWTH`; `_temp_factor`, `growing_factor`, `tick_agriculture(session, world)`.
- WIRED (simulation.py per-tick world systems).
- **PROOF L49:** `    alive = (await session.execute(`

### underworld/server/services/ai_model.py (77 lines)
- purpose: a real trained+cross-validated ML model (RF/GBM/MLP) on the Yeh concrete dataset, with predict() + feature importance.
- key: `_models`, `train_and_select` (5-fold CV select best), `_fitted_best`, `predict_strength`, `feature_importance`.
- DORMANT (not imported by any route/agent; only real_materials is the live materials path; tested directly).
- **PROOF L63:** `def predict_strength(features: dict) -> dict:`

### underworld/server/services/ai_models.py (153 lines)
- purpose: real ML-ops math (category V) — model registry, dataset lineage, data nutrition, missingness, bias, eval arena, PSI drift, ECE calibration, hallucination/uncertainty/distillation, capability graph, modality trackers.
- key: `model_registry`, `dataset_lineage`, `data_nutrition`, `missingness`, `bias_profile`, `evaluation_arena`, `drift_detector`, `calibration_error`, `hallucination_detector`, `uncertainty_estimate`, `distillation`, `capability_graph`, `foundation_model_registry`, `_modality_tracker`, `language_model_tracker`, `vision_model_tracker`, `protein_model_tracker`, `robotics_model_tracker`.
- DORMANT (no live importer; tested directly).
- **PROOF L117:** `def capability_graph(models: dict[str, list[str]]) -> dict:`

### underworld/server/services/appearance.py (68 lines)
- purpose: tech-gated minion appearance/body modification (doc II.144-146).
- key: `_HAIR/_BASE/_DYED/_FINE_GARMENTS`, `_ERA_INDEX`; `unlocked_features(era, discovered)`, `for_minion(minion, era, discovered)`.
- WIRED (/minions/{id}/appearance).
- **PROOF L44:** `    if feats["jewellery"] and rng.random() < 0.5:`

### underworld/server/services/art.py (81 lines)
- purpose: art/music/literature creation with era-gated forms + evolving styles (doc I.47).
- key: `_FORMS_BY_ERA/_STYLE_BY_ERA/_TITLES`; `forms_for_era`, `style_for_era`, `create(session, world, minion, rng)`, `tick_art(session, world, rng)`.
- WIRED (simulation.py per-tick).
- **PROOF L72:** `async def tick_art(session: AsyncSession, world: World, rng: random.Random) -> Artwork | None:`

### underworld/server/services/behavior.py (603 lines)
- purpose: deterministic procedural expander mapping abstract sim-state (Context) → a continuous, asset-bound micro-behaviour stream for the renderer; spans a ~2e18 lived-behaviour space.
- key: dimension tuples (ACTIONS/GUILDS/ROLES/EMOTIONS/LIFE_STAGES/...); object-binding tables (GUILD_TOOL/ROLE_STATION/CALC_TOOL_BY_ERA/STAGE_STEP/MOOD_EMOTE/...); `MicroStep`, `Context`; `lifestyle_allowed`, `_expand_work_concrete`, `expand`, `_core`; `valid_context_count`, `space_breakdown`, `iter_contexts`, `referenced_object_ids`, `health_band`, `mastery_tier`, `behavior_for_minion`.
- WIRED (services.scene_state imports behavior_for_minion).
- **PROOF L480:** `def iter_contexts(limit: int | None = None):`

### underworld/server/services/behavior_coverage.py (101 lines)
- purpose: behaviour-space completeness checker — space size > 1M, every sampled context resolves to a bound sequence, lists unbound GLB ids.
- key: `catalog_ids`, `report(sample=...)`, `main()`.
- DORMANT (analysis CLI / test helper; not imported by live app).
- **PROOF L84:** `def main() -> int:`

### underworld/server/services/bio_advanced.py (98 lines)
- purpose: real Biopython bioinformatics — NW/SW alignment, BLOSUM62 identity, translation/ORFs, ProtParam, restriction digestion.
- key: `align_global`, `align_local`, `protein_identity`, `translate`, `find_orfs`, `protein_params`, `restriction_sites`.
- WIRED (via minion_research / drug_discovery / field_science → reachable from minion discovery chain; field_science wired through science_niches/discovery_lab).
- **PROOF L75:** `def protein_params(seq: str) -> dict:`

### underworld/server/services/bio_genetics.py (176 lines)
- purpose: real population/molecular genetics (category R) — Hardy-Weinberg, selection, Wright-Fisher drift, heritability, Punnett, Hill activation, speciation distance.
- key: `hardy_weinberg`, `allele_frequency`, `hw_equilibrium_test`, `selection_step`, `mutation_step`, `genetic_drift`, `heritability`, `punnett`, `hill_activation`, `speciation_distance` + canonical-named wrappers (`genome_object`, `chromosome_model`, `gene_registry`, `inheritance_engine`, `epigenetic_state`, `gene_regulatory_graph`, `expression_state_matrix`, `heritability_estimator`, `evolutionary_selection`, `promoter_enhancer`, `gene_object_registry`).
- WIRED (synbio.py imports hill_activation; reachable via minion_research chain).
- **PROOF L139:** `def gene_regulatory_graph(*, concentration: float, k: float, n: float = 2.0) -> dict:`

### underworld/server/services/biology.py (79 lines)
- purpose: multi-species biology with climate-driven evolution + speciation (doc I.12/34).
- key: `_SEED_SPECIES`, `EXTINCT_BELOW`, `SPECIATE_ABOVE`; `climate_optimum`, `fitness`, `ensure_seeded`, `tick_biology(session, world, rng)`.
- WIRED (simulation.py per-tick).
- **PROOF L58:** `    for sp in species:`

### underworld/server/services/cfd_sim.py (80 lines)
- purpose: real incompressible Navier-Stokes CFD (Chorin projection) — in-silico wind tunnel (feature #248).
- key: `SIMULATION`; `lid_driven_cavity`, `pipe_flow_profile`, `cfd_simulate`.
- WIRED (/worlds/{id}/lab-sim action='cfd').
- **PROOF L68:** `def pipe_flow_profile(*, radius: float, dp_dx: float, viscosity: float, n: int = 20) -> dict:`

### underworld/server/services/chem_advanced.py (97 lines)
- purpose: real RDKit cheminformatics + MMFF94 molecular mechanics.
- key: `_mol`, `descriptors`, `drug_likeness` (Lipinski+QED), `similarity` (Tanimoto/Morgan), `substructure_match`, `minimize_3d`, `candidate_report`.
- WIRED (minion_research / drug_discovery / field_science chains).
- **PROOF L71:** `def minimize_3d(smiles: str, *, seed: int = 1) -> dict:`

### underworld/server/services/chemistry.py (72 lines)
- purpose: grounded chemistry engine — combustion, neutralisation, smelting, alloying (doc I.11).
- key: `_FUEL_ENERGY`, `_SMELT`; `ReactionResult`; `react(reactants, temperature_c)`.
- WIRED (/substrate/chemistry/react).
- **PROOF L52:** `    # Smelting: an ore → its metal, if hot enough to melt that metal.`

### underworld/server/services/civics.py (103 lines)
- purpose: civic systems — urban planning (infrastructure), war/diplomacy (tension→conflict/treaty), era entertainment (doc I.43-44/48).
- key: `_LEGAL_ORDER`, `_ENTERTAINMENT_BY_ERA`; `tick_infrastructure`, `conflict_pressure`, `tick_conflict`, `entertainment_for`, `tick_entertainment`.
- WIRED (simulation.py per-tick; /worlds/{id}/society uses entertainment_for).
- **PROOF L88:** `# ── #48 entertainment ────────────────────────────────────────────────────────`

### underworld/server/services/civos.py (616 lines)
- purpose: Civilisation Operating System (#7) — six pure OS modules over a world-snapshot dict + a composite health dashboard.
- key: `_clamp/_get/_round`; ResourceOS (`RESOURCES`, `resource_pressure`, `shortage_risks`); InstitutionOS (`Institution`, `institutional_capacity`, `missing_institutions`); KnowledgeOS (`KnowledgeState`, `knowledge_health`, `at_risk_knowledge`); EconomyOS (`economic_state`); RiskOS (`Risk`, `RiskEntry`, `risk_register`, `_named_drivers`, `_drivers_for_resources`); ResearchOS (`research_throughput`); `Concern`, `civ_dashboard`, `_top_concerns`.
- WIRED (/worlds/{id}/civos).
- **PROOF L456:** `def research_throughput(snapshot: dict) -> dict:`

### underworld/server/services/climate.py (95 lines)
- purpose: live climate field — season/temperature/weather each tick + thermal stress on minions (doc I.5/28-30).
- key: `SEASONS`, `_SEASON_BASE`, `_BIOME_ADJ`, `COMFORT_LOW/HIGH`; `season_for`, `base_temperature`, `pick_weather`, `thermal_stress`, `tick_climate`.
- WIRED (simulation.py per-tick; /worlds/{id}/climate uses thermal_stress).
- **PROOF L67:** `async def tick_climate(session: AsyncSession, world: World, rng: random.Random) -> dict:`

### underworld/server/services/discovery.py (91 lines)
- purpose: foundational tech-discovery ladder gated by prereqs/knowledge/population/masters (doc I.22).
- key: `Tech` dataclass, `LADDER`, `_BY_NAME`; `discovered_set`, `_ready`, `tick_discoveries`.
- WIRED (simulation.py; gateway.py; /worlds/{id}/discoveries uses LADDER).
- **PROOF L65:** `async def tick_discoveries(session: AsyncSession, world: World, *, max_per_tick: int = 1) -> list[str]:`

### underworld/server/services/discovery_lab.py (151 lines)
- purpose: unified discovery layer every invention flows through — grounded research + a real novel artifact (tech+patent / molecule / colour / sky) into a persistent ledger.
- key: `DiscoveryLedger`, `LEDGER`; `_maybe_molecule`, `_maybe_colour`, `_maybe_sky`; `discover(guild, seed, minion_id)` (the single hook); `ledger_summary`.
- WIRED (agents/minion.py _do_propose_invention calls discover()).
- **PROOF L113:** `    # 1) always: invent a technology + file a patent, often expanding prior art`

### underworld/server/services/discovery_astro.py (77 lines)
- purpose: real astronomy — astropy planet ephemeris, Keplerian orbit propagation, NEO close-approach/MOID screening.
- key: `PLANETS`, `BRIGHT_STARS`; `track_planets`, `track_stars`, `propagate_orbit`, `meteor_close_approach`.
- WIRED (discovery_lab _maybe_sky; field_science).
- **PROOF L64:** `def meteor_close_approach(*, a: float, e: float, n_samples: int = 720) -> dict:`

### underworld/server/services/discovery_color.py (116 lines)
- purpose: discover perceptually-novel colours via sRGB→CIELAB + CIEDE2000 ΔE thresholding.
- key: `KNOWN_COLORS`; `srgb_to_lab`, `ciede2000`, `_name_color`, `discover_colors`.
- WIRED (discovery_lab _maybe_colour).
- **PROOF L87:** `def discover_colors(n: int = 8, *, min_delta_e: float = 12.0, seed: int = 0,`

### underworld/server/services/discovery_molecule.py (83 lines)
- purpose: de-novo molecule discovery via RDKit BRICS fragment recombination + InChIKey novelty + drug-likeness screen.
- key: `SEEDS`, `_known_inchikeys`, `discover_molecules`.
- WIRED (discovery_lab _maybe_molecule).
- **PROOF L53:** `    for prod in builder:`

### underworld/server/services/discovery_tech.py (97 lines)
- purpose: invent technologies from a combinatorial grammar + a NetworkX patent citation graph with metrics.
- key: `MECHANISMS`/`MATERIALS`/`EFFECTS`; `_space_size`, `invent`; `PatentOffice` (`file`, `expand`, `metrics`).
- WIRED (discovery_lab TECH.invent/PatentOffice).
- **PROOF L73:** `    def expand(self, parent_id: str, *, seed: int) -> dict:`

### underworld/server/services/discovery_engine.py (240 lines)
- purpose: the WorldTruth≠MinionBelief discovery law — minions earn material facts only by instrumented, replicated measurement (pure functions).
- key: `Property`, `PROPERTY_INSTRUMENT`; `MaterialTruth`, `Observation`, `Belief`; `_deterministic_noise`, `measure_property`, `update_belief`, `is_discovered`, `belief_error`, `discover_property`, `truth_from_material`.
- DORMANT (no live importer; imports services.instruments but is itself not wired to a route/agent; tested directly).
- **PROOF L185:** `def discover_property(`

### underworld/server/services/discovery_mechanics.py (91 lines)
- purpose: real Bayesian hypothesis machinery (category C) — generation/rejection, replication threshold, conflicting-evidence pooling.
- key: `hypothesis_posterior`, `generate_hypotheses`, `reject_hypothesis`, `hypothesis_generation`, `hypothesis_rejection`, `replication_threshold`, `resolve_conflicting_evidence`.
- DORMANT (no live importer; tested directly).
- **PROOF L68:** `def replication_threshold(trials: list[bool], *, required: int = 3) -> dict:`

### underworld/server/services/disease.py (75 lines)
- purpose: live epidemics via the physics SIR model with pollution/infrastructure-driven β/γ (doc I.67).
- key: `BASE_BETA/GAMMA`, `SEED_FRACTION`, `OUTBREAK_CHANCE`; `rates`, `tick_disease`.
- WIRED (simulation.py per-tick).
- **PROOF L52:** `    beta, gamma = rates(pollution=pollution, infrastructure=infra)`

### underworld/server/services/disease_models.py (240 lines)
- purpose: real epidemiology/pharmacology models (category T) — SIR/SEIR, R0, herd immunity, resistance, dose-response, gene perturbation networks, therapy scoring, immune/cancer/neuro dynamics.
- key: `r0`, `herd_immunity_threshold`, `sir_simulate`, `seir_step`, `pathogen_resistance`, `dose_response`, `therapeutic_index`, `drug_perturbation`, `_propagate`, `gene_knockout/knockdown`, `overexpression`, `therapy_candidate_score`, `symptom_clustering`, `pathway_disruption`, `immune_response`, `pathogen_evolution`, `viral_mutation`, `bacterial_resistance`, `cancer_evolution`, `autoimmune_dynamics`, `neurodegeneration`.
- DORMANT (no live importer; tested directly).
- **PROOF L178:** `def immune_response(*, pathogen0: float, immune0: float, steps: int = 50,`

### underworld/server/services/drug_discovery.py (66 lines)
- purpose: end-to-end in-silico drug-discovery pipeline using RDKit+Biopython tools (candidate triage).
- key: `_binding_estimate`, `screen_candidate`, `rank_library`.
- DORMANT (imports bio_advanced/chem_advanced but no live importer of drug_discovery itself; tested directly).
- **PROOF L54:** `def rank_library(target_protein: str, library: dict[str, str]) -> list[dict]:`

### underworld/server/services/economy.py (64 lines)
- purpose: scarcity-driven market pricing + inflation (doc I.39-40).
- key: `BASE_PRICES`, `DEMAND_WEIGHT`; `clearing_price`, `market`, `price_index`, `inflation`.
- WIRED (simulation.py; activities.trade; /substrate/economy).
- **PROOF L50:** `def price_index(mkt: dict[str, dict]) -> float:`

### underworld/server/services/ecosystem.py (70 lines)
- purpose: Lotka-Volterra wildlife + overhunting collapse → famine feedback (doc I.35).
- key: `GROWTH/PREDATION/...` constants; `EcoStep`; `step`, `tick_ecosystem`, `apply_famine`.
- WIRED (simulation.py per-tick; field_science).
- **PROOF L62:** `async def apply_famine(session: AsyncSession, world: World, food: float) -> None:`

### underworld/server/services/education.py (69 lines)
- purpose: education institutions giving the young a tier-scaled passive learning rate (doc I.45).
- key: `MATURITY_TICKS`, `_TIERS`; `education_tier`, `apply_education`.
- WIRED (simulation.py per-tick).
- **PROOF L46:** `    young = (await session.execute(`

### underworld/server/services/electronics.py (204 lines)
- purpose: real electronics/device physics (category N) — DC/AC circuits, semiconductor devices, machines, protection, power electronics.
- key: `series/parallel_resistance`, `dc_circuit_solve`, `ac_impedance`, `resonant_frequency`, `diode_current`, `bjt_collector_current`, `mosfet_saturation_current`, `intrinsic_carrier_density`, `transformer`, `dc_motor`, `generator_emf`, `battery_capacity`, `fuse_i2t`, `breaker_trip_time`, `buck/boost_converter`, `battery_electrochemistry`, `semiconductor_band_model`, `integrated_circuit`, `sensor_electronics`, `power_electronics`, `protection_coordination`, `microprocessor_architecture`, etc.
- WIRED (/worlds/{id}/electronics; minion_research/field_science).
- **PROOF L162:** `def power_electronics(*, input_voltage: float, duty: float, topology: str = "buck") -> dict:`

### underworld/server/services/emotion.py (327 lines)
- purpose: appraisal-theory emotion layer (#2 Layer 2) — events→named emotion+intensity and emotion→cognition control modifiers.
- key: `Emotion` enum (+`is_negative`), `_NEGATIVE/_POSITIVE`; `Appraisal`, `_read_appraisal`, `_select_emotion`, `_personality`, `_modulate`, `appraise`; `_MODIFIER_TEMPLATES`, `cognition_modifier`, `decay`.
- WIRED (agents/minion.py appraises each action outcome).
- **PROOF L228:** `def appraise(event: dict, minion_state: dict) -> tuple[Emotion, float]:`

### underworld/server/services/engineering.py (68 lines)
- purpose: engineering/safety/meta-science helpers (#83/#88/#89/#90/#100/#8/#6).
- key: `safety_factor`, `building_code_ok`, `occupational_risk`, `evacuation_flow`, `ethical_review`, `anomaly`, `measure_constant`, `_BC_KINDS`, `boundary_valid`.
- WIRED (/science building-code / ethics-gate / anomaly).
- **PROOF L46:** `def anomaly(observed: float, predicted: float, uncertainty: float) -> dict:`

### underworld/server/services/epidemic_network.py (85 lines)
- purpose: stochastic agent-based SIR on a Watts-Strogatz small-world contact network.
- key: `small_world`, `simulate`, `ensemble`.
- WIRED (field_science.py → reachable from minion discovery chain).
- **PROOF L70:** `def ensemble(runs: int = 20, **kw) -> dict:`

### underworld/server/services/epochs.py (153 lines)
- purpose: ~70 historically-grounded technological epochs subdividing the 6 eras + a knowledge-index ladder.
- key: `Epoch` dataclass, `EPOCHS` list; `knowledge_index`, `epoch_for`, `next_epoch`, `epoch_progress`.
- WIRED (sagas.py; /worlds scene-state + chronicle).
- **PROOF L118:** `def epoch_for(index: float) -> Epoch:`

### underworld/server/services/ethics.py (388 lines)
- purpose: Ethics & Sentience Boundary (#8) — narrative/technical/ethical layer split, suffering meter, intervention audit gate, non-negotiable guards, consciousness-claim gate.
- key: `Layer`; `claim_layer`; `_SUFFERING_WEIGHTS`, `suffering_index`, `distress_limit_breached`, `recommend_relief`; `EthicsSettings`, `default_settings`; `_AuditRecord`, `vet_intervention`; `can_file_patent_autonomously`, `can_name_ai_as_inventor`, `disclosure_disclaimer`, `ascension_framing`, `consciousness_claim_ok`.
- WIRED (virtual_cell.py; /worlds discover-cure path).
- **PROOF L300:** `def can_file_patent_autonomously() -> tuple[bool, str]:`

### underworld/server/services/exotic_quantum.py (120 lines)
- purpose: exotic-quantum / condensed-matter models (category Q) — time crystals, Ising chain, MBL, symmetry breaking, topology, superfluid/BEC, quantum metrology.
- key: `floquet_subharmonic`, `ising_chain_energy`, `many_body_localisation`, `symmetry_breaking`, `topological_invariant`, `superfluid_fraction`, `bec_condensate_fraction`, `quantum_metrology`, `subharmonic_response_detector`, `artifact_rejection`, `topological_matter`, `bose_einstein_condensate`.
- DORMANT (no live importer; tested directly).
- **PROOF L86:** `def quantum_metrology(*, n_probes: int, entangled: bool) -> dict:`

### underworld/server/services/experiment_design.py (252 lines)
- purpose: real DoE & lab-analysis algorithms (category F) — LHS/factorial, response surfaces, UCB1 bandit, control/replication/deviation stats, cost, packaging.
- key: `latin_hypercube`, `full_factorial`, `fractional_factorial_2level`, `design_of_experiments`, `ResponseSurface`, `_design_matrix`, `response_surface_fit`, `response_surface_optimum`, `UCB1Bandit`, `active_learning_select`, `control_check`, `replication_manager`, `deviation_logger`, `experiment_cost`, `contamination_carryover`, `parse_result`, `ConfidenceLedger`, `publication_package`.
- WIRED (/worlds/{id}/experiment-design).
- **PROOF L188:** `def deviation_logger(readings: list[float], *, z: float = 3.0) -> list[int]:`

### underworld/server/services/factory.py (151 lines)
- purpose: world + founder-population seeding.
- key: `SeedingPlan`, `default_seeding`, `create_world`, `_spawn_founder`.
- WIRED (routes/worlds create; proof scripts; simulation chain).
- **PROOF L100:** `async def _spawn_founder(`

### underworld/server/services/failure_modes.py (280 lines)
- purpose: failure-modes + safety-engineering layer — FMEA, MTTF, safety-control assessment (pure cores).
- key: `FailureMode`, `FailureRisk`, `_risk`, `fmea`, `mean_time_to_failure`, `SafetyCheck`, `safety_assessment`.
- DORMANT (no live importer; tested directly).
- **PROOF L225:** `def safety_assessment(device: dict) -> dict:`

### underworld/server/services/feature_audit.py (226 lines)
- purpose: honest 500-feature reality census by introspecting the live source tree → PRESENT/PARTIAL/ABSENT.
- key: `Evidence`; `_corpus`, `_variants`, `_keywords`, `audit_feature`, `audit_all`, `coverage_report`, `gaps`.
- WIRED (/worlds/feature-audit).
- **PROOF L185:** `def coverage_report() -> dict:`

### underworld/server/services/feature_catalog.py (530 lines)
- purpose: AUTO-GENERATED data — the 500-feature catalogue + 24 category labels.
- key: `CATEGORIES` dict; `FEATURES` list of {id, category, name} (500 entries).
- WIRED (feature_audit.py imports CATEGORIES/FEATURES).
- **PROOF L496:** `    {'id': 467, 'category': 'X', 'name': 'Standards body engine'},`

### underworld/server/services/gateway.py (115 lines)
- purpose: the Internet Gateway (doc I.75-85) — mastery-gated read-only access to the real scientific record (Crossref + offline fallback).
- key: `PEAK_KNOWLEDGE`, `PEAK_DISCOVERIES`; `world_gateway_open`, `mastered_domains`, `can_pass`, `fetch_dataset`, `consult_gateway`.
- WIRED (simulation.py; /minions/{id}/gateway).
- **PROOF L92:** `async def consult_gateway(session: AsyncSession, minion: Minion, discipline: str, query: str) -> dict:`

### underworld/server/services/goals.py (489 lines)
- purpose: Goal Stack (cognitive Layer 5) — derive a prioritised competing-goal stack from minion state + read-back (top/conflict/action-bias).
- key: `GoalKind` enum, `Goal` dataclass; `derive_goals`, `_rank`, `top_goal`, `goal_conflict`, `_GOAL_ACTIONS`, `action_bias`.
- WIRED (agents/minion.py _minion_goals + action_bias; planning.py).
- **PROOF L406:** `def goal_conflict(goals: Iterable[Goal]) -> tuple[Goal, Goal] | None:`

### underworld/server/services/governance.py (104 lines)
- purpose: emergent government + legal system from population/knowledge/openness (doc I.41-42).
- key: `GOVERNMENTS`, `LEGAL_STAGES`, `_ORDER`; `Society`, `government_for`, `legal_for`, `assess_society`, `tick_governance`.
- WIRED (simulation.py; /worlds/{id}/society).
- **PROOF L82:** `async def tick_governance(session: AsyncSession, world: World) -> dict:`

### underworld/server/services/gpu_backend.py (90 lines)
- purpose: GPU/CPU array-backend selector (CuPy when a GPU is present, else NumPy) for the vectorised rich tick.
- key: `Backend` dataclass (asnumpy/synchronize/rng); `get_backend`, `available_backends`.
- WIRED (scale_bench.py; /worlds/scale-capacity).
- **PROOF L68:** `def available_backends() -> dict:`

### underworld/server/services/graph_extras.py (66 lines)
- purpose: specialised knowledge-graph algorithms (category B remainder) — citation PageRank, cross-domain analogy, idea mutation/recombination.
- key: `citation_graph`, `cross_domain_analogy`, `idea_mutation`, `idea_recombination`, `scientific_citation`.
- DORMANT (no live importer; tested directly).
- **PROOF L56:** `def idea_recombination(idea_a: set[str], idea_b: set[str]) -> dict:`

### underworld/server/services/grid.py (73 lines)
- purpose: electrical grid load + Joule-heating fires once a world electrifies (#42/#47).
- key: `ELECTRIC_ERAS`; `grid_load`, `grid_capacity`, `is_overloaded`, `tick_grid`.
- WIRED (simulation.py per-tick).
- **PROOF L40:** `async def tick_grid(session: AsyncSession, world: World, rng: random.Random) -> str | None:`

### underworld/server/services/guild_structure.py (67 lines)
- purpose: guild→division→specialisation hierarchy mapping 11 guilds onto hundreds of thousands of sciences (niches).
- key: `GUILDS`; `divisions`, `sciences_in_guild`, `guild_hierarchy`, `total_sciences`, `specialisation_for`, `org_summary`.
- WIRED (discovery_lab specialisation; imports taxonomy + science_niches).
- **PROOF L49:** `def specialisation_for(minion_id: str, guild: str) -> dict:`

### underworld/server/services/hydrology.py (54 lines)
- purpose: live water-table dynamics + drought/flood (doc I.6/29).
- key: `_RECHARGE`, `DROUGHT_BELOW`, `FLOOD_ABOVE`; `_evaporation`, `tick_hydrology`.
- WIRED (simulation.py per-tick).
- **PROOF L39:** `    if level < DROUGHT_BELOW:`

### underworld/server/services/instruments.py (226 lines)
- purpose: measurement-instrument model — measure() with uncertainty + instrument gating of unlockable science (pure core).
- key: `Instrument` enum, `_BASE_PRECISION`, `_UNLOCKS`, `_REQUIRED_FOR`, `_QUANTITY_UNIT`; `Measurement`, `base_precision`, `measure`, `instrument_unlocks`, `required_instrument`, `can_measure`, `measurement_limited_science`.
- DORMANT (only imported by discovery_engine, which is itself dormant; tested directly).
- **PROOF L196:** `def required_instrument(quantity: str) -> Instrument | None:`

### underworld/server/services/instruments_lab.py (169 lines)
- purpose: real measurement-science models (category E) — calibration drift, noise/SNR, sensitivity, reproducibility, Bland-Altman, resolution, dependency graph, custody, standardisation.
- key: `calibration_drift`, `needs_recalibration`, `noise_profile`, `sensitivity_curve`, `linear_range`, `reproducibility_score`, `comparison_test`, `resolution_limit`, `contamination_risk`, `misuse_risk`, `dependency_graph`, `upgrade_path`, `ChainOfCustody`, `standardisation`.
- WIRED (/worlds/{id}/instruments-lab).
- **PROOF L122:** `# ── graphs / ledgers ─────────────────────────────────────────────────────────`

### underworld/server/services/invention_pipeline.py (436 lines)
- purpose: #5 empty-gap → autonomous invention-disclosure pipeline (7 pure steps).
- key: `DISCLAIMER`, `Gap`; `detect_gap`, `find_relevant_patents`, `combine`, `simulate`, `peer_review`, `invention_disclosure`, `run_pipeline`.
- WIRED (virtual_cell.py; /worlds/{id}/invent).
- **PROOF L300:** `def invention_disclosure(gap: Gap, candidate: dict, sim: dict, review: dict) -> dict:`

### underworld/server/services/knowledge_decay.py (46 lines)
- purpose: skill atrophy from disuse + library-mitigated forgetting (doc I.64-65).
- key: `GRACE`, `DECAY`, `FLOOR`, `LIBRARY_FACTOR`; `has_library`, `tick_atrophy`.
- WIRED (simulation.py per-tick).
- **PROOF L33:** `async def tick_atrophy(session: AsyncSession, world: World) -> int:`

### underworld/server/services/knowledge_graph.py (274 lines)
- purpose: the keystone civilisation knowledge graph + A-E reality-validation ladder (pure cores).
- key: `ConfidenceClass`, `NodeKind`, `EdgeKind`, `Node`, `Edge`, `KnowledgeGraph` (add_node/edge, prerequisites, can_comprehend, invention_frontier, novelty, validation_breakdown, real_fraction); `classify_patent/principle/invention/belief/narrative`.
- WIRED (virtual_cell, research_director, invention_pipeline; /worlds knowledge-graph/invent/autonomous-research).
- **PROOF L192:** `    def novelty(self, prereq_ids: Iterable[str]) -> dict:`

### underworld/server/services/lab_systems.py (75 lines)
- purpose: lab-information software (category G software side) — LIMS, registries, protocol compiler, scheduler, error detection (physical actuation deliberately omitted).
- key: `LIMS`; `assay_registry`, `reagent_inventory`, `robotic_protocol_compiler`, `lab_task_scheduler`, `robotic_error_detection`.
- DORMANT (no live importer; tested directly).
- **PROOF L59:** `def lab_task_scheduler(tasks: list[dict]) -> dict:`

### underworld/server/services/lifecycle.py (816 lines)
- purpose: population mechanics — birth/death/breeding/forking, needs/mood/stress, growth, reincarnation, guild competition, ghost guidance, population floor (doc Section II + I.31).
- key: naming helpers; `maybe_nickname`, `guild_from_dna`, `derive_mood`, `appraise`, `decay_needs`, `life_stage`, `capability`, `is_night`, `circadian_factor`, `growth_multiplier`, `tick_health`, `replenish`, `determine_death`, `kill`, `_new_soul`/`_resurrect_soul`/`_make_minion`, `breed_pair`, `fork_minion`, `_ensure_relationship`, `pair_socialise`, `can_breed`, `guild_standings`, `apply_guild_competition`, `ghost_guidance`, `alive_count`, `reincarnate_to_floor`.
- WIRED (agents/minion.py, factory, climate, scene_state, /minions breed/fork/kill).
- **PROOF L526:** `    # Doc II.119 — parenting quality: capable, well-regarded, low-stress parents`

### underworld/server/services/manufacturing.py (173 lines)
- purpose: manufacturing tolerance + supply-chain depth layer — process capability gate, dependency-tree expansion, yield (pure core).
- key: `Process` enum, `_PROCESS_PRECISION`; `process_precision`, `can_manufacture`, `supply_chain`, `yield_rate`.
- DORMANT (no live importer; tested directly).
- **PROOF L157:** `def yield_rate(process_precision_val: float, complexity: float) -> float:`

### underworld/server/services/manufacturing_capability.py (199 lines)
- purpose: real manufacturing process-capability & yield (category K) — Cp/Cpk, control charts, Poisson/Murphy yield, ISO cleanroom, per-process capability, scale-up, recipe, bottleneck.
- key: `cp`, `cpk`, `control_limits`, `out_of_control`, `poisson_yield`, `murphy_yield`, `wafer_yield`, `defect_rate_ppm`, `iso_cleanroom_class`, `cleanroom_gate`, `process_capable`, `scale_up_risk`, `recipe_compile`, `bottleneck`, `statistical_process_control`, `quality_control`, `yield_prediction`, `supply_substitution`, `tooling_requirements`, `process_recipe_compiler`.
- WIRED (/worlds/{id}/manufacturing).
- **PROOF L151:** `def statistical_process_control(samples: list[float], *, k: float = 3.0) -> dict:`

### underworld/server/services/mastery.py (64 lines)
- purpose: mastery threshold + community knowledge totals (doc I.68-70).
- key: `MASTERY_THRESHOLD`; `is_master`, `crossed_mastery`, `list_masteries`, `world_knowledge`.
- WIRED (agents/minion.py + many services + simulation).
- **PROOF L43:** `    skill_sum = await session.scalar(`

### underworld/server/services/materials_advanced.py (83 lines)
- purpose: advanced-materials models (category J) — defects, impurities, phase diagram, BCS Tc, bandgap, corrosion, Griffith toughness, Wiedemann-Franz.
- key: `defect_density`, `impurity_profile`, `phase_diagram`, `superconductor_candidate`, `semiconductor_candidate`, `corrosion_model`, `fracture_toughness`, `thermal_conductivity`, `electrical_conductivity`.
- WIRED (minion_research → reachable from minion discovery chain).
- **PROOF L67:** `def fracture_toughness(*, stress: float, crack_length: float, geometry: float = 1.0) -> dict:`

### underworld/server/services/math_advanced.py (94 lines)
- purpose: real symbolic mathematics via SymPy (CAS) — solve/integrate/differentiate/prove/ODE/linear algebra/number theory.
- key: `solve_equation`, `integrate`, `differentiate`, `prove_identity`, `solve_ode`, `matrix_analysis`, `number_theory`, `limit`, `series_expansion`.
- WIRED (minion_research / field_science chains).
- **PROOF L69:** `def number_theory(n: int) -> dict:`

### underworld/server/services/memes.py (81 lines)
- purpose: memetics — replicating/evolving fads/fashion/ideas (doc I.142-143).
- key: `SPREAD/DECAY/MUTATE_P/CULL_BELOW`, `_SLANG`; `seed_meme`, `tick_memes`.
- WIRED (simulation.py per-tick).
- **PROOF L54:** `    mutated = 0`

### underworld/server/services/memory.py (285 lines)
- purpose: cognitive Memory layer (Layer 3) — typed traces + forgetting/consolidation/salient-recall/dream-recombine (pure core).
- key: `MemoryType`, `MemoryTrace`; `_contains_any`, `classify`, `decay_strength`, `reinforce`, `consolidate`, `salient_recall`, `dream_recombine`.
- WIRED (agents/minion.py uses memory_mod.classify on every stored memory).
- **PROOF L228:** `def salient_recall(`

### underworld/server/services/minion_chat.py (278 lines)
- purpose: direct in-character chat with a minion grounded in live state (Kimi LLM + local fallback).
- key: `_trait_word`, `_personality_adjectives`, `_vital_words`, `_full_name`, `build_system_prompt`, `_local_reply`, `_kimi_reply`, `reply`.
- WIRED (/minions/{id}/chat).
- **PROOF L238:** `async def reply(`

### underworld/server/services/minion_research.py (165 lines)
- purpose: research dispatcher routing each guild's craft to a REAL engine + quality score.
- key: per-guild handlers `_materials/_physics/_electrical/_mechanical/_civil/_computing/_energy/_maths/_agriculture`; `_DISPATCH`; `run_research(guild, seed)`.
- WIRED (discovery_lab.discover → reachable from minion.run_tick; imports many advanced engines).
- **PROOF L148:** `def run_research(guild: str, *, seed: int) -> dict:`

### underworld/server/services/mlmodels.py (60 lines)
- purpose: in-world trainable ML models on a saturating learning curve gated by computing skill (doc I.58).
- key: `SAMPLE_SCALE`, `FLOOR`; `ceiling_for_skill`, `accuracy_for`, `train`, `classify`, `models_for`.
- WIRED (/minions/{id}/models + train-model).
- **PROOF L51:** `def classify(model: MLModel, rng: random.Random) -> bool:`

### underworld/server/services/molecular_dynamics.py (119 lines)
- purpose: real molecular dynamics (velocity-Verlet Lennard-Jones NVE) + Gillespie SSA stochastic kinetics.
- key: `_lj_forces`, `run_md`, `gillespie`.
- WIRED (minion_research._materials; field_science).
- **PROOF L79:** `def gillespie(species: dict[str, int], reactions: list[dict], *,`

### underworld/server/services/molecular_genetics.py (219 lines)
- purpose: real molecular genetics — dsDNA helix, melting/denaturation, working CRISPR-Cas9 editor, nucleotide colours.
- key: `BASES`, `BASE_COLOR`; `is_dna`, `complement_strand`, `reverse_complement`, `gc_content`, `Helix`/`double_helix`, `melting_temperature`, `MeltState`/`denature`, `melt_order`, `find_pam_sites`, `CutSite`/`find_targets`, `EditResult`/`crispr_edit`, `colorize`, `helix_view`.
- WIRED (activities.gene_edit; field_science).
- **PROOF L167:** `def crispr_edit(seq: str, guide: str, *, insert: str = "", delete: int = 0,`

### underworld/server/services/multiphysics.py (277 lines)
- purpose: real multiphysics solvers (category M) — rigid body, thermo, heat diffusion, beams, acoustics, EM, optics, fluids, relativity, plasma, coupling.
- key: ~30 fns incl. `rigid_body_step`, `ideal_gas_pressure`, `heat_diffusion_1d`, `beam_tip_deflection`, `snell_refraction`, `finite_element_1d`, `thermodynamic_solver`, `fluid_network_solver`, `shallow_water_solver`, `relativity_approximation`, `combustion_model`, `rf_propagation`, `multiphysics_couple`.
- WIRED (/worlds/{id}/multiphysics; minion_research/field_science).
- **PROOF L170:** `def fluid_network_solver(pipes: list[dict], *, dp: float, viscosity: float) -> dict:`

### underworld/server/services/neural.py (86 lines)
- purpose: per-minion pure-Python MLP policy — innate DNA-derived weights + learned output biases (doc II.101).
- key: `ACTIONS`; `_seed`, `_features`, `_innate`, `_forward`, `policy`, `choose`, `learn`.
- WIRED (agents/minion.py choose/learn; /minions/{id}/brain).
- **PROOF L62:** `def policy(m) -> dict[str, float]:`

### underworld/server/services/oracle.py (67 lines)
- purpose: Socratic Oracle (doc I.56-57) — only probing questions/hints, never direct answers; LLM + deterministic fallback.
- key: `SOCRATIC_SYSTEM`, `_REVEAL`; `_related_concept`, `_socratic_fallback`, `_ensure_socratic`, `consult`.
- WIRED (/knowledge/oracle).
- **PROOF L54:** `async def consult(question: str, *, discipline: str | None = None) -> dict:`

### underworld/server/services/paleontology.py (94 lines)
- purpose: geological strata + fossil record, era-gated excavation (doc I.14-15).
- key: `_PREHISTORY`, `ERA_REACH`; `reach_for`, `seed_fossils`, `excavate`, `tick_paleontology`.
- WIRED (simulation.py; /worlds/{id}/fossils uses reach_for).
- **PROOF L86:** `async def tick_paleontology(session: AsyncSession, world: World, rng: random.Random) -> Fossil | None:`

### underworld/server/services/patent_intel.py (152 lines)
- purpose: real patent-intelligence & invention models (categories H+I) — CPC classify, claim parsing, obviousness/novelty/FTO, TRL, licensing, public-domain mining.
- key: `cpc_classify`, `chunk_claims`, `is_independent_claim`, `link_dependent_claims`, `obviousness_score`, `novelty_score`, `freedom_to_operate`, `claim_skeleton`, `prototype_bom`, `trl_graph`, `use_case_map`, `licensing_scenario`, `public_domain_miner` + canonical aliases.
- DORMANT (no live importer — the live patent analysis path uses tools/patent_intelligence; tested directly).
- **PROOF L98:** `def trl_graph(milestones: dict[int, bool]) -> dict:`

### underworld/server/services/photonics.py (176 lines)
- purpose: real photonics/optical-computing models (category O) — lenses, lasers, fibres, interferometers, microrings, detectors, optical matmul.
- key: `lensmaker`, `thin_lens_image`, `telescope_magnification`, `laser_threshold`, `fibre_numerical_aperture`, `fibre_attenuation`, `mach_zehnder`, `microring`, `optical_loss_budget`, `photodetector`, `optical_matrix_multiply`, `photonic_neural_layer`, `fibre_optics`, `microring_resonator`, `photodetector_noise`, `microscope_optics`, `telescope_optics`, etc.
- WIRED (/worlds/{id}/photonics).
- **PROOF L145:** `def microscope_optics(*, wavelength_nm: float, numerical_aperture: float) -> dict:`

### underworld/server/services/physics_advanced.py (128 lines)
- purpose: advanced physics — VQE (variational quantum eigensolver vs exact FCI) + symplectic leapfrog N-body gravity.
- key: Pauli ops, `H2_HAMILTONIAN`; `build_hamiltonian`, `exact_ground_energy`, `_ansatz_state`, `vqe`, `_accel`, `_energy`, `nbody`.
- WIRED (field_science → reachable from minion discovery chain).
- **PROOF L108:** `def nbody(pos, vel, mass, *, g: float = 1.0, dt: float = 0.001, steps: int = 5000,`

### underworld/server/services/planning.py (109 lines)
- purpose: deliberative decision-making — tree-of-thought + Monte-Carlo rollouts biased by beliefs + goal_bias (doc I.126).
- key: `State`; `_PRODUCTIVE`, `_apply`, `_immediate`, `_rollout`, `plan_action`.
- WIRED (agents/minion.py plan_action; imports goals via minion).
- **PROOF L74:** `def plan_action(`

### underworld/server/services/pollution.py (50 lines)
- purpose: industrial pollution accumulation + health harm (doc I.36).
- key: `_ERA_EMISSION`, `DECAY`, `HARM_THRESHOLD`; `emission`, `tick_pollution`.
- WIRED (simulation.py per-tick).
- **PROOF L39:** `    if world.pollution > HARM_THRESHOLD:`

### underworld/server/services/progression.py (198 lines)
- purpose: tech-era progression + Patent Scanner build + Ascension mechanics (doc I.22/50-54, II.37-40, III.3-9).
- key: `Era`, `ERAS`; `_era_index`, `unlocked_actions`, `update_era`, `scanner_advance`, `scanner_ready`, `can_ascend`, `try_ascend`.
- WIRED (agents/minion.py + simulation + sagas).
- **PROOF L141:** `async def can_ascend(session: AsyncSession, minion: Minion, world: World) -> tuple[bool, str]:`

### underworld/server/services/projects.py (286 lines)
- purpose: research-project validation pipeline (Master Ref Section 8) — clinical/genetic/chem-synth escalation through staged contributions.
- key: `_pipeline_for`, `maybe_create_project`, `_next_stage`, `_eligible_contributor`, `_stage_flags`, `tick_projects`, `_previous_stage_name`, `world_project_counts`.
- WIRED (simulation.py per-tick; registered indirectly via main import).
- **PROOF L160:** `async def tick_projects(`

### underworld/server/services/proteins.py (151 lines)
- purpose: real protein/molecular-biology models (category S) — MW, GRAVY, charge, Michaelis-Menten, binding/Kd-ΔG, stability, docking, interaction networks.
- key: `molecular_weight`, `gravy`, `composition`, `net_charge`, `michaelis_menten`, `binding_affinity`, `dissociation_constant`, `protein_stability`, `docking_score`, `interaction_network`, `mutation_effect`, `enzyme_kinetics_model`, `binding_pocket_detector`, `ligand_docking`, `antibody_candidate`, `molecular_dynamics`, `molecular_mechanism_graph`, `drug_target_interaction`.
- DORMANT (no live importer; tested directly).
- **PROOF L91:** `def mutation_effect(seq: str, position: int, new_aa: str) -> dict:`

### underworld/server/services/puzzles.py (122 lines)
- purpose: empty-dataset research puzzles solved by combining expired patents → in-world patent + real-world draft (doc I.82-85).
- key: `_GAPS`; `open_gaps`, `generate`, `_draft`, `solve`.
- WIRED (simulation.py; /worlds gaps + solve).
- **PROOF L83:** `async def solve(`

### underworld/server/services/quantum_chemistry.py (79 lines)
- purpose: real ab-initio quantum chemistry via PySCF — HF/DFT ground-state energy, HOMO-LUMO, dipole, bond scan.
- key: `_build`, `molecule_energy`, `_homo_lumo`, `dipole_moment`, `bond_scan`.
- WIRED (minion_research._materials; field_science).
- **PROOF L54:** `def dipole_moment(atom: str, *, basis: str = "sto-3g") -> dict:`

### underworld/server/services/quantum_sim.py (279 lines)
- purpose: real state-vector/density-matrix quantum simulator (category P) — gates, measurement, Bell/GHZ, entanglement, CHSH, decoherence, platforms.
- key: `QuantumState`; `apply_gate`, `run_circuit`, `probabilities`, `measure`, `bell_state`, `ghz_state`, `von_neumann_entropy`, `concurrence`, `is_entangled`, `chsh_value`, `evolve`, `amplitude/phase_damping`, `state_vector_simulator`, `entanglement_detector`, `decoherence_engine`, `error_mitigation`, `logical_qubit_error`, `qubit_platform` + platform models.
- WIRED (/worlds/{id}/quantum; minion_research._computing).
- **PROOF L184:** `def state_vector_simulator(n: int, ops: list[tuple], *, shots: int = 1024) -> dict:`

### underworld/server/services/real_materials.py (166 lines)
- purpose: real materials ML on the Yeh concrete dataset — k-fold CV performance, feature importance, Bayesian mix design.
- key: `FEATURES`, `TARGET`, `Dataset`; `load`, `_gp_pipeline`, `cross_validated_performance`, `feature_importance`, `design_optimal_mix`.
- WIRED (/worlds/{id}/materials; ai_model.py).
- **PROOF L117:** `def feature_importance(*, seed: int = 0) -> dict:`

### underworld/server/services/real_optimizer.py (257 lines)
- purpose: real Bayesian optimization — sklearn GP surrogate + EI/UCB + benchmark validation vs random search.
- key: `Benchmark`, benchmark fns (`_branin/_hartmann6/_ackley`), `BENCHMARKS`; `make_gp`, `expected_improvement`, `upper_confidence_bound`, `bayes_optimize`, `random_search`, `benchmark_vs_random`, `bayesian_optimisation_planner`.
- WIRED (/worlds/{id}/optimize; real_materials, self_driving_lab).
- **PROOF L221:** `def benchmark_vs_random(name: str, *, seeds: int = 10, n_init: int = 5,`

### underworld/server/services/reasoning.py (95 lines)
- purpose: causal reasoning (doc I.23) — wellbeing scalar + cause→effect belief update + reflect/meta-cognition.
- key: `MIN_TRIALS_TO_ACT`, `ACT_CONFIDENCE`; `wellbeing`, `_confidence`, `record`, `beliefs`, `best_action`, `reflect`.
- WIRED (agents/minion.py; /minions/{id}/beliefs).
- **PROOF L66:** `async def best_action(`

### underworld/server/services/religion.py (101 lines)
- purpose: emergent religion/philosophy worldview from population traits + understanding (doc I.46, II.133-134).
- key: `Culture`; `dominant_worldview`, `stance_for`, `assess_culture`, `tick_culture`.
- WIRED (simulation.py; /worlds/{id}/culture).
- **PROOF L88:** `async def tick_culture(session: AsyncSession, world: World) -> str | None:`

### underworld/server/services/research_agents.py (93 lines)
- purpose: deterministic multi-agent research-team orchestration (category W) — roles, task assignment, consensus, red-team, pipeline.
- key: `ROLE_SKILLS`, `Agent`; `research_swarm`, `assign_tasks`, `consensus`, `red_team_score`, `pipeline_stage`.
- DORMANT (no live importer; tested directly).
- **PROOF L68:** `def consensus(reviews: list[dict]) -> dict:`

### underworld/server/services/research_director.py (220 lines)
- purpose: self-directing research brain that picks frontier targets, runs lab campaigns, folds validated results back as confidence-classed knowledge (spec §21.4).
- key: `ResearchTarget`, `DiscoveryOutcome`; `choose_target`, `compile_protocol`, `_classify`, `run_cycle`, `autonomous_program`.
- WIRED (/worlds/{id}/autonomous-research; imports self_driving_lab + knowledge_graph).
- **PROOF L176:** `def autonomous_program(`

### underworld/server/services/robotic_lab.py (140 lines)
- purpose: physics-based digital-twin SIMULATIONS of robotic lab actuators (#131-137), explicitly not hardware.
- key: `SIM`, `_noise`; `pipetting`, `thermal`, `imaging`, `synthesis`, `sequencing`, `cleaning`; `MODULES`; canonical `robotic_*` wrappers.
- WIRED (/worlds/{id}/lab-sim).
- **PROOF L103:** `MODULES = {"pipetting": pipetting, "heating": thermal, "cooling": thermal,`

### underworld/server/services/roles.py (161 lines)
- purpose: swarm-role assignment from guild+DNA + regulated-domain (clinical/genetic/chem-synth) detection.
- key: `_CLINICAL/_GENETIC/_CHEM_PATTERNS`; `DomainFlags`, `_any_match`, `detect_domain`, `_GUILD_ROLE_BIAS`, `assign_role`.
- WIRED (factory, lifecycle, projects).
- **PROOF L117:** `def assign_role(guild: GuildKind, dna: str) -> SwarmRoleKind:`

### underworld/server/services/sagas.py (308 lines)
- purpose: procedural storyline engine — archetype × cast × guild × epoch sagas that grant real development benefits (learning/morale/sanity).
- key: `Archetype`, `ARCHETYPES`, `Saga`; `_fill`, `instantiate`, `current_beat`, `advance`, `benefits`, `choose_archetype`, `tick_sagas`.
- WIRED (simulation.py per-tick; imports epochs/progression).
- **PROOF L200:** `async def tick_sagas(session, world, rng, *, max_new: int = 2, max_active: int = 40) -> dict:`

### underworld/server/services/scale_bench.py (157 lines)
- purpose: vectorised full-richness rich-tick benchmark proving Minions scale to millions on GPU/CPU + LLM-at-scale capacity math.
- key: `rich_tick`, `make_state`, `benchmark`, `bench_curve`, `llm_capacity`.
- WIRED (/worlds/scale-capacity; imports gpu_backend).
- **PROOF L135:** `def llm_capacity(*, n_minions: int, deliberation_interval_ticks: int,`

### underworld/server/services/scene_state.py (218 lines)
- purpose: canonical renderer-agnostic scene state (positions/anim/appearance/saga + world frame) as backend source of truth.
- key: `ANIM_*`, `GUILD_LOOK`; `_position`, `_elevation`, `_anim_for`, `_tod_phase`, `_life_stage`, `_season_for`, `_companion_for`, `minion_visual`, `time_of_day`, `build_scene_state`.
- WIRED (/worlds/{id}/scene-state; imports lifecycle + behavior).
- **PROOF L182:** `def build_scene_state(world, seed, minions, *, heightmap=None, weather: str = "clear",`

### underworld/server/services/scheduler.py (201 lines)
- purpose: background auto-advance loop + SSE event bus (doc I.97).
- key: `publish`, `subscribe`, `_drain_new_events`, `_tick_one_world`, `_scheduler_loop`, `autostart_all_worlds`, `start`, `stop`.
- WIRED (main lifespan start/stop; /worlds advance + stream; imports simulation).
- **PROOF L162:** `async def autostart_all_worlds() -> int:`

### underworld/server/services/science.py (150 lines)
- purpose: minion-facing science tooling (#71-80) — Bayes, measurement stats/calibration, CI, replication, unit-checked formula parser, prior-art graph, mastery, constrained optimiser.
- key: `bayes_update`, `measurement_stats`, `calibrate`, `confidence_interval`, `is_established`, `parse_equation`, `_overlap`, `prior_art_graph`, `mastery_by_demonstration`, `optimize`.
- WIRED (/science routes; discovery_engine references; registered via main).
- **PROOF L106:** `def prior_art_graph(patents: list[dict]) -> list[dict]:`

### underworld/server/services/science_niches.py (115 lines)
- purpose: ~104k generative science niches (field × modifier × regime) each resolving to a real field_science sim + a rendered physics-law formula.
- key: `MODIFIERS`, `REGIMES`, `_LAW_IDS`; `niche_count`, `formula_count`, `iter_niches`, `_eval_law`, `_evaluate_formula`, `simulate_niche`, `simulate_niche_id`, `summary`.
- WIRED (guild_structure, discovery_lab; imports field_science).
- **PROOF L90:** `def simulate_niche(field: str, modifier: str, regime: int, *, seed: int = 0) -> dict:`

### underworld/server/services/self_driving_lab.py (308 lines)
- purpose: closed-loop autonomous-science engine (frontier §21) — experiment-as-code Protocol, active-learning campaign, provenance.
- key: `AutonomyLevel`, `Protocol`, `Run`, `Campaign`; `candidate_points`, `surrogate`, `select_next`, `execute`, `run_campaign`, `campaign_report`, `real_continuous_campaign`.
- WIRED (research_director; /worlds/{id}/lab-campaign).
- **PROOF L242:** `def campaign_report(camp: Campaign) -> dict:`

### underworld/server/services/simulation.py (544 lines)
- purpose: the per-tick simulation engine — runs every minion's tick, breeding/forks/deaths, reviews, all world systems (climate/disease/economy/etc.), snapshots, sagas, reincarnation floor.
- key: `TickReport`, `_payload`, `_population_floor`, `_gather_neighbours`, `_process_breeding`, `_process_forks`, `_process_deaths`, `_write_snapshot`, `advance_world`.
- WIRED (scheduler + /worlds advance; imports minion/reviewer agents + ~30 world-system services).
- **PROOF L281:** `        for m in alive_minions:`

### underworld/server/services/simulation_quality.py (156 lines)
- purpose: real V&V / uncertainty-quantification (category D) — Richardson, convergence, ensemble UQ, credibility, cost, artifact detection.
- key: `richardson_extrapolation`, `observed_order`, `convergence_tracker`, `ensemble_uncertainty`, `uncertainty_score`, `solver_credibility`, `simulation_cost`, `reality_depth_index`, `artifact_detector`, `hidden_truth_layer`, `civilisation_reality_index`.
- WIRED (/worlds/{id}/simulation-quality).
- **PROOF L104:** `def artifact_detector(series: list[float], *, spike_z: float = 5.0) -> dict:`

### underworld/server/services/society.py (161 lines)
- purpose: real society/institutions/education models (category X) — labour market, funding, institutions, education transfer, credentialing, journals.
- key: `labour_market`, `expert_scarcity`, `funding_allocation`, `institution_formation`, `institutional_credibility`, `knowledge_transfer`, `curriculum_evolution`, `credentialing`, `academic_politics`, `peer_review_network`, `school_system`, `apprenticeship`, `university_formation`, `laboratory_institution`, `journal_publication`, `technology_transfer_office`, `library_redundancy`, `language_translation`.
- DORMANT (no live importer; tested directly).
- **PROOF L112:** `def school_system(*, students: int, teachers: int, capacity_per_teacher: int = 25) -> dict:`

### underworld/server/services/spice_sim.py (92 lines)
- purpose: real in-world SPICE circuit simulator via Modified Nodal Analysis (#253) — digital twin, not hardware.
- key: `SIMULATION`; `solve_dc`, `transient`, `circuit_simulate`.
- WIRED (/worlds/{id}/lab-sim action='spice').
- **PROOF L75:** `def transient(netlist: list[dict], n_nodes: int, *, cap_node: int, capacitance: float,`

### underworld/server/services/standards.py (199 lines)
- purpose: standards & units scaffolding — unit-system maturity, calibration, tolerance class, interchangeable-parts milestone (pure core).
- key: `_get`, `_clamp`, `_band_for`, `unit_system_maturity`, `calibrate`, `tolerance_class`, `interchangeability`, `standards_gaps`.
- DORMANT (no live importer; tested directly).
- **PROOF L153:** `def interchangeability(parts: list[dict], *, grade: str = _DEFAULT_GRADE) -> dict:`

### underworld/server/services/structural_health.py (50 lines)
- purpose: structural fatigue → Griffith-critical collapse + maintenance (#7/#24/#25).
- key: `BASE_CYCLE/QUAKE_FACTOR/MAINT_FACTOR/CRITICAL`; `crack_growth`, `tick_structures`.
- WIRED (simulation.py per-tick).
- **PROOF L36:** `    if fatigue >= CRITICAL:`

### underworld/server/services/structure_folding.py (92 lines)
- purpose: real structure folding — Nussinov nucleic-acid secondary structure + Chou-Fasman protein secondary structure.
- key: `_PAIRS`, `_can_pair`, `nussinov`, `protein_secondary_structure`.
- WIRED (field_science → reachable from minion discovery chain).
- **PROOF L74:** `def protein_secondary_structure(seq: str) -> dict:`

### underworld/server/services/substances.py (57 lines)
- purpose: stimulants & addiction trade-off (doc II.148-149).
- key: `RELIEF/ADDICT_GAIN/TOLERANCE/WITHDRAWAL/...`, `AVAILABLE_ERAS`; `use_stimulant`, `tick_addiction`, `wants_stimulant`.
- WIRED (simulation.py per-tick).
- **PROOF L40:** `def tick_addiction(m: Minion, *, used: bool) -> None:`

### underworld/server/services/supply_chain.py (211 lines)
- purpose: real supply-chain / operations-research models (category L) — dependency/bottleneck, HHI, EOQ, depletion, trade flow, disruption, forecasting, reliability, recycling, criticality.
- key: `supply_dependency`, `bottleneck_risk`, `source_concentration`, `economic_order_quantity`, `reorder_point`, `strategic_reserve_coverage`, `resource_depletion`, `trade_flow_balance`, `disruption_impact`, `inventory_forecast`, `supplier_reliability`, `recycling_loop`, `procurement_optimisation`, `_criticality`, dependency variants, `tool_dependency`.
- WIRED (/worlds/{id}/supply-chain).
- **PROOF L136:** `def inventory_forecast(history: list[float], *, horizon: int = 3, alpha: float = 0.4) -> dict:`

### underworld/server/services/synbio.py (182 lines)
- purpose: real synthetic-biology / bioengineering models (category U) — guide RNA, genetic circuits, Monod fermentation, bioreactor, codon opt, delivery vectors, biosecurity.
- key: `gc_content`, `guide_rna_score`, `off_target_risk`, `crispr_design`, `genetic_circuit`, `synthetic_promoter`, `monod_growth`, `fermentation`, `bioreactor`, `codon_optimise`, `delivery_vehicle`, `containment_risk`, `biosecurity_screen`, `biosensor_organism`, `gene_therapy_vector`, `biomanufacturing_process`, `fermentation_optimisation`, `biosecurity_risk`, `tissue_engineering`.
- WIRED (minion_research._agriculture imports synbio; imports bio_genetics).
- **PROOF L119:** `def delivery_vehicle(*, payload_size_kb: float, vector: str = "AAV") -> dict:`

### underworld/server/services/taxonomy.py (304 lines)
- purpose: generative civilisation-scale taxonomies — fields/verbs/methods/subjects → millions of concrete actions, ~160 emotions, ~120 roles, 18 life-stages.
- key: `FIELDS_BY_GUILD`, `CIVIC_FIELDS`, `FIELD_GUILD`, `ALL_FIELDS`, `ALL_VERBS`, `ROLES`, `EMOTIONS`, `LIFE_STAGES`; `subjects_for`, `verbs_for`, `action_count`, `total_action_states_over_life`, `iter_actions`, `concrete_action`, `emote_anim`, `emotion_valence`, `stage_verbs`, `stage_for_age`, `counts`.
- WIRED (behavior.py, guild_structure, science_niches, discovery_lab, scene_state).
- **PROOF L191:** `def concrete_action(coarse: str, *, guild: str, field: str | None = None,`

### underworld/server/services/tectonics.py (54 lines)
- purpose: live plate-tectonics stress + earthquakes (doc I.28).
- key: `BUILD_BASE`, `QUAKE_THRESHOLD`; `tectonic_activity`, `_apply_quake`, `tick_tectonics`.
- WIRED (simulation.py per-tick).
- **PROOF L44:** `async def tick_tectonics(session: AsyncSession, world: World, rng: random.Random) -> float | None:`

### underworld/server/services/temporal_nodes.py (160 lines)
- purpose: real temporal/versioned knowledge nodes (category A) — validity intervals, causal chains, counterfactual forks, lineage, disputes, open questions.
- key: `TemporalNode`, `CausalEdge`; `temporal_query`, `theory_versions`, `forgotten_knowledge`, `rediscovery_path`, `causal_chain`, `counterfactual_fork`, `anomaly_trigger`, `discovery_lineage`, `evidence_chain`, `causal_mechanism`, `lost_technology`, `scientific_dispute`, `obsolete_theory`, `competing_theory_clusters`, `open_question`.
- DORMANT (no live importer; tested directly).
- **PROOF L110:** `def evidence_chain(observations: list[dict]) -> dict:`

### underworld/server/services/timescale.py (27 lines)
- purpose: dynamic in-world calendar time-scaling — fast early ages, slow complex ages (doc I.16).
- key: `MAX/MIN_YEARS_PER_TICK`, `_ERA_INDEX`; `complexity`, `years_per_tick`.
- WIRED (simulation.py per-tick).
- **PROOF L25:** `def years_per_tick(*, population: int, inventions: int, era: str) -> float:`

### underworld/server/services/virtual_cell.py (309 lines)
- purpose: flagship virtual-cell disease-mechanism → cure-candidate discovery pipeline, confidence-classed, candidate-only.
- key: bio entity kinds; `evidence_confidence`, `mechanism_graph`, `perturbation_hypotheses`, `target_shortlist`, `intervention_candidates`, `validation_plan`, `discover`; imports knowledge_graph + invention_pipeline + ethics.
- WIRED (/worlds/{id}/discover-cure).
- **PROOF L255:** `def discover(disease: str, evidence: list[dict], patent_pool: list[dict] | None = None,`

### underworld/server/services/world_model.py (214 lines)
- purpose: hybrid world model (#1) — perception (biased/uncertain), imagination (forward model), counterfactual experiment engine (pure functions).
- key: `Percept`, `perceive`; `imagine`, `best_imagined`; `CounterfactualResult`, `counterfactual`, `_clamp01`.
- WIRED (/worlds/{id}/counterfactual).
- **PROOF L178:** `def counterfactual(`
