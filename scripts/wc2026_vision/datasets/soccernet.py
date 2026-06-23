"""SoccerNet downloader wrapper for the WC2026 vision pipeline.

SoccerNet-v2 contains 500 complete broadcast soccer games (~764 hours). The
annotations and pre-computed features are freely available, but the broadcast
videos require signing a research NDA and receiving a password from the
SoccerNet team.

This module provides a thin wrapper around the official `SoccerNet` pip package
so that, once the NDA is signed and the password is supplied, the videos can be
downloaded and fed through the existing vision pipeline.

Links:
    - Dataset & NDA: https://www.soccer-net.org/data
    - DevKit: https://github.com/SilvioGiancola/SoccerNetv2-DevKit

Reference: Giancola et al., "SoccerNet: A Scalable Dataset for Action Spotting
in Soccer Videos", CVPR Workshop 2018; Deliège et al., "SoccerNet-v2", CVPRW 2021.
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

REPO_SCRIPTS = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_SCRIPTS))
from wc2026_vision import config  # noqa: E402

LOG = logging.getLogger("wc2026_vision.soccernet")


def download_soccernet_videos(local_dir: str | Path,
                              password: str,
                              resolution: str = "224p",
                              splits: tuple[str, ...] = ("train", "valid", "test")) -> None:
    """Download SoccerNet broadcast videos using the official API.

    Args:
        local_dir: where to store the downloaded games.
        password: the password received after signing the SoccerNet NDA.
        resolution: "224p" or "720p".
        splits: which splits to download.

    Raises:
        ImportError: if the SoccerNet package is not installed.
        RuntimeError: on download failure.
    """
    try:
        from SoccerNet.Downloader import SoccerNetDownloader
    except ImportError as exc:
        raise ImportError(
            "SoccerNet package not installed. Run: pip install SoccerNet"
        ) from exc

    local_dir = Path(local_dir)
    local_dir.mkdir(parents=True, exist_ok=True)
    downloader = SoccerNetDownloader(LocalDirectory=str(local_dir))
    downloader.password = password

    if resolution not in ("224p", "720p"):
        raise ValueError(f"resolution must be 224p or 720p, got {resolution}")

    files = [f"1_{resolution}.mkv", f"2_{resolution}.mkv"]
    LOG.info("Downloading SoccerNet %s videos to %s", resolution, local_dir)
    downloader.downloadGames(files=files, split=list(splits))
    LOG.info("SoccerNet download complete")


def ingest_soccernet_directory(videos_dir: str | Path,
                               max_games: int | None = None,
                               max_frames: int | None = None,
                               output_video: bool = False) -> int:
    """Ingest downloaded SoccerNet .mkv files into the tracking DB.

    SoccerNet stores each game as two halves: 1_224p.mkv / 2_224p.mkv.
    We concatenate the two halves per game and run the vision pipeline.
    """
    from wc2026_vision import process_video  # local import to avoid heavy init

    videos_dir = Path(videos_dir)
    # Find game directories (e.g. germany_bundesliga/2014-2015/...)
    mkvs = sorted(videos_dir.rglob("*.mkv"))
    games: dict[str, list[Path]] = {}
    for path in mkvs:
        # key is the parent directory of the .mkv file (the game folder)
        key = str(path.parent.relative_to(videos_dir))
        games.setdefault(key, []).append(path)

    processed = 0
    for idx, (game_key, parts) in enumerate(games.items()):
        if max_games is not None and idx >= max_games:
            break
        parts = sorted(parts)
        match_id = f"soccernet_{game_key.replace('/', '_').replace(' ', '_')}"
        home, away = "SoccerNet_Home", "SoccerNet_Away"
        LOG.info("ingesting SoccerNet game %s (%d half(s))", game_key, len(parts))

        if len(parts) == 1:
            video_path = parts[0]
        else:
            # concatenate halves
            import shutil
            import tempfile
            tmp_dir = Path(tempfile.mkdtemp(prefix="soccernet_"))
            video_path = tmp_dir / "concat.mkv"
            with video_path.open("wb") as out:
                for part in parts:
                    with part.open("rb") as inp:
                        shutil.copyfileobj(inp, out)

        try:
            process_video(
                video_path,
                match_id=match_id,
                home=home,
                away=away,
                output_video=output_video,
                max_frames=max_frames,
            )
            processed += 1
        except Exception as exc:
            LOG.error("failed to ingest %s: %s", game_key, exc)
        finally:
            if len(parts) > 1:
                import shutil
                shutil.rmtree(video_path.parent, ignore_errors=True)

    LOG.info("SoccerNet ingestion complete: %d/%d games processed", processed, len(games))
    return processed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="SoccerNet download/ingest helper")
    sub = parser.add_subparsers(dest="command")

    dl = sub.add_parser("download", help="Download SoccerNet videos (requires NDA password)")
    dl.add_argument("--dir", type=Path, default=config.VISION_DIR / "soccernet")
    dl.add_argument("--password", required=True, help="SoccerNet video password from NDA")
    dl.add_argument("--resolution", default="224p", choices=["224p", "720p"])
    dl.add_argument("--splits", nargs="+", default=["train", "valid", "test"])

    ing = sub.add_parser("ingest", help="Ingest already-downloaded SoccerNet videos")
    ing.add_argument("--dir", type=Path, default=config.VISION_DIR / "soccernet")
    ing.add_argument("--max-games", type=int, default=None)
    ing.add_argument("--max-frames", type=int, default=None)
    ing.add_argument("--output-video", action="store_true")

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if args.command == "download":
        download_soccernet_videos(args.dir, args.password, args.resolution, tuple(args.splits))
    elif args.command == "ingest":
        ingest_soccernet_directory(args.dir, args.max_games, args.max_frames, args.output_video)
    else:
        parser.print_help()
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
