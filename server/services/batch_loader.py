"""BATCH LOADER — the always-on backend engine that drives the tier ladder.

The tiers only tick when something calls them; this is that caller, running forever. It continuously
enriches the ~7,000-topic backlog via tiered_llm at HIGH CONCURRENCY. Crucially it is GPU-BOUND
(one pure-generation call per topic, NO per-subtopic web scraping) — that's what actually SMASHES
the GPU (the web-bound research left it idle). Box tiers (base/strong) peg the 4090; cloud tiers
(kimi/openai) add parallel headroom. Writes cited notes to brain.db; prints COMPLETION % each pass.

Run:  cd /opt/jarvis-app-1 && .venv/bin/python -m server.services.batch_loader [concurrency]
Env:  BRAIN_DB, BATCH_TIERS (default "base,kimi,strong,base"), OLLAMA_HOST, KIMI_MOONSHOT_KEY, OPENAI_API_KEY
"""
from __future__ import annotations

import concurrent.futures as cf
import os
import sqlite3
import threading
import time

from . import tiered_llm as T

BRAIN_DB = os.environ.get("BRAIN_DB", "server/data/brain.db")
TIER_MIX = [t.strip() for t in os.environ.get("BATCH_TIERS", "base,kimi,strong,base").split(",") if t.strip()]


def _all_topics() -> list[str]:
    c = sqlite3.connect(BRAIN_DB, timeout=15)
    rows = c.execute(
        "SELECT DISTINCT COALESCE(json_extract(props,'$.label'), json_extract(props,'$.topic_name')) "
        "FROM ont_object WHERE type='Topic'").fetchall()
    c.close()
    return [r[0] for r in rows if r[0]]


def _done_titles() -> set:
    c = sqlite3.connect(BRAIN_DB, timeout=15)
    try:
        s = {r[0] for r in c.execute("SELECT title FROM note WHERE frontmatter_json LIKE '%\"batch_loader\"%'")}
    except Exception:  # noqa: BLE001
        s = set()
    c.close()
    return s


def enrich_one(topic: str, tier: str) -> bool:
    r = T.complete(
        f"Topic: {topic}\nWrite exactly 2 factual, specific sentences about it for an intelligence "
        f"knowledge base, then a new line 'CATEGORY: <one lowercase word>'.",
        system="You are a precise analyst. No preamble, no markdown.", tier=tier, max_tokens=400)
    if not (r.get("ok") and r.get("content")):
        return False
    try:
        from . import second_brain as sb
        sb.upsert_note("concept", topic, r["content"].strip(),
                       {"batch_loader": True, "tier": r.get("tier"), "model": r.get("model")}, 0.6)
        return True
    except Exception:  # noqa: BLE001
        return False


def run_forever(conc: int = 12, chunk: int = 200) -> None:
    st = {"ok": 0, "fail": 0, "start": time.time()}
    lock = threading.Lock()

    def work(topic: str, i: int) -> None:
        ok = enrich_one(topic, TIER_MIX[i % len(TIER_MIX)])
        with lock:
            st["ok" if ok else "fail"] += 1
            n = st["ok"] + st["fail"]
            if n % 20 == 0:
                el = time.time() - st["start"]
                print(f"[batch_loader] +{st['ok']} ok / {st['fail']} fail this run | "
                      f"{st['ok']/max(el,1)*60:.0f} topics/min", flush=True)

    print(f"[batch_loader] starting — tier mix {TIER_MIX}, concurrency {conc}", flush=True)
    while True:
        try:
            total = len(_all_topics())
            done = _done_titles()
            todo = [t for t in _all_topics() if t not in done]
            pct = len(done) / max(total, 1) * 100
            print(f"[batch_loader] COMPLETION {len(done)}/{total} = {pct:.1f}%  |  {len(todo)} remaining  "
                  f"|  conc={conc}", flush=True)
            if not todo:
                print("[batch_loader] backlog clear — sleeping 5m", flush=True)
                time.sleep(300)
                continue
            batch = todo[:chunk]
            with cf.ThreadPoolExecutor(max_workers=conc) as ex:
                list(cf.as_completed([ex.submit(work, t, i) for i, t in enumerate(batch)]))
        except Exception as e:  # noqa: BLE001 - never die
            print(f"[batch_loader] loop error: {str(e)[:160]}", flush=True)
            time.sleep(10)


def completion() -> dict:
    """Re-runnable completion snapshot (for the metrics view)."""
    total = len(_all_topics())
    done = len(_done_titles())
    return {"enriched": done, "total": total, "pct": round(done / max(total, 1) * 100, 1)}


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "completion":
        print(completion())
    else:
        run_forever(conc=int(sys.argv[1]) if len(sys.argv) > 1 else 12)
