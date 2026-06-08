#!/usr/bin/env python3
"""JARVIS WORKER — the heavy background engine, in its OWN process (the robustness fix).

The API (jarvis-backend) must boot light and serve reliably. Running the heavy CPU/GPU work
INSIDE the API process — the scrape→GPU-embed→enrich build, continuous enrichment, and the LLM
research autopilot — spiked CPU/RAM (native libs), GIL-starved uvicorn, and crashed the API
("Aborted!") so it never bound :8001. That is why it was "sensitive to restarts."

This worker runs all of that out-of-process, so:
  • the API is light + robust (fast boot, always serves),
  • the GPU stays busy + the data keeps building (the tasks the server "had"),
  • providers fan out (the box Llama now; gpt-5.x / Kimi as the multi-provider research layer).

Run:  cd /opt/jarvis-app-1 && .venv/bin/python -m server.worker
Env mirrors the old in-API knobs (AUTOBUILD_*/ENRICH_*/LLM_AUTOPILOT_*). Never crashes; each loop
swallows its own errors so one failure can't take the worker down.
"""
from __future__ import annotations

import asyncio
import os


async def _periodic(fn, *, delay: float, interval: float, label: str, **kw) -> None:
    """Run a SYNC function in a thread on an interval (so blocking work never stalls the loop)."""
    await asyncio.sleep(delay)
    while True:
        try:
            await asyncio.to_thread(fn, **kw)
        except Exception as e:  # noqa: BLE001 - a task failure must never kill the worker
            print(f"[jarvis-worker] {label} error: {str(e)[:160]}", flush=True)
        await asyncio.sleep(interval)


async def main() -> None:
    from .services import jarvis_autobuild as ab
    from .services import llm_autopilot as ap
    from .services import llm_enrich as le

    tasks: list[asyncio.Task] = []

    # 1) self-enrichment BUILD (scrape → GPU-embed → LLM-enrich) on an interval.
    if os.environ.get("AUTOBUILD_ON_START", "true").lower() in ("1", "true", "yes"):
        tasks.append(asyncio.create_task(_periodic(
            ab.run_once, delay=5.0,
            interval=max(60, int(os.environ.get("AUTOBUILD_INTERVAL_S", "900"))),
            label="autobuild",
            scrape_batches=int(os.environ.get("AUTOBUILD_SCRAPE_BATCHES", "4")),
            enrich_limit=int(os.environ.get("AUTOBUILD_ENRICH_LIMIT", "24")))))

    # 2) continuous deep enrichment over the doc backlog.
    if os.environ.get("ENRICH_LOOP", "true").lower() in ("1", "true", "yes"):
        tasks.append(asyncio.create_task(_periodic(
            le.enrich_documents, delay=20.0,
            interval=max(10, int(os.environ.get("ENRICH_LOOP_INTERVAL_S", "30"))),
            label="enrich",
            limit=int(os.environ.get("ENRICH_LOOP_BATCH", "24")))))

    # 3) the LLM research autopilot — keeps the GPU busy cycling topics through research().
    if os.environ.get("LLM_AUTOPILOT_ENABLE", "true").lower() in ("1", "true", "yes"):
        tasks.append(asyncio.create_task(ap.autopilot_loop(
            concurrency=int(os.environ.get("LLM_AUTOPILOT_CONCURRENCY", "4")),
            interval_s=float(os.environ.get("LLM_AUTOPILOT_INTERVAL_S", "0.5")))))

    print(f"[jarvis-worker] started {len(tasks)} heavy loops "
          f"(autobuild/enrich/autopilot) out-of-process; API stays light.", flush=True)
    if not tasks:
        print("[jarvis-worker] nothing enabled — idling.", flush=True)
        while True:
            await asyncio.sleep(3600)
    await asyncio.gather(*tasks)


if __name__ == "__main__":
    asyncio.run(main())
