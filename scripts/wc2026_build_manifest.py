#!/usr/bin/env python3
"""WC2026 build manifest — enumerates every wc2026_* component.

Output: /opt/jarvis-app-1/server/data/wc2026_BUILD_MANIFEST.json

Components captured:
  - Python scripts under scripts/wc2026_*.py
  - Data files under server/data/wc2026_*.{json,csv,db}
  - HTML dashboard server/wc2026_predictions.html
  - Cron entries from scripts/wc2026_cron.txt
  - Wasabi snapshot count (best-effort, tolerates auth/network failure)

Each component gets: name, type, size_bytes, mtime (ISO-Z), lines, purpose.
"""

from __future__ import annotations

import glob
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path("/opt/jarvis-app-1")
SCRIPTS_DIR = REPO_ROOT / "scripts"
DATA_DIR = REPO_ROOT / "server" / "data"
HTML_PATH = REPO_ROOT / "server" / "wc2026_predictions.html"
CRON_PATH = SCRIPTS_DIR / "wc2026_cron.txt"
ENV_SECRETS = REPO_ROOT / ".env.secrets"
OUT_PATH = DATA_DIR / "wc2026_BUILD_MANIFEST.json"

# Short purpose blurbs — kept declarative so manifest stays grep-friendly.
PURPOSES: dict[str, str] = {
    "wc2026_predictor.py": "Elo + bivariate Poisson ensemble predictor",
    "wc2026_fetch_results.py": "Live result fetcher (5-min cadence)",
    "wc2026_lineup_hook.py": "Confirmed-lineup probe within 90 min of kickoff",
    "wc2026_odds_scraper.py": "Bookmaker odds + value-bet flagger",
    "wc2026_player_profiles.py": "Per-player profile builder (LLM-assisted)",
    "wc2026_player_profiles_enriched.json": "Enriched player profile artefact",
    "wc2026_enrich_profiles.py": "Player profile enrichment pass",
    "wc2026_historical_data.py": "Historical training-set refresh",
    "wc2026_llm_features.py": "LLM-derived feature extractor",
    "wc2026_llm_predictor.py": "LLM-side predictor (complement to numeric model)",
    "wc2026_match_details.py": "Per-match detail expander",
    "wc2026_backtest_30k.py": "30K-match backtest harness",
    "wc2026_build_manifest.py": "This manifest builder",
    "wc2026_wasabi_backup.py": "Hourly Wasabi snapshot uploader",
    "wc2026_fixtures_all.json": "All WC2026 fixtures (group + knockout)",
    "wc2026_results.json": "Live match results (polled by UI)",
    "wc2026_model_predictions.json": "Numeric ensemble predictions",
    "wc2026_llm_predictions.json": "LLM-side predictions",
    "wc2026_llm_features.json": "LLM-extracted features",
    "wc2026_player_profiles.json": "Player profile data",
    "wc2026_value_bets.json": "Value-bet flags vs bookmaker odds",
    "wc2026_training_history.csv": "Training-history CSV",
    "wc2026_predictions.html": "Public WC2026 predictions dashboard",
    "wc2026_cron.txt": "Cron schedule (predictor + fetch + odds + profiles)",
    "wc2026_predictions.db": "SQLite audit DB (per-prediction history)",
}


def iso_mtime(p: Path) -> str:
    return datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def line_count(p: Path) -> int:
    try:
        with p.open("rb") as f:
            return sum(1 for _ in f)
    except OSError:
        return 0


def component(path: Path, ctype: str) -> dict:
    return {
        "name": path.name,
        "type": ctype,
        "path": str(path.relative_to(REPO_ROOT)),
        "size_bytes": path.stat().st_size,
        "mtime": iso_mtime(path),
        "lines": line_count(path) if path.suffix in {".py", ".html", ".csv", ".txt", ".json"} else 0,
        "purpose": PURPOSES.get(path.name, ""),
    }


def collect_scripts() -> list[dict]:
    return [
        component(Path(p), "script")
        for p in sorted(glob.glob(str(SCRIPTS_DIR / "wc2026_*.py")))
        if Path(p).is_file()
    ]


def collect_data() -> list[dict]:
    paths: list[str] = []
    for pat in ("wc2026_*.json", "wc2026_*.csv", "wc2026_*.db"):
        paths.extend(glob.glob(str(DATA_DIR / pat)))
    out: list[dict] = []
    for p in sorted(set(paths)):
        pth = Path(p)
        if pth.is_file() and pth.name != OUT_PATH.name:
            out.append(component(pth, "data"))
    return out


def collect_html() -> list[dict]:
    if HTML_PATH.is_file():
        return [component(HTML_PATH, "html")]
    return []


def collect_cron() -> list[dict]:
    if not CRON_PATH.is_file():
        return []
    entries: list[dict] = []
    try:
        for raw in CRON_PATH.read_text().splitlines():
            s = raw.strip()
            if not s or s.startswith("#"):
                continue
            # cron line — keep only the schedule + script tail for the manifest.
            parts = s.split()
            if len(parts) < 6:
                continue
            schedule = " ".join(parts[:5])
            cmd_tail = " ".join(parts[5:])
            # Identify the wc2026 script in the command for purpose lookup.
            script_name = ""
            for tok in parts:
                if tok.endswith(".py") and "wc2026_" in tok:
                    script_name = Path(tok).name
                    break
            entries.append({
                "type": "cron",
                "schedule": schedule,
                "command": cmd_tail,
                "script": script_name,
                "purpose": PURPOSES.get(script_name, ""),
            })
    except OSError:
        pass
    return entries


def collect_wasabi_summary() -> dict:
    summary = {"type": "wasabi", "bucket": "jarvis-wc2026", "snapshots": 0, "status": "unknown"}
    try:
        import boto3
        from botocore.exceptions import ClientError, EndpointConnectionError
    except ImportError:
        summary["status"] = "boto3 missing"
        return summary

    key = secret = None
    if ENV_SECRETS.exists():
        for raw in ENV_SECRETS.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip().strip('"').strip("'")
            if k.strip() == "WASABI_KEY":
                key = v
            elif k.strip() == "WASABI_SECRET":
                secret = v
    if not key or not secret:
        summary["status"] = "no credentials"
        return summary

    try:
        client = boto3.client(
            "s3",
            endpoint_url="https://s3.wasabisys.com",
            aws_access_key_id=key,
            aws_secret_access_key=secret,
            region_name="us-east-1",
        )
        # List up to 1000 snapshot prefixes
        paginator = client.get_paginator("list_objects_v2")
        prefixes: set[str] = set()
        for page in paginator.paginate(Bucket="jarvis-wc2026", Prefix="snapshots/", Delimiter="/"):
            for cp in page.get("CommonPrefixes", []) or []:
                pfx = cp.get("Prefix", "")
                if pfx:
                    prefixes.add(pfx)
        summary["snapshots"] = len(prefixes)
        summary["status"] = "ok"
    except (ClientError, EndpointConnectionError) as e:
        summary["status"] = f"error: {type(e).__name__}"
    except Exception as e:  # pragma: no cover
        summary["status"] = f"error: {type(e).__name__}"
    return summary


def main() -> int:
    components: list[dict] = []
    components.extend(collect_scripts())
    components.extend(collect_data())
    components.extend(collect_html())
    components.extend(collect_cron())
    components.append(collect_wasabi_summary())

    manifest = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "repo_root": str(REPO_ROOT),
        "component_count": len(components),
        "components": components,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(manifest, indent=2, sort_keys=False))
    os.replace(tmp, OUT_PATH)
    print(f"wrote {OUT_PATH} ({len(components)} components)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
