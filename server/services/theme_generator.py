"""Theme generator for the JARVIS live UI.

Produces CSS-variable theme objects for the top bar, chat bar, side panels and dock.
Random/preset themes are deterministic and cheap. LLM-generated themes fall back to a
preset if the LLM seam is unavailable, so the UI never breaks.
"""
from __future__ import annotations

import json
import random
from typing import Any

RANDOM_THEMES: list[dict[str, Any]] = [
    {
        "name": "iOS 26 Cyan",
        "description": "Apple Liquid Glass — cyan tint, soft blur, rounded sheets",
        "vars": {
            "--cyan": "#29e7ff", "--cyan2": "#7af3ff", "--cy": "#29e7ff", "--cy2": "#7af3ff",
            "--bg": "#020408", "--bg-secondary": "#040a12", "--bg-tertiary": "#06111b",
            "--text-primary": "#eafcff", "--text-secondary": "#c4f1f7", "--text-dim": "#7ad7ff",
            "--tint-h": "191", "--radius-xl": "22px", "--blur-medium": "blur(22px)",
            "--duration-quick": "160ms"
        }
    },
    {
        "name": "Android 15 Aurora",
        "description": "Material You — muted purple/indigo with tonal surfaces",
        "vars": {
            "--cyan": "#a78bfa", "--cyan2": "#c4b5fd", "--cy": "#a78bfa", "--cy2": "#c4b5fd",
            "--bg": "#0a0712", "--bg-secondary": "#120c1f", "--bg-tertiary": "#1a122b",
            "--text-primary": "#f3efff", "--text-secondary": "#d8d0f0", "--text-dim": "#a69ac9",
            "--tint-h": "263", "--radius-xl": "26px", "--blur-medium": "blur(24px)",
            "--duration-quick": "180ms"
        }
    },
    {
        "name": "Cyberpunk Neon",
        "description": "High-contrast magenta/cyan glow with sharp edges",
        "vars": {
            "--cyan": "#ff00ff", "--cyan2": "#00ffff", "--cy": "#ff00ff", "--cy2": "#00ffff",
            "--bg": "#050005", "--bg-secondary": "#0f0014", "--bg-tertiary": "#190020",
            "--text-primary": "#ffeaff", "--text-secondary": "#ffb3ff", "--text-dim": "#c96bc9",
            "--tint-h": "300", "--radius-xl": "12px", "--blur-medium": "blur(14px)",
            "--duration-quick": "120ms"
        }
    },
    {
        "name": "Warm Amber Glass",
        "description": "Soft amber tint on dark bronze — calm and premium",
        "vars": {
            "--cyan": "#f5b942", "--cyan2": "#ffd96e", "--cy": "#f5b942", "--cy2": "#ffd96e",
            "--bg": "#0d0802", "--bg-secondary": "#161007", "--bg-tertiary": "#1f160b",
            "--text-primary": "#fff7e8", "--text-secondary": "#f0d9b0", "--text-dim": "#b89b70",
            "--tint-h": "38", "--radius-xl": "24px", "--blur-medium": "blur(20px)",
            "--duration-quick": "200ms"
        }
    },
    {
        "name": "Forest Mint",
        "description": "Dark emerald with mint accents — easy on the eyes",
        "vars": {
            "--cyan": "#34d399", "--cyan2": "#6ee7b7", "--cy": "#34d399", "--cy2": "#6ee7b7",
            "--bg": "#020a06", "--bg-secondary": "#05140d", "--bg-tertiary": "#081d14",
            "--text-primary": "#eafff4", "--text-secondary": "#c9f5df", "--text-dim": "#7dd3a8",
            "--tint-h": "152", "--radius-xl": "20px", "--blur-medium": "blur(22px)",
            "--duration-quick": "170ms"
        }
    },
]


def _theme_from_prompt(prompt: str, style: str | None = None) -> dict[str, Any]:
    """Ask the tiered LLM seam for a CSS-variable theme JSON object."""
    system = (
        "You are a UI theme designer for a JARVIS holographic dashboard. "
        "Return ONLY a JSON object with no markdown and no explanation. "
        "The object must have keys: name (string), description (string), "
        "and vars (object mapping CSS variable names to values). "
        "Only override variables that affect the top bar, chat bar, side glass panels, and dock. "
        "Prefer these variable names when relevant: --cyan, --cyan2, --cy, --cy2, --bg, "
        "--bg-secondary, --bg-tertiary, --text-primary, --text-secondary, --text-dim, "
        "--tint-h (hue 0-360), --radius-xl, --blur-medium, --duration-quick. "
        "Ensure colours remain readable on dark backgrounds and never use pure black text."
    )
    user = f"Style: {style or 'custom'}. User request: {prompt}"
    try:
        from server.services import tiered_llm as T
        r = T.complete(user, system=system, tier="strong", max_tokens=600, fmt="json", module="server/services/theme_generator")
        if r.get("ok"):
            parsed = json.loads(r.get("content") or "{}")
            if parsed and "vars" in parsed and "name" in parsed:
                return parsed
    except Exception:  # noqa: BLE001
        pass
    return random.choice(RANDOM_THEMES)


def generate_theme(prompt: str = "", style: str | None = None) -> dict[str, Any]:
    """Generate a theme from a prompt, style keyword, or fallback to a random preset."""
    if not prompt and not style:
        return random_theme()
    style_lower = (style or "").strip().lower()
    if style_lower:
        for t in RANDOM_THEMES:
            if style_lower in t["name"].lower():
                return t
    if prompt:
        return _theme_from_prompt(prompt, style)
    return random_theme()


def random_theme() -> dict[str, Any]:
    """Return a random preset theme."""
    return random.choice(RANDOM_THEMES)
