# JARVIS Recovery Execution Queue

This queue is the live recovery list from the current thread. Do not mark an item done unless it is implemented, smoke-tested, and either pushed or explicitly held back.

## Active Rules

- Do not redesign the existing UI without explicit approval.
- Do not change colors, panel shapes, dock styling, emoji buttons, glass styling, or app layout while fixing functionality.
- New functions must attach to the existing dock/panels/celestial flow, not replace them with a new shell.
- Every risky visual change needs a screenshot smoke check before commit.
- Runtime dirty files such as `server/data/watchdog_status.json` are not part of feature commits.

## Queue

1. Restore the original live UI theme, panels, buttons, app dock, command bar, and access popup.
   Status: done.

2. Lock the restored UI so injected theme pickers, separate mini-app shells, and unapproved holo effect layers cannot return.
   Status: done.

3. Fix JARVIS chat/agent hangs so slow LLM/tool paths return quickly and do not disconnect the UI.
   Status: done.

4. Verify the device-access and phone-control popups appear after load and remain usable on mobile.
   Status: done. Verified public mobile browser smoke loads `window.A11Y`, `#a11y-layer`, `#a11y-captions`, and `#ovAccess` with zero 404s.

5. Rebuild the celestial menu into a usable PS5-style 3D app menu without changing the approved visual theme.
   Status: partial. The live renderer now uses lane-slot placement, mounted asset/media URLs, Explore camera framing, and verified public Three.js boot. The full repo-wide menu taxonomy is still pending.

6. Fix celestial body spacing, labels, importance order, orbit grouping, lazy loading, camera modes, and space dust GLBs.
   Status: partial. Verified public browser boot shows 183 celestial bodies, instanced 3D dust, mounted GLB loading, zero 404s, and no forbidden UI theme markers. Remaining work: complete taxonomy, duplicate prevention, all camera-mode usability checks, and full label/shortcut audit.

7. Ensure every repo feature/document/function maps to a scalable celestial menu object or documented shortcut without duplicates.
   Status: pending.

8. Fix Underworld/backend batching so GPU/LLM workloads do not overload VRAM or block Hostinger/Vast.ai flows.
   Status: pending.

9. Audit mini-apps and dock functions end to end; repair non-working actions and only add new dock apps when fully functional.
   Status: pending.

10. Produce a missing-features/functions backlog after the smoke tests, grouped by UI, JARVIS agent, LLM/GPU, celestial menu, accessibility, and mini-apps.
    Status: pending.

## Verified Recovery Commits

- `582c48c2 fix(jarvis): restore approved UI and stop agent hangs`
- `42494c3f fix(jarvis): keep dashboard chat responsive`
- `605d0915 fix(jarvis): stabilize celestial menu and agent access`

## Latest Public Smoke Results

- `/jarvis/` returns 200.
- `/jarvis/asset/jarvis_kit_data_orb.glb` returns 200.
- `/jarvis/media/gen_tripo__balance_scale_lab.glb` returns 200.
- `/jarvis/a11y/a11y.css` and `/jarvis/a11y/a11y.js` return 200.
- `/jarvis/chat` returns a greeting response in under 0.1s for `hello jarvis`.
- Chromium mobile probe: no page errors, no 404s, `window.A11Y` loaded, access overlay exists, Celestial OS built, 183 celestial bodies present, 3D dust instancing present, forbidden unapproved UI theme markers absent.
