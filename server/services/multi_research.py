"""MULTI-PROVIDER RESEARCH — fan grounded research across ALL providers in parallel.

Web-research finding: a single Ollama model caps ~40 tok/s and routes same-model requests to ONE
GPU (the other 4090 idles), so it can never clear a 7,000-topic backlog fast. The fix is to fan
research across every provider at once, each with its own concurrency, so the box GPU AND the cloud
providers are saturated simultaneously:

  • box   — llama3.1:8b on the Vast box (free; ~4 concurrent = OLLAMA_NUM_PARALLEL)
  • kimi  — kimi-k2.6 on Moonshot (cheap; high concurrency)
  • openai— gpt-5.5 (best/most-tokens; CAPPED to ~$50 via a topic budget)

Reuses llm_research.research(override=...) for the grounded fetch+inject, so every provider writes
the same cited, audited brain notes. Env keys: OLLAMA_HOST, KIMI_MOONSHOT_KEY (+ _MODEL),
OPENAI_API_KEY (+ MR_OPENAI_MODEL). Budgets/concurrency tunable via MR_* envs.
"""
from __future__ import annotations

import os
import sqlite3
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from . import llm_research as lr


def _providers() -> list[dict]:
    provs: list[dict] = []
    oh = os.environ.get("OLLAMA_HOST", "")
    if oh:
        provs.append({"name": "box", "conc": int(os.environ.get("MR_BOX_CONC", "4")),
                      "budget": 10**9,
                      "ov": {"kind": "ollama", "base_url": oh,
                             "model": os.environ.get("OLLAMA_MODEL", "llama3.1:8b"), "tag": "llama-box"}})
    kk = os.environ.get("KIMI_MOONSHOT_KEY", "")
    if kk:
        provs.append({"name": "kimi", "conc": int(os.environ.get("MR_KIMI_CONC", "10")),
                      "budget": 10**9,
                      "ov": {"kind": "openai", "base_url": "https://api.moonshot.ai/v1",
                             "model": os.environ.get("KIMI_MOONSHOT_MODEL", "kimi-k2.6"),
                             "api_key": kk, "fixed_temp": True, "tag": "kimi-k2.6"}})
    ok = os.environ.get("OPENAI_API_KEY", "")
    if ok:
        provs.append({"name": "openai", "conc": int(os.environ.get("MR_OPENAI_CONC", "6")),
                      "budget": int(os.environ.get("MR_OPENAI_TOPIC_CAP", "150")),  # ~$50 of gpt-5.5
                      "ov": {"kind": "openai", "base_url": "https://api.openai.com/v1",
                             "model": os.environ.get("MR_OPENAI_MODEL", "gpt-5.5"),
                             "api_key": ok, "reasoning": True, "tag": "gpt-5.5"}})
    return provs


def _topics(limit: int) -> list[str]:
    """Topic names from the ontology graph (the ~7,000 Topic nodes)."""
    db = os.environ.get("JARVIS_BRAIN_DB", "server/data/brain.db")
    out: list[str] = []
    try:
        c = sqlite3.connect(db)
        rows = c.execute(
            "SELECT json_extract(props,'$.label'), json_extract(props,'$.topic_name'), id "
            "FROM ont_object WHERE type='Topic'").fetchall()
        c.close()
        for label, tname, oid in rows:
            n = (label or tname or "").strip()
            if n:
                out.append(n)
    except Exception:  # noqa: BLE001
        pass
    if not out:
        try:
            from . import llm_autopilot as ap
            out = ap._seed_topics()
        except Exception:  # noqa: BLE001
            out = []
    return out[:limit] if limit else out


def run(limit: int = 300) -> dict:
    """Fan `limit` topics across all configured providers in parallel. gpt-5.5 stops at its topic
    budget (~$50); box + kimi continue. Returns a summary."""
    provs = _providers()
    if not provs:
        return {"error": "no providers configured (set OLLAMA_HOST / KIMI_MOONSHOT_KEY / OPENAI_API_KEY)"}
    topics = _topics(limit)
    if not topics:
        return {"error": "no topics found"}

    # round-robin assign topics to providers, skipping a provider once its budget is hit
    assigned: dict[str, list[str]] = {p["name"]: [] for p in provs}
    cap = {p["name"]: p["budget"] for p in provs}
    i = 0
    for t in topics:
        for _ in range(len(provs)):
            p = provs[i % len(provs)]; i += 1
            if len(assigned[p["name"]]) < cap[p["name"]]:
                assigned[p["name"]].append(t)
                break

    st = {"done": 0, "fail": 0, "by": {p["name"]: 0 for p in provs}, "start": time.time(),
          "total": sum(len(v) for v in assigned.values())}
    lock = threading.Lock()
    by_ov = {p["name"]: p["ov"] for p in provs}
    subs = int(os.environ.get("MR_SUBTOPICS", "4"))

    def work(name: str, topic: str) -> None:
        try:
            lr.research(topic, max_subtopics=subs, inject=True, override=by_ov[name])
            with lock:
                st["done"] += 1; st["by"][name] += 1
                if st["done"] % 10 == 0:
                    print(f"[multi_research] {st['done']}/{st['total']} by={st['by']} "
                          f"({time.time()-st['start']:.0f}s)", flush=True)
        except Exception:  # noqa: BLE001
            with lock:
                st["fail"] += 1

    print(f"[multi_research] {st['total']} topics across {[p['name'] for p in provs]} "
          f"(openai cap {cap.get('openai','-')} topics)", flush=True)
    pools = {p["name"]: ThreadPoolExecutor(max_workers=p["conc"]) for p in provs}
    futs = []
    for name, ts in assigned.items():
        for t in ts:
            futs.append(pools[name].submit(work, name, t))
    for f in futs:
        f.result()
    for pool in pools.values():
        pool.shutdown()
    dt = time.time() - st["start"]
    print(f"[multi_research] DONE {st['done']} researched, {st['fail']} failed, by={st['by']}, {dt:.0f}s "
          f"({st['done']/max(dt,1)*60:.0f}/min)", flush=True)
    return st


def batch_enrich(limit: int = 0, batch_size: int = 60) -> dict:
    """THE FAST LAYER — enrich topics in BIG BATCHES (≈60 topics per LLM call, using the large
    context windows) instead of one slow grounded pass each. ~140 calls clears 7,000 topics in
    minutes. Fans batches across providers (Kimi/gpt-5.5 big-context primary; box for small).
    Writes a 1-line summary + category note per topic. This is the staggered ladder's L1 (bulk);
    the grounded run() is L2 (depth) for priority topics."""
    import json as _json

    provs = _providers()
    if not provs:
        return {"error": "no providers configured"}
    topics = _topics(limit)
    if not topics:
        return {"error": "no topics"}
    batches = [topics[i:i + batch_size] for i in range(0, len(topics), batch_size)]

    # assign batches across providers; openai limited to ~cap/batch_size batches (its topic budget)
    assigned: dict[str, list[list[str]]] = {p["name"]: [] for p in provs}
    obudget = {p["name"]: (p["budget"] // batch_size + 1) for p in provs}
    i = 0
    for b in batches:
        for _ in range(len(provs)):
            p = provs[i % len(provs)]; i += 1
            if len(assigned[p["name"]]) < obudget[p["name"]]:
                assigned[p["name"]].append(b); break

    st = {"topics": 0, "fail": 0, "by": {p["name"]: 0 for p in provs}, "start": time.time(),
          "batches": len(batches)}
    lock = threading.Lock()
    by_ov = {p["name"]: p["ov"] for p in provs}
    try:
        from . import second_brain as sb
    except Exception:  # noqa: BLE001
        sb = None

    def do_batch(name: str, batch: list[str]) -> None:
        listing = "\n".join(f"- {t}" for t in batch)
        prompt = ("For EACH topic below, write ONE factual sentence and assign ONE broad category "
                  "(e.g. weather, geopolitics, finance, science, energy, health, security). "
                  'Output ONLY compact JSON: {"Topic Name": {"s": "one sentence", "c": "category"}}. '
                  "Use the EXACT topic names as keys.\n\nTopics:\n" + listing)
        ov = by_ov[name]
        mt = 8000 if ov.get("reasoning") else 4000
        out = lr.llm_complete(prompt, system="You are a precise knowledge-base enricher. Output only JSON.",
                              fmt="json", max_tokens=mt, override=ov)
        if not out:
            with lock:
                st["fail"] += len(batch)
            return
        try:
            a, b2 = out.find("{"), out.rfind("}")
            data = _json.loads(out[a:b2 + 1]) if a >= 0 else {}
        except Exception:  # noqa: BLE001
            data = {}
        n = 0
        for topic in batch:
            rec = data.get(topic) or {}
            summary = (rec.get("s") or "").strip()
            cat = (rec.get("c") or "general").strip()[:30]
            if summary and sb is not None:
                try:
                    sb.upsert_note("concept", topic, f"{summary}",
                                   {"category": cat, "batch_enriched": True, "by": ov.get("tag")}, 0.6)
                    n += 1
                except Exception:  # noqa: BLE001
                    pass
        with lock:
            st["topics"] += n; st["by"][name] += n
            if st["by"][name] % (batch_size * 3) < batch_size:
                print(f"[batch_enrich] {st['topics']} topics by={st['by']} ({time.time()-st['start']:.0f}s)", flush=True)

    print(f"[batch_enrich] {len(batches)} batches × {batch_size} ≈ {len(topics)} topics across "
          f"{[p['name'] for p in provs]}", flush=True)
    pools = {p["name"]: ThreadPoolExecutor(max_workers=p["conc"]) for p in provs}
    futs = [pools[name].submit(do_batch, name, b) for name, bs in assigned.items() for b in bs]
    for f in futs:
        f.result()
    for pool in pools.values():
        pool.shutdown()
    dt = time.time() - st["start"]
    print(f"[batch_enrich] DONE {st['topics']} topics enriched, {st['fail']} failed, by={st['by']}, "
          f"{dt:.0f}s ({st['topics']/max(dt,1)*60:.0f}/min)", flush=True)
    return st


if __name__ == "__main__":
    import sys
    mode = sys.argv[1] if len(sys.argv) > 1 else "batch"
    arg = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    print(batch_enrich(limit=arg) if mode == "batch" else run(limit=arg or 300))
