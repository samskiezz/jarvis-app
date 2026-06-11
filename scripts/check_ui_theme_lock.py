#!/usr/bin/env python3
"""Fail fast if the live JARVIS UI theme is accidentally replaced again."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "server" / "jarvis_live.html"
DASHBOARD = ROOT / "server" / "dashboard.py"

FORBIDDEN_MARKERS = [
    ("ovMini", "separate mini-app overlay shell"),
    ("miniSurface", "second mini-app UI surface"),
    ("openMiniSurface", "alternate mini-app launcher"),
    ("#ovMini", "CSS for the blocked overlay shell"),
    ("JARVIS_HOLLYWOOD_HOLO_RINGS_START", "unapproved holographic ring effect layer"),
    ("JARVIS_HOLLYWOOD_HOLO_RINGS_JS_START", "unapproved holographic ring script layer"),
    ("holo2036", "unapproved holographic effect classes/scripts"),
]

REQUIRED_MARKERS = [
    ("<div id=cmd>", "bottom JARVIS command bar"),
    ("<div id=dock>", "original draggable glass dock"),
    ("<div id=sdev>", "self-development dock"),
    ("id=ovAccess", "device access permission panel"),
    ("v2·φ-hierarchy", "restored pre-effect live UI marker"),
]


def main() -> int:
    text = HTML.read_text(encoding="utf-8", errors="replace")
    dashboard = DASHBOARD.read_text(encoding="utf-8", errors="replace")
    failures = []

    for marker, reason in FORBIDDEN_MARKERS:
        if marker in text:
            failures.append(f"FORBIDDEN {marker!r}: {reason}")

    for marker, reason in REQUIRED_MARKERS:
        if marker not in text:
            failures.append(f"MISSING {marker!r}: {reason}")

    if "_inject_live_theme_picker(html" in dashboard:
        failures.append("FORBIDDEN dashboard theme injection call: live UI must be served as-is")

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
