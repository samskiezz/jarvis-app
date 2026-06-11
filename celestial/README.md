# JARVIS Celestial OS Repo Mapping Package

This package contains:

- `JARVIS_Celestial_Repo_Map.xlsx` — workbook with repo-to-celestial mapping, equations, scale rules, orbit model, visibility rules and replication workflow.
- `celestial_index_seed.csv` — seed index exported from the workbook.
- `jarvis_celestial_seed_map.json` — JSON seed map for Three.js/runtime use.
- `jarvis_celestial_layout_engine.ts` — deterministic TypeScript equations for importance, size, distance, orbit and visibility.
- `scan_repo_to_celestial_index.py` — local repo scanner that regenerates a deterministic index whenever files are added.
- `JARVIS_Celestial_OS_Implementation_Spec.md` — implementation spec for Claude.

Important rule: documents, notes, raw files, logs, DB rows and graph leaves are dust by default. Search or active workflow may temporarily promote dust to a meteorite. Satellites are final actions/tools, not raw records.
