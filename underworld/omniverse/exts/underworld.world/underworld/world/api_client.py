"""Thin client for the Underworld backend — the SAME contracts the Three.js renderer
uses (world-map / chunk / scene-state / sentience). stdlib only so it runs inside Kit."""

from __future__ import annotations

import json
import urllib.request


class UnderworldAPI:
    def __init__(self, base_url: str, world_id: str, api_key: str = "dev-key"):
        self.base = base_url.rstrip("/")
        self.world_id = world_id
        self.key = api_key

    def _get(self, path: str, timeout: float = 8.0):
        req = urllib.request.Request(
            f"{self.base}/worlds/{self.world_id}{path}",
            headers={"Authorization": f"Bearer {self.key}"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "ignore"))

    def world_map(self):
        """Continent of cities (φ phyllotaxis) — cheap overview / distant impostors."""
        return self._get("/world-map")

    def chunk(self, cx: int, cz: int, chunk_size: float = 512.0, lod: int = 0):
        """One spatial chunk: full φ/Fibonacci/fractal structure (real GLBs) of the
        cities overlapping it."""
        return self._get(f"/chunk?cx={cx}&cz={cz}&chunk_size={chunk_size}&lod={lod}")

    def scene_state(self):
        """Live minions: position, anim, mood, action, target_building, THOUGHT,
        awareness, identity, awakened — the Global-Workspace cognition output."""
        return self._get("/scene-state")

    def sentience(self):
        """The sentience arc + the awakened minions."""
        return self._get("/sentience")
