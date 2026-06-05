
from __future__ import annotations
from typing import Dict, Any
from urllib.parse import urlparse
import socket, time

def check_source_health(source: Dict[str, Any]) -> Dict[str, Any]:
    url = source.get("url") or source.get("official_url") or ""
    parsed = urlparse(url)
    host = parsed.hostname
    if not host:
        return {"source_id": source.get("source_id",""), "ok": False, "reason": "invalid URL"}
    start = time.time()
    try:
        socket.gethostbyname(host)
        latency_ms = int((time.time() - start) * 1000)
        return {"source_id": source.get("source_id",""), "ok": True, "host": host, "dns_latency_ms": latency_ms}
    except Exception as e:
        return {"source_id": source.get("source_id",""), "ok": False, "host": host, "reason": str(e)}
