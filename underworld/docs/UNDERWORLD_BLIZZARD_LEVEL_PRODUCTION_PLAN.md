# Underworld — Blizzard-Level Production Plan
**From rendered media to playable UE5 world**

**Date:** 2026-06-13  
**Status:** Planning complete; awaiting credit budget decision for 3D phase  
**Sources audited:** `GAME-PRODUCTION-BIBLE.md`, `MASTER-PLAN.md`, `MASTER-GLB-LIST.md`, `data/master/PACKS.md`, UE5 runbook, Tripo pipeline, Higgsfield media pipeline.

---

## 1. Honest scope reality check

**"Blizzard-level"** means 200–500 people, 4–7 years, $50M–$300M+. That is not achievable from a sandbox with credits alone.

**What is achievable:** a visually striking, AI-assisted, procedurally rich UE5 life-sim with:
- 2,500+ distinct in-game objects (via modularity + procedural variants)
- Real-time city streaming via Pixel Streaming
- The existing Underworld simulation backend driving it
- A playable vertical slice in months, not years

This plan targets **AA/Steam-quality** — the best an indie/small-team + AI pipeline can deliver.

---

## 2. What already exists (massive head start)

| Asset source | Count | Location |
|-------------|------:|----------|
| Tripo3D generated meshes | **677** | `underworld/web/public/models/generated/tripo/` |
| UW generated modular meshes | **960** | `underworld/web/public/models/generated/uw/` |
| Kenney CC0 kits | **~755** | `underworld/web/public/models/kenney/` |
| Rigged characters (Mixamo) | 3 | `Michelle.glb`, `RobotExpressive.glb`, `Xbot.glb` |
| **Total existing GLBs** | **~2,448** | `underworld/web/public/models/` |

**Already implemented:**
- UE5 C++ runtime at contract-v2 parity (scene-state polling, minion AI, god-verbs, pixel streaming scaffold)
- Deterministic world layout generator (`world_layout.py`)
- Scene-state contract consumed by both WebGL and UE5
- Tripo3D batch generator pipeline (`assets/tripo/`)
- Higgsfield 2D media pipeline (`scripts/render_higgsfield_master_pack.py`)

**The project is not empty. It is 60–70% asset-covered and 80% code-covered for a vertical slice.**

---

## 3. Remaining gaps to playable

### 3D asset gaps
| Category | Needed | Existing | Strategy |
|----------|-------:|---------:|----------|
| Characters / minions | 100–200 | ~12 Kenney + 3 Mixamo | MetaHuman + procedural outfit variants |
| Buildings / city blocks | 500–800 | ~200+ modular pieces | Procedural city blocks + KitBash/Fab kits |
| Vehicles | 100–200 | 81 meshes | Purchase vehicle packs / Tripo generation |
| Furniture / interior props | 800–1,000 | 237+ | Kenney/Quaternius/Poly Haven + Tripo fill |
| Hero / unique props | 200–400 | ~100 | Tripo3D/Meshy/Rodin generation |
| Environment / nature | 400–600 | 200+ | Quixel Megascans starter + Poly Haven + PCG scatter |
| Background clutter | 300–500 | 500+ | Already largely covered |

### System gaps
- Enterable building interiors
- Combat/economy player-facing mechanics
- Quest/saga mission system
- Multiplayer sync
- Audio (SFX, ambience, music, voice)
- Full UE5 Editor import, level build, packaging, GPU deployment

---

## 4. Credit & cost breakdown

### Higgsfield (images/video)
- Already spent: ~584/800 credits
- Remaining: ~216 credits
- Recommendation: burn remaining on more gameplay/event videos and character portraits
- **For a full promo library:** 2,000–3,000 Higgsfield credits would cover every era/biome/guild/emotion/situation + 100+ videos

### Tripo3D (3D meshes)
- Existing: 677 Tripo designs already generated
- Master plan backlog: ~840 base meshes total → **~163 remaining base meshes**
- At ~25 credits/model: **~4,075 Tripo credits**
- For 2,500+ final objects via modularity: generate **~500–800 additional hero/base meshes**
- Total additional Tripo needed: **~12,500–20,000 credits**
- Cost: **~$500–$1,600** depending on plan

### Free/CC0 assets
- Kenney, Quaternius, Poly Haven, Quixel Megascans starter pack, Fab free monthly packs
- Can fill 1,000+ props/furniture/nature slots at $0

### Paid packs (recommended)
- Epic Fab city/vehicle packs during sales: **$1,000–$3,000**
- KitBash3D city kits (often free on Fab): **$0–$2,000**

### Infrastructure
- GPU workstation / cloud for UE5 Editor + Pixel Streaming: **$500–$2,000/month**
- Storage, CI, CDN: **$100–$500/month**

### TOTAL TO PLAYABLE VERTICAL SLICE
- **Minimum:** $2,000–$5,000 (lean on free assets + Tripo + existing GLBs)
- **Recommended:** $8,000–$15,000 (targeted paid packs + more Tripo + 1 contractor month)
- **AA polish:** $30,000–$60,000 (dedicated artist + high-end packs)

---

## 5. Step-by-step execution plan

### Phase 0: Foundation (1–2 weeks) — can do from sandbox
1. ✅ Complete Higgsfield media library (in progress)
2. Download all Higgsfield media from CDN to local storage
3. Run `assets/tripo/generate.py --estimate` for exact remaining Tripo cost
4. Audit existing 2,448 GLBs for corruption and categorize
5. Generate LOD/Draco-compressed web variants
6. Update `asset_catalog.json` with all existing assets

### Phase 1: Asset production (4–8 weeks) — needs Tripo credits
1. Generate remaining ~163 base meshes via Tripo3D (4,000 credits)
2. Generate 200–400 additional hero props via Tripo/Meshy/Rodin
3. Download and integrate free CC0 packs (Kenney, Quaternius, Poly Haven)
4. Purchase/claim Fab city + vehicle packs
5. Build procedural city-block generator (Blender Geometry Nodes or UE5 PCG)
6. Create MetaHuman base + outfit variants for minions

### Phase 2: UE5 integration (4–6 weeks) — needs Editor + GPU box
1. Run `Scripts/import_glbs.py` commandlet to import all 2,500+ GLBs with Nanite
2. Build `/Game/Maps/Underworld` level with landscape/water/city
3. Place `BP_WorldManager`, configure minion classes
4. Rig `BP_Minion` with MetaHuman/AnimBP
5. Author UMG HUD widget
6. Package Linux Shipping
7. Deploy to Vulkan+NVENC GPU box for Pixel Streaming

### Phase 3: Gameplay systems (6–12 weeks)
1. Enterable building interiors
2. Player-facing market/economy UI
3. Combat/conflict mechanics
4. Saga/quest mission system
5. Audio integration
6. Save/load & rewind

### Phase 4: Polish & ship (4–8 weeks)
1. Performance optimization
2. UI/UX polish
3. Pixel Streaming scaling
4. QA & bug fixing
5. Trailer/marketing using the Higgsfield media library

**Total timeline to playable vertical slice:** 4–6 months with focused effort and budget.

---

## 6. What I can do from this sandbox right now

✅ Generate all Higgsfield media (already doing)  
✅ Prepare UE5 import manifests and commandlet scripts  
✅ Generate Tripo prompts and batch scripts (needs Tripo API key)  
✅ Build procedural generation helpers  
✅ Write integration docs and asset placement maps  
✅ Run validation, linting, tests  

❌ Run Unreal Editor (needs Windows/Linux GUI or GPU workstation)  
❌ Run Pixel Streaming (needs Vulkan+NVENC GPU box)  
❌ Generate Tripo meshes without Tripo API credits  
❌ Hire artists or purchase packs without budget  

---

## 7. Immediate decision needed

To proceed non-stop toward playable, tell me:

1. **Budget for 3D:** How much can you spend? ($2k/$5k/$10k/$50k+)
2. **Tripo credits:** Do you have a Tripo3D API key/credits, or should I research the cheapest plan?
3. **GPU access:** Do you have a Windows/Linux workstation with GPU, or a cloud budget for GPU instances?
4. **Scope priority:** Vertical slice first (one era/biome playable) or full 8×8 matrix?

Once you answer, I will:
- Generate the exact Tripo batch script for your budget
- Create the UE5 import/run manifest
- Start generating 3D assets non-stop
- Build the procedural city pipeline
- Update this document with live progress

---

## 8. Files created/updated in this process

- `underworld/docs/HIGGSFIELD_RENDER_MASTER_PLAN.md`
- `underworld/docs/UE5_MEDIA_INTEGRATION_MANIFEST.md`
- `underworld/docs/UNDERWORLD_BLIZZARD_LEVEL_PRODUCTION_PLAN.md` (this file)
- `underworld/scripts/render_higgsfield_master_pack.py`
- `underworld/scripts/render_higgsfield_round2.py`
- `underworld/data/media_assets/higgsfield_master_manifest.json`
