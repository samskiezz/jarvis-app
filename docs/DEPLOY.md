# Deploying Jarvis Palantir

This repo is the **real** app (the Base44 deploy is a separate, code-less world).
The frontend is a Vite SPA in `src/`; the backend is the FastAPI app in `server/`.
Deploying means: host the static frontend, and point it at a running backend via
`VITE_API_BASE_URL`.

Config files included: `vercel.json` (Vercel) and `netlify.toml` (Netlify). Both
build with `npm run build` → `dist/` and add the SPA fallback so client-side
routes like `/KGIK-Brain` resolve.

---

## 1. Deploy the frontend

### Option A — Vercel (recommended)
1. Push is already on GitHub (`samskiezz/jarvis-app`, branch `main`).
2. At vercel.com → **Add New → Project → Import** `samskiezz/jarvis-app`.
3. Vercel auto-detects Vite + reads `vercel.json`. Leave build settings as-is.
4. **Environment Variables** → add:
   - `VITE_API_BASE_URL` = your backend URL (see step 2). 
   - `VITE_API_KEY` = the backend's `JARVIS_API_KEY` (optional; public read
     endpoints work without it).
5. **Deploy.** You get a `*.vercel.app` URL.

CLI alternative:
```bash
npm i -g vercel
vercel            # first run links the project
vercel --prod     # production deploy
```

### Option B — Netlify
1. app.netlify.com → **Add new site → Import an existing project** →
   `samskiezz/jarvis-app`.
2. Netlify reads `netlify.toml` (build `npm run build`, publish `dist`).
3. **Site settings → Environment variables**: add `VITE_API_BASE_URL`
   (and optionally `VITE_API_KEY`).
4. **Deploy site.**

---

## 2. The backend (required for live data)

The pages call the FastAPI backend in `server/` (live intel, entity CRUD, the
analyst SSE stream). Without it the app loads but data calls fail / fall back to
empty states. Host it anywhere that runs Python (Render, Railway, Fly.io, a VPS):

```bash
pip install -r server/requirements.txt
uvicorn server.main:app --host 0.0.0.0 --port 8000   # run from the repo root
```

Set on the backend host:
- `JARVIS_API_KEY` — bearer key the frontend sends (match `VITE_API_KEY`).
- `KIMI_API_KEY` — optional; enables the live Kimi K2 analyst (otherwise the
  local analyst answers).

Then set `VITE_API_BASE_URL` on the frontend host to the backend's public URL
and redeploy the frontend.

> CORS: set `JARVIS_CORS_ORIGINS` on the backend host to a comma-separated list
> including your Vercel/Netlify domain (e.g.
> `JARVIS_CORS_ORIGINS=https://jarvis-app.vercel.app`), or requests from the
> deployed frontend will be blocked.

---

## 3. Frontend-only (quick preview, no backend)
You can deploy just the frontend to see the full UI and navigation. Data-backed
panels show empty/seed states until `VITE_API_BASE_URL` points at a live backend.

## Local
```bash
npm install
npm run dev      # http://localhost:5173, expects backend at http://localhost:8000
npm run build && npm run preview   # production build preview
```
