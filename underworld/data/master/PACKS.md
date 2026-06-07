# Underworld Minions — GLB Asset Packs & Cost (Tripo3D credits)
**The real cost basis is Tripo3D credits.** You generate each distinct *base mesh* once (~20-30 credits, textured); swatches/LODs/most styles are derived for ~free. So the full **1:1 world ≈ 840 base meshes ≈ ~20,000 credits** — not artist $/asset.

Art direction (all packs): **futuristic-avatar × GTA5 × Sims** — white sci-fi curves, saucer rooftops, holo-waterfalls, neon plumbob signage, GTA graffiti, jacaranda/rooftop gardens, Avatar billboards (see ART-DIRECTION.md).

| Pack | Base meshes to generate | Tripo credits (~24/gen) | ≈ USD* | GLB variants (derived free) | What you get |
|---|---:|---:|---:|---:|---|
| **Easy** | 714 | ~17,136 (14,280–21,420) | $69–$257 | 1,739 | one version of every object — world fully dressed, no variety |
| **Average** | 840 | ~20,160 (16,800–25,200) | $81–$302 | 13,485 | + a 2nd colourway & all sky/terrain — looks intentional |
| **Medium** | 840 | ~20,160 (16,800–25,200) | $81–$302 | 63,870 | + 3 styles, 4 swatches, near+mid LODs — reads like a real game |
| **Advanced** | 840 | ~20,160 (16,800–25,200) | $81–$302 | 95,405 | **1:1 real life** — every style/swatch/LOD/era/variant, full crowd & city |

*USD is indicative — Tripo plans vary and free daily credits offset a lot if you batch generations over time ("try hard"). Credits are the real unit.*

**Bottom line:** the entire 1:1 world is **840 base-mesh generations ≈ ~20,160 Tripo credits**; the 95,405 total GLBs are derived from them in-pipeline.

## How the 840 → 95,405 expansion works (no extra credits)
- **swatch** (colourway) → recolor/material instance
- **lod0/1/2** → automatic decimation
- **style** (modern/industrial/…) → mostly material+trim swaps; only hero pieces re-gen
- **season** (flora) → texture/tint variant
- **era** (buildings) → material/detail pass
- **swatch on people/vehicles** → outfit/paint material

## Base meshes to generate, by domain (the actual Tripo work)
- interior: 444 base meshes
- nature: 146 base meshes
- sky: 62 base meshes
- urban: 51 base meshes
- building: 50 base meshes
- character: 47 base meshes
- vehicle: 40 base meshes
