# Multi-stage build: web bundle then python runtime that serves both the
# FastAPI backend and the built static UI.

# --- 1. Build the React/Vite frontend ---
FROM node:22-alpine AS web
WORKDIR /web
COPY underworld/web/package.json underworld/web/package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY underworld/web/ ./
# Backend lives at /api/ when served through the same origin in production.
ENV VITE_UNDERWORLD_API_URL=/api
ENV VITE_UNDERWORLD_API_KEY=__INJECTED_AT_RUNTIME__
RUN npm run build

# --- 2. Python runtime ---
FROM python:3.12-slim AS runtime
WORKDIR /app

# System deps for sqlite + libffi (some pydantic/cryptography deps)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libffi-dev libssl-dev curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY underworld/server/requirements.txt /tmp/req.txt
RUN pip install --no-cache-dir -r /tmp/req.txt

COPY underworld/ /app/underworld/
COPY --from=web /web/dist /app/underworld/web/dist

ENV PYTHONPATH=/app
ENV UNDERWORLD_API_KEY=change-me
ENV UNDERWORLD_DB_PATH=/data/underworld.db
VOLUME ["/data"]

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD curl -fs http://localhost:8000/ || exit 1
CMD ["uvicorn", "underworld.server.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
