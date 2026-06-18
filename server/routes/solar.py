"""SOLAR inverter routes — fills mini-app gap #22 (Solar/Energy).

Cluster C6 product-spec skeleton. 2026 reference stacks:

  * SunSpec Modbus TCP (https://github.com/sunspec/pysunspec) — vendor-neutral
    register map supported by most modern inverters (SolarEdge, Fronius, SMA,
    Kostal, Huawei, Sungrow). Connect with pysunspec to ipaddr:502 and read
    common-model registers for AC power, lifetime kWh, DC strings, etc.
  * Enphase Envoy local API (no cloud key needed for V7+). Returns JSON over
    HTTPS at https://<envoy-ip>/production.json after token-cookie auth. See
    https://enphase.com/installers/resources/ieee-1547-2018 and community
    docs.
  * Vendor cloud APIs as fallback only — they rate-limit aggressively.

This route auto-detects the backend based on env:
  * INVERTER_KIND=sunspec  → uses pysunspec if available
  * INVERTER_KIND=enphase  → polls Envoy local endpoint
  * unset / no backend     → returns stub-pending-spec (still 200 OK)

Env reference:
  INVERTER_KIND=sunspec
  INVERTER_HOST=192.168.1.50
  INVERTER_PORT=502
  INVERTER_SLAVE_ID=1
  # or
  INVERTER_KIND=enphase
  ENVOY_HOST=192.168.1.51
  ENVOY_TOKEN=<JWT from enlighten>

Endpoints:
  GET /v1/solar/now      — instantaneous power + lifetime kWh
  GET /v1/solar/config   — what backend is wired (no secrets)
"""
from __future__ import annotations

import os
import time
from typing import Any

from fastapi import APIRouter, Depends

from ..auth import optional_bearer

router = APIRouter(prefix="/v1/solar", tags=["solar"])

_KIND = os.environ.get("INVERTER_KIND", "").strip().lower()
_HOST = os.environ.get("INVERTER_HOST", "").strip()
_PORT = int(os.environ.get("INVERTER_PORT", "502") or 502)
_SLAVE = int(os.environ.get("INVERTER_SLAVE_ID", "1") or 1)
_ENVOY = os.environ.get("ENVOY_HOST", "").strip()
_ENVOY_TOKEN = os.environ.get("ENVOY_TOKEN", "").strip()


def _read_sunspec() -> dict[str, Any]:
    """Best-effort SunSpec read. Returns stub if pysunspec missing or no inverter."""
    if not _HOST:
        return {"ok": True, "source": "stub-pending-spec", "reason": "INVERTER_HOST unset"}
    try:
        import sunspec2.modbus.client as ssclient  # type: ignore
    except Exception:  # noqa: BLE001
        try:
            import sunspec.core.client as ssclient_v1  # type: ignore

            d = ssclient_v1.SunSpecClientDevice(
                ssclient_v1.TCP, _SLAVE, ipaddr=_HOST, ipport=_PORT
            )
            d.read()
            inv = getattr(d, "inverter", None)
            if inv is None:
                return {"ok": True, "source": "stub-pending-spec",
                        "reason": "no inverter model in scan"}
            return {
                "ok": True,
                "source": "live",
                "power_w": float(getattr(inv, "W", 0) or 0),
                "lifetime_kwh": float(getattr(inv, "WH", 0) or 0) / 1000.0,
                "ac_v": float(getattr(inv, "PhVphA", 0) or 0),
                "freq_hz": float(getattr(inv, "Hz", 0) or 0),
                "temp_c": float(getattr(inv, "TmpCab", 0) or 0),
                "ts": int(time.time()),
            }
        except Exception as e:  # noqa: BLE001
            return {"ok": True, "source": "stub-pending-spec",
                    "reason": f"pysunspec not available: {e}"}
    try:
        d = ssclient.SunSpecModbusClientDeviceTCP(slave_id=_SLAVE, ipaddr=_HOST, ipport=_PORT)
        d.scan()
        # Find first inverter model (101/102/103/111/112/113).
        inv = None
        for mid in (103, 102, 101, 113, 112, 111):
            ms = d.models.get(mid)
            if ms:
                inv = ms[0]
                break
        if inv is None:
            return {"ok": True, "source": "stub-pending-spec",
                    "reason": "no inverter model in scan"}
        inv.read()
        getp = lambda k: float(getattr(inv, k).value) if hasattr(inv, k) and getattr(inv, k).value is not None else 0.0  # noqa: E731
        return {
            "ok": True,
            "source": "live",
            "power_w": getp("W"),
            "lifetime_kwh": getp("WH") / 1000.0,
            "ac_v": getp("PhVphA"),
            "freq_hz": getp("Hz"),
            "temp_c": getp("TmpCab"),
            "ts": int(time.time()),
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": True, "source": "stub-pending-spec", "reason": str(e)}


def _read_enphase() -> dict[str, Any]:
    if not _ENVOY:
        return {"ok": True, "source": "stub-pending-spec", "reason": "ENVOY_HOST unset"}
    try:
        import urllib.request
        import json
        import ssl

        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE  # Envoy uses self-signed certs
        url = f"https://{_ENVOY}/production.json"
        req = urllib.request.Request(url)
        if _ENVOY_TOKEN:
            req.add_header("Authorization", f"Bearer {_ENVOY_TOKEN}")
        with urllib.request.urlopen(req, context=ctx, timeout=5) as r:  # nosec B310
            data = json.loads(r.read().decode("utf-8"))
        prod = (data.get("production") or [{}])[0]
        return {
            "ok": True,
            "source": "live",
            "power_w": float(prod.get("wNow", 0) or 0),
            "lifetime_kwh": float(prod.get("whLifetime", 0) or 0) / 1000.0,
            "today_kwh": float(prod.get("whToday", 0) or 0) / 1000.0,
            "ts": int(time.time()),
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": True, "source": "stub-pending-spec", "reason": str(e)}


@router.get("/now")
async def solar_now(_t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    if _KIND == "sunspec":
        return _read_sunspec()
    if _KIND == "enphase":
        return _read_enphase()
    return {
        "ok": True,
        "source": "stub-pending-spec",
        "reason": "INVERTER_KIND unset (use 'sunspec' or 'enphase')",
        "ts": int(time.time()),
    }


@router.get("/config")
async def solar_config(_t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    return {
        "ok": True,
        "kind": _KIND or None,
        "host_set": bool(_HOST or _ENVOY),
        "supported": ["sunspec", "enphase"],
        "source": "live",
    }
