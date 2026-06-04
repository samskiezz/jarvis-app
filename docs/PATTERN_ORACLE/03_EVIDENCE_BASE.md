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

## K. SOURCE INDEX (all primary URLs, grouped)

**A. Foundation TS:** https://github.com/google-research/timesfm · https://huggingface.co/google/timesfm-2.5-200m-pytorch · https://arxiv.org/abs/2310.10688 · https://github.com/amazon-science/chronos-forecasting · https://arxiv.org/abs/2403.07815 · https://arxiv.org/abs/2511.11698 · https://huggingface.co/Salesforce/moirai-2.0-R-small · https://arxiv.org/abs/2310.08278 · https://github.com/time-series-foundation-models/lag-llama · https://arxiv.org/abs/2505.14766 · https://github.com/DataDog/toto · https://github.com/PriorLabs/tabpfn-time-series
**B. World models:** https://arxiv.org/abs/2506.09985 · https://github.com/facebookresearch/vjepa2 · https://arxiv.org/abs/2301.04104 · https://github.com/danijar/dreamerv3 · https://arxiv.org/abs/2301.08243
**C. Temporal graph/KG:** https://arxiv.org/abs/2006.10637 · https://github.com/twitter-research/tgn · https://arxiv.org/abs/2002.07962 · https://arxiv.org/abs/2012.15537 · https://github.com/TemporalKGTeam/xERTE
**D. Clustering/motif:** https://hdbscan.readthedocs.io · https://github.com/TDAmeritrade/stumpy · https://www.cs.ucr.edu/~eamonn/STOMP_GPU_final_submission_camera_ready.pdf · https://github.com/tslearn-team/tslearn
**E. Change-point/anomaly:** https://arxiv.org/abs/1101.1438 · https://github.com/deepcharles/ruptures · https://arxiv.org/abs/0710.3742 · https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html
**F. Ensemble/uncertainty:** https://patents.google.com/patent/WO2014075108A2/en · https://arxiv.org/abs/2010.09107 · https://github.com/scikit-learn-contrib/MAPIE · https://arxiv.org/abs/2212.03281
**G. DA/NWP:** https://github.com/google-deepmind/graphcast · https://www.science.org/doi/10.1126/science.adi2336 · https://arxiv.org/abs/2312.15796 · https://www.nature.com/articles/s41586-024-08252-9 · https://www.ecmwf.int/en/about/media-centre/aifs-blog · https://doi.org/10.1029/94JC00572 · https://doi.org/10.1198/016214506000001437
**H. Orchestration:** https://arxiv.org/abs/2509.07571 · https://github.com/langchain-ai/langgraph
**I. Patents:** https://patents.google.com/patent/WO2014075108A2/en · https://patents.google.com/patent/US11575697B2/en · https://patents.google.com/patent/US20220124110A1/en · https://patents.google.com/patent/US9979675B2/en · https://patents.google.com/patent/US11494252B2/en · https://patents.google.com/patent/US11922280B2/en

---

*End of `03_EVIDENCE_BASE.md`. Cross-refs: `00_MASTER_INDEX.md` (§0 non-negotiables, §1.3 replicate-first, §2 architecture), `06_ALGORITHMS.md` (math/pseudocode per method), `12_SECURITY_GOVERNANCE_LEGAL.md` (FTO/license compliance). Verification date: June 2026 — re-verify patent legal status and gated-weight licenses before any commercial deployment.*
