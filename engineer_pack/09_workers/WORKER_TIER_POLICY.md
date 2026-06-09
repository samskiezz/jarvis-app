# Worker Tier Policy

- Live Data Producer: Tier 0 only.
- Dashboard: Tier 0 only.
- GLB Loader: Tier 0 only.
- GLB Generator: Tier 0-2 only.
- Document Ingestor: Tier 0 for metadata/OCR, Tier 2 summary, Tier 3 complex extraction.
- Knowledge Builder: Tier 2 default, Tier 3 hard reasoning, Tier 4 rare high-value multi-doc.
- Cross-Correlator: Tier 0 default, Tier 2/3 only after deterministic/embedding methods fail.
- Self-Learning Loop: Tier 0 grouping, Tier 2 explanation, Tier 3 repair, Tier 5 only repeated critical failure.
- Coding Workspace: Tier 3-5 with approval/audit.
- API Server: Tier 0 default, Tier 2/3 only for user-requested LLM work.
