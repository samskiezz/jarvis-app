# JARVIS UI Lock

The live UI theme is locked to the existing JARVIS glass dock, command bar, self-development dock, and device-access panel.

Rules:

- Do not replace the live page with a second overlay app shell.
- Do not add `ovMini`, `miniSurface`, or `openMiniSurface` back into `server/jarvis_live.html`.
- Do not add `JARVIS_HOLLYWOOD_HOLO_RINGS`, `holo2036`, or any replacement effect layer back into `server/jarvis_live.html` without explicit visual approval first.
- New mini-apps and agent functions must attach to the existing dock, panels, or celestial menu flow unless a visual redesign is explicitly approved first.
- Keep the original colors, shapes, emoji buttons, glass styling, dock behavior, command bar, and access popup intact.

Run this before committing UI work:

```bash
python3 scripts/check_ui_theme_lock.py
```

The guard fails if the protected live UI anchors disappear or if the blocked overlay markers return.
