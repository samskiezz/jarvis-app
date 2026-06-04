# GOTHAM / FOUNDRY PARITY — THE COMPLETE GAP INVENTORY
**Goal:** turn this app into what it's built to be — a **Palantir Gotham (intelligence/ops) + Foundry (data integration/ontology) + AIP (AI-over-data)** grade platform.
**Basis:** the full line-by-line read of all 681 files (`COVERAGE_LOG.md`) + the master gap map (`00_MASTER_GAP_MAP.md`).
**How to read:** each pillar = current state → the missing items (the build list). Items are concrete and individually buildable. ✅=exists · ◐=partial/shell · ✗=missing.

> Honest framing: this is a *program*, not a one-shot. The three meta-gaps under everything: **(A) the two backends are disconnected**, **(B) the 489-method science engine + prediction/ML stack have no UI**, **(C) the ontology is static, not a live object model.** Fix those three and ~40% of the items below light up at once.

---

## PILLAR 1 — DATA INTEGRATION (Foundry's spine)
Current: 3 live feeds (USGS/CoinGecko/FX), History Lake (P0 SQLite), static `ontology.py`. Mostly ✗.
1. ✗ Source **connectors** framework (REST/CSV/DB/S3/webhook/email/RSS) with a registry.
2. ✗ **Ingestion pipelines** (extract→normalize→load) beyond the 3 hard-coded adapters.
3. ✗ **Dataset catalog** (named datasets, schemas, owners, freshness).
4. ✗ **Transforms** (declarative/SQL/py transforms producing derived datasets).
5. ✗ **Data lineage / provenance graph** (which source → which transform → which object).
6. ✗ **Scheduling** of syncs (the History Lake loop is the only one; opt-in, single).
7. ✗ **Data health / quality** monitors (nulls, drift, row-count anomalies, SLA).
8. ✗ **Schema registry + versioning / migrations** for ingested data.
9. ✗ **Batch + streaming** ingest (only request-time + a 15-min loop).
10. ✗ **Backfill / replay** of historical pulls (deep-history scrapers exist but ad-hoc).
11. ✗ **Connector secrets vault** (env-only today; no managed credential store).
12. ✗ **Sample / preview** of a source before ingest.
13. ◐ History Lake exists but is unused by the UI and holds 1 domain.
14. ✗ **Geospatial + document + image** ingest (only numeric/timeseries today).

## PILLAR 2 — ONTOLOGY (the object · link · action model)
Current: static `src/domain/ontology.js` + `server/data/ontology.py` (14 objects, 21 links), in-memory entity CRUD. ◐/✗.
15. ✗ **Live, editable object-type registry** (define types at runtime, not hard-coded).
16. ✗ **Property types** (string/number/date/geo/enum/array) with validation + units.
17. ✗ **Link types** with direction + cardinality + properties on the link.
18. ✗ **Actions** (governed write-back operations that mutate objects + audit).
19. ✗ **Functions** (computed properties / derived values on objects).
20. ✗ **Object views** (per-type detail layouts, summary cards, related-objects).
21. ✗ **Object-type permissions** (who can see/edit which type/property).
22. ✗ **Backing-dataset mapping** (object ↔ the dataset/rows it's materialized from).
23. ✗ **Object set** primitive (saved/filtered collections you operate on).
24. ✗ **Bulk edit / bulk action** over an object set.
25. ◐ entity CRUD exists but is in-memory, untyped, and starts empty.
26. ✗ Ontology **import/export + versioning**.

## PILLAR 3 — ENTITY RESOLUTION
Current: ✗ entirely.
27. ✗ Fuzzy **matching** (name/address/identifier) + scoring.
28. ✗ **Dedup / canonicalization** (merge duplicates into a golden record).
29. ✗ **Merge / split / unmerge** with full audit + reversibility.
30. ✗ **Cross-source linking** (same entity across feeds).
31. ✗ **Resolution review queue** (human-in-the-loop confirm/reject).

## PILLAR 4 — SEARCH & DISCOVERY
Current: keyword routing in analyst.py; no real search. ✗.
32. ✗ **Global search** across all objects/datasets/documents.
33. ✗ **Structured / faceted filters** (by type, property, time, geo).
34. ✗ **Semantic / vector search** (embeddings + ANN index — none exists).
35. ✗ **Saved searches** + alerting on new matches.
36. ✗ **Typeahead / autocomplete** entity resolution.
37. ✗ **Search-in-graph** (find paths/patterns).

## PILLAR 5 — GRAPH / LINK ANALYSIS (Gotham Graph)
Current: static KGIK graph, TCIS timeline, JarvisTerminal vertex graph (static). ◐.
38. ◐ Interactive **node-link explorer** — exists but static; ✗ expand/collapse neighbors.
39. ✗ **Path-finding** between two entities (shortest/all paths).
40. ✗ **Graph algorithms surfaced** (centrality, communities, PageRank — exist in `methods_cs_ai`/`graph_extras` but no UI).
41. ✗ **Temporal graph playback** (`temporal_nodes.py` is dormant — wire it).
42. ✗ **Histogram / filter on a selection** (Gotham's selection-driven analysis).
43. ✗ **Save / share / annotate** a graph investigation.
44. ✗ **Expand-by-type** and link-weighting controls.
45. ◐ **NEURAL/CLUSTER 3D viz** — being built now (the reel) → wire to real nodes.

## PILLAR 6 — GEOSPATIAL (Gotham Map)
Current: Globe3D + earthquakes; underworld 3D world. ◐.
46. ✗ Full **map workspace** (2D + globe) with pan/zoom/select.
47. ✗ **Layers** (entities, heatmaps, choropleth, density, tracks).
48. ✗ **Geofences / regions** + region-based queries.
49. ✗ **Tracks / movement** over time + time-slider.
50. ✗ **Geosearch / radius / draw-to-select**.
51. ✗ **ppm/air, buoys, seismic, flight** layers (data exists in the science engine — surface it).

## PILLAR 7 — TEMPORAL ANALYSIS
Current: TCIS timeline (ontology-driven, static). ◐.
52. ◐ Timeline — exists; ✗ real temporal queries / range filters.
53. ✗ **Event-sequence / pattern** detection over time.
54. ✗ **Replay / scrubber** of state over time (History Lake makes this possible).
55. ✗ **Temporal versioning** of objects (valid_from/to — `temporal_nodes` has it, dormant).

## PILLAR 8 — ANALYSIS, DASHBOARDS & REPORTING (Workshop/Quiver)
Current: a few fixed dashboards (MLDashboard, SystemHealth, GlobalIntel). ◐.
56. ✗ **Object explorer** with pivot + histogram + group-by.
57. ✗ **Dashboard builder** (drag widgets, bind to datasets).
58. ✗ **Chart library** bound to live data (only a few hard-coded charts).
59. ✗ **Report / brief generator** (export an investigation to a document).
60. ✗ **Scheduled reports** + distribution.
61. ◐ existing dashboards are real but fixed/cosmetic in places.

## PILLAR 9 — AIP (AI over the ontology)
Current: Kimi analyst chat (keyword-grounded), Prediction Oracle (unsurfaced engine). ◐.
62. ◐ LLM chat — exists; ✗ grounded retrieval over ALL objects/datasets (RAG).
63. ✗ **AI Actions** (LLM proposes a governed write-back, human approves — forge does this for CODE; do it for DATA).
64. ✗ **Tool-use over the 489 science methods** (LLM can call `methods_registry.run`).
65. ✗ **Agent workflows** (multi-step plans over objects).
66. ✗ **Prediction surfaced** (OracleModel conviction/volatility + History-Lake skill scorecard in the UI + chat: "predict X").
67. ✗ **Semantic layer / embeddings** for grounding (none).
68. ✗ **Natural-language → query** over datasets.

## PILLAR 10 — WORKFLOWS · TRIGGERS · ALERTING · CASES
Current: static risk signals. ✗.
69. ✗ **Rule/monitor engine** (condition → alert/action).
70. ✗ **Alerts inbox** + acknowledgement + escalation.
71. ✗ **Case / investigation** management (collect entities + notes + status).
72. ✗ **Queues / tasking** (assign work, track).
73. ✗ **Automations** (on-event do-X) — generalize the forge approval pattern.

## PILLAR 11 — SECURITY · GOVERNANCE · AUDIT
Current: bearer auth, marks (PII/INTERNAL/FINANCIAL/RESTRICTED) shown but not enforced, KGIKLedger hash-chain (audit-only UI). ◐.
74. ✗ **Enforced ACLs** (object / property / row-level) — marks are cosmetic today.
75. ✗ **Classification enforcement** + redaction by clearance.
76. ✗ **Full audit log** of reads/writes/actions (KGIKLedger is a start — make it real + server-side).
77. ✗ **Purpose-based access / data-use policies**.
78. ✗ **Retention / deletion / subject-rights** workflows.
79. ✗ **Roles & groups** (only "admin" today).
80. ✗ **Secrets management** (env-only; the Kimi key sits in a local `.env`).

## PILLAR 12 — COLLABORATION
Current: ✗.
81. ✗ **Notes / comments** on objects + graphs + cases.
82. ✗ **Sharing / permissions** on investigations.
83. ✗ **Activity feed** (who did what).
84. ✗ **Versioning / history** of analyst work.

## PILLAR 13 — MODELING & OPERATIONS (Foundry sims/scenarios)
Current: rich underworld sim + world_model.counterfactual — all unsurfaced. ◐.
85. ✗ **Scenario / what-if** UI over `world_model.counterfactual` (wired backend, no UI).
86. ✗ **Model registry + ops** UI (`ai_models.py` PSI/ECE drift exists; surface it).
87. ✗ **Simulation control** surface for the 27-service underworld sim from APEX.
88. ✗ **Optimization** surface (`real_optimizer.py` Bayesian GP — has a route, no UI).

## PILLAR 14 — SURFACE THE HIDDEN BACKEND (the biggest single win)
Current: 489 science methods + prediction stack + sim = implemented, **0 UI**. ✗.
89. ✗ **Bridge** APEX → underworld `methods_registry` (one route unlocks 489 methods).
90. ✗ **Science console** to run any method with params + see results/plots.
91–104. ✗ Dedicated consoles for the capabilities you named: **Sonar/Submarine, Meteorites/Asteroids, Buoys/Ocean, ppm/Air-quality, Flight/Aerospace, Frequency/RF/Spectrum, Neuron/Neural, Seismic hazard, Satellites, Clusters, Epidemic network, Quantum, Materials, Trajectory** — each backed by the real method module.
105. ✗ **Activate 20 dormant modules** (temporal_nodes, disease_models, drug_discovery, exotic_quantum, ai_models, instruments, manufacturing, patent_intel, society, standards, …) via routes + UI.

## PILLAR 15 — UX / DESIGN SYSTEM (the "cyberpunk glassmorphic" ask)
Current: glass only on the chrome; feature pages opaque `PageKit`. ◐.
106. ◐ **Glassmorphism everywhere** — one fix to `PanelCard`/`PageShell` propagates it.
107. ✗ Consistent **command palette** actions for every capability.
108. ✗ **Keyboard-first** navigation + power-user shortcuts across the app.
109. ✗ **Theming tokens** unified across APEX + underworld web.
110. ◐ many pages are shells (ApexCore, PluginControlPlane, TechTree) — fill or remove.

## PILLAR 16 — PLATFORM / INFRA
Current: 2 disconnected FastAPI backends, Vite frontends, optional Fly/pixelstream. ◐.
111. ✗ **Unify / gateway** the two backends (or a documented service mesh).
112. ✗ **Real persistence** for APEX (entities are in-memory; History Lake unused).
113. ✗ **GPU tier** wired behind `PREDICT_GPU_URL` (vast.ai) — blocked on the instance details.
114. ✗ **Observability** (metrics/traces/logs/dashboards/alerts).
115. ✗ **CI/CD to production** + environments + rollback.
116. ✗ **Multi-user / tenancy**.

---

## BUILD ORDER (max capability per unit effort)
1. **Bridge the backends** (P14 #89) → unlocks 489 methods to the UI.
2. **Glassmorphism one-fix** (P15 #106) → whole app gets the look.
3. **Neural/cluster 3D viz** (P5 #45) → *in progress now* (the reel).
4. **Surface the hidden science consoles** (P14 #90-104) → the "missing features".
5. **Live KGIK graph + temporal playback** (P5 #38-41) → real link analysis.
6. **AIP**: ground the chat on all data + surface the prediction engine (P9 #62-66).
7. **Live ontology + actions + real persistence** (P2, P16 #112).
8. **Search + entity resolution** (P3, P4).
9. **Alerting/cases + enforced security/audit** (P10, P11).
10. **Geospatial + dashboards + reporting** (P6, P8).

> This file is the program backlog. Each numbered item is a tracked work package; check them off as built.
