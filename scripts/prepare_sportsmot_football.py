#!/usr/bin/env python3
"""Download SportsMOT from HuggingFace, keep only football sequences, and convert to MP4."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

from huggingface_hub import hf_hub_download

REPO_ROOT = Path(__file__).resolve().parent.parent
DST = REPO_ROOT / "server" / "data" / "vision_tracking" / "sportsmot_football"
VIDEO_DIR = DST / "videos"
DST.mkdir(parents=True, exist_ok=True)
VIDEO_DIR.mkdir(parents=True, exist_ok=True)

REPO_ID = "MCG-NJU/SportsMOT"


def load_sequences(split: str) -> set[str]:
    path = hf_hub_download(
        REPO_ID,
        f"splits_txt/{split}.txt",
        repo_type="dataset",
        local_dir=str(DST / "splits_txt"),
        local_dir_use_symlinks=False,
    )
    with open(path) as f:
        return {line.strip() for line in f if line.strip()}


def run(cmd: list[str], timeout: int = 300) -> None:
    print("$", " ".join(cmd))
    subprocess.run(cmd, check=True, timeout=timeout)


def convert_to_mp4(seq_dir: Path, out_mp4: Path, fps: int = 25) -> None:
    img_dir = seq_dir / "img1"
    if not img_dir.exists():
        raise FileNotFoundError(f"No img1 in {seq_dir}")
    # Determine image pattern.
    patterns = ["%06d.jpg", "%08d.jpg", "%05d.jpg"]
    chosen = None
    for pat in patterns:
        test = img_dir / pat.replace("%d", "1").zfill(len(pat) - 4)
        # crude check
        if any(img_dir.glob("*.jpg")):
            chosen = pat
            break
    if not chosen:
        raise RuntimeError(f"No jpg images in {img_dir}")
    cmd = [
        "ffmpeg",
        "-y",
        "-framerate", str(fps),
        "-i", str(img_dir / chosen),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", "23",
        "-preset", "fast",
        str(out_mp4),
    ]
    run(cmd, timeout=1200)


def process_split(split: str, football_seqs: set[str]) -> int:
    tar_name = f"dataset/{split}.tar"
    print(f"\n=== {split}: downloading {tar_name} ===")
    tar_path = Path(
        hf_hub_download(
            REPO_ID,
            tar_name,
            repo_type="dataset",
            local_dir=str(DST),
            local_dir_use_symlinks=False,
            resume_download=True,
        )
    )
    print(f"  tar: {tar_path} ({tar_path.stat().st_size / 1e9:.2f} GB)")

    print(f"  extracting football sequences from {split}.tar ...")
    extracted = DST / "extracted"
    extracted.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tar_path, "r") as tf:
        members = tf.getmembers()
        # Select members whose path contains a football sequence directory.
        to_extract = [
            m for m in members
            if any(f"/{seq}/" in ("/" + m.name) or m.name.startswith(seq + "/") for seq in football_seqs)
        ]
        if not to_extract:
            print(f"  no football sequences found in {split}.tar")
        else:
            tf.extractall(path=str(extracted), members=to_extract)

    # Find all img1 directories belonging to football sequences (handles any nesting).
    seq_dirs: list[Path] = []
    for img1 in extracted.rglob("img1"):
        seq_dir = img1.parent
        if seq_dir.name in football_seqs:
            seq_dirs.append(seq_dir)
    # Deduplicate.
    seq_dirs = sorted(set(seq_dirs))

    print(f"  converting {len(seq_dirs)} sequences to MP4 ...")
    for seq_dir in seq_dirs:
        out_mp4 = VIDEO_DIR / f"{seq_dir.name}.mp4"
        if out_mp4.exists():
            print(f"    skip {out_mp4.name}")
            continue
        try:
            convert_to_mp4(seq_dir, out_mp4)
            print(f"    -> {out_mp4}")
        except Exception as exc:
            print(f"    FAILED {seq_dir.name}: {exc}", file=sys.stderr)

    # Clean up extracted images and tar to save disk.
    if extracted.exists():
        shutil.rmtree(extracted)
    tar_path.unlink()
    print(f"  cleaned up {split} tar and extracted images")
    return len(seq_dirs)


def main() -> int:
    print("Loading split lists ...")
    football = load_sequences("football")
    train = load_sequences("train")
    val = load_sequences("val")
    test = load_sequences("test")
    print(f"football sequences: {len(football)}")

    football_by_split: dict[str, set[str]] = {}
    for split, seqs in (("train", train), ("val", val), ("test", test)):
        football_by_split[split] = football & seqs
        print(f"  {split}: {len(football_by_split[split])}")

    total = 0
    for split in ("train", "val", "test"):
        total += process_split(split, football_by_split[split])

    # Write a batch spec for the video runner.
    specs = []
    for mp4 in sorted(VIDEO_DIR.glob("*.mp4")):
        specs.append({
            "match_id": f"sportsmot_{mp4.stem}",
            "video": mp4.name,
            "home": "SportsMOT_Home",
            "away": "SportsMOT_Away",
        })
    specs_path = VIDEO_DIR / "batch_specs.json"
    specs_path.write_text(json.dumps(specs, indent=2), encoding="utf-8")
    print(f"  wrote {specs_path} ({len(specs)} clips)")

    print(f"\nDone. {total} football MP4s in {VIDEO_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
