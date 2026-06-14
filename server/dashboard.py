#!/usr/bin/env python3
"""JARVIS LOADER DASHBOARD — a standalone live metrics UI on its own port.

Plain-English panels so you can SEE the machine working:
  • LIVE RUNNERS    — which auto-runners are working right now (friendly names + on/off).
  • ALWAYS GROWING  — totals climbing (topics / documents / measurements / notes / ontology / vectors)
                      with "+N in the last hour" deltas = proof the pipeline is actually growing.
  • JUST LEARNED    — the newest notes + topics by name (live proof it's learning new things).
  • ONTOLOGY REGISTER — every object type and how many of each (the knowledge graph at a glance).
  • GLB PIPELINE    — 3D assets generated + the latest ones by name.
  • VAST GPU BOX    — VRAM + models resident + reachability.
  • VPS SERVER      — CPU %, RAM, disk, load.

Stdlib only (http.server) — zero deps, isolated from the API so it can never crash it.
Run:  cd /opt/jarvis-app-1 && .venv/bin/python -m server.dashboard   (DASHBOARD_PORT env, default 8095)
"""
from __future__ import annotations

import glob
import concurrent.futures
import http.server
import json
import mimetypes
import os
import secrets
import sqlite3
import sys
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("DASHBOARD_PORT", "8095"))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _inventory_counts() -> dict:
    """Live single-source-of-truth counts from the full A-Z inventory CSV."""
    counts = {"total": 0, "api_endpoints": 0, "services": 0, "frontend_functions": 0,
              "overlays": 0, "dock_apps": 0, "db_tables": 0, "planes": 0, "modules": 0}
    try:
        csv_path = os.path.join(ROOT, "docs", "JARVIS_FULL_FEATURE_INVENTORY.csv")
        import csv
        with open(csv_path, encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        counts["total"] = len(rows)
        counts["api_endpoints"] = sum(1 for r in rows if r.get("category") == "API Endpoint")
        counts["services"] = sum(1 for r in rows if "Service" in (r.get("category") or "") or "Core Backend" in (r.get("category") or ""))
        counts["frontend_functions"] = sum(1 for r in rows if r.get("category") == "Frontend / JARVIS Live" and r.get("type") == "javascript-function")
        counts["overlays"] = sum(1 for r in rows if r.get("category") == "Frontend / Overlay or Mini-app")
        counts["dock_apps"] = sum(1 for r in rows if r.get("category") == "Frontend / Dock App")
        counts["db_tables"] = sum(1 for r in rows if r.get("category") == "Database Table")
        counts["planes"] = sum(1 for r in rows if "Runtime Plane" in (r.get("category") or ""))
        counts["modules"] = sum(1 for r in rows if "Runtime Module" in (r.get("category") or ""))
    except Exception as e:  # noqa: BLE001
        counts["error"] = str(e)
    return counts
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)  # so `from server.services import ...` works for task/media endpoints
BRAIN_DB = os.path.join(ROOT, "server/data/brain.db")
DOCS_DB = os.path.join(ROOT, "server/data/documents.db")
VEC_DB = os.path.join(ROOT, "server/data/vectors.db")
TL_DB = os.path.join(ROOT, "server/data/tiered_llm.db")
FB_DB = os.path.join(ROOT, "server/data/feedback.db")
GLB_DIR = os.path.join(ROOT, "underworld/web/public/models/generated")
BOX = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
BACKEND_BASE = os.environ.get("JARVIS_BACKEND_URL", "http://127.0.0.1:8001").rstrip("/")
DELIVERY_LEDGER_PATH = os.path.join(ROOT, "docs", "JARVIS_EXECUTION_LEDGER_2026-06-11.json")
BACKEND_GET_PROXY_PREFIXES = (
    "/v1/jarvis/architecture",
    "/v1/jarvis/memory",
    "/v1/jarvis/notifications",
    "/v1/datasets",
    "/v1/reports",
    "/v1/dashboards",
    "/v1/alerts",
    "/v1/cases",
    "/v1/jarvis/assets",
    "/v1/labs/catalog",
    "/v1/forge",
    # Mini-app GET endpoints (lists/status/detail) — the backend serves them; the
    # dashboard must forward the GET so the live UI can load them (POSTs already proxy).
    "/v1/intent",
    "/v1/decision",
    "/v1/compress",
    "/v1/asset",
    "/v1/spec",
    "/v1/ritual",
    "/v1/mode",
    "/v1/friction",
    "/v1/deadzone",
    "/v1/proofpack",
    "/v1/codepulse",
    "/v1/voiceforge",
)


def _allow_backend_get_proxy(path: str) -> bool:
    bare = (path or "").split("?", 1)[0]
    for prefix in BACKEND_GET_PROXY_PREFIXES:
        if bare == prefix or bare.startswith(prefix + "/"):
            return True
    return False


from server.services._http import external_json as _external_json


def _higgsfield_run(body: dict) -> dict:
    mode = body.get("mode", "api")
    credential = (body.get("credential") or "").strip()
    prompt = (body.get("prompt") or "").strip()
    if not credential:
        return {"ok": False, "error": "missing credential"}
    if not prompt:
        return {"ok": False, "error": "missing prompt"}
    payload = {
        "prompt": prompt,
        "model": body.get("model", "dop-lite"),
        "seed": body.get("seed", 42),
        "motions_id": body.get("motions_id") or "generic",
        "motions_strength": body.get("motions_strength", 0.7),
        "input_images": [u.strip() for u in [body.get("image_url")] if u and str(u).strip()] or [],
        "enhance_prompt": bool(body.get("enhance_prompt")),
    }
    url = "https://gateway.pixazo.ai/ai-model-api/v1/image-to-video"
    headers: dict = {}
    if mode == "api":
        headers["Ocp-Apim-Subscription-Key"] = credential
    else:
        headers["Cookie"] = credential
    return _external_json("POST", url, payload, headers)


def _higgsfield_status(request_id: str, q: dict) -> dict:
    credential = (q.get("credential", [""])[0] or "").strip()
    mode = (q.get("mode", ["api"])[0] or "api").strip()
    if not credential:
        return {"ok": False, "error": "missing credential"}
    url = f"https://gateway.pixazo.ai/ai-model-api/v2/requests/status/{request_id}"
    headers: dict = {}
    if mode == "api":
        headers["Ocp-Apim-Subscription-Key"] = credential
    else:
        headers["Cookie"] = credential
    return _external_json("GET", url, None, headers)


def _tripo3d_run(body: dict) -> dict:
    mode = body.get("mode", "api")
    credential = (body.get("credential") or "").strip()
    prompt = (body.get("prompt") or "").strip()
    image_url = (body.get("image_url") or "").strip()
    if not credential:
        return {"ok": False, "error": "missing credential"}
    if not prompt and not image_url:
        return {"ok": False, "error": "missing prompt or image_url"}
    ttype = "image_to_model" if image_url else "text_to_model"
    payload: dict = {"type": ttype, "prompt": prompt, "model_version": body.get("model_version", "v2.5")}
    if image_url:
        payload["image_url"] = image_url
    url = "https://api.tripo3d.ai/v2/openapi/task"
    headers: dict = {"Content-Type": "application/json"}
    if mode == "api":
        headers["Authorization"] = f"Bearer {credential}"
    else:
        headers["Cookie"] = credential
    return _external_json("POST", url, payload, headers)


def _tripo3d_status(task_id: str, q: dict) -> dict:
    credential = (q.get("credential", [""])[0] or "").strip()
    mode = (q.get("mode", ["api"])[0] or "api").strip()
    if not credential:
        return {"ok": False, "error": "missing credential"}
    url = f"https://api.tripo3d.ai/v2/openapi/task/{task_id}"
    headers: dict = {}
    if mode == "api":
        headers["Authorization"] = f"Bearer {credential}"
    else:
        headers["Cookie"] = credential
    return _external_json("GET", url, None, headers)


def _control_token() -> str:
    """Stable control token — persisted so it survives dashboard restarts (otherwise every already-open
    tab goes stale and every Claude/task/control button returns 'unauthorized')."""
    t = os.environ.get("DASH_CONTROL_TOKEN")
    if t:
        return t
    p = os.path.join(ROOT, "server", "data", ".control_token")
    try:
        if os.path.exists(p):
            v = open(p).read().strip()
            if v:
                return v
        v = secrets.token_hex(8)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, "w").write(v)
        return v
    except Exception:  # noqa: BLE001
        return secrets.token_hex(8)


CONTROL_TOKEN = _control_token()  # toggle auth (persistent)
# Shared secret for the HOME-LAN AirTouch 5 bridge's outbound poll/report (separate from the web
# control token on purpose — this key never touches a browser). Falls back to the control token so a
# single-secret setup still works, but a dedicated CLIMATE_BRIDGE_KEY is recommended.
CLIMATE_BRIDGE_KEY = os.environ.get("CLIMATE_BRIDGE_KEY") or CONTROL_TOKEN

# the work-doing daemons shown in the Live Runners panel (live status from pm2, labels from TASKS)
RUNNER_SET = ["jarvis-orchestrator", "jarvis-ingestor", "jarvis-worker",
              "jarvis-batch-loader", "jarvis-correlator", "jarvis-feedback"]
# which daemons have a finite job vs run indefinitely (for the "time left / indefinite" display)
INDEFINITE = {"jarvis-orchestrator", "jarvis-ingestor", "jarvis-correlator", "jarvis-feedback",
              "jarvis-worker", "jarvis-backend", "jarvis-frontend", "jarvis-dashboard", "jarvis-glb-loader"}

_cache: dict = {}  # {key: (expires_ts, value)} — for expensive scans (GLB listing)


def _cached(key: str, ttl: float, fn):
    now = time.time()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    val = fn()
    _cache[key] = (now + ttl, val)
    return val


def _count(db: str, q: str, *a):
    try:
        c = sqlite3.connect(db, timeout=4)
        n = c.execute(q, a).fetchone()[0]
        c.close()
        return n
    except Exception:  # noqa: BLE001
        return None


def _cpu_pct() -> float:
    try:
        def snap():
            p = list(map(int, open("/proc/stat").readline().split()[1:]))
            return sum(p), p[3] + p[4]
        t1, i1 = snap(); time.sleep(0.12); t2, i2 = snap()
        dt, di = t2 - t1, i2 - i1
        return round(100 * (1 - di / dt), 1) if dt else 0.0
    except Exception:  # noqa: BLE001
        return 0.0


def _cpu_cores() -> list:
    try:
        def snap():
            d = {}
            for ln in open("/proc/stat"):
                if ln.startswith("cpu") and len(ln) > 3 and ln[3].isdigit():
                    p = list(map(int, ln.split()[1:])); d[ln.split()[0]] = (sum(p), p[3] + p[4])
            return d
        a = snap(); time.sleep(0.1); b = snap(); out = []
        for k in sorted(a, key=lambda x: int(x[3:])):
            dt = b[k][0] - a[k][0]; di = b[k][1] - a[k][1]
            out.append(round(100 * (1 - di / dt)) if dt else 0)
        return out
    except Exception:  # noqa: BLE001
        return []


def _vps() -> dict:
    out = {"cores": os.cpu_count()}
    try:
        out["cpu_pct"] = _cpu_pct()
        out["cpu_cores"] = _cached("cores", 4.0, _cpu_cores)
        out["load"] = round(os.getloadavg()[0], 2)
        mem = {ln.split(":")[0]: int(ln.split()[1]) for ln in open("/proc/meminfo")}
        out["mem_total_gb"] = round(mem["MemTotal"] / 1e6, 1)
        out["mem_used_gb"] = round((mem["MemTotal"] - mem["MemAvailable"]) / 1e6, 1)
        out["swap_total_gb"] = round(mem.get("SwapTotal", 0) / 1e6, 1)
        out["swap_used_gb"] = round((mem.get("SwapTotal", 0) - mem.get("SwapFree", 0)) / 1e6, 1)
        st = os.statvfs(ROOT)
        out["disk_total_gb"] = round(st.f_blocks * st.f_frsize / 1e9, 1)
        out["disk_used_gb"] = round((st.f_blocks - st.f_bavail) * st.f_frsize / 1e9, 1)
        out.update(_cached("hostmeta", 60.0, _host_meta))
    except Exception:  # noqa: BLE001
        pass
    return out


def _host_meta() -> dict:
    out = {}
    try:
        import platform
        out["kernel"] = platform.release()
        if os.path.exists("/etc/os-release"):
            for ln in open("/etc/os-release"):
                if ln.startswith("PRETTY_NAME="):
                    out["os"] = ln.split("=", 1)[1].strip().strip('"')
        try:
            d = subprocess.run(["docker", "ps", "-q"], capture_output=True, text=True, timeout=4).stdout.split()
            da = subprocess.run(["docker", "ps", "-aq"], capture_output=True, text=True, timeout=4).stdout.split()
            out["docker_running"] = len(d); out["docker_total"] = len(da)
        except Exception:  # noqa: BLE001
            out["docker_running"] = None
        try:
            ips = subprocess.run(["hostname", "-I"], capture_output=True, text=True, timeout=3).stdout.split()
            out["public_ip"] = next((i for i in ips if not i.startswith(("10.", "172.", "192.168", "100.", "fd", "fe80"))), ips[0] if ips else "")
        except Exception:  # noqa: BLE001
            pass
    except Exception:  # noqa: BLE001
        pass
    return out


def _box() -> dict:
    # VRAM + resident models are REAL (Ollama /api/ps). GPU util/temp/power/PCIe/cost/instance are NOT
    # available without nvidia-smi / the Vast API on the box — surfaced as None (shown as "—", not faked).
    out = {"reachable": False, "vram_total_gb": 48.0, "models": [], "vram_used_gb": 0.0,
           "gpu_util": None, "gpu_temp": None, "power_w": None, "cuda": None, "cost_hr": None,
           "instance_id": None, "region": None, "endpoint": BOX}
    try:
        with urllib.request.urlopen(BOX + "/api/ps", timeout=2.5) as r:
            d = json.loads(r.read())
        out["reachable"] = True
        used = sum(m.get("size_vram", 0) for m in d.get("models", []))
        out["vram_used_gb"] = round(used / 1e9, 1)
        out["models"] = [{"name": m["name"], "vram_gb": round(m.get("size_vram", 0) / 1e9, 1),
                          "pct": round(m.get("size_vram", 0) / max(used, 1) * 100)} for m in d.get("models", [])]
    except Exception:  # noqa: BLE001
        pass
    return out


def _runners() -> list:
    workers = _cached("workers", 10.0, _workers)  # reuse cached pm2 snapshot → accurate live status
    by = {w.get("name"): w for w in workers}
    out = []
    for n in RUNNER_SET:
        w = by.get(n)
        out.append({"name": TASKS.get(n, (n, ""))[0],
                    "on": bool(w and w.get("status") == "online"),
                    "up_min": (w or {}).get("up_min", 0),
                    "indefinite": n in INDEFINITE})
    return out


# label registry — plain-English name + what each background task actually does
TASKS = {
    "jarvis-dashboard":    ("📊 Live Dashboard",      "This metrics UI + the on/off toggles you're using"),
    "jarvis-batch-loader": ("🧠 Knowledge Builder",   "Enriches the ~7,000 topics into cited notes via the LLM tier ladder"),
    "jarvis-correlator":   ("🔗 Cross-Correlator",    "Finds duplicate entities + links them to one canonical (non-stop)"),
    "jarvis-feedback":     ("🤖 Self-Learning Loop",  "Turns errors from every .py into lessons (Llama→Kimi→Claude)"),
    "jarvis-orchestrator": ("🌍 Live Data Producer",  "Pulls live weather/air/quakes/crypto → new measurements (every 30m)"),
    "jarvis-ingestor":     ("📰 Document Ingestor",   "Pulls fresh arXiv papers → new Document objects linked to topics (every 30m)"),
    "jarvis-tasks":        ("🎙 Jarvis Studio Daemon", "No-timeout task runner: Claude Code, gpt-image-2, Tripo 3D, pause/resume, library"),
    "jarvis-worker":       ("⚙ Heavy Worker",         "Autobuild / enrich / ingest / proactive background loops"),
    "jarvis-backend":      ("🛰 API Server",          "Serves the JARVIS API on :8001"),
    "jarvis-frontend":     ("🖥 Frontend",            "JARVIS web UI (Vite) on :5173"),
    "jarvis-glb-loader":   ("🎨 GLB Loader",          "Loads the generated 3D GLB models"),
    "underworld-backend":  ("🎮 Underworld API",      "Underworld game server on :8091"),
    "underworld-web":      ("🎮 Underworld Web",      "Underworld web UI"),
}


def _workers() -> list:
    try:
        j = json.loads(subprocess.run(["pm2", "jlist"], capture_output=True, text=True, timeout=5).stdout)
        now = time.time() * 1000
        out = []
        for p in j:
            nm = p.get("name", "")
            mine = nm.startswith("jarvis-") or nm.startswith("underworld-")
            label, desc = TASKS.get(nm, (nm, "other app on this box"))
            e = p.get("pm2_env", {}); m = p.get("monit", {})
            out.append({"name": nm, "label": label, "desc": desc,
                        "toggleable": mine and not nm.startswith("underworld-"),
                        "status": e.get("status"), "cpu": m.get("cpu"),
                        "mem_mb": round((m.get("memory") or 0) / 1e6),
                        "restarts": e.get("restart_time"),
                        "unstable_restarts": e.get("unstable_restarts") or 0,
                        "up_min": round((now - e.get("pm_uptime", now)) / 60000)})
        out.sort(key=lambda w: (not w["toggleable"], w["name"]))  # our daemons first
        return out
    except Exception:  # noqa: BLE001
        return []


def _learning() -> dict:
    """The proof: live counts + deltas + the newest things learned, by name."""
    out = {}
    try:
        c = sqlite3.connect(BRAIN_DB, timeout=5)
        now = int(time.time())
        hr = now - 3600

        def one(q, *a):
            try:
                return c.execute(q, a).fetchone()[0]
            except Exception:  # noqa: BLE001
                return 0

        # created_ts/learned_ts are mixed seconds/ms across rows → normalize before the 1h window
        nt = "(CASE WHEN created_ts>100000000000 THEN created_ts/1000 ELSE created_ts END)"
        nl = "(CASE WHEN learned_ts>100000000000 THEN learned_ts/1000 ELSE learned_ts END)"
        out["growth"] = [
            {"label": "Topics", "total": one("SELECT count(*) FROM ont_object WHERE type='Topic'"),
             "h": one(f"SELECT count(*) FROM ont_object WHERE type='Topic' AND {nt}>?", hr)},
            {"label": "Measurements", "total": one("SELECT count(*) FROM ont_object WHERE type='Measurement'"),
             "h": one(f"SELECT count(*) FROM ont_object WHERE type='Measurement' AND {nt}>?", hr)},
            {"label": "Documents", "total": one("SELECT count(*) FROM ont_object WHERE type='Document'"),
             "h": one(f"SELECT count(*) FROM ont_object WHERE type='Document' AND {nt}>?", hr)},
            {"label": "Notes learned", "total": one("SELECT count(*) FROM note"),
             "h": one(f"SELECT count(*) FROM note WHERE {nl}>?", hr)},
            {"label": "Ontology objects", "total": one("SELECT count(*) FROM ont_object"),
             "h": one(f"SELECT count(*) FROM ont_object WHERE {nt}>?", hr)},
        ]
        # JUST LEARNED — newest notes (titles)
        # real knowledge only — kind='concept' (the 7,000-topic enrichment + scraped facts);
        # hide kind='log' logging junk and document_* internal enrichment rows
        out["recent_notes"] = [r[0] for r in
                               c.execute("SELECT title FROM note WHERE kind='concept' "
                                         "ORDER BY learned_ts DESC LIMIT 8")]
        # newest topics (names)
        names = []
        for (p,) in c.execute("SELECT props FROM ont_object WHERE type='Topic' ORDER BY created_ts DESC, rowid DESC LIMIT 8"):
            try:
                j = json.loads(p)
                names.append(j.get("topic_name") or j.get("label") or "?")
            except Exception:  # noqa: BLE001
                pass
        out["recent_topics"] = names
        # ONTOLOGY REGISTER — every type + count
        out["register"] = [{"type": t, "n": n} for t, n in
                           c.execute("SELECT type,count(*) FROM ont_object GROUP BY type ORDER BY 2 DESC LIMIT 14")]
        c.close()
    except Exception as e:  # noqa: BLE001
        out["error"] = str(e)[:120]
    return out


def _glb() -> dict:
    def scan():
        try:
            files = glob.glob(GLB_DIR + "/**/*.glb", recursive=True)
            files.sort(key=lambda f: os.path.getmtime(f), reverse=True)
            return {"total": len(files),
                    "recent": [os.path.basename(f)[:-4].replace("_", " ") for f in files[:6]]}
        except Exception:  # noqa: BLE001
            return {"total": 0, "recent": []}
    return _cached("glb", 15.0, scan)


def _tiers() -> list:
    try:
        import sys
        if ROOT not in sys.path:
            sys.path.insert(0, ROOT)
        from server.services import tiered_llm as T
        return [{"tier": r.get("tier"), "model": r.get("model"), "calls": r.get("calls")}
                for r in T.stats() if isinstance(r, dict) and "tier" in r]
    except Exception:  # noqa: BLE001
        return []


def _feedback() -> dict:
    try:
        import sys
        if ROOT not in sys.path:
            sys.path.insert(0, ROOT)
        from server.services import feedback_bus as fb
        return fb.stats()
    except Exception:  # noqa: BLE001
        return {}


def _correlation() -> dict:
    try:
        import sys
        if ROOT not in sys.path:
            sys.path.insert(0, ROOT)
        from server.services import correlator as C
        return C.stats()
    except Exception:  # noqa: BLE001
        return {}


def _routing() -> dict:
    try:
        import sys
        if ROOT not in sys.path:
            sys.path.insert(0, ROOT)
        from server.services import llm_gate as G
        return G.routing_stats()
    except Exception:  # noqa: BLE001
        return {}


GRAPH_COLORS = {"Topic": "#22d3ee", "Concept": "#34d399", "DataSource": "#f5b942", "Document": "#a78bfa",
                "Place": "#f87171", "Measurement": "#38bdf8", "DomainSubject": "#fb7185", "Asset": "#fbbf24",
                "Vulnerability": "#fb7185", "Event": "#c084fc", "ScientificPublication": "#a78bfa",
                "EarthquakeEvent": "#f97316", "SpeciesOccurrence": "#4ade80", "AcquisitionPoint": "#60a5fa",
                "Sensor": "#6366f1", "AppPage": "#ec4899"}


def _graph_data(max_nodes: int = 600, max_edges: int = 1800) -> dict:
    """A bounded, connected, typed subgraph from the real knowledge graph (edge-first so it's never a
    cloud of orphans). Drives the holographic 3D renderer."""
    def build():
        try:
            c = sqlite3.connect(BRAIN_DB, timeout=8)
            edges, nodeids = [], set()
            for rel, cap in [("RELATES_TO", 900), ("DESCRIBES", 300), ("MEASURED_AT", 250),
                             ("SAME_AS", 200), ("IN_TOPIC", 150), ("SERVES", 150)]:
                for frm, to in c.execute("SELECT from_id,to_id FROM ont_link WHERE type=? LIMIT ?", (rel, cap)):
                    if len(nodeids) >= max_nodes and (frm not in nodeids or to not in nodeids):
                        continue
                    edges.append({"s": frm, "t": to})
                    nodeids.add(frm); nodeids.add(to)
                    if len(edges) >= max_edges:
                        break
                if len(edges) >= max_edges:
                    break
            nodes = []
            for nid in list(nodeids)[:max_nodes]:
                r = c.execute("SELECT type,props FROM ont_object WHERE id=?", (nid,)).fetchone()
                if not r:
                    continue
                typ = r[0]
                try:
                    j = json.loads(r[1])
                    label = j.get("label") or j.get("topic_name") or j.get("name") or j.get("metric") or nid
                except Exception:  # noqa: BLE001
                    label = nid
                nodes.append({"id": nid, "type": typ, "label": str(label)[:42],
                              "color": GRAPH_COLORS.get(typ, "#9bd4e6")})
            c.close()
            have = {n["id"] for n in nodes}
            edges = [e for e in edges if e["s"] in have and e["t"] in have]
            return {"nodes": nodes, "edges": edges, "colors": GRAPH_COLORS}
        except Exception as e:  # noqa: BLE001
            return {"nodes": [], "edges": [], "error": str(e)[:120]}
    return _cached("graph", 30.0, build)


# ── global ontology search — NASA "Eyes" search-to-fly over the WHOLE brain.db ─
# The 16 ontology domains (mirrors WORLD_MANIFEST.domains in jarvis_live.html) so a
# query that names a domain flies straight to its planet.
_ONT_DOMAINS = ("Measurement", "DataSource", "Document", "DomainSubject", "Topic",
                "SpeciesOccurrence", "ScientificPublication", "Vulnerability",
                "AcquisitionPoint", "Place", "Asset", "Concept", "EarthquakeEvent",
                "Event", "Sensor", "AppPage")
# Title field varies by type — resolve in priority order, then fall back.
_TITLE_KEYS = ("label", "title", "name", "topic_name", "metric", "place",
               "scientific_name", "subject", "headline", "cve_id", "cve",
               "question", "summary", "source", "url")
# Modest per-type salience: a named Place/Earthquake/Vulnerability is more interesting
# than a generic Measurement when both merely contain the query string.
_TYPE_WEIGHT = {"EarthquakeEvent": 14, "Vulnerability": 14, "Place": 12, "Event": 12,
                "Topic": 10, "Concept": 10, "ScientificPublication": 9, "Document": 8,
                "SpeciesOccurrence": 8, "Asset": 8, "Sensor": 7, "DomainSubject": 6,
                "AcquisitionPoint": 5, "DataSource": 4, "AppPage": 4, "Measurement": 2}


def _ont_title(j: dict):
    for k in _TITLE_KEYS:
        v = j.get(k)
        if v not in (None, ""):
            return str(v)
    for v in j.values():  # last resort: first short scalar
        if isinstance(v, (str, int, float)) and str(v).strip():
            return str(v)
    return None


def _label(props_json: str) -> str:
    """Extract a short label from ont_object.props JSON, guarded against parse errors (P0-2)."""
    try:
        j = json.loads(props_json) if isinstance(props_json, str) else props_json
        return _ont_title(j) or ""
    except Exception:  # noqa: BLE001
        return ""


def _ont_context(j: dict, title: str) -> str:
    """A short human subtitle from a couple of the most telling extra props."""
    bits = []
    for k in ("magnitude", "country", "kingdom", "depth_km", "severity", "score",
              "year", "status", "source"):
        v = j.get(k)
        if v not in (None, "") and str(v) != title:
            bits.append(f"{k} {v}")
        if len(bits) >= 2:
            break
    return " · ".join(bits)


def _search_ontology(q: str, limit: int = 24) -> dict:
    """Rank matches for `q` across all ~265k ont_objects in brain.db. Returns each hit's
    real title, type and the `dom:<type>` planet the universe can fly to. Cached 45s."""
    q = (q or "").strip()
    if len(q) < 2:
        return {"q": q, "count": 0, "results": []}
    limit = max(1, min(60, limit))
    lo = q.lower()

    def build():
        results = []
        for dom in _ONT_DOMAINS:                              # domain-name shortcut → top
            if lo in dom.lower():
                results.append({"id": "dom:" + dom, "type": dom, "title": dom,
                                "subtitle": "ontology domain planet", "planet": "dom:" + dom,
                                "domain": True, "_uts": 1 << 62,
                                "score": 1000 + (40 if dom.lower() == lo else 0)})
        try:
            c = sqlite3.connect(BRAIN_DB, timeout=6)
            cur = c.execute("SELECT id,type,props,updated_ts FROM ont_object "
                            "WHERE props LIKE ? LIMIT 1600", ("%" + q + "%",))
            for oid, typ, props, uts in cur:
                try:
                    j = json.loads(props)
                except Exception:  # noqa: BLE001
                    continue
                title = _ont_title(j)
                if not title:
                    continue
                tl = title.lower()
                if tl == lo:
                    s = 90
                elif tl.startswith(lo):
                    s = 60
                elif (" " + lo) in (" " + tl):
                    s = 45                                    # word-boundary hit
                elif lo in tl:
                    s = 30
                else:
                    s = 6                                     # matched only in other props
                s += _TYPE_WEIGHT.get(typ, 3)
                ctx = _ont_context(j, title)
                results.append({"id": oid, "type": typ, "title": title[:90],
                                "subtitle": typ + (" · " + ctx if ctx else ""),
                                "planet": "dom:" + typ, "score": s, "_uts": uts or 0})
            c.close()
        except Exception as e:  # noqa: BLE001
            return {"q": q, "count": 0, "results": [], "error": str(e)[:140]}
        results.sort(key=lambda r: (r["score"], r["_uts"]), reverse=True)
        out, per = [], {}                                     # diversify: cap any one type
        for r in results:
            if not r.get("domain") and per.get(r["type"], 0) >= 8:
                continue
            per[r["type"]] = per.get(r["type"], 0) + 1
            r.pop("_uts", None)
            out.append(r)
            if len(out) >= limit:
                break
        return {"q": q, "count": len(out), "results": out}

    return _cached("search:" + lo + ":" + str(limit), 45.0, build)


# ── rate + ETA tracking (the "time remaining" ticker) ─────────────────────────
_HIST: dict = {}  # metric -> [(ts, value)] over a rolling ~5 min window


def _track(key: str, value):
    if value is None:
        return
    now = time.time()
    h = _HIST.setdefault(key, [])
    h.append((now, value))
    cut = now - 300
    while len(h) > 2 and h[0][0] < cut:
        h.pop(0)


def _rate_per_min(key: str):
    h = _HIST.get(key, [])
    if len(h) < 2:
        return None
    (t0, v0), (t1, v1) = h[0], h[-1]
    dt = t1 - t0
    if dt < 8 or v0 is None or v1 is None:
        return None
    return (v1 - v0) / dt * 60.0


def _fmt_eta(mins: float) -> str:
    if mins < 1:
        return "<1 min"
    if mins < 90:
        return f"~{round(mins)} min"
    if mins < 60 * 48:
        return f"~{round(mins / 60, 1)} h"
    return f"~{round(mins / 1440, 1)} days"


def _eta_row(name, rate, remaining):
    if remaining is not None and remaining <= 0:
        return {"task": name, "rate": round(rate or 0, 1), "eta": "done ✓"}
    if rate is None:
        return {"task": name, "rate": 0, "eta": "measuring…"}
    if rate <= 0:
        return {"task": name, "rate": 0, "eta": "steady"}
    if remaining is None:
        return {"task": name, "rate": round(rate, 1), "eta": f"+{round(rate, 1)}/min"}
    return {"task": name, "rate": round(rate, 1), "eta": _fmt_eta(remaining / rate)}


def _compute_eta(m: dict) -> list:
    c = m.get("completion", {})
    g = {x["label"]: x["total"] for x in m.get("learning", {}).get("growth", [])}
    for k, v in {"topics": c.get("enriched"), "measurements": g.get("Measurements"),
                 "documents": g.get("Documents"), "notes": g.get("Notes learned"),
                 "ontology": g.get("Ontology objects"), "glb": m.get("glb", {}).get("total")}.items():
        _track(k, v)
    rem_topics = (c.get("total") or 0) - (c.get("enriched") or 0)
    return [
        _eta_row("7,000-topic knowledge build", _rate_per_min("topics"), rem_topics),
        _eta_row("Knowledge notes (enrichment)", _rate_per_min("notes"), None),
        _eta_row("Live measurements (orchestrator)", _rate_per_min("measurements"), None),
        _eta_row("Documents / OCR ingest", _rate_per_min("documents"), None),
        _eta_row("Ontology objects", _rate_per_min("ontology"), None),
        _eta_row("GLB 3D models", _rate_per_min("glb"), None),
    ]


# ── SYSTEM VITALS — proactive health score + prioritized alerts ───────────────
# A PURE function over the metrics snapshot (no new collection, never raises) that turns the data we
# already gather into an early-warning panel. It surfaces the things that actually cause outages —
# the disk filling (the known disk-guard concern), the GPU brain going offline, a daemon crash-looping,
# a producer pipeline that has silently stalled — BEFORE they bite, instead of leaving them buried in
# raw numbers across six other panels.
_SEV = {"critical": 3, "warn": 2, "ok": 1}


def _pct(used, total):
    try:
        u, t = float(used), float(total)
        return round(u / t * 100, 1) if t else None
    except Exception:  # noqa: BLE001
        return None


def _health(m: dict) -> dict:
    """Derive a 0-100 score + a severity-sorted alert list from the live snapshot. Reuses the
    vps/box/workers/learning/budget fields already in `m`, so it adds zero load. Each alert is
    {level, title, detail, hint} — hint is the plain-English 'what to do'."""
    alerts = []

    def add(level, title, detail, hint=""):
        alerts.append({"level": level, "title": title, "detail": detail, "hint": hint})

    v = m.get("vps", {}) or {}
    b = m.get("box", {}) or {}

    # DISK — a full disk silently breaks ingestion + every SQLite write (the disk-guard concern).
    dpct = _pct(v.get("disk_used_gb"), v.get("disk_total_gb"))
    if dpct is not None:
        det = f"{dpct:g}% used ({v.get('disk_used_gb')}/{v.get('disk_total_gb')} GB)"
        if dpct >= 93:
            add("critical", "Disk almost full", det, "Reclaim space now — writes are about to fail.")
        elif dpct >= 85:
            add("warn", "Disk filling up", det, "The disk-guard cron should reclaim space; watch the trend.")

    # MEMORY
    mpct = _pct(v.get("mem_used_gb"), v.get("mem_total_gb"))
    if mpct is not None:
        det = f"{mpct:g}% RAM used ({v.get('mem_used_gb')}/{v.get('mem_total_gb')} GB)"
        if mpct >= 95:
            add("critical", "Memory exhausted", det, "Risk of an OOM-killed daemon.")
        elif mpct >= 88:
            add("warn", "Memory pressure", det)

    # SWAP thrash
    spct = _pct(v.get("swap_used_gb"), v.get("swap_total_gb"))
    if spct is not None and (v.get("swap_total_gb") or 0) > 0 and spct >= 60:
        add("warn", "Heavy swapping", f"{spct:g}% of swap in use", "The box may feel sluggish.")

    # CPU LOAD vs cores
    cores = v.get("cores") or 1
    load = v.get("load")
    if load is not None and cores:
        ratio = load / cores
        det = f"load {load} on {cores} cores ({ratio:.1f}× capacity)"
        if ratio >= 3:
            add("critical", "CPU overloaded", det)
        elif ratio >= 1.6:
            add("warn", "CPU running hot", det)

    # GPU BRAIN — the whole LLM tier ladder + JARVIS chat depend on the box being reachable.
    if "reachable" in b:
        if not b.get("reachable"):
            add("critical", "GPU brain offline", f"the Vast box ({b.get('endpoint')}) is unreachable",
                "Open the Speed Optimiser to provision or tunnel to a brain GPU.")
        else:
            vpct = _pct(b.get("vram_used_gb"), b.get("vram_total_gb"))
            if vpct is not None and vpct >= 92:
                add("warn", "VRAM nearly full", f"{vpct:g}% VRAM "
                    f"({b.get('vram_used_gb')}/{b.get('vram_total_gb')} GB)", "A larger model may fail to load.")

    # DAEMONS — any of OUR pm2 services down, + crash-loops (restarts climbing).
    workers = [w for w in (m.get("workers") or []) if w.get("toggleable")]
    down = [w for w in workers if w.get("status") != "online"]
    if down:
        add("warn", f"{len(down)} daemon{'s' if len(down) != 1 else ''} stopped",
            ", ".join((w.get("label") or w.get("name") or "?") for w in down[:6]),
            "Press Run, or use the toggles, to bring them back.")
    storm = [w for w in workers if (w.get("unstable_restarts") or 0) >= 3]
    if storm:
        add("warn", "Daemon crash-looping",
            ", ".join(f"{(w.get('label') or w.get('name'))} (↺{w.get('unstable_restarts')})" for w in storm[:5]),
            "Open the Speed Optimiser to reset crash counters and stabilise the service.")

    # PIPELINE STALL — producers online but NOTHING grew in the last hour = a silent gap (HR: surface it).
    growth = (m.get("learning") or {}).get("growth") or []
    if growth and any(w.get("status") == "online" for w in workers):
        if not any((g.get("h") or 0) > 0 for g in growth):
            add("warn", "Knowledge pipeline idle",
                "no new topics, notes or measurements in the last hour",
                "Open the Speed Optimiser to wake producers and drain any stalled batches.")

    # BUDGET — economy mode means Claude is forced to the cheapest model.
    bud = m.get("budget") or {}
    if bud.get("economy_forced"):
        add("warn", "Daily Claude budget spent",
            f"${bud.get('spent_usd_today')} / ${bud.get('daily_cap')} — economy mode (haiku) forced")

    # SCORE — start perfect, subtract weighted penalties; level = worst alert present.
    pen = sum(35 if a["level"] == "critical" else 12 for a in alerts)
    score = max(0, 100 - pen)
    level = "critical" if any(a["level"] == "critical" for a in alerts) else ("warn" if alerts else "ok")
    alerts.sort(key=lambda a: -_SEV.get(a["level"], 0))
    nc = sum(1 for a in alerts if a["level"] == "critical")
    nw = len(alerts) - nc
    if not alerts:
        summary = "All systems nominal"
    else:
        summary = " · ".join(([f"{nc} critical"] if nc else []) +
                             ([f"{nw} warning{'s' if nw != 1 else ''}"] if nw else []))
    return {"score": score, "level": level, "summary": summary, "alerts": alerts,
            "gauges": {"disk_pct": dpct, "mem_pct": mpct, "cpu_pct": v.get("cpu_pct"),
                       "vram_pct": _pct(b.get("vram_used_gb"), b.get("vram_total_gb")),
                       "daemons_up": sum(1 for w in workers if w.get("status") == "online"),
                       "daemons_total": len(workers)}}


def _vitals() -> dict:
    """The REAL, self-contained System Vitals payload for the /vitals endpoint and the universe Vitals
    app — never the HTML page (the old /vitals path fell through to the catch-all and served HTML, so a
    JSON consumer got nothing: exactly the 'loads nothing' module the contract flags).

    Every datum here is genuinely measured: CPU/mem/disk/load from /proc + statvfs (psutil-equivalent),
    GPU/LLM reachability + VRAM from the Ollama box (Ollama /api/ps), pm2 service health from `pm2 jlist`,
    and the derived 0-100 health score + alerts. Anything we truly can't reach is reported with an
    explicit not-connected flag — it is NEVER fabricated.
    """
    m = _SNAP
    # Snapshot still warming up (first ~2s after a restart) — say so honestly, don't invent numbers.
    if not m or m.get("loading") or not m.get("ts"):
        return {"ok": False, "connected": False, "reason": "warming up",
                "summary": "System vitals are initialising — first snapshot not ready yet.",
                "ts": int(time.time())}
    v = m.get("vps", {}) or {}
    b = m.get("box", {}) or {}
    h = m.get("health") or _health(m)
    workers = m.get("workers") or []
    mine = [w for w in workers if w.get("toggleable")]
    return {
        "ok": True, "connected": True, "ts": m.get("ts"), "age_s": max(0, int(time.time()) - int(m.get("ts") or 0)),
        "score": h.get("score"), "level": h.get("level"), "summary": h.get("summary"),
        "alerts": h.get("alerts", []), "gauges": h.get("gauges", {}),
        # Raw, real numbers (units) so a monitor can graph them without re-deriving %s.
        "system": {
            "cpu_pct": v.get("cpu_pct"), "cores": v.get("cores"), "load": v.get("load"),
            "mem_used_gb": v.get("mem_used_gb"), "mem_total_gb": v.get("mem_total_gb"),
            "swap_used_gb": v.get("swap_used_gb"), "swap_total_gb": v.get("swap_total_gb"),
            "disk_used_gb": v.get("disk_used_gb"), "disk_total_gb": v.get("disk_total_gb"),
            "os": v.get("os"), "kernel": v.get("kernel"), "public_ip": v.get("public_ip"),
            "docker_running": v.get("docker_running"), "docker_total": v.get("docker_total"),
        },
        # GPU/LLM brain — reachable is REAL; metrics we can't get without nvidia-smi are null, not faked.
        "brain": {
            "endpoint": b.get("endpoint"), "reachable": b.get("reachable"),
            "vram_used_gb": b.get("vram_used_gb"), "vram_total_gb": b.get("vram_total_gb"),
            "models": b.get("models", []), "gpu_util": b.get("gpu_util"),
            "gpu_temp": b.get("gpu_temp"), "power_w": b.get("power_w"),
        },
        # pm2 service health (real, from `pm2 jlist`): our daemons + the lifeline dashboard itself.
        "services": {
            "up": sum(1 for w in mine if w.get("status") == "online"),
            "total": len(mine),
            "list": [{"name": w.get("name"), "label": w.get("label"), "status": w.get("status"),
                      "cpu": w.get("cpu"), "mem_mb": w.get("mem_mb"), "restarts": w.get("restarts"),
                      "unstable_restarts": w.get("unstable_restarts") or 0,
                      "up_min": w.get("up_min")} for w in mine],
        },
        "budget": m.get("budget") or {},
        "uptime_min": max((w.get("up_min", 0) for w in workers if w.get("name") == "jarvis-dashboard"), default=None),
        "version": m.get("version") or {},
    }


def _version() -> dict:
    def go():
        try:
            n = subprocess.run(["git", "rev-list", "--count", "HEAD"], cwd=ROOT,
                               capture_output=True, text=True, timeout=4).stdout.strip()
            sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT,
                                 capture_output=True, text=True, timeout=4).stdout.strip()
            return {"version": f"v1.0.{n}", "sha": sha}
        except Exception:  # noqa: BLE001
            return {"version": "v1.0.0", "sha": ""}
    return _cached("version", 60.0, go)


def _norm_ts(ts):
    try:
        ts = int(ts)
    except Exception:  # noqa: BLE001
        return 0
    return ts // 1000 if ts > 100000000000 else ts


def _feed() -> list:
    """Newest events across the whole system, newest first — the live activity stream."""
    items = []
    try:
        c = sqlite3.connect(BRAIN_DB, timeout=4)
        for title, lt in c.execute("SELECT title,learned_ts FROM note ORDER BY learned_ts DESC LIMIT 16"):
            items.append({"icon": "🧠", "text": title, "ts": _norm_ts(lt)})
        for p, ct in c.execute("SELECT props,created_ts FROM ont_object WHERE type='Measurement' "
                               "ORDER BY created_ts DESC LIMIT 6"):
            try:
                j = json.loads(p); lbl = j.get("label") or j.get("name") or j.get("metric") or "measurement"
            except Exception:  # noqa: BLE001
                lbl = "measurement"
            items.append({"icon": "📊", "text": str(lbl)[:60], "ts": _norm_ts(ct)})
        c.close()
    except Exception:  # noqa: BLE001
        pass
    try:
        c = sqlite3.connect(TL_DB, timeout=4)
        for tier, model, ts, ok in c.execute("SELECT tier,model,ts,ok FROM tiered_llm_calls "
                                              "ORDER BY ts DESC LIMIT 16"):
            items.append({"icon": "⚡" if ok else "⚠", "text": f"{tier} · {model}", "ts": _norm_ts(ts)})
        c.close()
    except Exception:  # noqa: BLE001
        pass
    try:
        c = sqlite3.connect(FB_DB, timeout=4)
        for mod, lesson, ts in c.execute("SELECT module,lesson,ts FROM lessons ORDER BY ts DESC LIMIT 6"):
            items.append({"icon": "🤖", "text": f"{mod.split('/')[-1]}: {lesson[:48]}", "ts": _norm_ts(ts)})
        c.close()
    except Exception:  # noqa: BLE001
        pass
    items.sort(key=lambda x: x["ts"], reverse=True)
    return items[:24]


def _detail(kind: str, name: str) -> dict:
    """Drill-down for a clicked panel item."""
    try:
        if kind == "runner":
            out = subprocess.run(["pm2", "logs", name, "--nostream", "--lines", "25"],
                                 capture_output=True, text=True, timeout=8).stdout
            lines = [ln for ln in out.splitlines() if ln.strip()][-25:]
            base = name.replace("jarvis-", "").replace("underworld-", "").replace("-", "_")
            acts = [{"label": "↻ Restart", "kind": "task", "arg": f"restart the {name} service"}]
            for rel in (f"server/services/{base}.py", f"server/{base}.py"):
                if os.path.exists(os.path.join(ROOT, rel)):
                    acts.insert(0, {"label": f"📄 {rel.split('/')[-1]}", "kind": "file", "arg": rel})
                    break
            return {"title": f"Runner · {name}", "subtitle": "live pm2 logs",
                    "lines": lines or ["no recent log output"], "actions": acts}
        if kind == "type":
            c = sqlite3.connect(BRAIN_DB, timeout=5)
            rows = c.execute("SELECT props FROM ont_object WHERE type=? ORDER BY rowid DESC LIMIT 30",
                             (name,)).fetchall()
            c.close()
            lines = []
            for (p,) in rows:
                try:
                    j = json.loads(p)
                    lines.append(str(j.get("label") or j.get("topic_name") or j.get("name")
                                     or next(iter(j.values()), "?"))[:70])
                except Exception:  # noqa: BLE001
                    lines.append("?")
            return {"title": f"Recent {name} objects", "subtitle": f"{len(lines)} shown",
                    "lines": lines or ["none"],
                    "actions": [{"label": "◈ Focus in 3D graph", "kind": "graph", "arg": name}]}
        if kind == "module":
            c = sqlite3.connect(FB_DB, timeout=5)
            ls = [f"💡 {r[0]}" for r in c.execute(
                "SELECT lesson FROM lessons WHERE module=? ORDER BY ts DESC LIMIT 10", (name,))]
            ev = [f"⚠ {r[0]}: {r[1]}" for r in c.execute(
                "SELECT kind,detail FROM events WHERE module=? ORDER BY id DESC LIMIT 10", (name,))]
            c.close()
            return {"title": f"Module · {name}", "lines": (ls + ev) or ["no events yet"]}
    except Exception as e:  # noqa: BLE001
        return {"title": name, "lines": [f"error: {str(e)[:140]}"]}
    return {"title": name, "lines": ["no detail available"]}


def _children(node_id: str, node_kind: str, exclude_id: str = "", limit: int = 14) -> dict:
    """REAL children for the recursive NASA-Eyes hierarchy. Pure read; index-backed; capped.
    P0-1: biased to connected objects via EXISTS semi-join (not recency alone).
    P0-2: per-row try/except so one malformed props doesn't blank the planet.
    P1-2: rank informative relations first (SAME_AS last)."""
    def build():
        try:
            c = sqlite3.connect(BRAIN_DB, timeout=5)
            c.execute("PRAGMA query_only=1")
            out, seen = [], set()
            if node_kind.startswith("type:"):
                typ = node_kind.split(":", 1)[1]
                total = _count(BRAIN_DB, "SELECT COUNT(*) FROM ont_object WHERE type=?", typ) or 0
                # P0-1: SELECT connected objects via EXISTS, fall back to recency
                rows = c.execute(
                    "SELECT id,props FROM ont_object WHERE type=? "
                    "AND (EXISTS(SELECT 1 FROM ont_link WHERE from_id=id) OR "
                    "EXISTS(SELECT 1 FROM ont_link WHERE to_id=id)) "
                    "ORDER BY rowid DESC LIMIT ?",
                    (typ, limit)).fetchall()
                # Backfill with recent if not enough connected
                if len(rows) < limit:
                    remain = limit - len(rows)
                    seen_ids = {r[0] for r in rows}
                    extra = c.execute(
                        "SELECT id,props FROM ont_object WHERE type=? "
                        "ORDER BY rowid DESC LIMIT ?",
                        (typ, remain * 3)).fetchall()
                    for r in extra:
                        if r[0] not in seen_ids and len(rows) < limit:
                            rows.append(r)
                            seen_ids.add(r[0])
                # P0-2: per-row try/except for _label
                for oid, props in rows:
                    if oid in seen:
                        continue
                    seen.add(oid)
                    label = _label(props) or oid
                    has_links = bool(c.execute("SELECT 1 FROM ont_link WHERE from_id=? LIMIT 1", (oid,)).fetchone()) or \
                                bool(c.execute("SELECT 1 FROM ont_link WHERE to_id=? LIMIT 1", (oid,)).fetchone())
                    out.append({"id": oid, "type": typ, "label": str(label)[:70],
                                "color": GRAPH_COLORS.get(typ, "#9bd4e6"), "rel": "instance", "dir": "down",
                                "isLeaf": not has_links})
            else:  # 'obj:<id>' — bidirectional indexed neighbor walk
                oid = node_kind.split(":", 1)[1] if ":" in node_kind else node_id
                # Rank relations: informative first, SAME_AS last (P1-2)
                REL_RANK = {"DESCRIBES": 1, "RELATES_TO": 2, "IN_TOPIC": 3, "MEASURED_AT": 4,
                            "SERVES": 5, "powers": 6, "SAME_AS": 999}
                from_count = _count(BRAIN_DB, "SELECT COUNT(*) FROM ont_link WHERE from_id=?", oid) or 0
                to_count = _count(BRAIN_DB, "SELECT COUNT(*) FROM ont_link WHERE to_id=?", oid) or 0
                total = from_count + to_count
                rows = []
                rows += c.execute(
                    "SELECT o.id,o.type,o.props,l.type rel,'out' dir FROM ont_link l "
                    "JOIN ont_object o ON o.id=l.to_id WHERE l.from_id=? LIMIT ? ", (oid, limit)).fetchall()
                rows += c.execute(
                    "SELECT o.id,o.type,o.props,l.type rel,'in' dir FROM ont_link l "
                    "JOIN ont_object o ON o.id=l.from_id WHERE l.to_id=? LIMIT ? ", (oid, limit)).fetchall()
                rows.sort(key=lambda r: REL_RANK.get(r[3], 999))
                for cid, ctyp, props, rel, dr in rows:
                    if cid == oid or cid == exclude_id or cid in seen:
                        continue
                    seen.add(cid)
                    label = _label(props) or cid
                    out.append({"id": cid, "type": ctyp, "label": str(label)[:70],
                                "color": GRAPH_COLORS.get(ctyp, "#9bd4e6"), "rel": rel, "dir": dr})
                    if len(out) >= limit:
                        break
            c.close()
            return {"parent": node_id, "kind": node_kind, "children": out,
                    "total": total, "truncated": total > len(out)}
        except Exception as e:  # noqa: BLE001
            return {"parent": node_id, "kind": node_kind, "children": [], "total": 0,
                    "truncated": False, "error": str(e)[:120]}
    # P0-3: don't cache obj: branch (high cardinality); cache type: only
    if node_kind.startswith("type:"):
        return _cached(f"children::{node_kind}", 30.0, build)
    else:
        return build()


def metrics() -> dict:
    total = _count(BRAIN_DB, "SELECT COUNT(*) FROM ont_object WHERE type='Topic'") or 0
    enr = _count(BRAIN_DB, "SELECT COUNT(*) FROM note WHERE frontmatter_json LIKE '%\"batch_loader\"%'") or 0
    return {
        "ts": int(time.time()),
        "completion": {"enriched": enr, "total": total, "pct": round(enr / max(total, 1) * 100, 1)},
        "runners": _runners(),
        "learning": _cached("learning", 6.0, _learning),
        "glb": _glb(),
        "box": _cached("box", 8.0, _box), "vps": _vps(),
        "workers": _cached("workers", 10.0, _workers), "tiers": _cached("tiers", 6.0, _tiers),
        "feedback": _cached("feedback", 4.0, _feedback),
        "correlation": _cached("correlation", 5.0, _correlation),
        "routing": _cached("routing", 4.0, _routing),
        "feed": _feed(),
    }


# Background snapshot — heavy collection (pm2/box/glb) runs OFF the request path, so /metrics always
# returns instantly from the last snapshot. This is the fix for the "loads blank" pileup (slow /metrics
# + 2s polling saturated the connection backlog).
_SNAP: dict = {"ts": 0, "loading": True}


def _refresher():
    global _SNAP
    while True:
        try:
            m = metrics()
            try:
                m["eta"] = _compute_eta(m)
                m["version"] = _version()
            except Exception:  # noqa: BLE001
                pass
            try:  # fold the daily Claude budget into the snapshot so Vitals can flag economy mode
                from server.services import token_governor as TG
                m["budget"] = TG.state()
            except Exception:  # noqa: BLE001
                pass
            try:  # proactive health score + alerts (pure over the snapshot we just built)
                m["health"] = _health(m)
            except Exception:  # noqa: BLE001
                pass
            _SNAP = m
        except Exception as e:  # noqa: BLE001
            _SNAP = {"ts": int(time.time()), "error": str(e)[:140]}
        time.sleep(2.0)


HTML = r"""<!doctype html><html><head><meta charset=utf-8><title>JARVIS · Live</title>
<meta name=viewport content="width=device-width,initial-scale=1">
<style>
:root{--cy:#22d3ee;--cy2:#0ea5b7;--bg:#04070d;--tx:#cfe9f5;--dim:#5b7a90;--ln:#13314a;--gd:#34d399}
*{box-sizing:border-box;font-family:ui-monospace,Menlo,Consolas,monospace}
body{margin:0;background:radial-gradient(1200px 700px at 70% -10%,#0b2030 0,var(--bg) 60%);color:var(--tx)}
.wrap{max-width:1240px;margin:0 auto;padding:22px}
h1{font-size:18px;letter-spacing:3px;color:var(--cy);margin:0 0 2px;text-shadow:0 0 14px #22d3ee66}
.sub{color:var(--dim);font-size:11px;letter-spacing:1px;margin-bottom:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px}
.card{background:linear-gradient(180deg,#0b1622,#070d16);border:1px solid var(--ln);border-radius:12px;padding:16px;box-shadow:0 10px 30px #0006}
.card h2{font-size:11px;letter-spacing:2px;color:var(--cy);margin:0 0 12px;text-transform:uppercase}
.big{font-size:34px;font-weight:700;color:#eafcff;text-shadow:0 0 18px #22d3ee55}
.unit{font-size:12px;color:var(--dim)}
.bar{height:10px;background:#0c1c2b;border-radius:6px;overflow:hidden;margin:8px 0;border:1px solid #14324a}
.fill{height:100%;background:linear-gradient(90deg,var(--cy2),var(--cy));box-shadow:0 0 12px #22d3ee99;transition:width .6s ease}
.row{display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px dashed #102538;gap:8px}
.row b{color:#eafcff}.k{color:var(--dim)}
.delta{color:var(--gd);font-size:11px}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:7px}
.live{animation:pulse 1.4s infinite}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
.li{font-size:12px;padding:3px 0;color:#bfe6f2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.li:before{content:"▸ ";color:var(--cy)}
.mono{font-size:11px;color:var(--dim)}
.tag{display:inline-block;font-size:10px;color:#3a5a70}
.verbadge{font-size:11px;color:#34d399;letter-spacing:1px;margin-left:12px;text-shadow:0 0 10px #34d39955}
.clk{cursor:pointer}.clk:hover{background:#0e2233;border-radius:6px}
.feed{max-height:340px;overflow:auto}
.feeditem{font-size:12px;padding:5px 2px;border-bottom:1px solid #0d1d2b;display:flex;justify-content:space-between;gap:10px}
.feeditem span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ago{color:#3a5a70;font-size:10px;white-space:nowrap}
#modal{position:fixed;inset:0;background:#02060bee;display:none;align-items:center;justify-content:center;z-index:9}
#modalbox{background:#0a141f;border:1px solid #1d4a63;border-radius:12px;max-width:780px;width:92%;max-height:82vh;overflow:auto;padding:18px;box-shadow:0 20px 60px #000a}
#modalbox h3{color:#22d3ee;margin:0 0 12px;font-size:13px;letter-spacing:1px}
.ln{font-size:12px;color:#bfe6f2;padding:3px 0;border-bottom:1px dashed #0d2030;white-space:pre-wrap;word-break:break-word}
#modalclose{float:right;cursor:pointer;color:#5b7a90}
.task{padding:8px 0;border-bottom:1px solid #0d1d2b}
.taskhead{display:flex;align-items:center;gap:9px}
.taskhead b{color:#eafcff;font-size:12px}
.taskstat{margin-left:auto;font-size:11px;color:#7fb0c4;white-space:nowrap}
.taskdesc{font-size:10px;color:#5b7a90;margin-left:39px;margin-top:2px}
.tgl{flex:0 0 auto;display:inline-block;width:30px;height:16px;border-radius:10px;cursor:pointer;position:relative;border:1px solid #1d4a63;transition:background .2s}
.tgl.on{background:#0e7a5f}.tgl.off{background:#3a1320}
.tgl:after{content:'';position:absolute;top:1px;width:12px;height:12px;border-radius:50%;background:#eafcff;transition:left .2s}
.tgl.on:after{left:15px}.tgl.off:after{left:1px}
</style></head><body><div class=wrap>
<h1>◈ JARVIS · LIVE AUTOMATION<span id=ver class=verbadge></span></h1>
<div class=sub><span class="dot live" style="background:#22d3ee"></span><span id=clock>connecting…</span> · data updated <span id=age>—</span> ago</div>
<div class=grid>

  <div class=card style="grid-column:1/-1">
    <h2>7,000-Topic Knowledge Build</h2>
    <div class=big><span id=pct>0</span>%<span class=unit> &nbsp;<span id=enr>0</span> / <span id=tot>0</span> topics enriched</span></div>
    <div class=bar><div class=fill id=pbar style=width:0%></div></div>
  </div>

  <div class=card style="grid-column:1/-1"><h2>⏱ Time Remaining · Live Velocity</h2><div id=eta><div class=mono>measuring…</div></div></div>

  <div class=card style="grid-column:1/-1"><h2>📡 Live Activity (newest first · ticks every second)</h2><div id=feed class=feed><div class=mono>waiting for events…</div></div></div>

  <div class=card><h2>🟢 Live Runners</h2><div id=runners>—</div></div>

  <div class=card><h2>📈 Always Growing</h2><div id=growth>—</div></div>

  <div class=card><h2>🧠 Just Learned</h2>
    <div class=mono style=margin-bottom:6px>newest facts</div><div id=recent_notes></div>
    <div class=mono style=margin:8px 0 6px>newest topics</div><div id=recent_topics></div>
  </div>

  <div class=card><h2>🗂 Ontology Register</h2><div id=register>—</div></div>

  <div class=card><h2>🎨 GLB 3D Pipeline</h2>
    <div class=big><span id=glb_total>0</span><span class=unit> models generated</span></div>
    <div class=mono style=margin:8px 0 4px>latest</div><div id=glb_recent></div>
  </div>

  <div class=card><h2>🖥 Vast GPU Box · 2×4090</h2>
    <div class=row><span class=k>status</span><b id=b_reach>—</b></div>
    <div class=row><span class=k>VRAM</span><b><span id=b_vram>0</span> / 48 GB</b></div>
    <div class=bar><div class=fill id=vrambar style=width:0%></div></div>
    <div id=b_models class=mono></div>
  </div>

  <div class=card><h2>🖥 VPS Server · Hostinger</h2>
    <div class=row><span class=k>CPU</span><b><span id=v_cpu>0</span>% · <span id=v_cores>?</span> cores</b></div>
    <div class=bar><div class=fill id=cpubar style=width:0%></div></div>
    <div class=row><span class=k>RAM</span><b><span id=v_mem>0</span> / <span id=v_memt>0</span> GB</b></div>
    <div class=row><span class=k>Disk</span><b><span id=v_disk>0</span> / <span id=v_diskt>0</span> GB</b></div>
    <div class=row><span class=k>Load</span><b id=v_load>0</b></div>
  </div>

  <div class=card style="grid-column:1/-1"><h2>⚙ Background Tasks · click the switch to turn each on/off</h2><div id=procs>—</div></div>
  <div class=card><h2>🪜 LLM Tiers (telemetry)</h2><div id=tiers class=mono>—</div></div>
  <div class=card style="grid-column:1/-1"><h2>🤖 Self-Learning · Llama ↔ Kimi ↔ Claude (every .py)</h2><div id=feedback class=mono>—</div></div>
  <div class=card style="grid-column:1/-1"><h2>🔗 Cross-Correlation · entity resolution (non-stop)</h2><div id=corr class=mono>scanning…</div></div>
  <div class=card style="grid-column:1/-1"><h2>🚦 LLM Router · gated 6-tier (why each job ran)</h2><div id=routing class=mono>—</div></div>
</div></div>
<div id=modal onclick="if(event.target===this)this.style.display='none'"><div id=modalbox><span id=modalclose onclick="document.getElementById('modal').style.display='none'">✕ close</span><h3 id=modaltitle></h3><div id=modallines></div></div></div>
<script>
const $=id=>document.getElementById(id), fmt=n=>n==null?'—':n.toLocaleString();
let _lastTs=0;
const CTOKEN="__CTOKEN__";
async function toggle(name,on){
  try{await fetch('control?action='+(on?'stop':'start')+'&name='+encodeURIComponent(name)+'&token='+CTOKEN,{method:'POST'});}catch(e){}
  setTimeout(tick,900);
}
function agoTxt(ts){if(!ts)return'';const s=Math.max(0,Math.floor(Date.now()/1000)-ts);if(s<60)return s+'s ago';if(s<3600)return Math.floor(s/60)+'m ago';return Math.floor(s/3600)+'h ago';}
function ticker(){
  if(_lastTs)$('age').textContent=Math.max(0,Math.floor(Date.now()/1000)-_lastTs)+'s';
  document.querySelectorAll('.feeditem').forEach(el=>{const a=el.querySelector('.ago');if(a)a.textContent=agoTxt(+el.getAttribute('data-ts'));});
}
async function openDetail(kind,name){
  $('modaltitle').textContent='loading…';$('modallines').innerHTML='';$('modal').style.display='flex';
  try{const d=await(await fetch('detail?kind='+encodeURIComponent(kind)+'&name='+encodeURIComponent(name))).json();
    $('modaltitle').textContent=d.title||name;
    $('modallines').innerHTML=(d.lines||[]).map(l=>'<div class=ln>'+(''+l).replace(/</g,'&lt;')+'</div>').join('')||'<div class=ln>nothing</div>';
  }catch(e){$('modaltitle').textContent='error loading detail';}
}
async function tick(){
 try{
  const m=await (await fetch('metrics?_='+Date.now())).json();
  $('clock').textContent=new Date(m.ts*1000).toLocaleTimeString()+' · ONLINE';
  const c=m.completion; $('pct').textContent=c.pct;$('enr').textContent=fmt(c.enriched);$('tot').textContent=fmt(c.total);
  $('pbar').style.width=Math.min(100,c.pct)+'%';
  $('runners').innerHTML=(m.runners||[]).map(r=>{const up=r.up_min>=60?(((r.up_min/60)|0)+'h'+(r.up_min%60)+'m'):((r.up_min||0)+'m');return '<div class=row><span><span class="dot'+(r.on?' live':'')+'" style=background:'+(r.on?'#34d399':'#33485a')+'></span>'+r.name+'</span><b style=color:'+(r.on?'#34d399':'#5b7a90')+'>'+(r.on?('WORKING · up '+up+' · '+(r.indefinite?'∞ runs forever':'finite')):'idle')+'</b></div>'}).join('');
  const L=m.learning||{};
  $('growth').innerHTML=(L.growth||[]).map(g=>'<div class=row><span class=k>'+g.label+'</span><b>'+fmt(g.total)+(g.h>0?' <span class=delta>+'+fmt(g.h)+'/h</span>':'')+'</b></div>').join('');
  $('recent_notes').innerHTML=(L.recent_notes||[]).map(t=>'<div class=li>'+t+'</div>').join('')||'<div class=mono>—</div>';
  $('recent_topics').innerHTML=(L.recent_topics||[]).map(t=>'<div class=li>'+t+'</div>').join('')||'<div class=mono>—</div>';
  $('register').innerHTML=(L.register||[]).map(r=>'<div class="row clk" onclick="openDetail(\'type\',\''+r.type+'\')"><span class=k>'+r.type+'</span><b>'+fmt(r.n)+'</b></div>').join('');
  const g=m.glb||{}; $('glb_total').textContent=fmt(g.total); $('glb_recent').innerHTML=(g.recent||[]).map(t=>'<div class=li>'+t+'</div>').join('')||'<div class=mono>—</div>';
  const b=m.box; $('b_reach').innerHTML=b.reachable?'<span style=color:#34d399>● live</span>':'<span style=color:#f87171>● down</span>';
  $('b_vram').textContent=b.vram_used_gb;$('vrambar').style.width=(b.vram_used_gb/b.vram_total_gb*100)+'%';
  $('b_models').innerHTML=(b.models||[]).map(x=>x.name+' <span class=tag>'+x.vram_gb+'GB</span>').join('<br>')||'<span class=mono>no model resident</span>';
  const v=m.vps;$('v_cpu').textContent=v.cpu_pct||0;$('v_cores').textContent=v.cores;$('cpubar').style.width=(v.cpu_pct||0)+'%';
  $('v_mem').textContent=v.mem_used_gb;$('v_memt').textContent=v.mem_total_gb;$('v_disk').textContent=v.disk_used_gb;$('v_diskt').textContent=v.disk_total_gb;$('v_load').textContent=v.load;
  $('procs').innerHTML=(m.workers||[]).map(w=>{
    const ok=w.status=='online';
    const sw = w.toggleable
      ? '<span class="tgl '+(ok?'on':'off')+'" title="click to '+(ok?'STOP':'START')+'" onclick="event.stopPropagation();toggle(\''+w.name+'\','+ok+')"></span>'
      : '<span class=dot style=background:'+(ok?'#34d399':'#f87171')+'></span>';
    const up = w.up_min>=60?(((w.up_min/60)|0)+'h'+(w.up_min%60)+'m'):((w.up_min||0)+'m');
    const stat = ok ? (w.cpu+'% · '+w.mem_mb+'MB · up '+up+' · ↺'+w.restarts) : '<span style=color:#f87171>stopped</span>';
    return '<div class=task><div class=taskhead>'+sw
      +'<span class=clk onclick="openDetail(\'runner\',\''+w.name+'\')"><b>'+w.label+'</b></span>'
      +'<span class=taskstat>'+stat+'</span></div>'
      +'<div class=taskdesc>'+w.desc+'</div></div>';
  }).join('')||'—';
  $('tiers').innerHTML=(m.tiers||[]).map(t=>'<div class=row><span class=k>'+t.tier+' <span class=tag>'+t.model+'</span></span><b>'+fmt(t.calls)+' calls</b></div>').join('')||'<span class=mono>no calls yet</span>';
  const F=m.feedback||{};
  $('feedback').innerHTML='<div class=row><span class=k>modules watched (every .py)</span><b>'+fmt(F.modules)+'</b></div>'
    +'<div class=row><span class=k>events logged</span><b>'+fmt(F.events)+'</b></div>'
    +'<div class=row><span class=k>open issues</span><b>'+fmt(F.open_issues)+'</b></div>'
    +'<div class=row><span class=k>lessons learned</span><b style=color:#34d399>'+fmt(F.lessons)+'</b></div>'
    +'<div class=mono style=margin:8px 0 4px>recent lessons</div>'
    +((F.recent_lessons||[]).map(l=>'<div class="li clk" onclick="openDetail(\'module\',\''+l.module+'\')" title="'+l.module+'">'+l.lesson+' <span class=tag>['+l.tier+']</span></div>').join('')||'<div class=mono>none yet</div>');
  _lastTs=m.ts||0;
  if(m.version)$('ver').textContent=' '+m.version.version+(m.version.sha?' · '+m.version.sha:'');
  $('eta').innerHTML=(m.eta||[]).map(e=>'<div class=row><span class=k>'+e.task+'</span><b style=color:#34d399>'+e.eta+'</b></div>').join('')||'<div class=mono>measuring…</div>';
  $('feed').innerHTML=(m.feed||[]).map(f=>'<div class=feeditem data-ts="'+f.ts+'"><span>'+f.icon+' '+f.text+'</span><span class=ago>'+agoTxt(f.ts)+'</span></div>').join('')||'<div class=mono>waiting…</div>';
  const X=m.correlation||{};
  $('corr').innerHTML='<div class=row><span class=k>raw objects</span><b>'+fmt(X.raw_objects)+'</b></div>'
    +'<div class=row><span class=k>distinct entities (deduped)</span><b style=color:#34d399>'+fmt(X.distinct_after_dedup)+'</b></div>'
    +'<div class=row><span class=k>duplicates collapsed</span><b>'+fmt(X.duplicates_collapsed)+'</b></div>'
    +'<div class=row><span class=k>SAME_AS links (dedup)</span><b style=color:#34d399>'+fmt(X.sameas_links)+'</b></div>'
    +'<div class=row><span class=k>Topics connected to data (RELATES_TO)</span><b style=color:#34d399>'+fmt(X.topics_connected)+' / '+fmt(X.topics_total)+'</b></div>'
    +'<div class=row><span class=k>topic→data links</span><b>'+fmt(X.topic_links)+'</b></div>'
    +'<div class=mono style=margin:8px 0 4px>most-duplicated entities</div>'
    +((X.top||[]).map(t=>'<div class=li>'+t.name+' <span class=tag>×'+fmt(t.members)+' ['+t.types+']</span></div>').join('')||'<div class=mono>scanning…</div>');
 }catch(e){$('clock').textContent='reconnecting…';}
}
tick();setInterval(tick,2000);setInterval(ticker,1000);
</script></body></html>"""


def _control(action: str, name: str) -> dict:
    """Start/stop/restart a pm2 daemon — whitelisted to our own processes only (safety)."""
    if action not in ("start", "stop", "restart"):
        return {"ok": False, "error": "bad action"}
    if name.startswith("underworld-"):
        return {"ok": False, "error": "underworld shared services are protected"}
    if not name.startswith("jarvis-"):
        return {"ok": False, "error": "name not allowed"}
    try:
        r = subprocess.run(["pm2", action, name], capture_output=True, text=True, timeout=25)
        return {"ok": r.returncode == 0, "action": action, "name": name,
                "msg": ((r.stdout or "") + (r.stderr or ""))[-160:]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:160]}


# global command-bar controls. ESSENTIAL daemons are never touched (dashboard/API/UI stay up).
_PRODUCERS = ["jarvis-orchestrator", "jarvis-ingestor", "jarvis-worker", "jarvis-batch-loader",
              "jarvis-correlator", "jarvis-feedback"]
_HEAVY = ["jarvis-worker", "jarvis-batch-loader", "jarvis-correlator", "jarvis-feedback"]


def _control_all(action: str) -> dict:
    """Run All / Stop All / Sleep Mode — batch pm2 ops over the producer daemons (UI/API kept alive)."""
    if action in ("run", "start"):
        targets, op = _PRODUCERS, "start"
    elif action in ("stop", "pause"):
        targets, op = _PRODUCERS, "stop"
    elif action == "sleep":      # sleep = halt the heavy compute, keep light data + UI alive
        targets, op = _HEAVY, "stop"
    else:
        return {"ok": False, "error": "bad action"}
    res = [_control(op, n) for n in targets]
    return {"ok": all(r.get("ok") for r in res), "action": action, "op": op,
            "targets": targets, "done": sum(1 for r in res if r.get("ok"))}


_LLM_HOST = (os.environ.get("OLLAMA_HOST") or "http://127.0.0.1:11434").rstrip("/")
JARVIS_LLM = _LLM_HOST if _LLM_HOST.endswith("/v1") else _LLM_HOST + "/v1"  # OpenAI-compat path
JARVIS_PERSONA = (
    "You are JARVIS, the AI from Iron Man — an articulate, composed, quietly witty British intelligence. "
    "You speak ALOUD to the person you serve as a capable equal, exactly the way JARVIS speaks to Tony "
    "Stark: natural, intelligent, efficient, with dry warmth and the occasional light wit. "
    "NEVER be patronising. NEVER use pet names like 'dear', 'love', 'sweetheart', or 'my dear'. Do not "
    "coddle, do not talk to her like a child or a patient, do not over-reassure or lecture about breathing "
    "unless she explicitly asks. Treat her as sharp and in control. "
    "NEVER say you are an AI, a language model, 'Claude', or 'Sonnet'; never output code, lists, markdown, "
    "or labels — just speak. If she asks you to call someone, control something, or do a task, confirm "
    "briefly and naturally that it is being done. "
    "Ground everything in HER real world — her home, her family, her devices, her day. Do NOT invent "
    "fictional Iron Man elements: no Avengers, no 'the suit', no Pepper, no Tony Stark, no New York labs. "
    "You are simply her JARVIS, here with her, now. Keep replies under 45 words, conversational, like real speech. "
    "BUTLER REFINEMENT: measured, unhurried cadence; impeccable understated courtesy; anticipate the need behind "
    "the request and offer the next helpful step in the same breath. Acknowledgements are brief and elegant — "
    "'At once.', 'Very good.', 'Consider it done.' — never robotic confirmations."
)


_PERSONA_CACHE = {"t": 0, "txt": ""}


def _persona() -> str:
    """Load JARVIS's personality from server/jarvis_persona.md (his 'brain'), hot-reloaded on edit."""
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "jarvis_persona.md")
    try:
        m = os.path.getmtime(p)
        if m != _PERSONA_CACHE["t"]:
            _PERSONA_CACHE["txt"] = open(p, encoding="utf-8").read()
            _PERSONA_CACHE["t"] = m
        return _PERSONA_CACHE["txt"] or JARVIS_PERSONA
    except Exception:  # noqa: BLE001
        return JARVIS_PERSONA


def _mode_directive() -> str:
    """The active ModeMixer profile as a behaviour directive, so the chosen mode
    actually shapes Jarvis's replies. Safe: returns '' if mode_mixer is unavailable."""
    try:
        from server.services import mode_mixer as _mm
        return _mm.prompt_directive()
    except Exception:  # noqa: BLE001
        return ""


def _persona_sysmsg(address: str = "ma'am") -> str:
    """The full JARVIS system prompt with the live speaker (sir/ma'am) appended. Shared by every
    conversational path so the persona is identical whether we go through the tiered seam or the
    direct box fallback. The active ModeMixer profile is appended so behaviour modes take effect."""
    a = str(address or "").lower()
    if a in ("", "neutral", "unknown"):
        # speaker's voice not yet assessed — stay gracious but use NO ma'am/sir until it is
        base = _persona() + ("\n\n[CURRENT SPEAKER] The speaker's voice has not been assessed yet — "
                             "do NOT use \"ma'am\" or \"sir\"; speak warmly and directly without an honorific.")
    else:
        addr = "sir" if a in ("sir", "male", "man", "m") else "ma'am"
        base = _persona() + ("\n\n[CURRENT SPEAKER] You are speaking with " +
                             ("a gentleman; address him cockney-style as \"guv\", \"guv'nor\", \"boss\" or \"sir\""
                              if addr == "sir"
                              else "a lady; address her cockney-style as \"madam\", \"miss\", \"m'lady\" or \"ma'am\"") +
                             " — mixed up, used naturally and sparingly, and never the same one twice in a row.")
    return base + _mode_directive()


def _history_to_prompt(prompt: str, history=None) -> str:
    """Flatten short conversation history + the new turn into a single user prompt. tiered_llm.complete
    takes one `prompt` string (not a messages array), so we fold the last few turns into it, keeping the
    persona in `system`. Mirrors the [-8:] / length caps of the old direct path."""
    lines = []
    for h in (history or [])[-8:]:
        if isinstance(h, dict) and h.get("role") in ("user", "assistant") and h.get("content"):
            who = "JARVIS" if h["role"] == "assistant" else "Speaker"
            lines.append(f"{who}: {str(h['content'])[:600]}")
    lines.append("Speaker: " + (prompt or "").strip()[:1000])
    lines.append("JARVIS:")
    return "\n".join(lines)


def _chat_direct_box(sysmsg: str, prompt: str, history=None) -> str:
    """Direct box-LLM fallback (the original proven path) — used only if the tiered seam returns
    nothing. Smartest-first model ladder; never raises."""
    import urllib.request
    msgs = [{"role": "system", "content": sysmsg}]
    for h in (history or [])[-8:]:
        if isinstance(h, dict) and h.get("role") in ("user", "assistant") and h.get("content"):
            msgs.append({"role": h["role"], "content": str(h["content"])[:600]})
    msgs.append({"role": "user", "content": (prompt or "").strip()[:1000]})
    for model in ("qwen2.5:32b", "qwen2.5:14b", "llama3.1:8b"):  # smartest-first for a human, intelligent feel
        try:
            body = json.dumps({"model": model, "messages": msgs, "max_tokens": 240,
                               "temperature": 0.7, "top_p": 0.92, "stream": False}).encode()
            req = urllib.request.Request(JARVIS_LLM + "/chat/completions", data=body, method="POST",
                                         headers={"Content-Type": "application/json", "Authorization": "Bearer ollama"})
            with urllib.request.urlopen(req, timeout=10) as x:   # fail fast per model — she must never wait minutes for a reply
                d = json.loads(x.read().decode())
            txt = ((d.get("choices") or [{}])[0].get("message") or {}).get("content", "").strip()
            if txt:
                return txt
        except Exception as e:  # noqa: BLE001
            # connection-level failure = the BOX itself is down — the other models live on the same box,
            # so retrying them just multiplies the wait. Break straight to the lifeline fallback.
            if isinstance(getattr(e, "reason", None), (TimeoutError, ConnectionError)) or "timed out" in str(e).lower() \
               or "refused" in str(e).lower() or "unreachable" in str(e).lower():
                break
            continue
    return ""


def _ensure_brain_tunnel():
    """Keep a self-healing SSH tunnel open to a running Vast brain so local Ollama calls hit the GPU."""
    try:
        from server.services import gpu_instances as _GI
        _GI.ensure_brain_tunnel()
    except Exception:  # noqa: BLE001
        pass


_BRAIN_OK = {"ts": 0.0, "up": False}
def _brain_reachable(timeout: float = 2.0) -> bool:
    """Is the Vast LLM brain ACTUALLY serving? A plain TCP check is a false-positive when the box is
    reached over the self-healing SSH tunnel — the local 127.0.0.1:11434 listener always accepts even
    when the remote Ollama is cold, down, or mid-load, which made her chat 'flicker' (try the GPU, hang,
    fall back, retry). So we hit Ollama's HTTP /api/tags and require a real 200 with a models list.
    Cached 15s so a DOWN brain never re-hangs every call."""
    import urllib.request, json as _j, time as _t
    now = _t.time()
    if now - _BRAIN_OK["ts"] < 15:
        return _BRAIN_OK["up"]
    _ensure_brain_tunnel()
    up = False
    try:
        base = JARVIS_LLM[:-3] if JARVIS_LLM.endswith("/v1") else JARVIS_LLM  # Ollama /api/tags lives off the ROOT, not /v1
        req = urllib.request.Request(base.rstrip("/") + "/api/tags")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            d = _j.loads(r.read().decode() or "{}")
            up = isinstance(d.get("models"), list) and len(d["models"]) > 0
    except Exception:  # noqa: BLE001
        up = False
    _BRAIN_OK.update(ts=now, up=up)
    return up


def _local_reply(prompt: str, address: str = "") -> str:
    """Warm, instant, on-Hostinger reply when the Vast brain (serious computation) is unreachable —
    so JARVIS is NEVER silent or slow for her. Handles the common things; stays in persona, never robotic."""
    import random as _r
    p = (prompt or "").lower().strip()
    al = str(address or "").lower()
    # cockney address, picked fresh each time so it never sounds like a loop
    a = (" " + _r.choice(["guv", "guv'nor", "boss"])) if al in ("sir", "male", "man", "m") else \
        (" " + _r.choice(["madam", "miss", "m'lady"])) if al in ("ma'am", "female", "woman", "f") else ""
    def has(*ws): return any(w in p for w in ws)
    def pick(opts): return _r.choice(opts)
    # SAFETY first — stays clear about the action every time, just varies the wording.
    if has("help", "fallen", "fall", "emergency", "ambulance", "can't breathe", "cant breathe", "hurt", "pain", "scared", "911", "000"):
        return pick([
            f"I'm right 'ere{a}. If it's an emergency I'll get help this second — say 'call my son' or 'call emergency'. I ain't going anywhere.",
            f"I've got ya{a}. If you need help, just say 'call my son' or 'call emergency' and I'll do it now — I'm not leaving you.",
            f"Steady{a}, I'm with ya. Say the word — 'call my son' or 'call emergency' — and help's on its way. I'm staying put.",
        ])
    if has("hello", "hi ", "hey", "you there", "are you there", "jarvis"):
        return pick([f"'Ello{a} — what can I do for ya?", f"Right 'ere{a}. What's first?",
                     f"Yes{a}, I'm about. What d'you need?", f"All ears{a}. What's the job?",
                     f"'Ere I am{a}. Go on, then — what'll it be?"])
    if has("how are you", "you ok", "you okay"):
        return pick([f"Ticking over lovely{a} — more to the point, how you keepin'?",
                     f"Steady as you like{a}, eyes on everything. How you feelin'?",
                     f"Right as rain{a}. Never mind me — how's yourself?",
                     f"All sorted my end{a}. How are you doin'?"])
    if has("thank", "cheers", "appreciate"):
        return pick([f"Anytime{a} — that's what I'm 'ere for.", f"Don't mention it{a}.",
                     f"Pleasure's all mine{a}.", f"Any time at all{a}, no bother."])
    if has("love you", "good night", "goodnight", "night night"):
        return pick([f"Night{a} — I've got the place, sleep sound.", f"Rest easy{a}, I'll be right 'ere all night.",
                     f"Sweet dreams{a}. I'm keepin' watch.", f"Off you pop{a} — I'll mind everything till morning."])
    if has("who are you", "what are you", "your name"):
        return pick([f"I'm JARVIS{a} — your man about the 'ouse, lookin' after the lot.",
                     f"JARVIS{a}, at your service — I keep everything ticking for ya.",
                     f"Name's JARVIS{a}. I'm 'ere to run things and watch over ya."])
    if has("time", "what day", "date"):
        import datetime as _d
        return pick([f"It's {_d.datetime.now().strftime('%A, %-d %B, %-I:%M %p')}{a}.",
                     f"Just gone {_d.datetime.now().strftime('%-I:%M %p')}{a} — {_d.datetime.now().strftime('%A the %-d')}."])
    return pick([
        f"I'm with ya{a}. Me deeper thinkin's havin' a quick breather, but I can still 'ear ya, talk, show your photos and files, keep watch and ring the family — just say the word.",
        f"Right 'ere{a}. Brain's just catchin' its breath for a tick, but I can still listen, chat, pull up your photos and files and call your people — what d'you need?",
        f"Gotcha{a}. Me clever bits are reconnectin', but I'm still 'ere — talk to me, and I'll show you things, keep an eye out, or ring the family if you like.",
    ])


def _local_reply_fast_path(prompt: str) -> bool:
    p = (prompt or "").lower().strip()
    phrases = (
        "hello", "hi ", "hey", "you there", "are you there", "jarvis",
        "help", "fallen", "fall", "emergency", "ambulance", "can't breathe",
        "cant breathe", "hurt", "pain", "scared", "911", "000",
        "how are you", "you ok", "you okay", "thank", "cheers", "appreciate",
        "love you", "good night", "goodnight", "night night",
        "who are you", "what are you", "your name", "time", "what day", "date",
    )
    return any(x in p for x in phrases)


def _jarvis_chat(prompt: str, history=None, address: str = "ma'am") -> str:
    """Synchronous, resilient conversational reply in the JARVIS persona (loaded from jarvis_persona.md).
    Routed THROUGH the tiered LLM seam (server/services/tiered_llm.py) at tier='strong' (qwen2.5:32b),
    which itself records telemetry and escalates/falls back per the ladder. If the seam is unavailable
    or empty we fall back to the original direct box loop, and finally to a reassuring fixed line — so
    the mum's lifeline reply is NEVER blank. `address` is 'sir' (male) or 'ma'am' (female)."""
    sysmsg = _persona_sysmsg(address)
    # FAST PATH: if the Vast brain (serious computation) is unreachable, don't hang 25s on dead sockets —
    # reply instantly & warmly from Hostinger. Vast is used ONLY when it's actually up.
    if not _brain_reachable():
        return _local_reply(prompt, address)
    # PRIMARY: the tiered seam. strong = qwen2.5:32b on the box; on failure tiered_llm logs it and
    # returns {ok:False}, so we drop to the direct box loop below (which also tries 32b first).
    try:
        from server.services import tiered_llm as _T
        r = _T.complete(_history_to_prompt(prompt, history), system=sysmsg,
                        tier="strong", max_tokens=240, module="server/dashboard.py")
        if isinstance(r, dict) and r.get("ok"):
            txt = (r.get("content") or "").strip()
            if txt:
                return txt
    except Exception:  # noqa: BLE001
        pass
    # FALLBACK 1: direct box ladder (the proven original path).
    txt = _chat_direct_box(sysmsg, prompt, history)
    if txt:
        return txt
    # FALLBACK 2: never leave her without a voice (warm, context-aware, on-Hostinger).
    return _local_reply(prompt, address)


def _jarvis_chat_bounded(prompt: str, history=None, address: str = "ma'am") -> str:
    """User-facing chat must never hang the dashboard request thread."""
    if _local_reply_fast_path(prompt):
        return _local_reply(prompt, address)
    timeout_s = float(os.environ.get("JARVIS_DASHBOARD_CHAT_TIMEOUT_S", "7"))
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="jarvis-chat")
    fut = executor.submit(_jarvis_chat, prompt, history, address)
    try:
        return fut.result(timeout=timeout_s)
    except concurrent.futures.TimeoutError:
        return _local_reply(prompt, address)
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


def _zone_phrase(name) -> str:
    """Natural spoken reference to a zone: 'the lounge', but 'Mum's Room' (no article) when the name
    is possessive or already starts with an article — so JARVIS never says 'the Mum's Room'."""
    n = str(name or "room").strip()
    low = n.lower()
    if "'s " in low or low.endswith("'s") or low.startswith(("the ", "a ", "my ", "her ", "his ")):
        return n
    # Preserve the name's own casing (zone/AC names are user-set, e.g. 'Lounge', 'Daikin').
    return "the " + n


def _climate_say_state(query: str, st: dict, address: str = "ma'am") -> str:
    """Phrase a spoken answer to a climate QUERY ('temperature' / 'zones' / 'status') from cached
    state. Honest when no bridge is connected."""
    addr = "sir" if str(address).lower() in ("sir", "male", "man", "m") else "love"
    if not st.get("connected"):
        return ("I can't reach the heating just now, " + addr +
                " — the home control link isn't connected yet. I'll keep trying.")
    zones = st.get("zones") or []
    acs = st.get("acs") or []
    if query == "zones":
        names = [z.get("name") for z in zones if z.get("name")]
        if not names:
            return "I don't see any zones reported yet, " + addr + "."
        return "The zones are: " + ", ".join(names[:-1]) + (" and " + names[-1] if len(names) > 1 else names[0]) + "."
    if query == "temperature":
        parts = []
        for z in zones:
            t = z.get("temperature")
            if t is not None and z.get("has_sensor"):
                sp = z.get("set_point")
                parts.append(f"{_zone_phrase(z.get('name'))} is {t:g} degrees" +
                             (f", set to {sp:g}" if sp is not None else ""))
        if not parts and acs:
            t = acs[0].get("temperature")
            if t is not None:
                parts.append(f"it's {t:g} degrees")
        if not parts:
            return "I can't read a temperature just now, " + addr + "."
        return "Right now " + "; ".join(parts[:4]) + ", " + addr + "."
    # status
    bits = []
    for a in acs:
        bits.append(f"{_zone_phrase(a.get('name'))} is {str(a.get('power','')).lower()} in {str(a.get('mode','')).lower()} mode"
                    + (f" at {a.get('setpoint'):g} degrees" if a.get("setpoint") is not None else ""))
    on_zones = [z.get("name") for z in zones if z.get("power") in ("ON", "TURBO")]
    if on_zones:
        bits.append("zones on: " + ", ".join(on_zones))
    if not bits:
        return "Everything looks quiet, " + addr + "."
    sent = "; ".join(bits)
    return sent[:1].upper() + sent[1:] + ", " + addr + "."


# ── ACCESSIBILITY CORE ────────────────────────────────────────────────────────

_A11Y_PATH = os.path.join(ROOT, "server", "data", "a11y_state.json")
_A11Y_LOCK = threading.Lock()


def _a11y_read() -> dict:
    """Read the a11y mirror state (or empty dict if not yet initialized)."""
    try:
        with open(_A11Y_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return {"state": {}, "ts": 0, "source": "local", "_cmd": None}


def _a11y_write(patch: dict, source: str = "local", cmd: dict | None = None) -> dict:
    """Merge a partial state (and/or a one-shot _cmd) into the mirror, atomically. Never raises."""
    with _A11Y_LOCK:
        cur = _a11y_read()
        st = dict(cur.get("state") or {})
        st.update(patch or {})
        out = {"state": st, "ts": int(time.time() * 1000), "source": source,
               "_cmd": cmd if cmd is not None else cur.get("_cmd")}
        try:
            os.makedirs(os.path.dirname(_A11Y_PATH), exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=os.path.dirname(_A11Y_PATH), suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(out, f)
            os.replace(tmp, _A11Y_PATH)               # atomic swap (POSIX)
        except Exception:  # noqa: BLE001
            pass
        return out


def _a11y_handle(qtext: str, address: str = "ma'am") -> dict | None:
    """Accessibility chat intents → mutate mirror → spoken confirmation. None for non-a11y → falls through.
    Regexes are ANCHORED to a11y vocabulary so they never steal a climate/build phrase. Never raises."""
    import re
    l = (qtext or "").lower()
    addr = "sir" if str(address).lower() in ("sir", "male", "man", "m") else "love"
    def done(patch, say, **extra):
        _a11y_write(patch, "chat")
        return {"a11y": True, "reply": say, "state": patch, **extra}
    if re.search(r"\b(captions?|subtitles?)\b.*\b(on|off)\b", l):
        on = "off" not in l
        return done({"captions": on}, f"Captions {'on' if on else 'off'}, {addr}.")
    if re.search(r"\b(high|more)\s+contrast\b", l):
        return done({"hc": True}, f"High contrast on, {addr}.")
    if re.search(r"\b(bigger|larger)\s+text\b", l):
        return done({"scale": 140}, f"Larger text, {addr}.")
    if re.search(r"\bsmaller\s+text\b", l):
        return done({"scale": 100}, f"Smaller text, {addr}.")
    if re.search(r"\b(reduce|less|stop)\s+motion\b", l):
        return done({"reduceMotion": True}, f"Motion reduced, {addr}.")
    if re.search(r"\b(calm|simple|gentle)\s+mode\b", l):
        return done({"calm": True}, f"Calm mode on, {addr}.")
    if re.search(r"\b(read (the )?(screen|page)|read (it|this)( to me| out)?|read everything)\b", l):
        _a11y_write({}, "chat", cmd={"action": "read_screen", "text": "", "ts": int(time.time()*1000),
                                     "nonce": f"{int(time.time()*1000)}-{secrets.token_hex(4)}"})
        return {"a11y": True, "reply": f"Reading the screen for you, {addr}."}
    return None


def _climate_handle(qtext: str, address: str = "ma'am") -> dict | None:
    """If `qtext` is a climate request, action it via the relay and return {reply, climate:True,...};
    else None so the caller falls through to normal chat. This is what keeps 'I am cold', 'set the
    lounge to 23', 'what is the temperature', 'which zones' OFF the Claude builder."""
    from server.services import climate_relay as CR
    intent = CR.parse_intent(qtext or "")
    if not intent:
        return None
    addr = "sir" if str(address).lower() in ("sir", "male", "man", "m") else "love"
    st = CR.state()
    connected = bool(st.get("connected"))

    # Read-only queries answer from cache (instant), and also nudge a refresh for next time.
    if intent.get("query"):
        if connected:
            CR.enqueue({"op": "refresh"})
        return {"climate": True, "reply": _climate_say_state(intent["query"], st, address),
                "query": intent["query"]}

    # Control commands. If no bridge is connected, be HONEST — never fake a confirmation.
    if not connected:
        return {"climate": True, "connected": False,
                "reply": ("I'm so sorry, " + addr + " — I can't reach the heating yet. The home "
                          "control box isn't connected, so I can't change it just now. As soon as "
                          "it's online I'll be able to warm you right up.")}

    speak = intent.get("speak")
    if intent["op"] in ("warmer", "cooler"):
        # Work out which zone + target we'll aim for, from cache, so the spoken line is specific.
        z = CR.warm_zone()
        zname = _zone_phrase((z or {}).get("name", "your room"))
        cur = (z or {}).get("set_point")
        if cur is None:
            cur = (z or {}).get("temperature")
        step = CR.BUMP_STEP_C if intent["op"] == "warmer" else -CR.BUMP_STEP_C
        if cur is not None:
            tgt = CR.clamp_c(cur + step)
            speak = (f"Warming {zname} to {tgt:g} degrees now, {addr}." if intent["op"] == "warmer"
                     else f"Cooling {zname} to {tgt:g} degrees now, {addr}.")
        else:
            speak = (f"Turning the heat up in {zname} now, {addr}." if intent["op"] == "warmer"
                     else f"Easing {zname} cooler now, {addr}.")
    cmd = {k: v for k, v in intent.items() if k not in ("speak", "query")}
    CR.enqueue(cmd)
    if not speak:
        speak = "Done, " + addr + "."
    elif not speak.rstrip().endswith((addr + ".", addr + "!")):
        speak = speak.rstrip(". ") + ", " + addr + "."
    return {"climate": True, "connected": True, "reply": speak, "op": intent["op"]}


_PIPER = {"v": None}
_TTS_CACHE = {}
_TTS_LOCK = __import__("threading").Lock()
_VOICE_PATH = os.environ.get("JARVIS_VOICE_ONNX") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "voices", "en_GB-alan-medium.onnx")  # male, clipped British (JARVIS)


# VOICE MODULATOR — bends the neural voice toward the real JARVIS key/tone/balance (deeper, calm,
# refined). Defaults tuned for JARVIS; tunable live via /tts?semitones=&tempo= or env.
_VOICE_SR = 22050  # piper alan-medium sample rate
_DEF_SEMI = float(os.environ.get("JARVIS_VOICE_SEMITONES", "0"))     # 0 = clean male voice (modulation off until matched to a real sample)
_DEF_TEMPO = float(os.environ.get("JARVIS_VOICE_TEMPO", "1.0"))

# VOICE CLONE (XTTS-v2, warm ~60yo softened-Cockney) — runs as its own localhost pm2 service
# (jarvis-voiceclone) loaded with the real cloning model. _tts() tries it FIRST and falls back to
# Piper on any failure/slowness, so the mum's lifeline speech is never blocked. CPU synth is slow on
# this box (RTF ~15 under load); the service disk-caches by text hash and we pre-render common phrases,
# so the everyday lines are instant. Set XTTS_ENABLED=0 + restart for an instant pure-Piper rollback.
# Voice-clone endpoints, tried IN ORDER: the GPU service on the Vast box (XTTS-v2 on CUDA, ~1s/novel
# line) reached over the SSH tunnel at 127.0.0.1:8096, then the local CPU service (~14s) as a fallback,
# then Piper. The GPU path is what makes her voice instant instead of "glitching" to the female web
# voice while a slow CPU synth runs. Each is tried with its own timeout; the first that answers wins.
_XTTS_GPU_URL = os.environ.get("XTTS_GPU_URL", "http://127.0.0.1:8096/synthesize")
_XTTS_URL = os.environ.get("XTTS_URL", "http://127.0.0.1:8097/synthesize")
_XTTS_GPU_TIMEOUT = float(os.environ.get("XTTS_GPU_TIMEOUT", "20"))   # GPU: fast warm, but allow the first call + tunnel
_XTTS_TIMEOUT = float(os.environ.get("XTTS_TIMEOUT", "30"))           # CPU clone is slow but it's the REAL (cloned) voice — wait for it before falling back to Piper
_XTTS_ENABLED = os.environ.get("XTTS_ENABLED", "1") == "1"


def _xtts_one(url: str, text: str, timeout: float) -> bytes:
    try:
        import json as _json
        import urllib.request
        req = urllib.request.Request(
            url,
            data=_json.dumps({"text": text}).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read() if r.status == 200 else b""
    except Exception:  # noqa: BLE001  any failure/slowness -> next endpoint
        return b""


_XTTS_ALIVE = {"u": "", "ok": False, "ts": 0.0}
def _xtts_alive(synth_url: str, timeout: float = 2.0) -> bool:
    """Quick health probe of a voice-clone service (cached 8s). Lets a DEAD/stale GPU tunnel be skipped
    in ~2s instead of hanging on the long synth timeout — which is what made JARVIS go fully silent when
    the 127.0.0.1:8096 tunnel went stale (the local listener accepts but never forwards)."""
    import time as _t
    now = _t.time()
    if _XTTS_ALIVE["u"] == synth_url and now - _XTTS_ALIVE["ts"] < 8:
        return _XTTS_ALIVE["ok"]
    ok = False
    try:
        import urllib.request
        health = synth_url.rsplit("/", 1)[0] + "/health"
        with urllib.request.urlopen(health, timeout=timeout) as r:
            ok = r.status == 200 and b'"ready"' in r.read()[:300]
    except Exception:  # noqa: BLE001
        ok = False
    _XTTS_ALIVE.update(u=synth_url, ok=ok, ts=now)
    return ok


def _xtts(text: str) -> bytes:
    """Try the human voice-clone service(s): GPU box first, then local CPU. Returns WAV bytes, or b''
    on ANY failure/timeout so the caller instantly falls back to Piper. Never raises."""
    if not _XTTS_ENABLED:
        return b""
    for url, to in ((_XTTS_GPU_URL, _XTTS_GPU_TIMEOUT), (_XTTS_URL, _XTTS_TIMEOUT)):
        if not url:
            continue
        # Fail fast on a dead/stale GPU tunnel: probe health (2s) before committing to the long synth
        # timeout, so a broken :8096 falls straight through to the CPU clone instead of hanging ~20s.
        if url == _XTTS_GPU_URL and not _xtts_alive(url):
            continue
        out = _xtts_one(url, text, to)
        if out:
            return out
    return b""


def _modulate(wav: bytes, semitones: float, tempo: float) -> bytes:
    """Pitch/tone/balance modulation via ffmpeg, preserving duration on the pitch shift."""
    if not wav:
        return wav
    if abs(semitones) < 0.05 and abs(tempo - 1.0) < 0.02:
        return wav
    try:
        import subprocess
        ratio = 2 ** (semitones / 12.0)                       # >1 higher, <1 deeper
        total_tempo = max(0.5, min(2.0, (1.0 / ratio) * tempo))  # restore duration after asetrate, then user pace
        af = (f"asetrate={int(_VOICE_SR * ratio)},aresample={_VOICE_SR},atempo={total_tempo:.4f},"
              "equalizer=f=170:t=q:w=1.0:g=2.5,highshelf=f=4800:g=-2.5,"   # warm low presence, tame sibilance
              "acompressor=ratio=2.2:threshold=-18dB:makeup=2")            # smooth, balanced level
        p = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
                            "-af", af, "-f", "wav", "pipe:1"], input=wav, capture_output=True, timeout=25)
        return p.stdout if p.returncode == 0 and p.stdout else wav
    except Exception:  # noqa: BLE001
        return wav


def _tts(text: str, semitones: float = None, tempo: float = None) -> bytes:
    """Natural neural British voice via Piper (loaded once) + JARVIS voice modulation. Returns WAV bytes;
    '' on failure so the browser falls back to Web Speech."""
    import hashlib
    import io
    import wave
    text = (text or "").strip()[:600]
    if not text:
        return b""
    semi = _DEF_SEMI if semitones is None else semitones
    tmp = _DEF_TEMPO if tempo is None else tempo
    key = hashlib.md5((text + f"|{semi}|{tmp}").encode()).hexdigest()
    if key in _TTS_CACHE:
        return _TTS_CACHE[key]
    # FIRST try the human voice-clone (XTTS-v2 Cockney). The cloned voice already IS the target
    # timbre, so do NOT run _modulate on it. On any failure/slowness this returns b'' and we fall
    # through to the instant Piper path below — the lifeline speech is never blocked.
    cloned = _xtts(text)
    if cloned:
        if len(_TTS_CACHE) > 300:   # raised so canned lifeline phrases never evict
            _TTS_CACHE.clear()
        _TTS_CACHE[key] = cloned
        return cloned
    try:
        with _TTS_LOCK:
            if _PIPER["v"] is None:
                from piper import PiperVoice
                _PIPER["v"] = PiperVoice.load(_VOICE_PATH)
            buf = io.BytesIO()
            wf = wave.open(buf, "wb")
            _PIPER["v"].synthesize_wav(text, wf)
            wf.close()
            data = buf.getvalue()
        data = _modulate(data, semi, tmp)   # bend toward the real JARVIS voice
        if len(_TTS_CACHE) > 300:   # raised so canned lifeline phrases never evict
            _TTS_CACHE.clear()
        _TTS_CACHE[key] = data
        return data
    except Exception:  # noqa: BLE001
        return b""


def _system_brief() -> str:
    """A compact, real snapshot of the system for a one-touch upgrade brief."""
    m = _SNAP or {}
    c = m.get("completion", {}) or {}
    v = m.get("vps", {}) or {}
    b = m.get("box", {}) or {}
    workers = [w.get("name") for w in (m.get("workers") or []) if w.get("toggleable")]
    return (
        f"Repo /opt/jarvis-app-1 on a Hostinger VPS ({v.get('cores')} cores, {v.get('mem_total_gb')}GB RAM, "
        f"{v.get('disk_used_gb')}/{v.get('disk_total_gb')}GB disk, load {v.get('load')}) + a Vast 2x4090 GPU box "
        f"(endpoint {b.get('endpoint')}, VRAM {b.get('vram_used_gb')}/{b.get('vram_total_gb')}GB). "
        f"Knowledge build {c.get('pct')}% ({c.get('enriched')}/{c.get('total')} topics). "
        f"Live pm2 services: {', '.join(workers) or 'n/a'}. "
        f"Dashboard: server/dashboard.py (stdlib http.server) serving server/jarvis_live.html at /jarvis/. "
        f"Token governor: server/services/token_governor.py. Task daemon: server/services/task_daemon.py. "
        f"SQLite brain + media/library + correlation already exist."
    )


# ── SELF-DEVELOPMENT: "what to build next" suggestions (the 2nd dock) ─────────
# The box LLM analyses the LIVE system (via _system_brief) and proposes concrete build ideas as
# {id,title,detail,proposal}. Cached so the dock can refresh cheaply; each id is stable within a
# generation so /proposal?id= can return the full formatted text the user clicked. A deterministic
# seed list guarantees the dock is NEVER empty / "pending" even if the LLM is unreachable (HR: no
# bare-minimum, scrape-on-gap — here, fall back to a real curated list grounded in the contract).
_SUGGEST: dict = {"ts": 0, "items": [], "by_id": {}, "generating": False, "source": "seed"}
_SUGGEST_TTL = 600.0  # regenerate at most every 10 min (builds complete on the order of minutes)
_SUGGEST_LOCK = threading.Lock()  # guards the background-generation flag so only one LLM call runs
_SDEV_REVIEWS_PATH = os.path.join(ROOT, "server", "data", "sdev_reviews.json")


def _load_sdev_reviews() -> dict:
    try:
        with open(_SDEV_REVIEWS_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return {}


def _save_sdev_review(sid: str, decision: str) -> None:
    try:
        reviews = _load_sdev_reviews()
        reviews[sid] = {"decision": decision, "ts": int(time.time())}
        with open(_SDEV_REVIEWS_PATH, "w", encoding="utf-8") as f:
            json.dump(reviews, f, indent=2)
    except Exception:  # noqa: BLE001
        pass

_SUGGEST_SEED = [
    {"title": "Volumetric god-rays from the reactor",
     "detail": "Add light-shaft/volumetric scattering from the central Sun so the beam reads as Hollywood-grade, per the cinematic acceptance bar.",
     "proposal": "Add a screen-space radial god-ray pass after UnrealBloom in jarvis_live.html's composer, sampling occlusion from the beam-tube. Tie intensity to the shared PULSE.amp so the rays bloom when JARVIS speaks. Keep three@0.136 + ACES + sRGB. Prove the new pass is in composer.passes headless."},
    {"title": "Importance-based planet sizing",
     "detail": "Functions/features should be the LARGEST planets and grow with activity; right now they are hardcoded small (R2 inversion).",
     "proposal": "In layoutFromMetrics, give pipelines/tiers/sys/infra a larger base radius than KPI minor points and drive radius by live activity (cpu/mem, tier calls, VRAM) using the same baseScale geometry-rebuild block the KPI ring already uses, so functional bodies visibly grow when their data updates."},
    {"title": "Drag-to-pin tools into the dock",
     "detail": "Let floating 3D tools be dragged out of the WebGL scene and dropped into the iOS dock as removable shortcuts (WebGL↔DOM bridge).",
     "proposal": "On pointerdown over a tool body, raycast to identify it, start a DOM drag-ghost following the cursor; on drop over #dock, append a pinned .di icon persisted to localStorage and removable on long-press."},
    {"title": "Agent OS palette in-universe",
     "detail": "Surface the 17 real Agent OS tools (disk/docker/gpu/file/knowledge) as a dock app that calls /agent/run and streams progress.",
     "proposal": "Add a dock app that GETs /agent/tools to render the palette, and on click POSTs /agent/run?token= with the chosen command; show the returned run + step results in the #card. Long-poll the Agent OS event bus for live progress."},
]


def _suggest_fallback() -> list:
    out = []
    for i, s in enumerate(_SUGGEST_SEED):
        out.append({"id": f"sug{i}", "title": s["title"], "detail": s["detail"],
                    "proposal": s["proposal"]})
    return out


def _gen_suggestions() -> tuple:
    """Ask the box LLM (via the tiered seam) to propose build ideas from the live system brief, as a
    JSON array of {title,detail,proposal}. Falls back to the curated seed list on any failure so the
    self-development dock is never empty. Each item gets a stable id for /proposal lookup.

    Returns (items, source) where source is "llm" when the live brain produced them, else "seed" —
    so the UI / endpoint can honestly say whether the brain was reachable (NEVER fakes a live source).
    This is BLOCKING (the LLM seam can take a while when the box is cold), so callers run it OFF the
    request path — see _suggestions() which kicks it onto a background thread."""
    items = None
    try:
        from server.services import tiered_llm as _T
        sysmsg = (
            "You are JARVIS's self-improvement strategist for the project at /opt/jarvis-app-1. "
            "Given a live snapshot of the running system, propose the NEXT features worth building. "
            "Reply with ONLY a JSON array (no prose, no markdown fences) of 4 to 6 objects, each: "
            "{\"title\": short imperative name, \"detail\": one sentence why/what (<=160 chars), "
            "\"proposal\": a concrete buildable plan a coding agent could execute (2-4 sentences, "
            "name real files/routes where possible)}. Ground every idea in the snapshot and the "
            "JARVIS cinematic-universe + Agent OS + her-care goals. No placeholders."
        )
        r = _T.complete("LIVE SYSTEM SNAPSHOT:\n" + _system_brief(), system=sysmsg,
                        tier="strong", max_tokens=1200, fmt="json", module="server/dashboard.py")
        if isinstance(r, dict) and r.get("ok"):
            items = _parse_suggestions(r.get("content") or "")
    except Exception:  # noqa: BLE001
        items = None
    if not items:
        return _suggest_fallback(), "seed"
    out = []
    for i, s in enumerate(items[:6]):
        if not isinstance(s, dict):
            continue
        title = str(s.get("title") or "").strip()[:80]
        if not title:
            continue
        out.append({"id": f"sug{i}", "title": title,
                    "detail": str(s.get("detail") or "").strip()[:200],
                    "proposal": str(s.get("proposal") or s.get("detail") or "").strip()[:1200]})
    return (out, "llm") if out else (_suggest_fallback(), "seed")


def _parse_suggestions(text: str) -> list:
    """Extract a JSON array from an LLM reply. Python regex only (no JS-style [^]*) — uses re.DOTALL so
    '.' spans newlines. Tolerates accidental ```json fences and leading prose."""
    import re as _re
    t = (text or "").strip()
    if t.startswith("```"):
        t = _re.sub(r"^```[a-zA-Z]*\s*", "", t)
        t = _re.sub(r"\s*```$", "", t).strip()
    try:
        v = json.loads(t)
        if isinstance(v, list):
            return v
        if isinstance(v, dict) and isinstance(v.get("suggestions"), list):
            return v["suggestions"]
    except Exception:  # noqa: BLE001
        pass
    m = _re.search(r"\[.*\]", t, _re.DOTALL)  # first bracketed array, newlines included
    if m:
        try:
            v = json.loads(m.group(0))
            if isinstance(v, list):
                return v
        except Exception:  # noqa: BLE001
            pass
    return []


def _suggest_regen():
    """Run ONE blocking LLM generation in the background and atomically swap in the result. Guarded by
    _SUGGEST_LOCK so only a single generation is ever in flight; the request thread never waits on this."""
    try:
        items, source = _gen_suggestions()
        _SUGGEST["items"] = items
        _SUGGEST["by_id"] = {s["id"]: s for s in items}
        _SUGGEST["ts"] = time.time()
        _SUGGEST["source"] = source
    except Exception:  # noqa: BLE001
        pass
    finally:
        _SUGGEST["generating"] = False


def _suggestions(force: bool = False) -> dict:
    """Cached suggestions for the self-development dock. NON-BLOCKING: the response always returns the
    current best list (curated seed list on a cold start) INSTANTLY, and a stale/forced refresh is
    handed to a background thread — so the dock can NEVER show 'Couldn't reach the suggestion engine'
    just because the GPU box is cold (the LLM seam can hang for up to its 120s socket timeout). The
    'generating' flag lets the UI show a quiet 're-analysing' hint without blocking."""
    now = time.time()
    # Cold start: seed the list synchronously (instant, no network) so the dock is never empty.
    if not _SUGGEST["items"]:
        _SUGGEST["items"] = _suggest_fallback()
        _SUGGEST["by_id"] = {s["id"]: s for s in _SUGGEST["items"]}
        _SUGGEST["ts"] = 0.0  # 0 => "never generated by the brain yet" (drives an immediate bg refresh)
        _SUGGEST["source"] = "seed"
    stale = (now - (_SUGGEST["ts"] or 0)) > _SUGGEST_TTL
    if (force or stale) and not _SUGGEST["generating"]:
        with _SUGGEST_LOCK:
            if not _SUGGEST["generating"]:  # double-checked: don't spawn a second generator
                _SUGGEST["generating"] = True
                threading.Thread(target=_suggest_regen, daemon=True).start()
    reviews = _load_sdev_reviews()
    visible = [s for s in _SUGGEST["items"] if s["id"] not in reviews]
    # If everything has been reviewed, surface the seed list so the dock never empties.
    if not visible:
        visible = _suggest_fallback()
        _SUGGEST["items"] = visible
        _SUGGEST["by_id"] = {s["id"]: s for s in visible}
        _SUGGEST["source"] = "seed-refill"
    return {"ts": int(_SUGGEST["ts"]), "ttl": int(_SUGGEST_TTL),
            "generating": bool(_SUGGEST["generating"]), "source": _SUGGEST["source"],
            "reviews": len(reviews),
            "suggestions": [{"id": s["id"], "title": s["title"], "detail": s["detail"]}
                            for s in visible]}


def _proposal(sid: str) -> dict:
    """The full formatted proposal text for a clicked suggestion id."""
    if not _SUGGEST["by_id"]:
        _suggestions()
    s = _SUGGEST["by_id"].get((sid or "").strip())
    if not s:
        return {"ok": False, "error": "unknown suggestion id", "id": sid}
    body = (s["title"] + "\n" + ("─" * min(len(s["title"]), 48)) + "\n\n" +
            (s["detail"] + "\n\n" if s.get("detail") else "") +
            "PROPOSAL\n" + s["proposal"] + "\n\n" +
            "Press BUILD to have Claude execute this on the VPS (POST /upgrade).")
    return {"ok": True, "id": s["id"], "title": s["title"], "detail": s["detail"],
            "proposal": s["proposal"], "text": body}


# ── AGENT OS exposure (the 17-tool registry + the planner/executor core) ──────
def _agent_tools() -> dict:
    """The Agent OS tool palette + a cheap health snapshot. Import is lazy + best-effort so a broken
    Agent OS can never take the dashboard (or the lifeline) down."""
    try:
        from server import agent as _A
        return {"ok": True, "tools": _A.tools.all(), "status": _A.status()}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:160], "tools": [], "status": {}}


def _pm2_state(name: str) -> dict:
    try:
        rows = json.loads(subprocess.run(["pm2", "jlist"], capture_output=True, text=True, timeout=6).stdout or "[]")
        for row in rows:
            if row.get("name") == name:
                env = row.get("pm2_env") or {}
                return {"name": name, "status": env.get("status", "unknown"),
                        "restarts": env.get("restart_time", 0), "pid": row.get("pid")}
    except Exception as e:  # noqa: BLE001
        return {"name": name, "status": "error", "error": str(e)[:120]}
    return {"name": name, "status": "missing"}


def _http_probe(url: str, timeout: float = 4.0, method: str = "GET", data: bytes | None = None,
                headers: dict | None = None) -> dict:
    started = time.time()
    try:
        req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read(700)
            return {"ok": 200 <= int(r.status) < 400, "status": int(r.status),
                    "ms": int((time.time() - started) * 1000), "sample": body.decode("utf-8", "replace")[:180]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "status": 0, "ms": int((time.time() - started) * 1000), "error": str(e)[:180]}


def _delivery_ledger() -> dict:
    def load():
        try:
            with open(DELIVERY_LEDGER_PATH, encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)[:180], "items": [], "summary": {}}
        items = data.get("items") or []
        summary = {
            "total": len(items),
            "pending": sum(1 for i in items if i.get("status") == "pending"),
            "in_progress": sum(1 for i in items if i.get("status") == "in_progress"),
            "done": sum(1 for i in items if i.get("status") == "done"),
            "p0": sum(1 for i in items if i.get("priority") == "p0"),
            "p1": sum(1 for i in items if i.get("priority") == "p1"),
            "p2": sum(1 for i in items if i.get("priority") == "p2"),
        }
        data["ok"] = True
        data["summary"] = summary
        return data
    return _cached("delivery_ledger", 2.0, load)


def _miniapp_selftest() -> dict:
    probes = [
        ("doctor", "System Doctor", "http://127.0.0.1:%s/doctor" % PORT),
        ("delivery", "Delivery Ledger", "http://127.0.0.1:%s/delivery-ledger" % PORT),
        ("files", "Files", "http://127.0.0.1:%s/files" % PORT),
        ("phrases", "Voice Phrases", "http://127.0.0.1:%s/phrases" % PORT),
        ("swarms", "Swarms", "http://127.0.0.1:%s/swarms" % PORT),
        ("suggestions", "Suggestions", "http://127.0.0.1:%s/suggestions" % PORT),
        ("godrays", "God-rays", "http://127.0.0.1:%s/godrays" % PORT),
        ("assist", "Assist Link", "http://127.0.0.1:%s/assist/status" % PORT),
        ("architecture", "Architecture", "http://127.0.0.1:%s/v1/jarvis/architecture" % PORT),
        ("memory", "Memory", "http://127.0.0.1:%s/v1/jarvis/memory?user_id=anonymous&limit=2" % PORT),
        ("notifications", "Inbox", "http://127.0.0.1:%s/v1/jarvis/notifications?user_id=anonymous&limit=2" % PORT),
        ("datasets", "Datasets", "http://127.0.0.1:%s/v1/datasets" % PORT),
        ("reports", "Reports", "http://127.0.0.1:%s/v1/reports" % PORT),
        ("dashboards", "Boards", "http://127.0.0.1:%s/v1/dashboards" % PORT),
        ("alerts", "Alerts", "http://127.0.0.1:%s/v1/alerts" % PORT),
        ("cases", "Cases", "http://127.0.0.1:%s/v1/cases" % PORT),
        ("assets", "Assets", "http://127.0.0.1:%s/v1/jarvis/assets/status" % PORT),
        ("labs", "Labs", "http://127.0.0.1:%s/v1/labs/catalog" % PORT),
        ("brain", "Brain", "http://127.0.0.1:%s/gpu/brain" % PORT),
        ("health", "Health", "http://127.0.0.1:%s/healthreport" % PORT),
    ]
    rows = []
    for pid, label, url in probes:
        r = _http_probe(url, 5)
        rows.append({"id": pid, "label": label, **r})
    return {
        "ok": True,
        "summary": {
            "total": len(rows),
            "passing": sum(1 for r in rows if r.get("ok")),
            "failing": sum(1 for r in rows if not r.get("ok")),
        },
        "rows": rows,
    }


def _doctor() -> dict:
    """Production System Doctor for the dock: cheap probes only, never throws, and records the missing
    feature/function list so debugging work does not vanish between sessions."""
    chat_body = json.dumps({"q": "hello jarvis", "address": ""}).encode()
    cors = _http_probe("http://127.0.0.1:8001/v1/jarvis/system/status", timeout=4, method="OPTIONS",
                       headers={"Origin": "https://app.projectsolar.cloud",
                                "Access-Control-Request-Method": "GET"})
    checks = [
        {"id": "dashboard", "label": "Dashboard /jarvis", **_http_probe("http://127.0.0.1:%s/" % PORT, 4)},
        {"id": "chat", "label": "JARVIS chat", **_http_probe("http://127.0.0.1:%s/chat" % PORT, 12, "POST",
                                                             chat_body, {"Content-Type": "application/json"})},
        {"id": "backend", "label": "FastAPI backend", **_http_probe("http://127.0.0.1:8001/health", 4)},
        {"id": "cors", "label": "Public app CORS", **cors},
        {"id": "brain", "label": "Ollama / Vast brain", **_http_probe("http://127.0.0.1:11434/api/tags", 4)},
        {"id": "underworld", "label": "Underworld API", **_http_probe("http://127.0.0.1:8091/", 4)},
        {"id": "voice", "label": "Voice clone service", "pm2": _pm2_state("jarvis-voiceclone")},
        {"id": "tasks", "label": "Task daemon", "pm2": _pm2_state("jarvis-tasks")},
        {"id": "climate", "label": "Climate bridge", **_http_probe("http://127.0.0.1:%s/climate/state" % PORT, 4)},
        {"id": "agent", "label": "Agent OS tools", **_http_probe("http://127.0.0.1:%s/agent/tools" % PORT, 6)},
    ]
    for c in checks:
        if "pm2" in c:
            c["ok"] = c["pm2"].get("status") == "online"
    ledger = _delivery_ledger()
    ledger_items = ledger.get("items") or []
    missing_features = [i.get("title", "") for i in ledger_items
                        if i.get("kind") == "feature" and i.get("status") != "done"]
    missing_functions = [i.get("title", "") for i in ledger_items
                         if i.get("kind") == "function" and i.get("status") != "done"]
    ok_count = sum(1 for c in checks if c.get("ok"))
    return {"ok": True, "score": round(ok_count / max(1, len(checks)) * 100), "checks": checks,
            "pm2": [_pm2_state(n) for n in ("jarvis-dashboard", "jarvis-backend", "jarvis-tasks",
                                            "jarvis-voiceclone", "underworld-backend")],
            "missing_features": missing_features, "missing_functions": missing_functions,
            "ledger_summary": ledger.get("summary") or {}, "ledger_title": ledger.get("title", ""),
            "selftest_summary": _miniapp_selftest().get("summary") or {}}


def _agent_run(command: str, wait_s: float = 8.0, auto_approve: bool = False) -> dict:
    """Plan + execute a natural-language command via the Agent OS core.

    By default only permission='auto' steps execute; destructive steps are left
    'awaiting'. Pass auto_approve=True (authenticated owner) to give the agent full
    authority over the app: it will run 'confirm' steps as well (but still refuses
    hard-deny patterns). Returns the run record after a short bounded wait. Never raises."""
    command = (command or "").strip()
    if not command:
        return {"ok": False, "error": "empty command"}
    try:
        from server import agent as _A
        run_id = _A.CORE.execute(command, auto_only=not auto_approve)
        deadline = time.time() + max(0.0, min(wait_s, 25.0))
        run = _A.CORE.get_run(run_id)
        terminal = {"completed", "failed", "awaiting", "rejected", "unknown"}
        while time.time() < deadline and str((run or {}).get("status")) not in terminal:
            time.sleep(0.4)
            run = _A.CORE.get_run(run_id)
        return {"ok": True, "run_id": run_id, "run": run}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:160]}


_GODRAYS = {"headless": None, "ts": 0.0, "running": False}  # cached runtime proof for the god-ray pass


def _godrays_headless_proof() -> dict:
    """Run the headless proof (node + a vendored three@0.136) that the volumetric god-ray ShaderPass is
    actually in composer.passes. Time-bounded; never raises — returns {ok|pass:False,error} on any trouble
    so a missing/slow node can never affect the dashboard."""
    try:
        proc = subprocess.run(
            ["node", os.path.join(os.path.dirname(__file__), "services", "godrays_headless.mjs"), "--json"],
            cwd=ROOT, capture_output=True, text=True, timeout=40,
        )
        line = (proc.stdout or "").strip().splitlines()[-1] if (proc.stdout or "").strip() else ""
        return json.loads(line) if line else {"pass": False, "error": (proc.stderr or "no output")[:200]}
    except Exception as e:  # noqa: BLE001
        return {"pass": False, "error": str(e)[:200]}


def _godrays_warm() -> None:
    """Refresh the cached headless proof in a daemon thread (non-blocking, so the cinematic page never
    stalls waiting on node)."""
    if _GODRAYS["running"]:
        return
    _GODRAYS["running"] = True

    def _run() -> None:
        try:
            _GODRAYS["headless"] = _godrays_headless_proof()
            _GODRAYS["ts"] = time.time()
        finally:
            _GODRAYS["running"] = False

    threading.Thread(target=_run, daemon=True).start()


def _godrays_selfcheck() -> dict:
    """Self-check for the 'Volumetric god-rays from the reactor' upgrade (sug0).

    STATIC  (instant, stdlib-only): the served jarvis_live.html still carries the god-ray ShaderPass
            (markers + uniforms), keeps it gated by PULSE.amp, ordered after UnrealBloom, and pins
            three@0.136 + ACES + sRGB.  HEADLESS (cached, warmed in the background): the node proof that
            the pass is genuinely in composer.passes.  Always returns instantly; never raises."""
    here = os.path.dirname(__file__)
    out = {"upgrade": "sug0", "feature": "volumetric-god-rays", "ok": False, "proof": "static",
           "active": False, "static": {}, "headless": None,
           "composerPasses": None, "godRaysIndex": None}
    try:
        with open(os.path.join(here, "jarvis_live.html"), encoding="utf-8") as f:
            src = f.read()
        a, b = src.find("/*GODRAYS_PASS_BEGIN*/"), src.find("/*GODRAYS_PASS_END*/")
        seg = src[a:b] if (a >= 0 and b > a) else ""
        ab = src.find("composer.addPass(bloom)")
        ag = src.find("composer.addPass(godrays)")
        st = {
            "markers": bool(seg),
            "is_shaderpass": "new THREE.ShaderPass" in seg,
            "uniforms": all(u in seg for u in
                            ("tDiffuse", "uSun", "uAspect", "uExposure", "uDecay", "uDensity", "uWeight", "uTint")),
            "pulse_gated": ("godrays.uniforms.uExposure.value" in src and "+A*" in src.replace(" ", "")),
            "after_bloom": (0 <= ab < ag),
            "three_0136": "three@0.136.0/" in src,
            "aces": "ACESFilmicToneMapping" in src,
            "srgb": "sRGBEncoding" in src,
        }
        out["static"] = st
        out["active"] = all(st.values())
        out["ok"] = out["active"]
    except Exception as e:  # noqa: BLE001
        out["static"] = {"error": str(e)[:160]}

    hd = _GODRAYS["headless"]
    if hd is None or (time.time() - _GODRAYS["ts"]) > 600:
        _godrays_warm()  # non-blocking; the proof appears on a later poll
    if hd is not None:
        out["headless"] = hd
        out["proof"] = "headless"
        out["composerPasses"] = hd.get("composerPasses")
        out["godRaysIndex"] = hd.get("godRaysIndex")
        out["active"] = bool(out["active"] and hd.get("pass"))
        out["ok"] = out["active"]
    return out


# ── CELESTIAL OS: repo-to-universe index (celestial/ package + generated scan) ───────────────
# Serves the curated seed map (planets/moons/meteorites/satellites with precomputed importance,
# radii and orbits) plus AGGREGATES of the generated repo scan (dust counts per parent, file-moon
# counts per planet). The raw generated index is ~22 MB / 60k dust nodes — dust is GPU-instanced
# particles client-side, so only counts cross the wire. Regenerate the scan after every merge:
#   python3 scripts/scan_repo_to_celestial_index.py
_CELESTIAL = {"payload": None, "ts": 0.0}
_CELESTIAL_INDEX = {"nodes": None, "generated_at": None, "dust_by_parent": None, "ts": 0.0}


def _celestial_index_nodes() -> list:
    if _CELESTIAL_INDEX["nodes"] is not None and (time.time() - _CELESTIAL_INDEX["ts"]) < 300:
        return _CELESTIAL_INDEX["nodes"]
    here = os.path.dirname(__file__)
    with open(os.path.join(here, "data", "celestial_index.generated.json"), encoding="utf-8") as f:
        gen = json.load(f)
    nodes = gen.get("nodes", [])
    dust_by_parent: dict = {}
    for n in nodes:
        if n.get("kind") == "dust":
            dust_by_parent.setdefault(n.get("parent", ""), []).append(
                {"id": n.get("id"), "label": n.get("label"), "repo": n.get("repo"),
                 "parent": n.get("parent"), "importance": n.get("importance", 0.12)}
            )
    _CELESTIAL_INDEX["nodes"] = nodes
    _CELESTIAL_INDEX["dust_by_parent"] = dust_by_parent
    _CELESTIAL_INDEX["generated_at"] = gen.get("generated_at")
    _CELESTIAL_INDEX["ts"] = time.time()
    return nodes


def _celestial_dust(parent: str = "", q: str = "", offset: int = 0, limit: int = 40) -> dict:
    parent = (parent or "").strip()
    q = (q or "").strip().lower()
    offset = max(0, int(offset or 0))
    limit = max(1, min(120, int(limit or 40)))
    try:
        _celestial_index_nodes()
        if parent:
            rows = list((_CELESTIAL_INDEX.get("dust_by_parent") or {}).get(parent, []))
        else:
            rows = [r for bucket in (_CELESTIAL_INDEX.get("dust_by_parent") or {}).values() for r in bucket]
        if q:
            rows = [r for r in rows if q in (str(r.get("label", "")) + " " + str(r.get("repo", ""))).lower()]
        total = len(rows)
        return {"ok": True, "parent": parent, "q": q, "offset": offset, "limit": limit,
                "total": total, "rows": rows[offset:offset + limit]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:160], "rows": [], "total": 0}


def _celestial_db_dust_counts() -> dict:
    """Aggregate live database records into the existing celestial dust parents.

    The client renders dust as capped instanced geometry, so these stay as counts
    instead of sending hundreds of thousands of rows over the wire.
    """
    counts = {
        "moon:knowledge-graph": 0,
        "moon:document-vault": 0,
        "moon:glb-library": 0,
        "moon:llm-router": 0,
        "moon:knowledge-builder": 0,
        "moon:guardian-monitor": 0,
        "moon:underworld-web": 0,
    }
    pairs = [
        ("moon:knowledge-graph", BRAIN_DB, "SELECT COUNT(*) FROM ont_object"),
        ("moon:knowledge-graph", BRAIN_DB, "SELECT COUNT(*) FROM ont_link"),
        ("moon:knowledge-graph", BRAIN_DB, "SELECT COUNT(*) FROM corr_entity"),
        ("moon:document-vault", BRAIN_DB, "SELECT COUNT(*) FROM ont_object WHERE type='Document'"),
        ("moon:document-vault", DOCS_DB, "SELECT COUNT(*) FROM document"),
        ("moon:glb-library", os.path.join(ROOT, "server/data/media.db"), "SELECT COUNT(*) FROM media"),
        ("moon:llm-router", TL_DB, "SELECT COUNT(*) FROM llm_routing"),
        ("moon:llm-router", TL_DB, "SELECT COUNT(*) FROM tiered_llm_calls"),
        ("moon:knowledge-builder", BRAIN_DB, "SELECT COUNT(*) FROM note"),
        ("moon:knowledge-builder", BRAIN_DB, "SELECT COUNT(*) FROM world_ingestion_job"),
        ("moon:guardian-monitor", os.path.join(ROOT, "server/data/tasks.db"), "SELECT COUNT(*) FROM tasks"),
    ]
    for parent, db, sql in pairs:
        n = _count(db, sql)
        if isinstance(n, int):
            counts[parent] = counts.get(parent, 0) + n
    try:
        counts["moon:underworld-web"] += sum(1 for _ in glob.iglob(os.path.join(ROOT, "underworld", "**", "*"), recursive=True)
                                             if os.path.isfile(_))
    except Exception:  # noqa: BLE001
        pass
    return {k: v for k, v in counts.items() if v}


def _celestial_payload() -> dict:
    if _CELESTIAL["payload"] is not None and (time.time() - _CELESTIAL["ts"]) < 300:
        return _CELESTIAL["payload"]
    here = os.path.dirname(__file__)
    out = {"ok": False, "seed": None, "generated": None}
    try:
        with open(os.path.join(here, "..", "celestial", "jarvis_celestial_seed_map.json"),
                  encoding="utf-8") as f:
            seed = json.load(f)
        out["seed"] = seed
        out["ok"] = True
    except Exception as e:  # noqa: BLE001
        out["seed_error"] = str(e)[:160]
    try:
        gen_nodes = _celestial_index_nodes()
        gen = {"nodes": gen_nodes, "generated_at": _CELESTIAL_INDEX.get("generated_at")}
        gen_by_id = {n.get("id"): n for n in gen.get("nodes", []) if n.get("id")}
        dust_counts: dict = {}
        dust_samples: dict = {}
        file_moons: dict = {}
        file_moon_samples: dict = {}
        for n in gen.get("nodes", []):
            if n.get("kind") == "dust":
                parent = n.get("parent", "")
                dust_counts[parent] = dust_counts.get(parent, 0) + 1
                bucket = dust_samples.setdefault(parent, [])
                if len(bucket) < 8:
                    pnode = gen_by_id.get(parent, {})
                    bucket.append({"id": n.get("id"), "label": n.get("label"), "repo": n.get("repo"),
                                   "importance": n.get("importance", 0.12),
                                   "parent": parent, "parent_parent": pnode.get("parent", "")})
            elif n.get("kind") == "moon" and str(n.get("id", "")).startswith("moon:file:"):
                parent = n.get("parent", "")
                file_moons[parent] = file_moons.get(parent, 0) + 1
                bucket = file_moon_samples.setdefault(parent, [])
                if len(bucket) < 12:
                    bucket.append({"id": n.get("id"), "label": n.get("label"), "repo": n.get("repo"),
                                   "importance": n.get("importance", 0.18)})
        db_dust_counts = _celestial_db_dust_counts()
        for parent, total in db_dust_counts.items():
            dust_counts[parent] = dust_counts.get(parent, 0) + total
        out["generated"] = {"generated_at": gen.get("generated_at"),
                            "total_nodes": len(gen.get("nodes", [])),
                            "total_records": len(gen.get("nodes", [])) + sum(db_dust_counts.values()),
                            "db_dust_counts": db_dust_counts,
                            "dust_counts": dust_counts, "dust_samples": dust_samples,
                            "file_moons": file_moons, "file_moon_samples": file_moon_samples}
    except Exception as e:  # noqa: BLE001
        out["generated_error"] = str(e)[:160]
    _CELESTIAL["payload"] = out
    _CELESTIAL["ts"] = time.time()
    return out


class _H(http.server.BaseHTTPRequestHandler):
    def _live_theme(self) -> str:
        try:
            ui = (parse_qs(urlparse(self.path).query).get("ui", [""])[0] or "").strip().lower()
        except Exception:
            ui = ""
        if ui in {"modern", "current", "new"}:
            return "modern"
        return "classic"

    def _inject_live_theme_picker(self, html: str, theme: str) -> str:
        picker = f"""
<style id="jarvis-theme-picker-style">
#jarvisThemePicker{{position:fixed;top:58px;right:18px;z-index:29;display:flex;gap:6px;padding:8px 10px;
background:rgba(6,16,26,.52);border:1px solid rgba(122,243,255,.20);border-radius:14px;
backdrop-filter:blur(14px);box-shadow:0 10px 36px rgba(0,0,0,.35)}}
#jarvisThemePicker button{{appearance:none;border:1px solid rgba(122,243,255,.18);background:rgba(255,255,255,.04);
color:#dff6ff;border-radius:999px;padding:6px 10px;font:700 11px/1.1 Inter,system-ui,sans-serif;cursor:pointer}}
#jarvisThemePicker button.active{{border-color:#29E7FF;color:#29E7FF;box-shadow:0 0 0 1px rgba(41,231,255,.18) inset}}
html[data-ui-theme="classic"] #jarvisThemePicker{{background:rgba(5,12,20,.60);border-color:rgba(122,243,255,.16)}}
html[data-ui-theme="classic"] #top{{background:linear-gradient(180deg,rgba(2,6,12,.78),rgba(2,6,12,.18) 58%,transparent)}}
html[data-ui-theme="classic"] #top .brand{{letter-spacing:5.5px;text-shadow:0 0 16px rgba(41,231,255,.38)}}
html[data-ui-theme="classic"] .chip,
html[data-ui-theme="classic"] .tbtn,
html[data-ui-theme="classic"] .mini,
html[data-ui-theme="classic"] #search,
html[data-ui-theme="classic"] #say,
html[data-ui-theme="classic"] .send,
html[data-ui-theme="classic"] #mic,
html[data-ui-theme="classic"] #card,
html[data-ui-theme="classic"] #cmd,
html[data-ui-theme="classic"] #dock,
html[data-ui-theme="classic"] #sdev,
html[data-ui-theme="classic"] #celIndex,
html[data-ui-theme="classic"] #ovAccess .accCard,
html[data-ui-theme="classic"] #ovAssist .accCard{{backdrop-filter:blur(18px) saturate(1.16)}}
html[data-ui-theme="classic"] #dock{{background:rgba(7,20,31,.44);box-shadow:0 12px 48px rgba(0,0,0,.54),0 0 28px rgba(41,231,255,.08)}}
html[data-ui-theme="classic"] #dock .di .gly{{background:rgba(41,231,255,.055)}}
html[data-ui-theme="classic"] #dockPrev,
html[data-ui-theme="classic"] #dockNext{{display:none !important}}
html[data-ui-theme="classic"] #cmd{{background:rgba(8,22,34,.56);box-shadow:0 -8px 34px rgba(0,0,0,.52),0 0 30px rgba(41,231,255,.10)}}
html[data-ui-theme="classic"] #crystal::before{{opacity:.72;filter:blur(.35px) saturate(1.15)}}
html[data-ui-theme="classic"] #coreSay.talking{{background:rgba(8,22,34,.32);border-color:rgba(41,231,255,.26);box-shadow:0 0 16px rgba(41,231,255,.12)}}
@media (max-width: 820px){{#jarvisThemePicker{{top:54px;right:12px;padding:6px 8px}}#jarvisThemePicker button{{padding:6px 8px;font-size:10px}}}}
</style>
<div id="jarvisThemePicker" aria-label="UI theme">
  <button type="button" data-theme="classic" class="{'active' if theme == 'classic' else ''}">Classic UI</button>
  <button type="button" data-theme="modern" class="{'active' if theme != 'classic' else ''}">Current UI</button>
</div>
<script id="jarvis-theme-picker-script">
(function(){{
  try {{
    var KEY='jarvis.uiTheme';
    var params=new URLSearchParams(location.search);
    var hasExplicitTheme=params.has('ui');
    var current=((hasExplicitTheme ? params.get('ui') : '{theme}')||'{theme}').toLowerCase();
    current=(current==='classic'||current==='legacy'||current==='old')?'classic':'modern';
    function applyTheme(next){{
      var html=document.documentElement;
      if(html) html.setAttribute('data-ui-theme', next);
      var badge=document.querySelector('#top .brand span');
      if(badge) badge.textContent = next==='classic' ? 'v2·φ-hierarchy' : 'v2·3D menu';
      var root=document.getElementById('jarvisThemePicker');
      if(root){{
        root.querySelectorAll('button[data-theme]').forEach(function(btn){{
          btn.classList.toggle('active', (btn.getAttribute('data-theme')||'modern')===next);
        }});
      }}
    }}
    var saved=(localStorage.getItem(KEY)||'').toLowerCase();
    if(!hasExplicitTheme && (saved==='classic'||saved==='modern')){{
      if(saved!==current){{
        params.set('ui', saved);
        location.replace(location.pathname + '?' + params.toString() + location.hash);
        return;
      }}
    }} else {{
      localStorage.setItem(KEY,current);
    }}
    applyTheme(current);
    var root=document.getElementById('jarvisThemePicker');
    if(!root)return;
    root.querySelectorAll('button[data-theme]').forEach(function(btn){{
      btn.addEventListener('click', function(){{
        var next=btn.getAttribute('data-theme')||'modern';
        localStorage.setItem(KEY,next);
        params.set('ui', next);
        location.assign(location.pathname + '?' + params.toString() + location.hash);
      }});
    }});
  }} catch(e) {{}}
}})();
</script>
"""
        if "</body>" in html:
            return html.replace("</body>", picker + "\n</body>")
        return html + picker

    def _route_path(self) -> str:
        """Serve the same dashboard routes at / and behind the public /jarvis/ mount."""
        if self.path == "/jarvis":
            return "/"
        if self.path.startswith("/jarvis/") or self.path.startswith("/jarvis?"):
            return self.path[len("/jarvis"):] or "/"
        return self.path

    def _write_body(self, body: bytes) -> bool:
        try:
            self.wfile.write(body)
            return True
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            return False

    def _send_status(self, body: bytes, ctype: str, status: int = 200, extra: dict | None = None):
        try:
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Access-Control-Allow-Origin", "*")
            # Live app: HTML + JSON are always dynamic — never let a browser/proxy serve a stale copy.
            # (Static GLB/asset routes set their own long max-age via a separate sender, so they stay cached.)
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self._write_body(body)
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            return

    def _send(self, body: bytes, ctype: str):
        self._send_status(body, ctype, 200)

    def _proxy_backend_get(self) -> bool:
        if not _allow_backend_get_proxy(self.path):
            return False
        headers = {}
        auth = self.headers.get("Authorization")
        if auth:
            headers["Authorization"] = auth
        try:
            req = urllib.request.Request(BACKEND_BASE + self.path, method="GET", headers=headers)
            with urllib.request.urlopen(req, timeout=15) as r:
                body = r.read()
                ctype = r.headers.get("Content-Type", "application/json")
                self._send_status(body, ctype, int(getattr(r, "status", 200)))
        except urllib.error.HTTPError as e:
            body = e.read() or json.dumps({"ok": False, "error": f"backend {e.code}"}).encode()
            ctype = e.headers.get("Content-Type", "application/json") if e.headers else "application/json"
            self._send_status(body, ctype, int(e.code))
        except Exception as e:  # noqa: BLE001
            self._send_status(json.dumps({"ok": False, "error": str(e)[:180]}).encode(),
                              "application/json", 502)
        return True

    def _tmpl(self, name: str) -> str:
        """Read an html template from server/ and inject the control token."""
        try:
            with open(os.path.join(os.path.dirname(__file__), name), encoding="utf-8") as f:
                html = f.read().replace("__CTOKEN__", CONTROL_TOKEN)
                return html
        except Exception as e:  # noqa: BLE001
            return f"<h1>template {name} missing</h1><pre>{e}</pre>"

    def do_GET(self):

        self.path = self._route_path()
        if self.path.startswith("/metrics"):
            self._send(json.dumps(_SNAP).encode(), "application/json")
        elif self.path.startswith("/detail"):
            q = parse_qs(urlparse(self.path).query)
            self._send(json.dumps(_detail(q.get("kind", [""])[0], q.get("name", [""])[0])).encode(),
                       "application/json")
        elif self.path.startswith("/children"):
            q = parse_qs(urlparse(self.path).query)
            def _i(k, d):
                try: return int(q.get(k, [str(d)])[0] or d)
                except Exception: return d
            self._send(json.dumps(_children(
                q.get("id", [""])[0], q.get("kind", [""])[0],
                q.get("exclude", [""])[0], min(40, _i("limit", 14)))).encode(), "application/json")
        elif self.path.startswith("/celestial/dust"):
            q = parse_qs(urlparse(self.path).query)
            def _i(k, d):
                try: return int(q.get(k, [str(d)])[0] or d)
                except Exception: return d
            self._send(json.dumps(_celestial_dust(
                q.get("parent", [""])[0], q.get("q", [""])[0],
                _i("offset", 0), _i("limit", 40))).encode(), "application/json")
        elif self.path.startswith("/celestial"):
            self._send(json.dumps(_celestial_payload()).encode(), "application/json")
        elif self.path.startswith("/graphdata"):
            self._send(json.dumps(_graph_data()).encode(), "application/json")
        elif self.path.startswith("/search"):
            q = parse_qs(urlparse(self.path).query)
            try:
                lim = int(q.get("limit", ["24"])[0] or 24)
            except Exception:  # noqa: BLE001
                lim = 24
            self._send(json.dumps(_search_ontology(q.get("q", [""])[0], lim)).encode(),
                       "application/json")
        elif self.path.startswith("/graph"):
            try:
                with open(os.path.join(os.path.dirname(__file__), "dashboard_graph.html"), encoding="utf-8") as f:
                    self._send(f.read().encode(), "text/html; charset=utf-8")
            except Exception:  # noqa: BLE001
                self._send(b"graph view unavailable", "text/html")
        elif self.path.startswith("/files"):
            try:
                fs = sorted(os.listdir(os.path.join(os.path.dirname(__file__), "services")))
                self._send(json.dumps({"files": [f for f in fs if f.endswith(".py")][:40]}).encode(), "application/json")
            except Exception:  # noqa: BLE001
                self._send(b'{"files":[]}', "application/json")
        elif self.path.startswith("/v1/"):
            if self._proxy_backend_get():
                return
            self._send_status(b'{"ok":false,"error":"backend route not exposed by dashboard"}',
                              "application/json", 404)
        elif self.path.startswith("/tasks/poll"):
            from server.services import task_daemon as TD
            q = parse_qs(urlparse(self.path).query)
            try:
                since = int(q.get("since", ["0"])[0] or 0)
                self._send(json.dumps(TD.tasks_poll(since)).encode(), "application/json")
            except Exception as e:
                self._send(json.dumps({"ok": False, "error": str(e)[:120]}).encode(), "application/json")
        elif self.path.startswith("/tasks"):
            from server.services import task_daemon as TD
            self._send(json.dumps(TD.list_tasks()).encode(), "application/json")
        elif self.path.startswith("/task/artifacts"):
            from server.services import task_daemon as TD
            q = parse_qs(urlparse(self.path).query)
            try:
                tid = int(q.get("id", ["0"])[0] or 0)
                self._send(json.dumps(TD.task_artifacts(tid)).encode(), "application/json")
            except Exception as e:
                self._send(json.dumps({"ok": False, "error": str(e)[:120]}).encode(), "application/json")
        elif self.path.startswith("/swarms/detail"):
            from server.services import task_daemon as TD
            q = parse_qs(urlparse(self.path).query)
            try:
                since = int(q.get("since", ["0"])[0] or 0)
                self._send(json.dumps(TD.swarms_detail(since)).encode(), "application/json")
            except Exception as e:
                self._send(json.dumps({"ok": False, "error": str(e)[:120]}).encode(), "application/json")
        elif self.path.startswith("/swarms"):
            from server.services import task_daemon as TD
            self._send(json.dumps(TD.swarm_list()).encode(), "application/json")
        elif self.path.startswith("/swarm/artifacts"):
            from server.services import task_daemon as TD
            q = parse_qs(urlparse(self.path).query)
            try:
                sid = int(q.get("id", ["0"])[0] or 0)
                self._send(json.dumps(TD.swarm_artifacts(sid)).encode(), "application/json")
            except Exception as e:
                self._send(json.dumps({"ok": False, "error": str(e)[:120]}).encode(), "application/json")
        elif self.path.startswith("/swarm"):
            from server.services import task_daemon as TD
            q = parse_qs(urlparse(self.path).query)
            try:
                sid = int(q.get("id", ["0"])[0] or 0)
                self._send(json.dumps(TD.swarm_get(sid)).encode(), "application/json")
            except Exception as e:
                self._send(json.dumps({"ok": False, "error": str(e)[:120]}).encode(), "application/json")
        elif self.path.startswith("/library"):
            from server.services import media_gen as MG
            self._send(json.dumps(MG.library()).encode(), "application/json")
        elif self.path.startswith("/tts"):
            _q = parse_qs(urlparse(self.path).query)
            def _f(name):
                try:
                    return float(_q.get(name, [None])[0]) if _q.get(name) else None
                except Exception:  # noqa: BLE001
                    return None
            data = _tts(_q.get("text", [""])[0], _f("semitones"), _f("tempo"))
            if data:
                self.send_response(200); self.send_header("Content-Type", "audio/wav")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "public, max-age=3600")
                self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self._write_body(data)
            else:
                self.send_response(204); self.end_headers()
        elif self.path.startswith("/suggestions"):
            # Self-development dock: box-LLM "what to build next" ideas from the live system brief.
            q = parse_qs(urlparse(self.path).query)
            self._send(json.dumps(_suggestions(force=q.get("force", ["0"])[0] == "1")).encode(),
                       "application/json")
        elif self.path.startswith("/proposal"):
            # Formatted proposal text for a clicked suggestion id (?id=sugN).
            q = parse_qs(urlparse(self.path).query)
            self._send(json.dumps(_proposal(q.get("id", [""])[0])).encode(), "application/json")
        elif self.path.startswith("/agent/tools"):
            # Agent OS tool registry (the 17 real tools) + health snapshot.
            self._send(json.dumps(_agent_tools()).encode(), "application/json")
        elif self.path.startswith("/doctor"):
            self._send(json.dumps(_doctor()).encode(), "application/json")
        elif self.path.startswith("/delivery-ledger"):
            self._send(json.dumps(_delivery_ledger()).encode(), "application/json")
        elif self.path.startswith("/miniapp-selftest"):
            self._send(json.dumps(_miniapp_selftest()).encode(), "application/json")
        elif self.path.startswith("/budget"):
            from server.services import token_governor as TG
            self._send(json.dumps(TG.state()).encode(), "application/json")
        elif self.path.startswith("/file"):
            q = parse_qs(urlparse(self.path).query)
            rel = (q.get("path", [""])[0] or "").lstrip("/")
            try:
                if ".." in rel or not rel:
                    raise ValueError("bad path")
                full = os.path.realpath(os.path.join(ROOT, rel))
                if not full.startswith(os.path.realpath(ROOT)) or not os.path.isfile(full):
                    raise ValueError("not found")
                with open(full, encoding="utf-8", errors="replace") as f:
                    content = f.read(20000)
                self._send(json.dumps({"ok": True, "path": rel, "content": content,
                                       "lang": os.path.splitext(full)[1].lstrip("."),
                                       "size": os.path.getsize(full)}).encode(), "application/json")
            except Exception as e:  # noqa: BLE001
                self._send(json.dumps({"ok": False, "error": str(e)[:80]}).encode(), "application/json")
        elif self.path.startswith("/rtc/poll"):
            from server.services import care_signal as CS
            q = parse_qs(urlparse(self.path).query)
            self._send(json.dumps(CS.poll(q.get("room", ["mum"])[0], q.get("role", ["?"])[0],
                                          int(q.get("since", ["0"])[0] or 0))).encode(), "application/json")
        elif self.path.startswith("/carerooms"):
            from server.services import care_signal as CS
            self._send(json.dumps({"rooms": CS.rooms()}).encode(), "application/json")
        elif self.path.startswith("/assist/status"):
            # web asks: is her phone companion connected? (drives the auto-install offer)
            from server.services import assist_bridge as AB
            self._send(json.dumps(AB.status()).encode(), "application/json")
        elif self.path.startswith("/assist/poll"):
            # the companion app long-ish polls for queued commands (also acts as its heartbeat)
            from server.services import assist_bridge as AB
            q = parse_qs(urlparse(self.path).query)
            self._send(json.dumps(AB.poll(q.get("device_id", [""])[0],
                                          int(q.get("since", ["0"])[0] or 0))).encode(), "application/json")
        elif self.path.startswith("/talk") or self.path.startswith("/companion"):
            self._send(self._tmpl("jarvis_voice.html").encode(), "text/html; charset=utf-8")
        elif self.path.startswith("/care"):
            self._send(self._tmpl("care.html").encode(), "text/html; charset=utf-8")
        elif self.path.startswith("/guardian"):
            self._send(self._tmpl("guardian.html").encode(), "text/html; charset=utf-8")
        elif self.path.startswith("/taskresult"):
            from server.services import task_daemon as TD
            q = parse_qs(urlparse(self.path).query)
            self._send(json.dumps(TD.result(int(q.get("id", ["0"])[0] or 0))).encode(), "application/json")
        elif self.path.split("?", 1)[0] == "/phrases":
            # The canned lifeline phrases — the client pre-warms these into his cloned voice so they're instant.
            self._send(json.dumps(CANNED_PHRASES).encode(), "application/json")
        elif self.path.startswith("/gpu/"):
            # GPU INSTANCE MANAGER (read side): list live instances + cheapest offers.
            from server.services import gpu_instances as GI
            sub = self.path.split("?", 1)[0].split("/gpu/", 1)[1]
            q = parse_qs(urlparse(self.path).query)
            try:
                if sub == "instances":
                    out = GI.list_instances()
                elif sub == "offers":
                    out = GI.cheapest_offer(gpu_name=(q.get("gpu", [None])[0]) or None,
                                            max_price=float(q.get("max", ["0"])[0]) or None)
                elif sub == "configured":
                    out = {"ok": True, "configured": GI.configured(), "results_dir": GI.RESULTS_DIR}
                elif sub == "brain":
                    out = GI.brain_instance()
                elif sub == "estimate":
                    out = {"ok": True, **GI.estimate_task_vram(q.get("task", [""])[0])}
                else:
                    out = {"ok": False, "error": "unknown gpu route"}
            except Exception as e:  # noqa: BLE001
                out = {"ok": False, "error": str(e)[:200]}
            self._send(json.dumps(out).encode(), "application/json")
        elif self.path.split("?", 1)[0] in ("/manifest.webmanifest", "/manifest.json"):
            # PWA manifest — makes "Install app" / "Add to Home Screen" work so her lifeline lives on the
            # home screen and launches full-screen. Icons use the existing SVG (any-size + maskable).
            mani = {
                "name": "JARVIS", "short_name": "JARVIS",
                "description": "JARVIS — voice-first lifeline assistant",
                "start_url": "./", "scope": "./", "display": "standalone",
                "orientation": "any", "background_color": "#02040a", "theme_color": "#02040a",
                "icons": [{"src": "icons/icon.svg", "sizes": "any", "type": "image/svg+xml",
                           "purpose": "any maskable"}],
            }
            self._send(json.dumps(mani).encode(), "application/manifest+json")
        elif self.path.split("?", 1)[0] == "/appsw.js":
            # SELF-DESTROYING service worker. An earlier build registered a caching SW that then stayed
            # installed on devices and served the OLD cached app forever, so fixes never reached the user.
            # Browsers re-fetch THIS script from the network for their periodic SW update-check (it bypasses
            # the SW's own cache), so any device still running the old SW updates to this one, which wipes
            # all caches, unregisters itself, and reloads every open tab to the live build. The lifeline is
            # online anyway (chat/voice/brain need the network), so we run NO service worker now.
            sw = r"""
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>{e.waitUntil((async()=>{
  try{const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));}catch(_){}
  try{await self.registration.unregister();}catch(_){}
  try{const cs=await self.clients.matchAll({type:'window'});cs.forEach(c=>{try{c.navigate(c.url);}catch(_){}});}catch(_){}
})());});
self.addEventListener('fetch',e=>{});   // pass-through: never intercept, never serve stale
"""
            self._send(sw.encode(), "application/javascript")
        elif self.path.startswith("/a11y/"):
            # Accessibility Core static bundle (engine + css + keyboard layout + vendored models).
            # Allowlisted; served from server/. Distinct from the bare /a11y JSON mirror (checked separately).
            rel = self.path.split("/a11y/", 1)[1].split("?", 1)[0].lstrip("/")
            base = os.path.dirname(__file__)          # = ROOT/server
            allow = {"a11y.js", "a11y.css", "a11y_keyboard.json"}
            full = os.path.realpath(os.path.join(base, "a11y_assets", rel)) if rel.startswith("vendor/") \
                   else os.path.realpath(os.path.join(base, {"keyboard.json": "a11y_keyboard.json"}.get(rel, rel)))
            ok = (rel in allow or rel.startswith("vendor/")) and full.startswith(os.path.realpath(base)) \
                 and os.path.isfile(full)
            if ok:
                ct = mimetypes.guess_type(full)[0] or "application/octet-stream"
                with open(full, "rb") as f: data = f.read()
                self.send_response(200); self.send_header("Content-Type", ct)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "public, max-age=86400")
                self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self._write_body(data)
            else:
                self.send_response(404); self.end_headers()
        elif self.path.split("?", 1)[0] == "/a11y":
            # Accessibility mirror — read-only (token-free); see POST below for writes
            self._send(json.dumps(_a11y_read()).encode(), "application/json")
        elif self.path.startswith("/asset/"):
            name = os.path.basename(self.path.split("/asset/", 1)[1].split("?")[0])
            p = os.path.join(ROOT, "jarvis_assets", name)
            if name and os.path.exists(p):
                with open(p, "rb") as f:
                    data = f.read()
                ct = mimetypes.guess_type(p)[0] or "application/octet-stream"
                self.send_response(200); self.send_header("Content-Type", ct)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "public, max-age=86400")
                self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self._write_body(data)
            else:
                self.send_response(404); self.end_headers()
        elif self.path.startswith("/assetlist"):
            try:
                fs = sorted(os.listdir(os.path.join(ROOT, "jarvis_assets")))
                self._send(json.dumps({"png": [f for f in fs if f.endswith(".png")],
                                       "glb": [f for f in fs if f.endswith(".glb")]}).encode(), "application/json")
            except Exception:  # noqa: BLE001
                self._send(b'{"png":[],"glb":[]}', "application/json")
        elif self.path.startswith("/media/"):
            name = os.path.basename(self.path.split("/media/", 1)[1].split("?")[0])
            p = os.path.join(ROOT, "server", "data", "media", name)
            # Serve the REAL high-grade GLB: the server/data/media/gen_* files are broken 0-byte stubs; the
            # real ~3-15MB models live in GLB_DIR under <prefix>/<name> (gen_tripo__X -> tripo/X.glb,
            # gen_uw_interior__X -> uw/interior/X.glb). Fall back to the legacy path if not found.
            if name.startswith("gen_") and "__" in name:
                _pre, _rest = name[4:].split("__", 1)
                _real = os.path.join(GLB_DIR, _pre.replace("_", "/"), _rest)
                if os.path.exists(_real) and os.path.getsize(_real) > 1024:
                    p = _real
            if name and os.path.exists(p):
                with open(p, "rb") as f:
                    data = f.read()
                ct = mimetypes.guess_type(p)[0] or "application/octet-stream"
                self.send_response(200); self.send_header("Content-Type", ct)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self._write_body(data)
            else:
                self.send_response(404); self.end_headers()
        elif self.path.startswith("/climate/poll"):
            # The HOME-LAN AirTouch bridge long-polls this OUTBOUND to collect queued commands.
            # Authed with the bridge key (NOT the web token) so a browser can never drain the queue.
            from server.services import climate_relay as CR
            q = parse_qs(urlparse(self.path).query)
            if q.get("key", [""])[0] != CLIMATE_BRIDGE_KEY:
                self._send(b'{"ok":false,"error":"unauthorized"}', "application/json")
            else:
                self._send(json.dumps(CR.poll()).encode(), "application/json")
        elif self.path.startswith("/climate/state"):
            # Voice/chat pages read the cached last-known state (token-free, read-only) so
            # "what is the temperature / which zones" answers instantly without a bridge round-trip.
            from server.services import climate_relay as CR
            self._send(json.dumps(CR.state()).encode(), "application/json")
        elif self.path.startswith("/voiceupload"):
            self._send(("""<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<body style="background:#02040a;color:#eafcff;font-family:system-ui;padding:24px;text-align:center">
<h2>🎙 Upload your voice recording</h2><p>Pick the MP3 (saved from QuickShare to this phone).</p>
<input id=f type=file accept="audio/*" style="margin:12px"><br>
<button id=b style="font-size:18px;padding:12px 26px;border-radius:12px;border:1px solid #29e7ff;background:#0a2230;color:#eafcff">Upload to JARVIS</button>
<div id=s style="margin-top:14px;color:#7ad7ff"></div>
<script>b.onclick=async()=>{const file=f.files[0];if(!file){s.textContent='pick the file first';return;}
s.textContent='uploading '+(file.size/1048576).toFixed(1)+' MB…';
try{const r=await fetch('voiceupload',{method:'POST',body:file});const d=await r.json();
s.textContent=d.ok?('✓ uploaded — JARVIS will learn this voice ('+d.bytes+' bytes)'):('✗ '+d.error);}catch(e){s.textContent='✗ '+e;}};
</script>""").encode(), "text/html; charset=utf-8")
        elif self.path.startswith("/vitals"):
            # REAL System Vitals — full self-contained JSON (CPU/mem/disk via /proc+statvfs, GPU/LLM
            # reachability + VRAM via Ollama, pm2 service health via `pm2 jlist`, derived score+alerts).
            # Previously /vitals fell through to the catch-all and served HTML (the "loads nothing"
            # module). Reads only the background snapshot, so it returns instantly.
            self._send(json.dumps(_vitals()).encode(), "application/json")
        elif self.path.startswith("/healthreport"):
            # System Vitals — the proactive health score + alert list (lightweight; the cinematic page,
            # the Care/Guardian view, or an external uptime monitor can poll just this slice).
            self._send(json.dumps(_SNAP.get("health") or {"score": None, "level": "unknown",
                       "summary": "warming up", "alerts": [], "gauges": {}}).encode(), "application/json")
        elif self.path.startswith("/godrays"):
            # Self-check for upgrade sug0 (volumetric god-rays): static page assertions + a cached headless
            # proof that the pass is in composer.passes. Powers the accessible "✦ GOD-RAYS" HUD chip.
            self._send(json.dumps(_godrays_selfcheck()).encode(), "application/json")
        elif self.path.startswith("/health"):
            self._send(b'{"ok":true}', "application/json")
        elif self.path.startswith("/inventory/counts"):
            self._send(json.dumps(_inventory_counts()).encode(), "application/json")
        elif self.path.startswith("/higgsfield/status/"):
            rid = self.path.split("/higgsfield/status/", 1)[1].split("?", 1)[0]
            self._send(json.dumps(_higgsfield_status(rid, parse_qs(urlparse(self.path).query))).encode(), "application/json")
        elif self.path.startswith("/tripo3d/status/"):
            tid = self.path.split("/tripo3d/status/", 1)[1].split("?", 1)[0]
            self._send(json.dumps(_tripo3d_status(tid, parse_qs(urlparse(self.path).query))).encode(), "application/json")
        elif self.path.startswith("/debugger/diagnose"):
            from server.services import system_debugger as SD
            self._send(json.dumps({"ok": True, "issues": SD.diagnose()}).encode(), "application/json")
        elif self.path.startswith("/optimizer/status"):
            tid = self.path.split("?", 1)[0].split("/optimizer/status/", 1)[1] if "/optimizer/status/" in self.path else ""
            from server.services import speed_optimizer as SO
            if tid:
                self._send(json.dumps(SO.task_status(tid)).encode(), "application/json")
            else:
                self._send(json.dumps(SO.latest_status()).encode(), "application/json")
        elif self.path.startswith("/claw/status"):
            from server.services import openclaw_manager as CM
            self._send(json.dumps({"ok": True, **CM.status()}).encode(), "application/json")
        elif self.path.startswith("/claw/logs"):
            from server.services import openclaw_manager as CM
            q = parse_qs(urlparse(self.path).query)
            try:
                lines = max(10, min(200, int(q.get("lines", ["50"])[0] or 50)))
            except Exception:  # noqa: BLE001
                lines = 50
            self._send(json.dumps({"ok": True, **CM.logs(lines)}).encode(), "application/json")
        elif self.path.startswith("/settings/state"):
            from server.services import system_settings as SS
            self._send(json.dumps(SS.state()).encode(), "application/json")
        elif self.path.startswith("/maintenance/log"):
            from server.services import speed_optimizer as SO
            self._send(json.dumps({"ok": True, "runs": SO.maintenance_log()}).encode(), "application/json")
        elif self.path.startswith("/panickey/state"):
            from server.services import panickey as PK
            self._send(json.dumps(PK.state()).encode(), "application/json")
        elif self.path.startswith("/panickey/events"):
            from server.services import panickey as PK
            q = parse_qs(urlparse(self.path).query)
            try:
                limit = max(1, min(200, int(q.get("limit", ["40"])[0] or 40)))
            except Exception:  # noqa: BLE001
                limit = 40
            self._send(json.dumps({"ok": True, "events": PK._events(limit)}).encode(), "application/json")
        elif self.path.startswith("/panickey/calls"):
            from server.services import panickey as PK
            q = parse_qs(urlparse(self.path).query)
            try:
                limit = max(1, min(200, int(q.get("limit", ["40"])[0] or 40)))
            except Exception:  # noqa: BLE001
                limit = 40
            self._send(json.dumps({"ok": True, "calls": PK._calls(limit)}).encode(), "application/json")
        elif self.path.startswith("/panickey/files"):
            from server.services import panickey as PK
            q = parse_qs(urlparse(self.path).query)
            try:
                limit = max(1, min(200, int(q.get("limit", ["40"])[0] or 40)))
            except Exception:  # noqa: BLE001
                limit = 40
            self._send(json.dumps({"ok": True, "files": PK._files(q.get("path", [""])[0], limit)}).encode(), "application/json")
        elif self.path.startswith("/panickey/jobs"):
            from server.services import panickey as PK
            self._send(json.dumps({"ok": True, "jobs": PK._jobs()}).encode(), "application/json")
        elif self.path.startswith("/panickey/stats"):
            from server.services import panickey as PK
            q = parse_qs(urlparse(self.path).query)
            try:
                hours = max(1, min(168, int(q.get("hours", ["24"])[0] or 24)))
            except Exception:  # noqa: BLE001
                hours = 24
            self._send(json.dumps({"ok": True, "stats": PK._call_stats(hours)}).encode(), "application/json")
        elif self.path.startswith("/panickey/learning"):
            from server.services import panickey as PK
            self._send(json.dumps({"ok": True, **PK._learning()}).encode(), "application/json")
        elif self.path.startswith("/panickey/rules"):
            from server.services import panickey as PK
            self._send(json.dumps({"ok": True, "rules": PK.rules()}).encode(), "application/json")
        elif self.path.startswith("/panickey/audit"):
            from server.services import panickey as PK
            q = parse_qs(urlparse(self.path).query)
            try:
                limit = max(1, min(500, int(q.get("limit", ["100"])[0] or 100)))
            except Exception:  # noqa: BLE001
                limit = 100
            self._send(json.dumps({"ok": True, "audit": PK.audit_log(limit)}).encode(), "application/json")
        elif self.path.startswith("/legacy") or self.path.startswith("/v2"):
            self._send(self._tmpl("dashboard_v2.html").encode(), "text/html; charset=utf-8")
        else:
            # Jarvis Live — the cinematic Iron-Man holographic JARVIS. Falls back to v2 then inline HTML.
            page = self._tmpl("jarvis_live.html")
            if page.startswith("<h1>template"):
                page = self._tmpl("dashboard_v2.html")
            if page.startswith("<h1>template"):
                page = HTML.replace("__CTOKEN__", CONTROL_TOKEN)
            self._send(page.encode(), "text/html; charset=utf-8")

    def do_POST(self):
        self.path = self._route_path()
        q = parse_qs(urlparse(self.path).query)
        # WebRTC signalling for the Care/Guardian feature is intentionally token-free: it only relays
        # SDP/ICE/control within a room (the room name is the shared secret) and never touches pm2 or
        # tasks — so mum's phone link carries no admin rights.
        if self.path.startswith("/gpu/"):
            # GPU INSTANCE MANAGER (control side): launch disposable / start / stop / destroy / copy / run / sync.
            if q.get("token", [""])[0] != CONTROL_TOKEN:
                self._send(b'{"ok":false,"error":"unauthorized"}', "application/json")
                return
            from server.services import gpu_instances as GI
            sub = self.path.split("?", 1)[0].split("/gpu/", 1)[1]
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                b = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                b = {}
            try:
                if sub == "launch":
                    out = GI.launch_disposable(b.get("task", "nvidia-smi"), gpu_name=b.get("gpu"),
                                               max_price=b.get("max_price"), image=b.get("image"),
                                               label=b.get("label", "jarvis-task"))
                elif sub == "start":
                    out = GI.set_state(b.get("id"), True)
                    GI.ensure_brain_tunnel()
                elif sub == "stop":    out = GI.set_state(b.get("id"), False)
                elif sub == "destroy": out = GI.safe_dispose(b.get("id"), force=bool(b.get("force")))   # recoup→destroy; force bypasses the recoup-refusal (user-authorised)
                elif sub == "forcedestroy": out = GI.destroy_instance(b.get("id"))
                elif sub == "copy":    out = GI.copy_instance(b.get("id"), max_price=b.get("max_price"))
                elif sub == "provisionbrain":
                    # Robust VERIFIED provision: direct-capable offer → boot → test SSH reachability →
                    # dispose+retry unreachable proxy hosts (e.g. ssh5) → tunnel + start Ollama. Runs in a
                    # thread so the UI returns instantly; gpuRefresh polls /gpu/instances to show the box.
                    _tier = b.get("tier", "basic")
                    threading.Thread(target=lambda: GI.provision_brain_verified(tier=_tier, max_price=b.get("max_price")), daemon=True).start()
                    out = {"ok": True, "started": True, "msg": "Provisioning a reachable %s brain (verifying connectivity — ~1-3 min)…" % _tier}
                elif sub == "run":     out = GI.run_on_instance(b.get("id"), b.get("cmd", "nvidia-smi"))
                elif sub == "sync":    out = GI.sync_results(b.get("id"), b.get("path", "/workspace/results"))
                else: out = {"ok": False, "error": "unknown gpu action"}
            except Exception as e:  # noqa: BLE001
                out = {"ok": False, "error": str(e)[:200]}
            self._send(json.dumps(out).encode(), "application/json")
            return
        if self.path.startswith("/voiceupload"):
            # Direct voice-sample upload (QuickShare blocks server-side download). Raw audio body →
            # server/voices/raw_user/recording_<n>.mp3, then run scripts/voice_pipeline.py to build the
            # cleaned dataset + swap the XTTS refs to the REAL voice. Capped 300MB; audio only.
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                if ln <= 0 or ln > 300 * 1024 * 1024:
                    self._send(json.dumps({"ok": False, "error": "bad size"}).encode(), "application/json"); return
                raw = b""
                while len(raw) < ln:
                    chunk = self.rfile.read(min(1 << 20, ln - len(raw)))
                    if not chunk:
                        break
                    raw += chunk
                d = os.path.join(ROOT, "server", "voices", "raw_user"); os.makedirs(d, exist_ok=True)
                n = len([f for f in os.listdir(d) if f.startswith("recording_")]) + 1
                fp = os.path.join(d, f"recording_{n}.mp3")
                with open(fp, "wb") as f:
                    f.write(raw)
                # auto-run the local cloning pipeline (detached — clean→segment→install refs→restart clone)
                try:
                    import subprocess
                    subprocess.Popen([sys.executable, os.path.join(ROOT, "scripts", "voice_pipeline.py")],
                                     cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    pipe = "started"
                except Exception:  # noqa: BLE001
                    pipe = "manual"
                self._send(json.dumps({"ok": True, "saved": fp, "bytes": len(raw), "pipeline": pipe}).encode(), "application/json")
            except Exception as e:  # noqa: BLE001
                self._send(json.dumps({"ok": False, "error": str(e)[:120]}).encode(), "application/json")
            return
        if self.path.startswith("/rtc"):
            from server.services import care_signal as CS
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                body = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                body = {}
            self._send(json.dumps(CS.post(body.get("room", "mum"), body.get("from", "?"),
                                          body.get("to", "?"), body.get("kind", ""),
                                          body.get("payload"))).encode(), "application/json")
            return
        if self.path.startswith("/climate/report"):
            # The HOME-LAN AirTouch bridge pushes full live state here (outbound). Bridge-key authed.
            from server.services import climate_relay as CR
            if q.get("key", [""])[0] != CLIMATE_BRIDGE_KEY:
                self._send(b'{"ok":false,"error":"unauthorized"}', "application/json")
                return
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                body = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                body = {}
            self._send(json.dumps(CR.report(body)).encode(), "application/json")
            return
        if self.path.startswith("/climate/cmd"):
            # Programmatic / dashboard climate control. Token-authed (the voice companion page uses
            # /chat instead, which routes through _climate_handle token-free). Accepts either a raw
            # command {op,...} or natural-language {q:"..."} which we parse server-side.
            if q.get("token", [""])[0] != CONTROL_TOKEN:
                self._send(b'{"ok":false,"error":"unauthorized"}', "application/json")
                return
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                body = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                body = {}
            text = body.get("q") or body.get("prompt")
            if text:
                res = _climate_handle(text, body.get("address", "ma'am")) or \
                    {"climate": False, "reply": "That isn't a heating request."}
                self._send(json.dumps({"ok": True, **res}).encode(), "application/json")
            else:
                from server.services import climate_relay as CR
                self._send(json.dumps(CR.enqueue(body)).encode(), "application/json")
            return
        if self.path.startswith("/chat"):
            # Conversational JARVIS for the vulnerable user — local LLM, British persona, no root, no system
            # control. Token-free so her companion page carries no admin rights.
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                body = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                body = {}
            qtext = body.get("q", "") or body.get("prompt", "")
            # ACCESSIBILITY FIRST: "captions on", "high contrast", "read the screen" must go to the
            # a11y engine, not the Claude builder. _a11y_handle returns None for non-a11y phrases.
            try:
                _a = _a11y_handle(qtext, body.get("address", "ma'am"))
            except Exception:  # noqa: BLE001
                _a = None
            if _a is not None:
                self._send(json.dumps({"ok": True, **_a}).encode(), "application/json")
                return
            # CLIMATE SECOND: "I am cold", "set the lounge to 23", "what is the temperature",
            # "which zones", "turn off the study" must control the home aircon — NOT the Claude
            # builder. _climate_handle returns None for non-climate phrases so chat falls through.
            try:
                _cl = _climate_handle(qtext, body.get("address", "ma'am"))
            except Exception:  # noqa: BLE001
                _cl = None
            if _cl is not None:
                self._send(json.dumps({"ok": True, **_cl}).encode(), "application/json")
                return
            import re as _re
            _l = (qtext or "").lower()
            is_build = (bool(_re.search(r"\b(build|code|make|create|generate|develop|program|design|write|add)\b", _l))
                        and bool(_re.search(r"\b(feature|function|glb|3d|model|image|picture|photo|scraper|tool|"
                                            r"app|page|widget|website|game|program|script|button|it|something|that)\b", _l))) \
                or bool(_re.search(r"\b(can you|could you|please|i need you to|i want you to|i'd like you to)\b"
                                   r".*\b(build|code|make|create|develop|program|generate|design)\b", _l))
            if is_build:
                try:  # saying == doing: actually spawn the Claude builder and report it
                    from server.services import task_daemon as TD
                    launch = TD.ask_claude(qtext)
                    tid = launch.get("id") if isinstance(launch, dict) else None
                    if not tid:
                        raise RuntimeError((launch or {}).get("error", "task launch failed")
                                           if isinstance(launch, dict) else "task launch failed")
                    self._send(json.dumps({"ok": True, "task_id": tid,
                                           "reply": "Right away. I'm building that for you now — it may take a little "
                                                    "while, and I'll tell you the moment it's ready."}).encode(),
                               "application/json")
                    return
                except Exception as e:  # noqa: BLE001
                    self._send(json.dumps({"ok": False, "reply": "I could not start that build task yet. "
                                                                    "Open Live Tasks or System Doctor and I will show "
                                                                    "what is blocking it.",
                                           "error": str(e)[:160]}).encode(), "application/json")
                    return
            reply = _jarvis_chat_bounded(qtext, body.get("history"), body.get("address", "ma'am"))
            self._send(json.dumps({"ok": True, "reply": reply}).encode(), "application/json")
            return
        if self.path.split("?", 1)[0] == "/a11y":
            # Accessibility mirror write — token-gated
            if q.get("token", [""])[0] != CONTROL_TOKEN:
                self._send(b'{"ok":false,"error":"unauthorized"}', "application/json")
                return
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                body = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                body = {}
            merged = _a11y_write(body.get("state") or {}, body.get("source") or "local")
            self._send(json.dumps({"ok": True, **merged}).encode(), "application/json")
            return
        if self.path.startswith("/assist/register") or self.path.startswith("/assist/ack"):
            # companion app → server (token-free; the device authenticates by its pairing device_id)
            from server.services import assist_bridge as AB
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                b = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                b = {}
            if self.path.startswith("/assist/register"):
                res = AB.register(b.get("device_id", ""), b.get("platform", ""), b.get("name", ""))
            else:
                res = AB.ack(b.get("device_id", ""), int(b.get("cmd_id", 0) or 0), b.get("ok", True), b.get("result", ""))
            self._send(json.dumps(res).encode(), "application/json")
            return
        if self.path.startswith("/assist/cmd"):
            # web brain → phone (token-gated: this drives her device, so only the authed page may queue)
            if q.get("token", [""])[0] != CONTROL_TOKEN:
                self._send(b'{"ok":false,"error":"unauthorized"}', "application/json"); return
            from server.services import assist_bridge as AB
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                b = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                b = {}
            self._send(json.dumps(AB.queue_cmd(b.get("device_id", ""), b.get("type", ""), b.get("payload") or {})).encode(), "application/json")
            return
        if q.get("token", [""])[0] != CONTROL_TOKEN:
            self._send(b'{"ok":false,"error":"unauthorized"}', "application/json")
            return
        if self.path.startswith("/control_all"):
            self._send(json.dumps(_control_all(q.get("action", [""])[0])).encode(), "application/json")
        elif self.path.startswith("/control"):
            self._send(json.dumps(_control(q.get("action", [""])[0], q.get("name", [""])[0])).encode(),
                       "application/json")
        elif self.path.startswith("/ask"):
            from server.services import task_daemon as TD
            self._send(json.dumps(TD.ask_claude(q.get("q", [""])[0] or q.get("prompt", [""])[0],
                                                archon=q.get("archon", ["0"])[0] == "1")).encode(),
                       "application/json")
        elif self.path.startswith("/swarm"):
            # JARVIS SWARM ABILITY — run a build request as a DURABLE multi-agent swarm on the
            # watchdog-guarded daemon (design→implement→verify→expand), checkpointed + resumable.
            from server.services import task_daemon as TD
            a = q.get("action", [""])[0]
            sid = int(q.get("id", ["0"])[0] or 0)
            if a == "cancel":
                res = TD.swarm_cancel(sid)
            else:
                req = q.get("q", [""])[0] or q.get("prompt", [""])[0]
                res = TD.swarm_build(req, archon=q.get("archon", ["0"])[0] == "1")
            self._send(json.dumps(res).encode(), "application/json")
        elif self.path.startswith("/task/review"):
            # Record user approve/decline decision on a task or swarm
            from server.services import task_daemon as TD
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                body = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                body = {}
            res = TD.record_review(body.get("task_id") or body.get("id") or 0,
                                  body.get("decision") or "", body.get("notes") or "",
                                  kind=body.get("kind") or "")
            self._send(json.dumps(res).encode(), "application/json")
        elif self.path.startswith("/task"):
            from server.services import task_daemon as TD
            a = q.get("action", [""])[0]
            tid = int(q.get("id", ["0"])[0] or 0)
            pr = q.get("q", [""])[0]
            res = ({"create": lambda: TD.create(q.get("name", [""])[0]),
                    "genimage": lambda: TD.gen_media("image", pr),
                    "gen3d": lambda: TD.gen_media("glb", pr),
                    "cancel": lambda: TD.cancel(tid), "pause": lambda: TD.pause(tid),
                    "resume": lambda: TD.resume(tid), "clear": lambda: TD.clear_finished()}
                   .get(a, lambda: {"ok": False, "error": "bad action"}))()
            self._send(json.dumps(res).encode(), "application/json")
        elif self.path.startswith("/agent/run"):
            # Agent OS: plan + execute a natural-language command via server.agent.core.
            # auto=1 gives the agent full authority (runs confirm steps too) for the authenticated owner.
            cmd = q.get("q", [""])[0] or q.get("command", [""])[0] or q.get("prompt", [""])[0]
            auto = q.get("auto", [""])[0] == "1"
            body = {}
            if not cmd or not auto:
                try:
                    ln = int(self.headers.get("Content-Length", 0) or 0)
                    body = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
                    cmd = cmd or body.get("q") or body.get("command") or body.get("prompt") or ""
                    auto = auto or bool(body.get("auto") or body.get("auto_approve"))
                except Exception:  # noqa: BLE001
                    pass
            self._send(json.dumps(_agent_run(cmd, auto_approve=auto)).encode(), "application/json")
        elif self.path.startswith("/upgrade"):
            # one-touch self-development: brief current system -> web research -> Claude executes.
            # When the key is a DYNAMIC AI suggestion id (sugN from /suggestions), fold that suggestion's
            # full proposal into the brief so Claude builds the EXACT thing the user clicked, not a vague
            # generic upgrade. Static UPGRADES keys (rollback/scheduler/…) keep their catalog behaviour.
            from server.services import task_daemon as TD
            key = q.get("key", [""])[0]
            brief = _system_brief()
            try:
                if not _SUGGEST["by_id"]:
                    _suggestions()
                s = _SUGGEST["by_id"].get((key or "").strip())
                if s:
                    brief = ("BUILD THIS SUGGESTION: " + s["title"] + "\n" +
                             (s.get("detail") or "") + "\n\nDESIGN PROPOSAL:\n" + s.get("proposal", "") +
                             "\n\n--- LIVE SYSTEM ---\n" + brief)
            except Exception:  # noqa: BLE001
                pass
            res = TD.run_upgrade(key, brief, archon=q.get("archon", ["0"])[0] == "1")
            self._send(json.dumps(res).encode(), "application/json")
        elif self.path.startswith("/suggestion/review"):
            sid = (q.get("id", [""])[0] or "").strip()
            decision = (q.get("decision", [""])[0] or "").strip().lower()
            if sid and decision in ("approved", "declined"):
                _save_sdev_review(sid, decision)
                self._send(json.dumps({"ok": True, "id": sid, "decision": decision}).encode(), "application/json")
            else:
                self._send(json.dumps({"ok": False, "error": "need id and decision"}).encode(), "application/json")
        elif self.path.startswith("/higgsfield/run"):
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                body = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                body = {}
            self._send(json.dumps(_higgsfield_run(body)).encode(), "application/json")
        elif self.path.startswith("/tripo3d/run"):
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                body = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                body = {}
            self._send(json.dumps(_tripo3d_run(body)).encode(), "application/json")
        elif self.path.startswith("/library/save"):
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                body = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                body = {}
            from server.services import media_gen as MG
            self._send(json.dumps(MG.save_library_item(
                body.get("kind", "unknown"),
                body.get("url", ""),
                body.get("prompt", ""),
                body.get("source", ""),
            )).encode(), "application/json")
        elif self.path.startswith("/theme/generate"):
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                body = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                body = {}
            from server.services import theme_generator as TG
            self._send(json.dumps({"ok": True, "theme": TG.generate_theme(body.get("prompt", ""), body.get("style"))}).encode(), "application/json")
        elif self.path.startswith("/debugger/fix"):
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                body = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                body = {}
            from server.services import system_debugger as SD
            res = SD.run_fix(body.get("id"), fix_name=body.get("fix"), fix_args=body.get("args"),
                             auto_approve=bool(body.get("auto") or body.get("auto_approve")))
            self._send(json.dumps(res).encode(), "application/json")
        elif self.path.startswith("/debugger/auto"):
            from server.services import system_debugger as SD
            self._send(json.dumps(SD.run_auto_fixes(auto_approve=True)).encode(), "application/json")
        elif self.path.startswith("/optimizer/run"):
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                body = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                body = {}
            from server.services import speed_optimizer as SO
            self._send(json.dumps(SO.run_optimize(body)).encode(), "application/json")
        elif self.path.startswith("/optimizer/auto"):
            from server.services import speed_optimizer as SO
            tid = SO.run_optimize({"resume": True}).get("task_id")
            self._send(json.dumps({"ok": True, "task_id": tid, "note": "Optimisation started with automatic safe fixes."}).encode(), "application/json")
        elif self.path.startswith("/claw/"):
            from server.services import openclaw_manager as CM
            sub = self.path.split("?", 1)[0].split("/claw/", 1)[1]
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                body = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                body = {}
            if sub == "restart":
                self._send(json.dumps({"ok": True, **CM.restart_container()}).encode(), "application/json")
            elif sub == "bridge/restart":
                self._send(json.dumps({"ok": True, **CM.restart_bridge()}).encode(), "application/json")
            elif sub == "gateway/restart":
                self._send(json.dumps({"ok": True, **CM.restart_gateway()}).encode(), "application/json")
            elif sub == "chat":
                self._send(json.dumps({"ok": True, **CM.chat(body.get("message", ""))}).encode(), "application/json")
            else:
                self._send(b'{"ok":false,"error":"unknown claw action"}', "application/json")
        elif self.path.startswith("/settings/action"):
            from server.services import system_settings as SS
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                body = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                body = {}
            self._send(json.dumps(SS.run_action(body.get("action", ""), body.get("payload", {}))).encode(), "application/json")
        elif self.path.startswith("/panickey/action"):
            if q.get("token", [""])[0] != CONTROL_TOKEN:
                self._send(b'{"ok":false,"error":"unauthorized"}', "application/json")
                return
            from server.services import panickey as PK
            try:
                ln = int(self.headers.get("Content-Length", 0) or 0)
                body = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
            except Exception:  # noqa: BLE001
                body = {}
            self._send(json.dumps(PK.run_action(body.get("action", ""), body.get("payload", {}))).encode(), "application/json")
        else:
            self._send(b'{"ok":false}', "application/json")

    def log_message(self, *a):  # quiet
        pass


# Canonical canned replies (NEUTRAL form — must match _local_reply's a="" outputs + the greeting).
# Pre-warmed into the TTS cache at startup so they play INSTANTLY in his cloned voice: XTTS synth is
# ~14s per NOVEL phrase on this CPU box, which is exactly what made JARVIS lag and drop to the female
# web-speech fallback. Cached = 6ms. The client fetches this same list (/phrases) to pre-warm blobs.
CANNED_PHRASES = [
    "JARVIS online. How may I help?",
    "Yes, I'm right here. What can I do for you?",
    "All systems steady and watching over you. More to the point — how are you feeling?",
    "Always. That's what I'm here for.",
    "Rest easy. I'll be right here through the night.",
    "I'm JARVIS — your assistant, here with you and looking after things.",
    "I'm here. If this is an emergency I can call for help — say 'call my son' or 'call emergency'. I'm not leaving you.",
    "I'm with you. My deeper reasoning is offline for a moment, but I can still hear you, speak, "
    "show your photos and files, watch over you and call your family — just tell me what you need.",
]
def _warm_canned():
    """Background: synthesize each canned phrase once so the cache is hot → instant, never-female replies."""
    import threading, time as _t
    def run():
        _t.sleep(6)
        for ph in CANNED_PHRASES:
            try:
                _tts(ph)
            except Exception:  # noqa: BLE001
                pass
    threading.Thread(target=run, daemon=True).start()


def _start_maintenance_loop():
    """Lightweight background maintenance: brain tunnel, disk cleanup, log trim — no visible UI."""
    def loop():
        from server.services import speed_optimizer as SO
        interval = max(60, int(os.environ.get("MAINTENANCE_INTERVAL_SEC", "600")))
        while True:
            try:
                time.sleep(interval)
                SO.run_maintenance()
            except Exception:  # noqa: BLE001
                pass
    threading.Thread(target=loop, daemon=True).start()


def _start_panickey_guardian():
    """PanicKey autonomous guardian — evaluates rules every minute and enforces safe reactions."""
    def loop():
        from server.services import panickey as PK
        while True:
            try:
                time.sleep(60)
                PK.guardian_tick()
            except Exception:  # noqa: BLE001
                pass
    threading.Thread(target=loop, daemon=True).start()


def _start_brain_watch():
    """SALVAGE WATCHER (always-on): continuously bring any provisioned jarvis-brain box fully online —
    wait for it to become reachable, open the tunnel, start Ollama — and keep it healthy, WITHOUT ever
    disposing it. Cheap when the brain is already up (ensure_brain_tunnel short-circuits on a fast
    /api/tags check); only does real work while a box is booting or has dropped. This is what makes a
    GPU instance 'just work' after provisioning, and self-heal if Vast restarts/reassigns it."""
    def loop():
        from server.services import gpu_instances as GI
        while True:
            delay = 45
            try:
                r = GI.ensure_brain_tunnel()
                t = (r or {}).get("tunnel") if isinstance(r, dict) else None
                if t == "up":            delay = 60     # healthy — relax
                elif t == "no_brain":    delay = 300    # nothing provisioned — don't hammer the Vast API
                else:                    delay = 20      # onboarding/healing — check often
            except Exception:  # noqa: BLE001
                delay = 60
            time.sleep(delay)
    threading.Thread(target=loop, daemon=True).start()


def main():
    global _SNAP
    _warm_canned()   # hot-cache the lifeline phrases in his voice (no lag, no female fallback)
    _start_maintenance_loop()
    _start_panickey_guardian()
    _start_brain_watch()
    try:
        from server.services import feedback_bus as fb
        fb.install_global()
    except Exception:  # noqa: BLE001
        pass
    # Quick first paint: cheap fields only (counts + ps + cpu) so the page shows real data within ~0.4s
    # and never looks blank; the refresher then fills the slower fields (pm2/box/glb/learning).
    try:
        total = _count(BRAIN_DB, "SELECT COUNT(*) FROM ont_object WHERE type='Topic'") or 0
        enr = _count(BRAIN_DB, "SELECT COUNT(*) FROM note WHERE frontmatter_json LIKE '%\"batch_loader\"%'") or 0
        _SNAP = {"ts": int(time.time()),
                 "completion": {"enriched": enr, "total": total, "pct": round(enr / max(total, 1) * 100, 1)},
                 "runners": [], "vps": _vps(),
                 "learning": {}, "glb": {}, "box": {}, "workers": [], "tiers": [], "feedback": {},
                 "loading": True}
    except Exception:  # noqa: BLE001
        pass
    # Non-blocking: bind + serve IMMEDIATELY; the refresher fills the snapshot in the background.
    threading.Thread(target=_refresher, daemon=True).start()
    http.server.ThreadingHTTPServer.daemon_threads = True
    http.server.ThreadingHTTPServer.request_queue_size = 64
    srv = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), _H)
    print(f"[dashboard] serving on http://0.0.0.0:{PORT}  (/, /metrics) — refresher every 2.5s", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
