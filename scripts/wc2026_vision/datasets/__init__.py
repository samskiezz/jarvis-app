"""Legal, open sports-video dataset loaders for the WC2026 vision pipeline."""
from __future__ import annotations

from .soccernet import download_soccernet_videos, ingest_soccernet_directory
from .sportsmot import ingest_sportsmot_football

__all__ = [
    "download_soccernet_videos",
    "ingest_soccernet_directory",
    "ingest_sportsmot_football",
]
