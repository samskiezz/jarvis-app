# Underworld asset generation — the stages

The full catalogue is **510 distinct GLBs** (`design_list.py`) covering every
feature, function, guild, role, epoch and storyline the simulation actually
models — every one justified by a real symbol in the backend (the catalogue was
expanded from a full audit of `epochs.py`, `guilds.py`, `instruments.py`,
`roles.py`, `sagas.py`, `climate.py`, `minion.py::_ACTIONS`, etc., plus the
lived-detail props the behavior bridge surfaced in `behavior_coverage.py`).

Rather than generate all 499 at once, we generate them in **7 stages**. Each
stage is a coherent slice that is *usable on its own* — finish a stage and the
world is meaningfully more complete, not half-dressed. This also matches
generation to credits: load enough for the next stage, run it, top up, continue.

Approx cost: **~20 Tripo credits per GLB**, so the whole world is **~10,200
credits**. Generate a stage with:

```bash
export TRIPO3D_API_KEY=tsk_...
python -m underworld.assets.tripo.generate --stage 1 --estimate   # preview + cost
python -m underworld.assets.tripo.generate --stage 1              # generate the wave
```

Generation is **idempotent** — it skips anything already in the manifest, so
you can stop and resume any time, and re-running a finished stage costs nothing.

| Stage | Name | What it delivers | GLBs | ~credits |
|------:|------|------------------|-----:|---------:|
| **1** | **Core World & Biomes** | terrain, nature, the 6 biomes (desert/mountain/forest/hills/plains/plateau) + weather/season set-dressing, buildings, civic landmarks and the Avatar-grade FX/hero + sky layer | 150 | ~3,000 |
| **2** | **Home & Daily Life** | interiors, furniture, household (kitchen/bath/bed/leisure), family/children — follow a Minion through her home | 63 | ~1,260 |
| **3** | **Guild Work & Roles** | every guild instrument + the canonical `Instrument` set + domain benches, the handheld tools/books/meals Minions operate, and the 10 swarm-role workstations + project-stage board | 124 | ~2,480 |
| **4** | **Community & Economy** | shops, markets, taverns, coins, banking/governance, culture/religion/art, fossils, sagas motifs | 40 | ~800 |
| **5** | **Society Systems** | medical, agriculture/livestock, infrastructure (telegraph→rail→grid→mills), safety | 41 | ~820 |
| **6** | **Epoch Ladder** | the 65-milestone history made visible — from an Oldowan chopper and cuneiform tablet to a fusion pod, AGI core, Dyson swarm and interstellar ship | 39 | ~780 |
| **7** | **Movement & Polish** | vehicles (cart→steam→car→hover), monuments, graves, guild banners and final street props | 42 | ~840 |
|       | **TOTAL** | | **499** | **~9,980** |

## Why this order

1. **Core World & Biomes first** — you can't believe in a place with no ground,
   biome flora or skyline. Stage 1 makes the world *look* like the Sims-4/Avatar
   target and gives the UE5 renderer beautiful meshes to light (Lumen + Niagara
   do the glow). It now includes per-biome terrain so a desert reads as a desert.
2. **Home & Daily Life** — the "watch a Minion for a day" loop starts at home:
   wake in bed, wash, eat breakfast. Stage 2 furnishes that.
3. **Guild Work & Roles** — the heart of the sim: real instruments per guild,
   the canonical lab `Instrument` set, and a signature workstation for each of
   the 10 swarm research roles (`roles.py`). These ids are exactly what
   `interactions.py` + the role/action system reference, so `study`, `calculate`,
   `propose_invention` and each role become *visible*.
4. **Community & Economy**, **5. Society Systems** — the wider civilisation fills
   in: markets, governance, medicine, farms, infrastructure.
5. **Epoch Ladder** — one artifact per historical milestone, so "where the
   civilisation stands in history" (`epochs.py::EPOCHS`) is something you can see.
6. **Movement & Polish** — vehicles, monuments and banners last; the cherry.

## How it maps to the simulation

- The **immersive interaction contract** lives in `interactions.py`: each sim
  action → animation + anchor + the object GLB ids it needs. Stages 2–3 generate
  exactly those ids, so "sits and reads a book", "operates the microscope",
  "eats a meal at the table" all resolve to real meshes.
- `GUILD_TOOLS` ties each guild's work to its yielded tool; all of those ids are
  in stage 3, alongside a banner/crest per guild (stage 7/3) so guilds are legible.
- `SwarmRoleKind` (10 roles) and `ProjectStage` (6 stages) each get a workstation
  in stage 3 (`role` category).
- `epochs.py::EPOCHS` (65 milestones) → the stage-6 `epoch` category.
- `climate.py`/`seed.py` biomes, weather and seasons → the stage-1 `biome` category.
- `sagas.py::ARCHETYPES`, `lifecycle.py`, `paleontology.py`, `governance.py`,
  `manufacturing.py` → covered across stages 3–7, each row cited in `design_list.py`.

Run `--stage N --estimate` any time for a live count of what's left in a wave.
