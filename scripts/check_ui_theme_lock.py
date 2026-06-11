#!/usr/bin/env python3
"""Fail fast if the live JARVIS UI theme is accidentally replaced again."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "server" / "jarvis_live.html"

FORBIDDEN_MARKERS = [
    ("ovMini", "separate mini-app overlay shell"),
    ("miniSurface", "second mini-app UI surface"),
    ("openMiniSurface", "alternate mini-app launcher"),
    ("#ovMini", "CSS for the blocked overlay shell"),
]

REQUIRED_MARKERS = [
    ("<div id=cmd>", "bottom JARVIS command bar"),
    ("<div id=dock>", "original draggable glass dock"),
    ("<div id=sdev>", "self-development dock"),
    ("id=ovAccess", "device access permission panel"),
    ("JARVIS_HOLLYWOOD_HOLO_RINGS_START", "holographic ring CSS"),
    ("JARVIS_HOLLYWOOD_HOLO_RINGS_JS_START", "holographic ring JS"),
    ("v2·3D menu", "current live UI marker"),
]


def main() -> int:
    text = HTML.read_text(encoding="utf-8", errors="replace")
    failures = []

    for marker, reason in FORBIDDEN_MARKERS:
        if marker in text:
            failures.append(f"FORBIDDEN {marker!r}: {reason}")

    for marker, reason in REQUIRED_MARKERS:
        if marker not in text:
            failures.append(f"MISSING {marker!r}: {reason}")

    if failures:
        print("UI THEME LOCK: FAIL")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("UI THEME LOCK: PASS")
    print(f"Checked {HTML}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
