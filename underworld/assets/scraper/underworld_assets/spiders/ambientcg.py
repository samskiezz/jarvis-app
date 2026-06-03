"""ambientCG — thousands of CC0 PBR materials/textures (real public API v2).

Pulls material texture sets (CC0) for terrain, buildings and props. Each item is
a downloadable zip of PBR maps at the requested resolution.

  scrapy crawl ambientcg -s CLOSESPIDER_ITEMCOUNT=8
"""
import json
import scrapy

from underworld_assets.items import AssetItem

API = "https://ambientcg.com/api/v2/full_json"


class AmbientCGSpider(scrapy.Spider):
    name = "ambientcg"
    allowed_domains = ["ambientcg.com"]

    def __init__(self, res="1K-JPG", asset_type="Material", limit=200, *a, **kw):
        super().__init__(*a, **kw)
        self.res = res
        self.asset_type = asset_type
        self.limit = int(limit)

    async def start(self):
        url = (f"{API}?type={self.asset_type}&include=downloadData"
               f"&limit={self.limit}&sort=Popular")
        yield scrapy.Request(url, self.parse)

    def start_requests(self):  # back-compat (<2.13)
        url = (f"{API}?type={self.asset_type}&include=downloadData"
               f"&limit={self.limit}&sort=Popular")
        yield scrapy.Request(url, self.parse)

    def parse(self, response):
        data = json.loads(response.text)
        for asset in data.get("foundAssets", []):
            aid = asset.get("assetId")
            dl = asset.get("downloadFolders", {}).get("default", {}).get("downloadFiletypeCategories", {})
            zips = dl.get("zip", {}).get("downloads", [])
            url = None
            for z in zips:
                if self.res in (z.get("attribute") or ""):
                    url = z.get("downloadLink"); break
            if not url and zips:
                url = zips[0].get("downloadLink")
            if url:
                yield AssetItem(
                    asset_id=aid, source="ambientcg", kind="texture",
                    category="material", name=aid, file_url=url, extra_urls=[],
                    licence="CC0", attribution="ambientCG (CC0)",
                    source_page=f"https://ambientcg.com/view?id={aid}")
