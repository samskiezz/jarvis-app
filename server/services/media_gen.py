"""MEDIA GEN — gpt-image-2 text→image + Tripo image→3D GLB (full PBR), saved to a read/write library.

Reuses the proven Tripo pipeline (underworld/scripts/tripo_imagefirst: _openai_image = GPT Image 2,
convert_one = image→PBR/HD GLB). Every output is recorded in media.db (the save/read/write library) and
written to server/data/media/ so the dashboard can show + download it. Run headless as a tracked,
no-timeout task by the task daemon.

CLI:  python -m server.services.media_gen image "<prompt>"
      python -m server.services.media_gen glb   "<prompt>"
"""
from __future__ import annotations

import base64
import json
import os
import sqlite3
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MEDIA = os.path.join(ROOT, "server", "data", "media")
MEDIA_DB = os.path.join(ROOT, "server", "data", "media.db")
os.makedirs(MEDIA, exist_ok=True)


def _db() -> sqlite3.Connection:
    c = sqlite3.connect(MEDIA_DB, timeout=15)
    c.execute("""CREATE TABLE IF NOT EXISTS media(
        id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, prompt TEXT, file TEXT, created_ts INTEGER)""")
    c.commit()
    return c


def _record(kind: str, prompt: str, file: str) -> None:
    c = _db()
    c.execute("INSERT INTO media(kind,prompt,file,created_ts) VALUES(?,?,?,?)",
              (kind, prompt[:300], file, int(time.time())))
    c.commit(); c.close()


def library(limit: int = 5000) -> list:  # raised from 60 so /library returns the full GLB index
    try:
        c = _db()
        rows = c.execute("SELECT id,kind,prompt,file,created_ts FROM media ORDER BY id DESC LIMIT ?",
                         (limit,)).fetchall()
        c.close()
        return [{"id": r[0], "kind": r[1], "prompt": r[2], "file": r[3], "ts": r[4]} for r in rows]
    except Exception:  # noqa: BLE001
        return []


def generate_image(prompt: str) -> str:
    key = os.environ.get("OPENAI_API_KEY") or os.environ.get("OPENAI_KEY")
    model = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-2")
    body = {"model": model, "prompt": prompt, "size": "1024x1024", "n": 1}
    req = urllib.request.Request("https://api.openai.com/v1/images/generations",
                                 data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as x:
        d = json.loads(x.read().decode())["data"][0]
    img = base64.b64decode(d["b64_json"]) if d.get("b64_json") else urllib.request.urlopen(d["url"], timeout=120).read()
    fn = f"img_{int(time.time())}.png"
    open(os.path.join(MEDIA, fn), "wb").write(img)
    _record("image", prompt, fn)
    print("IMAGE_OK " + fn, flush=True)
    return fn


def generate_glb(prompt: str) -> str:
    sys.path.insert(0, os.path.join(ROOT, "underworld", "scripts"))
    import tripo_imagefirst as tif
    ts = int(time.time())
    rel = f"server/data/media/glb_{ts}.glb"
    dest = os.path.join(ROOT, rel)
    prev = dest[:-4] + ".preview.png"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(prev, "wb").write(tif._openai_image(prompt))   # gpt-image-2 with the raw prompt
    _record("image", prompt, os.path.basename(prev))
    tif.convert_one({"out_glb": rel})                    # proven image→PBR/HD GLB pipeline
    _record("glb", prompt, os.path.basename(dest))
    print("GLB_OK " + os.path.basename(dest), flush=True)
    return os.path.basename(dest)


if __name__ == "__main__":
    kind = sys.argv[1] if len(sys.argv) > 1 else "image"
    prompt = " ".join(sys.argv[2:]) or "a glowing holographic data crystal, cyberpunk, dark background"
    try:
        if kind == "glb":
            generate_glb(prompt)
        else:
            generate_image(prompt)
    except Exception as e:  # noqa: BLE001
        print("MEDIA_ERR " + str(e)[:200], flush=True)
        sys.exit(1)
