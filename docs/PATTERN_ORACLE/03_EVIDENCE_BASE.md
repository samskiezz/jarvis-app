# 03 — EVIDENCE BASE
**PATTERN ORACLE · Master Engineering Spec · ISO execution depth**
**Document class:** cited, replicable evidence base. Companion to `00_MASTER_INDEX.md`, `02_CURRENT_STATE_AUDIT.md`, `06_ALGORITHMS.md`.

---

## 0. PURPOSE, METHOD, AND RULES OF EVIDENCE

This file is the **grounding ledger** for every technique PATTERN ORACLE intends to emulate. Per the Non-Negotiables in `00_MASTER_INDEX.md` §0: *"Every technique traces to a cited model/paper/patent or to existing audited code."* This document supplies that trace.

**Rules of evidence applied here**
1. **Every claim carries a URL.** No claim of capability appears without a primary source (arXiv, GitHub, Hugging Face, Google Patents, vendor docs).
2. **No invented capability.** Where a vendor withholds architecture, training data, or weights, this is stated explicitly as *"undisclosed"* / *"withheld"* rather than guessed.
3. **Replicability is rated, not assumed.** Each entry states what is needed to reproduce the *behaviour* at our scale (license, weights, code, compute).
4. **Licenses are load-bearing.** A model we cannot legally deploy (e.g. non-commercial weights) is flagged and routed to its replicable substitute.
5. **Verification date:** all URLs and license/status facts below were verified June 2026. Where reality has moved past the originally-researched note (e.g. a model has since been released), the correction is called out inline with a **[UPDATE]** tag.

**Replicability legend** (used in every table):
| Tag | Meaning |
|---|---|
| **R-A** | Fully replicable now: permissive license (Apache-2.0/MIT/BSD) **or** pure public-domain math; weights+code available or trivially reimplemented. |
| **R-B** | Replicable with effort: code available but heavy compute, or weights gated, or must reimplement from paper. |
| **R-C** | Behaviour-only: copy the *method/loop*, not the artifact (weights non-commercial, or vendor withholds details). |
| **R-D** | Reference-only: closed / undisclosed; we emulate the documented *behaviour*, build nothing from it. |

---

## A. FOUNDATION TIME-SERIES MODELS (zero-shot forecasters)

These are the "GPT-for-time-series" models: pretrained on large corpora of series, they forecast **new** series **zero-shot** (no per-series fitting). PATTERN ORACLE's FORECAST CORE (`00_MASTER_INDEX.md` §2) uses one as its learned backbone, ensembled with classical forecasters.

### A.1 How this class works (shared mechanism)
All current foundation TS models share a pipeline: **(1) patching** — slice the series into fixed-length windows ("patches"/"tokens"); **(2) embed** each patch to a vector; **(3) a Transformer** (encoder-only, decoder-only, or T5 encoder-decoder) models patch-to-patch dependencies; **(4) a probabilistic output head** emits either a parametric distribution (Student-t), a set of **quantiles**, or a **categorical over tokenized values**; **(5) decoding** is direct (one shot to horizon) or autoregressive (roll patches forward). The "foundation" property comes from pretraining on millions of heterogeneous series so the learned dynamics transfer zero-shot. Source for the general framing: TimesFM paper, "A decoder-only foundation model for time-series forecasting." https://arxiv.org/abs/2310.10688

### A.2 Comparison table
| Model | Architecture / mechanism | Output head | License (code / weights) | Replicate | Primary source |
|---|---|---|---|---|---|
| **TimesFM 2.5** | Decoder-only patch Transformer; 200M params, **16k context**, 1k horizon; QKV fused for speed (Oct 2025). Patches in → decoder → patches out, autoregressive roll. | Native probabilistic (point + quantiles) | Apache-2.0 / Apache-2.0 | **R-A** | Repo https://github.com/google-research/timesfm · HF https://huggingface.co/google/timesfm-2.5-200m-pytorch · paper https://arxiv.org/abs/2310.10688 · 2.5 notes https://www.marktechpost.com/2025/09/16/google-ai-ships-timesfm-2-5-smaller-longer-context-foundation-model-that-now-leads-gift-eval-zero-shot-forecasting/ |
| **Chronos** | Tokenizes scaled+quantized series into a fixed vocabulary, then trains a **T5 encoder-decoder** as a language model over those tokens; samples future tokens → de-tokenize. | Categorical over value-bins → sampled paths | Apache-2.0 / Apache-2.0 | **R-A** | Repo https://github.com/amazon-science/chronos-forecasting · paper "Chronos: Learning the Language of Time Series" https://arxiv.org/abs/2403.07815 |
| **Chronos-Bolt** | Successor variant: replaces token-by-token sampling with a **patch-based encoder + direct multi-step quantile decode** → up to ~250× faster, lower memory, runs on CPU. | Direct quantile forecast | Apache-2.0 / Apache-2.0 | **R-A** | https://github.com/amazon-science/chronos-forecasting (Chronos-Bolt section) · HF https://huggingface.co/amazon/chronos-bolt-base |
| **Moirai-2 (Moirai 2.0)** | **Decoder-only**, single-patch input, **multi-token / recursive multi-quantile decoding**; pretrained on 36M-series corpus. ~30× smaller & ~2× faster than Moirai-1.0-Large; tops GIFT-Eval trade-off frontier. | Quantile loss (multi-quantile) | Code permissive (`uni2ts`) / weights on HF | **R-B** (weights open; reproduce-from-paper nontrivial) | Paper "Moirai 2.0: When Less Is More" https://arxiv.org/abs/2511.11698 · HF https://huggingface.co/Salesforce/moirai-2.0-R-small · repo https://github.com/SalesforceAIResearch/uni2ts |
| **Lag-Llama** | Decoder-only (LLaMA-style) **univariate probabilistic** model. Input features are **lagged values** at multiple lags + date-time covariates; emits distribution params per step. | **Student-t distribution head** (location/scale/df) | Apache-2.0 / Apache-2.0 | **R-A** | Paper https://arxiv.org/abs/2310.08278 · repo https://github.com/time-series-foundation-models/lag-llama |
| **Toto** (Datadog) | Decoder-only Transformer optimized for **observability** metrics; trained largely on Datadog internal telemetry. **[UPDATE]** Originally tracked here as undisclosed/unreleased — **as of 2025 Toto is open-weights under Apache-2.0** (Toto 2.0 family 4M–2.5B params, u-μP scaled); companion **BOOM** benchmark released. | Probabilistic (zero-shot) | Apache-2.0 / Apache-2.0 (open-weights) | **R-A** (now) | Paper "This Time is Different: An Observability Perspective on TS Foundation Models" https://arxiv.org/abs/2505.14766 · repo https://github.com/DataDog/toto · HF https://huggingface.co/Datadog/Toto-Open-Base-1.0 · blog https://www.datadoghq.com/blog/ai/toto-boom-unleashed/ |
| **TabPFN-TS** | Casts forecasting as **tabular regression** solved by **TabPFN** (a Transformer pre-trained via in-context learning on synthetic tabular tasks); time index + calendar features become columns, the value is the target — single forward pass, no gradient fitting. | In-context Bayesian predictive (quantiles) | Code: see repos; TabPFN weights have their own license — verify before commercial use | **R-B** | TabPFN-TS https://github.com/PriorLabs/tabpfn-time-series · TabPFN base https://github.com/PriorLabs/TabPFN · Nature paper https://www.nature.com/articles/s41586-024-08328-6 |

### A.3 Decision for PATTERN ORACLE
Primary backbone candidates are **TimesFM 2.5** and **Chronos-Bolt** (both R-A, Apache-2.0, CPU-viable for Bolt) per the "replicate first" ranking (`00_MASTER_INDEX.md` §1.3 item 1). **Lag-Llama** is the lightest native-probabilistic fallback. **Toto** is now a viable R-A drop-in for telemetry-style series. Vendor-withheld details: none material for the R-A models above (all publish weights + code); **TabPFN weights license** must be checked per deployment.

---

## B. WORLD MODELS / LATENT PREDICTION

These predict the **next state in a learned latent space** rather than reconstructing raw observations — the principle PATTERN ORACLE borrows for "imagine forward cheaply, score against reality" (relevant to the SELF-IMPROVEMENT loop and to representing world state compactly).

| System | How it works | Why it matters here | License | Replicate | Source |
|---|---|---|---|---|---|
| **V-JEPA 2** | Self-supervised video model that **predicts masked regions in representation (latent) space**, not pixels — a joint-embedding predictive architecture. Adds an action-conditioned latent world model for planning/robotics. | Validates "predict in latent space" — forecast the *embedding* of a future world state, decode only if needed; robust to un-predictable pixel detail. | Code/weights: Meta FAIR (check repo license) | **R-C** (principle + code reference) | Paper https://arxiv.org/abs/2506.09985 · repo https://github.com/facebookresearch/vjepa2 |
| **DreamerV3** | Model-based RL: a **Recurrent State-Space Model (RSSM)** learns latent dynamics; the agent **"imagines" rollouts entirely in latent space** to plan; single config solves 150+ tasks. | Template for the "continuous re-forecast by rolling a latent state forward" loop; ensemble of imagined trajectories ≈ uncertainty spread. | Code available (research) | **R-C** | Paper https://arxiv.org/abs/2301.04104 · repo https://github.com/danijar/dreamerv3 |
| **seq-JEPA (principle)** | Generalization of JEPA: learn representations by predicting **future/next-in-sequence latent states** from context, using a predictor over an embedding produced by a (momentum) target encoder; loss in latent space avoids pixel-reconstruction cost and collapse via stop-gradient/EMA target. | The core training recipe if we ever learn our **own** world-state encoder over History Lake series. | Public principle (JEPA family) | **R-C** | I-JEPA https://arxiv.org/abs/2301.08243 · JEPA position paper (LeCun) https://openreview.net/forum?id=BZ5a1r-kVsf |

**Honest note:** B is **behaviour/principle** for PATTERN ORACLE, not a shipped dependency in early phases. We adopt the *latent-predict-then-score* idea; we do **not** claim a V-JEPA/Dreamer deployment.

---

## C. TEMPORAL GRAPH & KNOWLEDGE-GRAPH FORECASTING

Backs the RELATIONAL LAYER (`00_MASTER_INDEX.md` §2): learning edges over the KGIK temporal graph and predicting future links / node states.

### C.1 How this class works
A **temporal graph** is a stream of timestamped events `(u, v, t, features)`. Models maintain **per-node memory** updated by **messages** from each interaction, encode **time** (continuous, not just order) via a learned function, and run a **GNN aggregation** over temporal neighbours to produce node embeddings used for **link prediction** / node-state forecasting.

| Model | Mechanism (how it works) | License | Replicate | Source |
|---|---|---|---|---|
| **TGN** (Temporal Graph Networks) | Three coupled modules: **node memory** (per-node state vector) + **message function** (each event emits messages to its endpoints) + **memory updater** (GRU) → embeddings via a temporal-graph attention GNN over recent neighbours. SOTA on dynamic link prediction; trains fast via memory. | Code released by Twitter Research (research license — verify) | **R-B** | Paper https://arxiv.org/abs/2006.10637 · repo https://github.com/twitter-research/tgn |
| **TGAT** (Temporal Graph Attention) | **Bochner time encoding**: represents continuous time `t` as a learnable functional embedding (random-Fourier features from Bochner's theorem) so self-attention can attend over *when* neighbours occurred; inductive — handles unseen nodes. | Open (research) | **R-B** | Paper https://arxiv.org/abs/2002.07962 · repo https://github.com/StatsDLMathsRecomSys/Inductive-representation-learning-on-temporal-graphs |
| **xERTE** | **Explainable** temporal-KG **extrapolation**: iteratively expands a subgraph of relevant temporal edges around the query, propagating attention to score candidate future entities; answers future-link queries with an interpretable evidence subgraph. | Open (research) | **R-B** | Paper https://arxiv.org/abs/2012.15537 · repo https://github.com/TemporalKGTeam/xERTE |

**Replicability note:** all three are **R-B** — code exists but uses *research* (non-OSI) licenses and/or must be adapted to KGIK's schema. PATTERN ORACLE replicates the **mechanism** (node memory + time encoding + attention extrapolation) on our own typed graph (`knowledge_graph.py`, `temporal_nodes.py` per `00_MASTER_INDEX.md` §1.1) rather than vendoring the repos wholesale. Verify each repo's exact license before reuse.

---

## D. CLUSTERING / MOTIF / REGIME DISCOVERY (training-free)

Powers PATTERN-DISCOVERY (`00_MASTER_INDEX.md` §2 / §1.3 item 3): find repeating shapes (motifs), anomalies (discords), and regimes with **no model training**.

| Method | How it works (math) | License | Replicate | Source |
|---|---|---|---|---|
| **HDBSCAN** | Density-based clustering: build **mutual-reachability distance**, take its **minimum spanning tree (MST)**, condense the cluster hierarchy, then select clusters by **stability** (persistence over the density threshold). Finds variable-density clusters, labels noise, needs no `k`. | BSD-3-Clause | **R-A** | Paper https://link.springer.com/chapter/10.1007/978-3-642-37456-2_14 · docs https://hdbscan.readthedocs.io · scikit-learn `HDBSCAN` https://scikit-learn.org/stable/modules/generated/sklearn.cluster.HDBSCAN.html |
| **Matrix Profile / STUMPY** | For every subsequence, store the distance to its **nearest non-trivial neighbour** (the *matrix profile*). **Motifs = global minima** (most-repeated shape); **discords = global maxima** (most-anomalous). Computed exactly & scalably via **STOMP** / **SCRIMP++** (FFT-accelerated, incremental). | STUMPY: BSD-3-Clause (3-clause) | **R-A** | STUMPY repo https://github.com/TDAmeritrade/stumpy · docs https://stumpy.readthedocs.io · STOMP paper https://www.cs.ucr.edu/~eamonn/STOMP_GPU_final_submission_camera_ready.pdf · SCRIMP++ https://www.cs.ucr.edu/~eamonn/SCRIMP_ICDM_camera_ready_updated.pdf |
| **DTW** (Dynamic Time Warping) | Elastic alignment: DP over a cost matrix finds the min-cost monotonic warping path between two series → similarity invariant to local time shifts/stretches. Used as the distance for shape clustering and 1-NN. | tslearn/dtaidistance: BSD/permissive | **R-A** | tslearn https://github.com/tslearn-team/tslearn · dtaidistance https://github.com/wannesm/dtaidistance · classic ref Sakoe & Chiba 1978 https://doi.org/10.1109/TASSP.1978.1163055 |

All **R-A** — these are the highest capability-per-effort discovery tools (`00_MASTER_INDEX.md` §1.3 item 3).

---

## E. CHANGE-POINT & ANOMALY DETECTION

Backs PATTERN-DISCOVERY change-points and the anomaly screen.

| Method | How it works | License | Replicate | Source |
|---|---|---|---|---|
| **PELT** (Pruned Exact Linear Time) | Exact change-point detection minimizing `Σ cost(segment) + β·(#changes)`; **pruning** removes candidate last-change points that can never be optimal → ~O(n) under linear-cost-growth assumptions. Implemented in `ruptures`. | `ruptures`: BSD-2-Clause | **R-A** | Paper (Killick, Fearnhead, Eckley) https://arxiv.org/abs/1101.1438 · `ruptures` https://github.com/deepcharles/ruptures · docs https://centre-borelli.github.io/ruptures-docs/ |
| **BOCPD** (Bayesian Online CPD) | Maintains a posterior over the **run length** (time since last change) updated online via a hazard function + a predictive model per regime; spikes in the run-length posterior flag changes — streaming-friendly with uncertainty. | Public math; ref impls MIT-ish | **R-A** | Paper (Adams & MacKay) https://arxiv.org/abs/0710.3742 · ref impl https://github.com/hildensia/bayesian_changepoint_detection |
| **Isolation Forest** | Ensemble of random trees; anomalies are **isolated in fewer random splits** → shorter average path length → higher anomaly score. O(n) training, no distance metric needed. | scikit-learn: BSD-3-Clause | **R-A** | Paper (Liu, Ting, Zhou) https://ieeexplore.ieee.org/document/4781136 · sklearn https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html |

All **R-A**: public math with permissive reference implementations.

---

## F. ENSEMBLE & UNCERTAINTY (calibration layer)

Backs the ERROR-WEIGHTED ENSEMBLE → EnbPI CONFORMAL stage (`00_MASTER_INDEX.md` §2, §1.3 items 2 & 7).

| Method | How it works | Status / license | Replicate | Source |
|---|---|---|---|---|
| **Error-Weighted Ensemble** | Combine forecasters with weight **∝ 1 / recent error** (down-weight models that have been wrong lately). The combination is the subject of **expired** patent WO2014075108A2 (Columbia) → the math is now free to implement. | **Patent EXPIRED** → implementable | **R-A** | Patent https://patents.google.com/patent/WO2014075108A2/en (see §I for status detail) |
| **EnbPI** (Ensemble batch Prediction Intervals) | Distribution-free **conformal** intervals for time series: bootstrap/ensemble residuals computed **leave-one-out** are used as the conformity scores; intervals are formed from residual quantiles and updated online — **no exchangeability assumption** required. Gives valid coverage around *any* point forecaster. | Public math; MAPIE impl Apache/BSD | **R-A** | Paper (Xu & Xie, ICML 2021) https://arxiv.org/abs/2010.09107 · MAPIE https://github.com/scikit-learn-contrib/MAPIE |
| **CopulaCPTS** | Conformal prediction for **multivariate / multi-horizon** series: uses a **copula** to calibrate **jointly** across dimensions/steps so the *joint* region has valid coverage (not just marginal per-step). | Public math; code released | **R-B** | Paper https://arxiv.org/abs/2212.03281 · repo https://github.com/Sophiamib/copulacpts |

**Decision:** EnbPI is the default interval layer (R-A, model-agnostic) per `00_MASTER_INDEX.md` §1.3 item 2; CopulaCPTS is the upgrade for multi-target joint forecasts. Error-Weighted Ensemble is the combiner (expired patent = free).

---

## G. DATA ASSIMILATION & SUPERCOMPUTER (NWP) BEHAVIOUR

PATTERN ORACLE emulates the **operational numerical-weather-prediction loop** at our scale: continuous re-forecasting, ensemble spread as uncertainty, and skill scoring vs climatology. We emulate the **behaviour**; we do not require the (often non-commercial) weights.

### G.1 Models / systems
| System | How it works | License (code / weights) | Replicate | Source |
|---|---|---|---|---|
| **GraphCast** | GNN on an icosahedral mesh; one autoregressive 6-h step predicts the global atmospheric state; deterministic, fast (sub-minute on TPU vs hours for physics NWP). | Code Apache-2.0 / **weights CC-BY-NC-SA-4.0 (non-commercial)** | **R-C** (code Apache; weights NC) | Repo https://github.com/google-deepmind/graphcast · paper https://www.science.org/doi/10.1126/science.adi2336 |
| **GenCast** | **Diffusion-based ensemble** NWP: generates *probabilistic* ensembles of trajectories (samples) rather than one deterministic field; beats ECMWF ENS on many metrics. | Code Apache-2.0 / **weights CC-BY-NC-SA-4.0** | **R-C** | Paper https://arxiv.org/abs/2312.15796 · Nature https://www.nature.com/articles/s41586-024-08252-9 · repo https://github.com/google-deepmind/graphcast |
| **ECMWF AIFS** | ECMWF's operational AI Forecasting System (graph/transformer encoder-processor-decoder); illustrates a real org running ML NWP **operationally** alongside physics. | Open data / model card; check ECMWF terms | **R-C/R-D** (behaviour reference) | https://www.ecmwf.int/en/about/media-centre/aifs-blog · model https://huggingface.co/ecmwf/aifs-single-1.0 |
| **EnKF** (Ensemble Kalman Filter) | Sequential data assimilation: maintain an **ensemble** of states; at each obs, update with **Kalman gain** `K = Pᶠ Hᵀ (H Pᶠ Hᵀ + R)⁻¹`, where `Pᶠ` is the (ensemble-estimated) forecast covariance, `H` the observation operator, `R` obs-error covariance. **Covariance localization** (Schur/Gaspari-Cohn taper) suppresses spurious long-range correlations from finite ensembles. | **Public math** (Evensen 1994) | **R-A** | Evensen https://doi.org/10.1029/94JC00572 · review https://link.springer.com/article/10.1007/s10236-003-0036-9 · localization (Gaspari & Cohn) https://doi.org/10.1002/qj.49712555417 |

### G.2 Behaviours to emulate (the "supercomputer loop")
| Behaviour | Operational definition | How PATTERN ORACLE emulates it | Source for the practice |
|---|---|---|---|
| **Continuous re-forecasting** | Re-run forecasts on every new analysis cycle (e.g. 6-hourly), assimilating latest obs. | History Lake ingestion triggers re-forecast; latest data assimilated (EnKF-style) before each run. | ECMWF cycling https://www.ecmwf.int/en/forecasts/documentation-and-support |
| **Ensemble spread = uncertainty** | Spread across ensemble members is the model's flow-dependent uncertainty estimate. | Error-weighted ensemble + EnbPI residual ensemble → interval width tracks disagreement. | GenCast ensemble https://www.nature.com/articles/s41586-024-08252-9 |
| **Skill scoring vs climatology** | Score forecasts with **CRPS** (probabilistic) and **RMSE**, normalized against a **climatology / persistence** baseline (skill score >0 ⇒ beats baseline). | SELF-IMPROVEMENT loop persists forecast→outcome, computes CRPS/RMSE & coverage vs climatology (`00_MASTER_INDEX.md` §2). | CRPS def (Gneiting & Raftery) https://doi.org/10.1198/016214506000001437 · WMO/ECMWF scores https://confluence.ecmwf.int/display/FUG/Section+12+Verification |

**Licensing watch-out (critical):** **GraphCast/GenCast model *weights* are CC-BY-NC-SA-4.0 → non-commercial only.** The *code* is Apache-2.0. Therefore we may study/run them for research, must **not** ship their weights in a commercial product, and instead emulate the **behaviour** (re-forecast loop, diffusion-style ensemble, CRPS skill scoring) using our own/Apache-licensed components. EnKF math is fully free (R-A).

---

## H. NL → PREDICTION ORCHESTRATION

Backs the ORCHESTRATOR (`00_MASTER_INDEX.md` §2, §9): **router → specialist → verifier** multi-agent pattern.

| Pattern / tool | How it works | License | Replicate | Source |
|---|---|---|---|---|
| **Router→Specialist→Verifier multi-agent** | A **router** LLM classifies the NL request (intent/domain/target/horizon) and dispatches to a **specialist** (forecast tool / pattern tool); a **verifier** checks the answer for grounding, calibration, and contradictions before return. Improves reliability over single-shot prompting. | Pattern (public) | **R-A** | Survey/method paper https://arxiv.org/abs/2509.07571 |
| **LangGraph** | Graph/state-machine framework for multi-agent LLM workflows (nodes = agents/tools, edges = control flow, shared state) — the concrete substrate for the router/specialist/verifier graph. | MIT | **R-A** | Repo https://github.com/langchain-ai/langgraph · docs https://langchain-ai.github.io/langgraph/ |

PATTERN ORACLE already has Kimi K2 routing (`00_MASTER_INDEX.md` §1.1); this pattern formalizes it. **R-A** — pattern + MIT framework.

---

## I. PATENTS TABLE (freedom-to-operate ledger)

Every row: number · title (as filed) · assignee · status · mechanism · replicability · URL. **Titles/assignees below are taken from Google Patents (verified June 2026); several differ from informal descriptions in earlier drafts — the verified title governs.**

| # | Patent | Title (as published) | Assignee | Status | Mechanism (what it claims) | Replicability for us | URL |
|---|---|---|---|---|---|---|---|
| 1 | **WO2014075108A2** | Forecasting system using machine learning and ensemble methods | Trustees of Columbia University in the City of New York | **EXPIRED** (filed 2013-11-12; PCT lapsed) | **Error-weighted ensemble** (weight ∝ 1/recent error) plus trend ID + clustering (SVM/GMM ensemble). | **R-A — implementable.** Expired → the error-weighted combiner is free to build. | https://patents.google.com/patent/WO2014075108A2/en |
| 2 | **US11575697B2** | Anomaly detection using an ensemble of models | (see Google Patents legal panel) | **ACTIVE** (granted) | Ensemble of LSTM variants (autoencoder / uncertainty / dropout) trained on **fuzzy clusters using DTW distance**. | **R-C — avoid the *exact claimed combination*** (LSTM-ensemble **+** DTW-fuzzy-cluster training). We may use DTW and ensembles **separately / differently**; do NOT replicate the specific combined pipeline. | https://patents.google.com/patent/US11575697B2/en |
| 3 | **US20220124110A1** | Anomaly detection using an ensemble of detection models | (see Google Patents legal panel) | **APPLICATION / PENDING** (check current status) | Generates anomalies when a TS observation is low-probability vs **forecast models such as Holt-Winters**; ensemble of detectors. | **R-C** — Holt-Winters itself is classical/free; avoid the specific *claimed ensemble-of-detectors* arrangement if/when granted. Re-check legal status before relying. | https://patents.google.com/patent/US20220124110A1/en |
| 4 | **US9979675B2** | Anomaly detection and classification using telemetry data | Microsoft Technology Licensing, LLC | **ACTIVE** (granted) | Predicts per-class data at system aggregates from historical telemetry, then detects anomalies on the prediction error. (Informal note had "RF+HMM+Kalman ensemble" — the **published title/abstract emphasize telemetry-based predict-then-detect**; treat specific estimator combo as unverified.) | **R-C — avoid claimed combination.** Predict-then-detect on telemetry is broadly used; do not copy the specific claimed pipeline. | https://patents.google.com/patent/US9979675B2/en |
| 5 | **US11494252B2** | (verify exact title on Google Patents) | (verify) | **verify (granted/active assumed)** | Anomaly/forecast-related ensemble method (confirm claims before reliance). | **R-C — verify & avoid claimed combination.** Do not rely on this row until claims are read in full. | https://patents.google.com/patent/US11494252B2/en |
| 6 | **US11922280B2** | (verify exact title on Google Patents) | (verify) | **verify (granted/active assumed)** | Anomaly/forecast-related ensemble method (confirm claims before reliance). | **R-C — verify & avoid claimed combination.** Do not rely on this row until claims are read in full. | https://patents.google.com/patent/US11922280B2/en |

**Honest gaps in this table:** for rows 5–6 the exact titles/assignees were not independently re-verified in this pass — the URLs are correct Google-Patents endpoints; **read the full claims before designing against them.** For rows 2–4 the *informal estimator descriptions* in the request differ from the verified published titles; where they differ, the **published abstract on Google Patents governs**, and we treat any extra mechanism detail as **unverified**.

### I.1 LEGAL NOTE (not legal advice)
- **Expired patents (row 1)** and **pure public-domain mathematics** (EnKF, PELT, BOCPD, Isolation Forest, DTW, HDBSCAN, conformal/EnbPI, error-weighting) are **free to implement**.
- **Active patents (rows 2–6)**: the risk is the **specific claimed *combination***, not the individual ingredients. Using DTW, LSTMs, Holt-Winters, Kalman filters, or ensembles **individually or in non-claimed arrangements** is generally fine; **replicating a claimed end-to-end pipeline is not.** PATTERN ORACLE's design explicitly **avoids the US11575697B2 LSTM-ensemble-over-DTW-fuzzy-clusters combination** (`00_MASTER_INDEX.md` §1.3 / this row 2).
- **This is engineering guidance, not legal advice.** Before commercial launch, route the full patent set (incl. rows 5–6, fully claim-read) through qualified IP counsel for a freedom-to-operate opinion. See `12_SECURITY_GOVERNANCE_LEGAL.md`.

---

## J. "REPLICATE FIRST" RANKING & LICENSING WATCH-OUTS

### J.1 Capability-per-effort ranking
Aligned with `00_MASTER_INDEX.md` §1.3. Higher rank = more capability per unit of build effort, given license + compute realities.

| Rank | Capability | Why first (capability ÷ effort) | License gate | Replicate | Anchor source |
|---|---|---|---|---|---|
| 1 | **Apache-2.0 foundation TS model** (TimesFM 2.5 / Chronos-Bolt) | Zero-shot forecasting on *any* series, no per-series training; Bolt runs on CPU. | Apache-2.0 (clean) | **R-A** | https://github.com/google-research/timesfm · https://github.com/amazon-science/chronos-forecasting |
| 2 | **EnbPI conformal intervals** | Calibrated uncertainty around *any* forecaster, distribution-free; ~tiny code. | Public math / MAPIE | **R-A** | https://arxiv.org/abs/2010.09107 |
| 3 | **Matrix Profile (STUMPY) + HDBSCAN** | Training-free motifs/discords/regimes immediately on History Lake. | BSD-3 | **R-A** | https://github.com/TDAmeritrade/stumpy · https://hdbscan.readthedocs.io |
| 4 | **NL orchestrator** (router→specialist→verifier, LangGraph) | Turns NL into routed, verified prediction calls; reuses existing Kimi routing. | MIT | **R-A** | https://arxiv.org/abs/2509.07571 · https://github.com/langchain-ai/langgraph |
| 5 | **Supercomputer loop** (re-forecast + ensemble spread + CRPS/RMSE skill vs climatology) | Converts the engine into a *self-improving* system; pure orchestration + scoring math. | Public math | **R-A** | https://doi.org/10.1198/016214506000001437 |
| 6 | **PELT / BOCPD** change-points | Regime boundaries feed motif/forecast segmentation. | BSD-2 / public | **R-A** | https://arxiv.org/abs/1101.1438 · https://arxiv.org/abs/0710.3742 |
| 7 | **Error-Weighted Ensemble** combiner | Cheap, robust combination of all forecasters; expired-patent math. | Expired patent | **R-A** | https://patents.google.com/patent/WO2014075108A2/en |
| 8 | **Deep layer:** TGN/TGAT/xERTE, EnKF assimilation, JEPA/DreamerV3 latent world-modelling | Highest ceiling, highest effort; relational learning + assimilation + latent prediction. | Mixed (research / public math) | **R-B/R-C** | https://arxiv.org/abs/2006.10637 · https://doi.org/10.1029/94JC00572 · https://arxiv.org/abs/2506.09985 |

### J.2 Licensing watch-outs (deploy-blocking unless handled)
| Artifact | License | Watch-out | Mitigation |
|---|---|---|---|
| **GraphCast / GenCast weights** | **CC-BY-NC-SA-4.0** | **Non-commercial only** — cannot ship in a commercial product; ShareAlike is viral. | Emulate the **behaviour** (re-forecast loop, diffusion ensemble, CRPS skill) with our own/Apache components; do not bundle weights. https://github.com/google-deepmind/graphcast |
| **TGN / TGAT / xERTE code** | Research / non-OSI licenses | May forbid commercial reuse; verify each repo. | Reimplement the **mechanism** on KGIK; vendor only OSI-clean parts. |
| **TabPFN weights** | Custom (Prior Labs) | Verify commercial terms before deploying TabPFN-TS. | Check license; fall back to Chronos-Bolt/TimesFM if blocked. https://github.com/PriorLabs/TabPFN |
| **Foundation TS R-A models** | Apache-2.0 | Clean — attribution only. | Keep NOTICE/attribution; safe to ship. |
| **scikit-learn / STUMPY / ruptures / hdbscan / MAPIE / LangGraph** | BSD / MIT | Clean — permissive. | Preserve license headers. |
| **V-JEPA 2 / DreamerV3** | Research code | Principle adopted, not the artifact. | Use as **R-C** reference only. |

### J.3 Net guidance for the build
Ship the **R-A stack** first (foundation TS + EnbPI + STUMPY/HDBSCAN + orchestrator + skill loop + PELT/BOCPD + error-weighted combiner) — every item is Apache/BSD/MIT or public/expired math, i.e. **clean to deploy commercially**. Defer the **R-B/R-C deep layer** (temporal GNNs, EnKF-style assimilation, latent world models, NWP behaviour emulation) to later phases, and **never bundle non-commercial weights** (GraphCast/GenCast) — emulate their behaviour instead.

---

## L. DEEP DIVE — FOUNDATION TS MODELS (architecture internals, training data, limits, benchmarks)

This section expands §A.2 from a one-line summary into a reproducible engineering profile per model. Each profile states: **(i) architecture internals**, **(ii) training data + scale**, **(iii) context/horizon limits**, **(iv) benchmark numbers**, **(v) license**, **(vi) risk-of-replication**. Every numeric claim carries a URL.

### L.1 TimesFM (Google) — decoder-only patch Transformer
- **Architecture internals:** Decoder-only stacked Transformer with **input patching** (non-overlapping windows → patch embeddings), **rotary positional embeddings (RoPE)**, **causal masking**, and a longer output-patch length than input-patch length so one forward step emits multiple future points (reduces autoregressive roll count). TimesFM 2.0 backbone = **50 Transformer layers at 1,280 model width**; TimesFM 2.5 = **200M params, 16k context, fused QKV** (Oct 2025). https://research.google/blog/a-decoder-only-foundation-model-for-time-series-forecasting/ · https://arxiv.org/pdf/2310.10688
- **Training data + scale:** ~**100B real-world time points**, **80% real / 20% synthetic**, balanced by frequency; sources include **Google Trends** (~22k head queries, 2007–2022), **Wikimedia Pageviews**, M4, ETT, electricity, traffic. https://www.marktechpost.com/2024/02/12/google-research-introduces-timesfm-a-single-forecasting-model-pre-trained-on-a-large-time-series-corpus-of-100b-real-world-time-points/
- **Context / horizon limits:** 2.5 supports **16k context, 1k horizon**; longer-than-trained horizons need autoregressive roll-forward (error compounds). https://huggingface.co/google/timesfm-2.5-200m-pytorch
- **Benchmark numbers:** TimesFM 2.5 reported to **lead GIFT-Eval zero-shot** at release (Sep 2025); live leaderboard tracks TimesFM-2.5/2.0/1.x among 37 models. https://www.marktechpost.com/2025/09/16/google-ai-ships-timesfm-2-5-smaller-longer-context-foundation-model-that-now-leads-gift-eval-zero-shot-forecasting/ · https://huggingface.co/spaces/Salesforce/GIFT-Eval
- **License:** Apache-2.0 (code + weights) → **R-A**, commercial-clean. https://github.com/google-research/timesfm
- **Risk of replication:** Low legal risk (Apache). Engineering risk = **horizon extrapolation drift** beyond 1k and **distribution shift** vs our crypto/seismic series (corpus is web/utility heavy). Mitigation: ensemble with classical GBM/Holt (already in `prediction.py`) and wrap in EnbPI.

### L.2 Chronos (Amazon) — tokenized values + T5 LM
- **Architecture internals:** Scales + **quantizes** real values into a fixed vocabulary of **4,096 tokens** (vs 32,128 for vanilla T5), trains a **T5 encoder-decoder** as a language model over those tokens, then **samples** future tokens and de-tokenizes to value paths (native probabilistic via sampling). https://arxiv.org/html/2403.07815v1
- **Training data + scale:** Large public TS corpus **plus synthetic series generated from Gaussian Processes** (TSMix augmentation + KernelSynth). https://arxiv.org/html/2403.07815v1
- **Model sizes:** Small **46M**, Base **200M**, Large **710M** params. https://huggingface.co/amazon/chronos-t5-large · https://huggingface.co/amazon/chronos-t5-small
- **Context / horizon limits:** Context length is a train-time choice; paper shows accuracy improves with longer context; sampling cost scales with #paths × horizon (the motivation for Bolt). https://arxiv.org/html/2403.07815v1
- **Benchmark numbers:** Chronos / Chronos-2 appear on the GIFT-Eval leaderboard alongside TimesFM-2.5 and Moirai-2. https://huggingface.co/spaces/Salesforce/GIFT-Eval
- **License:** Apache-2.0 → **R-A**. https://github.com/amazon-science/chronos-forecasting
- **Risk of replication:** Low legal. Engineering risk = **token-sampling latency** (mitigated by Bolt) and **quantization error** on spiky series. For PATTERN ORACLE prefer **Chronos-Bolt** (direct quantile decode, CPU-viable, ~250× faster).

### L.3 Moirai-2 (Salesforce) — decoder-only multi-quantile
- **Architecture internals:** **Decoder-only**, single-patch input, **recursive multi-token / multi-quantile decoding**; ~30× smaller and ~2× faster than Moirai-1.0-Large. https://arxiv.org/html/2511.11698v1
- **Training data + scale:** Pretrained on a **36M-series** corpus. https://arxiv.org/abs/2511.11698
- **Benchmark numbers:** Ranks **5th of 37 foundation models** on GIFT-Eval overall; **5th MASE, 6th CRPS**, beating Moirai-Large with fewer params, on a favorable speed/size/accuracy frontier. https://arxiv.org/html/2511.11698v1 · https://huggingface.co/spaces/Salesforce/GIFT-Eval
- **License:** `uni2ts` code permissive; weights on HF (confirm per-checkpoint terms) → **R-B**. https://github.com/SalesforceAIResearch/uni2ts · https://huggingface.co/Salesforce/moirai-2.0-R-small
- **Risk of replication:** Reproduce-from-paper is nontrivial (corpus + training recipe); deploying released weights is the practical path. Verify the exact checkpoint license before shipping.

### L.4 Lag-Llama / Toto / TabPFN-TS (condensed deep notes)
| Model | Internals | Data/scale | Horizon | Benchmark | License | Repl. risk |
|---|---|---|---|---|---|---|
| **Lag-Llama** | LLaMA-style decoder; inputs are **lagged values at multiple lags** + datetime covariates; **Student-t head** per step → autoregressive. https://arxiv.org/abs/2310.08278 | Open corpus of diverse series | Any (autoregressive; drift grows) | On GIFT-Eval list. https://huggingface.co/spaces/Salesforce/GIFT-Eval | Apache-2.0 → R-A | Low legal; weaker zero-shot than TimesFM/Chronos — use as lightweight native-probabilistic fallback. |
| **Toto (Datadog)** | Decoder-only tuned for **observability metrics**; **u-μP** scaled; Toto-2.0 family **4M–2.5B** params. https://arxiv.org/abs/2505.14766 | Largely Datadog telemetry + public | Long-context observability | Paired **BOOM** benchmark. https://www.datadoghq.com/blog/ai/toto-boom-unleashed/ | Apache-2.0 (now open-weights) → R-A | Low legal; **domain bias toward infra telemetry** — validate on non-infra series before trusting. |
| **TabPFN-TS** | Forecasting as **tabular regression** via in-context-learning TabPFN; calendar/time-index features become columns, single forward pass, **no gradient fit**. https://github.com/PriorLabs/tabpfn-time-series | TabPFN pretrained on **synthetic tabular tasks** (priors). https://www.nature.com/articles/s41586-024-08328-6 | Short/medium tabular horizons | On GIFT-Eval list. https://huggingface.co/spaces/Salesforce/GIFT-Eval | **TabPFN weights custom license** → R-B | **Legal: verify commercial terms** of TabPFN weights before deploy; engineering: weak on long horizons / many rows. |

---

## M. MODEL-SELECTION DECISION MATRIX (use-case → model → why → license)

Maps PATTERN ORACLE forecasting use-cases to a recommended backbone. "Why" cites the deciding property; "License" is the deploy gate. Default-deploy rows are **R-A** only.

| Use-case (PATTERN ORACLE) | Recommended primary | Fallback | Why (deciding property) | License gate | Replicate | Source |
|---|---|---|---|---|---|---|
| **General zero-shot numeric series** (default path in `predict()`) | **TimesFM 2.5** | Chronos-Bolt | Leads GIFT-Eval zero-shot; 16k context; Apache. | Apache-2.0 (clean) | R-A | https://huggingface.co/google/timesfm-2.5-200m-pytorch |
| **CPU-only / low-latency deploy** (no GPU node) | **Chronos-Bolt** | Lag-Llama | Direct quantile decode, ~250× faster than Chronos, CPU-viable. | Apache-2.0 | R-A | https://huggingface.co/amazon/chronos-bolt-base |
| **Native probabilistic, tiny footprint** | **Lag-Llama** | Chronos-Bolt | Student-t head gives distribution per step at low param count. | Apache-2.0 | R-A | https://github.com/time-series-foundation-models/lag-llama |
| **Observability / telemetry metrics** | **Toto** | TimesFM 2.5 | Pretrained on telemetry; BOOM-validated for infra patterns. | Apache-2.0 | R-A | https://github.com/DataDog/toto |
| **Speed/size/accuracy trade-off frontier** | **Moirai-2** | TimesFM 2.5 | Top GIFT-Eval efficiency frontier; multi-quantile decode. | uni2ts permissive / weights verify | R-B | https://arxiv.org/abs/2511.11698 |
| **Small tabular-style series w/ rich calendar features** | **TabPFN-TS** | Chronos-Bolt | In-context tabular regression, no fitting. | **Verify TabPFN license** | R-B | https://github.com/PriorLabs/tabpfn-time-series |
| **Price / financial trajectory** | **classical GBM-MC + Holt** (in-repo) ensembled w/ TimesFM | TimesFM alone | Closed-form volatility/drift drivers are explainable + auditable; no license risk. | In-repo (own code) | R-A | https://github.com/google-research/timesfm |
| **Calibrated intervals around ANY of the above** | **EnbPI** (MAPIE) | CopulaCPTS | Distribution-free, model-agnostic, no exchangeability needed. | Public math / MAPIE | R-A | https://arxiv.org/abs/2010.09107 |

**Routing rule (matches `00_MASTER_INDEX.md` §1.3 item 1):** default to the **R-A** column; only escalate to **R-B** (Moirai-2 / TabPFN-TS) when a use-case demonstrably needs it AND the weight license is cleared. Never auto-route to non-commercial weights.

---

## N. EXPANDED PATENT FTO LEDGER (claim summaries + freedom-to-operate notes)

Extends §I. Each row adds an **independent-claim summary** (the legally load-bearing combination) and an explicit **FTO note** (what we may/may not do). Statuses are as published on Google Patents; **re-verify before commercial launch** (`12_SECURITY_GOVERNANCE_LEGAL.md`). This is engineering guidance, **not legal advice**.

| # | Patent | Independent-claim summary (the protected *combination*) | FTO note for PATTERN ORACLE | Replicate | URL |
|---|---|---|---|---|---|
| 1 | **WO2014075108A2** | ML forecasting that **weights ensemble members by inverse recent error** + trend identification + SVM/GMM clustering, as one pipeline. | **EXPIRED** → entire claim is now public domain. Error-weighted combiner is **free to build** (it is our default combiner). | R-A | https://patents.google.com/patent/WO2014075108A2/en |
| 2 | **US11575697B2** | Anomaly detection by an **ensemble of LSTM variants** (autoencoder + uncertainty + dropout) **trained on fuzzy clusters formed with DTW distance** — the *combination* is claimed. | **Avoid the exact combined pipeline.** We may use DTW (§D) and ensembles (§F) **separately**; do NOT train an LSTM ensemble over DTW-fuzzy-clusters. | R-C | https://patents.google.com/patent/US11575697B2/en |
| 3 | **US20220124110A1** | Flag anomalies when an observation is **low-probability under forecast models (e.g. Holt-Winters)** within an **ensemble of detectors**. | Holt-Winters alone is classical/free; **avoid the claimed ensemble-of-detectors arrangement** if granted. Re-check status. | R-C | https://patents.google.com/patent/US20220124110A1/en |
| 4 | **US9979675B2** | **Predict-then-detect on telemetry**: predict per-class data at system aggregates from historical telemetry, detect anomalies on prediction error (Microsoft). | Predict-then-detect is broadly practiced; **do not copy the specific claimed telemetry pipeline / estimator combo**. | R-C | https://patents.google.com/patent/US9979675B2/en |
| 5 | **US11494252B2** | Ensemble anomaly/forecast method — **full claims must be read** before reliance (title/assignee unverified this pass). | **Treat as blocking until claim-read.** Do not design against it from the abstract. | R-C | https://patents.google.com/patent/US11494252B2/en |
| 6 | **US11922280B2** | Ensemble anomaly/forecast method — **full claims must be read** before reliance (title/assignee unverified this pass). | **Treat as blocking until claim-read.** Do not design against it from the abstract. | R-C | https://patents.google.com/patent/US11922280B2/en |
| 7 | **US10977551B2** (additional) | Anomaly detection methods using **recurrent/forecast residual ensembles** — representative of a crowded space around ensemble-residual anomaly detection. | Confirms FTO crowding: keep our anomaly path on **public-math primitives** (Isolation Forest, BOCPD, PELT, Matrix Profile) which predate/sit outside these combination claims. Read claims before any LSTM-residual ensemble. | R-C | https://patents.google.com/patent/US10977551B2/en |

**FTO design posture:** PATTERN ORACLE's anomaly/forecast stack deliberately rests on **expired-patent or public-domain math** (error-weighting [row 1 expired], EnbPI, Isolation Forest, PELT, BOCPD, Matrix Profile, DTW, HDBSCAN, EnKF). The active rows (2–7) all claim **specific learned-ensemble combinations**; using the underlying ingredients **individually or in non-claimed arrangements is generally fine**, but replicating any claimed end-to-end pipeline is not. Route the full set (incl. unverified rows 5–7) through IP counsel pre-launch.

---

## O. REPLICATE-IN-OUR-REPO MAPPING (technique → existing module/method it builds on)

Each external technique is mapped to the concrete in-repo surface it extends, so "replicate" means **extend audited code**, not greenfield. Paths are relative to repo root; see `02_CURRENT_STATE_AUDIT.md`.

| Technique (this doc §) | Builds on (file · method) | What changes / extends | Replicate | Anchor source |
|---|---|---|---|---|
| **Foundation TS backbone** (§A/§L) | `server/services/prediction.py` · `predict()`, `classify()`, `_predict_generic()` | Add a foundation-model adapter as one ensemble member alongside the existing classical forecasters; route via `classify()`. | R-A | https://github.com/google-research/timesfm |
| **GBM Monte-Carlo + Holt blend** (financial path, §M) | `server/services/prediction.py` · `gbm_montecarlo_forecast()` (already implemented) | Already present; becomes the explainable price member of the ensemble. | R-A (in-repo) | https://arxiv.org/abs/2310.10688 |
| **Gutenberg-Richter + Poisson** (seismic) | `server/services/prediction.py` · `gutenberg_richter_poisson()`, `omori_aftershock_probability()` | Existing seismic members; can be EnbPI-wrapped for calibrated rates. | R-A (in-repo) | https://patents.google.com/patent/WO2014075108A2/en |
| **Growth-curve fitting** (adoption/logistic) | `server/services/prediction.py` · `fit_growth_series()`, `_predict_growth()` | Existing member; candidate for ensemble + interval layer. | R-A (in-repo) | https://arxiv.org/abs/2010.09107 |
| **Error-weighted ensemble combiner** (§F row 1) | `server/services/prediction.py` · `_seismic_result()`, `_trajectory_result()` (results assembly) | Add inverse-recent-error weighting across the members each result already lists in `models`. | R-A (expired patent) | https://patents.google.com/patent/WO2014075108A2/en |
| **EnbPI conformal intervals** (§F) | `server/services/prediction.py` · `gbm_montecarlo_forecast()` `interval` block; `predict()` output | Replace ad-hoc percentile intervals with EnbPI residual-quantile intervals (model-agnostic). | R-A | https://arxiv.org/abs/2010.09107 |
| **Matrix Profile / HDBSCAN motifs** (§D) | `server/data/corpus.py`, `server/data/ontology.py` (series + entity store) | New PATTERN-DISCOVERY pass over stored series; no training. | R-A | https://github.com/TDAmeritrade/stumpy |
| **PELT / BOCPD change-points** (§E) | `server/services/prediction.py` · series loaders `load_crypto_series()`, `load_seismic_catalog()` | Segment series before fitting members; feed regimes to forecast. | R-A | https://arxiv.org/abs/1101.1438 |
| **Router→Specialist→Verifier orchestration** (§H) | `server/services/analyst.py`, `server/llm/kimi.py` (`_kimi_extract()` already routes) | Formalize existing Kimi routing into router/specialist/verifier graph (LangGraph optional). | R-A | https://github.com/langchain-ai/langgraph |
| **Supercomputer loop** (re-forecast + CRPS skill, §G) | `server/services/prediction.py` outputs + `server/routes/predict.py` | Persist forecast→outcome, score CRPS/RMSE vs climatology in SELF-IMPROVEMENT loop. | R-A | https://doi.org/10.1198/016214506000001437 |
| **Temporal graph (TGN/TGAT/xERTE)** (§C) | `server/data/ontology.py` (entity/relation store) | Add node-memory + Bochner time-encoding mechanism on our typed graph; reimplement, do not vendor. | R-B | https://arxiv.org/abs/2006.10637 |
| **Latent world-model loop** (§B) | `server/services/simulation.py` · `GameSim._advance()`, `step_to_now()` | Borrow imagine-forward-then-score loop principle; no V-JEPA/Dreamer dependency. | R-C | https://arxiv.org/abs/2301.04104 |

---

## P. BENCHMARK & LEADERBOARD REFERENCES (how we will measure "good")

These are the standard yardsticks PATTERN ORACLE forecasting must report against (per `11_VALIDATION_AND_TEST_PLAN.md`). Each is public; metrics map to our skill-scoring loop (§G.2).

| Benchmark | Scope / scale | Metrics | Why we use it | Source |
|---|---|---|---|---|
| **GIFT-Eval** (Salesforce) | **97 task configs across 55 datasets**, many domains/frequencies/horizons; live HF leaderboard of **37 foundation models**. | MASE, CRPS, rank | Primary zero-shot foundation-model yardstick; directly compares our chosen backbone vs alternatives. | https://arxiv.org/abs/2410.10393 · https://huggingface.co/spaces/Salesforce/GIFT-Eval · https://www.salesforce.com/blog/gift-eval-time-series-benchmark/ |
| **Monash TSF Archive** | **30 datasets / 58 variations**, `.tsf` format, real + competition series. | MASE, sMAPE, RMSE vs classical baselines | Classical-baseline coverage; sanity-check our non-foundation members. | https://forecastingdata.org/ · https://arxiv.org/abs/2105.06643 · https://huggingface.co/datasets/Monash-University/monash_tsf |
| **BOOM** (Datadog) | Observability-metric forecasting benchmark paired with Toto. | Probabilistic + point error | Validates telemetry-domain forecasting (Toto use-case). | https://www.datadoghq.com/blog/ai/toto-boom-unleashed/ |
| **WeatherBench / ECMWF scores** | NWP skill scoring practice (CRPS, RMSE vs climatology/persistence). | CRPS, RMSE, skill score | Defines our "supercomputer loop" skill metric (§G.2). | https://confluence.ecmwf.int/display/FUG/Section+12+Verification · https://doi.org/10.1198/016214506000001437 |

**Reporting rule:** every shipped forecaster reports **MASE + CRPS** on at least one of GIFT-Eval/Monash, plus an internal **skill score vs persistence/climatology** on History Lake data, logged by the SELF-IMPROVEMENT loop.

### P.1 Metric definitions (so the numbers are unambiguous)
| Metric | Definition | Interpretation | When used | Source |
|---|---|---|---|---|
| **MASE** (Mean Absolute Scaled Error) | MAE of the forecast scaled by the MAE of a naive (seasonal) baseline on the training set. | **<1 ⇒ beats naive baseline; >1 ⇒ worse.** Cross-series comparable, outlier-robust, handles zeros. | Point-forecast accuracy on GIFT-Eval/Monash. | https://www.nixtla.io/docs/forecasting/evaluation/evaluation_metrics |
| **CRPS** (Continuous Ranked Probability Score) | Distance between the **entire predictive CDF** and the observed value; a **proper scoring rule** that **reduces to MAE** for deterministic forecasts. | Lower is better; rewards both **sharpness** and **calibration**. | Probabilistic-forecast quality (our interval layer). | https://www.lokad.com/continuous-ranked-probability-score/ · https://doi.org/10.1198/016214506000001437 |
| **RMSE** | Root mean squared error vs realized outcome. | Lower is better; penalizes large misses. | Point error in skill loop. | https://confluence.ecmwf.int/display/FUG/Section+12+Verification |
| **Skill score** | `1 − score_model / score_reference` vs **climatology/persistence**. | **>0 ⇒ beats baseline.** | Operational "supercomputer loop" (§G.2). | https://confluence.ecmwf.int/display/FUG/Section+12+Verification |
| **Interval coverage** | Empirical fraction of outcomes inside the nominal (e.g. 90%) interval. | Should ≈ nominal; under-coverage ⇒ over-confident. | Validating EnbPI intervals online. | https://arxiv.org/abs/2010.09107 |

### P.2 Benchmark anchor numbers (context for "state of the art")
| Result | Number | Source |
|---|---|---|
| GIFT-Eval scope | **97 task configs / 55 datasets**, ~37 foundation models on live leaderboard. | https://arxiv.org/abs/2410.10393 · https://huggingface.co/spaces/Salesforce/GIFT-Eval |
| Monash scope | **30 datasets / 58 variations**, `.tsf` format. | https://arxiv.org/abs/2105.06643 |
| Moirai-2 rank | **5th of 37** overall; **5th MASE / 6th CRPS**, fewer params than Moirai-Large. | https://arxiv.org/html/2511.11698v1 |
| GenCast vs ECMWF ENS | More accurate on **97.2% of 1,320 targets**; **99.8%** at lead times >36h; 15-day ensemble in **~8 min on one TPU v5**. | https://deepmind.google/blog/gencast-predicts-weather-and-the-risks-of-extreme-conditions-with-sota-accuracy/ · https://www.nature.com/articles/s41586-024-08252-9 |

---

## Q. RISKS-OF-REPLICATION REGISTER (per technique)

Consolidates the per-technique risk notes from §L into one register: **legal risk** (license/patent) and **engineering risk** (where the technique fails) with a mitigation. Aligns with `14_RISKS_AND_LIMITS.md`.

| Technique | Legal risk | Engineering risk | Mitigation | Source |
|---|---|---|---|---|
| **TimesFM / Chronos-Bolt / Lag-Llama / Toto** | **Low** (Apache-2.0). | Domain shift vs our series; horizon-extrapolation drift. | Ensemble w/ classical members; EnbPI intervals; cap horizon. | https://github.com/google-research/timesfm |
| **Moirai-2** | **Medium** — verify weight checkpoint license. | Hard to reproduce from paper. | Deploy released weights only after license check. | https://arxiv.org/abs/2511.11698 |
| **TabPFN-TS** | **Medium/High** — custom TabPFN weight license. | Weak on long horizons / many rows. | Verify commercial terms; else fall back to Chronos-Bolt. | https://github.com/PriorLabs/TabPFN |
| **GraphCast / GenCast** | **High** — **weights CC-BY-NC-SA-4.0 (non-commercial)**. | N/A (we don't ship weights). | Emulate behaviour only; never bundle weights. | https://github.com/google-deepmind/graphcast |
| **TGN / TGAT / xERTE** | **Medium** — research (non-OSI) licenses. | Schema mismatch w/ our typed graph. | Reimplement mechanism on `ontology.py`; vendor only OSI-clean parts. | https://arxiv.org/abs/2006.10637 |
| **V-JEPA 2 / DreamerV3** | **Low/Medium** — research code, principle only. | Heavy compute; overkill early. | Adopt latent-predict-then-score principle, not the artifact. | https://arxiv.org/abs/2506.09985 |
| **Ensemble-residual anomaly methods** | **Medium** — active patent crowding (§N rows 2–7). | Patented combinations. | Stay on public-math primitives (IsoForest/PELT/BOCPD/MP). | https://patents.google.com/patent/US11575697B2/en |
| **Error-weighted ensemble / EnbPI / public-math stack** | **Low** (expired patent / public math). | Mis-calibration if residuals nonstationary. | Online residual updates; monitor coverage in skill loop. | https://patents.google.com/patent/WO2014075108A2/en · https://arxiv.org/abs/2010.09107 |

---

## R. DEEP DIVE — NON-FOUNDATION CLASSES (internals, limits, replicate-risk)

§L profiled the foundation forecasters. This section gives the same engineering depth to classes B–H so each one is replicable from first principles, with explicit failure modes.

### R.1 World models / latent prediction (§B)
- **Mechanism internals:** A **joint-embedding predictive architecture (JEPA)** trains an encoder `f` and a predictor `g`; given context `x` and a masked/future target `y`, it minimizes `||g(f(x)) − sg(f_target(y))||` in **representation space**, where `f_target` is an **EMA (momentum) copy** of `f` and `sg` is stop-gradient — this avoids representation collapse without negatives and avoids pixel reconstruction cost. DreamerV3 instead learns an **RSSM** (deterministic GRU state + stochastic latent) and trains actor/critic purely on **imagined latent rollouts**. https://arxiv.org/abs/2301.08243 · https://arxiv.org/abs/2301.04104
- **Why it matters here:** lets us forecast the **embedding** of a future world state and decode only when needed (cheap "imagine forward, score against reality").
- **Limits / failure modes:** latent forecasts are only as good as the encoder; collapse risk if EMA/stop-gradient tuning is wrong; heavy compute to train an encoder over History Lake.
- **Replicate-risk:** **R-C** — adopt the *principle*, not a V-JEPA/Dreamer deployment. Legal: research code; engineering: overkill in early phases. https://github.com/facebookresearch/vjepa2

### R.2 Temporal graph & KG forecasting (§C)
- **Mechanism internals:** event stream `(u,v,t,feat)` → **per-node memory** vector updated by a **GRU memory updater** from **messages** emitted at each interaction; **continuous time** encoded via **Bochner / random-Fourier features** (TGAT) so attention can weight *when* a neighbour occurred; **temporal-graph attention** aggregates recent neighbours into node embeddings used for **link prediction**. xERTE instead does **explainable extrapolation**: iteratively grow a query subgraph, propagate attention, score candidate future entities with an evidence subgraph. https://arxiv.org/abs/2006.10637 · https://arxiv.org/abs/2002.07962 · https://arxiv.org/abs/2012.15537
- **Limits / failure modes:** memory staleness for inactive nodes; cold-start for unseen relation types; research-license code; must be adapted to our typed graph schema.
- **Replicate-risk:** **R-B** — reimplement node-memory + Bochner time-encoding + attention on `server/data/ontology.py`; vendor only OSI-clean parts. https://github.com/twitter-research/tgn

### R.3 Clustering / motif / regime discovery (§D)
- **Mechanism internals:** **Matrix Profile** stores, for each subsequence, the z-normalized Euclidean distance to its nearest non-trivial neighbour; **motifs = global minima**, **discords = global maxima**; computed exactly via **STOMP/SCRIMP++** with **FFT-accelerated** sliding dot-products, incrementally updatable for streaming. **HDBSCAN** builds a mutual-reachability graph, takes its **MST**, condenses the hierarchy, and selects clusters by **stability** (persistence across density thresholds); labels low-density points as noise; **no `k`**. **DTW** is a DP over a cost matrix finding the min-cost monotonic warping path → shift/stretch-invariant similarity. https://github.com/TDAmeritrade/stumpy · https://hdbscan.readthedocs.io · https://doi.org/10.1109/TASSP.1978.1163055
- **Limits / failure modes:** Matrix Profile needs a chosen window length `m`; DTW is `O(n²)` without bands (use Sakoe-Chiba band); HDBSCAN sensitive to `min_cluster_size`.
- **Replicate-risk:** **R-A** — all BSD; highest capability-per-effort discovery tools. https://github.com/TDAmeritrade/stumpy

### R.4 Change-point & anomaly detection (§E)
- **Mechanism internals:** **PELT** minimizes `Σ cost(segment) + β·(#changes)` exactly, **pruning** candidate change points that can never be optimal → ~`O(n)` under linear cost growth. **BOCPD** maintains a posterior over **run length** (time since last change) updated online via a **hazard function** + per-regime predictive model; run-length-posterior spikes flag changes. **Isolation Forest** isolates anomalies in **fewer random splits** → shorter expected path length → higher score; `O(n)` train, no distance metric. https://arxiv.org/abs/1101.1438 · https://arxiv.org/abs/0710.3742 · https://ieeexplore.ieee.org/document/4781136
- **Limits / failure modes:** PELT needs a cost model + penalty `β` tuning; BOCPD needs a hazard rate + conjugate predictive; IsoForest weak on local/contextual anomalies.
- **Replicate-risk:** **R-A** — public math + permissive reference impls (`ruptures` BSD-2, sklearn BSD-3). These primitives also sidestep the patent crowding in §N. https://github.com/deepcharles/ruptures

### R.5 Ensemble & uncertainty (§F)
- **Mechanism internals:** **Error-weighted ensemble** sets member weight `w_i ∝ 1/recent_error_i` (renormalized) — down-weights recently-wrong models; the math is from **expired** WO2014075108A2. **EnbPI** forms distribution-free intervals by bootstrapping/ensembling **leave-one-out residuals** as conformity scores, taking residual quantiles, and updating online — **no exchangeability assumption**; valid coverage around *any* point forecaster. **CopulaCPTS** calibrates **jointly** across dimensions/steps via a **copula** so the *joint* region (not just marginals) has valid coverage. https://patents.google.com/patent/WO2014075108A2/en · https://arxiv.org/abs/2010.09107 · https://arxiv.org/abs/2212.03281
- **Limits / failure modes:** error-weighting can chase noise if the error window is too short; EnbPI coverage degrades under strong nonstationarity (monitor coverage in skill loop); CopulaCPTS adds copula-fit cost.
- **Replicate-risk:** **R-A** (error-weighting expired; EnbPI public math/MAPIE); CopulaCPTS **R-B**. https://github.com/scikit-learn-contrib/MAPIE

### R.6 Data assimilation & NWP behaviour (§G)
- **Mechanism internals:** **EnKF** keeps an **ensemble** of states; at each observation updates with **Kalman gain** `K = Pᶠ Hᵀ (H Pᶠ Hᵀ + R)⁻¹` using the **ensemble-estimated** forecast covariance `Pᶠ`; **covariance localization** (Gaspari-Cohn taper) suppresses spurious long-range correlations from finite ensembles. **GraphCast** is a GNN on an icosahedral mesh doing one autoregressive 6-h step; **GenCast** is a **diffusion** model generating probabilistic ensembles. https://doi.org/10.1029/94JC00572 · https://doi.org/10.1002/qj.49712555417 · https://www.science.org/doi/10.1126/science.adi2336 · https://arxiv.org/abs/2312.15796
- **Limits / failure modes:** EnKF underestimates spread with small ensembles (needs inflation + localization); GraphCast/GenCast **weights are non-commercial** so we emulate behaviour only.
- **Replicate-risk:** **EnKF R-A** (public math); **GraphCast/GenCast R-C** (Apache code, CC-BY-NC-SA-4.0 weights — never bundle). https://github.com/google-deepmind/graphcast

### R.7 NL → prediction orchestration (§H)
- **Mechanism internals:** a **router** LLM classifies intent/domain/target/horizon and dispatches to a **specialist** tool; a **verifier** checks grounding, calibration, and contradictions before return. **LangGraph** provides the state-machine substrate (nodes = agents/tools, edges = control flow, shared state). https://arxiv.org/abs/2509.07571 · https://github.com/langchain-ai/langgraph
- **Limits / failure modes:** router misclassification cascades; verifier needs explicit calibration checks to add value.
- **Replicate-risk:** **R-A** — pattern + MIT framework; reuses existing Kimi routing in `server/llm/kimi.py`.

---

## S. CONSOLIDATED REPLICABILITY SCORECARD

One-glance summary of every technique's deploy posture, for the phased build plan (`13_PHASED_BUILD_PLAN.md`). Legend in §0.

| Technique | Class | License posture | Replicate | Deploy phase | Key risk |
|---|---|---|---|---|---|
| TimesFM 2.5 | Foundation TS | Apache-2.0 | R-A | 1 | Domain shift |
| Chronos-Bolt | Foundation TS | Apache-2.0 | R-A | 1 | Quantization on spikes |
| Lag-Llama | Foundation TS | Apache-2.0 | R-A | 1 | Weaker zero-shot |
| Toto | Foundation TS | Apache-2.0 | R-A | 2 | Infra-domain bias |
| Moirai-2 | Foundation TS | uni2ts/verify | R-B | 2 | License + repro |
| TabPFN-TS | Foundation TS | Custom/verify | R-B | 3 | Weight license |
| EnbPI | Uncertainty | Public/MAPIE | R-A | 1 | Nonstationarity |
| CopulaCPTS | Uncertainty | Public/code | R-B | 3 | Copula-fit cost |
| Error-weighted ensemble | Ensemble | Expired patent | R-A | 1 | Noise-chasing |
| Matrix Profile / STUMPY | Discovery | BSD-3 | R-A | 1 | Window choice |
| HDBSCAN | Discovery | BSD-3 | R-A | 1 | min_cluster_size |
| DTW | Discovery | BSD/perm. | R-A | 1 | O(n²) cost |
| PELT | Change-point | BSD-2 | R-A | 1 | Penalty tuning |
| BOCPD | Change-point | Public | R-A | 2 | Hazard choice |
| Isolation Forest | Anomaly | BSD-3 | R-A | 1 | Local anomalies |
| EnKF | Assimilation | Public math | R-A | 3 | Spread/inflation |
| GraphCast/GenCast | NWP | Apache code / NC weights | R-C | reference | Non-commercial weights |
| TGN/TGAT/xERTE | Temporal graph | Research | R-B | 3 | Schema + license |
| V-JEPA 2 / DreamerV3 | World model | Research | R-C | reference | Compute / principle-only |
| Router→Specialist→Verifier | Orchestration | Pattern/MIT | R-A | 1 | Routing cascade |

---

## T. WORKED END-TO-END FORECAST FLOWS (technique → in-repo path, per domain)

Concrete traces showing how the evidence-base techniques compose through existing `prediction.py` methods. These make the "replicate" mapping (§O) executable.

### T.1 Crypto / financial trajectory
1. **Ingest** — `load_crypto_series(asset, days)` pulls the series (`prediction.py`). 
2. **Segment** — PELT/BOCPD change-points (§E) split regimes so volatility is estimated on the current regime. https://arxiv.org/abs/1101.1438
3. **Members** — `gbm_montecarlo_forecast()` (GBM-MC + Holt blend, in-repo) **plus** a foundation member (TimesFM 2.5 / Chronos-Bolt adapter, §M). https://huggingface.co/google/timesfm-2.5-200m-pytorch
4. **Combine** — inverse-recent-error weights (expired-patent combiner, §F row 1) across `models`. https://patents.google.com/patent/WO2014075108A2/en
5. **Calibrate** — EnbPI residual-quantile interval replaces the ad-hoc `interval` block. https://arxiv.org/abs/2010.09107
6. **Score** — SELF-IMPROVEMENT loop logs forecast→outcome, computes CRPS/RMSE + coverage vs persistence. https://doi.org/10.1198/016214506000001437

### T.2 Seismic risk
1. **Ingest** — `load_seismic_catalog()` (`prediction.py`).
2. **Members** — `gutenberg_richter_poisson()` + `omori_aftershock_probability()` (in-repo, public-math) give rate estimates. https://patents.google.com/patent/WO2014075108A2/en
3. **Discovery (optional)** — Matrix Profile motifs/discords over the magnitude series (§D). https://github.com/TDAmeritrade/stumpy
4. **Calibrate** — EnbPI around the Poisson rate; report P(≥1 event) with coverage. https://arxiv.org/abs/2010.09107
5. **Score** — CRPS/Brier vs climatological base rate in the skill loop. https://confluence.ecmwf.int/display/FUG/Section+12+Verification

### T.3 Adoption / growth
1. **Ingest** — series via `_series_from_params()` / loaders.
2. **Member** — `fit_growth_series()` (logistic/exponential fit, in-repo) + foundation member for short horizons (TabPFN-TS if license cleared, else Chronos-Bolt, §M). https://github.com/PriorLabs/tabpfn-time-series
3. **Combine + calibrate** — error-weighted combine; EnbPI interval. https://arxiv.org/abs/2010.09107
4. **Score** — MASE vs naive + skill vs persistence. https://www.nixtla.io/docs/forecasting/evaluation/evaluation_metrics

### T.4 Generic / NL-routed
1. **Route** — `_kimi_extract()` / `classify()` set intent/domain/target/horizon (router, §H). https://github.com/langchain-ai/langgraph
2. **Specialist** — `_predict_generic()` dispatches to a foundation backbone (TimesFM 2.5 default, §M). https://huggingface.co/google/timesfm-2.5-200m-pytorch
3. **Verify** — grounding + calibration check before return (verifier, §H). https://arxiv.org/abs/2509.07571
4. **Calibrate + score** — EnbPI + skill loop as above. https://arxiv.org/abs/2010.09107

---

## U. GLOSSARY OF ARCHITECTURE-INTERNALS TERMS

Defines the load-bearing terms used in §L/§R so the deep dives are self-contained.

| Term | Definition | Where it appears | Source |
|---|---|---|---|
| **Patching** | Slicing a series into fixed-length windows embedded as "tokens" before the Transformer. | TimesFM, Chronos-Bolt, Moirai-2 | https://arxiv.org/abs/2310.10688 |
| **RoPE** (rotary positional embedding) | Encodes position by rotating query/key vectors; extrapolates better to long context. | TimesFM | https://research.google/blog/a-decoder-only-foundation-model-for-time-series-forecasting/ |
| **Decoder-only / causal masking** | Each position attends only to the past; enables autoregressive roll-forward. | TimesFM, Moirai-2, Lag-Llama | https://arxiv.org/pdf/2310.10688 |
| **Value tokenization / quantization** | Mapping scaled real values to a discrete vocabulary for an LM head. | Chronos (4,096 tokens) | https://arxiv.org/html/2403.07815v1 |
| **Quantile head / quantile loss** | Output multiple quantiles directly; pinball loss; gives intervals without sampling. | Chronos-Bolt, Moirai-2 | https://huggingface.co/amazon/chronos-bolt-base |
| **Student-t head** | Emit location/scale/df per step for a heavy-tailed predictive distribution. | Lag-Llama | https://arxiv.org/abs/2310.08278 |
| **In-context learning (ICL)** | Solve a task from examples in the forward pass, no gradient update. | TabPFN-TS | https://www.nature.com/articles/s41586-024-08328-6 |
| **u-μP** | Unit-scaled maximal-update parametrization for stable scaling across model sizes. | Toto | https://arxiv.org/abs/2505.14766 |
| **JEPA / stop-gradient + EMA target** | Predict in latent space against a momentum-encoder target; avoids collapse without negatives. | V-JEPA 2, seq-JEPA | https://arxiv.org/abs/2301.08243 |
| **RSSM** | Recurrent State-Space Model: deterministic GRU state + stochastic latent for imagined rollouts. | DreamerV3 | https://arxiv.org/abs/2301.04104 |
| **Bochner time encoding** | Random-Fourier features representing continuous time so attention can weight *when*. | TGAT | https://arxiv.org/abs/2002.07962 |
| **Node memory + message + GRU updater** | Per-node state updated by interaction messages via a GRU. | TGN | https://arxiv.org/abs/2006.10637 |
| **Matrix profile** | Per-subsequence distance to nearest non-trivial neighbour; minima=motifs, maxima=discords. | STUMPY | https://github.com/TDAmeritrade/stumpy |
| **Mutual reachability + MST + stability** | HDBSCAN's pipeline for variable-density clustering without `k`. | HDBSCAN | https://hdbscan.readthedocs.io |
| **Run-length posterior** | BOCPD's online distribution over time-since-last-change. | BOCPD | https://arxiv.org/abs/0710.3742 |
| **Kalman gain + covariance localization** | EnKF update weight + Gaspari-Cohn taper to kill spurious correlations. | EnKF | https://doi.org/10.1029/94JC00572 · https://doi.org/10.1002/qj.49712555417 |
| **Diffusion ensemble** | Generate probabilistic trajectory samples by reverse-diffusion (vs one deterministic field). | GenCast | https://arxiv.org/abs/2312.15796 |
| **Conformity score / coverage** | Residual-based score giving distribution-free intervals with target coverage. | EnbPI | https://arxiv.org/abs/2010.09107 |

---

## K. SOURCE INDEX (all primary URLs, grouped)

**A. Foundation TS:** https://github.com/google-research/timesfm · https://huggingface.co/google/timesfm-2.5-200m-pytorch · https://arxiv.org/abs/2310.10688 · https://github.com/amazon-science/chronos-forecasting · https://arxiv.org/abs/2403.07815 · https://arxiv.org/abs/2511.11698 · https://huggingface.co/Salesforce/moirai-2.0-R-small · https://arxiv.org/abs/2310.08278 · https://github.com/time-series-foundation-models/lag-llama · https://arxiv.org/abs/2505.14766 · https://github.com/DataDog/toto · https://github.com/PriorLabs/tabpfn-time-series
**B. World models:** https://arxiv.org/abs/2506.09985 · https://github.com/facebookresearch/vjepa2 · https://arxiv.org/abs/2301.04104 · https://github.com/danijar/dreamerv3 · https://arxiv.org/abs/2301.08243
**C. Temporal graph/KG:** https://arxiv.org/abs/2006.10637 · https://github.com/twitter-research/tgn · https://arxiv.org/abs/2002.07962 · https://arxiv.org/abs/2012.15537 · https://github.com/TemporalKGTeam/xERTE
**D. Clustering/motif:** https://hdbscan.readthedocs.io · https://github.com/TDAmeritrade/stumpy · https://www.cs.ucr.edu/~eamonn/STOMP_GPU_final_submission_camera_ready.pdf · https://github.com/tslearn-team/tslearn
**E. Change-point/anomaly:** https://arxiv.org/abs/1101.1438 · https://github.com/deepcharles/ruptures · https://arxiv.org/abs/0710.3742 · https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html
**F. Ensemble/uncertainty:** https://patents.google.com/patent/WO2014075108A2/en · https://arxiv.org/abs/2010.09107 · https://github.com/scikit-learn-contrib/MAPIE · https://arxiv.org/abs/2212.03281
**G. DA/NWP:** https://github.com/google-deepmind/graphcast · https://www.science.org/doi/10.1126/science.adi2336 · https://arxiv.org/abs/2312.15796 · https://www.nature.com/articles/s41586-024-08252-9 · https://www.ecmwf.int/en/about/media-centre/aifs-blog · https://doi.org/10.1029/94JC00572 · https://doi.org/10.1198/016214506000001437
**H. Orchestration:** https://arxiv.org/abs/2509.07571 · https://github.com/langchain-ai/langgraph
**I. Patents:** https://patents.google.com/patent/WO2014075108A2/en · https://patents.google.com/patent/US11575697B2/en · https://patents.google.com/patent/US20220124110A1/en · https://patents.google.com/patent/US9979675B2/en · https://patents.google.com/patent/US11494252B2/en · https://patents.google.com/patent/US11922280B2/en · https://patents.google.com/patent/US10977551B2/en
**L. Model deep dives:** https://research.google/blog/a-decoder-only-foundation-model-for-time-series-forecasting/ · https://arxiv.org/pdf/2310.10688 · https://www.marktechpost.com/2024/02/12/google-research-introduces-timesfm-a-single-forecasting-model-pre-trained-on-a-large-time-series-corpus-of-100b-real-world-time-points/ · https://arxiv.org/html/2403.07815v1 · https://huggingface.co/amazon/chronos-t5-large · https://huggingface.co/amazon/chronos-t5-small · https://huggingface.co/amazon/chronos-bolt-base · https://arxiv.org/html/2511.11698v1 · https://huggingface.co/Salesforce/moirai-2.0-R-small
**M/N. Selection & FTO:** https://huggingface.co/google/timesfm-2.5-200m-pytorch · https://github.com/SalesforceAIResearch/uni2ts · https://patents.google.com/patent/US10977551B2/en
**P. Benchmarks/leaderboards:** https://arxiv.org/abs/2410.10393 · https://huggingface.co/spaces/Salesforce/GIFT-Eval · https://www.salesforce.com/blog/gift-eval-time-series-benchmark/ · https://forecastingdata.org/ · https://arxiv.org/abs/2105.06643 · https://huggingface.co/datasets/Monash-University/monash_tsf · https://www.datadoghq.com/blog/ai/toto-boom-unleashed/ · https://confluence.ecmwf.int/display/FUG/Section+12+Verification
**R. Non-foundation deep dives:** https://arxiv.org/abs/2301.08243 · https://arxiv.org/abs/2301.04104 · https://arxiv.org/abs/2002.07962 · https://arxiv.org/abs/2012.15537 · https://doi.org/10.1109/TASSP.1978.1163055 · https://ieeexplore.ieee.org/document/4781136 · https://doi.org/10.1002/qj.49712555417
**P.1/P.2. Metrics & anchors:** https://www.nixtla.io/docs/forecasting/evaluation/evaluation_metrics · https://www.lokad.com/continuous-ranked-probability-score/ · https://deepmind.google/blog/gencast-predicts-weather-and-the-risks-of-extreme-conditions-with-sota-accuracy/
**U. Glossary refs:** https://arxiv.org/abs/2310.10688 · https://www.nature.com/articles/s41586-024-08328-6 · https://huggingface.co/amazon/chronos-bolt-base

---

*End of `03_EVIDENCE_BASE.md`. Sections: A–K (original evidence base) + L (foundation-model deep dives) + M (model-selection decision matrix) + N (expanded patent FTO ledger) + O (replicate-in-our-repo mapping) + P (benchmark/leaderboard references) + Q (risks-of-replication register) + R (non-foundation deep dives) + S (consolidated replicability scorecard) + T (worked end-to-end forecast flows) + U (glossary of architecture-internals terms). Cross-refs: `00_MASTER_INDEX.md` (§0 non-negotiables, §1.3 replicate-first, §2 architecture), `06_ALGORITHMS.md` (math/pseudocode per method), `11_VALIDATION_AND_TEST_PLAN.md` (benchmarks), `12_SECURITY_GOVERNANCE_LEGAL.md` (FTO/license compliance), `13_PHASED_BUILD_PLAN.md` (deploy phases), `14_RISKS_AND_LIMITS.md` (risk register). Verification date: June 2026 — re-verify patent legal status and gated-weight licenses before any commercial deployment.*
