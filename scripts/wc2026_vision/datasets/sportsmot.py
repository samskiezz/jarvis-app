"""SportsMOT football-clip ingestion for the WC2026 vision pipeline.

SportsMOT is released under CC BY-NC 4.0 and contains 240 sports clips
including football.  The data are stored as MOT-Challenge frame sequences.
This module converts a football clip into a temporary video and runs it
through the existing vision pipeline, so the tracking DB gets real
multi-player sports features without touching any copyrighted broadcast.

Expected layout after download:
    <sportsmot_root>/
        splits_txt/
            football.txt
            train.txt, val.txt, test.txt
        dataset/
            train/<video_name>/img1/000001.jpg ...
            train/<video_name>/gt/gt.txt
            val/...
            test/...

Reference: Cui et al., "SportsMOT: A Large Multi-Object Tracking Dataset
in Multiple Sports Scenes", ICCV 2023.
"""
from __future__ import annotations

import argparse
import logging
import shutil
import sys
import tempfile
from pathlib import Path

import cv2

# Allow import of the parent vision package.
REPO_SCRIPTS = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_SCRIPTS))
from wc2026_vision import config, process_video  # noqa: E402

LOG = logging.getLogger("wc2026_vision.sportsmot")


def _find_split_for_video(video_name: str, sportsmot_root: Path) -> str | None:
    """Return 'train', 'val', or 'test' for a given video name."""
    for split in ("train", "val", "test"):
        split_file = sportsmot_root / "splits_txt" / f"{split}.txt"
        if not split_file.exists():
            continue
        names = {line.strip() for line in split_file.read_text().splitlines() if line.strip()}
        if video_name in names:
            return split
    return None


def _discover_football_clips(sportsmot_root: Path) -> list[tuple[str, str, Path]]:
    """Return (video_name, split, img_dir) for every football clip."""
    football_file = sportsmot_root / "splits_txt" / "football.txt"
    if not football_file.exists():
        raise FileNotFoundError(f"SportsMOT football split not found: {football_file}")

    names = [line.strip() for line in football_file.read_text().splitlines() if line.strip()]
    clips: list[tuple[str, str, Path]] = []
    for name in names:
        split = _find_split_for_video(name, sportsmot_root)
        if split is None:
            LOG.warning("%s listed in football.txt but not found in train/val/test splits", name)
            continue
        img_dir = sportsmot_root / "dataset" / split / name / "img1"
        if not img_dir.exists():
            LOG.warning("missing image directory: %s", img_dir)
            continue
        clips.append((name, split, img_dir))
    return clips


def _frames_to_video(img_dir: Path, out_path: Path, fps: float = 25.0) -> None:
    """Write a sorted JPG sequence to an MP4 using OpenCV."""
    frames = sorted(img_dir.glob("*.jpg"))
    if not frames:
        raise FileNotFoundError(f"no jpg frames in {img_dir}")

    first = cv2.imread(str(frames[0]))
    if first is None:
        raise RuntimeError(f"cannot read frame {frames[0]}")
    height, width = first.shape[:2]

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(out_path), fourcc, fps, (width, height))
    if not writer.isOpened():
        raise RuntimeError(f"cannot open video writer for {out_path}")

    for frame_path in frames:
        frame = cv2.imread(str(frame_path))
        if frame is None:
            LOG.warning("failed to read %s", frame_path)
            continue
        writer.write(frame)
    writer.release()


def ingest_sportsmot_football(sportsmot_root: str | Path,
                              max_clips: int | None = None,
                              max_frames_per_clip: int | None = None,
                              output_video: bool = False) -> int:
    """Ingest SportsMOT football clips into the tracking DB.

    Args:
        sportsmot_root: path to the unzipped SportsMOT dataset.
        max_clips: ingest only the first N clips (None = all).
        max_frames_per_clip: passed to process_video as max_frames.
        output_video: whether to write annotated output videos.

    Returns:
        Number of clips successfully ingested.
    """
    root = Path(sportsmot_root)
    clips = _discover_football_clips(root)
    if max_clips:
        clips = clips[:max_clips]

    LOG.info("SportsMOT: discovered %d football clips", len(clips))

    processed = 0
    for video_name, split, img_dir in clips:
        match_id = f"sportsmot_{split}_{video_name}"
        # SportsMOT clips do not have team names; use placeholders.
        home, away = "SportsMOT_Home", "SportsMOT_Away"
        tmp_dir = Path(tempfile.mkdtemp(prefix="sportsmot_"))
        tmp_video = tmp_dir / f"{video_name}.mp4"
        try:
            LOG.info("converting %s (%s) -> temporary video", video_name, split)
            _frames_to_video(img_dir, tmp_video)
            process_video(
                tmp_video,
                match_id=match_id,
                home=home,
                away=away,
                output_video=output_video,
                max_frames=max_frames_per_clip,
            )
            processed += 1
        except Exception as exc:
            LOG.error("failed to ingest %s: %s", video_name, exc)
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    LOG.info("SportsMOT ingestion complete: %d/%d clips processed", processed, len(clips))
    return processed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest SportsMOT football clips into WC2026 tracking DB")
    parser.add_argument("--root", type=Path, default=config.VISION_DIR / "sportsmot",
                        help="Path to unzipped SportsMOT dataset")
    parser.add_argument("--max-clips", type=int, default=None, help="Process only first N clips")
    parser.add_argument("--max-frames", type=int, default=None, help="Process only first N frames per clip")
    parser.add_argument("--output-video", action="store_true", help="Write annotated output videos")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    ingest_sportsmot_football(
        args.root,
        max_clips=args.max_clips,
        max_frames_per_clip=args.max_frames,
        output_video=args.output_video,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
