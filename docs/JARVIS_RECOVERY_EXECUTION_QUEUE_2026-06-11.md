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
   Status: pending.

5. Rebuild the celestial menu into a usable PS5-style 3D app menu without changing the approved visual theme.
   Status: pending.

6. Fix celestial body spacing, labels, importance order, orbit grouping, lazy loading, camera modes, and space dust GLBs.
   Status: pending.

7. Ensure every repo feature/document/function maps to a scalable celestial menu object or documented shortcut without duplicates.
   Status: pending.

8. Fix Underworld/backend batching so GPU/LLM workloads do not overload VRAM or block Hostinger/Vast.ai flows.
   Status: pending.

9. Audit mini-apps and dock functions end to end; repair non-working actions and only add new dock apps when fully functional.
   Status: pending.

10. Produce a missing-features/functions backlog after the smoke tests, grouped by UI, JARVIS agent, LLM/GPU, celestial menu, accessibility, and mini-apps.
    Status: pending.
