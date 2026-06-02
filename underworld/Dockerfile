# Underworld — single-image deploy.
# Stage 1 builds the 3D web app; stage 2 runs the FastAPI backend which serves
# both the API and the built web bundle (web/dist) on one port. So one container
# = the whole thing: backend + 3D viewer.

# ── Stage 1: build the React/Three.js web app ────────────────────────────────
FROM node:20-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm ci || npm install
COPY web/ ./
RUN npm run build           # → /web/dist

# ── Stage 2: Python backend that serves API + the built bundle ───────────────
FROM python:3.11-slim AS app
WORKDIR /app

# System deps kept minimal; sqlite ships with python.
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt ./
RUN pip install -r requirements.txt

# Backend source + data (knowledge base JSONs the seeder loads on boot).
COPY server/ ./server/
COPY data/ ./data/
COPY __init__.py ./__init__.py

# The built web bundle goes where main.py looks for it: ../web/dist relative to
# server/, i.e. /app/web/dist.
COPY --from=web /web/dist ./web/dist

# Persisted SQLite DB lives on a mounted volume in production.
ENV UNDERWORLD_DB_PATH=/data/underworld.db \
    UNDERWORLD_SCHEDULER_ENABLED=true \
    PORT=8000
VOLUME ["/data"]
EXPOSE 8000

# Honour the platform-provided $PORT (Render/Railway/Fly set it).
CMD ["sh", "-c", "uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
