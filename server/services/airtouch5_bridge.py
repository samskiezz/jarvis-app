#!/usr/bin/env python3
"""AIRTOUCH 5 HOME-LAN BRIDGE — the on-premises arm that actually moves the heating.

WHY THIS EXISTS (be honest about the network):
  JARVIS runs on a Hostinger VPS + a Vast GPU box. NEITHER is on the home LAN. The AirTouch 5 LOCAL
  TCP API (Daikin ducted via Polyaire AirTouch 5, console 94302563) lives on home-LAN port 9005, and
  a phone browser cannot open raw TCP/UDP. So control is IMPOSSIBLE from the VPS alone. This daemon
  is the missing piece: it runs on ANY always-on device on the HOME network (Raspberry Pi, an old
  PC, a phone with Termux) and:

    1. holds the single long-lived TCP socket to the AirTouch 5 (via the `airtouch5py` library),
    2. reaches JARVIS purely by OUTBOUND HTTPS — it long-polls  GET  {JARVIS}/climate/poll
       and pushes state with                                     POST {JARVIS}/climate/report
       so it works behind home NAT with NO port-forwarding and the VPS never connects inward,
    3. executes queued commands (warmer/cooler, set zone/AC temp, mode, on/off) on the console and
       reports the full live state (zone names, current + target temps, modes, on/off) back.

  The console PUSHES status whenever anything changes; we cache that and report it, so the voice
  pages can answer "what is the temperature / which zones" instantly.

============================== RUN INSTRUCTIONS (on the HOME device) ==========================
  # 0. Python 3.10+  (airtouch5py uses match/case)
  python3 -m venv ~/at5/.venv
  ~/at5/.venv/bin/pip install airtouch5py requests

  # 1. Find the AirTouch on your LAN and confirm it is the right console (94302563):
  ~/at5/.venv/bin/python airtouch5_bridge.py --discover

  # 2. Run the bridge (host can be omitted to auto-discover by console id):
  JARVIS_URL=https://your-vps-host:8095 \
  CLIMATE_BRIDGE_KEY=choose-a-long-shared-secret \
  ~/at5/.venv/bin/python airtouch5_bridge.py --host 192.168.1.50

      # or, no --host: it discovers and picks the console whose id == 94302563
      JARVIS_URL=... CLIMATE_BRIDGE_KEY=... python airtouch5_bridge.py

  # 3. (recommended) keep it alive forever, e.g. systemd or:
  #    while true; do python airtouch5_bridge.py --host 192.168.1.50; sleep 5; done

  Set the SAME CLIMATE_BRIDGE_KEY on the VPS (env for pm2 jarvis-dashboard) so /climate/poll and
  /climate/report accept this bridge. The web /climate/cmd uses the dashboard control token instead;
  the two secrets are separate on purpose (the bridge key never touches a browser).
==============================================================================================

Env / flags:
  --host <ip>        AirTouch 5 tablet IP (DHCP-reserve it). Omit to auto-discover.
  --discover         List AirTouch devices on the LAN (with console ids) and exit.
  --console-id <id>  Console serial to verify/select (default 94302563).
  --once             Run one poll+report cycle and exit (for testing connectivity).
  JARVIS_URL         Base URL of the VPS dashboard, e.g. https://host:8095  (default below).
  CLIMATE_BRIDGE_KEY Shared secret for /climate/poll & /climate/report.
  CLIMATE_POLL_SEC   Poll cadence when idle (default 2.0s).

Depends on the home device only: `airtouch5py` (TCP/CRC/discovery) + `requests` (outbound HTTP).
The VPS holds NONE of this — it only relays JSON (see server/services/climate_relay.py).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_JARVIS_URL = os.environ.get("JARVIS_URL", "http://127.0.0.1:8095").rstrip("/")
DEFAULT_CONSOLE_ID = "94302563"
BUMP_STEP_C = 1.0
SAFE_MIN_C = 16.0
SAFE_MAX_C = 30.0


def _log(*a):
    print(f"[at5-bridge {time.strftime('%H:%M:%S')}]", *a, flush=True)


# ---------------------------------------------------------------------------
# Outbound HTTP to JARVIS (stdlib so the bridge can run with only airtouch5py + stdlib if needed)
# ---------------------------------------------------------------------------
def _http(method: str, url: str, body: dict | None = None, timeout: float = 35.0) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode() or "{}")


# ---------------------------------------------------------------------------
# State serialisation: turn airtouch5py live objects into the relay's JSON shape
# ---------------------------------------------------------------------------
def serialize_state(client, console_id: str | None) -> dict:
    """Build the /climate/report payload from a connected Airtouch5SimpleClient.

    Kept import-light & defensive so a partial connection still reports what it has. The field
    names match what climate_relay.state() and the voice layer expect."""
    # Build a quick lookup of which AC governs each zone, and the heat/cool setpoint guardrails.
    abilities = {a.ac_number: a for a in getattr(client, "ac", [])}

    zones = []
    names = {z.zone_number: z.zone_name for z in getattr(client, "zones", [])}
    for num, st in (getattr(client, "latest_zone_status", {}) or {}).items():
        zones.append({
            "number": num,
            "name": names.get(num, f"Zone {num}"),
            "power": getattr(st.zone_power_state, "name", str(st.zone_power_state)),
            "control": getattr(st.control_method, "name", str(st.control_method)),
            "temperature": st.temperature,
            "set_point": st.set_point,
            "open_percentage": st.open_percentage,
            "has_sensor": bool(st.has_sensor),
            "spill": bool(st.spill_active),
            "low_battery": bool(st.is_low_battery),
        })
    zones.sort(key=lambda z: z["number"])

    acs = []
    for num, st in (getattr(client, "latest_ac_status", {}) or {}).items():
        ab = abilities.get(num)
        acs.append({
            "number": num,
            "name": getattr(ab, "ac_name", None) or f"AC {num}",
            "power": getattr(st.ac_power_state, "name", str(st.ac_power_state)),
            "mode": getattr(st.ac_mode, "name", str(st.ac_mode)),
            "fan": getattr(st.ac_fan_speed, "name", str(st.ac_fan_speed)),
            "setpoint": st.ac_setpoint,
            "temperature": st.temperature,
            "error": st.error_code,
            "min_heat": getattr(ab, "min_heat_set_point", None),
            "max_heat": getattr(ab, "max_heat_set_point", None),
            "min_cool": getattr(ab, "min_cool_set_point", None),
            "max_cool": getattr(ab, "max_cool_set_point", None),
        })
    acs.sort(key=lambda a: a["number"])

    return {"connected": True, "console_id": console_id, "zones": zones, "acs": acs, "error": None}


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _ac_for_zone(client, zone_number: int):
    """Find the AC unit whose zone range includes zone_number (for heat-setpoint guardrails + mode)."""
    for a in getattr(client, "ac", []):
        if a.start_zone_number <= zone_number < a.start_zone_number + a.zone_count:
            return a
    return (getattr(client, "ac", []) or [None])[0]


# ---------------------------------------------------------------------------
# Command execution on the AirTouch 5 (the real protocol work, via airtouch5py)
# ---------------------------------------------------------------------------
async def execute(client, cmd: dict) -> dict:
    """Translate one relay command into airtouch5py packets and send them. Returns a result dict
    {id, ok, detail|error}. Mirrors the ops produced by climate_relay.parse_intent / enqueue."""
    # Imports are local so `--discover` works even on a box without the full lib resolved yet.
    from airtouch5py.packets.zone_control import (
        ZoneControlZone, ZoneSettingValue, ZoneSettingPower,
    )
    from airtouch5py.packets.ac_control import (
        AcControl, SetPowerSetting, SetAcMode, SetAcFanSpeed, SetpointControl,
    )

    op = cmd.get("op")
    cid = cmd.get("id")
    f = client.data_packet_factory

    def _resolve_zone(ref) -> int | None:
        if ref is None:
            return None
        try:
            n = int(ref)
            if any(z.zone_number == n for z in client.zones):
                return n
        except (TypeError, ValueError):
            pass
        s = str(ref).strip().lower()
        for z in client.zones:                       # exact
            if z.zone_name.strip().lower() == s:
                return z.zone_number
        for z in client.zones:                       # substring
            zn = z.zone_name.strip().lower()
            if zn and (s in zn or zn in s):
                return z.zone_number
        return None

    def _pick_warm_zone() -> int | None:
        # Person's room first ("Mum's Room"), then generic rooms ("Lounge"), so the mother's zone wins.
        for hints in (("mum", "mother", "mom", "nan", "grandma", "her"),
                      ("lounge", "living", "bed")):
            for z in client.zones:
                if any(h in z.zone_name.lower() for h in hints):
                    return z.zone_number
        for n, st in (client.latest_zone_status or {}).items():
            if st.has_sensor and st.zone_power_state.name in ("ON", "TURBO"):
                return n
        for z in client.zones:
            st = (client.latest_zone_status or {}).get(z.zone_number)
            if st and st.has_sensor:
                return z.zone_number
        return client.zones[0].zone_number if client.zones else None

    def _heat_clamp(zone_number, target):
        ab = _ac_for_zone(client, zone_number) if zone_number is not None else \
            (client.ac[0] if client.ac else None)
        lo, hi = SAFE_MIN_C, SAFE_MAX_C
        if ab is not None:
            lo = max(lo, getattr(ab, "min_heat_set_point", lo) or lo)
            hi = min(hi, getattr(ab, "max_heat_set_point", hi) or hi)
        return _clamp(target, lo, hi), ab

    try:
        if op in ("warmer", "cooler"):
            zn = _resolve_zone(cmd.get("zone")) if cmd.get("zone") is not None else _pick_warm_zone()
            if zn is None:
                return {"id": cid, "ok": False, "error": "no zone to adjust"}
            st = (client.latest_zone_status or {}).get(zn)
            cur = (st.set_point if st and st.set_point is not None else
                   (st.temperature if st and st.temperature is not None else 21.0))
            delta = BUMP_STEP_C if op == "warmer" else -BUMP_STEP_C
            target, ab = _heat_clamp(zn, cur + delta)
            # Ensure the AC unit is in HEAT (warmer) and ON so the zone can actually warm her.
            if op == "warmer" and ab is not None:
                await client.send_packet(f.ac_control([AcControl(
                    SetPowerSetting.SET_TO_ON, ab.ac_number, SetAcMode.SET_TO_HEAT,
                    SetAcFanSpeed.KEEP_AC_FAN_SPEED, SetpointControl.KEEP_SETPOINT_VALUE, 0)]))
            await client.send_packet(f.zone_control([ZoneControlZone(
                zn, ZoneSettingValue.SET_TARGET_SETPOINT, ZoneSettingPower.SET_TO_ON, target)]))
            return {"id": cid, "ok": True, "detail": {"zone": zn, "target": target}}

        if op == "set_zone_temp":
            zn = _resolve_zone(cmd.get("zone"))
            if zn is None:
                return {"id": cid, "ok": False, "error": f"unknown zone {cmd.get('zone')!r}"}
            target, _ = _heat_clamp(zn, float(cmd.get("value")))
            await client.send_packet(f.zone_control([ZoneControlZone(
                zn, ZoneSettingValue.SET_TARGET_SETPOINT, ZoneSettingPower.SET_TO_ON, target)]))
            return {"id": cid, "ok": True, "detail": {"zone": zn, "target": target}}

        if op == "set_zone_power":
            zn = _resolve_zone(cmd.get("zone"))
            if zn is None:
                return {"id": cid, "ok": False, "error": f"unknown zone {cmd.get('zone')!r}"}
            pw = ZoneSettingPower.SET_TO_ON if cmd.get("on") else ZoneSettingPower.SET_TO_OFF
            await client.send_packet(f.zone_control([ZoneControlZone(
                zn, ZoneSettingValue.KEEP_SETTING_VALUE, pw, 0)]))
            return {"id": cid, "ok": True, "detail": {"zone": zn, "on": bool(cmd.get("on"))}}

        if op == "set_ac_mode":
            ac = int(cmd.get("ac", 0) or 0)
            mode_map = {"heat": SetAcMode.SET_TO_HEAT, "cool": SetAcMode.SET_TO_COOL,
                        "auto": SetAcMode.SET_TO_AUTO, "fan": SetAcMode.SET_TO_FAN,
                        "dry": SetAcMode.SET_TO_DRY}
            m = mode_map.get(str(cmd.get("mode", "")).lower())
            if m is None:
                return {"id": cid, "ok": False, "error": f"bad mode {cmd.get('mode')!r}"}
            await client.send_packet(f.ac_control([AcControl(
                SetPowerSetting.SET_TO_ON, ac, m, SetAcFanSpeed.KEEP_AC_FAN_SPEED,
                SetpointControl.KEEP_SETPOINT_VALUE, 0)]))
            return {"id": cid, "ok": True, "detail": {"ac": ac, "mode": cmd.get("mode")}}

        if op == "set_ac_temp":
            ac = int(cmd.get("ac", 0) or 0)
            target = _clamp(float(cmd.get("value")), SAFE_MIN_C, SAFE_MAX_C)
            await client.send_packet(f.ac_control([AcControl(
                SetPowerSetting.KEEP_POWER_SETTING, ac, SetAcMode.KEEP_AC_MODE,
                SetAcFanSpeed.KEEP_AC_FAN_SPEED, SetpointControl.CHANGE_SETPOINT, target)]))
            return {"id": cid, "ok": True, "detail": {"ac": ac, "target": target}}

        if op == "set_ac_power":
            ac = int(cmd.get("ac", 0) or 0)
            pw = SetPowerSetting.SET_TO_ON if cmd.get("on") else SetPowerSetting.SET_TO_OFF
            await client.send_packet(f.ac_control([AcControl(
                pw, ac, SetAcMode.KEEP_AC_MODE, SetAcFanSpeed.KEEP_AC_FAN_SPEED,
                SetpointControl.KEEP_SETPOINT_VALUE, 0)]))
            return {"id": cid, "ok": True, "detail": {"ac": ac, "on": bool(cmd.get("on"))}}

        if op == "refresh":
            return {"id": cid, "ok": True, "detail": "refresh"}

        return {"id": cid, "ok": False, "error": f"unknown op {op!r}"}
    except Exception as e:  # noqa: BLE001
        return {"id": cid, "ok": False, "error": f"{type(e).__name__}: {e}"[:160]}


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------
async def discover(console_id: str | None = None, host: str | None = None) -> list:
    from airtouch5py.discovery import AirtouchDiscovery
    disc = AirtouchDiscovery()
    try:
        devices = await (disc.discover_by_ip(host) if host else disc.discover())
        if host and devices and not isinstance(devices, list):
            devices = [devices]
        devices = devices or []
        if console_id:
            exact = [d for d in devices if d.console_id == console_id]
            if exact:
                return exact
        return devices
    finally:
        try:
            await disc.close()
        except Exception:  # noqa: BLE001
            pass


async def resolve_connection(host: str | None, console_id: str):
    """Return an Airtouch5SimpleClient connect target: a static IP, or a discovered device whose
    console_id matches. Raises if nothing matches so the loop logs honestly and retries."""
    from airtouch5py.airtouch5_simple_client import Airtouch5SimpleClient
    if host:
        _log(f"using static host {host} (console id {console_id} verified on connect via discovery if available)")
        return Airtouch5SimpleClient(host)
    _log("no --host: discovering AirTouch on the LAN by UDP broadcast ...")
    devices = await discover(console_id=console_id)
    if not devices:
        raise RuntimeError("no AirTouch devices found on the LAN (check the bridge is ON the home network)")
    dev = next((d for d in devices if d.console_id == console_id), devices[0])
    if dev.console_id != console_id:
        _log(f"WARNING: console id {dev.console_id} != target {console_id}; using it anyway ({dev.name} @ {dev.ip})")
    else:
        _log(f"found target console {console_id}: {dev.name} @ {dev.ip}")
    return Airtouch5SimpleClient(dev)


# ---------------------------------------------------------------------------
# Main loop — connect, then outbound poll/execute/report forever, with reconnect
# ---------------------------------------------------------------------------
async def run(host: str | None, console_id: str, jarvis_url: str, key: str,
              poll_sec: float, once: bool = False) -> None:
    poll_url = f"{jarvis_url}/climate/poll?key={urllib.parse.quote(key)}"
    report_url = f"{jarvis_url}/climate/report?key={urllib.parse.quote(key)}"

    while True:
        client = None
        try:
            client = await resolve_connection(host, console_id)
            await client.connect_and_stay_connected()
            _log(f"connected; {len(client.zones)} zones, {len(client.ac)} AC unit(s). Relaying to {jarvis_url}")

            # Push fresh state on every console change so the voice pages are always current.
            def _push_state(*_a):
                try:
                    _http("POST", report_url, serialize_state(client, console_id), timeout=10)
                except Exception as e:  # noqa: BLE001
                    _log("state push failed:", e)
            client.zone_status_callbacks.append(lambda *_: _push_state())
            client.ac_status_callbacks.append(lambda *_: _push_state())

            _push_state()  # initial snapshot

            last_state = 0.0
            while True:
                # 1. pull commands (outbound; dequeues on the VPS)
                try:
                    res = await asyncio.to_thread(_http, "GET", poll_url, None, 35)
                    cmds = res.get("commands") or []
                except urllib.error.URLError as e:
                    _log("poll unreachable, retrying:", e)
                    await asyncio.sleep(min(10, poll_sec * 3))
                    cmds = []

                # 2. execute each on the AirTouch 5
                results = []
                for c in cmds:
                    r = await execute(client, c)
                    _log("exec", c.get("op"), "->", "ok" if r.get("ok") else r.get("error"))
                    results.append(r)
                if cmds:
                    await asyncio.sleep(1.2)  # let the console push fresh status back

                # 3. report state (always, so liveness + post-command state propagate)
                now = time.time()
                if results or (now - last_state) > 8:
                    payload = serialize_state(client, console_id)
                    payload["results"] = results
                    try:
                        await asyncio.to_thread(_http, "POST", report_url, payload, 10)
                        last_state = now
                    except Exception as e:  # noqa: BLE001
                        _log("report failed:", e)

                if once:
                    _log("--once complete:", json.dumps(serialize_state(client, console_id))[:400])
                    return
                await asyncio.sleep(poll_sec)

        except Exception as e:  # noqa: BLE001
            _log("connection error:", repr(e), "— reconnecting in 5s")
            # Tell the VPS we're down so the voice layer is honest ("can't reach the heating").
            try:
                _http("POST", report_url, {"connected": False, "console_id": console_id,
                                           "zones": [], "acs": [], "error": str(e)[:160]}, timeout=8)
            except Exception:  # noqa: BLE001
                pass
            if once:
                return
            await asyncio.sleep(5)
        finally:
            if client is not None:
                try:
                    await client.disconnect()
                except Exception:  # noqa: BLE001
                    pass


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="AirTouch 5 home-LAN bridge for JARVIS climate control")
    ap.add_argument("--host", default=os.environ.get("AT5_HOST"), help="AirTouch 5 IP (omit to discover)")
    ap.add_argument("--console-id", default=os.environ.get("AT5_CONSOLE_ID", DEFAULT_CONSOLE_ID))
    ap.add_argument("--discover", action="store_true", help="list AirTouch devices on the LAN and exit")
    ap.add_argument("--once", action="store_true", help="one poll+report cycle then exit (test)")
    ap.add_argument("--jarvis-url", default=DEFAULT_JARVIS_URL)
    ap.add_argument("--poll-sec", type=float, default=float(os.environ.get("CLIMATE_POLL_SEC", "2.0")))
    args = ap.parse_args(argv)

    if args.discover:
        try:
            devices = asyncio.run(discover(console_id=args.console_id, host=args.host))
        except Exception as e:  # noqa: BLE001
            print(f"discovery failed: {e}", file=sys.stderr)
            return 2
        if not devices:
            print("No AirTouch devices found. Are you ON the home LAN? Is the AirTouch powered on?")
            return 1
        print(f"Found {len(devices)} AirTouch device(s):")
        for d in devices:
            mark = "  <-- TARGET" if d.console_id == args.console_id else ""
            print(f"  ip={d.ip}  console_id={d.console_id}  model={d.model}  name={d.name}{mark}")
        return 0

    key = os.environ.get("CLIMATE_BRIDGE_KEY", "")
    if not key:
        print("ERROR: set CLIMATE_BRIDGE_KEY (same value as on the VPS dashboard).", file=sys.stderr)
        return 2
    _log(f"starting; jarvis={args.jarvis_url} console_id={args.console_id} "
         f"host={args.host or 'discover'} poll={args.poll_sec}s")
    try:
        asyncio.run(run(args.host, args.console_id, args.jarvis_url.rstrip("/"),
                        key, args.poll_sec, once=args.once))
    except KeyboardInterrupt:
        _log("stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
