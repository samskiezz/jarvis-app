# Tripo3D HD asset generation (account-owned, API-key, secure)

Generates the high-fidelity 3D designs the world needs (homes, props, nature,
vehicles, monuments — per epoch) using your Tripo3D account, and folds them into
the same art library the scraper + renderers use.

## SECURITY — read this
- **No password is ever used, stored, or committed.** This uses the official
  **API key** only.
- Create a key at **https://platform.tripo3d.ai → Settings → API keys** (starts
  with `tsk_`). It's tied to your account, so generation uses *your* credits.
- Provide it via environment only:
  ```bash
  export TRIPO3D_API_KEY=tsk_xxxxxxxx
  ```
- If you pasted your password anywhere, **rotate it now** — treat it as exposed.

## Generate
```bash
export TRIPO3D_API_KEY=tsk_...
python -m underworld.assets.tripo.generate --dry-run            # preview the queue
python -m underworld.assets.tripo.generate                      # make all missing
python -m underworld.assets.tripo.generate --epoch industrial   # one era
python -m underworld.assets.tripo.generate --only home_modern,clock_tower
```
- Async per Tripo's API: submit → poll → download the PBR GLB.
- Idempotent: skips ids already in the manifest; checkpoints after each (credits).
- Output: `web/public/models/generated/tripo/<id>.glb`
- Manifest: merged into `web/public/models/scraped/assets_manifest.json` (one
  library for scraped + generated art the WebGL/UE5 renderers consume).

## What it makes
`design_list.py` is the catalogue — ~26 seed designs across building / prop /
nature / vehicle / monument, tagged by epoch (stone → quantum) for a cohesive
Sims-4-grade life-sim look. Extend it freely; the generator only makes what's
missing.

## Characters
For Sims-grade *characters*, MetaHumans (Unreal) are the better path (rigged,
animatable, free). Tripo is ideal for the *world* — buildings, furniture, props,
nature, vehicles. Both import as GLB and are selected via the manifest.
