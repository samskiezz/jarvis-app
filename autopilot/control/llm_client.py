"""Minimal Ollama client for autopilot LLM calls.

Reads OLLAMA_HOST + OLLAMA_MODEL from env (already set by ecosystem.config.cjs).
Fails open (returns None) if brain is unreachable so loops keep running.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1:8b")


def generate(prompt: str, *, model: str | None = None, max_tokens: int = 200,
             timeout: float = 30.0) -> str | None:
    """One-shot generate. Returns response text or None on failure (no raise)."""
    try:
        body = {
            "model": model or OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {"num_predict": max_tokens, "temperature": 0.3},
        }
        req = urllib.request.Request(
            f"{OLLAMA_HOST}/api/generate",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read())
        return (data.get("response") or "").strip() or None
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError):
        return None


def is_reachable(timeout: float = 3.0) -> bool:
    try:
        req = urllib.request.Request(f"{OLLAMA_HOST}/api/tags")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status == 200
    except Exception:
        return False
