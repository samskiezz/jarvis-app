#!/usr/bin/env python3
"""Budget-guarded watch-converter for JARVIS GLBs.

Turns ready preview PNGs into GLBs (Tripo image_to_model, full PBR) priority-first
(identity -> hero -> kit -> environment -> prop), and STOPS before the Tripo wallet
runs dry (keeps a credit floor). Safe to run alongside jarvis_generate.py --images:
it rescans ("watch") for newly-made previews until the budget floor is hit.

  source .tripo_env first.
  JARVIS_SPECS=...jsonl  JARVIS_CREDIT_FLOOR=200  JARVIS_CONC=4
"""
from __future__ import annotations
import json, os, sys, time, threading, urllib.request
from concurrent.futures import ThreadPoolExecutor

REPO = "/opt/jarvis-app-1"
sys.path.insert(0, os.path.join(REPO, "underworld/scripts"))
import jarvis_generate as jg          # convert_one (full-PBR GLB)
import tripo_imagefirst as tif        # Tripo key/base

SPECS = os.environ.get("JARVIS_SPECS", f"{REPO}/underworld/data/master/jarvis_gen_specs_full.jsonl")
FLOOR = int(os.environ.get("JARVIS_CREDIT_FLOOR", "200"))
CONC = int(os.environ.get("JARVIS_CONC", "4"))
CATRANK = {"identity": 0, "hero": 1, "character": 1, "kit": 2, "environment": 3, "prop": 4, "icon": 5, "fx": 6}


def balance():
    r = urllib.request.Request(f"{tif.API}/user/balance")
    r.add_header("Authorization", f"Bearer {tif.KEY}")
    with urllib.request.urlopen(r, timeout=20) as x:
        return json.loads(x.read().decode())["data"]["balance"]


def main():
    specs = [json.loads(l) for l in open(SPECS) if l.strip()]
    specs.sort(key=lambda s: (CATRANK.get(s.get("category"), 9), s.get("priority", 9), s["glb_id"]))
    done, lock, stop, n = set(), threading.Lock(), {"v": False}, {"ok": 0, "fail": 0}

    def ready():
        out = []
        for s in specs:
            d = os.path.join(REPO, s["out_glb"]); p = d.rsplit(".", 1)[0] + ".preview.png"
            if d in done or os.path.exists(d):
                continue
            if os.path.exists(p) and os.path.getsize(p) > 0:
                out.append(s)
        return out

    def work(s):
        if stop["v"]:
            return
        d = os.path.join(REPO, s["out_glb"])
        with lock:
            if d in done:
                return
            done.add(d)
        try:
            sz = jg.convert_one(s)
            with lock:
                n["ok"] += 1; print(f"  GLB {s['glb_id']} {sz//1024}KB", flush=True)
        except Exception as e:
            m = str(e)[:150]
            with lock:
                n["fail"] += 1; print(f"  FAIL {s['glb_id']}: {m}", flush=True)
                if any(k in m.lower() for k in ("403", "credit", "insufficient", "balance", "forbidden")):
                    stop["v"] = True; print("  -> credit limit hit; stopping.", flush=True)

    idle = 0
    while not stop["v"]:
        try:
            b = balance()
        except Exception:
            b = None
        if b is not None and b < FLOOR:
            print(f"balance {b} < floor {FLOOR}; stopping cleanly.", flush=True); break
        batch = ready()
        if not batch:
            idle += 1
            if idle > 20:
                print("no new previews for a while; done.", flush=True); break
            time.sleep(20); continue
        idle = 0
        print(f"converting {len(batch)} ready (balance ~{b}, floor {FLOOR})", flush=True)
        with ThreadPoolExecutor(max_workers=CONC) as ex:
            list(ex.map(work, batch))
        time.sleep(3)
    print(f"DONE budget-convert: {n['ok']} GLBs created, {n['fail']} failed.", flush=True)


if __name__ == "__main__":
    main()
