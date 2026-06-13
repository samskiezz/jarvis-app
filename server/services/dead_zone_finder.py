"""DEAD ZONE FINDER — scan repo and inventory for stale, duplicate, broken, unused, or overlapping features.

Produces cleanup intelligence, not destructive actions.
"""
from __future__ import annotations

import csv
import os
import re
import subprocess
import time
from collections import Counter, defaultdict
from typing import Any, Optional

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
INVENTORY_PATH = os.path.join(ROOT, "docs", "JARVIS_FULL_FEATURE_INVENTORY.csv")
ROUTES_DIR = os.path.join(ROOT, "server", "routes")


def _git_files(limit: int = 2000) -> list[str]:
    try:
        out = subprocess.run(
            ["git", "ls-files"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=10,
        ).stdout
        return [f.strip() for f in out.splitlines() if f.strip()][:limit]
    except Exception:  # noqa: BLE001
        return []


def _inventory_rows(limit: int = 2000) -> list[dict[str, str]]:
    try:
        with open(INVENTORY_PATH, encoding="utf-8", newline="") as f:
            return list(csv.DictReader(f))[:limit]
    except Exception:  # noqa: BLE001
        return []


def _route_modules() -> list[str]:
    try:
        return [fn for fn in os.listdir(ROUTES_DIR) if fn.endswith(".py") and not fn.startswith("__")]
    except Exception:  # noqa: BLE001
        return []


def _is_stale(mtime: float) -> bool:
    return (time.time() - mtime) > 180 * 86400  # 6 months


def scan(limit: int = 100) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    files = _git_files(limit * 3)
    rows = _inventory_rows(limit * 3)
    routes = _route_modules()

    # Duplicate feature names in inventory
    names = Counter(r.get("name", "").strip() for r in rows if r.get("name"))
    for name, count in names.most_common():
        if count <= 1:
            break
        findings.append({
            "id": f"dup-name:{name}",
            "kind": "duplicate_name",
            "label": f"Duplicate inventory name: {name}",
            "count": count,
            "suggestion": "Consolidate or rename duplicate entries.",
        })

    # Inventory rows whose file_path does not exist
    for row in rows:
        fp = row.get("file_path", "").strip()
        if not fp:
            continue
        rel = fp.replace("server/", "server/")  # keep as-is
        full = os.path.join(ROOT, rel)
        if not os.path.exists(full):
            findings.append({
                "id": f"missing:{fp}",
                "kind": "missing_file",
                "label": f"Inventory points to missing file: {fp}",
                "suggestion": "Update inventory or restore file.",
            })

    # Stale files
    for rel in files:
        if not rel.startswith("server/"):
            continue
        full = os.path.join(ROOT, rel)
        try:
            mtime = os.path.getmtime(full)
        except Exception:  # noqa: BLE001
            continue
        if _is_stale(mtime):
            findings.append({
                "id": f"stale:{rel}",
                "kind": "stale_file",
                "label": f"Stale file: {rel}",
                "age_days": round((time.time() - mtime) / 86400, 1),
                "suggestion": "Review for archival.",
            })

    # Route modules not referenced in inventory
    inventory_files = {r.get("file_path", "").strip() for r in rows}
    for route in routes:
        route_path = f"server/routes/{route}"
        if route_path not in inventory_files:
            findings.append({
                "id": f"uninv:{route}",
                "kind": "untracked_route",
                "label": f"Route not in inventory: {route}",
                "suggestion": "Add to feature inventory or archive.",
            })

    # Overlapping mini apps by keyword
    mini_app_rows = [r for r in rows if r.get("category", "").lower().startswith("mini app")]
    keywords: dict[str, list[str]] = defaultdict(list)
    for r in mini_app_rows:
        name = r.get("name", "").lower()
        for word in re.findall(r"[a-z]+", name):
            if len(word) > 3:
                keywords[word].append(name)
    for word, hits in keywords.items():
        if len(hits) >= 3:
            findings.append({
                "id": f"overlap:{word}",
                "kind": "overlap",
                "label": f"Overlapping mini app keyword: '{word}' ({len(hits)} apps)",
                "suggestion": "Review for consolidation.",
            })

    # Sort by kind severity: missing > stale > untracked > overlap > duplicate
    severity = {"missing_file": 0, "stale_file": 1, "untracked_route": 2, "overlap": 3, "duplicate_name": 4}
    findings.sort(key=lambda x: severity.get(x["kind"], 99))
    return findings[:limit]


def get_finding(finding_id: str) -> Optional[dict[str, Any]]:
    for f in scan(limit=500):
        if f.get("id") == finding_id:
            return f
    return None
