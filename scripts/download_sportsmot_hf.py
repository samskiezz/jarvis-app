#!/usr/bin/env python3
"""Download SportsMOT from the MCG-NJU/SportsMOT HuggingFace dataset."""
from __future__ import annotations

import os
import sys
from pathlib import Path

from huggingface_hub import hf_hub_download

REPO_ROOT = Path(__file__).resolve().parent.parent
DST = REPO_ROOT / "server" / "data" / "vision_tracking" / "sportsmot_raw"
DST.mkdir(parents=True, exist_ok=True)


def main() -> int:
    repo_id = "MCG-NJU/SportsMOT"
    for fname in ("dataset/train.tar", "dataset/val.tar", "dataset/test.tar"):
        print(f"Downloading {fname} ...")
        try:
            hf_hub_download(
                repo_id,
                filename=fname,
                repo_type="dataset",
                local_dir=str(DST),
                local_dir_use_symlinks=False,
                resume_download=True,
            )
            print(f"  done: {DST / os.path.basename(fname)}")
        except Exception as exc:
            print(f"  FAILED {fname}: {exc}", file=sys.stderr)
            return 1
    print("All SportsMOT tar files downloaded.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
