"""Polyhaven — fully CC0 models, HDRIs and textures (real public API).

Walks the asset catalogue, resolves each asset's downloadable files, and yields
licence-tagged items. Polyhaven is CC0 across the board, so everything here is
free to use in the simulation with attribution recorded as courtesy.

Run a small sample:
  scrapy crawl polyhaven -s CLOSESPIDER_ITEMCOUNT=8
Full models pull:
  scrapy crawl polyhaven -a kinds=models -s CLOSESPIDER_ITEMCOUNT=100000
"""
import json
import scrapy

from underworld_assets.items import AssetItem

API = "https://api.polyhaven.com"


class PolyhavenSpider(scrapy.Spider):
    name = "polyhaven"
    allowed_domains = ["polyhaven.com", "polyhaven.org"]

    def __init__(self, kinds="models,hdris", res="1k", *a, **kw):
        super().__init__(*a, **kw)
        self.kinds = [k.strip() for k in kinds.split(",") if k.strip()]
        self.res = res

    async def start(self):
        type_map = {"models": "models", "hdris": "hdris", "textures": "textures"}
        for k in self.kinds:
            t = type_map.get(k)
            if t:
                yield scrapy.Request(f"{API}/assets?type={t}", self.parse_catalog,
                                     cb_kwargs={"kind": k})

    # Back-compat for older Scrapy (<2.13) that still calls start_requests.
    def start_requests(self):
        type_map = {"models": "models", "hdris": "hdris", "textures": "textures"}
        for k in self.kinds:
            t = type_map.get(k)
            if t:
                yield scrapy.Request(f"{API}/assets?type={t}", self.parse_catalog,
                                     cb_kwargs={"kind": k})

    def parse_catalog(self, response, kind):
        catalog = json.loads(response.text)
        for asset_id, meta in catalog.items():
            yield scrapy.Request(
                f"{API}/files/{asset_id}", self.parse_files,
                cb_kwargs={"asset_id": asset_id, "kind": kind, "meta": meta})

    def parse_files(self, response, asset_id, kind, meta):
        files = json.loads(response.text)
        authors = ", ".join((meta.get("authors") or {}).keys()) or "Poly Haven"
        cats = (meta.get("categories") or [])
        base = dict(
            asset_id=asset_id, source="polyhaven", name=meta.get("name", asset_id),
            category=cats[0] if cats else kind, licence="CC0",
            attribution=f"{authors} (Poly Haven, CC0)",
            source_page=f"https://polyhaven.com/a/{asset_id}",
        )
        if kind == "hdris":
            node = (files.get("hdri") or {}).get(self.res) or {}
            url = (node.get("hdr") or node.get("exr") or {}).get("url")
            if url:
                yield AssetItem(**base, kind="hdri", file_url=url, extra_urls=[])
        else:  # models / textures -> glTF
            gltf = (files.get("gltf") or {}).get(self.res) or {}
            g = gltf.get("gltf") or {}
            if g.get("url"):
                tex = [v.get("url") for v in (g.get("include") or {}).values() if v.get("url")]
                yield AssetItem(**base, kind="model" if kind == "models" else "texture",
                                file_url=g["url"], extra_urls=tex)
