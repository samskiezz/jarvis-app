# 09 — ORCHESTRATION & NL ROUTING
**Codename:** PATTERN ORACLE · **Section:** 09 of 14 · **Document class:** Master Engineering Spec — ISO-execution depth
**Owner:** APEX / KGIK prediction program.
**Scope of this file:** the natural-language → prediction orchestration layer (the "ask anything" front door): the router/manager agent, the structured intent schema, the Kimi extraction prompt **and** its key-free deterministic fallback, the routing table, the verifier/synthesis agent, failure handling, and guardrails.

> **Grounding note.** This section is built directly on what exists today: `server/services/prediction.py` (`classify()`, `_kimi_extract()`, `_parse_horizon_hours()`, `_find_ticker()`, `predict()`, the `_predict_*` domain handlers, `_insufficient()`), `server/llm/kimi.py` (the streaming Kimi K2 wrapper), and `server/config.py` (`KIMI_API_KEY`, `KIMI_BASE_URL`, `KIMI_MODEL = kimi-k2-0905-preview`, Moonshot OpenAI-compatible base `https://api.moonshot.ai/v1`). Everything below is an extension of those symbols, not a replacement. The current engine already implements the *spine* of this design (LLM-best-effort → regex fallback → deterministic forecaster → honest schema with assumptions/caveats); this section specifies how that spine is hardened to a router→specialist→verifier graph and widened to the relational/KG and pattern-scan pipelines named in `00_MASTER_INDEX.md §2`.

---

## 9.0 DESIGN AXIOM — "THIN AI AT THE EDGES, DETERMINISTIC CORE"

The orchestration layer follows the **edge-thin / core-deterministic** pattern: the LLM is used *only* at the two boundaries — (a) parsing fuzzy natural language into a strict, machine-checkable **intent plan**, and (b) rendering a deterministic result into fluent prose. **No numbers are ever produced by the LLM.** Every quantity (point estimate, interval, probability, driver) is computed by the deterministic forecasters in `prediction.py` and the algorithms of `06_ALGORITHMS.md`. The LLM cannot hallucinate a price, a probability, or a coordinate, because it never touches the math path.

This mirrors the **LangGraph orchestrator-worker pattern** (a stateful graph where a central orchestrator node dispatches to specialist worker nodes and a synthesis node merges results) and the agentic-pipeline framing of **arXiv:2509.07571** ("thin LLM router → deterministic tool execution → verifier"), cited in `03_EVIDENCE_BASE.md`. We replicate the *behaviour* (structured planning, tool dispatch, self-checking synthesis) with our own deterministic core, not the model weights.

Three invariants hold at all times:

1. **Determinism of the answer.** Given the same intent plan and the same data snapshot, the numeric answer is bit-reproducible (forecasters seed their RNG — see `gbm_montecarlo_forecast(..., seed=42)`).
2. **Key-optionality.** The entire pipeline runs with `KIMI_API_KEY == ""`. The LLM nodes degrade to the deterministic fallback parser (intent) and a template renderer (synthesis). This is already true of `classify()` today and is a non-negotiable.
3. **Honesty.** Every emitted answer carries `interval` and/or `probability` + `assumptions` + `caveats`; the verifier *refuses to emit fake precision* and downgrades confidence when data is thin.

---

## 9.1 ARCHITECTURE — ROUTER → SPECIALIST PIPELINES → DETERMINISTIC EXECUTION → VERIFIER/SYNTHESIS

### 9.1.1 The five-stage graph

```
                         NL question + optional params
                                      │
                                      ▼
        ┌─────────────────────────────────────────────────────────┐
        │ STAGE 1 — ROUTER / MANAGER AGENT  (thin LLM, key-optional)│
        │   intent_extract():                                        │
        │     try Kimi K2  →  IntentPlan (JSON, schema-validated)    │
        │     on null/invalid → deterministic fallback_parse()       │
        │   entity_resolve(): tickers→ids, place→lat/lng, KGIK lookup│
        │   output: validated IntentPlan  (+ resolution provenance)  │
        └─────────────────────────────────────────────────────────┘
                                      │  IntentPlan
              ┌───────────────┬───────┼────────────┬──────────────┐
              ▼               ▼       ▼            ▼              ▼
        ┌──────────┐  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ FORECAST │  │RELATIONAL│ │ PATTERN  │ │  EVENT   │ │ EXPLAIN  │
        │ pipeline │  │ /KG line │ │  -SCAN   │ │  -PROB   │ │ pipeline │
        │ (TS GBM/ │  │ (KGIK    │ │ (Matrix  │ │ (G-R/    │ │ (driver  │
        │ Holt/    │  │ TGN link │ │ Profile/ │ │ Omori/   │ │ attrib + │
        │ growth/  │  │ -pred,   │ │ HDBSCAN/ │ │ Poisson) │ │ counter- │
        │ traj)    │  │ interact)│ │ PELT)    │ │          │ │ factual) │
        └──────────┘  └──────────┘ └──────────┘ └──────────┘ └──────────┘
              │  STAGE 2 — SPECIALIST PIPELINE selects model + data source
              └───────────────┴───────┬────────────┴──────────────┘
                                      ▼
        ┌─────────────────────────────────────────────────────────┐
        │ STAGE 3 — DETERMINISTIC EXECUTION  (no LLM)               │
        │   load data (History Lake / params / live feed)           │
        │   run forecaster(s) → raw result dict                     │
        │   (gbm_montecarlo_forecast, gutenberg_richter_poisson,    │
        │    omori_aftershock_probability, great_circle_forward,    │
        │    fit_growth_series, + §06 EnbPI/Matrix-Profile/TGN)     │
        └─────────────────────────────────────────────────────────┘
                                      │  raw_result
                                      ▼
        ┌─────────────────────────────────────────────────────────┐
        │ STAGE 4 — VERIFIER AGENT  (deterministic checks)          │
        │   units · sign · physical bounds · interval ordering ·    │
        │   probability∈[0,1] · assumptions present · confidence    │
        │   downgrade on thin data · honesty enforcement            │
        │   → pass | repair | refuse(fake-precision)                │
        └─────────────────────────────────────────────────────────┘
                                      │  verified_result
                                      ▼
        ┌─────────────────────────────────────────────────────────┐
        │ STAGE 5 — SYNTHESIS AGENT  (thin LLM, key-optional)       │
        │   render verified_result → fluent answer + the structured │
        │   JSON (always). Key-free → deterministic template render. │
        └─────────────────────────────────────────────────────────┘
                                      │
                                      ▼
            answer { prose, prediction, method, drivers,
                     assumptions, caveats, verifier, provenance }
```

### 9.1.2 Mapping to existing code

| Stage | New responsibility | Existing anchor in `prediction.py` | Action |
|---|---|---|---|
| 1 Router | NL → `IntentPlan` | `classify()` + `_kimi_extract()` | **Extend** `classify()` to emit the full `IntentPlan` schema (§9.2) and add `entity_resolve()`. |
| 1 Fallback | key-free parse | `_parse_horizon_hours()`, `_find_ticker()`, regex/keyword block | **Extend** with the §9.3 fallback table (place names, KG verbs, output-type cues). |
| 2 Specialist | choose model+source | the `if domain == ...` branches in `predict()` | **Add** `relational`, `pattern`, `explain` branches alongside the existing 5. |
| 3 Execution | run math | the `_predict_*` handlers + forecasters | **Reuse**; new pipelines call §06 algorithms. |
| 4 Verifier | sanity/honesty | inline `min/max` clamps, `_insufficient()` | **Promote** to a single `verify(result)` gate (§9.5). |
| 5 Synthesis | prose | none (frontend renders JSON) | **Add** `synthesize(result)`; key-free template + optional Kimi via `kimi.stream_chat`. |

### 9.1.3 Module layout (target)

```
server/services/prediction.py        # forecasters + _predict_* handlers (exists, extended)
server/services/orchestrator.py      # NEW: intent_extract, entity_resolve, route, verify, synthesize
server/services/entity_resolve.py    # NEW: tickers→ids, place→lat/lng, KGIK lookup
server/llm/kimi.py                   # exists: stream_chat; + add intent_extract_kimi() (non-stream JSON)
server/prompts/intent_router.md      # NEW: §9.3 system prompt + few-shot
docs/PATTERN_ORACLE/09_*.md          # this file
```

The orchestrator graph is a plain Python state machine (no external graph runtime required); it is *shaped* like a LangGraph orchestrator-worker graph so it can be ported to LangGraph later without rework. State is a single dict (`OrchestrationState`) threaded through the five stages, append-only, so every stage's output is auditable.

---

## 9.2 INTENT SCHEMA — THE STRUCTURED PLAN THE ROUTER EXTRACTS

The router converts the question into an **IntentPlan**: a strict, validated object that fully determines which pipeline runs, on what data, to produce what output. It supersedes the current 5-key dict (`domain/target/horizon_hours/params/used_llm`) while remaining backward-compatible (the old keys are derivable from it).

### 9.2.1 Field semantics

| Field | Type | Meaning | Source if missing |
|---|---|---|---|
| `domain` | enum (see 9.2.3) | top-level subject area → selects pipeline | regex/keyword fallback |
| `target_entity` | object | the thing being predicted; resolved id + label + type | entity_resolve |
| `metric` | string \| null | quantity of interest (`price`, `magnitude`, `position`, `count`, `interaction`, `regime`) | domain default |
| `horizon` | object | `{value, unit, hours}` forecast horizon | `_parse_horizon_hours` |
| `params` | object | structured numerical inputs (series, state vector, lat/lng, magnitude, …) | passthrough |
| `requested_output` | enum | `point` \| `interval` \| `probability` \| `pattern` \| `explanation` | inferred from verb |
| `confidence_level` | number ∈(0,1) | requested coverage (default 0.90) | 0.90 |
| `constraints` | object | optional `{region, time_window, threshold, comparators}` | parsed |
| `provenance` | object | `{used_llm, resolver_hits[], fallbacks[]}` audit trail | filled by router |

### 9.2.2 The JSON Schema (Draft 2020-12)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "pattern-oracle/intent-plan-v1",
  "title": "IntentPlan",
  "type": "object",
  "additionalProperties": false,
  "required": ["domain", "requested_output", "confidence_level", "params"],
  "properties": {
    "domain": {
      "type": "string",
      "enum": ["crypto", "markets", "seismic", "weather", "trajectory",
               "growth", "relational", "pattern", "explain", "generic"]
    },
    "target_entity": {
      "type": ["object", "null"],
      "additionalProperties": false,
      "properties": {
        "raw": { "type": ["string", "null"], "description": "verbatim span from the question" },
        "id": { "type": ["string", "null"], "description": "resolved canonical id (e.g. 'ripple', 'kgik:club/PSG')" },
        "label": { "type": ["string", "null"] },
        "type": {
          "type": ["string", "null"],
          "enum": ["asset", "place", "flight", "kg_entity", "series", "event_type", null]
        },
        "lat": { "type": ["number", "null"], "minimum": -90, "maximum": 90 },
        "lng": { "type": ["number", "null"], "minimum": -180, "maximum": 180 }
      }
    },
    "metric": { "type": ["string", "null"] },
    "horizon": {
      "type": ["object", "null"],
      "additionalProperties": false,
      "properties": {
        "value": { "type": ["number", "null"], "exclusiveMinimum": 0 },
        "unit": { "type": ["string", "null"],
                  "enum": ["min", "hour", "day", "week", "month", "year", null] },
        "hours": { "type": ["number", "null"], "exclusiveMinimum": 0,
                   "description": "canonical horizon in hours; the only field forecasters read" }
      }
    },
    "requested_output": {
      "type": "string",
      "enum": ["point", "interval", "probability", "pattern", "explanation"]
    },
    "confidence_level": { "type": "number", "exclusiveMinimum": 0, "exclusiveMaximum": 1, "default": 0.90 },
    "params": {
      "type": "object",
      "description": "structured numeric inputs; passes straight to the _predict_* handlers",
      "properties": {
        "series":   { "type": "array", "items": { "type": ["number", "object"] } },
        "values":   { "type": "array", "items": { "type": "number" } },
        "magnitude":{ "type": ["number", "null"] },
        "latitude": { "type": ["number", "null"], "minimum": -90, "maximum": 90 },
        "longitude":{ "type": ["number", "null"], "minimum": -180, "maximum": 180 },
        "radius_km":{ "type": ["number", "null"], "exclusiveMinimum": 0 },
        "state_vector": { "type": ["object", "null"] }
      }
    },
    "constraints": {
      "type": ["object", "null"],
      "properties": {
        "region":     { "type": ["string", "null"] },
        "time_window":{ "type": ["string", "null"] },
        "threshold":  { "type": ["number", "null"] },
        "comparator": { "type": ["string", "null"], "enum": [">", ">=", "<", "<=", "==", null] }
      }
    },
    "provenance": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "used_llm":      { "type": "boolean", "default": false },
        "resolver_hits": { "type": "array", "items": { "type": "string" } },
        "fallbacks":     { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

### 9.2.3 Domains and their pipeline mapping

The current code ships 5 domains (`crypto | seismic | trajectory | growth | generic`). The spec widens this to 10. Each domain deterministically selects one specialist pipeline.

| `domain` | Pipeline | Specialist handler | Models (existing → §06 target) | Default `requested_output` |
|---|---|---|---|---|
| `crypto` | FORECAST | `_predict_crypto` | GBM-MC + Holt → +EnbPI conformal, +TimesFM | interval |
| `markets` | FORECAST | `_predict_crypto`-style (generalised) | GBM/Holt/ARIMA → +foundation TS | interval |
| `seismic` | EVENT-PROB | `_predict_seismic` | Gutenberg-Richter+Poisson, Omori | probability |
| `weather` | EVENT-PROB / FORECAST | new `_predict_weather` | climatology Poisson, threshold-exceedance | probability |
| `trajectory` | FORECAST (analytic) | `_predict_trajectory` | great-circle, ballistic, Kepler | point |
| `growth` | FORECAST | `_predict_growth` | exp/logistic fit → +conformal | interval |
| `relational` | RELATIONAL/KG | new `_predict_relational` | KGIK temporal graph, TGN/TGAT link-pred, xERTE | probability/pattern |
| `pattern` | PATTERN-SCAN | new `_predict_pattern` | Matrix Profile (STUMPY), HDBSCAN, PELT/BOCPD | pattern |
| `explain` | EXPLAIN | new `_predict_explain` | driver attribution, counterfactual fork | explanation |
| `generic` | FORECAST (fallback) | `_predict_generic` | exp/logistic via `fit_growth_series` | interval |

> Backward-compat: `markets` and `weather` may collapse to `crypto`/`seismic` handlers in v1; `relational/pattern/explain` route to `_insufficient()` with a precise "needs" message until the §06 algorithms land, so the front door never 500s.

---

## 9.3 KIMI INTENT-EXTRACTION PROMPT + KEY-FREE FALLBACK

### 9.3.1 Why this is two parsers, always

`_kimi_extract()` already returns `None` on *any* failure (no key, non-200, unparseable JSON) so the regex path takes over. We keep that contract and harden both sides: the LLM parser becomes schema-constrained few-shot; the fallback becomes the §9.3.3 deterministic parser that can fill **every** `IntentPlan` field the LLM would. **The fallback is the source of truth for correctness; the LLM is an accelerator for fuzzy phrasing.**

### 9.3.2 Kimi system prompt (intent extraction)

Stored at `server/prompts/intent_router.md`. Called via a **non-streaming** JSON variant of the `kimi.py` wrapper (`temperature=0.0`, `response_format={"type":"json_object"}` when supported, else regex-extract the first `{...}` as `_kimi_extract` does today). Model: `kimi-k2-0905-preview`.

```text
SYSTEM:
You are the INTENT ROUTER for a grounded prediction engine. You DO NOT predict,
estimate, or compute anything. Your ONLY job is to translate a natural-language
question into a strict JSON IntentPlan that a deterministic engine will execute.

Rules:
- Output ONLY a single JSON object. No prose, no markdown, no code fences.
- Never invent numbers. If a value is not stated in the question, use null.
- "domain" must be one of: crypto, markets, seismic, weather, trajectory,
  growth, relational, pattern, explain, generic.
- "requested_output" must be one of: point, interval, probability, pattern,
  explanation. Infer it from the verb:
    "where/what will X be"      -> point   (trajectory) or interval (series)
    "how likely / chance / risk -> probability
    "is this anomalous/regime"  -> pattern
    "why / what drives / explain-> explanation
- "horizon": extract {value, unit} from phrases like "in 48h", "next week",
  "by 2029". Leave null if absent. Do not convert to hours (the engine does).
- "target_entity.raw": copy the verbatim span naming the subject (a ticker,
  a place, a flight number, an entity). Do NOT resolve it to an id (the engine
  resolves ids). Set "type" to your best guess: asset|place|flight|kg_entity|
  series|event_type|null.
- "metric": the quantity asked about (price, magnitude, position, count,
  interaction, regime) or null.
- "confidence_level": only set if the user asks for a specific coverage
  (e.g. "90% interval"); else 0.90.
- If the question is ambiguous, prefer "generic" and leave fields null;
  the deterministic fallback will refine.

Output schema (keys, types): {domain, target_entity:{raw,type}, metric,
horizon:{value,unit}, requested_output, confidence_level, constraints:
{region,threshold,comparator}}
```

Few-shot examples appended to the system message (kept short; temperature 0):

```text
USER: XRP price in 48h
ASSISTANT: {"domain":"crypto","target_entity":{"raw":"XRP","type":"asset"},
"metric":"price","horizon":{"value":48,"unit":"hour"},
"requested_output":"interval","confidence_level":0.90,
"constraints":{"region":null,"threshold":null,"comparator":null}}

USER: what's the quake risk near Tokyo this week
ASSISTANT: {"domain":"seismic","target_entity":{"raw":"Tokyo","type":"place"},
"metric":"magnitude","horizon":{"value":1,"unit":"week"},
"requested_output":"probability","confidence_level":0.90,
"constraints":{"region":"Tokyo","threshold":null,"comparator":">="}}

USER: where will flight BA249 be in 20 minutes
ASSISTANT: {"domain":"trajectory","target_entity":{"raw":"BA249","type":"flight"},
"metric":"position","horizon":{"value":20,"unit":"min"},
"requested_output":"point","confidence_level":0.90,
"constraints":{"region":null,"threshold":null,"comparator":null}}

USER: which entities will interact with PSG next quarter
ASSISTANT: {"domain":"relational","target_entity":{"raw":"PSG","type":"kg_entity"},
"metric":"interaction","horizon":{"value":3,"unit":"month"},
"requested_output":"probability","confidence_level":0.90,
"constraints":{"region":null,"threshold":null,"comparator":null}}

USER: is this series anomalous or regime-shifting
ASSISTANT: {"domain":"pattern","target_entity":{"raw":"this series","type":"series"},
"metric":"regime","horizon":null,"requested_output":"pattern",
"confidence_level":0.90,"constraints":{"region":null,"threshold":null,"comparator":null}}

USER: why is bitcoin volatile right now
ASSISTANT: {"domain":"explain","target_entity":{"raw":"bitcoin","type":"asset"},
"metric":"volatility","horizon":null,"requested_output":"explanation",
"confidence_level":0.90,"constraints":{"region":null,"threshold":null,"comparator":null}}
```

**Post-LLM validation (always):** the returned JSON is validated against the §9.2.2 schema. Any field that is missing, out-of-enum, or type-wrong is *dropped* and re-derived by the fallback parser. The LLM never wins a conflict against an explicitly supplied `param`. This is the same defensive posture as today's `classify()` (`if llm.get("domain") in (...)`), extended to all fields.

### 9.3.3 Deterministic fallback parser (key-free) — pseudocode

This extends the existing `_parse_horizon_hours`, `_find_ticker`, and the keyword block in `classify()`. It must fill the whole `IntentPlan` with **no network and no API key**.

```python
def fallback_parse(question, params) -> IntentPlan:
    ql = question.lower()
    plan = IntentPlan(params=dict(params or {}),
                      provenance={"used_llm": False, "fallbacks": [], "resolver_hits": []})

    # ── 1. requested_output from verbs/cues (checked before domain) ──
    if any(w in ql for w in ("anomal", "regime", "change-point", "changepoint",
                             "motif", "pattern", "outlier", "shift")):
        plan.requested_output = "pattern"
    elif ql.startswith(("why", "what drives", "explain")) or "what causes" in ql:
        plan.requested_output = "explanation"
    elif any(w in ql for w in ("risk", "chance", "likely", "probability",
                               "odds", "will there be", "how likely")):
        plan.requested_output = "probability"
    elif any(w in ql for w in ("where", "position", "located", "be in")):
        plan.requested_output = "point"
    else:
        plan.requested_output = "interval"

    # ── 2. domain (keyword cascade — superset of today's classify()) ──
    ticker = find_ticker(ql)                       # existing _find_ticker
    if plan.requested_output == "pattern":
        plan.domain = "pattern"
    elif plan.requested_output == "explanation":
        plan.domain = "explain"
    elif any(v in ql for v in ("interact", "connect", "linked to", "related to",
                               "play", "meet", "partner", "edge", "graph")):
        plan.domain = "relational"
    elif ticker or any(w in ql for w in ("price","crypto","coin","bitcoin","stock","$")):
        plan.domain = "crypto"; plan.target_raw = ticker
    elif any(w in ql for w in ("earthquake","quake","seismic","magnitude",
                               "aftershock","tremor")):
        plan.domain = "seismic"
    elif any(w in ql for w in ("rain","storm","temperature","weather","wind","snow","heat")):
        plan.domain = "weather"
    elif any(w in ql for w in ("flight","plane","aircraft","trajectory","projectile",
                               "missile","orbit","satellite","heading","position")):
        plan.domain = "trajectory"
    elif any(w in ql for w in ("growth","users","subscribers","doubling","adoption",
                               "spread","saturate","logistic","exponential")):
        plan.domain = "growth"
    else:
        plan.domain = "generic"

    # ── 3. horizon (existing _parse_horizon_hours, now also keeps value+unit) ──
    plan.horizon = parse_horizon(question)         # {value, unit, hours} or None

    # ── 4. target span + domain-specific param extraction ──
    if plan.domain == "crypto" and not plan.target_raw:
        plan.target_raw = ticker
    if plan.domain == "seismic":
        m = regex(r"(?:magnitude|mag|m)\s*(\d(?:\.\d+)?)", ql)        # existing
        if m: plan.params["magnitude"] = float(m)
        latlng = regex(r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)", question)
        if latlng: plan.params["latitude"], plan.params["longitude"] = latlng
        plan.target_raw = plan.target_raw or extract_place_span(ql)   # §9.3.4

    # ── 5. confidence level if explicitly requested ──
    cl = regex(r"(\d{2})\s*%\s*(?:interval|confidence|ci)", ql)
    if cl: plan.confidence_level = int(cl) / 100.0
    else:  plan.confidence_level = 0.90

    # ── 6. explicit param override always wins (matches classify() today) ──
    if params.get("domain"): plan.domain = params["domain"]

    plan.provenance["fallbacks"].append("deterministic_parser")
    return plan
```

### 9.3.4 Entity resolution (`entity_resolve`)

Runs *after* parsing, on `target_entity.raw`, filling `id/label/type/lat/lng`. All resolvers are key-free and offline-capable; each logs to `provenance.resolver_hits`.

| Entity type | Resolver | Mechanism (grounded in repo) |
|---|---|---|
| **asset** (ticker) | `resolve_ticker(raw)` | `_TICKER_TO_ID` map already in `prediction.py` (xrp→ripple, btc→bitcoin, …). Returns CoinGecko id. Unknown → keep raw, flag `unknown_entity`. |
| **place** (city/region) | `resolve_place(raw)` | static gazetteer dict `{ "tokyo": (35.68, 139.69), "san francisco": (37.77,-122.42), ... }` (top ~300 cities/seismic regions, shipped as `data/gazetteer.json`); optional Nominatim lookup only if network allowed and cached. Returns `lat,lng` → fills `params.latitude/longitude` and a default `radius_km`. |
| **flight** | `resolve_flight(raw)` | flight number → requires a live state vector (no bundled ADS-B feed; matches current `_predict_trajectory` caveat). If `params.state_vector` absent → `insufficient_data`. |
| **kg_entity** | `resolve_kg(raw)` | KGIK lookup via `underworld/server/services/knowledge_graph.py` typed-graph node search (label/alias match → node id `kgik:<type>/<name>`). Unknown → `unknown_entity`. |
| **series** | identity | `target_entity.raw == "this series"` → expect `params.series/values`; else `insufficient_data`. |

Resolution is *advisory*: an explicit `params.latitude/longitude` or `params.target` always overrides a resolver result (same precedence rule as `classify()` today).

---

## 9.4 ROUTING TABLE — QUESTION PATTERNS → PIPELINE → DATA → MODELS

The router is fully specified by the following table. Columns: the trigger pattern, the resolved `domain`/`requested_output`, the pipeline, the data source(s), the model(s), and the handler.

| # | Question pattern (regex/keyword cue) | domain / output | Pipeline | Data source | Model(s) | Handler |
|---|---|---|---|---|---|---|
| R1 | ticker ∈ `_TICKER_TO_ID` OR `price\|$\|coin` + horizon | crypto / interval | FORECAST | `load_crypto_series` (CoinGecko) or `params.series` | GBM-MC + Holt → EnbPI | `_predict_crypto` |
| R2 | `quake\|earthquake\|seismic\|magnitude` + place/latlng | seismic / probability | EVENT-PROB | `load_seismic_catalog` (USGS) or `params.magnitudes` | Gutenberg-Richter + Poisson | `_predict_seismic` |
| R3 | `aftershock` + mainshock params | seismic / probability | EVENT-PROB | `params` (mainshock K,c,p,t) | Omori-Utsu + Poisson | `_predict_seismic` (omori branch) |
| R4 | `flight\|plane\|where will ... be` + state vector | trajectory / point | FORECAST (analytic) | `params.state_vector` (no live ADS-B) | great-circle (haversine) | `_predict_trajectory` |
| R5 | `orbit\|satellite` + `a_km` | trajectory / point | FORECAST (analytic) | `params.semi_major_axis_km` | Kepler III (`orbital_period`) | `_predict_trajectory` |
| R6 | `projectile\|missile\|range` + speed,angle | trajectory / point | FORECAST (analytic) | `params.speed,angle_deg` | ballistic `projectile_range` | `_predict_trajectory` |
| R7 | `growth\|users\|adoption\|doubling` + series | growth / interval | FORECAST | `params.series` | exp + logistic fit | `_predict_growth` |
| R8 | `interact\|connect\|play\|meet\|linked` + KG entity | relational / probability | RELATIONAL/KG | KGIK graph (`knowledge_graph.py`) | TGN/TGAT link-pred, xERTE | `_predict_relational` |
| R9 | `anomal\|regime\|motif\|change-point` + series | pattern / pattern | PATTERN-SCAN | `params.series` / History Lake | Matrix Profile, HDBSCAN, PELT/BOCPD | `_predict_pattern` |
| R10 | `why\|what drives\|explain` + entity | explain / explanation | EXPLAIN | prior forecast + drivers | driver attribution, counterfactual fork | `_predict_explain` |
| R11 | anything else with a numeric series | generic / interval | FORECAST | `params.series` | exp/logistic via `fit_growth_series` | `_predict_generic` |
| R12 | unrecognised, no series | generic / — | — | — | — | `_insufficient` (precise "needs") |

### 9.4.1 Worked examples (end-to-end traces)

**"XRP price in 48h"**
→ Router: LLM/fallback → `domain=crypto`, `requested_output=interval`, `target_entity.raw="XRP"`, `horizon={48,hour,48.0}`.
→ `entity_resolve`: `resolve_ticker("xrp") = "ripple"` (from `_TICKER_TO_ID`).
→ Pipeline R1 / FORECAST → `_predict_crypto`: `load_crypto_series("ripple", 90)` → 90 daily prices.
→ Execution: `gbm_montecarlo_forecast(values, horizon_steps=2)` (48h ≈ 2 daily steps) → point, 5/95 interval, P(up).
→ Verifier: price > 0 ✓, interval low<point<high ✓, P(up)∈[0,1] ✓, "not financial advice" caveat present ✓.
→ Synthesis: "XRP (ripple) projected ~$X over 48h; 90% band $low–$high; P(up)≈Y. Assumes GBM with constant μ,σ. Not financial advice."

**"quake risk near Tokyo this week"**
→ Router: `domain=seismic`, `requested_output=probability`, `target_entity.raw="Tokyo"`, `horizon={1,week,168.0}`, `metric=magnitude`.
→ `entity_resolve`: `resolve_place("tokyo") = (35.68,139.69)` → `params.latitude/longitude`, default `radius_km=300`, default `magnitude=5.0`.
→ Pipeline R2 / EVENT-PROB → `_predict_seismic`: `load_seismic_catalog(lat,lng,radius_km, days=30)` (USGS) → magnitudes.
→ Execution: `gutenberg_richter_poisson(mags, target_magnitude=5.0, horizon_days=7, catalog_days=30)` → `P(≥1 M≥5 in 7d)`.
→ Verifier: P∈[0,1] ✓; if `n_events<10` → confidence downgrade + thin-data caveat.
→ Synthesis: "P(≥1 quake M≥5.0 within ~300 km of Tokyo in 7 days) ≈ Z. G-R b=…, rate=…/day. Assumes Poisson stationarity."

**"where will flight X be in 20 min"**
→ Router: `domain=trajectory`, `requested_output=point`, `target_entity.raw="X"`, `type=flight`, `horizon={20,min,0.333}`.
→ `entity_resolve`: `resolve_flight("X")` → no bundled ADS-B feed. If `params.state_vector` present, use it; else → `insufficient_data` with needs="current state vector {lat,lng,speed_mps,heading_deg}".
→ Pipeline R4 / FORECAST(analytic) → `_predict_trajectory`: `great_circle_forward(...)` at 20 min.
→ Verifier: lat∈[-90,90], lng∈[-180,180] ✓; no interval (analytic) → caveat "straight-track extrapolation, no statistical interval".
→ Synthesis: "If current heading/speed hold, ~20 min ahead position ≈ (lat,lng), alt ≈ … . Straight-track only."

**"which entities will interact with PSG next quarter"**
→ Router: `domain=relational`, `requested_output=probability`, `target_entity.raw="PSG"`, `type=kg_entity`, `horizon={3,month,2190.0}`, `metric=interaction`.
→ `entity_resolve`: `resolve_kg("PSG")` → KGIK node `kgik:club/PSG` (or `unknown_entity` if absent).
→ Pipeline R8 / RELATIONAL/KG → `_predict_relational`: KGIK temporal graph → TGN/TGAT link-prediction over the entity's neighborhood → ranked candidate edges with probabilities.
→ Verifier: each edge prob∈[0,1], ranked desc; if graph sparse around node → confidence downgrade + caveat "few historical edges".
→ Synthesis: "Top likely interactions next quarter: [entity, p], … Based on KGIK temporal edges; link-prediction, not a schedule."
→ v1 status: if §06 TGN not yet wired → `_insufficient(needs="temporal KG link-prediction not yet enabled; KGIK node resolved")`.

**"is this series anomalous / regime-shifting"**
→ Router: `domain=pattern`, `requested_output=pattern`, `target_entity.raw="this series"`, `horizon=null`.
→ `entity_resolve`: identity; require `params.series/values`.
→ Pipeline R9 / PATTERN-SCAN → `_predict_pattern`: Matrix Profile (motif/discord/anomaly score), HDBSCAN (regime clusters), PELT/BOCPD (change-points).
→ Execution returns: anomaly score per point, list of change-point indices, regime labels — **not a numeric forecast**, so `requested_output=pattern`.
→ Verifier: scores finite; change-point indices within series bounds; if `len(series)<30` → "too short for reliable motif/change-point detection" caveat + confidence downgrade.
→ Synthesis: "Detected N change-points at t=…; current regime = …; max discord (anomaly) at t=… (score=…). Training-free detection."

---

## 9.5 VERIFIER / SYNTHESIS AGENT

The verifier is a **deterministic gate** between execution and synthesis. It never calls the LLM. It either passes the result, repairs a clamp-able defect, or refuses with a structured downgrade. It centralises checks that today are scattered inline (`min(max(prob,0),1)`, Holt `max(0.0, ...)` floor, the `_insufficient()` shape).

### 9.5.1 Sanity checks

| Check | Rule | Action on violation |
|---|---|---|
| **Units present** | `prediction.unit` non-null for numeric answers | attach unit from domain default; flag `unit_inferred` |
| **Sign / physical bounds** | price ≥ 0; magnitude ∈ [−1, 10]; lat ∈ [−90,90]; lng ∈ [−180,180]; alt ≥ −500 m; count ≥ 0 | clamp to bound + caveat; if point itself is impossible → refuse |
| **Interval ordering** | `interval.low ≤ point_estimate ≤ interval.high` | if crossed, swap low/high; if point outside → widen interval to include point + flag |
| **Probability range** | every `probability` ∈ [0,1] | clamp + flag; if produced as NaN → refuse |
| **Interval coverage label** | `interval.confidence` matches requested `confidence_level` | recompute or relabel; never claim coverage the model didn't produce |
| **Finite** | no NaN/Inf in any emitted number | replace with null + downgrade to insufficient_data |
| **Monotone horizon** | horizon hours > 0 | default per domain |

### 9.5.2 Honesty enforcement

- **Assumptions are mandatory.** A numeric/probabilistic answer with an empty `assumptions` array is rejected and rerouted to `_insufficient` (you cannot ship a number without stating the model's assumptions). The existing handlers already populate domain assumptions (GBM iid-Gaussian, G-R/Poisson stationarity, constant-heading, etc.) — the verifier asserts they are non-empty.
- **Refuse fake precision.** Analytic point estimates with no statistical interval (trajectory/orbital/ballistic) MUST carry the caveat "analytic idealisation; point estimate has no statistical interval" and MUST set `interval.confidence = 0.0` (as `_trajectory_result` already does). The verifier blocks any attempt to attach a fabricated interval to an analytic result.
- **No invented capability.** If a pipeline is not yet wired (relational/pattern/explain in v1), the verifier ensures the response is `insufficient_data` describing exactly what is missing — never a fabricated answer.
- **Caveats must surface uncertainty.** At least one caveat naming the dominant uncertainty source (heavy tails for crypto, Poisson stationarity for seismic, straight-track for trajectory, short-series for growth/pattern) must be present.

### 9.5.3 Confidence downgrade on thin data

A scalar `confidence_score ∈ [0,1]` is attached to every result and is *monotonically reduced* by thinness signals:

```python
def confidence_downgrade(result, n_samples, domain):
    c = result.prediction.interval.confidence or result.confidence_level  # base
    # thin-data multiplicative penalties
    if n_samples is not None:
        if   n_samples < MIN[domain]:   c *= 0.0   # -> insufficient_data
        elif n_samples < SOFT[domain]:  c *= 0.6; add_caveat("few data points; CI is optimistic")
        elif n_samples < AMPLE[domain]: c *= 0.85
    if result.data.source in (None, "params") and domain in ("crypto","seismic"):
        add_caveat("offline/params data; not validated against the live feed")
    if used_extrapolation_beyond_history(result):
        c *= 0.7; add_caveat("horizon extends well beyond observed history")
    result.confidence_score = round(c, 3)
    return result
# thresholds (rows): MIN/SOFT/AMPLE
#   crypto  3 / 30  / 200 samples
#   seismic 2 / 20  / 200 events    (n_events from G-R fit)
#   growth  3 / 8   / 30  points
#   pattern 30 / 100 / 500 points   (motif/change-point need length)
```

`MIN[domain]` mirrors the existing `len(values) < 3`, `len(mags) < 2` guards. Hitting `MIN` routes to `_insufficient()`.

### 9.5.4 Synthesis agent

After verification, the synthesis node renders the verified result. **It always returns the structured JSON** (frontend can ignore the prose). Prose is generated by:

- **Key-free path (default / no API key):** a deterministic Jinja-style template per domain that reads only verified fields, e.g. `"{target}: {point} {unit} over {horizon}; {confidence:.0%} interval {low}–{high}. {top_caveat}"`. No numbers are invented because the template only interpolates verified values.
- **Kimi path (key present):** `kimi.stream_chat`-style call with a SYNTHESIS system prompt: *"You are a writer. You are given a verified JSON result. Restate it fluently. You MUST NOT add, alter, or round any number, and MUST preserve every caveat. If a field is null, say it is unknown."* The output is re-scanned: any number in the prose not present in the verified JSON triggers fallback to the template (anti-hallucination tripwire).

---

## 9.6 FAILURE HANDLING — STRUCTURED GRACEFUL RESPONSES

`predict()` already guarantees it "never raises on a normal question" and returns a structured `_insufficient()` shape. We formalise three failure classes, each with a stable `error_code`, a human `needs` string, and the same outer schema (so the frontend renders them uniformly).

| `error_code` | Trigger | Response |
|---|---|---|
| `insufficient_data` | `< MIN[domain]` samples; no series and no resolvable feed | `_insufficient(..., needs="<exact inputs required>")`; `confidence_score=0.0`; `prediction.value=null` |
| `unknown_entity` | resolver could not map `target_entity.raw` (bad ticker, unknown city, KG node absent) | structured result with `error_code`, `resolved=null`, `needs="recognised ticker / known place / KGIK entity"`, plus a suggestion list (closest gazetteer/KG matches) |
| `feed_error` | live fetch failed (network/rate-limit/non-200) AND no `params` fallback | `error_code=feed_error`, name the feed (`CoinGecko`/`USGS`), `needs="supply params.series/magnitudes to run offline"`, `retry_after` hint; degrade — never 500 |

All three reuse the `_insufficient()` envelope (same keys: `question, domain, target, horizon, prediction, method, drivers, data, assumptions, caveats, used_llm`) plus the added `error_code`, `needs`, and `confidence_score`. The internal-error catch already present in `predict()` (`except Exception → _insufficient(... "An internal error was caught and handled; result degraded gracefully.")`) is retained as the final safety net and mapped to `error_code=internal_handled`.

Example (`unknown_entity`):
```json
{
  "error_code": "unknown_entity",
  "domain": "crypto",
  "target": "DOGECOINX",
  "prediction": {"value": null, "interval": {"low": null, "high": null, "confidence": 0.0}, "probability": null},
  "needs": "a recognised ticker (e.g. BTC, ETH, XRP) or params.series with prices",
  "suggestions": ["DOGE → dogecoin"],
  "assumptions": [],
  "caveats": ["Could not resolve 'DOGECOINX' to a known asset id."],
  "confidence_score": 0.0
}
```

---

## 9.7 GUARDRAILS

These are enforced by the verifier (deterministic) and reinforced in both prompt layers (router + synthesis):

1. **No financial advice framing.** Crypto/markets answers MUST carry "Not financial advice. The interval is a model band, not a guarantee." (already present in `_predict_crypto`). The synthesis prompt forbids imperatives ("buy", "sell", "you should"). The verifier rejects any prose containing advice verbs and falls back to the template.
2. **No medical/clinical advice.** Any question resolving toward diagnosis/treatment/dosage is routed to a refusal: `error_code=out_of_scope`, caveat "This engine forecasts patterns, not medical advice; consult a professional." (Detected by keyword guard in the fallback parser: `diagnos|dosage|prescrib|treat|symptom→cure` etc.)
3. **Uncertainty must be surfaced.** No answer ships without `interval` and/or `probability` plus `confidence_score`. A bare point estimate is only allowed for analytic-physics domains (trajectory/orbital/ballistic) and only with the explicit "no statistical interval" caveat and `confidence=0.0`.
4. **No invented numbers from the LLM.** Both LLM nodes are number-free by construction (router emits a plan with nulls, not values; synthesis is anti-hallucination-scanned). The deterministic core is the sole source of every quantity.
5. **Calibrated honesty over confident wrongness.** When the model and the data disagree with physical sense (sign flips, intervals collapsing to a point, P=exactly 0/1), the verifier widens/clamps and downgrades rather than emitting crisp but unjustified output.

---

## 9.8 TRACEABILITY (requirement → component → test)

| Requirement (this section) | Component | Test (see `11_VALIDATION_AND_TEST_PLAN.md`) |
|---|---|---|
| Router emits valid IntentPlan | `orchestrator.intent_extract` + schema | schema-validation unit test over the 6 few-shot + 50 paraphrases |
| Key-free operation | `fallback_parse` | run full suite with `KIMI_API_KEY=""`; assert identical routing |
| Entity resolution | `entity_resolve` | ticker/place/KG resolution + unknown_entity fixtures |
| Routing correctness | routing table R1–R12 | golden-route test: question → expected (domain, handler) |
| Verifier sanity | `verify()` | property tests: prob∈[0,1], interval ordering, bounds, finiteness |
| Honesty enforcement | `verify()` | assert assumptions non-empty; analytic results have confidence=0 |
| Confidence downgrade | `confidence_downgrade` | thin-data fixtures lower `confidence_score` monotonically |
| Failure handling | `_insufficient` + error_codes | feed-down, bad-ticker, no-series fixtures return structured shapes |
| Guardrails | verifier + prompts | advice-verb / medical-keyword fixtures route to refusal |

---

*End of `09_ORCHESTRATION_NL_ROUTING.md`. Upstream: `04_ARCHITECTURE.md` (dataflow), `06_ALGORITHMS.md` (forecaster math), `05_DATA_MODEL_AND_SCHEMAS.md` (History Lake / KGIK), `07_API_CONTRACTS.md` (endpoint schema). This section deepens with each version pass per `00_MASTER_INDEX.md §4` (v1→v150).*
