"""WORLD RUNTIME — cybersecurity vulnerability pipeline (one REAL vertical slice).

Mirrors the earthquake slice: a working connector -> parser (standard envelope) ->
quality gate -> ontology object -> audit + lineage, against a fully-open, no-auth,
public-domain source — the NVD (National Vulnerability Database) CVE API run by NIST.

NVD data is U.S. Government public-domain, no API key required (rate-limited), terms
permit reuse — so this is legally clear to actually run.

stdlib only. Live fetch is guarded; parser/gate/writer are pure + testable offline.
"""

from __future__ import annotations

import hashlib
import json
import time
import urllib.request

try:
    from . import jarvis_ontology as ont
except Exception:  # noqa: BLE001
    ont = None  # type: ignore
try:
    from . import jarvis_os as jos
except Exception:  # noqa: BLE001
    jos = None  # type: ignore
try:
    from . import jarvis_aip as aip
except Exception:  # noqa: BLE001
    aip = None  # type: ignore

NVD_FEED = "https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=20"
SOURCE_ID = "nvd.cve"


# ── connector ────────────────────────────────────────────────────────────────
def fetch(url: str = NVD_FEED, *, timeout: float = 15.0) -> dict | None:
    """Connector: pull the raw NVD JSON. None on failure (never raises)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "APEX-WorldRuntime/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            if r.status != 200:
                return None
            return json.loads(r.read().decode("utf-8", errors="ignore"))
    except Exception:  # noqa: BLE001
        return None


# ── parser: NVD vulnerability -> standard envelope ───────────────────────────
def parse_item(v: dict) -> dict:
    """``v`` is one element of ``vulnerabilities``."""
    cve = (v or {}).get("cve", {}) or {}
    cve_id = cve.get("id", "")

    # English description
    desc = ""
    for d in cve.get("descriptions", []) or []:
        if (d or {}).get("lang") == "en":
            desc = d.get("value", "") or ""
            break
    if not desc:
        descs = cve.get("descriptions", []) or []
        if descs:
            desc = (descs[0] or {}).get("value", "") or ""

    # CVSS v3.1 base score / severity
    base_score = None
    base_severity = ""
    metrics = cve.get("metrics", {}) or {}
    for m in metrics.get("cvssMetricV31", []) or []:
        cvss = (m or {}).get("cvssData", {}) or {}
        base_score = cvss.get("baseScore")
        base_severity = cvss.get("baseSeverity", "") or ""
        break

    published = cve.get("published")
    raw_hash = hashlib.sha256(json.dumps(v, sort_keys=True, default=str).encode()).hexdigest()
    return {
        "source_id": SOURCE_ID,
        "record_id": cve_id,
        "record_type": "Vulnerability",
        "observed_at": published,
        "valid_time": cve.get("lastModified") or published,
        "location": {},
        "entities": [],
        "measurements": [
            {"name": "cvss_base", "value": base_score, "unit": "CVSSv3.1"},
        ],
        "relationships": [],
        "documents": [{"url": "https://nvd.nist.gov/vuln/detail/" + cve_id}] if cve_id else [],
        "quality": {},
        "provenance": {"source": SOURCE_ID, "feed": NVD_FEED, "fetched_ts": int(time.time() * 1000)},
        "raw_hash": raw_hash,
        "_desc": desc,
        "_severity": base_severity,
        "_score": base_score,
        "_published": published,
    }


# ── quality gate ─────────────────────────────────────────────────────────────
def quality_gate(env: dict) -> dict:
    """Return {pass, checks}. Rejects malformed records (bad id / no description)."""
    checks = {}
    rid = env.get("record_id") or ""
    checks["has_record_id"] = bool(rid)
    checks["valid_cve_id"] = isinstance(rid, str) and rid.startswith("CVE-")
    checks["has_description"] = bool((env.get("_desc") or "").strip())
    return {"pass": all(checks.values()), "checks": checks}


# ── writer: envelope -> ontology object + audit ──────────────────────────────
def _ensure_type() -> None:
    if ont is None:
        return
    try:
        ont.define_object_type("Vulnerability",
                               {"cve_id": "str", "severity": "str", "cvss": "float",
                                "description": "str", "url": "str", "record_id": "str"},
                               states=["observed", "reviewed"], initial="observed")
    except Exception:  # noqa: BLE001
        pass


def run_pipeline(*, limit: int = 50, live: bool = True, raw: dict | None = None) -> dict:
    """Full slice: fetch -> parse -> gate -> write ontology object -> audit.
    ``raw`` lets tests inject a fixed NVD response (no network)."""
    data = raw if raw is not None else (fetch() if live else None)
    if not data or not isinstance(data.get("vulnerabilities"), list):
        return {"status": "no_data", "ingested": 0, "rejected": 0}
    _ensure_type()
    ingested, rejected, samples = 0, 0, []
    for v in data["vulnerabilities"][: max(1, int(limit))]:
        env = parse_item(v)
        gate = quality_gate(env)
        if not gate["pass"]:
            rejected += 1
            continue
        if ont is not None:
            try:
                obj = ont.create_object("Vulnerability", {
                    "cve_id": env["record_id"],
                    "severity": env["_severity"],
                    "cvss": (float(env["_score"]) if env["_score"] is not None else 0.0),
                    "description": env["_desc"],
                    "url": (env["documents"][0]["url"] if env["documents"] else ""),
                    "record_id": env["record_id"],
                }, role="analyst", actor="world-runtime")
                if obj.get("status") == "created":
                    ingested += 1
                    if aip is not None:
                        aip.record_lineage("world.ingest.cve", obj["id"],
                                           actor="world-runtime", derived_from=[env["record_id"]],
                                           meta={"source": SOURCE_ID, "raw_hash": env["raw_hash"]})
                    if len(samples) < 5:
                        samples.append({"cve_id": env["record_id"], "severity": env["_severity"],
                                        "cvss": env["_score"], "id": obj["id"]})
            except Exception:  # noqa: BLE001
                rejected += 1
    if jos is not None:
        jos.audit("world.pipeline.cve", actor="world-runtime", target=SOURCE_ID,
                  meta={"ingested": ingested, "rejected": rejected})
    return {"status": "ok", "source": SOURCE_ID, "ingested": ingested,
            "rejected": rejected, "samples": samples}
