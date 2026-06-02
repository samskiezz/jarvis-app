# Deploying Underworld (the 3D minion world)

The backend serves **both** the API and the built 3D web app on one port, so the
whole thing is a **single container / single deploy**. A persistent disk holds
the SQLite DB so worlds survive restarts and keep ticking.

Files in this folder do the work:
- `Dockerfile` — multi-stage: Node builds `web/` → Python runs the backend serving it.
- `render.yaml` — one-click Render blueprint (with persistent disk).
- `fly.toml` — Fly.io config (alternative).
- `requirements.txt` — backend runtime deps.

---

## Option A — Render (easiest, recommended)
1. Make sure this repo is on GitHub (it is: `samskiezz/jarvis-app`).
2. Go to https://render.com → **New → Blueprint** → select the repo.
3. Render reads `underworld/render.yaml`, builds the Dockerfile, attaches a 1 GB
   disk at `/data`, and starts it.
4. It generates `UNDERWORLD_API_KEY` automatically — copy it from the dashboard
   (Environment tab). You'll paste it into the app's login screen once.
5. **Optional — real LLM minds:** in the dashboard set `UNDERWORLD_KIMI_API_KEY`
   to your Moonshot key. Without it, minions run the offline heuristic and still
   live, learn, breed, and discover — just less richly.
6. Open the Render URL. Enter the bearer key. Create a world. Watch it.

## Option B — Fly.io
```bash
cd underworld
fly launch --no-deploy                 # accept the included fly.toml
fly volumes create underworld_data --size 1
fly secrets set UNDERWORLD_API_KEY=$(openssl rand -hex 24)
fly secrets set UNDERWORLD_KIMI_API_KEY=sk-...   # optional, for LLM minds
fly deploy
```

## Option C — any Docker host (your own VPS, Railway, etc.)
```bash
cd underworld
docker build -t underworld .
docker run -d -p 8000:8000 \
  -v underworld_data:/data \
  -e UNDERWORLD_API_KEY=your-secret-key \
  -e UNDERWORLD_SCHEDULER_ENABLED=true \
  -e UNDERWORLD_KIMI_API_KEY=sk-...   `# optional` \
  --name underworld underworld
# open http://localhost:8000
```

---

## Using it
1. Open the URL → enter your `UNDERWORLD_API_KEY` on the login screen.
2. **Command Centre** → create a world (pick a CPC patent class, e.g. `A61K`
   pharma, `G06N` AI, `H02J` power; set starting population and turn on
   *auto-advance*).
3. Open the world → the **3D viewer**: drag to orbit, scroll to zoom, click a
   minion to inspect its guild, thoughts, DNA, and memories.
4. With auto-advance on, the scheduler ticks the world continuously — minions
   act, study, socialise, breed, discover, and (eventually) invent on their own.

## Notes
- **Persistence:** the DB lives on the mounted volume (`/data`). Restarts keep
  your worlds and their history. (Locally without a volume, it resets.)
- **Cost:** Render Starter / Fly with 1 running machine keeps the world ticking
  24/7. Free tiers sleep when idle (the world pauses, then resumes on next hit).
- **LLM minds vs heuristic:** set `UNDERWORLD_KIMI_API_KEY` for real per-minion
  reasoning; otherwise the offline heuristic keeps the civilisation alive.
