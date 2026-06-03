# Underworld asset generation — the stages

The full catalogue is **321 distinct GLBs** (`design_list.py`) covering every
feature and function a Minion touches in a day — from the terrain under their
feet to the microscope on the guild bench, the bed they wake in, the meal they
eat, the coin they spend and the machine they operate.

Rather than generate all 321 at once, we generate them in **6 stages**. Each
stage is a coherent slice that is *usable on its own* — finish a stage and the
world is meaningfully more complete, not half-dressed. This also matches
generation to credits: load enough for the next stage, run it, top up, continue.

Approx cost: **~20 Tripo credits per GLB**, so the whole world is **~6,420
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
| **1** | **Core World** | terrain, nature, buildings, civic landmarks + the Avatar-grade FX/hero layer — the landscape, skyline and cinematic set pieces | 106 | ~2,120 |
| **2** | **Home & Daily Life** | interiors (floors/walls/doors), furniture, household (kitchen, bath, bed, leisure) + family/children — follow a Minion through her home | 60 | ~1,200 |
| **3** | **Guild Work & Tools** | every guild instrument (microscope, lathe, oscilloscope, forge…) + the handheld tools, books, meals and devices Minions pick up and operate | 75 | ~1,500 |
| **4** | **Community & Economy** | shops, market stalls, taverns, coins, scales, culture/religion/art (altars, looms, instruments) — public life | 20 | ~400 |
| **5** | **Society Systems** | medical (hospital, lab), agriculture (livestock, crops, silo), infrastructure (telegraph, rail, power, mills) and safety | 38 | ~760 |
| **6** | **Movement & Polish** | vehicles (cart→steam→car→hover), monuments and final street props | 22 | ~440 |
|       | **TOTAL** | | **321** | **~6,420** |

## Why this order

1. **Core World first** — you can't believe in a place with no ground, trees or
   skyline. Stage 1 makes the world *look* like the Sims-4/Avatar target and gives
   the UE5 renderer beautiful meshes to light (Lumen + Niagara do the glow).
2. **Home & Daily Life** — the "watch a Minion for a day" loop starts at home:
   wake in bed, wash, eat breakfast. Stage 2 furnishes that.
3. **Guild Work & Tools** — the heart of the sim: real instruments per guild and
   the props that make `study`, `calculate`, `propose_invention` *visible*. These
   ids are the exact set `interactions.py` references, so every action a Minion
   takes now has a real object to hold or operate.
4. **Community & Economy**, then **5. Society Systems** — the wider civilisation
   fills in: markets, medicine, farms, infrastructure.
5. **Movement & Polish** — vehicles and monuments last; they're the cherry, not
   the cake.

## How it maps to the simulation

- The **immersive interaction contract** lives in `interactions.py`: each sim
  action → animation + anchor + the object GLB ids it needs. Stages 2–3 generate
  exactly those object/tool ids, so "sits on a chair and reads a book", "operates
  the microscope", "eats a meal at the table" all resolve to real meshes.
- `GUILD_TOOLS` ties each guild's `calculate`/`propose_invention` to its yielded
  tool (materials→microscope/hammer, electrical→oscilloscope…). All of those ids
  are in stage 3.
- `DAILY_ROUTINE` (bed→breakfast→commute→guild→work→study→home) is covered across
  stages 1–3 (+ a vehicle from stage 6 for the commute).

Run `--stage N --estimate` any time for a live count of what's left in a wave.
