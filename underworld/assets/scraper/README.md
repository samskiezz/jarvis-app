# Underworld asset scraper (Scrapy) — license-aware CC0/CC art library

Pulls free, **CC0/CC-licensed** 3D models, HDRIs, textures and images for
rendering the world (and future worlds the Minions build). Every asset is
license-gated and attributed; nothing non-free enters the library.

> Honest scale note: there are **not millions of free GLBs** in existence —
> across all CC sources combined it's tens of thousands of models + far more
> textures/HDRIs, and (via Openverse/Wikimedia) millions of *images*. This
> scraper pulls the real, usable, legally-clean subset.

## Sources (live, verified)
- **Polyhaven** — CC0 models, HDRI skies, textures (`spiders/polyhaven.py`)
- **ambientCG** — CC0 PBR materials/textures (`spiders/ambientcg.py`)
- (extend: Openverse/Wikimedia for CC images, Quaternius/Kenney CC0 packs)

## Run
```bash
pip install scrapy
cd underworld/assets/scraper

# small sample
scrapy crawl polyhaven -a kinds=hdris,models -s CLOSESPIDER_ITEMCOUNT=8
scrapy crawl ambientcg -a limit=20 -s CLOSESPIDER_ITEMCOUNT=20

# full pull (raise/remove the cap; runs politely via AutoThrottle + robots.txt)
scrapy crawl polyhaven -a kinds=models,hdris,textures -s CLOSESPIDER_ITEMCOUNT=100000
```

## Output
- Files: `underworld/web/public/models/scraped/<source>/<kind>/<id>.<ext>`
  (served statically by the web app at `/models/scraped/...`)
- Manifest: `.../scraped/assets_manifest.json` — `{key: {path, kind, category,
  licence, attribution, sha256, bytes}}`. Deduped by content hash.

## How the renderers consume it
The WebGL scene and UE5 client read `assets_manifest.json` to pick real assets
by `kind`/`category` for buildings, props, HDRI skies and material splats — so a
world (and changes Minions make) can be dressed from the scraped library instead
of only the bundled Kenney kit.

## Compliance
- `ROBOTSTXT_OBEY=True`, AutoThrottle, identifying User-Agent.
- Only `ALLOWED_LICENCES` (CC0/CC-BY/CC-BY-SA) are kept; others dropped.
- Attribution + source page recorded per asset for credit screens.
