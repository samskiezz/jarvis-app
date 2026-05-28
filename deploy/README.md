# Deploy Underworld to a VPS

Single-command deploy of both the FastAPI backend and the built React/Three.js
frontend behind a Caddy reverse proxy. Designed for any Linux VPS with Docker
(Hetzner / DigitalOcean / Vultr / Linode / Fly).

## Prerequisites on the VPS

```bash
# Debian / Ubuntu
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out & back in so the group takes effect
```

## Deploy

```bash
git clone https://github.com/samskiezz/jarvis-app.git
cd jarvis-app
git checkout claude/system-audit-unification-uGOLn   # or main once merged

# Set secrets (the bearer key your web client will send, and optionally
# a Kimi K2 API key so Minions get real LLM cognition).
cat > .env <<EOF
UNDERWORLD_API_KEY=$(openssl rand -hex 24)
UNDERWORLD_KIMI_API_KEY=
EOF

docker compose up -d --build
```

That's it. The app is now live on port 80. Visit `http://<your-vps-ip>/`.

## Add a real domain + HTTPS

Edit `deploy/Caddyfile`, replace `:80` with your domain:

```caddyfile
underworld.example.com {
    ...same body...
}
```

Then `docker compose restart proxy`. Caddy auto-provisions a Let's Encrypt
cert in seconds.

## Point your existing app at this backend

If your base44 / Vercel / wherever-hosted frontend should drive this
simulation, it just needs the REST + SSE endpoints:

```
GET    /worlds                          → list
POST   /worlds                          → create
GET    /worlds/{id}                     → single world
GET    /worlds/{id}/minions             → all Minions
GET    /worlds/{id}/map                 → heightmap
GET    /worlds/{id}/latest-actions      → per-Minion last action
GET    /worlds/{id}/population          → time-series stats
GET    /worlds/{id}/events?limit=50     → recent events
GET    /worlds/{id}/stream              → SSE event stream
POST   /worlds/{id}/advance             → run N ticks
PATCH  /worlds/{id}/auto-advance        → toggle auto-tick
```

All require an `Authorization: Bearer <UNDERWORLD_API_KEY>` header.

## Logs / state / backups

```bash
docker compose logs -f underworld     # live logs
docker compose exec underworld sqlite3 /data/underworld.db .tables
docker run --rm -v jarvis-app_underworld_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/underworld-$(date +%F).tar.gz -C /data .
```

## Generating new assets from text prompts (free)

The repo ships `underworld/scripts/generate_glb.py`, which turns a text
prompt into a GLB using only free public services (no API key required):

1. **Pollinations.ai** — text → image (free, no key, no quota).
2. **Hugging Face Spaces** — image → 3D GLB. Free ZeroGPU pool, ~5 min
   per IP per day for anonymous users. Set `HF_TOKEN` in env for more.
   Three providers wired in: TripoSR, InstantMesh, Hunyuan3D-2.

```bash
pip install gradio_client
python underworld/scripts/generate_glb.py "low poly fantasy mushroom"
python underworld/scripts/generate_glb.py --provider hunyuan "weathered medieval barrel"
python underworld/scripts/generate_glb.py --image /path/to/img.jpg "stone fountain"
```

Outputs land in `underworld/web/public/models/generated/<slug>.glb` and
`manifest.json` updates atomically. The scene loads `manifest.json` at
mount time and scatters every entry as hero decor near the plaza POIs —
no code change needed when you add a new asset.

Quality ladder (free, by provider):
- `triposr` — fast, vertex-coloured, ~3 MB per asset (proven working).
- `instantmesh` — multi-view + mesh fusion, higher fidelity, slower.
- `hunyuan` — Tencent's flagship, textured output, highest quota cost.

This is the pipeline you wanted: 1000+ unique meshes generated from
text prompts, free, no subscription, dropped straight into the world.

## Where the Sims-4 ceiling is

The bundled web client is a Three.js scene running PBR materials, splat-mapped
terrain, water with planar reflections, N8AO + soft shadows + bloom + ACES.
**That is the modern WebGL ceiling for in-browser rendering.** Going beyond
it (photoreal characters, full ray tracing, Nanite-style detail) requires
leaving the browser — an Unreal Engine 5 client that talks to this same REST
API. Sketch in `deploy/unreal-client-notes.md` (TODO).
