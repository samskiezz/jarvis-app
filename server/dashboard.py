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
import http.server
import json
import os
import secrets
import sqlite3
import subprocess
import threading
import time
import urllib.request

PORT = int(os.environ.get("DASHBOARD_PORT", "8095"))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAIN_DB = os.path.join(ROOT, "server/data/brain.db")
DOCS_DB = os.path.join(ROOT, "server/data/documents.db")
VEC_DB = os.path.join(ROOT, "server/data/vectors.db")
TL_DB = os.path.join(ROOT, "server/data/tiered_llm.db")
FB_DB = os.path.join(ROOT, "server/data/feedback.db")
GLB_DIR = os.path.join(ROOT, "underworld/web/public/models/generated")
BOX = os.environ.get("OLLAMA_HOST", "http://211.72.13.201:41137").rstrip("/")
CONTROL_TOKEN = os.environ.get("DASH_CONTROL_TOKEN") or secrets.token_hex(8)  # toggle auth

# friendly name  →  the substring that identifies the runner in `ps`
RUNNERS = [
    ("Knowledge Builder · 7,000 topics", "batch_loader"),
    ("Multi-Model Research", "multi_research"),
    ("Background Worker · scrape·OCR·enrich", "server.worker"),
    ("Jarvis GLB Generator · 3D assets", "jarvis_convert_budget"),
    ("API Server", "uvicorn server.main"),
]

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


def _vps() -> dict:
    out = {"cores": os.cpu_count()}
    try:
        out["cpu_pct"] = _cpu_pct()
        out["load"] = round(os.getloadavg()[0], 2)
        mem = {ln.split(":")[0]: int(ln.split()[1]) for ln in open("/proc/meminfo")}
        out["mem_total_gb"] = round(mem["MemTotal"] / 1e6, 1)
        out["mem_used_gb"] = round((mem["MemTotal"] - mem["MemAvailable"]) / 1e6, 1)
        st = os.statvfs(ROOT)
        out["disk_total_gb"] = round(st.f_blocks * st.f_frsize / 1e9, 1)
        out["disk_used_gb"] = round((st.f_blocks - st.f_bavail) * st.f_frsize / 1e9, 1)
    except Exception:  # noqa: BLE001
        pass
    return out


def _box() -> dict:
    out = {"reachable": False, "vram_total_gb": 48.0, "models": [], "vram_used_gb": 0.0}
    try:
        with urllib.request.urlopen(BOX + "/api/ps", timeout=2.5) as r:
            d = json.loads(r.read())
        out["reachable"] = True
        out["models"] = [{"name": m["name"], "vram_gb": round(m.get("size_vram", 0) / 1e9, 1)}
                         for m in d.get("models", [])]
        out["vram_used_gb"] = round(sum(m.get("size_vram", 0) for m in d.get("models", [])) / 1e9, 1)
    except Exception:  # noqa: BLE001
        pass
    return out


def _runners() -> list:
    try:
        ps = subprocess.run(["ps", "-eo", "args"], capture_output=True, text=True, timeout=5).stdout
    except Exception:  # noqa: BLE001
        ps = ""
    return [{"name": nm, "on": pat in ps} for nm, pat in RUNNERS]


# label registry — plain-English name + what each background task actually does
TASKS = {
    "jarvis-dashboard":    ("📊 Live Dashboard",      "This metrics UI + the on/off toggles you're using"),
    "jarvis-batch-loader": ("🧠 Knowledge Builder",   "Enriches the ~7,000 topics into cited notes via the LLM tier ladder"),
    "jarvis-correlator":   ("🔗 Cross-Correlator",    "Finds duplicate entities + links them to one canonical (non-stop)"),
    "jarvis-feedback":     ("🤖 Self-Learning Loop",  "Turns errors from every .py into lessons (Llama→Kimi→Claude)"),
    "jarvis-orchestrator": ("🌍 Live Data Producer",  "Pulls live weather/air/quakes/crypto → new measurements (every 30m)"),
    "jarvis-ingestor":     ("📰 Document Ingestor",   "Pulls fresh arXiv papers → new Document objects linked to topics (every 30m)"),
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
            out.append({"name": nm, "label": label, "desc": desc, "toggleable": mine,
                        "status": e.get("status"), "cpu": m.get("cpu"),
                        "mem_mb": round((m.get("memory") or 0) / 1e6),
                        "restarts": e.get("restart_time"),
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
        out["recent_notes"] = [r[0] for r in
                               c.execute("SELECT title FROM note ORDER BY learned_ts DESC LIMIT 8")]
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
    if not rate or rate <= 0:
        return {"task": name, "rate": round(rate or 0, 1), "eta": "measuring…"}
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
            return {"title": f"Runner · {name}", "lines": lines or ["no recent log output"]}
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
            return {"title": f"Recent {name} objects", "lines": lines or ["none"]}
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
  $('runners').innerHTML=(m.runners||[]).map(r=>'<div class=row><span><span class="dot'+(r.on?' live':'')+'" style=background:'+(r.on?'#34d399':'#33485a')+'></span>'+r.name+'</span><b style=color:'+(r.on?'#34d399':'#5b7a90')+'>'+(r.on?'WORKING':'idle')+'</b></div>').join('');
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
    const stat = ok ? (w.cpu+'% · '+w.mem_mb+'MB · ↺'+w.restarts) : '<span style=color:#f87171>stopped</span>';
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
    +'<div class=row><span class=k>SAME_AS links wired</span><b style=color:#34d399>'+fmt(X.sameas_links)+'</b></div>'
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
    if not (name.startswith("jarvis-") or name.startswith("underworld-")):
        return {"ok": False, "error": "name not allowed"}
    try:
        r = subprocess.run(["pm2", action, name], capture_output=True, text=True, timeout=25)
        return {"ok": r.returncode == 0, "action": action, "name": name,
                "msg": ((r.stdout or "") + (r.stderr or ""))[-160:]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:160]}


class _H(http.server.BaseHTTPRequestHandler):
    def _send(self, body: bytes, ctype: str):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/metrics"):
            self._send(json.dumps(_SNAP).encode(), "application/json")
        elif self.path.startswith("/detail"):
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            self._send(json.dumps(_detail(q.get("kind", [""])[0], q.get("name", [""])[0])).encode(),
                       "application/json")
        elif self.path.startswith("/health"):
            self._send(b'{"ok":true}', "application/json")
        else:
            self._send(HTML.replace("__CTOKEN__", CONTROL_TOKEN).encode(), "text/html; charset=utf-8")

    def do_POST(self):
        if self.path.startswith("/control"):
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            if q.get("token", [""])[0] != CONTROL_TOKEN:
                self._send(b'{"ok":false,"error":"unauthorized"}', "application/json")
                return
            self._send(json.dumps(_control(q.get("action", [""])[0], q.get("name", [""])[0])).encode(),
                       "application/json")
        else:
            self._send(b'{"ok":false}', "application/json")

    def log_message(self, *a):  # quiet
        pass


def main():
    global _SNAP
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
                 "runners": _runners(), "vps": _vps(),
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
