"""ASSET DNA — identity cards for repo assets.

Scans git-tracked files and the feature inventory to build asset cards with
health, risk, and simple dependency/dependent heuristics. Degrades gracefully.
"""
from __future__ import annotations

import csv
import os
import subprocess
import time
from typing import Any, Optional

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
INVENTORY_PATH = os.path.join(ROOT, "docs", "JARVIS_FULL_FEATURE_INVENTORY.csv")


def _git_files(limit: int = 500) -> list[dict[str, Any]]:
    try:
        out = subprocess.run(
            ["git", "ls-files"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=10,
        ).stdout
        files = [f.strip() for f in out.splitlines() if f.strip()][:limit]
        return files
    except Exception:  # noqa: BLE001
        return []


def _inventory_rows(limit: int = 500) -> list[dict[str, str]]:
    try:
        with open(INVENTORY_PATH, encoding="utf-8", newline="") as f:
            return list(csv.DictReader(f))[:limit]
    except Exception:  # noqa: BLE001
        return []


def _file_meta(rel: str) -> dict[str, Any]:
    full = os.path.join(ROOT, rel)
    try:
        st = os.stat(full)
        return {
            "size": st.st_size,
            "mtime": st.st_mtime,
            "age_days": round((time.time() - st.st_mtime) / 86400, 1),
        }
    except Exception:  # noqa: BLE001
        return {"size": 0, "mtime": 0, "age_days": 9999}


def _health(meta: dict[str, Any]) -> str:
    age = meta.get("age_days", 9999)
    size = meta.get("size", 0)
    if age > 365 or size == 0:
        return "stale"
    if age > 90:
        return "warn"
    return "ok"


def _risk(level: str, kind: str, has_inventory: bool) -> str:
    if level == "stale":
        return "high"
    if not has_inventory and kind in ("py", "js", "jsx", "ts", "tsx"):
        return "medium"
    if level == "warn":
        return "medium"
    return "low"


def _deps(rel: str) -> list[str]:
    """Very simple dependency heuristic: imports in Python/JS files."""
    full = os.path.join(ROOT, rel)
    deps: list[str] = []
    try:
        with open(full, encoding="utf-8", errors="ignore") as f:
            txt = f.read()[:50000]
        ext = os.path.splitext(rel)[1].lower()
        if ext == ".py":
            for line in txt.splitlines():
                line = line.strip()
                if line.startswith("import ") or line.startswith("from "):
                    deps.append(line)
        elif ext in (".js", ".jsx", ".ts", ".tsx"):
            for line in txt.splitlines():
                line = line.strip()
                if line.startswith("import ") or line.startswith("require("):
                    deps.append(line)
        return deps[:10]
    except Exception:  # noqa: BLE001
        return []


def _kind(rel: str) -> str:
    ext = os.path.splitext(rel)[1].lower().lstrip(".")
    if not ext:
        return "file"
    return ext


def scan_assets(limit: int = 200) -> list[dict[str, Any]]:
    """Build a merged asset list from git files + inventory rows."""
    files = _git_files(limit * 2)
    rows = _inventory_rows(limit * 2)

    by_id: dict[str, dict[str, Any]] = {}

    # From git files
    for rel in files:
        asset_id = f"file:{rel}"
        meta = _file_meta(rel)
        kind = _kind(rel)
        health = _health(meta)
        asset = {
            "id": asset_id,
            "name": os.path.basename(rel),
            "path": rel,
            "kind": kind,
            "type": "file",
            "source": "git",
            "meta": meta,
            "health": health,
            "risk": _risk(health, kind, False),
            "deps": _deps(rel),
            "dependents": [],
            "inventory": None,
        }
        by_id[asset_id] = asset

    # From inventory
    for row in rows:
        path = row.get("file_path", "").strip()
        name = row.get("name", "").strip() or path
        category = row.get("category", "").strip()
        if not path:
            continue
        asset_id = f"inv:{path}:{name}"
        # Link to file asset if path matches
        file_id = f"file:{path}"
        if file_id in by_id:
            by_id[file_id]["inventory"] = row
            by_id[file_id]["risk"] = "low"
            by_id[file_id]["type"] = category or "feature"
            continue
        by_id[asset_id] = {
            "id": asset_id,
            "name": name,
            "path": path,
            "kind": "feature",
            "type": category or "feature",
            "source": "inventory",
            "meta": {},
            "health": "ok",
            "risk": "low",
            "deps": [],
            "dependents": [],
            "inventory": row,
        }

    return sorted(by_id.values(), key=lambda x: (x["risk"] != "high", x["risk"] != "medium", x["name"]))[:limit]


def _dependents(target_rel: str, files: list[str]) -> list[str]:
    """Find files that mention the target's basename."""
    my_base = os.path.basename(target_rel)
    out: list[str] = []
    for rel in files:
        if rel == target_rel:
            continue
        full = os.path.join(ROOT, rel)
        try:
            with open(full, encoding="utf-8", errors="ignore") as f:
                if my_base in f.read()[:50000]:
                    out.append(rel)
        except Exception:  # noqa: BLE001
            pass
    return out[:10]


def get_asset(asset_id: str) -> Optional[dict[str, Any]]:
    assets = scan_assets(limit=2000)
    for a in assets:
        if a["id"] == asset_id:
            if a.get("source") == "git":
                a["dependents"] = _dependents(a["path"], _git_files(limit=5000))
            return a
    return None


def recommend(asset: dict[str, Any]) -> list[str]:
    recs: list[str] = []
    if asset.get("health") == "stale":
        recs.append("Review stale asset; consider archive or refresh")
    if asset.get("risk") == "high":
        recs.append("High risk — verify before modifying")
    if not asset.get("inventory"):
        recs.append("Not in feature inventory; add metadata")
    if len(asset.get("dependents", [])) == 0 and asset.get("source") == "git":
        recs.append("No known dependents; may be dead code")
    return recs
