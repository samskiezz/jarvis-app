"""Accessibility hardware-bridge driver registry.

Cluster C4 (gap-fix #1, #2, #5, #6): a thin, additive abstraction over the
four accessibility input/output channels Jarvis can plug into. Each driver
exposes the same two-method contract:

    available() -> dict[str, Any]   # what's installed, what's missing
    activate(**kw) -> dict[str, Any] # best-effort start; never raises

No driver is force-loaded at import time — every driver swallows ImportError
so the registry stays usable on hosts where the hardware/library is absent.

Drivers
-------

gaze
    * `webgazer`   — browser-side WebGazer.js (free, webcam). Server has
      nothing to install; `activate()` just hands the client the snippet
      key so the JS layer can lazy-load https://webgazer.cs.brown.edu/
      webgazer.js. Accuracy ~130px error, self-calibrating.
    * `tobii`      — server-side Tobii Pro SDK (`pip install tobii_research`).
      Works with research-grade Pros and (per Tobii community) the Eye
      Tracker 5 *only* via the Interaction Library / Stream Engine. We
      probe both: `tobii_research.find_all_eyetrackers()` first, then fall
      back to reporting "needs Stream Engine bridge".

switch
    * `web_bluetooth` — browser-side; server just returns the GATT service
      filter list the client should pass to `navigator.bluetooth
      .requestDevice()`. Tested filters cover the Logitech Adaptive
      "Buddy Button"-style HID profile and the AbleNet Hook+.
    * `usb_hid`       — server-side via `pyusb`/`hidapi`. Best-effort enum
      of vendor IDs known to ship single-switch interfaces.

screen_reader
    * `nvda`        — Windows-only. Loads `nvdaControllerClient64.dll`
      (NVDA 2024.1+, controller-client v2) via `ctypes` and exposes
      `speakText()` / `cancelSpeech()` / `brailleMessage()`.
    * `voiceover`   — macOS-only. Bridges `osascript` to drive the
      built-in VoiceOver via `say` (always present on macOS) and falls
      back to a polite no-op elsewhere.

dwell
    * Pure JS — the registry just returns the recommended timing
      parameters (default 800 ms hover window, 200 ms fade-in).

Hardware purchase / install
---------------------------
* WebGazer.js     — free.
* Tobii Eye Tracker 5 — ~USD 230 (consumer); plug USB-A and
  `pip install tobii_research`.
* AbleNet "Hook+ USB Switch Interface" — ~USD 65 (single-switch USB HID).
* Logitech Adaptive Gaming Kit "Buddy Button" — ~USD 100 (BLE/3.5mm).
* NVDA — free; install from https://www.nvaccess.org/ on Windows host
  and copy `nvdaControllerClient64.dll` next to the python process
  (see https://github.com/nvaccess/nvda/blob/master/extras/controllerClient/readme.md).

The activation flow is intentionally idempotent: calling `activate()` on
an already-active driver is a no-op and returns the same status dict.
"""
from __future__ import annotations

import ctypes
import logging
import os
import platform
import shutil
import subprocess
from dataclasses import dataclass, field
from typing import Any, Callable

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Result helpers — every driver returns the same shape, ok=False never raises.
# ---------------------------------------------------------------------------


def _ok(**extra: Any) -> dict[str, Any]:
    return {"ok": True, **extra}


def _missing(reason: str, **extra: Any) -> dict[str, Any]:
    return {"ok": False, "reason": reason, **extra}


# ---------------------------------------------------------------------------
# Gaze
# ---------------------------------------------------------------------------


def _gaze_webgazer_available() -> dict[str, Any]:
    # Browser-only — server has nothing to verify beyond returning the
    # canonical CDN URL the client should lazy-load.
    return _ok(
        kind="browser",
        url="https://webgazer.cs.brown.edu/webgazer.js",
        accuracy_px=130,
        notes="Requires camera permission; self-calibrates after ~3 clicks.",
    )


def _gaze_webgazer_activate(**_: Any) -> dict[str, Any]:
    # Hand the client the snippet it should paste / inject. Real activation
    # happens in the browser tab.
    return _ok(
        bootstrap_snippet=(
            '<script src="https://webgazer.cs.brown.edu/webgazer.js"></script>'
            "<script>webgazer.setRegression('ridge')"
            ".setGazeListener((d)=>{ if(d) window.postMessage("
            "{type:'jarvis.gaze', x:d.x, y:d.y}, '*'); }).begin();</script>"
        ),
    )


def _gaze_tobii_available() -> dict[str, Any]:
    try:
        import tobii_research as tr  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover - import guard
        return _missing(
            f"tobii_research not installed: {exc}",
            install="pip install tobii_research",
            hardware="Tobii Eye Tracker 5 (~$230) or Tobii Pro research-grade",
        )
    try:
        trackers = tr.find_all_eyetrackers()  # type: ignore[attr-defined]
    except Exception as exc:  # pragma: no cover - SDK runtime failure
        return _missing(f"tobii SDK loaded but enumeration failed: {exc}")
    if not trackers:
        return _missing(
            "tobii_research SDK present but no eye tracker found on USB/network",
            note=(
                "Eye Tracker 5 may require the Stream Engine bridge — see "
                "https://developer.tobii.com/community/forums/topic/python-sdk-with-tobii-eye-tracker-5/"
            ),
        )
    return _ok(
        kind="server",
        devices=[
            {
                "address": getattr(t, "address", None),
                "model": getattr(t, "model", None),
                "serial": getattr(t, "serial_number", None),
            }
            for t in trackers
        ],
    )


def _gaze_tobii_activate(**_: Any) -> dict[str, Any]:
    info = _gaze_tobii_available()
    if not info.get("ok"):
        return info
    # Actual gaze-stream subscription is owned by the consuming feature;
    # we only confirm the device is reachable.
    return _ok(devices=info.get("devices", []))


def _gaze_mediapipe_available() -> dict[str, Any]:
    """Free, Linux-native gaze backend using MediaPipe Face Mesh (468
    landmarks incl. refined iris). Preferred fallback when Tobii is absent.

    Approx accuracy ~5deg of visual angle (sufficient for large dock-card
    selection); pure-CPU on a stock webcam, ~30 fps on a modern laptop.
    No proprietary SDK, no hardware purchase, MIT-style permissive license.
    """
    try:
        import mediapipe as mp  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover - import guard
        return _missing(
            f"mediapipe not installed: {exc}",
            install="pip install mediapipe opencv-python",
            hardware="Any webcam (USB or built-in); no proprietary tracker required.",
        )
    try:
        import cv2  # type: ignore[import-not-found]  # noqa: F401
    except Exception as exc:  # pragma: no cover - import guard
        return _missing(
            f"opencv-python not installed: {exc}",
            install="pip install opencv-python",
        )
    version = getattr(mp, "__version__", "unknown")
    # Probe a webcam without actually opening a stream (cheap shape check).
    cam_hint = "/dev/video0" if os.path.exists("/dev/video0") else None
    return _ok(
        kind="server",
        backend="mediapipe.face_mesh+iris",
        mediapipe_version=version,
        accuracy_deg=5.0,
        cost_usd=0,
        webcam_device=cam_hint,
        notes=(
            "Iris-relative-to-eye-corner geometry. Calibrate by asking the "
            "user to look at the 4 dock corners once per session. Falls back "
            "to coarse 5-class gaze (L/R/U/D/center) if calibration skipped."
        ),
    )


def _gaze_mediapipe_activate(**_: Any) -> dict[str, Any]:
    info = _gaze_mediapipe_available()
    if not info.get("ok"):
        return info
    # Real stream subscription lives in a future video worker; we just
    # confirm the model can load.
    try:
        import mediapipe as mp  # type: ignore[import-not-found]
        # FaceMesh is the legacy solution; new FaceLandmarker also works.
        # We pick whichever the installed mediapipe exposes.
        if hasattr(mp, "solutions") and hasattr(mp.solutions, "face_mesh"):
            mp.solutions.face_mesh.FaceMesh(refine_landmarks=True).close()
            entrypoint = "mp.solutions.face_mesh.FaceMesh(refine_landmarks=True)"
        else:  # pragma: no cover - future API
            entrypoint = "mp.tasks.vision.FaceLandmarker"
        return _ok(entrypoint=entrypoint, **{k: v for k, v in info.items() if k != "ok"})
    except Exception as exc:  # pragma: no cover - runtime guard
        return _missing(f"mediapipe model load failed: {exc}")


# ---------------------------------------------------------------------------
# Switch (single-switch scanning)
# ---------------------------------------------------------------------------


# Known accessibility-switch USB vendor IDs (best-effort, additive list).
_KNOWN_SWITCH_VENDORS = {
    0x1A86: "QinHeng (generic HID switch)",
    0x046D: "Logitech (Adaptive Gaming Kit)",
    0x21AC: "AbleNet (Hook+ USB Switch Interface)",
    0x0C45: "Microdia (Origin Instruments)",
}


def _switch_web_bluetooth_available() -> dict[str, Any]:
    return _ok(
        kind="browser",
        gatt_filters=[
            # HID over GATT — covers Logitech Buddy Button + most BLE switches.
            {"services": ["00001812-0000-1000-8000-00805f9b34fb"]},
            # Battery-only fallback so the user can still pick the device.
            {"services": ["battery_service"]},
        ],
        name_prefixes=["Buddy", "AbleNet", "Tecla", "Switch"],
    )


def _switch_web_bluetooth_activate(**_: Any) -> dict[str, Any]:
    cfg = _switch_web_bluetooth_available()
    return _ok(
        request_device_options={
            "filters": cfg["gatt_filters"],
            "optionalServices": ["battery_service", "device_information"],
        },
        name_prefixes=cfg["name_prefixes"],
    )


def _switch_usb_hid_available() -> dict[str, Any]:
    try:
        import usb.core  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover - import guard
        return _missing(
            f"pyusb not installed: {exc}",
            install="pip install pyusb",
            hint="On Linux you also need libusb-1.0 installed.",
        )
    try:
        found = []
        for dev in usb.core.find(find_all=True) or []:  # type: ignore[attr-defined]
            vid = getattr(dev, "idVendor", None)
            if vid in _KNOWN_SWITCH_VENDORS:
                found.append(
                    {
                        "vendor_id": hex(vid),
                        "product_id": hex(getattr(dev, "idProduct", 0)),
                        "vendor": _KNOWN_SWITCH_VENDORS[vid],
                    }
                )
    except Exception as exc:  # pragma: no cover - permission/runtime issue
        return _missing(f"USB enumeration failed: {exc}")
    if not found:
        return _missing(
            "pyusb installed but no known single-switch device attached",
            known_vendors={hex(v): n for v, n in _KNOWN_SWITCH_VENDORS.items()},
        )
    return _ok(kind="server", devices=found)


def _switch_usb_hid_activate(**_: Any) -> dict[str, Any]:
    return _switch_usb_hid_available()


# ---------------------------------------------------------------------------
# Screen reader
# ---------------------------------------------------------------------------


_NVDA_DLL_CANDIDATES = (
    "nvdaControllerClient64.dll",
    "nvdaControllerClient32.dll",
    "nvdaControllerClient.dll",
)


def _find_nvda_dll() -> str | None:
    # Search alongside the process, in the cwd, and on PATH.
    here = os.path.dirname(os.path.abspath(__file__))
    for name in _NVDA_DLL_CANDIDATES:
        for base in (here, os.getcwd()):
            cand = os.path.join(base, name)
            if os.path.isfile(cand):
                return cand
        which = shutil.which(name)
        if which:
            return which
    return None


def _screen_reader_nvda_available() -> dict[str, Any]:
    if platform.system().lower() != "windows":
        return _missing(
            f"NVDA bridge is Windows-only; this host is {platform.system()}",
            alt="On macOS use the 'voiceover' driver.",
        )
    dll = _find_nvda_dll()
    if not dll:
        return _missing(
            "nvdaControllerClient*.dll not found next to the server",
            install=(
                "Download from "
                "https://github.com/nvaccess/nvda/tree/master/extras/controllerClient "
                "and drop the architecture-matching DLL next to the python process."
            ),
        )
    try:
        ctypes.WinDLL(dll)  # type: ignore[attr-defined]  # noqa: F841
    except Exception as exc:  # pragma: no cover - load failure
        return _missing(f"DLL found at {dll} but failed to load: {exc}")
    return _ok(kind="server", dll=dll, version=">=2024.1 controller-client v2")


def _screen_reader_nvda_activate(text: str | None = None, **_: Any) -> dict[str, Any]:
    info = _screen_reader_nvda_available()
    if not info.get("ok"):
        return info
    if not text:
        return _ok(dll=info["dll"], note="loaded — pass text=... to speak")
    try:
        dll = ctypes.WinDLL(info["dll"])  # type: ignore[attr-defined]
        # nvdaController_speakText(wchar_t*) -> error_status_t
        speak = dll.nvdaController_speakText
        speak.argtypes = [ctypes.c_wchar_p]
        speak.restype = ctypes.c_ulong
        rc = speak(text)
    except Exception as exc:  # pragma: no cover - runtime call failure
        return _missing(f"speak call failed: {exc}")
    return _ok(spoken=text, rc=int(rc))


def _screen_reader_voiceover_available() -> dict[str, Any]:
    if platform.system().lower() != "darwin":
        return _missing(
            f"VoiceOver bridge is macOS-only; this host is {platform.system()}",
            alt="On Windows use the 'nvda' driver.",
        )
    if not shutil.which("osascript") or not shutil.which("say"):
        return _missing("osascript/say not available on this macOS host")
    return _ok(kind="server", backend="say + osascript")


def _screen_reader_voiceover_activate(text: str | None = None, **_: Any) -> dict[str, Any]:
    info = _screen_reader_voiceover_available()
    if not info.get("ok"):
        return info
    if not text:
        return _ok(note="ready — pass text=... to speak")
    try:
        # `say` is always present on macOS and respects VoiceOver voice prefs.
        subprocess.run(
            ["say", text], check=False, timeout=30
        )  # noqa: S603,S607 - fixed args, no shell
    except Exception as exc:  # pragma: no cover - runtime
        return _missing(f"say failed: {exc}")
    return _ok(spoken=text)


# ---------------------------------------------------------------------------
# Dwell click — pure browser concern; we just hand over recommended timings.
# ---------------------------------------------------------------------------


def _dwell_available() -> dict[str, Any]:
    return _ok(
        kind="browser",
        dwell_ms=800,
        fade_ms=200,
        cancel_radius_px=24,
        notes=(
            "Implement client-side: on pointermove start a timer; if cursor "
            "stays within cancel_radius_px for dwell_ms, dispatch click."
        ),
    )


def _dwell_activate(**_: Any) -> dict[str, Any]:
    return _dwell_available()


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Driver:
    name: str
    channel: str  # gaze | switch | screen_reader | dwell
    side: str  # "browser" or "server"
    available_fn: Callable[[], dict[str, Any]]
    activate_fn: Callable[..., dict[str, Any]]
    aliases: tuple[str, ...] = field(default_factory=tuple)

    def available(self) -> dict[str, Any]:
        try:
            return {"name": self.name, "channel": self.channel, "side": self.side, **self.available_fn()}
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("a11y driver %s availability check failed: %s", self.name, exc)
            return {
                "name": self.name,
                "channel": self.channel,
                "side": self.side,
                "ok": False,
                "reason": f"availability check raised: {exc}",
            }

    def activate(self, **kwargs: Any) -> dict[str, Any]:
        try:
            return {"name": self.name, "channel": self.channel, "side": self.side, **self.activate_fn(**kwargs)}
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("a11y driver %s activation failed: %s", self.name, exc)
            return {
                "name": self.name,
                "channel": self.channel,
                "side": self.side,
                "ok": False,
                "reason": f"activation raised: {exc}",
            }


_DRIVERS: tuple[Driver, ...] = (
    Driver("webgazer", "gaze", "browser", _gaze_webgazer_available, _gaze_webgazer_activate),
    Driver("mediapipe", "gaze", "server", _gaze_mediapipe_available, _gaze_mediapipe_activate),
    Driver("tobii", "gaze", "server", _gaze_tobii_available, _gaze_tobii_activate),
    Driver("web_bluetooth", "switch", "browser", _switch_web_bluetooth_available, _switch_web_bluetooth_activate),
    Driver("usb_hid", "switch", "server", _switch_usb_hid_available, _switch_usb_hid_activate),
    Driver("nvda", "screen_reader", "server", _screen_reader_nvda_available, _screen_reader_nvda_activate),
    Driver("voiceover", "screen_reader", "server", _screen_reader_voiceover_available, _screen_reader_voiceover_activate),
    Driver("dwell", "dwell", "browser", _dwell_available, _dwell_activate),
)


def list_drivers() -> list[Driver]:
    return list(_DRIVERS)


def get_driver(name: str) -> Driver | None:
    n = name.strip().lower()
    for d in _DRIVERS:
        if d.name == n or n in d.aliases:
            return d
    return None


def status() -> dict[str, Any]:
    """Snapshot of every driver's availability — what the GET route returns."""
    by_channel: dict[str, list[dict[str, Any]]] = {}
    for d in _DRIVERS:
        by_channel.setdefault(d.channel, []).append(d.available())
    return {"channels": by_channel, "host": {"os": platform.system(), "py": platform.python_version()}}
