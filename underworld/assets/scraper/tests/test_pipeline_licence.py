"""Unit tests for the asset scraper — license gate + spider parsing (no network)."""
import sys, types, json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from underworld_assets.pipelines import AssetDownloadPipeline
from underworld_assets.items import AssetItem
from scrapy.exceptions import DropItem
import pytest


class _Spider:
    class settings:
        @staticmethod
        def getlist(k, d=None): return ["CC0", "CC-BY", "CC-BY-SA"]
        @staticmethod
        def get(k, d=None):
            return {"ALLOWED_LICENCES": ["CC0"], "ASSET_OUT_DIR": "/tmp/uw_assets_test",
                    "ASSET_MANIFEST": "/tmp/uw_assets_test/m.json",
                    "USER_AGENT": "test"}.get(k, d)
    logger = types.SimpleNamespace(info=lambda *a, **k: None)


def _pipe():
    p = AssetDownloadPipeline(); p.open_spider(_Spider()); return p


def test_rejects_disallowed_licence():
    p = _pipe()
    with pytest.raises(DropItem):
        p.process_item(AssetItem(asset_id="x", source="s", kind="model",
                                 licence="CC-BY-NC", file_url="http://e/x.glb"), _Spider())


def test_rejects_missing_url():
    p = _pipe()
    with pytest.raises(DropItem):
        p.process_item(AssetItem(asset_id="x", source="s", kind="model",
                                 licence="CC0", file_url=""), _Spider())


def test_polyhaven_spider_parses_hdri_files():
    from underworld_assets.spiders.polyhaven import PolyhavenSpider
    sp = PolyhavenSpider(kinds="hdris")
    resp = types.SimpleNamespace(text=json.dumps(
        {"hdri": {"1k": {"hdr": {"url": "https://dl.polyhaven.org/x_1k.hdr"}}}}))
    items = list(sp.parse_files(resp, asset_id="x", kind="hdris",
                                meta={"name": "X", "authors": {"Jo": {}}, "categories": ["sky"]}))
    assert items and items[0]["file_url"].endswith(".hdr")
    assert items[0]["licence"] == "CC0" and "Jo" in items[0]["attribution"]


def test_ambientcg_spider_parses_material():
    from underworld_assets.spiders.ambientcg import AmbientCGSpider
    sp = AmbientCGSpider()
    resp = types.SimpleNamespace(text=json.dumps({"foundAssets": [
        {"assetId": "Bricks001", "downloadFolders": {"default": {"downloadFiletypeCategories":
         {"zip": {"downloads": [{"attribute": "1K-JPG", "downloadLink": "https://ambientcg.com/b.zip"}]}}}}}]}))
    items = list(sp.parse(resp))
    assert items[0]["asset_id"] == "Bricks001" and items[0]["licence"] == "CC0"
