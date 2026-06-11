# JARVIS UI Lock

The live UI theme is locked to the existing JARVIS glass dock, command bar, self-development dock, device-access panel, and holographic ring layer.

Rules:

- Do not replace the live page with a second overlay app shell.
- Do not add `ovMini`, `miniSurface`, or `openMiniSurface` back into `server/jarvis_live.html`.
- New mini-apps and agent functions must attach to the existing dock, panels, or celestial menu flow unless a visual redesign is explicitly approved first.
- Keep the original colors, shapes, emoji buttons, glass styling, dock behavior, command bar, access popup, and holographic ring markers intact.

Run this before committing UI work:

```bash
python3 scripts/check_ui_theme_lock.py
```

The guard fails if the protected live UI anchors disappear or if the blocked overlay markers return.
