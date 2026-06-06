
from __future__ import annotations
import json, datetime, hashlib, urllib.request, urllib.parse, csv, io
from typing import Any, Dict
from .envelope import build_envelope, stable_hash

def _blocked(source_id: str, connector_type: str, reason: str, **extra) -> Dict[str, Any]:
    payload = {"source_id": source_id, "connector_type": connector_type, "blocked": True, "reason": reason, **extra}
    return {"ok": False, "blocked": True, "reason": reason, "payload": payload, "raw_hash": stable_hash(payload)}

def rest_json_fetch(source_id: str, url: str, *, live_fetch_allowed: bool = False, terms_approved: bool = False, headers: Dict[str, str] | None = None, timeout: int = 30, **kwargs) -> Dict[str, Any]:
    if not terms_approved:
        return _blocked(source_id, "rest_json", "terms/rate-limit/legal review not approved", url=url)
    if not live_fetch_allowed:
        payload = {"source_id": source_id, "url": url, "mode": "planned_no_live_fetch", "fetched_at": datetime.datetime.now(datetime.UTC).isoformat()}
        return {"ok": True, "blocked": False, "payload": payload, "record_id": f"{source_id}:{stable_hash(payload)[:12]}", "raw_hash": stable_hash(payload)}
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        body = res.read()
    text = body.decode("utf-8", errors="replace")
    try:
        data = json.loads(text)
    except Exception:
        data = {"text": text}
    payload = {
        "source_id": source_id,
        "url": url,
        "status": getattr(res, "status", None),
        "headers": dict(getattr(res, "headers", {})),
        "content": data,
        "fetched_at": datetime.datetime.now(datetime.UTC).isoformat(),
        "content_sha256": hashlib.sha256(body).hexdigest(),
    }
    return {"ok": True, "blocked": False, "payload": payload, "record_id": f"{source_id}:{stable_hash(payload)[:12]}", "raw_hash": stable_hash(payload)}

def ckan_package_search(source_id: str, base_url: str, query: str = "*", **kwargs) -> Dict[str, Any]:
    url = base_url.rstrip("/") + "/api/3/action/package_search?" + urllib.parse.urlencode({"q": query})
    return rest_json_fetch(source_id, url, **kwargs)

def socrata_query(source_id: str, endpoint: str, soql: str = "select * limit 100", **kwargs) -> Dict[str, Any]:
    url = endpoint + ("&" if "?" in endpoint else "?") + urllib.parse.urlencode({"$query": soql})
    return rest_json_fetch(source_id, url, **kwargs)

def sparql_query(source_id: str, endpoint: str, query: str, **kwargs) -> Dict[str, Any]:
    headers = {"Accept": "application/sparql-results+json"}
    url = endpoint + ("&" if "?" in endpoint else "?") + urllib.parse.urlencode({"query": query, "format": "json"})
    return rest_json_fetch(source_id, url, headers=headers, **kwargs)

def rss_read(source_id: str, url: str, **kwargs) -> Dict[str, Any]:
    return rest_json_fetch(source_id, url, **kwargs)

def document_download(source_id: str, url: str, **kwargs) -> Dict[str, Any]:
    return rest_json_fetch(source_id, url, **kwargs)

def generic_connector(connector_type: str, source_id: str = "unknown", url: str = "", **kwargs) -> Dict[str, Any]:
    connector_type = (connector_type or "generic").lower()
    if connector_type in {"rest_json", "rest", "arcgis", "stac", "sdmx", "oai_pmh", "websocket", "kafka", "ftp_s3"}:
        return rest_json_fetch(source_id, url or kwargs.get("endpoint", ""), **kwargs)
    if connector_type == "ckan":
        return ckan_package_search(source_id, url or kwargs.get("base_url", ""), query=kwargs.get("query", "*"), **kwargs)
    if connector_type == "socrata":
        return socrata_query(source_id, url or kwargs.get("endpoint", ""), soql=kwargs.get("soql", "select * limit 100"), **kwargs)
    if connector_type == "sparql":
        return sparql_query(source_id, url or kwargs.get("endpoint", ""), query=kwargs.get("query", "SELECT * WHERE {?s ?p ?o} LIMIT 10"), **kwargs)
    return _blocked(source_id, connector_type, "unknown connector type", url=url)

def to_envelope(fetch_result: Dict[str, Any], record_type: str = "connector_fetch") -> Dict[str, Any]:
    payload = fetch_result.get("payload", fetch_result)
    return build_envelope(
        source_id=payload.get("source_id", "unknown"),
        record_type=record_type,
        payload=payload,
        provenance={"source_id": payload.get("source_id", "unknown"), "url": payload.get("url", "")},
        quality={"valid": bool(fetch_result.get("ok")), "blocked": bool(fetch_result.get("blocked")), "connector": True},
    )
