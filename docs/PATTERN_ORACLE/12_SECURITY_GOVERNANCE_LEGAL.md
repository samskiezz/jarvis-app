# 12 — SECURITY, GOVERNANCE & LEGAL

**Document:** PATTERN ORACLE — Section 12 of the Master Engineering Spec
**Parent:** `00_MASTER_INDEX.md`
**Document class:** Master Engineering Spec · military-grade · ISO-execution depth
**Status:** living document (v1 → v150). This section is **normative**: it fixes the access-control model, data-governance regime, model-governance gates, legal/IP compliance posture, responsible-use rules, threat model, and the compliance checklist every release is audited against.
**Owner:** APEX / KGIK prediction program — security & governance working group (persona **P-E · The Auditor**, `01_MISSION_AND_SCOPE.md §1.2`).
**Normative language:** The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY** are to be interpreted as in RFC 2119 / RFC 8174.

> **⚠️ NOT LEGAL ADVICE.** §12.4 (Legal / IP Compliance) and the license/patent tables herein are an **engineering risk assessment by non-lawyers**, assembled to keep the build inside obvious safe harbours. They are informational only, do **not** constitute legal advice, create no attorney–client relationship, and may be wrong or out of date. Before any commercial launch, before relying on any patent or licence conclusion, and before redistributing any third-party weights or code, the program **MUST** obtain written sign-off from qualified IP counsel. When this document and counsel disagree, **counsel wins.**

---

## 12.0 PURPOSE & SCOPE OF THIS SECTION

PATTERN ORACLE ingests **real-world third-party data**, **replicates published techniques** (some patent-encumbered), and emits **predictions about the future** that users may act on. Those three facts create three classes of obligation this section governs:

1. **Confidentiality / integrity / availability (CIA)** of the engine, its data, and its keys — §12.1 (AuthZ), §12.6 (Threat model).
2. **Stewardship** of borrowed data and trained models — §12.2 (Data governance), §12.3 (Model governance).
3. **Lawful and responsible operation** — §12.4 (Legal/IP), §12.5 (Responsible-use & safety).

It binds upward to persona **P-E** and requirements **NFR-9 (auditability/provenance)**, **NFR-10 (honesty/grounding)**, **P-1/P-2 (grounded-not-invented)** in `01_MISSION_AND_SCOPE.md`, and downward to `05_DATA_MODEL_AND_SCHEMAS.md` (History Lake, provenance columns), `07_API_CONTRACTS.md` (endpoint surface), `08_SELF_IMPROVEMENT_AND_MLOPS.md` (model registry), and `11_VALIDATION_AND_TEST_PLAN.md` (the compliance tests in §12.7 are test hooks there).

**Requirement IDs introduced here:** `SEC-*` (security/authz), `GOV-*` (data + model governance), `LEG-*` (legal/IP), `RU-*` (responsible use), `THR-*` (threat-model mitigations). Each is traceable in the v101–v150 matrix.

---

## 12.1 AUTHENTICATION & ACCESS CONTROL

### 12.1.1 Principle: reuse the audited auth primitive — do NOT invent a second one

The repo already has **one** bearer-token scheme on each backend, and PATTERN ORACLE **MUST** reuse it rather than introduce a parallel auth stack (grounded-not-invented, P-1).

| Backend | File | Primitive | Behaviour |
|---|---|---|---|
| JARVIS (APEX serving side) | `server/auth.py` | `optional_bearer` / `require_bearer` | `optional_bearer`: public-read by default; validates a token **if supplied**; if `JARVIS_REQUIRE_AUTH=true` it hardens into `require_bearer`. `require_bearer`: always 401 without a valid token. |
| JARVIS config | `server/config.py` | `API_KEY` (`JARVIS_API_KEY`, default `dev-key`), `REQUIRE_AUTH` (`JARVIS_REQUIRE_AUTH`, default `false`) | Single shared bearer compared by constant string equality. |
| Underworld | `underworld/server/auth.py` | `require_bearer` | Strict bearer; token compared to `Settings.api_key` (`UNDERWORLD_API_KEY`, default `dev-key`). |

Existing wiring confirms the pattern: `server/routes/predict.py` already mounts `POST /functions/predict` behind `Depends(optional_bearer)` ("public read by default, strict when `JARVIS_REQUIRE_AUTH`"). **All new PATTERN ORACLE endpoints MUST follow this exact dependency pattern** — `optional_bearer` for read/query, `require_bearer` for state-changing/admin.

- **SEC-1 (MUST).** No new bearer/JWT/OAuth/session implementation is added without governance sign-off; the two existing primitives are the only auth surface.
- **SEC-2 (MUST).** Production deployments set `JARVIS_REQUIRE_AUTH=true` and a non-default `JARVIS_API_KEY`/`UNDERWORLD_API_KEY`. The `dev-key` default is **dev-only** and a release gate (§12.7) fails if it is present in a production config.
- **SEC-3 (SHOULD).** Token comparison SHOULD migrate to a constant-time compare (`hmac.compare_digest`) to remove the timing side-channel in the current `!=` check. (Low severity; tracked in §12.6 DoS/extraction row.)

### 12.1.2 Roles

PATTERN ORACLE defines **three logical roles**, layered on the single-token scheme without inventing an identity provider. Roles are realised by *which dependency guards an endpoint* plus a coarse capability tier on the token (a `role` claim added to the token registry in §12.3.3 metadata, or a separate admin key).

| Role | Who (persona) | Capability | Realised by |
|---|---|---|---|
| **reader** | P-A Asker, P-C Builder | Submit NL questions, GET forecasts, read provenance/skill dashboards | `optional_bearer` (public-read) |
| **operator** | P-B Analyst, P-D Steward | Trigger backtests, view drift, request re-weighting (non-destructive) | `require_bearer` + operator key |
| **admin** | P-D Steward (privileged), platform | Retrain/promote models, edit KGIK edges, rotate keys, purge data | `require_bearer` + admin key |

- **SEC-4 (MUST).** Any endpoint that **mutates model state, KGIK edges, or persisted data** (retrain, promote, edge-write, retention purge) MUST require the **admin** role via `require_bearer`, never `optional_bearer`.
- **SEC-5 (MUST).** Read/query endpoints MUST NOT expose admin actions through optional parameters (no "trigger retrain via a query flag on `/predict`").

### 12.1.3 Endpoint-level authorization matrix

Endpoints from `07_API_CONTRACTS.md`; guards are the `Depends(...)` each route mounts.

| Endpoint | Method | Min role | Auth dependency | Rate class (§12.5.4) | Notes |
|---|---|---|---|---|---|
| `/functions/predict` | POST | reader | `optional_bearer` | `predict` | Existing; NL/structured forecast. |
| `/predict/forecast` | POST | reader | `optional_bearer` | `predict` | Structured target+horizon. |
| `/predict/explain/{id}` | GET | reader | `optional_bearer` | `read` | Drivers/assumptions/caveats. |
| `/predict/provenance/{id}` | GET | reader | `optional_bearer` | `read` | Source/license/lineage of a forecast. |
| `/history-lake/series` | GET | reader | `optional_bearer` | `read` | Read persisted world-data. |
| `/skill/dashboard` | GET | operator | `require_bearer` | `read` | Skill/coverage/drift metrics. |
| `/backtest/run` | POST | operator | `require_bearer` | `compute` | Replays history; expensive. |
| `/models/registry` | GET | operator | `require_bearer` | `read` | Model cards + versions. |
| `/models/retrain` | POST | **admin** | `require_bearer` | `admin` | Launches a training job. |
| `/models/promote` | POST | **admin** | `require_bearer` | `admin` | Promotion gate (§12.3.2). |
| `/kgik/edges` | POST/PATCH/DELETE | **admin** | `require_bearer` | `admin` | Mutate learned graph edges. |
| `/data/retention/purge` | POST | **admin** | `require_bearer` | `admin` | Retention/rollup execution. |
| `/audit/predictions` | GET | operator | `require_bearer` | `read` | Read immutable prediction ledger (§12.3.3). |
| `/auth/keys/rotate` | POST | **admin** | `require_bearer` | `admin` | Key rotation. |

- **SEC-6 (MUST).** This matrix is the source of truth; `11_VALIDATION...` includes an authz contract test that asserts each route's mounted dependency matches the "Min role" column (no admin route on `optional_bearer`).

### 12.1.4 Secrets handling — environment ONLY, never committed

All credentials are injected via **environment variables / `.env` files that are git-ignored** and read through the config layers above (`os.environ` on JARVIS, pydantic `Settings` with `env_prefix` on Underworld). There are **no secrets in source, no secrets in this spec, no secrets in test fixtures.**

| Secret | Env var | Where read | Status / rule |
|---|---|---|---|
| Service bearer (JARVIS) | `JARVIS_API_KEY` | `server/config.py` | MUST be non-default in prod (SEC-2). |
| Service bearer (Underworld) | `UNDERWORLD_API_KEY` | `Settings.api_key` | MUST be non-default in prod. |
| **Kimi K2 LLM key** | `KIMI_API_KEY` | `server/config.py`, `Settings.kimi_api_key` | Currently `""` default; required for NL routing/`oracle.py`. Env only. **Never logged**, never echoed in error bodies. |
| Generic LLM key | `UNDERWORLD_LLM_API_KEY` | `Settings.llm_api_key` | Env only; optional free-Llama path. |
| Patent APIs | `..._API_KEY`, `EPO_*` | `Settings` | Env only. |
| **Tripo (3D gen) key** | `TRIPO_API_KEY` | (env only — not present in source today) | **LEG/SEC-critical: the Tripo key MUST NEVER be committed.** It does not appear in the repo and MUST stay that way; inject via env/secret-store exclusively. Tripo ToS may also restrict commercial use of generated assets — confirm before any productisation (LEG, §12.4). |

- **SEC-7 (MUST).** Secrets are read from environment only. Hard-coding a key in any tracked file is a build-breaking violation.
- **SEC-8 (MUST).** A pre-commit / CI **secret-scanning gate** (`gitleaks`/`detect-secrets`, plus GitHub secret scanning) runs on every push; a hit on `KIMI_API_KEY`, `TRIPO_API_KEY`, any `*_API_KEY`, or high-entropy strings **blocks the merge** (§12.7).
- **SEC-9 (MUST).** Secrets MUST NOT appear in logs, traces, exception messages, or LLM prompts/responses. Upstream API errors are sanitised before they reach a user-facing response.
- **SEC-10 (SHOULD).** Keys SHOULD be rotatable without redeploy (read at request time / hot-reload) and rotated on any suspected exposure via `/auth/keys/rotate`.
- **SEC-11 (MUST).** `.env`, `*.env`, `secrets.*` are git-ignored; CI asserts the ignore rules exist.

---

## 12.2 DATA GOVERNANCE

### 12.2.1 Provenance & lineage — every feed is sourced, licensed, ToS-bound

PATTERN ORACLE's honesty contract (M-2, "real world-model data… never fabricated") requires that **every value in the History Lake carries its origin**. The schema in `05_DATA_MODEL_AND_SCHEMAS.md` MUST persist, per series and per row-batch, the provenance tuple:

```
provenance = {
  source_id,          # e.g. "usgs.quake.2.5_day"
  source_url,         # canonical feed URL
  license,            # SPDX-ish tag or "ToS:<name>"
  license_url,
  fetched_at,         # UTC ingest timestamp
  fetch_hash,         # sha256 of raw payload (tamper-evidence)
  adapter_version,    # which feed adapter produced this
  attribution_text    # required attribution string (if any)
}
```

- **GOV-1 (MUST).** No row enters the History Lake without a complete `provenance` tuple. A `/predict/provenance/{id}` response reconstructs the full lineage from feed → transforms → forecast.
- **GOV-2 (MUST).** `fetch_hash` is computed at ingest; a poisoning/tamper detector (§12.6) compares re-fetches against it.

### 12.2.2 Data-source ToS & rate-limit register

Feeds grounded in the repo today: USGS, CoinGecko, `open.er-api.com` FX (`server/config.py`, `prediction.py`).

| Source | Feed | License / ToS | Commercial? | Rate limit | Attribution | Engine rule |
|---|---|---|---|---|---|---|
| **USGS earthquakes** | `earthquake.usgs.gov/.../2.5_day.geojson` | **U.S. Government work — public domain** (17 U.S.C. §105) | ✅ Yes | No hard cap; be polite (cache; poll ≤1/min) | Courtesy credit to USGS | Free to use/redistribute; cache per `LIVE_INTEL_TTL_SECONDS` (60 s). |
| **CoinGecko** | `api.coingecko.com/api/v3/...` | **CoinGecko ToS** — free/Demo tier is **non-commercial / attribution**; commercial needs a paid plan + API key | ⚠️ Conditional | Public/Demo: ~**5–30 calls/min** (tier-dependent); 429 on breach | "Data by CoinGecko" required | Honour TTL/backoff; for commercial APEX use, **MUST** move to a licensed paid key (LEG-flag). |
| **open.er-api.com** | `open.er-api.com/v6/latest/AUD` | Open ER-API ToS — **free, no key**, attribution requested; "fair use" volume | ⚠️ Conditional | "Fair use"; daily-updated rates → poll **≤1/day per base** | Attribution link requested | Daily rates only — do NOT poll faster; cache ≥24 h; verify ToS before commercial reliance. |
| **Kimi K2 (Moonshot)** | `api.moonshot.ai/v1` | Moonshot API ToS (paid LLM) | ✅ (per ToS) | Provider per-key rate/QPS limits | n/a (service) | Key via env (SEC); cap minion/LLM calls (`llm_max_minions_per_tick`). |
| **KGIK snapshots** | internal (`PopulationSnapshot`, `Event`, etc.) | Internal / APEX-owned | ✅ (owned) | n/a | n/a | Subject to PII policy §12.2.4. |

- **GOV-3 (MUST).** Every adapter encodes its source's **rate limit + backoff (429-aware exponential backoff + jitter)** and respects TTL; the ingestion loop MUST NOT exceed the documented call budget.
- **GOV-4 (MUST).** Required attribution strings are surfaced in `/predict/provenance` and any UI that renders the data.
- **GOV-5 (MUST — LEG-linked).** Before commercial launch, CoinGecko and open.er-api reliance is re-reviewed against current ToS (these change); non-commercial-only tiers MUST be replaced with licensed equivalents or dropped.

### 12.2.3 History Lake retention & rollup

The History Lake (`05_...`) is the persistent world-data + outcomes store (SQLite/Parquet). Unbounded growth and stale raw data are both governance risks.

| Tier | Resolution | Retention | Rollup action |
|---|---|---|---|
| **Hot — raw** | native (per fetch / per tick) | 90 days | kept verbatim for backtests |
| **Warm — rollup** | hourly/daily aggregates (OHLC, mean, min/max, count) | 2 years | downsample raw → aggregate; keep `fetch_hash` lineage of the source rows |
| **Cold — archive** | daily/weekly | indefinite (Parquet, compressed) | for long-horizon climatology baselines |
| **Outcomes ledger** | per-forecast realized value | **indefinite, immutable** (§12.3.3) | never rolled up — skill scoring & audit depend on it |

- **GOV-6 (MUST).** Retention/rollup runs only via the admin `/data/retention/purge` job; it MUST preserve provenance lineage and MUST NOT delete the immutable outcomes/prediction ledger.
- **GOV-7 (SHOULD).** Rollups preserve enough fidelity (quantiles, not just means) to keep conformal calibration honest.

### 12.2.4 PII policy — KGIK contains PII-marked entities

The KGIK graph includes **entities flagged as PII** (real persons/identifiable subjects). These are handled under a strict data-minimisation regime.

- **GOV-8 (MUST).** Entities/edges carry a `pii: bool` (and `pii_class`) flag in the KGIK schema; the ingest path sets it.
- **GOV-9 (MUST — masking).** PII-marked fields are **masked by default** in all responses (`reader`/`operator`): names/identifiers are tokenised/redacted (e.g. `entity#<hash>`); raw PII is returned only to **admin** with an explicit `include_pii=true` and is **audit-logged**.
- **GOV-10 (MUST NOT).** PII is **never** sent to the external LLM (Kimi) in prompts, never written to logs, never used as a public forecast driver label without masking.
- **GOV-11 (MUST).** PII-marked entities are **excluded from training data** for shared/promoted models unless explicitly approved; predictions MUST NOT re-identify masked subjects.
- **GOV-12 (SHOULD).** Support subject deletion: an admin purge can tombstone a PII entity and its edges while preserving aggregate skill stats (no PII retained).

### 12.2.5 Data-quality SLAs

Calibration is only as honest as the inputs. Each feed has measurable quality SLAs, monitored by the ingestion loop and surfaced on `/skill/dashboard`.

| SLA | Target | Action on breach |
|---|---|---|
| **Freshness** | hot data age ≤ 2× feed TTL (e.g. USGS ≤ 120 s; FX ≤ 48 h) | mark series `stale`; forecasts using it carry a `data_stale` caveat; degrade confidence |
| **Completeness** | ≥ 99% of expected points per window | gap-flag; interpolation marked in lineage; widen interval |
| **Validity** | values within physical/plausible bounds (range + Δ checks) | reject + quarantine row (poisoning guard §12.6); alert |
| **Provenance integrity** | 100% rows have full `provenance` + matching `fetch_hash` | block row (GOV-1) |
| **Schema conformance** | 100% adapter output validated (pydantic) | reject batch; page operator |

- **GOV-13 (MUST).** A forecast built on data that breaches a freshness/completeness SLA MUST emit the corresponding caveat (ties to RU-3 uncertainty disclosure) and MUST NOT silently present full confidence.

---

## 12.3 MODEL GOVERNANCE

### 12.3.1 Model cards

Every model that can influence a forecast (foundation TS model, classical forecasters, ensemble weighter, conformal layer, TGN edge-predictor) **MUST** have a **model card** in the registry (`08_SELF_IMPROVEMENT_AND_MLOPS.md`), updated on every promotion.

Required fields: `model_id`, `version`, `family/source` (+ §12.4 licence row), `intended use & out-of-scope use`, `training data + provenance + PII status`, `eval metrics` (CRPS/RMSE/coverage vs climatology), `calibration` (ECE/coverage), `known limitations & failure modes` (link `14_RISKS...`), `seeds & pinned versions`, `owner`, `approval record`.

- **GOV-14 (MUST).** No model serves traffic without a complete, current model card.

### 12.3.2 Versioning, approval & promotion gates

- **GOV-15 (MUST).** Models are **immutably versioned** (`model_id@semver+gitsha`); a served forecast records the exact version(s) used.
- **GOV-16 (MUST).** Promotion **dev → staging → prod** passes ordered gates, each a hard stop:
  1. **Reproducibility gate** — re-train/re-run with pinned seeds+versions reproduces metrics within tolerance.
  2. **Skill gate** — beats the incumbent and the climatology baseline on held-out backtest (CRPS/coverage; `11_...`).
  3. **Calibration gate** — coverage within target band; ECE ≤ threshold; no over-confidence.
  4. **Safety/compliance gate** — licence/patent row green (§12.4), no PII leakage, model card complete.
  5. **Human approval** — an **admin** signs off via `/models/promote`; the approval is recorded in the audit ledger.
- **GOV-17 (MUST).** Promotion is **reversible**: every prod model has a one-call rollback to the prior version; rollback is audit-logged.
- **GOV-18 (MUST NOT).** Auto-retrain (drift-triggered, §08) MUST NOT auto-promote to prod; it produces a candidate that re-enters the gates.

### 12.3.3 Immutable audit log of predictions (hash-chained ledger)

Every forecast and every governance action is recorded in an **append-only, tamper-evident ledger**, mirroring the **KGIKLedger hash-chain** pattern already in the repo (`src/pages/KGIKLedger.jsx`: "immutable-style chain: genesis → entries → appends", each entry stores its `hash` and the previous entry's `prev`).

```
ledger_entry = {
  seq,                       # monotonic
  ts,                        # UTC
  type,                      # PREDICTION | OUTCOME | PROMOTE | ROLLBACK | RETRAIN | KGIK_EDGE | PII_ACCESS | KEY_ROTATE
  payload,                   # forecast {value, interval, prob, method, model_versions, drivers, assumptions, caveats, provenance_ids}
  prev_hash,                 # hash of entry seq-1
  hash = sha256(prev_hash || canonical_json(seq,ts,type,payload))
}
```

- **GOV-19 (MUST).** Every served prediction is written to the ledger **before** it is returned, with the exact model versions, inputs' provenance ids, and the emitted interval/probability — so realized-vs-predicted skill scoring (M-6) and audits are reproducible.
- **GOV-20 (MUST).** The ledger is **append-only** and **hash-chained**; any edit/deletion is detectable by re-walking the chain. A verifier job re-validates the chain periodically.
- **GOV-21 (MUST).** Privileged actions (promote, rollback, retrain, KGIK edge writes, PII access, key rotation) are ledger entries — full accountability for **P-E**.
- **GOV-22 (SHOULD).** Use a stronger digest than the UI's FNV-1a demo hash for the production ledger — **SHA-256** as specified above (the JSX FNV is a display stand-in only).

### 12.3.4 Reproducibility

- **GOV-23 (MUST).** All stochastic components (GBM Monte-Carlo in `prediction.py`, bootstrap/conformal resampling, training) take an explicit **seed** recorded in the model card and the ledger entry; given the same data+seed+pinned versions, a forecast is reproducible.
- **GOV-24 (MUST).** Dependency versions are **pinned** (lockfile); the registry records the resolved environment hash per model version.

---

## 12.4 LEGAL / IP COMPLIANCE

> Re-read the **NOT LEGAL ADVICE** disclaimer at the top. The conclusions below are engineering risk calls pending counsel sign-off.

### 12.4.1 Posture

PATTERN ORACLE **replicates the behaviour** of advanced systems using **permissively-licensed components and public-domain algorithms**, and **avoids** (a) non-commercial-only weights and (b) the exact claimed combinations of active patents. Two safe-harbour principles:

- **LEG-1 (MUST).** Prefer **Apache-2.0 / MIT / BSD** code & weights for anything that ships commercially. **CC-BY-NC** weights MUST NOT be used commercially — either **train our own** weights on permissible data or **avoid** the component.
- **LEG-2 (MUST).** Where a technique is patent-encumbered, implement the **public/underlying component algorithms** and **do not reproduce the exact claimed combination** of an active patent. Expired patents are freely implementable.

### 12.4.2 License compliance table (techniques in the evidence base §03)

| Technique / asset | Project | Licence | Commercial use | Engine decision |
|---|---|---|---|---|
| **TimesFM** (foundation TS) | Google | **Apache-2.0** | ✅ | Use code+weights. Honour NOTICE/attribution. |
| **Chronos / Chronos-Bolt** | Amazon | **Apache-2.0** | ✅ | Use. |
| **Lag-Llama** | open | **Apache-2.0** | ✅ | Use. |
| **TGN / TGAT** temporal graph | (impl-dependent) | **Apache-2.0** (ref impls) | ✅ | Use permissive impl; verify the specific repo's LICENSE. |
| **STUMPY** (Matrix Profile) | TD Ameritrade | **BSD-3** | ✅ | Use. |
| **HDBSCAN** | scikit-contrib | **BSD-3** | ✅ | Use. |
| **scikit-learn / NumPy / SciPy / CuPy** | — | **BSD-3 / BSD** | ✅ | Already in repo. |
| **EnbPI / conformal** | papers + impls | algorithm (paper) + impl licence | ✅ | Implement from paper; if using a lib, check its LICENSE. |
| **PELT / BOCPD** change-point | `ruptures` etc. | **BSD/MIT** (impl-dependent) | ✅ | Use permissive impl or implement from paper. |
| **GraphCast — WEIGHTS** | Google DeepMind | **CC-BY-NC-4.0** (weights) | ❌ **non-commercial** | **DO NOT ship the weights commercially.** Either avoid, or train an EnKF/own model on permissible data. (Some *code* is Apache-2.0 — code ≠ weights.) |
| **GenCast — WEIGHTS** | Google DeepMind | **CC-BY-NC-4.0** (weights) | ❌ **non-commercial** | Same as GraphCast — avoid weights commercially; replicate behaviour via permissible ensemble/EnKF. |
| **Kimi K2 (Moonshot)** | Moonshot | Commercial API ToS | ✅ per ToS | Use via paid API + env key. |
| **Tripo** (3D gen, if used) | Tripo | Tripo ToS (verify) | ⚠️ verify | Confirm generated-asset commercial rights **before** productising; key never committed (SEC). |

- **LEG-3 (MUST).** Apache-2.0/BSD/MIT obligations (retain LICENSE, NOTICE, attribution, no trademark misuse) are satisfied in the distribution (a `THIRD_PARTY_LICENSES` manifest).
- **LEG-4 (MUST NOT).** GraphCast/GenCast **weights** (CC-BY-NC) are not bundled, served, or relied on in any commercial path. Distinguish **code licence** from **weights licence** — they differ here.

### 12.4.3 Patent compliance table

| Patent | Subject | Status | Engine decision |
|---|---|---|---|
| **WO2014075108A2** | **Error-weighted ensemble** forecasting | **EXPIRED** | ✅ Implementable — this is the spec's Error-Weighted Ensemble (§06, evidence §03). Freely usable. |
| **US11575697B2** (and similar **ACTIVE** ML/forecasting patents) | specific *claimed combinations* (e.g. particular pipeline of detection+ensemble+adaptation) | **ACTIVE** | ⚠️ **Avoid the exact claimed combination.** Use the underlying **public component algorithms** (foundation TS, conformal, matrix profile, change-point) assembled in our own architecture; do not reproduce the patent's specific claim limitations end-to-end. |
| Other active forecasting/anomaly patents (TBD by counsel FTO search) | various | **ACTIVE (assumed)** | ⚠️ Treat as US11575697B2: components yes, claimed combinations no. |

- **LEG-5 (MUST).** Before commercial launch, counsel performs a **Freedom-To-Operate (FTO)** search; this table is updated from it. Until then, the conservative rule (LEG-2) governs.
- **LEG-6 (MUST).** When in doubt about a patent claim, the architecture choice that **avoids the claimed combination** is taken, even at some capability cost — honesty/compliance over capability.
- **LEG-7 (SHOULD).** Record, per replicated technique, the **public source** (paper/expired patent/permissive repo) that grounds it — feeding the §03 evidence base and the P-1 grounded-not-invented audit.

---

## 12.5 RESPONSIBLE-USE & SAFETY

### 12.5.1 Prediction disclaimers

PATTERN ORACLE forecasts the future from noisy data; outputs are **estimates, not guarantees**.

- **RU-1 (MUST).** Every forecast response includes a disclaimer: **"This is a probabilistic estimate, not financial, medical, legal, or safety advice. Do not rely on it for decisions with serious consequences."** It is part of the structured response (machine + human readable), not buried in fine print.
- **RU-2 (MUST).** Forecasts in sensitive domains (markets/crypto, health, hazard/safety) carry a **domain-specific** intensified disclaimer and MUST NOT phrase outputs as instructions ("buy", "evacuate") — only as estimates with uncertainty.

### 12.5.2 Mandatory uncertainty disclosure (NFR-3, M-5)

- **RU-3 (MUST).** **No bare point estimate** is ever returned. Every numeric answer carries a **calibrated interval and/or probability**, the **method**, **key assumptions**, and **caveats** (the verifier output shape in `00_MASTER_INDEX §2`). Suppressing uncertainty is a contract violation.
- **RU-4 (MUST).** When skill is near climatology / data is thin / SLA breached (§12.2.5), the engine **says so** and may **refuse to give a precise number** (refusal over fabrication, P-2).

### 12.5.3 Prohibited uses

- **RU-5 (MUST NOT).** PATTERN ORACLE MUST NOT be used for: individualized **medical/clinical decisions**; **financial advice presented as guaranteed** returns or market manipulation; **safety-critical** automated control (no human in the loop); **surveillance / re-identification** of PII-masked persons (§12.2.4); generating content for **prohibited CPC domains** already blocked in Underworld config (`blocked_cpc_prefixes`: weapons, chem/bio warfare, nuclear, etc.); any unlawful purpose.
- **RU-6 (MUST).** The orchestrator/verifier (§09) refuses or down-scopes requests that fall in prohibited categories and logs the refusal.

### 12.5.4 Abuse & rate-limit protection

| Rate class | Applies to | Limit (per key/IP) | On breach |
|---|---|---|---|
| `read` | GETs | high | 429 + `Retry-After` |
| `predict` | forecast POSTs | moderate (LLM/compute cost) | 429; queue/shed |
| `compute` | backtests | low | 429; admin override |
| `admin` | retrain/promote/purge | very low | 429; alert |

- **RU-7 (MUST).** Per-key + per-IP **rate limiting** and **request-size limits** guard every endpoint (also a DoS + model-extraction mitigation, §12.6). Anonymous (`optional_bearer`, no token) traffic gets the tightest limits.
- **RU-8 (SHOULD).** Anomalous query patterns (high-volume systematic probing → extraction) trigger throttling + an audit-ledger flag.

### 12.5.5 How the verifier enforces honesty

The **verifier** stage (`09_ORCHESTRATION...`, the final box in the §2 dataflow) is the honesty enforcement point and an explicit gate, not a formatter:

- **RU-9 (MUST).** The verifier **rejects** any candidate answer that: lacks an interval/probability (RU-3); lacks method/assumptions/caveats; asserts a capability/number not traceable to History-Lake data + a cited method (P-1/P-2, NFR-10); omits the §12.5.1 disclaimer; or restates masked PII (§12.2.4).
- **RU-10 (MUST).** The verifier cross-checks the claimed confidence against **measured calibration** (coverage/ECE from §08); over-confident outputs are widened or down-graded before release.
- **RU-11 (MUST).** Verifier rejections are logged to the ledger, closing the loop with skill scoring (a rejected/over-confident pattern feeds back into model governance).

---

## 12.6 THREAT MODEL

Scope: STRIDE-style, focused on the four threats called out for a public, data-ingesting, NL-driven prediction engine. Assets: History Lake integrity, model weights/registry, secrets, the prediction ledger, availability.

| # | Threat | Vector | Impact | Mitigations (req IDs) |
|---|---|---|---|---|
| **THR-1** | **Data poisoning of feeds** | Compromised/spoofed upstream feed, MITM, or adversary gaming a public source to skew inputs | Corrupted forecasts; mis-calibration; bad learned KGIK edges | TLS-only fetch; `fetch_hash` tamper-evidence (GOV-2); validity/range/Δ quarantine (GOV-13, §12.2.5); multi-source corroboration where available; outlier/poisoning detector before ingest; robust estimators in the ensemble; **THR-1**. |
| **THR-2** | **Prompt injection via NL question** | Malicious text in the user's question trying to override the orchestrator, exfiltrate secrets/PII, or make the engine emit unfounded claims | Secret/PII leak; bypassed disclaimers; fabricated answers | Treat user text as **data, not instructions**; system-prompt isolation + allow-listed tool calls; **never** put secrets/PII in prompts (SEC-9, GOV-10); output passes the **verifier** (RU-9..11) which strips unfounded/uncited content; input length/shape limits; **THR-2**. |
| **THR-3** | **Model extraction / inversion** | High-volume systematic querying to clone the model or recover training data | IP loss; potential PII inference | Rate limiting + anomaly throttle (RU-7/8); auth required for bulk/operator surfaces (SEC-4); no raw training data in responses; PII excluded from shared models (GOV-11); audit-ledger flags (RU-8); **THR-3**. |
| **THR-4** | **Denial of Service** | Flood of expensive predict/backtest calls; oversized payloads; slow-loris | Availability loss; LLM/compute cost blowup | Per-class rate limits + request-size caps (RU-7); compute budget caps (LLM per-tick cap already in config; backtest = `compute` class); timeouts; queue/shed-load; constant-time token compare (SEC-3) to remove timing oracle; **THR-4**. |
| THR-5 (supporting) | Secret leakage | Key in source/logs | Full compromise | SEC-7..11 (env-only, secret scanning, no-log, rotation). |
| THR-6 (supporting) | Ledger tampering | Edit predictions to hide bad skill | Loss of auditability | Hash-chain + periodic re-walk (GOV-20). |

- **THR-7 (MUST).** All upstream and downstream traffic uses **TLS**; no plaintext feed fetches.
- **THR-8 (MUST).** A standing assumption: **public feeds are untrusted inputs** — they are validated, hashed, and corroborated, never blindly persisted.

---

## 12.7 COMPLIANCE CHECKLIST (release gate)

Each item maps to requirement IDs and is a test hook in `11_VALIDATION_AND_TEST_PLAN.md`. A release **MUST** pass all **MUST** items.

| ✔ | Item | Req | Type | Gate |
|---|---|---|---|---|
| ☐ | New endpoints reuse `optional_bearer`/`require_bearer` only | SEC-1 | MUST | authz contract test |
| ☐ | `JARVIS_REQUIRE_AUTH=true` and non-default keys in prod | SEC-2 | MUST | config scan |
| ☐ | Authz matrix (§12.1.3) matches mounted dependencies | SEC-6 | MUST | route test |
| ☐ | Constant-time token compare | SEC-3 | SHOULD | code review |
| ☐ | Secrets env-only; none in tracked files | SEC-7 | MUST | secret scan (CI) |
| ☐ | `KIMI_API_KEY` / `TRIPO_API_KEY` / `*_API_KEY` not committed | SEC-8 | MUST | gitleaks gate |
| ☐ | Secrets never in logs/errors/prompts | SEC-9, GOV-10 | MUST | log audit |
| ☐ | Every History-Lake row has full provenance + hash | GOV-1/2 | MUST | ingest test |
| ☐ | Feed ToS/rate limits honoured (backoff, TTL, attribution) | GOV-3/4 | MUST | adapter test |
| ☐ | CoinGecko/open.er-api commercial ToS re-reviewed | GOV-5, LEG-5 | MUST | counsel review |
| ☐ | Retention/rollup preserves lineage + immutable ledger | GOV-6 | MUST | retention test |
| ☐ | PII masked by default; excluded from prompts & shared training | GOV-9/10/11 | MUST | PII test |
| ☐ | Data-quality SLA breaches emit caveats/degrade confidence | GOV-13, RU-3 | MUST | SLA test |
| ☐ | Every serving model has a complete model card | GOV-14 | MUST | registry test |
| ☐ | Promotion passes all 5 gates incl. human admin sign-off | GOV-16 | MUST | promotion test |
| ☐ | Auto-retrain never auto-promotes to prod | GOV-18 | MUST | MLOps test |
| ☐ | Predictions written to hash-chained immutable ledger | GOV-19/20 | MUST | ledger test |
| ☐ | Forecasts reproducible (seeds + pinned versions) | GOV-23/24 | MUST | repro test |
| ☐ | Only Apache/BSD/MIT in commercial path | LEG-1 | MUST | license scan |
| ☐ | GraphCast/GenCast NC weights not in commercial path | LEG-4 | MUST | dependency audit |
| ☐ | Patents: components yes, active claimed-combos no; FTO done | LEG-2/5 | MUST | counsel FTO |
| ☐ | THIRD_PARTY_LICENSES manifest complete | LEG-3 | MUST | license test |
| ☐ | Every forecast carries disclaimer + interval/prob + caveats | RU-1/3 | MUST | verifier test |
| ☐ | Prohibited uses refused & logged | RU-5/6 | MUST | guardrail test |
| ☐ | Rate limits + size limits on all endpoints | RU-7 | MUST | rate-limit test |
| ☐ | Verifier rejects uncited/over-confident/PII-leaking answers | RU-9/10/11 | MUST | verifier test |
| ☐ | Feeds fetched over TLS, treated as untrusted, validated/hashed | THR-7/8, THR-1 | MUST | ingest security test |
| ☐ | Prompt-injection: user text is data; output verifier-gated | THR-2 | MUST | injection test |
| ☐ | Extraction/DoS throttling + anomaly flags | THR-3/4 | MUST | abuse test |
| ☐ | Counsel sign-off recorded before commercial launch | disclaimer, LEG-5 | MUST | legal sign-off |

---

## 12.8 TRACEABILITY (this section → spec)

| This section | Binds to |
|---|---|
| §12.1 AuthZ | `server/auth.py`, `underworld/server/auth.py`, `server/config.py`, `07_API_CONTRACTS.md`; NFR-1/7 |
| §12.2 Data governance | `05_DATA_MODEL_AND_SCHEMAS.md`, `server/config.py` feeds; M-2, NFR-9 |
| §12.3 Model governance | `08_SELF_IMPROVEMENT_AND_MLOPS.md`, `src/pages/KGIKLedger.jsx`; M-6, NFR-9 |
| §12.4 Legal/IP | `03_EVIDENCE_BASE.md`; P-1, NFR-10 |
| §12.5 Responsible use | `09_ORCHESTRATION_NL_ROUTING.md` (verifier); M-5/M-7, NFR-3/10 |
| §12.6 Threat model | §05, §09, §10; NFR security |
| §12.7 Checklist | `11_VALIDATION_AND_TEST_PLAN.md` (all hooks) |

> **Pending counsel:** §12.4 (FTO/license sign-off), GOV-5 (CoinGecko/open.er-api commercial ToS), Tripo asset rights. Until signed, the conservative rules (LEG-1/2, refusal over fabrication) govern. **This document is not legal advice.**
