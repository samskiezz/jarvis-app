# Underworld Minions — Art Direction: **Futuristic-Avatar × GTA 5 × Sims**

The visual north star (from the "Harmony Heights" reference set): a **near-future modern
city** that fuses three looks into one coherent style. Every GLB in the master BOM
(`data/master/glb_bom.csv`) should be authored to this language so the world reads as one
place, not a kit-bash.

## The blend
- **Futuristic / Avatar** — sleek **white sci-fi curved shells**, chrome rims, **saucer/disc
  rooftop pads**, soft cyan/teal glow lines, **holographic waterfalls** and floating UI,
  bioluminescent accents, lush bioluminescent flora (Avatar billboards in-world).
- **GTA 5** — grounded **modern urban realism**: brick + concrete + glass mid-rises, street
  grime, **graffiti walls** ("Liberty City"), neon shop signage, dense street furniture,
  real traffic, believable wear and weathering.
- **Sims** — **warm, inviting, readable interiors**, friendly silhouettes, the **neon plumbob**
  motif on signage, rooftop gardens, cozy lighting, clean buy-mode-style objects.

## Signature elements (use as recurring motifs)
- White curved sci-fi towers with a **disc/saucer crown** + antenna mast
- **Holographic waterfall** features cascading down terraces
- **Jacaranda / purple-bloom trees** and **green rooftop gardens** with hanging vines
- **Neon signage**: plumbob green, electric cyan, magenta — "LIVE YOUR STORY / SHAPE YOUR WORLD"
- **Avatar-style billboards** + **GTA graffiti** murals on the same block
- Glass balconies, warm interior window glow at dusk, holographic storefront displays
- Mixed materials per building: brick base → concrete mid → glass+white-composite top

## Palette & lighting
- Base neutrals: warm concrete grey, charcoal brick, off-white composite
- Accents: **cyan/teal glow**, **plumbob green**, magenta neon, jacaranda purple
- Lighting: dusk/blue-hour default; warm 2700K interiors; emissive neon + holo cyan;
  Lumen GI, soft volumetrics, gentle bloom on emissives

## Build rules for every GLB
- PBR metal/rough, real-world scale (1 unit = 1 m), Nanite-ready, clean LODs
- Modern-era default skin; the era axis (stone→future) is a *variant*, not the default
- Hero buildings get the full futuristic treatment; background fills stay simpler but on-palette
- Emissive channels authored for neon/holo so they glow under Lumen

## How this maps to the asset list
- `style` axis includes `modern / contemporary / minimalist / industrial / scandi / luxury`
  — but the **default city skin is "modern" in this futuristic-avatar dressing**.
- `building` domain → apply the white-curve + disc-crown + rooftop-garden + neon-sign motifs.
- `urban` domain (signage, billboards, holo-displays, street furniture) carries most of the
  GTA5+Avatar flavour — prioritise it.
- `nature` domain → include jacaranda/purple-bloom + bioluminescent variants.
- `sky` domain → holo-aurora, neon dusk, the Avatar-style glowing night.

*Reference images supplied by the operator (Harmony Heights concept). Treat them as the
canonical mood for the default/modern skin across all four asset packs (see PACKS.md).*
