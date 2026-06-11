# JARVIS UI Protection Rule

Non-negotiable project rule:

Do not redesign, restyle, modernize, simplify, recolor, re-space, replace icons, remove emoji identity, flatten glassmorphism, or change the iOS/glass/JARVIS visual language unless Sam explicitly asks for that exact visual change.

Allowed UI work without explicit visual permission:

- Fix a broken click target while preserving the visible design.
- Fix overflow, clipping, or overlap with the smallest possible CSS/positioning change.
- Fix incorrect, stale, `NaN`, or confusing data text without changing the component design.
- Make a popup less destructive only by changing behavior, not by redesigning the surface.
- Add tests/screenshots/audits that observe the UI.

Required workflow before touching live UI:

1. Capture before screenshots for desktop, tablet, and mobile.
2. Identify the exact broken behavior.
3. Patch only the smallest affected selector/function.
4. Capture after screenshots.
5. If the visual language changed, revert immediately unless Sam explicitly requested that change.

This rule exists because the JARVIS live shell is a designed product surface, not a generic dashboard.
