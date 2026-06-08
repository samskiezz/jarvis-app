# ☀️ Morning readme — what ran while you slept

## ✅ Running now (open these on your phone)
- **Home / chooser** — http://76.13.176.135:5173/  (JARVIS | UNDERWORLD, animated video cards, 3D tilt)
- **Underworld 3D world** — http://76.13.176.135:5180/  (WebGL, **live minions walking** from the sim)
- **Fleet Control panel** — in the app, search **“Fleet Control”** (Command group). Toggle/restart every
  pm2 service with live CPU/mem/uptime — your “manage while I sleep” panel.

## ✅ Done this session
- **Bootloaders**: click JARVIS → its video plays IN FULL (lady speaks once, then music-only loop) before
  the cinematic reveals; click UNDERWORLD → bootloader video + cavernous theme + light-flashes timed to the
  music → the world. Both fill the whole phone (object-cover).
- **Zero-downtime deploys**: `scripts/safe-deploy-frontend.sh` builds to staging then atomic-swaps — the app
  NEVER goes down during a build again. Rollback: `… rollback`. Frontend is locked to fast static `preview`
  via `scripts/serve-frontend.sh` (no more dev-mode blank-page wedge).
- **Self-healing**: every service has pm2 `autorestart` — crashes auto-recover overnight. `pm2 save` persisted.
- **Bible**: Book V (UE5 conformance) complete; the durable Kimi/GPU review loop is in place.

## 🌙 The overnight daemon (detached — survived the chat closing)
`scripts/overnight-finish.sh` → progress in `OVERNIGHT-STATUS.txt`. It: builds the Underworld web app to
fast static preview (so :5180 loads instantly, not the slow dev cold-load), deploys the Fleet Control panel,
and `pm2 save`s. One build at a time, validates before every swap, never stops a service.

## ⚠️ The honest truth on UE5 (you asked me to research headless + execute)
- UE 5.5.4 **is installed** at `/opt/UnrealEngine` and the Underworld C++ module is built.
- **It can't render here**: (1) UE refuses to run as root, so it needs a non-root user — I set that up, but
  (2) a project **plugin fails to load headless** (PixelStreaming/MetaHuman), and most importantly
  (3) **this box has NO GPU** — UE rendering/pixel-streaming needs one. The Vast 2×4090 box is busy serving
  the LLM brain and isn’t imaged for Vulkan+NVENC pixel-streaming.
- So the **visible, running 3D Underworld is the WebGL one on :5180** (minions walking, live). The UE5
  high-fidelity path is code-complete + has exact build commands in `underworld/deploy/ue5-project/
  UE5-FINISH-RUNBOOK.md`; it needs a GPU render box to actually stream. I did NOT fake a UE5 render.

## Check in the morning
`cat OVERNIGHT-STATUS.txt` · `pm2 ls` · or just open the Fleet Control panel.
