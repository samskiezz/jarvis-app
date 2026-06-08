#!/usr/bin/env python3
"""JARVIS HUD asset generator — image-first, render-locked, FILM GRADE.

Pipeline (per spec, using the spec's OWN hand-written subject prompt):
    subject prompt + Hollywood-2026 cinematic directive
        --(OpenAI gpt-image-2, quality=high)--> <out>.preview.png
    preview --(Tripo image_to_model, MAX: v2.5 mesh, full PBR, HD detailed texture,
               quad topology, per-spec face_limit, image-aligned)--> <out>.glb

Reuses tripo_imagefirst's _upload/_req/_poll plumbing; own gpt-image-2 call so we
control model + quality + size. out_glb paths are relative to the repo root.

Modes:
    --images           preview PNGs (OpenAI cost only)        [default]
    --convert          preview PNGs -> GLBs (Tripo cost ~20-30 cr each)
    --only ID          one glb_id
    --limit N          first N specs
    --concurrency K    parallel workers (default 3)
    --force            regenerate even if output exists
Env (source .openai_env + .tripo_env first):
    JARVIS_IMAGE_MODEL  default gpt-image-2
    JARVIS_IMAGE_QUALITY default high
    JARVIS_IMAGE_SIZE   default 1024x1024 (square => best single-object reconstruction)
"""
from __future__ import annotations
import argparse, base64, json, os, sys, threading, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

REPO = "/opt/jarvis-app-1"
SPECS = os.path.join(REPO, "underworld/data/master/jarvis_gen_specs.jsonl")
sys.path.insert(0, os.path.join(REPO, "underworld/scripts"))
import tripo_imagefirst as tif  # noqa: E402 — reuse proven Tripo upload/req/poll

IMAGE_MODEL = os.environ.get("JARVIS_IMAGE_MODEL", "gpt-image-2-2026-04-21")
IMAGE_QUALITY = os.environ.get("JARVIS_IMAGE_QUALITY", "high")
IMAGE_SIZE = os.environ.get("JARVIS_IMAGE_SIZE", "1024x1024")
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")

# The film-grade directive appended to every subject prompt. Keeps the subject a
# single centered object on a clean background (required for image_to_model) while
# pushing 2026 feature-film VFX fidelity.
HOLLYWOOD = (
    " — rendered as a 2026 Hollywood feature-film VFX hero shot: photoreal, RTX path-traced "
    "global illumination, volumetric god-rays and atmospheric haze, ultra-detailed physically-based "
    "materials, crisp specular highlights and subsurface glow, cinematic key + rim lighting, "
    "anamorphic depth, 8K texture fidelity, sleek high-tech holographic command-center aesthetic, "
    "single hero subject perfectly centered on a clean dark studio background, full object in frame, "
    "no text, no watermark — composed for clean 360° 3D reconstruction."
)


def _oai_image(prompt, retries=10):
    """ChatGPT Image 2 (gpt-image-2) at max quality. Returns PNG bytes."""
    import random
    body = {"model": IMAGE_MODEL, "prompt": prompt + HOLLYWOOD,
            "size": IMAGE_SIZE, "quality": IMAGE_QUALITY, "n": 1}
    delay = 4.0
    last = None
    for a in range(retries):
        r = urllib.request.Request("https://api.openai.com/v1/images/generations",
                                   data=json.dumps(body).encode(), method="POST")
        r.add_header("Authorization", f"Bearer {OPENAI_KEY}")
        r.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(r, timeout=420) as x:  # gpt-image-2 quality=high is 30-50x slower
                d = json.loads(x.read().decode())["data"][0]
            return base64.b64decode(d["b64_json"]) if d.get("b64_json") else \
                tif._req("GET", d["url"], raw=True, timeout=120)
        except urllib.error.HTTPError as e:
            last = f"{e.code} {e.read()[:200].decode(errors='ignore')}"
            if e.code in (429, 500, 502, 503, 504, 520, 522, 524) and a < retries - 1:
                time.sleep(delay + random.uniform(0, 3)); delay = min(delay * 1.7, 45); continue
            raise RuntimeError(last)
        except urllib.error.URLError as e:
            last = str(e)
            if a < retries - 1:
                time.sleep(delay); delay = min(delay * 1.7, 45); continue
            raise RuntimeError(last)


def _dest(s): return os.path.join(REPO, s["out_glb"])
def _preview(s): return _dest(s).rsplit(".", 1)[0] + ".preview.png"


def make_image(spec):
    dest, prev = _dest(spec), _preview(spec)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    png = _oai_image(spec["prompt"])
    if not png:
        raise RuntimeError("empty image bytes")
    tmp = prev + ".tmp"
    with open(tmp, "wb") as f:
        f.write(png)
    os.replace(tmp, prev)        # atomic: never leave a 0-byte preview
    return prev


def convert_one(spec):
    dest, prev = _dest(spec), _preview(spec)
    if not os.path.exists(prev):
        raise RuntimeError("no preview; run --images first")
    tok = tif._upload(open(prev, "rb").read())
    tp = spec.get("tripo", {})
    body = {"type": "image_to_model", "file": {"type": "jpeg", "file_token": tok},
            "model_version": "v2.5-20250123",
            "texture": tp.get("texture", True), "pbr": tp.get("pbr", True),
            "texture_quality": tp.get("texture_quality", "detailed"),
            "face_limit": int(tp.get("face_limit", 40000)),
            "texture_alignment": "original_image", "orientation": "align_image",
            "quad": False, "auto_size": True}   # quad=False -> triangulated glTF/GLB for web + UE5 Interchange
    tid = tif._req("POST", f"{tif.API}/task", body)["data"]["task_id"]
    out = tif._poll(tid, timeout=700)

    def _url(v):
        return v.get("url") if isinstance(v, dict) else (v if isinstance(v, str) else None)
    cands = [u for u in (_url(out.get(k)) for k in ("pbr_model", "model", "base_model")) if u]
    murl = next((u for u in cands if u.split("?")[0].lower().endswith(".glb")), cands[0] if cands else None)
    if not murl:
        raise RuntimeError(f"no model url: {list(out)}")
    glb = tif._req("GET", murl, raw=True, timeout=400)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "wb").write(glb)
    return len(glb)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", action="store_true")
    ap.add_argument("--convert", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--concurrency", type=int, default=3)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--specs", default=SPECS, help="path to a gen_specs jsonl (default: slice manifest)")
    a = ap.parse_args()
    do_images = a.images or not (a.images or a.convert)
    do_convert = a.convert

    specs = [json.loads(l) for l in open(a.specs) if l.strip()]
    if a.only:
        specs = [s for s in specs if s["glb_id"] == a.only]
    if a.limit:
        specs = specs[: a.limit]
    if not specs:
        print("no matching specs"); sys.exit(2)
    if do_images and not OPENAI_KEY:
        print("set OPENAI_API_KEY"); sys.exit(2)
    if do_convert and not tif.KEY:
        print("set TRIPO_API_KEY"); sys.exit(2)

    lock = threading.Lock(); st = {"img": 0, "glb": 0, "fail": 0}

    def work(s):
        try:
            if do_images and (a.force or not os.path.exists(_preview(s)) or os.path.getsize(_preview(s)) == 0):
                make_image(s)
                with lock:
                    st["img"] += 1; print(f"  IMG  {s['glb_id']}", flush=True)
            if do_convert and (a.force or not os.path.exists(_dest(s))):
                n = convert_one(s)
                with lock:
                    st["glb"] += 1; print(f"  GLB  {s['glb_id']}  {n//1024}KB", flush=True)
        except Exception as e:
            with lock:
                st["fail"] += 1; print(f"  FAIL {s['glb_id']}: {str(e)[:180]}", flush=True)

    print(f"JARVIS generate ({IMAGE_MODEL} q={IMAGE_QUALITY} {IMAGE_SIZE}): {len(specs)} spec(s) "
          f"images={do_images} convert={do_convert}", flush=True)
    with ThreadPoolExecutor(max_workers=a.concurrency) as ex:
        for _ in as_completed([ex.submit(work, s) for s in specs]):
            pass
    print(f"DONE: {st['img']} images, {st['glb']} GLBs, {st['fail']} failed", flush=True)


if __name__ == "__main__":
    main()
