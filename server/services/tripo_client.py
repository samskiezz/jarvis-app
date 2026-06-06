"""TRIPO3D CLIENT — generate NEW custom GLB renders for the asset-manifest gaps.

Text-to-3D via the Tripo3D OpenAPI (platform.tripo3d.ai). The flow is: submit a
text prompt -> poll the task -> download the finished .glb into public/models so the
WebGL holo engine can load it. Used to fill the 'gap' surfaces in the asset manifest
(Iron Man helmet, Palantir globe console, holographic city map, audit vault…).

Honest about credentials: it needs TRIPO_API_KEY. Without one, every call returns a
clear ``{"ok": False, "reason": "TRIPO_API_KEY not set"}`` — nothing is faked.

stdlib urllib only; never raises.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

_BASE = os.environ.get("TRIPO_BASE", "https://api.tripo3d.ai/v2/openapi")
_MODELS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "public", "models")


def _key() -> str:
    return os.environ.get("TRIPO_API_KEY", "").strip()


def available() -> bool:
    return bool(_key())


def _req(method: str, path: str, body: dict | None = None, timeout: float = 30.0) -> dict:
    url = f"{_BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {_key()}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "ignore"))
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}", "body": e.read().decode("utf-8", "ignore")[:300]}
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}


def submit(prompt: str, *, style: str = "") -> dict:
    """Submit a text-to-3D task. Returns ``{ok, task_id}`` or a reason. Never raises."""
    if not available():
        return {"ok": False, "reason": "TRIPO_API_KEY not set",
                "hint": "export TRIPO_API_KEY=… then retry to generate custom GLBs"}
    payload = {"type": "text_to_model", "prompt": str(prompt or "")[:400]}
    if style:
        payload["style"] = style
    res = _req("POST", "/task", payload)
    tid = (res.get("data") or {}).get("task_id")
    return {"ok": bool(tid), "task_id": tid, "raw": res if not tid else None}


def poll(task_id: str) -> dict:
    """Poll a task. Returns ``{ok, status, progress, model_url}``. Never raises."""
    if not available():
        return {"ok": False, "reason": "TRIPO_API_KEY not set"}
    res = _req("GET", f"/task/{task_id}")
    d = res.get("data") or {}
    out = d.get("output") or {}
    return {"ok": True, "status": d.get("status"), "progress": d.get("progress"),
            "model_url": out.get("pbr_model") or out.get("model") or out.get("base_model")}


def _download(url: str, name: str) -> dict:
    # name may include a subdir, e.g. "palantir/gotham_command_globe"
    dest = os.path.join(_MODELS_DIR, f"{name}.glb")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    try:
        with urllib.request.urlopen(url, timeout=180) as r, open(dest, "wb") as f:
            f.write(r.read())
        return {"ok": True, "path": f"/models/{name}.glb", "bytes": os.path.getsize(dest)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


def generate(prompt: str, name: str, *, max_wait: int = 240, style: str = "") -> dict:
    """Full pipeline: submit -> poll to completion -> download the GLB to
    public/models/<name>.glb. Returns the final result. Never raises."""
    s = submit(prompt, style=style)
    if not s.get("ok"):
        return s
    tid = s["task_id"]
    t0 = time.time()
    while time.time() - t0 < max_wait:
        p = poll(tid)
        st = (p.get("status") or "").lower()
        if st in ("success", "completed") and p.get("model_url"):
            dl = _download(p["model_url"], name)
            return {"ok": dl.get("ok"), "task_id": tid, "name": name, **dl}
        if st in ("failed", "cancelled", "error"):
            return {"ok": False, "task_id": tid, "status": st}
        time.sleep(5)
    return {"ok": False, "task_id": tid, "reason": f"timeout after {max_wait}s"}


# Default prompts for the manifest gaps (so 'generate the gaps' has real targets).
GAP_PROMPTS = {
    "iron_man_helmet": "Iron Man JARVIS helmet, sleek hi-tech, glowing eyes, clean matte and chrome, futuristic",
    "palantir_globe_console": "holographic command globe console, glowing data sphere on a sleek pedestal, sci-fi UI",
    "holographic_city_map": "holographic 3D city map projection, glowing wireframe buildings, tactical command table",
    "audit_ledger_vault": "secure data vault with glowing ledger blocks, hi-tech chrome and glass, clean futuristic",
}
