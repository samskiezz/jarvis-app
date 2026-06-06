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
