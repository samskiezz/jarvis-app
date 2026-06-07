#!/usr/bin/env python3
"""Generate the 840 base meshes on Tripo3D — WITH PBR + textures.

Reads data/master/base_mesh_specs.jsonl and, for each base mesh, submits a Tripo3D
text-to-model task requesting PBR + detailed texture, polls to completion, and downloads the
textured GLB to its out_glb path. Resumable (skips existing), credit-aware (stops at budget),
and PBR-explicit (asks for the pbr_model output, falls back to textured model).

Needs:  export TRIPO_API_KEY=tcsk_...     (your Tripo key; uses your credits)
Run:    python3 scripts/tripo_generate.py [--limit N] [--budget-credits 20000] [--dry-run]

Honest: without TRIPO_API_KEY it does a --dry-run (prints the plan, no calls, no credits).
"""
from __future__ import annotations
import argparse, json, os, sys, time, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# gen_specs = one unique generation per distinct look (color/style/era/season/outfit);
# LODs are derived afterwards. ~11k unique themed PBR assets (not 840 collapsed bases).
SPECS = os.path.join(ROOT, "data", "master", "gen_specs.jsonl")
API = os.environ.get("TRIPO_BASE", "https://api.tripo3d.ai/v2/openapi")
KEY = os.environ.get("TRIPO_API_KEY", "")
CREDITS_PER_GEN = 24  # approx, for budget accounting


def _req(method, url, body=None, token=None, raw=False, timeout=60, retries=6):
    data = json.dumps(body).encode() if body is not None else None
    delay = 2.0
    for attempt in range(retries):
        r = urllib.request.Request(url, data=data, method=method)
        if token: r.add_header("Authorization", f"Bearer {token}")
        if data is not None: r.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(r, timeout=timeout) as resp:
                return resp.read() if raw else json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            # back off on rate-limit / transient server errors; re-raise others
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(delay); delay = min(delay * 2, 30); continue
            raise
        except urllib.error.URLError:
            if attempt < retries - 1:
                time.sleep(delay); delay = min(delay * 2, 30); continue
            raise


def submit(spec):
    """Submit a text_to_model task with PBR + texture; return task_id."""
    t = spec["tripo"]
    body = {"type": "text_to_model", "prompt": spec["prompt"],
            "model_version": t.get("model_version", "v2.0-20240919"),
            "texture": True, "pbr": True,
            "texture_quality": t.get("texture_quality", "detailed"),
            "face_limit": t.get("face_limit", 40000)}
    out = _req("POST", f"{API}/task", body, KEY)
    return (out.get("data") or {}).get("task_id") or out.get("task_id")


def poll(task_id, every=3, timeout=900):
    """Poll until success/failed; return the output dict (with pbr_model/model urls)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        out = _req("GET", f"{API}/task/{task_id}", token=KEY)
        d = out.get("data") or out
        status = d.get("status")
        if status in ("success", "completed"):
            return d.get("output") or d.get("result") or {}
        if status in ("failed", "cancelled", "error", "expired"):
            raise RuntimeError(f"task {task_id} {status}: {d.get('message','')}")
        time.sleep(every)
    raise TimeoutError(f"task {task_id} timed out")


def download(output, dest):
    # prefer the PBR model output, then any textured model
    url = (output.get("pbr_model") or output.get("model") or output.get("model_glb")
           or (output.get("models") or {}).get("glb"))
    if isinstance(url, dict): url = url.get("url") or url.get("glb")
    if not url: raise RuntimeError(f"no model url in output keys={list(output)}")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    data = _req("GET", url, raw=True, timeout=300)
    open(dest, "wb").write(data)
    return len(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--budget-credits", type=int, default=20000)
    ap.add_argument("--concurrency", type=int, default=5)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    specs = [json.loads(l) for l in open(SPECS)]
    if a.limit: specs = specs[:a.limit]
    dry = a.dry_run or not KEY
    if not KEY and not a.dry_run:
        print("NO TRIPO_API_KEY set -> dry-run (no calls, no credits). "
              "export TRIPO_API_KEY=... to generate for real.\n")

    todo = [s for s in specs if not os.path.exists(os.path.join(ROOT, s["out_glb"]))]
    est = len(todo) * CREDITS_PER_GEN
    print(f"specs={len(specs)}  already-done={len(specs)-len(todo)}  to-generate={len(todo)}")
    print(f"est. credits ~{est:,} (budget {a.budget_credits:,})  PBR+textured, emissive where flagged")
    if dry:
        for s in todo[:5]:
            print(f"  WOULD GEN {s['base_item']:24s} pbr=1 tex=1 emissive={int(s['tripo']['emissive'])}")
        print(f"  ... {len(todo)} total. (dry-run)")
        return

    import threading
    from concurrent.futures import ThreadPoolExecutor, as_completed
    lock = threading.Lock()
    state = {"spent": 0, "ok": 0, "fail": 0, "stop": False}

    def work(s):
        if state["stop"]:
            return
        with lock:
            if state["spent"] + CREDITS_PER_GEN > a.budget_credits:
                state["stop"] = True; return
            state["spent"] += CREDITS_PER_GEN
        dest = os.path.join(ROOT, s["out_glb"])
        try:
            tid = submit(s); out = poll(tid); n = download(out, dest)
            with lock:
                state["ok"] += 1
                print(f"  [{state['ok']}/{len(todo)}] {s['glb_id']} ({n//1024}KB) ~{state['spent']}cr", flush=True)
        except Exception as e:
            with lock:
                state["fail"] += 1; state["spent"] -= CREDITS_PER_GEN  # not charged on failure
                msg = str(e)[:120]
                print(f"  FAIL {s['glb_id']}: {msg}", flush=True)
                # stop fast if we've clearly run out of credits (Tripo returns 403 Forbidden
                # when the balance hits zero, also 402/explicit credit messages)
                ml = msg.lower()
                if any(k in ml for k in ("credit", "balance", "402", "403", "forbidden")):
                    state["stop"] = True; print("  -> out of credits; stopping cleanly.", flush=True)

    with ThreadPoolExecutor(max_workers=a.concurrency) as ex:
        futs = [ex.submit(work, s) for s in todo]
        for _ in as_completed(futs):
            if state["stop"]:
                break
    print(f"\ndone: generated {state['ok']} assets, {state['fail']} failed, ~{state['spent']} credits used.")
    print("re-run to continue (resumable); then: python3 scripts/derive_variants.py --run")


if __name__ == "__main__":
    main()
