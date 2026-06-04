import os

API_KEY = os.environ.get("JARVIS_API_KEY", "dev-key")
KIMI_BASE_URL = os.environ.get("KIMI_BASE_URL", "https://api.moonshot.ai/v1")
KIMI_API_KEY = os.environ.get("KIMI_API_KEY", "")
KIMI_MODEL = os.environ.get("KIMI_MODEL", "kimi-k2-0905-preview")

# When false (default), the public read endpoints (getLiveIntel, analystChat,
# streams) work without a bearer so the local/playable build is alive out of the
# box. Set JARVIS_REQUIRE_AUTH=true to lock everything behind the API key.
REQUIRE_AUTH = os.environ.get("JARVIS_REQUIRE_AUTH", "false").lower() == "true"

CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "JARVIS_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if o.strip()
]

# ── Optional GPU prediction tier (PATTERN ORACLE accelerator) ─────────────────
# When PREDICT_GPU_URL is set, the JARVIS side dispatches forecasts to a remote
# PyTorch+CUDA inference server (see deploy/gpu/). Empty (default) => everything
# runs locally on CPU, unchanged. PREDICT_GPU_KEY is an optional bearer token;
# PREDICT_GPU_MODEL names the remote model variant to request (informational).
PREDICT_GPU_URL = os.environ.get("PREDICT_GPU_URL", "")
PREDICT_GPU_KEY = os.environ.get("PREDICT_GPU_KEY", "")
PREDICT_GPU_MODEL = os.environ.get("PREDICT_GPU_MODEL", "")

USGS_FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"
# open.er-api.com: free, no API key, daily FX rates with AUD/USD/AED/etc.
FX_FEED = "https://open.er-api.com/v6/latest/AUD"
LIVE_INTEL_TTL_SECONDS = 60
