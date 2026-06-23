#!/usr/bin/env python3
"""Extract the football subset from the downloaded SportsMOT tar archive.

The Dataset Ninja / dataset-tools downloader stores SportsMOT as a single
`sportsmot.tar`.  This script extracts only the files needed for football
clip ingestion and arranges them in the MOT-Challenge layout expected by
`scripts/wc2026_vision/datasets/sportsmot.py`.
"""
from __future__ import annotations

import argparse
import logging
import shutil
import sys
import tarfile
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))
from wc2026_vision import config  # noqa: E402

LOG = logging.getLogger("wc2026_vision.sportsmot_extract")


def _find_tar(raw_dir: Path) -> Path | None:
    candidates = list(raw_dir.glob("*.tar")) + list(raw_dir.glob("*.tar.gz")) + list(raw_dir.glob("*.tgz"))
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_size)


def extract_football_subset(raw_dir: Path, out_dir: Path) -> int:
    raw_dir = Path(raw_dir)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    tar_path = _find_tar(raw_dir)
    if not tar_path:
        raise FileNotFoundError(f"no SportsMOT tar archive found in {raw_dir}")
    LOG.info("found archive: %s", tar_path)

    football_names: set[str] = set()
    extracted = 0

    with tarfile.open(tar_path, "r:*") as tf:
        members = tf.getmembers()
        # First pass: locate football split list.
        for m in members:
            if m.name.endswith("splits_txt/football.txt") or m.name.endswith("football.txt"):
                LOG.info("locating football split list: %s", m.name)
                tmp = Path(tempfile.mkdtemp(prefix="sportsmot_split_"))
                tf.extract(m, path=tmp)
                split_file = next(tmp.rglob("football.txt"))
                football_names = {line.strip() for line in split_file.read_text().splitlines() if line.strip()}
                LOG.info("found %d football clips", len(football_names))
                shutil.rmtree(tmp, ignore_errors=True)
                break

        if not football_names:
            LOG.warning("could not find football.txt; extracting entire archive")

        # Second pass: extract members for football clips + split files.
        for m in members:
            if not m.isfile():
                continue
            name = m.name
            keep = False
            if "splits_txt/" in name:
                keep = True
            else:
                for fn in football_names:
                    if fn in name:
                        keep = True
                        break
            if not keep and football_names:
                continue
            tf.extract(m, path=out_dir)
            extracted += 1

    # Normalize top-level directory: if everything is under a single subfolder, lift it.
    subdirs = [d for d in out_dir.iterdir() if d.is_dir()]
    if len(subdirs) == 1 and not (out_dir / "splits_txt").exists():
        nested = subdirs[0]
        for item in list(nested.iterdir()):
            dest = out_dir / item.name
            if dest.exists():
                shutil.rmtree(dest, ignore_errors=True)
            shutil.move(str(item), str(dest))
        nested.rmdir()

    LOG.info("extracted %d files to %s", extracted, out_dir)
    return extracted


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extract SportsMOT football subset")
    parser.add_argument("--raw-dir", type=Path, default=config.VISION_DIR / "sportsmot_raw",
                        help="Directory containing the downloaded sportsmot.tar")
    parser.add_argument("--out-dir", type=Path, default=config.VISION_DIR / "sportsmot",
                        help="Directory to extract the football subset into")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    extract_football_subset(args.raw_dir, args.out_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
