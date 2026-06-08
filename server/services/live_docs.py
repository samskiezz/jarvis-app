"""LIVE DOCS — reliable feed-based document ingestor (no fragile HTML scraping).

Pulls fresh papers from the arXiv Atom API across many categories and adds each as a Document object
in the knowledge graph, linked (DESCRIBES) to its master topic. Reliable structured source, concurrent
fetch, batched writes, and DETERMINISTIC ids (doc:arxiv:<id>) + INSERT OR IGNORE so re-runs can never
duplicate. Writes ONLY brain.db (ont_object/ont_link) — deliberately does NOT touch the documents.db
FTS index, so there's zero risk to the full-text store.

Run:  cd /opt/jarvis-app-1 && .venv/bin/python -m server.services.live_docs [once|forever]
Env:  BRAIN_DB, DOCS_PER_CAT (default 40), DOCS_INTERVAL_S (default 1800)
"""
from __future__ import annotations

import concurrent.futures as cf
import json
import os
import sqlite3
import time
import xml.etree.ElementTree as ET

import httpx

BRAIN_DB = os.environ.get("BRAIN_DB", "server/data/brain.db")
PER_CAT = int(os.environ.get("DOCS_PER_CAT", "40"))
UA = "APEX-LiveDocs/1.0"
ATOM = "{http://www.w3.org/2005/Atom}"

# arXiv category -> master topic (broad buckets that exist in the taxonomy)
CATS = {
    "cs.AI": "Technology & engineering", "cs.LG": "Technology & engineering",
    "cs.CL": "Technology & engineering", "cs.CR": "Security & conflict",
    "stat.ML": "Science & research", "physics.geo-ph": "Earth & environment",
    "q-bio.NC": "Science & research", "econ.GN": "Economy & finance",
    "eess.SY": "Technology & engineering", "astro-ph.EP": "Universe & cosmology",
    "math.OC": "Science & research", "cs.RO": "Technology & engineering",
}


def _fetch_cat(cat: str) -> list:
    url = (f"https://export.arxiv.org/api/query?search_query=cat:{cat}"
           f"&sortBy=submittedDate&sortOrder=descending&max_results={PER_CAT}")
    try:
        r = httpx.get(url, timeout=15.0, headers={"User-Agent": UA})
        r.raise_for_status()
        root = ET.fromstring(r.text)
    except Exception:  # noqa: BLE001
        return []
    out = []
    for e in root.findall(f"{ATOM}entry"):
        aid = (e.findtext(f"{ATOM}id") or "").strip()
        title = " ".join((e.findtext(f"{ATOM}title") or "").split())
        summ = " ".join((e.findtext(f"{ATOM}summary") or "").split())
        if aid and title:
            out.append({"id": aid, "title": title, "summary": summ, "cat": cat, "source": "arxiv"})
    return out


def _biorxiv() -> list:
    """Recent bioRxiv preprints (clean JSON API) — biology/medicine breadth."""
    import datetime
    today = datetime.date.fromtimestamp(time.time())
    frm = (today - datetime.timedelta(days=5)).isoformat()
    try:
        r = httpx.get(f"https://api.biorxiv.org/details/biorxiv/{frm}/{today.isoformat()}/0",
                      timeout=15.0, headers={"User-Agent": UA})
        r.raise_for_status()
        coll = r.json().get("collection", [])
    except Exception:  # noqa: BLE001
        return []
    out = []
    for p in coll[:200]:
        doi = (p.get("doi") or "").strip()
        title = " ".join((p.get("title") or "").split())
        if doi and title:
            out.append({"id": doi, "title": title, "summary": " ".join((p.get("abstract") or "").split()),
                        "cat": p.get("category", "biology"), "source": "biorxiv"})
    return out


def _topics_map(bc: sqlite3.Connection) -> dict:
    m = {}
    for tid, props in bc.execute("SELECT id,props FROM ont_object WHERE type='Topic'"):
        try:
            j = json.loads(props)
            nm = j.get("topic_name") or j.get("label")
            if nm:
                m[nm] = tid
        except Exception:  # noqa: BLE001
            pass
    return m


def run_once() -> dict:
    now_ms = int(time.time() * 1000)
    items = []
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        for r in ex.map(_fetch_cat, list(CATS)):
            items += r
    items += _biorxiv()
    bc = sqlite3.connect(BRAIN_DB, timeout=60)
    bc.execute("PRAGMA busy_timeout=60000")
    topics = _topics_map(bc)
    objrows, linkrows = [], []
    for it in items:
        src = it.get("source", "arxiv")
        ext = it["id"].rsplit("/", 1)[-1]
        did = f"doc:{src}:{ext}"
        mt = CATS.get(it["cat"], "Science & research") if src == "arxiv" else "Science & research"
        props = {"label": it["title"][:240], "master_topic": mt, "document_types": "abstract",
                 "url": it["id"], "source": src, "category": it["cat"], "summary": it["summary"][:600]}
        objrows.append((did, "Document", json.dumps(props), "fetched", now_ms, now_ms))
        if mt in topics:
            linkrows.append((f"describes:{did}", "DESCRIBES", did, topics[mt], now_ms))
    before = bc.total_changes
    for i in range(0, len(objrows), 200):
        bc.executemany("INSERT OR IGNORE INTO ont_object(id,type,props,state,created_ts,updated_ts) VALUES(?,?,?,?,?,?)",
                       objrows[i:i + 200])
        bc.commit()
    new_docs = bc.total_changes - before
    for i in range(0, len(linkrows), 500):
        bc.executemany("INSERT OR IGNORE INTO ont_link(id,type,from_id,to_id,ts) VALUES(?,?,?,?,?)",
                       linkrows[i:i + 500])
        bc.commit()
    bc.close()
    return {"fetched": len(items), "new_documents": new_docs}


def run_forever(interval_s: float = None) -> None:
    interval = interval_s or float(os.environ.get("DOCS_INTERVAL_S", "1800"))
    print(f"[live_docs] starting — arXiv {len(CATS)} categories × {PER_CAT}, every {interval}s", flush=True)
    while True:
        t = time.time()
        try:
            r = run_once()
            print(f"[live_docs] cycle {time.time()-t:.0f}s | fetched {r['fetched']} | +{r['new_documents']} new documents",
                  flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"[live_docs] error: {str(e)[:160]}", flush=True)
        time.sleep(interval)


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "once":
        print(run_once())
    else:
        run_forever()
