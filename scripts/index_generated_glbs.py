#!/usr/bin/env python3
"""INDEX GENERATED GLBs into the media library (media.db + /media route).

Discovers the ~1,638 Tripo/UW-generated .glb assets under
  underworld/web/public/models/generated/**
content-dedups them (md5), gives each a collision-safe FLAT name, symlinks it
into server/data/media/ (so the dashboard's /media/<file> route — which does
os.path.basename() and a plain open() — can serve it WITHOUT copying 13 GB),
and records each one in server/data/media.db via media_gen._record semantics so
GET /library (media_gen.library) returns them.

Idempotent: re-running skips GLBs already indexed (by flat file name).
Does NOT touch dashboard.py or jarvis_live.html. Only writes media.db + symlinks.

  python scripts/index_generated_glbs.py            # index for real
  python scripts/index_generated_glbs.py --dry-run  # report only, no writes
"""
from __future__ import annotations

import hashlib
import os
import re
import sqlite3
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN_DIR = os.path.join(ROOT, "underworld", "web", "public", "models", "generated")
MEDIA = os.path.join(ROOT, "server", "data", "media")
MEDIA_DB = os.path.join(ROOT, "server", "data", "media.db")

DRY = "--dry-run" in sys.argv


def _slug(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", s).strip("_").lower()
    return s or "x"


def _flat_name(rel_from_gen: str) -> str:
    """Collision-safe flat /media file name from a path relative to GEN_DIR.

    tripo/abacus.glb            -> gen_tripo__abacus.glb
    uw/interior/hospital_bed.glb-> gen_uw_interior__hospital_bed.glb
    low-poly-fantasy-mushroom.glb-> gen__low_poly_fantasy_mushroom.glb
    """
    parts = rel_from_gen.split("/")
    base = parts[-1][:-4]  # strip .glb
    subdir = "_".join(parts[:-1])
    return f"gen_{_slug(subdir)}__{_slug(base)}.glb"


def _prompt(rel_from_gen: str) -> str:
    """Human / topic prompt derived from the file name + category."""
    parts = rel_from_gen.split("/")
    base = parts[-1][:-4]
    topic = re.sub(r"[-_]+", " ", base).strip()
    cat = parts[-2] if len(parts) > 1 else ""
    cat = cat.replace("uw", "").strip("/ ").replace("/", " ")
    return f"{topic} [{cat}]" if cat else topic


def _db() -> sqlite3.Connection:
    c = sqlite3.connect(MEDIA_DB, timeout=30)
    c.execute("""CREATE TABLE IF NOT EXISTS media(
        id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, prompt TEXT, file TEXT, created_ts INTEGER)""")
    c.commit()
    return c


def main() -> None:
    if not os.path.isdir(GEN_DIR):
        print(f"NO_GEN_DIR {GEN_DIR}", flush=True)
        sys.exit(1)
    os.makedirs(MEDIA, exist_ok=True)

    # 1) discover every generated .glb (absolute path), relative to GEN_DIR
    found: list[str] = []
    for dirpath, _dirs, files in os.walk(GEN_DIR):
        for f in files:
            if f.lower().endswith(".glb"):
                found.append(os.path.join(dirpath, f))
    found.sort()
    print(f"DISCOVERED {len(found)} glb under {GEN_DIR}", flush=True)

    # 2) content-dedup by md5 (keep first/shortest-path occurrence)
    seen_md5: dict[str, str] = {}
    unique: list[str] = []
    dups = 0
    for ap in found:
        h = hashlib.md5(open(ap, "rb").read()).hexdigest()
        if h in seen_md5:
            dups += 1
            continue
        seen_md5[h] = ap
        unique.append(ap)
    print(f"UNIQUE {len(unique)}  CONTENT_DUPS_SKIPPED {dups}", flush=True)

    # 3) which flat names are already in media.db (idempotent)
    c = _db()
    already = {r[0] for r in c.execute(
        "SELECT file FROM media WHERE kind='glb'").fetchall()}

    inserted = 0
    relinked = 0
    skipped = 0
    ts = int(time.time())
    rows = []
    used_flat: set[str] = set()

    for ap in unique:
        rel = os.path.relpath(ap, GEN_DIR).replace(os.sep, "/")
        flat = _flat_name(rel)
        # guard against any residual flat-name collision (shouldn't happen post md5-dedup)
        if flat in used_flat:
            stub = hashlib.md5(rel.encode()).hexdigest()[:6]
            flat = flat[:-4] + "_" + stub + ".glb"
        used_flat.add(flat)

        link = os.path.join(MEDIA, flat)
        # ensure the symlink exists and points at the source
        if not DRY:
            try:
                if os.path.islink(link) or os.path.exists(link):
                    if os.path.realpath(link) != os.path.realpath(ap):
                        os.remove(link)
                        os.symlink(ap, link)
                        relinked += 1
                else:
                    os.symlink(ap, link)
                    relinked += 1
            except OSError as e:  # noqa: PERF203
                print(f"LINK_ERR {flat}: {e}", flush=True)
                continue

        if flat in already:
            skipped += 1
            continue
        rows.append(("glb", _prompt(rel)[:300], flat, ts))
        inserted += 1

    if not DRY and rows:
        c.executemany(
            "INSERT INTO media(kind,prompt,file,created_ts) VALUES(?,?,?,?)", rows)
        c.commit()

    total_glb = c.execute("SELECT COUNT(*) FROM media WHERE kind='glb'").fetchone()[0]
    c.close()

    print(f"{'DRYRUN ' if DRY else ''}INSERTED {inserted}  SYMLINKS {relinked}  "
          f"ALREADY_INDEXED_SKIPPED {skipped}", flush=True)
    print(f"MEDIA_DB_GLB_TOTAL {total_glb}", flush=True)


if __name__ == "__main__":
    main()
