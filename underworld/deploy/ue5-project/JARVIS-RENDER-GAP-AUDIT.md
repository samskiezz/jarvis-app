# JARVIS HUD — Render-Quality Gap Audit ("GTA3 → GTA5" checklist)

The leap from GTA3-class to GTA5-class visuals is not one feature — it's a stack:
**real-time GI + ray tracing → physically-based film grade → volumetrics → motion/life → post-FX polish → delivery quality.**
This audits our actual `DefaultEngine.ini` + `JarvisHUD.umap` against that stack.

## ✅ ALREADY IN (verified in config/level)
| Feature | Where |
|---|---|
| Lumen dynamic GI + Lumen reflections | `r.DynamicGlobalIlluminationMethod=1`, `r.ReflectionMethod=1` |
| Hardware ray tracing + RT shadows | `r.RayTracing=True`, `r.RayTracing.Shadows=True`, `r.Lumen.HardwareRayTracing=True` |
| Nanite virtualized geometry (on all 48 GLBs) | `r.Nanite.ProjectEnabled=True` + per-mesh enable at import |
| Virtual Shadow Maps | `r.Shadow.Virtual.Enable=1` |
| TSR anti-aliasing (best-in-class for streams) | `r.AntiAliasingMethod=4` |
| Bloom + AO + mesh distance fields | `r.DefaultFeature.*`, `r.GenerateMeshDistanceFields` |
| Sky atmosphere + height fog + key light + skylight | authored in JarvisHUD.umap |
| 1080p60 H.264 NVENC Pixel Stream (20 Mbps cap) | `PixelStreamingWebRTCFps=60` |

## ❌ GAPS FOUND → FIXES (the list you asked for)

### Tier 1 — film grade & light transport (biggest visual payoff)
1. **No PostProcessVolume in the level.** This is the single largest gap — it carries the entire
   "cinematic grade": filmic tonemap tuning, bloom shape, vignette, chromatic aberration,
   lens flares, color grading, local exposure. → *level patch: unbound PPV with JARVIS grade.*
2. **Volumetric fog OFF.** Without `r.VolumetricFog=1` there are no god rays / light shafts —
   the signature holographic-chamber look (light scattering through the holograms). → *config + fog actor `bEnableVolumetricFog`.*
3. **RT translucency OFF.** Our holograms ARE translucent/additive; without
   `r.RayTracing.Translucency` they don't refract/reflect properly. → *config.*
4. **Lumen quality at defaults.** `r.Lumen.Reflections.Quality`, final-gather quality, and
   scene-detail left at medium — visibly noisier GI on emissive-heavy scenes. → *config.*
5. **Contact shadows off** (small-scale grounding of props on the dais). → *per-light `ContactShadowLength` / config.*

### Tier 2 — motion & life (GTA5 worlds MOVE)
6. **Everything is static.** Props spawn and never move; no idle rotation/hover, no camera rail.
   → *JarvisHudManager: slow idle-rotate + hover bob per prop (code patch, re-cook).*
7. **Zero Niagara FX.** The plan called for ambient particle field, data-stream ribbons,
   boot sweep. None exist yet. → *authoring task (next pass).*
8. **No camera DOF / cine camera.** A CineCameraActor with shallow DOF + slow orbit sells scale.
   → *level patch.*

### Tier 3 — delivery & performance
9. **Development cook.** Ship `Shipping` config: strips debug, faster frames. → *`CONFIG=Shipping` re-cook.*
10. **H.264 baseline.** The 4090 NVENC does **AV1/HEVC** at far better quality-per-bit;
    H.264 kept for max browser compat — switch when clients allow. → *runtime flag.*
11. **Fixed exposure already chosen (good for streams)** — keep; add `r.LocalExposure` for HDR-ish pop without flicker.

### Tier 4 — not applicable to this scene (don't waste time)
- World Partition/HLOD streaming, foliage/terrain systems, crowd/traffic sim, weather cycles,
  volumetric clouds — open-world features; the HUD is a single interior chamber.
- MetaHuman — plugin not installed on this engine build (was stripped to fix the cook).

## Order of operations
config fixes (1 min) → level patch + manager motion (re-author) → fast cached re-cook (~5 min)
→ ship → stream → THEN judge what Tier-2 FX to author next against real frames.
