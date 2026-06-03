"""Download pipeline — licence-gate, fetch, dedupe, and manifest every asset.

Each accepted item is downloaded to ASSET_OUT_DIR/<source>/<kind>/<id><ext>,
deduped by SHA-256, and appended to a JSON manifest the renderer reads. Items
whose licence isn't in ALLOWED_LICENCES are dropped — the library stays clean.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

from scrapy.exceptions import DropItem


class AssetDownloadPipeline:
    def open_spider(self, spider):
        s = spider.settings
        self.allowed = set(s.getlist("ALLOWED_LICENCES") or s.get("ALLOWED_LICENCES", []))
        self.out_dir = Path(s.get("ASSET_OUT_DIR")).resolve()
        self.manifest_path = Path(s.get("ASSET_MANIFEST")).resolve()
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.ua = s.get("USER_AGENT")
        self.manifest: dict[str, dict] = {}
        self.hashes: set[str] = set()
        if self.manifest_path.exists():
            try:
                self.manifest = json.loads(self.manifest_path.read_text())
                self.hashes = {v.get("sha256") for v in self.manifest.values() if v.get("sha256")}
            except Exception:
                self.manifest = {}
        self.downloaded = 0

    def close_spider(self, spider):
        self.manifest_path.write_text(json.dumps(self.manifest, indent=2))
        spider.logger.info(
            f"manifest: {len(self.manifest)} assets total, +{self.downloaded} this run "
            f"-> {self.manifest_path}")

    def process_item(self, item, spider):
        lic = (item.get("licence") or "").upper().replace("CC0", "CC0")
        if lic not in self.allowed:
            raise DropItem(f"licence not allowed: {lic}")
        url = item.get("file_url")
        if not url:
            raise DropItem("no file_url")

        ext = os.path.splitext(url.split("?")[0])[1] or ".bin"
        sub = self.out_dir / item["source"] / item["kind"]
        sub.mkdir(parents=True, exist_ok=True)
        dest = sub / f"{item['asset_id']}{ext}"
        key = f"{item['source']}:{item['asset_id']}"

        if key in self.manifest and dest.exists():
            return item  # already have it

        try:
            data = urlopen(Request(url, headers={"User-Agent": self.ua}), timeout=60).read()
        except Exception as exc:
            raise DropItem(f"download failed {url}: {exc}")

        digest = hashlib.sha256(data).hexdigest()
        if digest in self.hashes:
            raise DropItem("duplicate content")
        dest.write_bytes(data)
        self.hashes.add(digest)
        self.downloaded += 1

        rel = dest.relative_to(self.out_dir.parents[0])  # path under /models/
        self.manifest[key] = {
            "asset_id": item["asset_id"], "source": item["source"],
            "kind": item["kind"], "category": item.get("category", ""),
            "name": item.get("name", item["asset_id"]),
            "path": f"/models/{rel.as_posix().split('/models/')[-1] if '/models/' in rel.as_posix() else rel.as_posix()}",
            "licence": lic, "attribution": item.get("attribution", ""),
            "source_page": item.get("source_page", ""),
            "sha256": digest, "bytes": len(data),
        }
        return item
