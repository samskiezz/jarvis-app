import os

API_KEY = os.environ.get("JARVIS_API_KEY", "dev-key")
KIMI_BASE_URL = os.environ.get("KIMI_BASE_URL", "https://api.moonshot.ai/v1")
KIMI_API_KEY = os.environ.get("KIMI_API_KEY", "")
KIMI_MODEL = os.environ.get("KIMI_MODEL", "kimi-k2-0905-preview")

CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "JARVIS_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if o.strip()
]

USGS_FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"
YAHOO_QUOTE = "https://query1.finance.yahoo.com/v7/finance/quote"
LIVE_INTEL_TTL_SECONDS = 60
