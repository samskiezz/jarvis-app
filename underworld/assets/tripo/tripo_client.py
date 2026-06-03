"""Tripo3D API client — generate HD 3D assets into the world's art library.

SECURITY: this never sees your password. It uses an API key from the environment
(`TRIPO3D_API_KEY`, created at https://platform.tripo3d.ai → Settings → API keys,
starts with `tsk_`). The key is tied to your account, so generation draws on your
credits — without any password ever being stored, committed, or transmitted by us.

Official API (https://platform.tripo3d.ai/docs):
  base    https://api.tripo3d.ai
  auth    Authorization: Bearer tsk_...
  create  POST /v2/openapi/task   {"type":"text_to_model","prompt":...}
  poll    GET  /v2/openapi/task/{task_id}  -> data.status, data.output.{model,pbr_model}

Async: submit → poll until status "success" → download the (PBR) GLB.
"""
from __future__ import annotations

import os
import time
from pathlib import Path
from urllib.request import Request, urlopen
import json

BASE = os.environ.get("TRIPO3D_BASE", "https://api.tripo3d.ai")


class TripoError(RuntimeError):
    pass


def _key() -> str:
    k = os.environ.get("TRIPO3D_API_KEY", "").strip()
    if not k:
        raise TripoError(
            "TRIPO3D_API_KEY not set. Create a key at https://platform.tripo3d.ai "
            "(Settings → API keys; starts with 'tsk_') and export it — never hardcode it.")
    return k


def _post(path: str, body: dict) -> dict:
    req = Request(f"{BASE}{path}", method="POST",
                  data=json.dumps(body).encode(),
                  headers={"Authorization": f"Bearer {_key()}",
                           "Content-Type": "application/json"})
    with urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def _get(path: str) -> dict:
    req = Request(f"{BASE}{path}", headers={"Authorization": f"Bearer {_key()}"})
    with urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def create_text_task(prompt: str, *, model_version: str = "v2.5",
                     negative_prompt: str = "low quality, blurry, distorted",
                     pbr: bool = True) -> str:
    """Submit a text→3D task; returns the task_id."""
    body = {"type": "text_to_model", "prompt": prompt,
            "negative_prompt": negative_prompt, "model_version": model_version}
    if pbr:
        body["texture"] = True
        body["pbr"] = True
    resp = _post("/v2/openapi/task", body)
    if resp.get("code") not in (0, None):
        raise TripoError(f"create failed: {resp}")
    return resp["data"]["task_id"]


def poll_task(task_id: str, *, timeout_s: int = 600, interval_s: float = 5.0) -> dict:
    """Poll until the task finishes. Returns data.output (with model URLs)."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        data = _get(f"/v2/openapi/task/{task_id}").get("data", {})
        status = data.get("status")
        if status in ("success", "completed"):
            return data.get("output", {})
        if status in ("failed", "cancelled", "banned", "expired"):
            raise TripoError(f"task {task_id} {status}: {data}")
        time.sleep(interval_s)
    raise TripoError(f"task {task_id} timed out after {timeout_s}s")


def download(url: str, dest: Path) -> int:
    """Download a finished model GLB to dest. Returns bytes written."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    data = urlopen(Request(url), timeout=120).read()
    dest.write_bytes(data)
    return len(data)


def generate_to_file(prompt: str, dest: Path, *, model_version: str = "v2.5",
                     prefer_pbr: bool = True) -> dict:
    """End-to-end: create → poll → download the GLB. Returns a manifest record."""
    task_id = create_text_task(prompt, model_version=model_version, pbr=prefer_pbr)
    output = poll_task(task_id)
    url = (output.get("pbr_model") if prefer_pbr else None) or output.get("model")
    if not url:
        raise TripoError(f"no model URL in output: {output}")
    n = download(url, dest)
    return {"prompt": prompt, "task_id": task_id, "path": str(dest),
            "bytes": n, "model_version": model_version,
            "provider": "tripo3d", "licence": "account-owned",
            "source_url": url}
