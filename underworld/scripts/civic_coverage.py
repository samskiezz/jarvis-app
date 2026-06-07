#!/usr/bin/env python3
"""Print civic-building coverage against the real asset catalog — the honest gaps list.

  python3 underworld/scripts/civic_coverage.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../underworld
sys.path.insert(0, os.path.dirname(ROOT))  # repo root so `underworld.server...` imports

from underworld.server.services import civic_assets as ca  # noqa: E402

CATALOG = os.path.join(ROOT, "web", "public", "models", "asset_catalog.json")


def main():
    catalog = json.load(open(CATALOG))
    cov = ca.civic_coverage(catalog)
    res = ca.resolve_civic(catalog)
    print(f"civic types: {cov['total_types']}   "
          f"covered: {len(cov['covered'])}   "
          f"fallback: {len(cov['fallback'])}   "
          f"missing: {len(cov['missing'])}\n")
    for t in sorted(res):
        v = res[t]
        mark = {"covered": "OK  ", "fallback": "~   ", "missing": "MISS"}[v["status"]]
        ex = os.path.basename(v["glbs"][0]) if v["glbs"] else "-"
        print(f"  [{mark}] {t:14s} via {v['via']:22s} ({len(v['glbs']):3d})  e.g. {ex}")
    print("\nAUTHOR NEXT (fallback=stand-in, missing=nothing):")
    print("  " + ", ".join(cov["author_next"]) if cov["author_next"] else "  (none — full coverage)")


if __name__ == "__main__":
    main()
