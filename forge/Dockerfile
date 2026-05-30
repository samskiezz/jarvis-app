# APEX Forge agent image. Build from the repo root:
#   docker build -t forge-agent:latest -f forge/Dockerfile .
FROM python:3.11-slim

# git is required (the agent works on branches + commits); gh is optional for PRs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/forge
COPY forge/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY forge/ ./forge/

# Safe defaults: dry-run, no push, hourly fresh-context restart.
ENV APP_ROOT=/workspace \
    FORGE_APPLY=0 \
    FORGE_PUSH=0 \
    FORGE_OPEN_PR=0 \
    FORGE_MAX_RUNTIME_S=3600 \
    OLLAMA_URL=http://ollama:11434 \
    FORGE_MODEL=deepseek-coder:6.7b \
    PYTHONUNBUFFERED=1

# The app to evolve is mounted/cloned at /workspace (see deploy/forge-k3s.yaml).
ENTRYPOINT ["python", "-m", "forge.forge_agent"]
