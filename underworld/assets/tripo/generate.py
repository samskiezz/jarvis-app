"""Generate the world's HD assets via Tripo3D and fold them into the art library.

Usage (after `export TRIPO3D_API_KEY=tsk_...`):
  python -m underworld.assets.tripo.generate --dry-run        # list what WOULD generate
  python -m underworld.assets.tripo.generate                  # generate all missing
  python -m underworld.assets.tripo.generate --epoch industrial
  python -m underworld.assets.tripo.generate --only home_modern,clock_tower

Writes GLBs to web/public/models/generated/tripo/ and merges records into the
same assets_manifest.json the scraper + renderers use, so generated and scraped
art live in one library. Idempotent: skips ids already in the manifest.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE.parents[1] / "web" / "public" / "models" / "generated" / "tripo"
MANIFEST = HERE.parents[1] / "web" / "public" / "models" / "scraped" / "assets_manifest.json"


def _load_manifest() -> dict:
    if MANIFEST.exists():
        try:
            return json.loads(MANIFEST.read_text())
        except Exception:
            return {}
    return {}


def _save_manifest(m: dict) -> None:
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(m, indent=2))


def main(argv=None) -> int:
    from .design_list import designs_for

    ap = argparse.ArgumentParser()
    ap.add_argument("--epoch", default=None, help="only this epoch tag (+ evergreens)")
    ap.add_argument("--phase", default=None, help="only this build phase/category (e.g. terrain)")
    ap.add_argument("--only", default=None, help="comma list of design ids")
    ap.add_argument("--max", type=int, default=0, help="cap number of jobs this run (budget guard)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--estimate", action="store_true",
                    help="report job count + approx credits, then exit (spends nothing)")
    ap.add_argument("--credits-per-job", type=float, default=20.0,
                    help="approx Tripo credits per text-to-model job for the estimate")
    ap.add_argument("--model-version", default="v2.0-20240919")
    args = ap.parse_args(argv)

    designs = designs_for(args.epoch)
    if args.phase:
        designs = [d for d in designs if d[1] == args.phase]
    if args.only:
        wanted = {x.strip() for x in args.only.split(",")}
        designs = [d for d in designs if d[0] in wanted]

    manifest = _load_manifest()
    todo = [d for d in designs if f"tripo:{d[0]}" not in manifest]
    if args.max and len(todo) > args.max:
        todo = todo[:args.max]
    print(f"{len(designs)} designs in scope, {len(todo)} missing -> to generate")

    if args.dry_run or args.estimate:
        from collections import Counter
        by_cat = Counter(d[1] for d in todo)
        for did, cat, epoch, prompt in todo:
            print(f"  [{cat:9s} {epoch:11s}] {did:24s} :: {prompt[:56]}…")
        print(f"\n  by category: {dict(by_cat)}")
        print(f"  ESTIMATE: {len(todo)} jobs × ~{args.credits_per_job:.0f} credits "
              f"= ~{len(todo) * args.credits_per_job:.0f} credits "
              f"(check your balance at https://platform.tripo3d.ai/api-keys)")
        return 0

    from .tripo_client import TripoError, generate_to_file
    ok = 0
    for did, cat, epoch, prompt in todo:
        dest = OUT_DIR / f"{did}.glb"
        try:
            print(f"generating {did} …", flush=True)
            rec = generate_to_file(prompt, dest, model_version=args.model_version)
            rec.update({"asset_id": did, "source": "tripo3d", "kind": "model",
                        "category": cat, "epoch": epoch, "name": did.replace("_", " ").title(),
                        "path": f"/models/generated/tripo/{did}.glb",
                        "attribution": "Generated with Tripo3D (account-owned)"})
            manifest[f"tripo:{did}"] = rec
            _save_manifest(manifest)          # checkpoint after each (jobs cost credits)
            ok += 1
            print(f"  ✓ {did}  ({rec['bytes']//1024} KB)")
        except TripoError as e:
            print(f"  ✗ {did}: {e}", file=sys.stderr)
    print(f"done: {ok}/{len(todo)} generated, manifest -> {MANIFEST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
