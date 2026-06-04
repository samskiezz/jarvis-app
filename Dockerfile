# APEX backend (FastAPI) — production image.
# Serves server.main:app via uvicorn. Mirrors server/requirements.txt exactly.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# Install Python deps first for better layer caching.
COPY server/requirements.txt ./server/requirements.txt
RUN python3 -m pip install --upgrade pip \
    && python3 -m pip install -r server/requirements.txt

# App is imported as the package `server` (server.main:app). server/__init__.py
# makes it importable from the /app working directory.
COPY server/ ./server/

EXPOSE 8000

# Honour a platform-provided $PORT (Fly/Render/Railway) and default to 8000.
CMD ["sh", "-c", "uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
