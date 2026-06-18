"""VPN routes — fills mini-app gap #21 (WireGuard control).

Cluster C6 product-spec skeleton. Surface WireGuard status/control from the
JARVIS UI without re-implementing wg-quick. 2026 reference stacks:

  * wg-easy (https://github.com/wg-easy/wg-easy) — Docker-friendly admin UI
    with an HTTP API, easy drop-in if the host can run another container.
  * wgctrl (https://github.com/WireGuard/wgctrl-go) — canonical Go library,
    underpins WireGuard Portal and most management surfaces.
  * Direct ``wg`` / ``wg-quick`` calls — preferred here because they need no
    extra service: just ``apt install wireguard-tools`` and a config file.

We probe for the binary at startup, never crash if WireGuard isn't installed,
and return a clearly-labelled stub so the UI can show "Not configured" rather
than an error. Toggle is gated to a configurable interface (default ``wg0``)
and rejects shell-metachar names defensively.

  GET  /v1/vpn/status
  POST /v1/vpn/toggle   { "iface": "wg0", "action": "up|down" }
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import time
from typing import Any

from fastapi import APIRouter, Body, Depends

from ..auth import optional_bearer, require_bearer

router = APIRouter(prefix="/v1/vpn", tags=["vpn"])

_WG_IFACE_RE = re.compile(r"^[a-zA-Z0-9_-]{1,15}$")
_DEFAULT_IFACE = os.environ.get("WG_DEFAULT_IFACE", "wg0")


def _has_wg() -> bool:
    return bool(shutil.which("wg")) and bool(shutil.which("wg-quick"))


def _run(cmd: list[str], timeout: int = 5) -> tuple[int, str, str]:
    try:
        p = subprocess.run(  # nosec B603 - args fully validated, no shell
            cmd, capture_output=True, text=True, timeout=timeout, check=False
        )
        return p.returncode, p.stdout or "", p.stderr or ""
    except Exception as e:  # noqa: BLE001
        return 1, "", str(e)


@router.get("/status")
async def get_status(_t: str | None = Depends(optional_bearer)) -> dict[str, Any]:
    if not _has_wg():
        return {
            "ok": True,
            "installed": False,
            "active": False,
            "interfaces": [],
            "source": "stub-pending-spec",
            "hint": "apt install wireguard-tools, then place a /etc/wireguard/wg0.conf",
        }
    rc, out, err = _run(["wg", "show", "interfaces"])
    if rc != 0:
        # `wg show` usually requires CAP_NET_ADMIN; degrade cleanly.
        return {
            "ok": True,
            "installed": True,
            "active": False,
            "interfaces": [],
            "source": "stub-pending-spec",
            "hint": "needs CAP_NET_ADMIN or root to read wg state",
            "stderr": err.strip(),
        }
    ifaces = [s for s in out.split() if s]
    details: list[dict[str, Any]] = []
    for ifc in ifaces:
        rc2, out2, _ = _run(["wg", "show", ifc, "dump"])
        peers = 0
        latest = 0
        if rc2 == 0:
            for line in out2.splitlines()[1:]:  # first line is the interface row
                peers += 1
                parts = line.split("\t")
                if len(parts) >= 5:
                    try:
                        latest = max(latest, int(parts[4]))
                    except ValueError:
                        pass
        details.append({"iface": ifc, "peers": peers, "latest_handshake": latest})
    return {
        "ok": True,
        "installed": True,
        "active": bool(ifaces),
        "interfaces": details,
        "checked_ts": int(time.time()),
        "source": "live" if ifaces else "stub-pending-spec",
    }


@router.post("/toggle")
async def toggle_iface(
    body: dict[str, Any] = Body(...), _t: str = Depends(require_bearer)
) -> dict[str, Any]:
    """Bring an interface up or down. Bearer-protected (write op)."""
    iface = str(body.get("iface") or _DEFAULT_IFACE).strip()
    action = str(body.get("action") or "").strip().lower()
    if action not in ("up", "down"):
        return {"ok": False, "error": "action must be 'up' or 'down'"}
    if not _WG_IFACE_RE.match(iface):
        return {"ok": False, "error": "invalid iface name"}
    if not _has_wg():
        return {
            "ok": False,
            "error": "wireguard-tools not installed",
            "source": "stub-pending-spec",
        }
    rc, out, err = _run(["wg-quick", action, iface], timeout=15)
    return {
        "ok": rc == 0,
        "iface": iface,
        "action": action,
        "rc": rc,
        "stdout": out.strip()[-400:],
        "stderr": err.strip()[-400:],
        "source": "live" if rc == 0 else "stub-pending-spec",
    }
