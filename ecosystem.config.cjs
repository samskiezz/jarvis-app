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
          'https://vscode.projectsolar.cloud,http://76.13.176.135:8001,http://76.13.176.135:5173,http://localhost:5173,http://localhost:8001',
        // ── LLM brain: Llama on the vast.ai GPU box (Ollama @ 211.72.13.201,
        //    container :8080 -> external :41137). Native API drives llm_research;
        //    the OpenAI-compatible /v1 drives the analyst chat (kimi client).
        OLLAMA_HOST: 'http://211.72.13.201:41137',
        OLLAMA_MODEL: 'llama3.1:8b',
        // Semantic-index embeddings on the GPU (Ollama /api/embed). Unset => the
        // offline hashing-TF-IDF embedder (CPU) is used, unchanged.
        OLLAMA_EMBED_MODEL: 'nomic-embed-text',
        // Self-enrichment: build + GPU-embed + LLM-enrich the KB on boot and every
        // 30 min. The Llama brain summarises a batch of scraped docs each cycle.
        AUTOBUILD_ON_START: 'true',
        AUTOBUILD_INTERVAL_S: '1800',
        AUTOBUILD_SCRAPE_BATCHES: '2',
        AUTOBUILD_ENRICH_LIMIT: '12',
        // Continuous deep enrichment loop — keeps the GPU chewing the doc backlog
        // between full builds (4 LLM passes/doc: summary/entities/relations/questions).
        ENRICH_LOOP: 'true',
        ENRICH_LOOP_INTERVAL_S: '120',
        ENRICH_LOOP_BATCH: '8',
        ENRICH_DEPTH: '3',
        ENRICH_WORKERS: '2',
        // OCR for scraped PDFs/images — PaddleOCR (GPU-capable) primary, Tesseract
        // fallback. Graceful no-op until the engines are installed on the box.
        OCR_ENGINE: 'auto',
        OCR_LANG: 'en',
        KIMI_BASE_URL: 'http://211.72.13.201:41137/v1',
        KIMI_API_KEY: 'ollama',
        KIMI_MODEL: 'llama3.1:8b',
      },
    },
    {
      name: 'jarvis-frontend',
      cwd: '/opt/jarvis-app-1',
      script: 'node_modules/vite/bin/vite.js',
      args: '--host 0.0.0.0 --port 5173',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
