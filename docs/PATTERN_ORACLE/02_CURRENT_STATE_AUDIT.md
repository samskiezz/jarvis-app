# 02 · CURRENT STATE AUDIT — exhaustive code inventory (PATTERN ORACLE)

**Document class:** ISO-depth code audit (companion to `00_MASTER_INDEX.md`).
**Method:** every file below was read in full; public signatures, algorithms, exact `file:line` locations and short load-bearing quotes are recorded verbatim. Nothing here is inferred from filenames.
**Scope of repo:** TWO disjoint Python backends — `server/` (JARVIS) and `underworld/server/` (Underworld sim) — plus a React/Vite frontend under `src/`.

> **Headline finding (verified):** the prediction system that is actually LIVE (`POST /functions/predict`) is `server/services/prediction.py` — five closed-form forecasters, no learning, no DB, a 5-minute in-memory cache. Everything described as "temporal networks / clusters / 464-method registry / GP optimizer / GPU backend" lives in the OTHER backend (`underworld/server/`). The two backends share no process, no import path, no router. JARVIS `predict` reaches the Underworld code only via a **best-effort soft import of exactly three modules** (`methods_seismology`, `methods_robotics`, `aerospace`), and even those fall back to native math when the import fails (`prediction.py:46-61`).

---

## 1 · MODELING / PREDICTION CODE (exact signatures + algorithm)

### 1.1 `server/services/prediction.py` — the flagship LIVE engine (1147 lines)

Single entry point `predict(question, params)`. Pipeline: `classify` → load data → domain forecaster → assemble honest schema. **Never raises** on a normal question — wraps everything and returns a structured `insufficient_data` result (`predict` at `prediction.py:748-778`; `_insufficient` at `:708-727`).

**Soft dependency on Underworld (the ONLY cross-backend link), `prediction.py:44-61`:**
```python
try:
    from underworld.server.services import methods_seismology as _SEIS
    from underworld.server.services import methods_robotics as _ROB
    from underworld.server.services import aerospace as _AERO
    _UW = { "gutenberg_richter_b_value": _SEIS..., "omori_aftershock_rate": ...,
            "energy_from_magnitude": ..., "projectile_range": ..., "orbital_period": ... }
except Exception:   # any failure -> fall back to native maths
    _UW = {}; _UW_AVAILABLE = False
```
Note: it does NOT import the 464-method registry, the GP optimizer, temporal_nodes, knowledge_graph, world_model, or any learning code. Only those 5 named functions, all of which have native fallbacks.

**Public forecaster signatures + algorithm:**

| Function | `file:line` | Signature | What it computes |
|---|---|---|---|
| `gbm_montecarlo_forecast` | `:243` | `(values, horizon_steps, *, timestamps=None, n_paths=10000, seed=42) -> dict` | Log-returns → drift μ, vol σ (per step); annualises σ/√dt. Terminal GBM `P_h = P0·exp((μ−½σ²)h + σ·Z·√h)` over 10 000 paths; reports pct 5/25/50/75/95 + P(up). Blends 50/50 with a Holt linear-trend (α=0.3, β=0.1, floored at 0). |
| `gutenberg_richter_poisson` | `:328` | `(magnitudes, *, target_magnitude, horizon_days, catalog_days, mc=None) -> dict` | G-R `log10 N(≥M)=a−b·M` (Aki/Utsu MLE b-value; reuses `_UW` else native); `λ=10^(a−b·M_target)/catalog_days`; `P(≥1 in T)=1−exp(−λT)` (Poisson). |
| `omori_aftershock_probability` | `:402` | `(*, K, c_days, p, t_days, horizon_days) -> dict` | Modified Omori-Utsu `n(t)=K/(t+c)^p`; cumulative count over horizon (closed form, `p=1` log branch); `P=1−exp(−N)`. |
| `great_circle_forward` | `:433` | `(*, lat, lng, alt_m=0.0, speed_mps, heading_deg, vertical_rate_mps=0.0, minutes) -> dict` | Haversine direct geodesic on a sphere (R=6371 km) forward-steps a state vector; alt += vertical_rate·t. |
| `fit_growth_series` | `:491` | `(values, horizon_steps, *, timestamps=None) -> dict` | Fits exponential (log-linear OLS, doubling `ln2/r`) AND logistic (grid over K∈[1.05,4.0]×ymax, OLS on logit), picks lower-SSE; CI = point ± 1.96·σ_resid, floored at 0. |

**Data loaders (live network, best-effort):** `load_crypto_series(asset, days=90) -> list[dict]` (`:147`, CoinGecko `/coins/{id}/market_chart`), `load_seismic_catalog(*, min_magnitude=2.5, days=30.0, latitude, longitude, radius_km) -> list[dict]` (`:173`, USGS `fdsnws/event/1/query`). Both return `[]` on any error and cache ~5 min.

**Router:** `classify(question, params=None) -> dict` (`:632`) → `{domain, target, horizon_hours, params, used_llm}`. Tries Kimi LLM extraction first (`_kimi_extract`, `:65`, key-optional, returns None offline) then a regex/keyword fallback. Domains: `crypto | seismic | trajectory | growth | generic`. Helpers: `_parse_horizon_hours` (`:593`, parses "48h", "in 2 days", "by 2029"), `_find_ticker` (`:624`, 18-ticker `_TICKER_TO_ID` map at `:112`).

**Domain handlers** (each assembles the response schema): `_predict_crypto` (`:794`), `_predict_seismic` (`:866`, Omori branch when `mainshock_K`/`omori` present else G-R), `_predict_trajectory` (`:960`, orbital-period / ballistic-range / great-circle branches), `_predict_growth` (`:1076`), `_predict_generic` (`:1134`, reuses growth fitter).

**Response schema (every answer):** `{question, domain, target, horizon, prediction:{value, unit, point_estimate, interval:{low,high,confidence}, probability}, method:{name,family,models_used,math}, drivers, data:{source,as_of,lookback,history,forecast}, assumptions[], caveats[], used_llm}`. Honesty (assumptions/caveats) is structurally mandatory.

**Caching:** module-level `_CACHE: dict[str,(ts,value)]`, `_CACHE_TTL = 300.0` (`:128-141`). **No persistence — predictions are stateless and forgotten.**

**Wiring:** `server/routes/predict.py:27` `@router.post("/functions/predict")` → `predict(req.question, req.params)`; mounted in `server/main.py:24` (`predict_routes.router`). Consumed by `src/pages/PredictionOracle.jsx` via `kimiClient.functions.predict(payload)` (`PredictionOracle.jsx:27`). UI renders point estimate, CI, P, history→forecast chart (recharts `ComposedChart` with shaded band), method/math, drivers, and assumptions+caveats panels.

### 1.2 `underworld/server/services/real_optimizer.py` — Bayesian GP optimizer (DORMANT-ish; wired to a benchmark route)

Real scikit-learn GP surrogate + acquisition, validated against published optima.

- `make_gp(seed=0) -> GaussianProcessRegressor` (`:97`) — `ConstantKernel × Matern(ν=2.5) + WhiteKernel`, `normalize_y=True`, `n_restarts_optimizer=2`.
- `expected_improvement(mu, sigma, best, xi=0.01) -> np.ndarray` (`:109`); `upper_confidence_bound(mu, sigma, beta=2.0)` (`:118`).
- `bayes_optimize(objective, bounds, *, n_init=5, n_iter=25, acquisition="ei", optimum=None, tol=1e-2, seed=0, noise=0.0, cand_pool=512) -> BOResult` (`:137`) — fit GP → score 512 random candidates by acquisition → evaluate best → repeat; reports best-so-far history + regret vs published optimum.
- `random_search(...)` (`:205`) baseline; `benchmark_vs_random(name, *, seeds=10, n_init=5, n_iter=25) -> dict` (`:221`); alias `bayesian_optimisation_planner(...)` (`:254`).
- Benchmarks with literature optima (`:86-93`): `BRANIN` (f\*=0.397887), `HARTMANN6` (−3.32237), `ACKLEY5` (0.0).
- **Wiring:** `underworld/server/routes/worlds.py:1438` `POST /{world_id}/optimize` → `real_optimizer.benchmark_vs_random` / `bayes_optimize` (`worlds.py:1460-1473`). This is an Underworld route, behind `require_bearer`; **JARVIS cannot reach it.**

### 1.3 `underworld/server/services/ai_model.py` — trained sklearn ensemble on real data (DORMANT; tests only)

- `train_and_select() -> dict` (`:35`, `@lru_cache`) — 5-fold CV of `RandomForestRegressor(200)`, `GradientBoostingRegressor(200)`, `MLPRegressor((64,32))` on the Yeh concrete dataset; picks best by mean CV R²; returns honest per-model CV R²/RMSE.
- `predict_strength(features: dict) -> dict` (`:63`); `feature_importance() -> dict` (`:71`).
- Data via `real_materials.load()` (CSV at `underworld/data/real/concrete.csv`, **1030 rows** confirmed). Not on any HTTP route (referenced by `test_ai_model.py`).

### 1.4 `underworld/server/services/ai_models.py` — ML-ops building blocks (DORMANT; tests only)

Pure-numpy primitives the spec wants to reuse for self-improvement, all returning dicts:
- `drift_detector(reference, current, *, bins=10) -> {"psi","drift"}` (`:74`) — **Population Stability Index** (PSI>0.2 = drift).
- `calibration_error(confidences, correct, *, bins=10) -> {"ece","well_calibrated"}` (`:85`) — **Expected Calibration Error**.
- `uncertainty_estimate(ensemble_preds) -> {"mean","std","confident"}` (`:103`) — ensemble predictive spread.
- Plus `model_registry` (`:17`), `dataset_lineage` (`:24`), `data_nutrition` (`:30`), `missingness` (`:41`), `bias_profile` (`:49`), `evaluation_arena` (acc + macro-F1, `:59`), `hallucination_detector` (`:97`), `distillation` (`:110`), `capability_graph` (`:117`), modality trackers (`:125-153`).
- **Not wired to any route.** These are exactly the calibration/drift/ensemble pieces §08 needs — present but unused.

### 1.5 `underworld/server/services/neural.py` — per-Minion MLP (LIVE in sim agent loop)

A tiny pure-Python `10→8→8` policy net. Innate weights are a deterministic LCG seeded from a Minion's DNA (`_innate`, `:34`); learns output-layer biases from reward.
- `policy(m) -> dict[str,float]` (`:62`), `choose(m, candidates) -> str|None` (`:69`), `learn(m, action, reward, *, lr=0.15) -> None` (`:77`).
- Actions: `["study","calculate","kb_lookup","teach","meditate","socialise","search_patents","rest"]`.
- **Not a forecaster** — an agent action-policy. Used by `agents/minion.py`; persisted in `Minion.brain` JSON column. **It is the only "learning" in the repo** (single-bias reinforcement), and it is on the Underworld side, unreachable by `predict`.

---

## 2 · TEMPORAL / GRAPH / CLUSTER CODE — "WHERE ARE THE TEMPORAL NETWORKS & CLUSTERS?"

**Direct answer:** there are three distinct things, all on the Underworld side, none reachable from JARVIS `predict`:

1. **A real temporal knowledge-graph library** — `underworld/server/services/temporal_nodes.py`. **It is referenced by exactly ONE file: its own test** (`underworld/server/tests/test_temporal_nodes.py`). It is **fully dormant — on no HTTP route, imported by no service.** (Verified by repo-wide grep: only the test imports it.)
2. **A real temporal/contact GRAPH + agent epidemic model** — `underworld/server/services/epidemic_network.py`. This one IS reachable, but only inside the sim: `field_science._epidemiology` calls `EN.simulate(...)` (`field_science.py:133-138`).
3. **A frontend "temporal" page** — `src/pages/TCIS.jsx` — that draws a timeline + cause→effect cards, but its "causal hypotheses" are synthesized from the static personal `LINKS` ontology with a **hard-coded confidence formula**, not from any temporal model.

### 2.1 `temporal_nodes.py` — versioned temporal knowledge graph (DORMANT)

Module docstring: *"Genuine time-aware graph structures: versioned nodes with validity intervals, causal mechanism edges, counterfactual forks…"* (`:1-6`).

- `@dataclass TemporalNode(id, label, valid_from, valid_to=None, version=1, supersedes=None)` (`:12-23`) with `.active_at(tick)`.
- `temporal_query(nodes, tick) -> list[str]` (`:26`) — "which knowledge was active at a given tick (a real temporal slice)".
- `theory_versions(nodes, label) -> list[dict]` (`:31`); `forgotten_knowledge(nodes, tick)` (`:39`); `rediscovery_path(nodes, lost_id, tick) -> dict` (`:47`).
- `@dataclass CausalEdge(cause, effect, strength=1.0)` (`:60`).
- `causal_chain(edges, start) -> list[str]` (`:67`) — "Trace a causal-mechanism chain forward from a cause (real graph walk)" — DFS over an adjacency list.
- `counterfactual_fork(baseline, intervention) -> {"forked_state","diverged","n_changes"}` (`:82`).
- `anomaly_trigger(value, *, expected, tolerance)` (`:90`); `discovery_lineage(edges, node)` (`:96`); `evidence_chain(observations)` (`:110`).
- `competing_theory_clusters(theories) -> {"clusters","n_clusters","consensus"}` (`:148`) — **a cluster op**: *"group theories by their predicted outcome (clusters of agreement)"*; clusters by `str(t["prediction"])`.
- Also `causal_mechanism` (`:120`), `lost_technology` (`:125`), `scientific_dispute` (`:130`), `obsolete_theory` (`:142`), `open_question` (`:158`).
- These are real data structures + traversals but **causality is asserted by the caller** (edges are inputs), not discovered.

### 2.2 `epidemic_network.py` — Watts-Strogatz temporal graph + agent-SIR (LIVE inside sim)

Docstring: *"a STOCHASTIC agent-based SIR on a Watts-Strogatz small-world contact network… heterogeneous contacts, discrete infections, and run-to-run variance"* (`:1-5`).
- `small_world(n, k, beta_rewire, rng) -> list[set]` (`:11`) — ring lattice + probabilistic rewiring (short paths + high clustering of real contact nets).
- `simulate(n=500, *, k=8, rewire=0.1, beta=0.06, gamma=0.1, i0=3, seed=0, max_days=365) -> dict` (`:32`) — per-day stochastic SIR over the graph; returns curve, attack rate, emergent peak, `r0_estimate ≈ β⟨k⟩/γ`.
- `ensemble(runs=20, **kw) -> dict` (`:70`) — distribution of attack-rate / peak across runs (variance the mean-field ODE can't show).
- **This is the closest thing to a temporal network actually executing**, but only as a sim field-engine, not a forecaster on the predict path.

### 2.3 `knowledge_graph.py` — typed civilisation graph + confidence ladder (LIVE on an Underworld route)

Docstring: *"unifies every kind of knowledge… into ONE typed node/edge graph, and stamps every node with a confidence class"* (`:1-19`).
- `class ConfidenceClass(str, Enum)` A–E ladder (`:28`): A physics / B literature / C simulation / D speculative / E narrative; `.is_real` (A/B), `.rank`.
- `class NodeKind` (`:55`, 10 kinds incl. INSTRUMENT, PRINCIPLE); `class EdgeKind` (`:69`, 13 typed edges incl. REQUIRES, CONTRADICTS, REPLACES, LOST_BECAUSE, REDISCOVERED_THROUGH).
- `@dataclass Node` (`:85`), `@dataclass Edge` (`:96`).
- `class KnowledgeGraph` (`:104`): `add_node/add_edge`, `prerequisites(nid)` (transitive REQUIRES closure, `:147`), `can_comprehend(nid, known)` (`:163`), `invention_frontier(known)` (`:174`), `novelty(prereq_ids)` (prior-art conflict scoring, `:192`), `validation_breakdown()` (`:225`), `real_fraction()` (`:236`).
- Classifier helpers `classify_patent/principle/invention/belief/narrative` (`:245-274`).
- **Wiring:** `worlds.py:996` `GET /{world_id}/knowledge-graph` hydrates the graph from real Patent/Invention/Discovery DB rows and returns `nodes`, `validation_breakdown`, `real_fraction` (`worlds.py:1009-1039`). Graph topology is built from DB rows; no learned edges, no temporal dimension here.

### 2.4 `world_model.py` — perception / imagination / counterfactual layers (LIVE on counterfactual route)

- `perceive(true_state, *, acuity, memory_bias, fear, rng_jitter) -> dict[str,Percept]` (`:43`) — memory-biased imperfect perception.
- `imagine(action, state, causal_model, *, depth=1) -> ImaginedOutcome` (`:97`); `best_imagined(...)` (`:132`) — forward roll of caller-supplied causal deltas.
- `class Metric(str,Enum)` (POPULATION, KNOWLEDGE, WAR_RISK, TECH_DIVERGENCE, …) (`:158`).
- `counterfactual(baseline, intervention, *, label) -> CounterfactualResult` (`:178`) — diffs two end-state metric snapshots; headline driver by relative change. **Wired:** `worlds.py:1642` `world_model_mod.counterfactual(...)`.
- Causality is again **asserted** (`causal_model` is an input), not inferred.

### 2.5 Cluster / graph analytics scattered across the registry & sim

- `methods_cs_ai.kmeans_clustering(n_clusters=3, n_samples=300, random_state=42)` (`methods_cs_ai.py:120`) — Lloyd's k-means (sklearn) with purity check.
- `methods_cs_ai.pagerank(edges, damping=0.85)` (`:236`) and `dijkstra_shortest_path` (`:38`) — graph analytics via networkx.
- `sim_methods.upgma(dist)` (`sim_methods.py:396`) — agglomerative (average-linkage) phylogenetic clustering.
- `sim_methods.markov_stationary(...)` (`:273`) — PageRank-style power iteration.
- `field_science._computing` uses `networkx.gnp_random_graph` + shortest path (`field_science.py:117-130`).
- **No HDBSCAN, no matrix profile / motif discovery, no learned temporal-graph (TGN/TGAT), no GNN anywhere in the repo** (verified: no `stumpy`/`hdbscan`/`torch` import or requirement).

---

## 3 · THE ~464-METHOD REGISTRY CATALOGUE (grouped by family)

### 3.1 What the registry physically is

`underworld/server/services/methods_registry.py` (586 lines) wires **56 `methods_*.py` domain modules** (verified: 56 files excluding the registry) into one keyword→callable `ROUTES` table — **449 route tuples** (verified `grep -cE '^\s+\(\('`), grouped into 7 "fleets". Across all 56 domain modules there are **487 public `def`s** (verified count). The repo's prose figure of **"~464 verified methods across 58 domains"** (`00_MASTER_INDEX.md:26`) is in the same ballpark; the live, routable surface is the 449 keyword-routed entries. `methods_cs_ai.py` additionally exposes a `METHODS` dict of 9 callables (`methods_cs_ai.py:343`).

- `lookup(field) -> callable|None` (`methods_registry.py:553`) — first keyword match wins.
- `run(field, *, seed=0) -> dict|None` (`:561`) — introspects the signature, supplies safe numeric defaults, calls the method, normalises to `{field, engine, summary, data, quality:0.95, grounded:True}`.
- Reached only via `field_science.simulate()` (`field_science.py:417-425`) which tries the registry before its statistics fallback. **No JARVIS route touches it.**

### 3.2 Catalogue grouped by predictive / temporal / statistical / graph / cluster / optimization

This regroups the 449 routed methods by capability relevant to PATTERN ORACLE (representative members; domain module in parens):

**Predictive / forecasting / growth-and-decay (closed-form):**
- `BIO.logistic_growth`, `BIO.lotka_volterra` (predator-prey), `BIO.seir_epidemic`, `EPI.sir_model / seir_model / final_epidemic_size / doubling_time / logistic_growth`, `IMM.within_host_viral_dynamics / epidemic_final_size / clonal_expansion`, `AGR.logistic_crop_growth / growing_degree_days`, `FOR.tree_growth / carbon_sequest`, `VET.von_bertalanffy_growth / herd_logistic_growth`, `ECON.compound_interest_fv / bond_price_ytm / capm_expected_return`, `NUC.radioactive_decay / reactor_period`, `MET.avrami_jmak` (transformation kinetics), `ECO.carbon_box_decay`.

**Temporal / dynamics / time-evolution (ODE/PDE/iteration):**
- `MA.rk4_integrate` (general ODE solver), `sim_methods.double_pendulum` (RK4 chaos), `sim_methods.wave_1d` (FDTD), `sim_methods.brusselator` (stiff ODE limit cycle), `sim_methods.logistic_map` (bifurcation), `sim_methods.decay_chain` (Bateman), `NEU.lif_neuron / fitzhugh_nagumo / hodgkin_huxley_refractory`, `CTL.second_order_step_metrics / pid_closed_loop_response` (step-response in time), `HYD.unit_hydrograph_convolution`, `SIG.autocorrelation_period` (dominant period), `HT.lumped_capacitance_cooling` (transient).

**Statistical / signal / information-theoretic:**
- `CS.shannon_entropy`, `SIG.shannon_entropy / shannon_channel_capacity / nyquist_alias_frequency / adc_quantization_snr`, `MA.monte_carlo_pi / simpson_integrate / fft_frequencies`, `LING.zipf_law_fit / heaps_law_fit / ngram_perplexity / tfidf_weights / char_entropy / bleu_score`, `ECON.gini_coefficient`, `ECO.biodiversity_indices` (Shannon/Simpson), `sim_methods.fft_spectral`, `sim_methods.black_scholes` (analytic + MC), the `_stats_fallback` (`field_science.py:336`, `scipy.optimize.minimize_scalar`).

**Graph / network:**
- `CS.dijkstra_shortest_path`, `CS.pagerank`, `ECO.may_food_web_stability`, `GD.haversine_distance / vincenty_distance / trilateration / initial_bearing / cross_track_distance` (geodesic graph ops), `sim_methods.markov_stationary`, `RB.astar_grid_path`.

**Cluster / classification / unsupervised:**
- `CS.kmeans_clustering` (Lloyd, sklearn), `CS.random_forest_accuracy` (sklearn RF), `BIO.jukes_cantor_distance` + `sim_methods.upgma` (distance → agglomerative tree), `sim_methods.schelling` (emergent spatial clustering), `sim_methods.genetic_algorithm` (selection clusters toward target).

**Optimization / learning / search:**
- `MA.gradient_descent`, `CS.knapsack_01` (DP), `CS.edit_distance` (DP), `CS.gradient_descent_regression`, `sim_methods.neural_xor` (backprop MLP), `sim_methods.genetic_algorithm`, `QC.grover_search`. The real GP optimizer (`real_optimizer.bayes_optimize`) is NOT in this registry — it lives separately (§1.2).

**Other large blocks** (not predictive but counted in the 449): physics closed forms (`PH.*`, `QM.*`, `SM2.*`), chemistry/materials/metallurgy (`CH.*`, `MAT.*`, `MET.*`, `POL.*`, `XTAL.*`, `ECHEM.*`), earth/ocean/atmos (`EA.*`, `GEO.*`, `OC.*`, `ATM.*`, `HG.*`, `HYD.*`, `GTC.*`, `SEIS.*`), engineering (`EN.*`, `STR.*`, `AERO.*`, `FL.*`, `EL2.*`, `RFM.*`, `SEMI.*`, `TRB.*`, `CMB.*`, `HT.*`, `CTL.*`, `RB.*`), astro (`AST.*`), bio/med (`MED.*`, `PHA.*`, `BM.*`, `FS2.*`).

### 3.3 `field_science.py` — the per-field router (LIVE inside sim)

`simulate(field, *, seed=0) -> dict` (`field_science.py:412`) maps ~198 taxonomy fields by keyword (`_ROUTES`, `:348-401`) to ~40 cluster engines (`_genetics`, `_protein`, `_epidemiology→epidemic_network`, `_finance→black_scholes`, etc.), trying `methods_registry.run` before the `_stats_fallback`. `sim_methods.py` (422 lines) holds **35 named, test-verified simulations** (Ising, double pendulum, FDTD wave, Hodgkin-Huxley, percolation, GA, Game of Life, Schrödinger FD, Black-Scholes, XOR MLP, Schelling, UPGMA, …).

---

## 4 · DATA INVENTORY

### 4.1 Live feeds (network)
- **CoinGecko** `/coins/{id}/market_chart` — JARVIS `load_crypto_series` (`prediction.py:158`); 18-ticker map. Cached **5 min**.
- **USGS** `fdsnws/event/1/query` — JARVIS `load_seismic_catalog` (`prediction.py:205`). Cached **5 min**.
- **Kimi K2 LLM** — `_kimi_extract` (`prediction.py:65`) for intent extraction; also `oracle.py` (JARVIS). Key-optional.
- TCIS page consumes `getLiveIntel({type:"all"})` (earthquakes/markets) + `RiskSignal.list()` (`TCIS.jsx:45-49`).
- **History retention on the JARVIS predict path: NONE.** Feeds are fetched on demand, held in a 5-min in-memory dict (`_CACHE`), never written to disk or DB. No "History Lake".

### 4.2 Persisted SQLAlchemy tables — `underworld/server/db/models.py` (Underworld DB only; SQLite via aiosqlite)
History IS retained on the Underworld side (per-tick time series + event log + learned beliefs):
- **`PopulationSnapshot`** (`models.py:709`) — **one row per world per tick**: alive/dead/births/deaths/forks, inventions_approved, avg_age/reputation/sanity, mood/guild/role breakdowns, total_knowledge, masters. The genuine time-series store.
- **`Event`** (`:583`) — append-only event log `(world_id, tick, kind, actor_id, payload JSON)`, indexed `(world_id, tick)`.
- **`CausalBelief`** (`:475`) — a Minion's learned cause→effect hypotheses with `trials`, `confirmations`, **Laplace-smoothed `confidence`** (Bayesian-ish belief revision). The only "learned causality" in the repo — but per-agent, in-sim, not on predict.
- **`MLModel`** (`:388`) — in-world model accuracy vs samples (a sim toy, not a real registry).
- **`Memory`** (`:341`, per-Minion tick-stamped), **`Discovery`** (`:356`), **`Invention`** (`:534`, with novelty/feasibility/safety scores + replication), **`Patent`** (`:521`), **`Soul`** (`:220`), **`Minion`** (`:246`, carries `brain` JSON policy + needs/traits), **`Relationship`** (`:497`, directed bonds), **`Meme`/`Species`/`Fossil`/`Artwork`/`EmptyDataset`/`ResearchProject`/`ProjectContribution`**, plus the ingested KB tables **`KnowledgeConcept`/`KnowledgeFormula`/`KnowledgeSwarmRole`/`KnowledgeGuardrail`** (`:601-658`).

### 4.3 Datasets on disk (Underworld)
- `underworld/data/real/concrete.csv` — **1031 lines = 1030 samples** (Yeh concrete compressive strength), loaded by `real_materials.load()` for `ai_model.py`. Verified.
- `underworld/data/knowledge_base.json` — **~845 KB** (`{version, source:"AI_Swarms_Master_Reference (V2 Expanded)", concepts:[...]}`); ingested into the KB tables.

### 4.4 In-memory caches
- JARVIS predict: `_CACHE` 5-min TTL (`prediction.py:128`).
- `ai_model.train_and_select` / `_fitted_best`: `@lru_cache(maxsize=1)` (process-lifetime).

### 4.5 Static "ontology" data (NOT predictive)
- `src/domain/ontology.js` + `server/data/ontology.py` — a hand-authored personal graph (13 entities, 21 links, 8 risk signals) about the user (PSG, crypto, Dubai/Zanzibar, etc.). TCIS's "causal hypotheses" come from these `LINKS` with a fixed confidence formula `min(0.99, 0.45 + strength·0.17)` (`TCIS.jsx:29`). No data is learned or updated.

---

## 5 · COMPUTE INVENTORY

### 5.1 `gpu_backend.py` — CuPy↔NumPy selector
- `Backend(xp, name, device, is_gpu)` dataclass with `.asnumpy/.synchronize/.rng` (`gpu_backend.py:22-43`).
- `get_backend(prefer="auto") -> Backend` (`:46`) — imports CuPy only if a CUDA GPU is present, else NumPy. `available_backends() -> dict` (`:68`) probes cupy + torch.cuda.
- `scale_bench.py` runs the full per-Minion "rich tick" as batched array ops (`rich_tick`, `:35`; `make_state`, `:86`; `benchmark`, `:107`; `bench_curve`, `:129`; `llm_capacity`, `:135` — projection math). **Wired:** `worlds.py:142` `GET /scale-capacity` returns `available_backends()` + a live CPU bench + a 1M/10M-minion GPU projection.

### 5.2 Exact installed numerical libs (from requirements)
- **JARVIS** `server/requirements.txt`: `fastapi, uvicorn, httpx, pydantic, python-multipart, sse-starlette, numpy>=1.26, pytest`. **Only NumPy** — no scipy, no sklearn. (So JARVIS predict cannot even run the GP/sklearn code if it wanted to.)
- **Underworld** `underworld/server/requirements.txt`: `numpy, scipy>=1.11, scikit-learn>=1.3, sympy, networkx, rdkit, biopython, pyscf, astropy, sqlalchemy, alembic, aiosqlite, gradio_client, structlog`.
- **Underworld (root)** `underworld/requirements.txt`: `numpy, scipy, scikit-learn`, fastapi/sqlalchemy[asyncio]/aiosqlite.

### 5.3 CuPy / Torch / Ray — REFERENCED BUT NOT INSTALLED (verified)
- `gpu_backend.py` and `scale_bench.py` import `cupy`/`torch` **inside try/except** and reference Ray/JAX/vLLM only in docstrings.
- **Verified:** grep of all `*requirements*.txt` for `cupy|torch|ray|stumpy|hdbscan|sentence_transformers|faiss|chromadb` → **no matches.** None of these are declared anywhere. The GPU path is aspirational; in practice every "GPU" call falls back to NumPy CPU.

### 5.4 Scheduler / concurrency
- Both backends are single-process FastAPI/uvicorn apps. **No distributed workers, no Ray, no job queue, no background scheduler** for prediction. The only "scheduler" is the sim's `auto_advance` tick (`World.auto_advance` / `next_auto_tick_at`, `models.py:159-161`). Predictions run synchronously inside the request.

---

## 6 · WIRING MAP — LIVE routes vs DORMANT (tests-only) modules

### 6.1 The two backends are DISJOINT (confirmed)
- `server/main.py` mounts: `auth, functions, predict, entities, streams` routers (`main.py:22-26`). It imports **nothing** from `underworld/` at the app level.
- The Underworld app (`underworld/server/`) has its own routers (`worlds.py`, `minions.py`, …) and its own DB. JARVIS never includes them.
- The ONLY bridge is the best-effort 3-module soft import in `prediction.py:46-58`, which degrades to native math on failure.

### 6.2 LIVE (reachable via an HTTP route)
| Route | Backend | Service | `file:line` |
|---|---|---|---|
| `POST /functions/predict` | JARVIS | `prediction.predict` | `server/routes/predict.py:27` |
| `GET /scale-capacity` | Underworld | `gpu_backend` + `scale_bench` | `worlds.py:142` |
| `GET /{world_id}/knowledge-graph` | Underworld | `knowledge_graph.KnowledgeGraph` (from DB) | `worlds.py:996` |
| `POST /{world_id}/optimize` | Underworld | `real_optimizer.bayes_optimize / benchmark_vs_random` | `worlds.py:1438` |
| `POST /{world_id}/materials` | Underworld | `real_materials` (concrete CSV) | `worlds.py:1042` |
| counterfactual | Underworld | `world_model.counterfactual` | `worlds.py:1642` |
| sim tick → field engines | Underworld | `field_science.simulate` → `methods_registry.run`, `epidemic_network.simulate`, `neural.policy/learn` | `field_science.py:412`; `minions.py` |

### 6.3 DORMANT (imported by tests only — no route, no service caller)
- **`temporal_nodes.py`** — only `tests/test_temporal_nodes.py` (verified). The entire temporal knowledge-graph (TemporalNode, causal_chain, counterfactual_fork, competing_theory_clusters) is unreachable in production.
- **`ai_models.py`** (PSI / ECE / ensemble uncertainty) — only `tests/test_ai_models.py`.
- **`ai_model.py`** (trained RF/GB/MLP) — only `tests/test_ai_model.py` (the `/materials` route uses `real_materials`/other paths, not the CV ensemble selector).

### 6.4 Net wiring conclusion
The advanced capability (temporal graph, GP optimizer, drift/calibration, 464-method registry, GPU bench) is **almost entirely on the Underworld backend**, **mostly behind sim-only routes or dormant in tests**, and **none of it is callable from the LIVE JARVIS `/functions/predict` engine** — which remains five stateless closed-form forecasters with a 5-minute cache.

---

## 7 · HONEST GAPS for a "predict-anything + self-improve" system

Each gap is grounded in a concrete absence verified above (cross-ref `00_MASTER_INDEX.md:31-39`).

1. **No learned time-series / temporal-DL / GNN models.** Every forecaster is closed-form (GBM/Holt, G-R/Omori/Poisson, haversine, exp/logistic). No foundation TS model (TimesFM/Chronos), no ARIMA, no TGN/TGAT. (No `torch`/`cupy` installed.)
2. **No embeddings / vector store / similarity substrate.** No `sentence_transformers`/`faiss`/`chromadb` anywhere (verified — no requirement, no import). The only "similarity" is `LING.cosine_similarity_bow` (toy, in registry).
3. **No prediction→outcome self-improvement loop on the JARVIS side.** `predict` is stateless: 5-min cache, no DB write of forecasts, no realized-outcome scoring, no backtest (CRPS/RMSE/coverage), no re-weighting/retraining. The ready-made pieces (`ai_models.drift_detector`/`calibration_error`/`uncertainty_estimate`) exist but are dormant and on the wrong backend.
4. **The two backends are disjoint** (§6). The JARVIS predictor cannot reach the 464-method registry, the GP optimizer, `temporal_nodes`, `knowledge_graph`, or `world_model`. The only link is a soft import of 3 modules with native fallbacks.
5. **"Causal" is asserted, not discovered.** Edges/causal models are inputs everywhere (`temporal_nodes.CausalEdge`, `world_model.imagine`'s `causal_model`, the hand-authored `LINKS` ontology, TCIS's fixed confidence formula). The only data-driven causality is `CausalBelief` — a per-Minion Laplace-smoothed success rate inside the sim, not a Granger/PC/CCM/NOTEARS screen on world data.
6. **No persistent world-data History Lake.** Per-tick history is retained ONLY for the Underworld sim (`PopulationSnapshot`/`Event`). Real external feeds (USGS/CoinGecko/FX) on the predict path are cached 60s–5min and discarded — no time-series store, no outcome store.
7. **CuPy/Torch/Ray referenced but not installed; no distributed workers.** GPU paths fall back to NumPy CPU; prediction runs synchronously in a single-process FastAPI app. The 1M/10M-minion "GPU throughput" numbers from `scale_bench` are projections, not measured GPU runs.

**Net:** the repo has strong, honest, externally-checkable *closed-form* numerics and a rich (but sim-bound, partly dormant) library — and is missing the four pillars PATTERN ORACLE needs: (a) a learned/temporal forecast core, (b) an embeddings/similarity + pattern-discovery layer, (c) a persisted History/Outcome Lake, and (d) a closed self-improvement (backtest → calibrate → re-weight → update-graph) loop wired into the live predict path.
