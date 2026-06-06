#!/usr/bin/env python3
"""Generate the Palantir-replica + Iron-Man JARVIS GLBs via Tripo3D.

Run from the repo root:  TRIPO_API_KEY=... python -m scripts.gen_palantir_models
Models land in public/models/palantir/. Ollama-driven prompts when an LLM is up.
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.services import tripo_client as tc  # noqa: E402

JOBS = {
    "palantir/jarvis_core_avatar": "Iron Man JARVIS holographic AI core, sleek arc reactor, glowing cyan energy, clean Apple-grade futuristic, floating rings",
    "palantir/gotham_command_globe": "holographic command globe console, glowing blue data sphere on a sleek dark pedestal, sci-fi command table",
    "palantir/foundry_pipeline_rig": "futuristic data pipeline rig, glowing conduits and processing nodes, clean hi-tech industrial, cyan light",
    "palantir/apollo_delivery_rig": "sleek orbital delivery launch gantry, glowing green energy, hi-tech rocket rig, clean minimal",
    "palantir/aip_neural_mesh": "glowing neural network mesh sphere, purple nodes and synapse links, hi-tech AI brain, clean",
    "palantir/audit_ledger_vault": "secure data ledger vault, glowing stacked blocks, chrome and glass, clean futuristic",
    "palantir/iron_man_helmet": "Iron Man helmet, sleek hi-tech, glowing eyes, matte black and gold chrome, futuristic clean",
}


def main() -> None:
    res = {}
    for name, prompt in JOBS.items():
        print(f"[gen] {name} …", flush=True)
        r = tc.generate(prompt, name, max_wait=320)
        res[name] = r
        print(f"  -> ok={r.get('ok')} {r.get('path') or r.get('reason') or r.get('error')}", flush=True)
    json.dump(res, open("/tmp/gen_result.json", "w"))
    ok = sum(1 for r in res.values() if r.get("ok"))
    print(f"DONE: {ok}/{len(JOBS)} models generated")


if __name__ == "__main__":
    main()
