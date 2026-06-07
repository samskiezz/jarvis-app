"""UNDERWORLD WORLD — the Omniverse Kit extension.

On startup it reads the backend (the SAME φ/fractal layout + scene-state + sentience
contracts the Three.js renderer uses), builds a live USD stage, and lets the RTX
renderer path-trace it on the GPU. A polling loop streams the chunks around the camera
and moves the live minions every tick — awakened minions glow. Settings in
extension.toml force RTX Interactive (Path Tracing) + DLSS, and (optionally) WebRTC
livestream so the world reaches the browser.

Run headless on the GPU box via launch-kit.sh:
  kit --enable underworld.world \
      --/underworld/world_id=<id> --/underworld/api_url=http://127.0.0.1:8091 \
      --/app/livestream/enabled=true --no-window
"""

from __future__ import annotations

import carb
import omni.ext
import omni.kit.app
import omni.usd

from .api_client import UnderworldAPI
from .scene_builder import StageBuilder, USD_ROOT


def _setting(path: str, default):
    try:
        v = carb.settings.get_settings().get(path)
        return v if v not in (None, "") else default
    except Exception:  # noqa: BLE001
        return default


class UnderworldWorldExtension(omni.ext.IExt):
    def on_startup(self, ext_id: str):
        carb.log_info("[underworld.world] starting RTX living-world bridge")
        self._api = UnderworldAPI(
            _setting("/underworld/api_url", "http://127.0.0.1:8091"),
            _setting("/underworld/world_id", ""),
            _setting("/underworld/api_key", "dev-key"))
        self._poll = float(_setting("/underworld/poll_seconds", 1.0))
        self._chunk_size = float(_setting("/underworld/chunk_size", 512.0))
        self._chunk_radius = int(_setting("/underworld/chunk_radius", 1))
        self._minion_usd = f"{USD_ROOT}/minion/minion.usd"

        self._ctx = omni.usd.get_context()
        # fresh in-memory stage
        self._ctx.new_stage()
        self._stage = self._ctx.get_stage()
        self._builder = StageBuilder(self._stage)
        self._acc = 0.0
        self._loaded_map = False

        if not self._api.world_id:
            carb.log_warn("[underworld.world] no --/underworld/world_id set; idle.")
            return

        # stream the central chunks once up-front so the world appears immediately
        try:
            for cx in range(-self._chunk_radius, self._chunk_radius + 1):
                for cz in range(-self._chunk_radius, self._chunk_radius + 1):
                    self._builder.apply_chunk(
                        self._api.chunk(cx, cz, chunk_size=self._chunk_size))
        except Exception as e:  # noqa: BLE001
            carb.log_warn(f"[underworld.world] initial chunk load: {e}")

        # per-frame poll for live minions (the cheap, frequent update)
        self._sub = (omni.kit.app.get_app().get_update_event_stream()
                     .create_subscription_to_pop(self._on_update, name="uw_world_poll"))
        carb.log_info("[underworld.world] live: streaming scene-state from "
                      f"{self._api.base}/worlds/{self._api.world_id}")

    def _on_update(self, e):
        self._acc += float(e.payload.get("dt", 1 / 60.0))
        if self._acc < self._poll:
            return
        self._acc = 0.0
        try:
            self._builder.apply_scene_state(self._api.scene_state(), minion_usd=self._minion_usd)
        except Exception as ex:  # noqa: BLE001 - never break the render loop
            carb.log_warn(f"[underworld.world] poll error: {ex}")

    def on_shutdown(self):
        self._sub = None
        carb.log_info("[underworld.world] stopped")
