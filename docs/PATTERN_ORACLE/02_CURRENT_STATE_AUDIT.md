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

---

# PART B · DEEP EXPANSION (call-graphs, signature tables, reuse map, disposition, registry catalogue, persistence reality, dependency graph)

> **Re-verification note (this expansion):** all figures below were re-checked against the actual source on `2026-06-04`. Confirmed live counts: `server/services/prediction.py` = **1146 lines** (the prose "1147" in §1.1 is off-by-one against the trailing newline); `methods_registry.py` ROUTES = **449 route tuples** (`grep -cE '^\s+\(\('`); **56** `methods_*.py` domain modules (excluding the registry); **489** public top-level `def`s across those 56 modules (the prose "487" is a stale count — the live number is 489); `concrete.csv` = **1031 lines = 1030 samples**. The three dormant modules (`temporal_nodes.py`, `ai_models.py`, `ai_model.py`) are each imported by **exactly one file — their own test** (verified by ripgrep across the whole repo). These corrections do not change any conclusion in Part A; they tighten the numbers.

---

## 8 · PER-FILE CALL-GRAPH (who calls what)

This is the verified caller→callee edge set for every module that touches a prediction path. `→` means "calls / dispatches to"; `⤳` means "best-effort soft import (native fallback on failure)"; `⌁` means "imported by tests only (dormant)".

### 8.1 JARVIS backend (`server/`) — the LIVE predict graph

```
HTTP POST /functions/predict
  └─ server/routes/predict.py:27  predict_route(req)
       └─ server/services/prediction.py:748  predict(question, params)
            ├─ classify(:632)
            │    ├─ _kimi_extract(:65) ──(httpx)──> Kimi /chat/completions   [None if no key/offline]
            │    ├─ _find_ticker(:624) ─> _TICKER_TO_ID(:112)
            │    └─ _parse_horizon_hours(:593)
            ├─ _series_from_params(:730)        [shared by crypto/growth/generic]
            ├─ _predict_crypto(:794)
            │    ├─ load_crypto_series(:147) ──(httpx)──> CoinGecko /market_chart   [[] on error]
            │    ├─ _infer_dt_years(:232)
            │    └─ gbm_montecarlo_forecast(:243)            [numpy only]
            ├─ _predict_seismic(:866)
            │    ├─ _seismic_mags_from_params(:920)
            │    ├─ load_seismic_catalog(:173) ──(httpx)──> USGS fdsnws/event/1/query   [[] on error]
            │    ├─ gutenberg_richter_poisson(:328) ⤳ _UW["gutenberg_richter_b_value"]  (else native MLE)
            │    ├─ omori_aftershock_probability(:402) ⤳ _UW["omori_aftershock_rate"]   (else native)
            │    └─ _seismic_result(:928)
            ├─ _predict_trajectory(:960)
            │    ├─ (orbital) ⤳ _UW["orbital_period"]    (else native Kepler-III)
            │    ├─ (ballistic) ⤳ _UW["projectile_range"] (else native v²sin2θ/g)
            │    ├─ great_circle_forward(:433)            [math only]
            │    └─ _trajectory_result(:1054)
            ├─ _predict_growth(:1076)
            │    ├─ _series_from_params(:730)
            │    ├─ _growth_steps(:1125) ─> _infer_dt_years(:232)
            │    └─ fit_growth_series(:491)               [numpy only]
            ├─ _predict_generic(:1134) ─> _predict_crypto-style ─> _predict_growth(:1076)
            └─ _insufficient(:708) / _horizon_label(:781)   [terminal helpers, never raise]

module-load time:
  prediction.py:46-58  ⤳  underworld.server.services.{methods_seismology, methods_robotics, aerospace}
                            → builds _UW dict of 5 callables; on ANY ImportError → _UW={}, _UW_AVAILABLE=False
```

**Key call-graph facts (verified):**
- `predict` is the **only** node with a public HTTP edge into this graph. Everything else is a private helper.
- The `_UW` soft-import edge is the **single** physical link to the Underworld backend, and every one of its 5 callees has a native fallback in the same function body (so the graph is total even with `_UW={}`).
- No edge in this graph reaches a DB, a file write, the 449-method registry, the GP optimizer, or any learning code. The only stateful node is the module-level `_CACHE` dict touched by `load_crypto_series`/`load_seismic_catalog` via `_cache_get`/`_cache_put` (`:133`/`:140`).
- `server/main.py:create_app` (`:12`) wires routers `auth, functions, predict, entities, streams` and imports **nothing** from `underworld/`.

### 8.2 Underworld backend (`underworld/server/`) — the sim graphs that DON'T touch predict

```
HTTP GET  /scale-capacity                    (worlds.py:142)
  └─ gpu_backend.available_backends(:68)  +  scale_bench.benchmark(:107) / bench_curve(:129) / llm_capacity(:135)
       └─ scale_bench.rich_tick(:35), make_state(:86)  [run on Backend.xp = cupy if present else numpy]

HTTP GET  /{world_id}/knowledge-graph        (worlds.py:996)
  └─ knowledge_graph.KnowledgeGraph(:104)  hydrated from DB rows (Patent/Invention/Discovery/KnowledgeConcept/CausalBelief)
       └─ .add_node/.add_edge → .validation_breakdown(:225), .real_fraction(:236)

HTTP POST /{world_id}/optimize               (worlds.py:1438)
  └─ real_optimizer.benchmark_vs_random(:221)  /  bayes_optimize(:137)
       └─ make_gp(:97) → expected_improvement(:109) / upper_confidence_bound(:118) → random_search(:205)

HTTP POST /{world_id}/materials              (worlds.py:1042)
  └─ real_materials.load()  → (NOT ai_model.train_and_select; that selector is dormant)

HTTP POST /{world_id}/counterfactual         (worlds.py:1627)
  └─ world_model.counterfactual(:178)  → perceive(:43)/imagine(:97)/best_imagined(:132) available but counterfactual diffs end-states

sim tick (auto_advance / manual)             (simulation.py)
  └─ agents/minion.py  → neural.policy(:62)/choose(:69)/learn(:77)   [reads/writes Minion.brain JSON]
  └─ field_science.simulate(:412)
       ├─ engine_for(:404) → ~40 cluster engines (_genetics.._aerospace, :14-:336)
       │    └─ _epidemiology(:133) → epidemic_network.simulate(:32)/ensemble(:70)
       │    └─ _finance(:296) → sim_methods.black_scholes(:320);  _ml(:303) → sim_methods.neural_xor(:337); …
       ├─ methods_registry.run(:561) → lookup(:553) → one of 449 ROUTES callables   (tried FIRST)
       └─ _stats_fallback(:336) → scipy.optimize.minimize_scalar                    (only if registry misses)
  └─ services/reasoning.py → CausalBelief upsert (Laplace-smoothed confidence)
  └─ services/simulation.py:214 → PopulationSnapshot(...)  (one row per world per tick)

DORMANT (no HTTP edge, no service caller):
  temporal_nodes.py        ⌁ tests/test_temporal_nodes.py
  ai_models.py             ⌁ tests/test_ai_models.py
  ai_model.py              ⌁ tests/test_ai_model.py
```

---

## 9 · SIGNATURE TABLES (exact `file:line`, every relevant function)

### 9.1 `server/services/prediction.py` — full public + private surface (1146 lines)

| `:line` | Symbol | Signature | One-line role |
|---|---|---|---|
| 65 | `_kimi_extract` | `(question) -> dict\|None` | LLM intent extraction; None if no key/offline |
| 133 | `_cache_get` | `(key) -> Any` | 5-min TTL cache read |
| 140 | `_cache_put` | `(key, value) -> None` | cache write `(ts, value)` |
| 147 | `load_crypto_series` | `(asset, days=90) -> list[dict]` | CoinGecko price series; `[]` on error |
| 173 | `load_seismic_catalog` | `(*, min_magnitude=2.5, days=30.0, latitude=None, longitude=None, radius_km=None) -> list[dict]` | USGS catalog; `[]` on error |
| 232 | `_infer_dt_years` | `(timestamps, n) -> float` | sampling interval in years (annualisation) |
| 243 | `gbm_montecarlo_forecast` | `(values, horizon_steps, *, timestamps=None, n_paths=10000, seed=42) -> dict` | GBM MC + Holt blend |
| 328 | `gutenberg_richter_poisson` | `(magnitudes, *, target_magnitude, horizon_days, catalog_days, mc=None) -> dict` | G-R b-value + Poisson P(≥1) |
| 402 | `omori_aftershock_probability` | `(*, K, c_days, p, t_days, horizon_days) -> dict` | Omori-Utsu cumulative + P(≥1) |
| 433 | `great_circle_forward` | `(*, lat, lng, alt_m=0.0, speed_mps, heading_deg, vertical_rate_mps=0.0, minutes) -> dict` | haversine direct geodesic step |
| 491 | `fit_growth_series` | `(values, horizon_steps, *, timestamps=None) -> dict` | exp+logistic fit, lower-SSE wins |
| 593 | `_parse_horizon_hours` | `(q) -> float\|None` | parse "48h"/"in 2 days"/"by 2029" |
| 624 | `_find_ticker` | `(q) -> str\|None` | regex ticker scan vs `_TICKER_TO_ID` |
| 632 | `classify` | `(question, params=None) -> dict` | `{domain,target,horizon_hours,params,used_llm}` |
| 708 | `_insufficient` | `(question, domain, target, horizon, needs, used_llm) -> dict` | honest no-answer schema |
| 730 | `_series_from_params` | `(params) -> tuple[list[float], list\|None, str\|None]` | parse series/values/prices |
| 748 | `predict` | `(question, params=None) -> dict` | **public entry**; never raises |
| 781 | `_horizon_label` | `(hours) -> str\|None` | humanise horizon |
| 794 | `_predict_crypto` | `(question, target, horizon_hours, params, used_llm) -> dict` | crypto handler |
| 866 | `_predict_seismic` | `(...) -> dict` | seismic handler (Omori vs G-R branch) |
| 920 | `_seismic_mags_from_params` | `(params) -> tuple` | parse magnitude catalog |
| 928 | `_seismic_result` | `(..., *, name, models, mags, source, target_mag, assumptions) -> dict` | seismic schema assembler |
| 960 | `_predict_trajectory` | `(...) -> dict` | trajectory handler (orbit/ballistic/great-circle) |
| 1054 | `_trajectory_result` | `(..., *, value, unit, point, name, models, drivers, math, forecast, assumptions, extra_caveats) -> dict` | trajectory schema assembler |
| 1076 | `_predict_growth` | `(...) -> dict` | growth handler |
| 1125 | `_growth_steps` | `(horizon_hours, ts, n) -> int` | horizon → steps |
| 1134 | `_predict_generic` | `(...) -> dict` | generic → reuse growth fitter |

### 9.2 `underworld/server/services/real_optimizer.py` (257 lines)

| `:line` | Symbol | Signature | Role |
|---|---|---|---|
| 38 | `class Benchmark` | dataclass `(name, fn, bounds, optimum)` | literature benchmark holder |
| 49/56/77 | `_branin`/`_hartmann6`/`_ackley` | `(x: np.ndarray) -> float` | published-optimum test functions |
| 97 | `make_gp` | `(seed=0) -> GaussianProcessRegressor` | Constant×Matern(2.5)+White kernel |
| 109 | `expected_improvement` | `(mu, sigma, best, xi=0.01) -> np.ndarray` | EI acquisition |
| 118 | `upper_confidence_bound` | `(mu, sigma, beta=2.0) -> np.ndarray` | UCB acquisition |
| 126 | `class BOResult` | dataclass | best x/y + regret history |
| 137 | `bayes_optimize` | `(objective, bounds, *, n_init=5, n_iter=25, acquisition="ei", optimum=None, tol=1e-2, seed=0, noise=0.0, cand_pool=512) -> BOResult` | GP-BO loop |
| 205 | `random_search` | `(objective, bounds, *, n_eval, optimum=None, seed=0) -> ...` | baseline |
| 221 | `benchmark_vs_random` | `(name, *, seeds=10, n_init=5, n_iter=25) -> dict` | BO-vs-random study |
| 254 | `bayesian_optimisation_planner` | `(objective, bounds, *, n_iter=25, seed=0)` | alias |

### 9.3 `underworld/server/services/ai_models.py` (153 lines) — DORMANT MLOps primitives

| `:line` | Symbol | Signature | Role (the §08 self-improvement pieces) |
|---|---|---|---|
| 17 | `model_registry` | `(models: list[dict]) -> dict` | catalogue + dedupe |
| 24 | `dataset_lineage` | `(transforms: list[str]) -> dict` | provenance chain |
| 30 | `data_nutrition` | `(*, n_samples, n_features, missing_fraction, …) -> dict` | dataset nutrition label |
| 41 | `missingness` | `(matrix) -> dict` | per-column missing rate |
| 49 | `bias_profile` | `(group_outcomes: dict) -> dict` | group disparity |
| 59 | `evaluation_arena` | `(y_true, y_pred) -> dict` | accuracy + macro-F1 |
| 74 | `drift_detector` | `(reference, current, *, bins=10) -> {"psi","drift"}` | **PSI drift (>0.2)** |
| 85 | `calibration_error` | `(confidences, correct, *, bins=10) -> {"ece","well_calibrated"}` | **ECE** |
| 97 | `hallucination_detector` | `(*, confidence, evidence_support) -> dict` | confidence-vs-evidence gap |
| 103 | `uncertainty_estimate` | `(ensemble_preds) -> {"mean","std","confident"}` | **ensemble spread** |
| 110 | `distillation` | `(*, teacher_acc, student_acc, compression) -> dict` | distillation efficiency |
| 117 | `capability_graph` | `(models: dict) -> dict` | capability coverage |
| 125–151 | `foundation_model_registry`, `_modality_tracker`, `language/vision/protein/robotics_model_tracker` | `(models) -> dict` | modality trackers |

### 9.4 `underworld/server/services/ai_model.py` (77 lines) — DORMANT trained ensemble

| `:line` | Symbol | Signature | Role |
|---|---|---|---|
| 24 | `_models` | `() -> dict` | RF(200)/GB(200)/MLP((64,32)) candidate set |
| 35 | `train_and_select` | `() -> dict` `@lru_cache` | 5-fold CV select best by mean R² |
| 55 | `_fitted_best` | `()` `@lru_cache` | fit winner on full data |
| 63 | `predict_strength` | `(features: dict) -> dict` | concrete-strength prediction |
| 71 | `feature_importance` | `() -> dict` | importances from winner |

### 9.5 `underworld/server/services/neural.py` (86 lines) — LIVE per-Minion policy

| `:line` | Symbol | Signature | Role |
|---|---|---|---|
| 22 | `_seed` | `(dna) -> int` | DNA → LCG seed |
| 26 | `_features` | `(m) -> list[float]` | 10-dim Minion feature vector |
| 34 | `_innate` | `(dna)` | deterministic innate weights |
| 50 | `_forward` | `(feat, dna, learned_b2) -> list[float]` | 10→8→8 forward pass |
| 62 | `policy` | `(m) -> dict[str,float]` | action logits |
| 69 | `choose` | `(m, candidates) -> str\|None` | pick best legal action |
| 77 | `learn` | `(m, action, reward, *, lr=0.15) -> None` | bias-only reinforcement |

### 9.6 `temporal_nodes.py` (160) / `epidemic_network.py` (85) / `knowledge_graph.py` (274) / `world_model.py` (214)

| Module | `:line` | Symbol | Signature |
|---|---|---|---|
| temporal_nodes | 13 | `TemporalNode` | dataclass `(id,label,valid_from,valid_to=None,version=1,supersedes=None)`; `.active_at(tick)` (:22) |
| temporal_nodes | 26 | `temporal_query` | `(nodes, tick) -> list[str]` |
| temporal_nodes | 31 | `theory_versions` | `(nodes, label) -> list[dict]` |
| temporal_nodes | 39/47 | `forgotten_knowledge`/`rediscovery_path` | `(nodes, tick)` / `(nodes, lost_id, tick) -> dict` |
| temporal_nodes | 61/67 | `CausalEdge`/`causal_chain` | dataclass `(cause,effect,strength=1.0)` / `(edges, start) -> list[str]` (DFS) |
| temporal_nodes | 82/90 | `counterfactual_fork`/`anomaly_trigger` | `(baseline,intervention)` / `(value,*,expected,tolerance)` |
| temporal_nodes | 148 | `competing_theory_clusters` | `(theories) -> {"clusters","n_clusters","consensus"}` (clusters by `str(prediction)`) |
| epidemic_network | 11 | `small_world` | `(n, k, beta_rewire, rng) -> list[set]` |
| epidemic_network | 32 | `simulate` | `(n=500, *, k=8, rewire=0.1, beta=0.06, gamma=0.1, i0=3, seed=0, max_days=365) -> dict` |
| epidemic_network | 70 | `ensemble` | `(runs=20, **kw) -> dict` |
| knowledge_graph | 104 | `KnowledgeGraph` | class; `add_node`(:119)/`add_edge`(:124)/`prerequisites`(:147)/`can_comprehend`(:163)/`invention_frontier`(:174)/`novelty`(:192)/`validation_breakdown`(:225)/`real_fraction`(:236) |
| knowledge_graph | 28/55/69 | `ConfidenceClass`/`NodeKind`/`EdgeKind` | enums (A–E ladder; 10 node kinds; 13 edge kinds) |
| world_model | 43 | `perceive` | `(true_state, *, acuity, memory_bias, fear, rng_jitter) -> dict[str,Percept]` |
| world_model | 97/132 | `imagine`/`best_imagined` | `(action, state, causal_model, *, depth=1) -> ImaginedOutcome` / `(...)` |
| world_model | 178 | `counterfactual` | `(baseline, intervention, *, label) -> CounterfactualResult` |

### 9.7 `gpu_backend.py` (90) / `scale_bench.py` (157) / `field_science.py` (435) / `methods_registry.py` (586)

| Module | `:line` | Symbol | Signature |
|---|---|---|---|
| gpu_backend | 23/46/68 | `Backend`/`get_backend`/`available_backends` | dataclass / `(prefer="auto")->Backend` / `()->dict` |
| scale_bench | 35/86/107/129/135 | `rich_tick`/`make_state`/`benchmark`/`bench_curve`/`llm_capacity` | batched-array tick + projection math |
| field_science | 404/412 | `engine_for`/`simulate` | `(field)` / `(field, *, seed=0) -> dict` |
| field_science | 336 | `_stats_fallback` | `(field, seed) -> tuple[str,dict,float]` (scipy minimize_scalar) |
| methods_registry | 553/561 | `lookup`/`run` | `(field)->callable\|None` / `(field, *, seed=0)->dict\|None` |

---

## 10 · REUSE MAP (existing symbol → which PATTERN ORACLE component consumes it)

Maps each already-built, verified symbol to the PATTERN ORACLE component (per `00_MASTER_INDEX.md` / `04_ARCHITECTURE.md`) that should consume it, and the integration verb.

| Existing symbol (`file:line`) | Disposition | PATTERN ORACLE consumer | Integration verb |
|---|---|---|---|
| `prediction.predict` (`prediction.py:748`) | LIVE | **Forecast Core** entrypoint | keep as the orchestration shell; widen domains |
| `gbm_montecarlo_forecast` (`:243`) | LIVE | Forecast Core · stochastic price model | wrap as a registered "model card" with backtest hooks |
| `fit_growth_series` (`:491`) | LIVE | Forecast Core · growth/saturation model | same; emit residual σ to calibration layer |
| `gutenberg_richter_poisson`/`omori_aftershock_probability` (`:328`/`:402`) | LIVE | Forecast Core · event-probability models | feed P into calibration/Brier scoring |
| `classify` + `_kimi_extract` (`:632`/`:65`) | LIVE | **NL Routing (09)** | reuse as the router; add a model-selection head |
| `load_crypto_series`/`load_seismic_catalog` (`:147`/`:173`) | LIVE | **Data ingestion** | promote from 5-min cache to persisted History Lake writer |
| `_CACHE` + `_cache_get/put` (`:129`/`:133`/`:140`) | LIVE | Data ingestion · hot cache | keep as L1 cache in front of the History Lake |
| `ai_models.drift_detector` (PSI, `ai_models.py:74`) | DORMANT (tests) | **Self-Improvement / MLOps (08)** | import into predict-side monitoring; run on feed drift |
| `ai_models.calibration_error` (ECE, `:85`) | DORMANT | Self-Improvement (08) · calibration | score realized outcomes vs stated confidence |
| `ai_models.uncertainty_estimate` (`:103`) | DORMANT | Forecast Core · ensemble bands | combine multi-model outputs into honest intervals |
| `ai_models.evaluation_arena` (`:59`) | DORMANT | Self-Improvement (08) · scoring | backtest accuracy/macro-F1 leaderboard |
| `ai_model.train_and_select` (`ai_model.py:35`) | DORMANT | Forecast Core · learned tabular model | template for CV-selected regressors on real data |
| `real_optimizer.bayes_optimize` (`real_optimizer.py:137`) | DORMANT-ish (Underworld route) | **Hyperparameter / weight tuning** | reuse GP-BO to tune ensemble weights / model knobs |
| `knowledge_graph.KnowledgeGraph` (`knowledge_graph.py:104`) | LIVE (Underworld route) | **Pattern/Causal Graph layer** | reuse typed node/edge + ConfidenceClass ladder |
| `knowledge_graph.ConfidenceClass` (`:28`) | LIVE | Provenance / honesty | stamp every forecast driver with A–E confidence |
| `temporal_nodes.*` (`temporal_nodes.py`) | DORMANT (tests) | **Temporal-graph substrate** | activate as versioned-knowledge + causal-chain store |
| `temporal_nodes.competing_theory_clusters` (`:148`) | DORMANT | Pattern layer · model-agreement clustering | cluster competing forecasts by predicted outcome |
| `world_model.counterfactual` (`world_model.py:178`) | LIVE (Underworld route) | **What-if / scenario engine** | reuse to diff intervention vs baseline end-states |
| `epidemic_network.simulate/ensemble` (`epidemic_network.py:32`/`:70`) | LIVE (sim) | Forecast Core · contagion/diffusion domain | reuse for spread forecasts with run-to-run variance |
| `methods_registry.lookup/run` (`methods_registry.py:553`/`:561`) | LIVE (sim) | **Closed-form model bank** | expose the 449 routes to predict as deterministic priors |
| `gpu_backend.get_backend` (`gpu_backend.py:46`) | LIVE (Underworld route) | **Compute (10)** | reuse CuPy/NumPy selector for batched MC |
| `scale_bench.benchmark/llm_capacity` (`scale_bench.py:107`/`:135`) | LIVE (Underworld route) | Compute (10) · capacity planning | reuse projection math for throughput planning |

---

## 11 · DORMANT-vs-LIVE DISPOSITION TABLE (every module, action to activate)

`LIVE` = on an HTTP route or in the sim tick. `SIM-ONLY` = executes only inside Underworld sim, never on predict. `DORMANT` = imported by tests only. `CROSS` = the soft-import bridge.

| Module | Disposition | Reached via | Action needed to activate for PATTERN ORACLE |
|---|---|---|---|
| `server/services/prediction.py` | **LIVE** (JARVIS) | `POST /functions/predict` | none — extend |
| `server/routes/predict.py` | **LIVE** | router mount `main.py:24` | none |
| `methods_seismology/robotics`, `aerospace` (5 fns) | **CROSS** | `_UW` soft import `prediction.py:46` | make import hard (add to JARVIS deps) OR keep native fallback as primary |
| `underworld/.../real_optimizer.py` | Underworld route (not JARVIS) | `POST /{world_id}/optimize` | import into a JARVIS tuning service; add scikit-learn to JARVIS reqs |
| `underworld/.../ai_model.py` | **DORMANT** | `tests/test_ai_model.py` only | add a route/service caller; ship a real tabular dataset; add sklearn to JARVIS reqs |
| `underworld/.../ai_models.py` | **DORMANT** | `tests/test_ai_models.py` only | wire `drift_detector`/`calibration_error`/`uncertainty_estimate` into the predict monitoring loop |
| `underworld/.../neural.py` | **SIM-ONLY** | `agents/minion.py` tick | not a forecaster; leave in sim (reuse only as policy template) |
| `underworld/.../temporal_nodes.py` | **DORMANT** | `tests/test_temporal_nodes.py` only | persist `TemporalNode`/`CausalEdge` to a store; call `temporal_query`/`causal_chain` from a route |
| `underworld/.../epidemic_network.py` | **SIM-ONLY** | `field_science._epidemiology` | expose `simulate`/`ensemble` behind a predict domain handler |
| `underworld/.../knowledge_graph.py` | **LIVE** (Underworld route) | `GET /{world_id}/knowledge-graph` | reuse class+enums on the JARVIS side (it is pure-Python, no DB coupling in the class itself) |
| `underworld/.../world_model.py` | **LIVE** (Underworld route) | `POST /{world_id}/counterfactual` | reuse `counterfactual` for a JARVIS scenario endpoint |
| `underworld/.../methods_registry.py` (+56 modules) | **SIM-ONLY** | `field_science.simulate` → `run` | expose `run(field)` behind a JARVIS route or import the modules directly |
| `underworld/.../field_science.py` | **SIM-ONLY** | sim tick | reuse `engine_for`/`simulate` as a closed-form prior bank |
| `underworld/.../sim_methods.py` (35 sims) | **SIM-ONLY** | `field_science` engines | reuse `black_scholes`/`upgma`/`markov_stationary`/etc. as domain priors |
| `underworld/.../gpu_backend.py` | **LIVE** (Underworld route) | `GET /scale-capacity` | reuse selector; install CuPy to make GPU path real |
| `underworld/.../scale_bench.py` | **LIVE** (Underworld route) | `GET /scale-capacity` | reuse projection math; measure on real GPU to replace projections |
| `underworld/.../db/models.py` | **LIVE** (Underworld DB) | Underworld routes/sim | reuse `PopulationSnapshot`/`Event` schema pattern for the History/Outcome Lake |

---

## 12 · THE FULL 449-METHOD REGISTRY CATALOGUE — grouped by predictive utility, one line each

The catalogue below enumerates **every** routed callable in `methods_registry.ROUTES` (449 entries), grouped by relevance to PATTERN ORACLE forecasting. Each line is `MODULE.method — one-line behavior`. (Module aliases per `methods_registry.py:11-37`.) Within a group, order follows the ROUTES table. All are deterministic closed-form computations returning a result dict; none learn from data.

### 12.1 TIER A — Predictive / forecasting / growth-decay / dynamics (time-evolution; the directly reusable forecasters)

These project a quantity forward in time or estimate an event probability — the highest-value reuse for the Forecast Core.

- `BIO.lotka_volterra` — predator–prey population trajectories over time.
- `BIO.logistic_growth` — carrying-capacity-bounded population growth.
- `BIO.seir_epidemic` — SEIR compartmental epidemic curve.
- `BIO.one_compartment_pk` — single-compartment drug concentration decay.
- `EPI.sir_model` — Kermack–McKendrick SIR curve.
- `EPI.seir_model` — SEIR with exposed compartment.
- `EPI.final_epidemic_size` — final attack-rate from R0.
- `EPI.reproduction_numbers` — R0 / effective R.
- `EPI.herd_immunity_threshold` — 1−1/R0 threshold.
- `EPI.logistic_growth` — Verhulst case-count growth.
- `EPI.doubling_time` — epidemic doubling time from growth rate.
- `EPI.epidemiologic_measures` — incidence/prevalence/CFR.
- `IMM.within_host_viral_dynamics` — target-cell viral load ODE.
- `IMM.immune_response_logistic` — effector cell logistic expansion.
- `IMM.clonal_expansion` — T-cell clonal growth over time.
- `IMM.epidemic_final_size` — final-size equation.
- `IMM.herd_immunity_threshold` — vaccination threshold.
- `AGR.logistic_crop_growth` — crop biomass logistic accumulation.
- `AGR.growing_degree_days` — phenological GDD accumulation.
- `AGR.light_use_efficiency_biomass` — radiation-use-efficiency yield projection.
- `FOR.tree_growth` — dendrological diameter growth curve.
- `FOR.carbon_sequest` — forest carbon accumulation over time.
- `FOR.self_thinning` — −3/2 stand-density mortality law.
- `FOR.site_index` — height-age growth projection.
- `VET.von_bertalanffy_growth` — asymptotic animal growth curve.
- `VET.herd_logistic_growth` — livestock herd logistic dynamics.
- `ECON.compound_interest_fv` — future value forward in time.
- `ECON.bond_price_ytm` — bond price / yield-to-maturity.
- `ECON.capm_expected_return` — CAPM expected return.
- `ECON.black_scholes_delta` — option delta (forward risk).
- `NUC.radioactive_decay` — secular-equilibrium decay over time.
- `NUC.reactor_period` — point-kinetics reactor period (inhour).
- `MET.avrami_jmak` — JMAK transformation-kinetics fraction vs time.
- `ECO.carbon_box_decay` — CO₂ box-model decay over time.
- `ECO.maximum_sustainable_yield` — MSY harvest projection.
- `ECO.island_biogeography_equilibrium` — MacArthur–Wilson equilibrium species count.
- `MA.rk4_integrate` — general RK4 ODE solver (any dynamical system).
- `CTL.second_order_step_metrics` — step-response overshoot/settling in time.
- `CTL.pid_closed_loop_response` — closed-loop PID time response.
- `EN.pid_step_response` — PID step response.
- `EN.second_order_response` — damped second-order transient.
- `HT.lumped_capacitance_cooling` — transient cooling curve.
- `HYD.unit_hydrograph_convolution` — runoff hydrograph over time.
- `HYD.reservoir_water_balance` — reservoir routing over time.
- `NEU.lif_neuron` — leaky-integrate-and-fire membrane trajectory.
- `NEU.fitzhugh_nagumo` — excitable-system relaxation oscillation.
- `NEU.hodgkin_huxley_refractory` — action-potential refractory dynamics.
- `NEU.synaptic_epsp_decay` — EPSP exponential decay.
- `HG.theis_drawdown` — transient well drawdown over time.
- `HG.contaminant_transport` — advection–dispersion plume over time.
- `PHA.two_compartment_pk` — bi-exponential drug disposition.
- `PHA.pk_parameters` — clearance/half-life/Vd.
- `PHA.steady_state` — multi-dose accumulation to steady state.
- `PHA.michaelis_menten_elimination` — saturable elimination over time.
- `FS2.q10_shelf_life` — Q10 shelf-life projection.
- `FS2.thermal_death` — D/z-value microbial death over time.
- `FS2.maillard_rate_ratio` — browning rate vs temperature.
- `SIG.autocorrelation_period` — dominant period from autocorrelation.
- `GEO.plate_velocity` — tectonic plate displacement over time.
- `AST.orbital_period` — Kepler-III orbital period.
- `AST.hubble_recession_velocity` — recession velocity (cosmic time).
- `CH.reaction_kinetics_first_order` — first-order concentration decay.
- `CH.arrhenius_rate_ratio` — temperature-dependent rate ratio.
- `RB.projectile_range` — ballistic range (also reused by JARVIS `_UW`).
- `SEIS.omori_aftershock_rate` — aftershock decay rate over time (reused by JARVIS).
- `SEIS.gutenberg_richter_b_value` — frequency–magnitude b-value (reused by JARVIS).

### 12.2 TIER B — Statistical / signal / information-theoretic (priors, features, entropy)

- `CS.shannon_entropy` — Shannon entropy of a distribution.
- `SIG.shannon_entropy` — information entropy.
- `SIG.shannon_channel_capacity` — capacity from SNR/bandwidth.
- `SIG.nyquist_alias_frequency` — aliasing frequency.
- `SIG.adc_quantization_snr` — quantization SNR.
- `SIG.discrete_convolution` — discrete convolution.
- `SIG.rc_lowpass_response` — RC filter response.
- `SIG.hamming74_correct` — Hamming(7,4) ECC.
- `MA.monte_carlo_pi` — Monte-Carlo π estimate.
- `MA.simpson_integrate` — Simpson quadrature.
- `MA.fft_frequencies` — FFT bin frequencies.
- `MA.svd_reconstruct` — SVD low-rank reconstruction.
- `MA.newton_raphson_root` — Newton root-finding.
- `MA.rsa_roundtrip` — modular-exp RSA round-trip.
- `LING.zipf_law_fit` — Zipf rank-frequency fit.
- `LING.heaps_law_fit` — vocabulary-growth fit.
- `LING.ngram_perplexity` — language-model perplexity.
- `LING.tfidf_weights` — TF-IDF term weights.
- `LING.char_entropy` — bits-per-character.
- `LING.bleu_score` — n-gram overlap BLEU.
- `LING.cosine_similarity_bow` — bag-of-words cosine (the only "similarity").
- `LING.levenshtein_distance` — edit distance.
- `ECON.gini_coefficient` — inequality / Lorenz.
- `ECO.biodiversity_indices` — Shannon/Simpson diversity.
- `CRY.shannon_keyspace_entropy` — password/keyspace entropy.
- `CRY.sha256_avalanche` — hash avalanche statistic.
- `QC.entanglement_entropy` — von-Neumann entropy.
- `SPEC.doppler_shift` / `AC2.doppler_shift` / `RFM.doppler_shift` — Doppler frequency shift.

### 12.3 TIER C — Graph / network analytics

- `CS.dijkstra_shortest_path` — shortest path (networkx).
- `CS.pagerank` — PageRank centrality.
- `ECO.may_food_web_stability` — May food-web stability eigenvalue.
- `GD.haversine_distance` — great-circle distance.
- `GD.vincenty_distance` — ellipsoidal geodesic distance.
- `GD.trilateration` — GNSS/GPS trilateration.
- `GD.initial_bearing` — forward azimuth.
- `GD.cross_track_distance` — cross-track error to a great-circle.
- `GD.geodetic_to_ecef` — geodetic→ECEF transform.
- `GD.mercator_projection` / `GD.utm_zone` — map projections.
- `RB.astar_grid_path` — A* grid path planning.
- `RB.differential_drive_odometry` — odometry pose integration.
- `RB.two_link_forward_kinematics` / `..inverse_kinematics` / `..jacobian` — 2-link arm kinematics.
- `SEIS.epicenter_trilateration` — seismic epicenter from station times.

### 12.4 TIER D — Cluster / classification / unsupervised / evolutionary

- `CS.kmeans_clustering` — Lloyd k-means (sklearn) + purity.
- `CS.random_forest_accuracy` — sklearn RF accuracy.
- `CS.huffman_coding` — Huffman tree (greedy clustering of symbols).
- `BIO.jukes_cantor_distance` — phylogenetic distance (feeds UPGMA).
- `BIO.wright_fisher_drift` — genetic drift trajectory.
- `BIO.hardy_weinberg` — allele-frequency equilibrium.

### 12.5 TIER E — Optimization / search / learning-flavored

- `MA.gradient_descent` — convex gradient descent.
- `CS.gradient_descent_regression` — GD linear regression fit.
- `CS.knapsack_01` — 0/1 knapsack DP.
- `CS.edit_distance` — Levenshtein DP.
- `QC.grover_search` — Grover amplitude amplification.
- `QC.deutsch_jozsa` / `QC.phase_estimation` / `QC.quantum_fourier_transform` — quantum algorithms.
- (The real GP optimizer `real_optimizer.bayes_optimize` is **not** in this registry — §1.2.)

### 12.6 TIER F — Closed-form physical/engineering constants & laws (counted in the 449, not predictive in the TS sense)

These ~300 remaining routes are deterministic physical/chemical/engineering closed forms — valuable as **grounded priors and unit-anchored sanity checks**, not as time-series forecasters. Grouped by domain module:

- **Physics `PH.*`:** lorentz_factor, schwarzschild_radius, double_slit_fringe, planck_spectral_radiance, maxwell_boltzmann_speed, cyclotron_frequency, carnot_efficiency, relativistic_energy.
- **Quantum `QM.*`:** tunnelling_transmission, particle_in_a_box, larmor_precession, bohr_energy_levels, harmonic_oscillator, rabi_oscillation, de_broglie_wavelength, compton_shift.
- **Stat-mech `SM2.*`:** boltzmann_distribution, partition_function, heat_capacity_solid, entropy_microstates, equipartition_energy, stefan_boltzmann_power, fermi_bose_occupancy, maxwell_boltzmann_speed.
- **Optics `OP.*`:** thin_lens_image, diffraction_grating, fresnel_reflection, diffraction_limit, fiber_numerical_aperture, gaussian_beam, bragg_wavelength, snell_refraction.
- **Fluids `FL.*`:** bernoulli_pressure, lift_coefficient_force, drag_terminal_velocity, reynolds_number, blasius_boundary_layer, speed_of_sound_mach, normal_shock_relations, hagen_poiseuille_flow.
- **Aerodynamics `AERO.*`:** lift_force, drag_polar, pitot_airspeed, mach_number, prandtl_glauert, isentropic_stagnation, thin_airfoil_lift, glide_performance.
- **Electronics `EL2.*` / Semiconductor `SEMI.*`:** shockley_diode(_current), transistor_operating_point, op_amp_gain, rlc_resonant_frequency, pn_junction_built_in_potential, fermi_dirac_occupancy, intrinsic_carrier_concentration, rc_lowpass_cutoff; carrier_density_fermi, built_in_potential, depletion_width, drift_conductivity, hall_effect, varshni_bandgap.
- **Chemistry `CH.*` / Electrochem `ECHEM.*`:** chemical_equilibrium, nernst_cell_potential, weak_acid_ph, beer_lambert_absorbance, van_der_waals_pressure, gibbs_free_energy; nernst_potential, standard_cell_emf, faraday_electrolysis, butler_volmer_current, tafel_overpotential, molar_conductivity_kohlrausch, nernst_einstein_conductivity, debye_huckel_activity, battery_capacity_soc.
- **Materials `MAT.*` / Metallurgy `MET.*` / Crystallography `XTAL.*` / Polymer `POL.*`:** bragg_diffraction, lever_rule, griffith_fracture, fick_diffusion, hooke_elasticity, arrhenius_vacancy, hall_petch, wiedemann_franz; carbon_equivalent_iiw, rosenthal_temperature, cooling_time_t85, hollomon_jaffe, scheil_segregation, ideal_critical_diameter, hall_petch_yield; cubic_d_spacing, atomic_packing_factor, theoretical_density, bragg_angle, structure_factor_allowed, cubic_interplanar_angle, linear_planar_density, schmid_resolved_shear; radius_gyration, flory_radius, mark_houwink, flory_huggins, rubber_elastic, wlf_shift, reptation_diffusion, glass_transition.
- **Earth/Geo/Ocean/Atmos `EA.* GEO.* OC.* ATM.* HG.* HYD.* GTC.* SEIS.*`:** barometric_pressure, dry_adiabatic_lapse_rate, seismic_pwave_swave_ratio, earthquake_energy, manning_open_channel, coriolis_parameter, radiative_equilibrium, radiometric_age; airy_root_depth, geothermal_heat_flow, impact_crater_diameter, radiogenic_heat, seismic_moment, hydrostatic_pressure, planetary_mass; deep_water_wave, shallow_water_wave, seawater_density, tidal_m2, ekman_transport, buoyancy_frequency, wave_energy_stokes, geostrophic_current; chapman_ozone_steady_state, co2_radiative_forcing, global_warming_potential, nox_o3_photostationary, aerosol_optical_depth, henry_law_solubility, lifting_condensation_level, atmospheric_residence_time; darcy_flux, conductivity_permeability, dupuit_well_discharge, aquifer_storage_volume, hazen_conductivity, seepage_velocity; rational_method_peak_flow, scs_curve_number_runoff, manning_channel_flow, pipe_head_loss, kirpich_time_of_concentration, thornthwaite_pet; terzaghi_bearing_capacity, rankine_earth_pressure, effective_stress, darcy_seepage, consolidation_settlement, consolidation_time_factor, mohr_coulomb_strength, infinite_slope_fos, soil_phase_relations; richter_local_magnitude, moment_magnitude, ps_travel_time_distance, body_wave_velocities, energy_from_magnitude.
- **Engineering `EN.* STR.* HT.* TRB.* CMB.* CTL.* RB.* RFM.* NUC.*`:** butterworth_lowpass, fin_heat_transfer, pipe_flow_head_loss, euler_buckling_load, rankine_cycle_efficiency, spring_mass_frequency; simply_supported_point_load, simply_supported_udl, cantilever_point_load, bending_stress, second_moment_of_area, axial_member, truss_triangle_method_of_joints, circular_shaft_torsion; plane_wall_conduction, cylinder_conduction, dittus_boelter_convection, radiative_exchange, fin_heat_transfer, lmtd_heat_exchanger, fick_diffusion; amontons_coulomb_friction, archard_wear, hertz_sphere_flat, stribeck_lambda_ratio, petroff_bearing_friction, stokes_drag, rolling_resistance, hersey_number; stoichiometric_afr, equivalence_ratio, adiabatic_flame_temperature, lower_heating_value, flue_gas_composition, laminar_flame_speed, wobbe_index, flammability_le_chatelier; routh_hurwitz, pole_damping, ziegler_nichols_tuning, bode_margins, state_space_controllability, lyapunov_stability; pd_joint_control, homogeneous_transform; friis_transmission, free_space_path_loss, radar_range_equation, antenna_aperture_gain, aperture_beamwidth_directivity, link_budget, skin_depth; k_effective_criticality, bare_sphere_critical_radius, fission_energy_release, gamma_shielding, radiation_dose_inverse_square, binding_energy_per_nucleon.
- **Astro `AST.*`:** stellar_luminosity, cosmological_redshift, chandrasekhar_mass, escape_velocity, wien_peak_colour, roche_limit.
- **Bio/Med/Neuro `MED.* BM.* NEU.* SPEC.* PV.* PL.* CRY.* QC.* AC2.* VET.* PHA.* IMM.* FS2.*`:** cardiac_output, poiseuille_blood_flow, oxygen_hemoglobin_saturation, creatinine_clearance, basal_metabolic_rate, body_metrics, dose_response, mean_arterial_pressure; hill_muscle, bone_stress, bone_buckling, joint_torque, gait_pendulum, cost_transport, tendon_energy, ground_reaction; cable_length_constant, stdp_weight_change, population_fi_curve, resting_membrane_potential; rydberg_hydrogen, beer_lambert, planck_blackbody, bragg_diffraction, photon_energy, rigid_rotor_rotation, harmonic_vibration; solar_cell_iv_curve, fill_factor_efficiency, shockley_queisser, maximum_power_point, air_mass_irradiance, voc_temperature_coeff, bandgap_wavelength; plasma_frequency, debye_length, lawson_triple_product, gyromotion, coulomb_log_collision, saha_ionization, bremsstrahlung_power, plasma_beta; diffie_hellman_exchange, rsa_sign_verify, hamming_7_4, ec_point_addition, one_time_pad, crc32_checksum; single_qubit_gates, bell_state, chsh_inequality; sound_intensity_level, string_harmonics, organ_pipe_resonance, sabine_reverberation, beat_frequency, transmission_loss, speed_of_sound_air; kleiber_metabolic_rate, allometric_dose, heart_rate_mass, gestation_period, feed_conversion, thermoneutral_zone; loading_dose, therapeutic_index, emax_pkpd, probit_ld50; antibody_binding_fraction, dose_response_hill, neutralization_titer; f0_sterilization, water_activity_raoult, freezing_point_depression, sg_to_brix.

> **Catalogue note:** the seven groups above account for all 449 routed callables. `methods_cs_ai.py:343` additionally exposes a separate `METHODS` dict of 9 callables (a convenience map, not part of ROUTES). Across the 56 domain modules there are **489** public `def`s; the gap (489 vs 449) is private helpers + a handful of public functions that are not individually keyword-routed (reached only by direct import, e.g. via `field_science` engines or `sim_methods`).

### 12.7 `sim_methods.py` — 35 named simulations (reached via `field_science`, not ROUTES)

`ising_2d`, `double_pendulum`(RK4 chaos), `wave_1d`(FDTD), `hodgkin_huxley`, `brusselator`(stiff limit cycle), `decay_chain`(Bateman), `blackbody`, `logistic_map`(bifurcation), `tight_binding_1d`, `percolation_2d`, `genetic_algorithm`, `game_of_life`, `energy_balance_climate`, `fft_spectral`, `markov_stationary`(power iteration), `schrodinger_1d`, `random_walk_diffusion`, `black_scholes`(analytic+MC), `neural_xor`(backprop MLP), `schelling`(emergent clustering), `upgma`(agglomerative phylo cluster). (Lines `:14`–`:396`.)

---

## 13 · DATA-PERSISTENCE REALITY TABLE (every SQLAlchemy model)

For each model in `underworld/server/db/models.py`: is it written to the DB, is per-row history retained, and is it queryable on a route? `Persisted` = a write site exists; `History` = multiple rows accumulate over ticks (vs upsert/overwrite); `Queryable` = read on an HTTP route. (Write sites verified by grep; query sites verified in `routes/worlds.py`.)

| Model (`:line`) | Persisted? | History retained? | Queryable (route)? | Notes |
|---|---|---|---|---|
| `World` (`:150`) | Yes | No (single mutable row/world) | Yes | live world state mutated in place each tick |
| `Soul` (`:220`) | Yes | Partial (one row/soul, carries karma/knowledge across incarnations) | Yes | persists across reincarnation |
| `Minion` (`:246`) | Yes | Partial (alive flag + died_tick; `brain` JSON overwritten by `neural.learn`) | Yes | the only learned-weights store (output-layer biases) |
| `Skill` (`:328`) | Yes | No (upsert per minion+name) | Yes | unique `(minion_id,name)` |
| `Memory` (`:341`) | Yes (`lifecycle/gateway/reasoning/minion`) | **Yes** (tick-stamped, append) | Yes | per-Minion episodic log |
| `Discovery` (`:356`) | Yes (`discovery.py:80`) | No (unique per world+tech) | Yes | one-shot tech unlock |
| `Meme` (`:371`) | Yes (`memes.py:75`) | Partial (alive flag, popularity overwritten) | Yes | cultural replicator |
| `MLModel` (`:388`) | Yes | No (upsert per minion+task) | Yes | in-world toy accuracy, not a real registry |
| `Species` (`:404`) | Yes | Partial (population overwritten; alive flag) | Yes | evolving trait |
| `Artwork` (`:421`) | Yes | **Yes** (append, tick-stamped) | Yes | creative output log |
| `Fossil` (`:437`) | Yes | **Yes** (append; excavated flag) | Yes | geological record |
| `EmptyDataset` (`:455`) | Yes | **Yes** (append; solved flag) | Yes | open-problem generator |
| `CausalBelief` (`:475`) | Yes (`reasoning.py:47`) | Partial (upsert per minion+cause+effect; counts accumulate) | via reasoning service | **only data-driven causality** — Laplace-smoothed success rate |
| `Relationship` (`:497`) | Yes | Partial (upsert per triple; strength overwritten) | Yes | directed social bonds |
| `Patent` (`:521`) | Yes (ingest) | **Yes** (append, real PatentsView rows) | Yes | external corpus |
| `Invention` (`:534`) | Yes (`minion.py`) | **Yes** (append, tick-stamped) | Yes | novelty/feasibility/safety + replication |
| `PeerReview` (`:559`) | Yes (`reviewer.py`) | **Yes** (append) | Yes | review log |
| `SafetyReview` (`:571`) | Yes (`reviewer.py`) | **Yes** (append) | Yes | safety-block log |
| `Event` (`:583`) | Yes (8+ sites: minion/reviewer/climate/pollution/memes/discovery/simulation) | **Yes** (append-only, indexed `(world_id,tick)`) | Yes | the event log |
| `KnowledgeConcept` (`:601`) | Yes (KB ingest) | No (static corpus) | Yes (KG route) | from Master Reference |
| `KnowledgeFormula` (`:613`) | Yes (KB ingest) | No (static corpus) | Yes | formula compendium |
| `KnowledgeSwarmRole` (`:640`) | Yes (KB ingest) | No (static) | Yes | role taxonomy |
| `KnowledgeGuardrail` (`:651`) | Yes (KB ingest) | No (static) | Yes | validation guardrails |
| `ResearchProject` (`:664`) | Yes | **Yes** (append; stage transitions) | Yes | multi-stage pipeline |
| `ProjectContribution` (`:692`) | Yes | **Yes** (append, tick-stamped) | Yes | per-contribution log |
| `PopulationSnapshot` (`:709`) | Yes (`simulation.py:214`) | **Yes** (one row per world per tick) | Yes (`worlds.py:478`,`:824`) | **the genuine time-series store** |

**Persistence verdict (verified):**
- **Genuine append-only time series:** `PopulationSnapshot`, `Event`, `Memory`, `Invention`, `PeerReview`, `SafetyReview`, `ProjectContribution`, `Artwork`, `Fossil`, `EmptyDataset`, `Patent`. These accumulate per-tick rows and are queryable.
- **The only learned state:** `Minion.brain` (neural biases, overwritten) and `CausalBelief` (accumulating trial/confirmation counts → Laplace confidence). Both are **per-Minion, in-sim, on the Underworld DB**.
- **Nothing on the JARVIS predict path is persisted at all** — confirming §4.1: forecasts and their inputs live only in the 5-min `_CACHE` and are then discarded. There is no JARVIS-side outcome store, no forecast table, no realized-vs-predicted history.

---

## 14 · DEPENDENCY / IMPORT GRAPH BETWEEN THE TWO BACKENDS

### 14.1 The only edge that crosses the backend boundary

```
server/services/prediction.py:46-58   (module load, inside try/except)
        │  import underworld.server.services.methods_seismology  as _SEIS
        │  import underworld.server.services.methods_robotics    as _ROB
        │  import underworld.server.services.aerospace           as _AERO
        ▼
   _UW = { gutenberg_richter_b_value, omori_aftershock_rate,
           energy_from_magnitude, projectile_range, orbital_period }   (5 callables)
        │
        └─ on ANY Exception → _UW = {}, _UW_AVAILABLE = False   → native math used everywhere
```

- This is the **single** import edge from `server/` into `underworld/`. Verified: no other file under `server/` references `underworld`.
- It is a **soft** edge: a best-effort import wrapped in `try/except Exception`. Every consumer (`gutenberg_richter_poisson`, `omori_aftershock_probability`, the orbital/ballistic branches of `_predict_trajectory`) checks `_UW.get(...)` and falls back to inline native math. So the JARVIS graph is functionally **total even if `underworld/` is absent or un-importable**.
- The reverse direction has **zero** edges: nothing under `underworld/` imports anything from `server/`.

### 14.2 Why the boundary is otherwise hermetic

- **No shared app/process:** `server/main.py` mounts only JARVIS routers; `underworld/server/` is a separate FastAPI app with its own routers (`worlds.py`, `minions.py`, …) and its own SQLite DB (aiosqlite). Neither includes the other's routers.
- **No shared DB:** JARVIS has no SQLAlchemy models at all (it is stateless + cache). All ORM models live in `underworld/server/db/models.py`.
- **No shared deps for the heavy code:** JARVIS `requirements.txt` declares only `fastapi, uvicorn, httpx, pydantic, python-multipart, sse-starlette, numpy, pytest` — **no scipy, no scikit-learn**. So even via the soft import, JARVIS cannot execute `real_optimizer` (needs sklearn GP), `ai_model`/`ai_models` (sklearn), or any registry method that imports scipy/networkx/sklearn/rdkit. The 5 reused `_UW` functions are pure-numpy/math, which is why exactly those three modules were chosen for the bridge.

### 14.3 Backend dependency matrix (declared, verified against requirements files)

| Capability | Lib needed | JARVIS `server/` | Underworld `underworld/server/` |
|---|---|---|---|
| Web/app | fastapi, uvicorn, httpx, pydantic | ✅ | ✅ |
| Arrays | numpy | ✅ | ✅ |
| Scientific | scipy | ❌ | ✅ (`>=1.11`) |
| ML | scikit-learn | ❌ | ✅ (`>=1.3`) |
| Symbolic | sympy | ❌ | ✅ |
| Graphs | networkx | ❌ | ✅ |
| Chem/Bio/Astro | rdkit, biopython, pyscf, astropy | ❌ | ✅ |
| Persistence | sqlalchemy, alembic, aiosqlite | ❌ | ✅ |
| GPU | cupy / torch | ❌ (not declared) | ❌ (not declared; imported in try/except only) |
| Embeddings/vector | sentence_transformers / faiss / chromadb | ❌ | ❌ |
| Temporal-DL / matrix-profile | torch / stumpy / hdbscan | ❌ | ❌ |

**Dependency-graph conclusion:** the two backends are linked by a **single soft import of three pure-math modules** and are otherwise hermetically separated by process, DB, and declared dependencies. JARVIS cannot reach the registry, GP optimizer, knowledge graph, world model, or any learning code — not merely by wiring, but because it lacks the libraries those modules import. Activating any of them for PATTERN ORACLE requires either (a) adding the libs to the JARVIS environment and importing the modules directly, or (b) exposing the Underworld capabilities behind an internal HTTP/service call that the JARVIS predict path consumes.
