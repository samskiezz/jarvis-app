// PM2 process manifest for the Jarvis app.
//   pm2 start ecosystem.config.cjs   # start both services
//   pm2 save                         # persist across reboots (with `pm2 startup`)
//   pm2 logs                         # tail logs
// Backend = FastAPI (uvicorn, venv). Frontend = Vite dev server.
module.exports = {
  apps: [
    {
      name: 'jarvis-backend',
      cwd: '/opt/jarvis-app-1',
      script: '.venv/bin/python',
      args: '-m uvicorn server.main:app --host 0.0.0.0 --port 8001',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      env: {
        JARVIS_API_KEY: 'dev-key',
        JARVIS_CORS_ORIGINS:
          'https://app.projectsolar.cloud,https://projectsolar.cloud,https://vscode.projectsolar.cloud,http://76.13.176.135:8001,http://76.13.176.135:5173,http://localhost:5173,http://localhost:8001',
        // ── LLM brain: Llama on the vast.ai GPU box (Ollama @ 211.72.13.201,
        //    container :8080 -> external :41137). Native API drives llm_research;
        //    the OpenAI-compatible /v1 drives the analyst chat (kimi client).
        OLLAMA_HOST: 'http://127.0.0.1:11434',
        OLLAMA_MODEL: 'llama3.1:8b',
        // Semantic-index embeddings on the GPU (Ollama /api/embed). Unset => the
        // offline hashing-TF-IDF embedder (CPU) is used, unchanged.
        OLLAMA_EMBED_MODEL: 'nomic-embed-text',
        // Self-enrichment: build + GPU-embed + LLM-enrich the KB on boot and every
        // 30 min. The Llama brain summarises a batch of scraped docs each cycle.
        // ROBUSTNESS: the heavy scrape+GPU-embed+enrich BUILD must NOT run inside the API process
        // on boot — it spikes CPU/RAM (native libs), GIL-starves uvicorn, and crashed the API
        // ("Aborted!") so it never bound :8001. Moved to the separate `jarvis-worker` process so the
        // API boots light + serves reliably. (Set AUTOBUILD_ON_START=true only on the worker.)
        AUTOBUILD_ON_START: 'false',
        AUTOBUILD_INTERVAL_S: '900',
        AUTOBUILD_SCRAPE_BATCHES: '4',
        AUTOBUILD_ENRICH_LIMIT: '24',
        // Continuous deep enrichment loop — runs in the WORKER, not the API (same reason).
        ENRICH_LOOP: 'false',
        ENRICH_LOOP_INTERVAL_S: '30',
        ENRICH_LOOP_BATCH: '24',
        ENRICH_DEPTH: '3',
        ENRICH_WORKERS: '4',
        // OCR for scraped PDFs/images — PaddleOCR primary, Tesseract fallback, and the
        // GPU vision model (llama3.2-vision on the box) for scanned docs.
        OCR_ENGINE: 'auto',
        OCR_LANG: 'en',
        OCR_VISION_MODEL: 'minicpm-v',
        KIMI_BASE_URL: 'http://127.0.0.1:11434/v1',
        KIMI_API_KEY: 'ollama',
        KIMI_MODEL: 'llama3.1:8b',
        // The GPU-busy research autopilot also runs in the WORKER, not the API (robust API boot).
        LLM_AUTOPILOT_ENABLE: 'false',
        // Conservative autopilot: proactive notifications are the one always-on essential
        // (cheap, rule-based). The optional LLM synthesis stays off unless PROACTIVE_LLM_SUMMARY=1.
        PROACTIVE_LOOP_ENABLED: 'true',
        PROACTIVE_LOOP_INTERVAL: '180',
      },
    },
    {
      name: 'jarvis-frontend',
      cwd: '/opt/jarvis-app-1',
      // Run the WRAPPER (scripts/serve-frontend.sh), not vite directly: pm2's `args` field was
      // silently dropping `preview`, leaving it in DEV mode — whose file-watcher scans the multi-GB
      // monorepo, pins CPU, and wedges the page blank. The wrapper hard-codes `vite preview` so the
      // mode is GUARANTEED. Static preview = ~0% idle, instant loads, and it serves whatever is in
      // dist/ per-request — so the zero-downtime deploy (scripts/safe-deploy-frontend.sh, which
      // builds to a STAGING dir then atomic-swaps dist) goes live with NO restart and NO downtime.
      // To ship UI changes:  scripts/safe-deploy-frontend.sh   (rollback:  … rollback)
      script: 'scripts/serve-frontend.sh',
      interpreter: 'bash',
      autorestart: true,
      max_restarts: 10,
    },
    {
      // Underworld minions sim (FastAPI) — Llama-driven, auto-ticking scheduler.
      name: 'underworld-backend',
      cwd: '/opt/jarvis-app-1/underworld',
      script: '/opt/jarvis-app-1/.venv/bin/python',
      args: '-m uvicorn server.main:app --host 0.0.0.0 --port 8091',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      env: {
        PYTHONPATH: '/opt/jarvis-app-1',          // so `import underworld` resolves in the sim tick
        UNDERWORLD_API_KEY: 'dev-key',
        UNDERWORLD_LLM_BASE_URL: 'http://127.0.0.1:11434/v1',
        UNDERWORLD_LLM_MODEL: 'llama3.1:8b',
        UNDERWORLD_LLM_API_KEY: 'ollama',
        // The aliveness loop: Global-Workspace cognition + sentience arc over hot minions.
        COGNITION_LOOP: '1',
        COGNITION_INTERVAL_S: '20',
        COGNITION_HOT_N: '24',
      },
    },
    {
      // Underworld 3D world (Vite preview of the built R3F app).
      name: 'underworld-web',
      cwd: '/opt/jarvis-app-1/underworld/web',
      script: 'npm',
      args: 'run preview -- --host 0.0.0.0 --port 5180',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
    },
    {
      // Persistent GLB loader — generates (gpt-image-1, medium) + converts (Tripo, budget-
      // guarded) the full JARVIS asset set to completion, resumable, idles when converged.
      // Survives session-close + reboot (pm2 save / pm2 startup).
      name: 'jarvis-glb-loader',
      cwd: '/opt/jarvis-app-1',
      script: 'underworld/scripts/jarvis_batch_run.sh',
      interpreter: 'bash',
      autorestart: true,
      max_restarts: 50,
    },
    {
      // Brain auto-recovery: detects dead/offline Vast brain box, auto-disposes clearly-dead
      // boxes (offline + port unmapped), auto-provisions a replacement up to the cost cap.
      // Cost gates: BRAIN_PROVISION_MAX_PRICE caps per-attempt $/hr; PROVISION_COOLDOWN_S
      // throttles to ≤4 provisions/hr. Default tier = standard (24GB qwen2.5:14b ~$0.18/hr).
      name: 'brain-watchdog',
      cwd: '/opt/jarvis-app-1',
      script: 'scripts/brain_watchdog.py',
      interpreter: 'python3',
      autorestart: true,
      max_restarts: 50,
      env: {
        BRAIN_WATCHDOG_AUTO_PROVISION: '1',
        BRAIN_WATCHDOG_ALLOW_DISPOSE: '1',
        BRAIN_WATCHDOG_PROVISION_COOLDOWN_S: '900',
        BRAIN_WATCHDOG_INTERVAL_S: '60',
        BRAIN_WATCHDOG_DISPOSE_AFTER_S: '300',
        BRAIN_PROVISION_MAX_PRICE: '0.25',
        BRAIN_DEFAULT_TIER: 'standard',
      },
    },
    {
      // Vast orphan-spawn kill-switch: external kgik.base44.app holds the same VAST_API_KEY
      // and spawns clustering instances on its own; this kills every non-whitelisted box
      // within ~30s. Whitelist via VAST_KEEP_IDS or label substrings (ue5/pixelstream/brain).
      name: 'vast-kill-switch',
      cwd: '/opt/jarvis-app-1',
      script: 'scripts/vast_kill_switch.py',
      interpreter: 'python3',
      autorestart: true,
      max_restarts: 50,
      env: {
        VAST_KILL_INTERVAL_S: '30',
      },
    },
    {
      // Generic health probe runner — 13+ critical surfaces (backend, dashboard, ollama,
      // claude_code_runs API, underworld.db integrity, disk free, watchdog freshness, etc).
      // Writes server/data/health.json and appends state changes to vast_events.jsonl.
      name: 'health-watchdog',
      cwd: '/opt/jarvis-app-1',
      script: 'scripts/health_watchdog.py',
      interpreter: 'python3',
      autorestart: true,
      max_restarts: 50,
    },
    {
      // Burst-disposable watcher: detects burst (non-brain, non-ue5) Vast boxes that have
      // signalled completion via /workspace/.done and auto-disposes them after Wasabi sync.
      // Prevents the 70b/140b burst boxes from lingering and billing after task end.
      name: 'burst-watcher',
      cwd: '/opt/jarvis-app-1',
      script: 'scripts/burst_watcher.py',
      interpreter: 'python3',
      autorestart: true,
      max_restarts: 50,
      env: {
        BURST_WATCHER_INTERVAL_S: '60',
      },
    },
  ],
};
