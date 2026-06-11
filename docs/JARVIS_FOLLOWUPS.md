# JARVIS Follow-Ups

Working list of production issues and next passes discovered while hardening the live app.

## Done In This Pass

- [x] Exposed live backend mini-app data through the dashboard proxy and added live dock apps for architecture, memory, inbox, datasets, reports, dashboards, alerts, cases, assets, and labs.
- [x] Restored the speech bubble / spoken text path in `server/jarvis_live.html`.
- [x] Fixed the access popup so it can reappear per session until mic and camera are actually granted.
- [x] Added dock carousel controls and verified they move on the live page.
- [x] Fixed the FastAPI agent route so long tool work does not block the event loop.
- [x] Fixed the capability-registry regex crash and swarm artifact result normalization.
- [x] Changed the celestial boot path so it no longer secretly enters `Explore` and auto-zooms to `Mini Apps`.
- [x] Moved the top-level celestial planets into a front-facing orbital fan instead of the old flat grid lanes.
- [x] Tightened moon/satellite orbit spacing so first-stage families do not spread as far from their planet.
- [x] Fixed the root-scene nav-fade collision that was forcing celestial proxies back to opaque every frame.
- [x] Reduced first-stage celestial clutter by shrinking top-level planet scales and capping visible moons by true global orbit order instead of per-ring slot resets.
- [x] Removed the extra hidden mic `getUserMedia({audio:true})` call from `engage()` on the live page.
- [x] Added `stopMicAnalyser()` cleanup so the live page does not leak the analyser stream after voice is turned off.
- [x] Added a real `Device Access` sheet and `Phone Control` sheet to `server/jarvis_voice.html`, plus auto-open on engage.
- [x] Reworked the live-page access / assist auto-prompts to use expiring snooze state instead of permanent stale local flags.
- [x] Fixed the `/talk` page `esc is not defined` runtime error in the new access / companion sheets.

## Still Open

- [ ] The celestial boot view is much cleaner now, but it still wants one more live-browser tuning pass for final planet framing / GLB fallback balance in `server/jarvis_live.html`.
- [ ] The `/talk` / companion route now exposes access + control setup, but phone-control is still status-driven. A real end-user command flow on top of `/assist/cmd` is still missing.
- [ ] `server/services/assist_bridge.py` is still global-device status, not per-room / per-user pairing. That can falsely report a companion as “connected” for the wrong person.
- [ ] `server/jarvis_voice.html` still needs a fuller recovery path for denied permissions beyond the new access sheet.
- [ ] Lower-tier inference batching / VRAM churn audit is still pending for the Hostinger / Vast.ai model runner path.

## Next Files To Audit

- `server/jarvis_live.html`
- `server/jarvis_voice.html`
- `server/dashboard.py`
- `server/services/assist_bridge.py`
- `server/routes/jarvis_agent.py`
- lower-tier inference / GPU runner files once that audit starts
