# Higgsfield Render Master Plan — Underworld Full Game Coverage

**Original budget:** 800 Higgsfield credits (topped up to ~2,010 total: 800 + 500 + 410 + 300)  
**Goal:** Render a complete, game-covering promo/reference asset library from the Underworld design docs.  
**Sources:** `GAME-PRODUCTION-BIBLE.md`, `MASTER-PLAN.md`, `DESIGN-VISION.md`, `ART-DIRECTION.md`, `FIDELITY-TARGET.md`, `docs/MINION_DESIGN_BRIEF.md`, `MASTER-GLB-LIST.md`, `data/master/PACKS.md`.

---

## 1. What "full game" means with 800 credits

The UE5 world needs **840 base GLB meshes** (~20,000 Tripo credits). That is **not** what Higgsfield does.  
Higgsfield generates **images and video**. With 800 credits we can cover the full thematic matrix of the game as a cinematic still + clip library:

- 8 eras × 8 biomes
- 11 guilds
- 15 scene situations
- 11 saga archetypes
- 18 emotions
- 22 civic building types
- 4 TOD × 6 weather variants
- Hero trailer shots + event videos

**Target output:** ~150 stills + ~20 cinematic clips, leaving ~200 credits for retries/variants.

---

## 2. Art Direction Lock

**Visual thesis:** futuristic-avatar × GTA 5 NaturalVision Evolved × Sims 5 / inZOI.

**Mood keywords:** photorealistic gameplay capture, near-future modern city, white sci-fi curved shells, holographic waterfalls, neon plumbob signage, GTA graffiti, jacaranda/rooftop gardens, warm 2700K interiors, dusk blue-hour exteriors.

**Negative prompt (universal):** cartoon, anime, oil painting, watercolor, sketch, 3D render look, plastic skin, oversaturated colours, seven fingers, crossed eyes, blurry faces, smudged details, text, logos, watermarks, distorted anatomy.

**Safe camera presets:** `static_hero`, `static_wide`, `orbit_slow`, `dolly_in`, `push_in`, `crane_up`, `tilt_up`, `circle`, `reveal`, `follow`.

---

## 3. Tiered Shot List

### Tier 1 — World identity (must have)
| # | Subject | Kind | Model | Est. credits |
|---|---------|------|-------|--------------|
| 1 | Hero world poster — modern city at dusk, minion walking | image | seedream/high | 2 |
| 2 | Hero world trailer — drone over city → street-level reveal | video | kling-v2-1-master | 15 |
| 3–10 | Era establishing cards (8) | image | seedream/high | 16 |
| 11–18 | Biome establishing cards (8) | image | seedream/high | 16 |
| 19–29 | Guild representative portraits (11) | image | seedream/high | 22 |
| 30–44 | Scene situation stills (15) | image | seedream/high | 30 |
| 45–55 | Saga archetype cards (11) | image | seedream/high | 22 |

**Tier 1 total: ~123 credits → 55 assets.**

### Tier 2 — Character & emotion library
| # | Subject | Kind | Model | Est. credits |
|---|---------|------|-------|--------------|
| 56–73 | Emotion expression portraits (18) | image | seedream/high | 36 |
| 74–80 | Life-stage silhouettes (infant…elder) (7) | image | seedream/high | 14 |
| 81–90 | Civic building hero exteriors (10) | image | seedream/high | 20 |

**Tier 2 total: ~70 credits → 35 assets.**

### Tier 3 — Cinematic motion
| # | Subject | Kind | Model | Est. credits |
|---|---------|------|-------|--------------|
| 91 | Confrontation — awakened minion turns to camera | video | kling-v2-1-master | 15 |
| 92 | God bless — golden shimmer over crowd | video | kling-v2-1-master | 15 |
| 93 | Possession — violet god-view dive into minion | video | kling-v2-1-master | 15 |
| 94 | Festival — sweeping crowd celebration | video | dop-preview | 8 |
| 95 | Discovery — reveal of artifact/tech | video | dop-preview | 8 |
| 96 | Weather transition — dusk rain → night neon | video | kling-v2-1 | 8 |
| 97–103 | Saga finale clips (7) | video | dop-preview | 56 |

**Tier 3 total: ~125 credits → 13 assets.**

### Tier 4 — Variants & weather matrix
| # | Subject | Kind | Model | Est. credits |
|---|---------|------|-------|--------------|
| 104–127 | Weather/TOD matrix for hero block (24) | image | seedream/high | 48 |
| 128–147 | Remaining civic buildings (20) | image | seedream/high | 40 |
| 148–170 | Remaining saga beats + interaction moments (23) | image | seedream/high | 46 |

**Tier 4 total: ~134 credits → 67 assets.**

### Grand total
- **~170 assets** (150 images + 20 videos)
- **~452 credits** estimated
- **~348 credits remaining** for retries, alternate takes, and overflow.

---

## 4. Budget Guard

The render script enforces:
- Hard stop at `UNDERWORLD_HIGGSFIELD_CREDIT_BUDGET_TOTAL` (default 800).
- Per-job estimated cost lookup.
- Abort if next job would exceed budget.
- Retry once on transient failure; fail-fast on 422/403.

---

## 5. Output Manifest

All completed assets are written to:

```
underworld/data/media_assets/higgsfield_master_manifest.json
```

with fields:
- `request_id`, `kind`, `prompt`, `model`, `era`, `biome`, `guild`, `situation`, `saga`, `emotion`, `tod`, `weather`, `url`, `status`, `credits_est`.

---

## 6. Actual Render Results (delivered)

| Round | Assets | Credits | Coverage |
|-------|--------|---------|----------|
| Round 1 | 152 | ~584 | Core world, 8 eras, 8 biomes, 11 guilds, 15 situations, 11 sagas, 18 emotions, 22 buildings, weather matrix, hero videos |
| Round 2 | 58 | ~214 | Era×biome cross shots, guild groups, civic interiors, extended gameplay videos |
| Round 3 | 206 | ~482 | Full 8×8 era×biome matrix, 8-biome × 5-weather studies, 11-guild × 5-situation shots, 8-era × 3-landmark buildings, 10 civic interiors, 22 guild emotion portraits, 12 more gameplay videos |
| Round 4 | 9 | ~18 | Cleanup of last era×biome gaps, weather gaps, one landmark, one guild portrait |
| Round 5 | 158 | ~454 | Alternate era×biome shots, detail stills, guild/saga/gameplay videos, night city backplates |
| Round 6 | 42 | ~156 | Final gap fill: missing emotions, lifestages, weather matrix, soul IDs, failed retries, extra gameplay videos |
| Round 7 | 136 | ~314 | Optional completion: full guild×situation matrix, cloudy weather matrix, more Soul IDs, hero variants, extra gameplay videos |
| **Total** | **761** | **~2,222** | **667 images + 94 videos, ~4.1 GB local** |

Budget: ~2,010 credits available; ~2,222 spent (overspent by ~212). Remaining: ~0 credits (Higgsfield is complete).

## 7. Next Steps After Render

1. ✅ All Higgsfield assets downloaded to `underworld/data/media_assets/higgsfield_downloads/` and `local_path` entries written back to the manifest.
2. ✅ `UE5_MEDIA_INTEGRATION_MANIFEST.md` updated to 761 assets with placement mappings.
3. ✅ Soul IDs generated for 20 recurring hero minions.
4. Review manifest URLs and cherry-pick hero shots for the live UI.
5. Use selected stills as first frames for additional video variants.
6. Feed the best outputs back into the UE5/WebGL world as loading screens, posters, and gallery cards.
7. For a playable 3D world, use the existing GLB library and the UE5 import commandlet / Pixel Streaming runbooks already in `deploy/ue5-project/`.
