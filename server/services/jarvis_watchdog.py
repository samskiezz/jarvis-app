"""JARVIS WATCHDOG — keeps the lifeline alive no matter what.

pm2 restarts a process when it CRASHES (exits), but NOT when it HANGS — alive but
no longer answering. For a disabled, vulnerable user whose entire link to the world
is this app, a hung dashboard is as deadly as a crashed one. This watchdog closes
that gap: every cycle it checks each critical service is BOTH (a) online in pm2 AND
(b) actually RESPONDING over HTTP, and restarts any that are down or hung. After any
restart it runs `pm2 save` so the reboot-resurrect snapshot stays current.

It is itself a pm2 process (so pm2 supervises the watchdog), giving defence in depth:
  pm2  -> restarts crashed processes + resurrects the fleet on reboot
  this -> catches hangs pm2 can't see + keeps the resurrect snapshot fresh

Run (registered once):
  pm2 start /opt/jarvis-app-1/.venv/bin/python --name jarvis-watchdog --no-autorestart=false \
      -- -m server.services.jarvis_watchdog
"""
from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.request

PM2 = os.environ.get("PM2_BIN", "pm2")

# (pm2 name, health_url or None).  None => pm2-online check only (no HTTP probe).
CRITICAL = [
    ("jarvis-dashboard", "http://127.0.0.1:8095/"),   # the app + the mum's lifeline UI
    ("jarvis-voiceclone", None),                      # JARVIS neural voice
    ("jarvis-tasks", None),                           # the durable build/task daemon
]

INTERVAL = 15      # seconds between checks
GRACE = 2          # consecutive bad cycles before a restart (avoids flapping)
HEARTBEAT_EVERY = 20  # log a heartbeat roughly every 20 cycles (~5 min)
STATUS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "data", "watchdog_status.json")


def _pm2_status() -> dict:
    try:
        out = subprocess.run([PM2, "jlist"], capture_output=True, text=True, timeout=20).stdout
        data = json.loads(out)
        return {p["name"]: p["pm2_env"]["status"] for p in data}
    except Exception as e:  # noqa: BLE001
        print(f"[watchdog] pm2 jlist failed: {str(e)[:100]}", flush=True)
        return {}


def _responding(url: str | None) -> bool:
    if not url:
        return True
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            return 200 <= getattr(r, "status", 200) < 500
    except Exception:  # noqa: BLE001
        return False


def _restart(name: str) -> bool:
    try:
        subprocess.run([PM2, "restart", name], capture_output=True, text=True, timeout=45)
        print(f"[watchdog] RESTARTED {name}", flush=True)
        subprocess.run([PM2, "save"], capture_output=True, text=True, timeout=25)
        return True
    except Exception as e:  # noqa: BLE001
        print(f"[watchdog] restart {name} failed: {str(e)[:100]}", flush=True)
        return False


def _write_status(states: dict, beat: int) -> None:
    try:
        os.makedirs(os.path.dirname(STATUS_FILE), exist_ok=True)
        with open(STATUS_FILE, "w") as f:
            json.dump({"ts": int(time.time()), "cycle": beat, "services": states}, f)
    except Exception:  # noqa: BLE001
        pass


def main() -> None:
    print("[watchdog] online — guarding the lifeline (dashboard / voiceclone / tasks); "
          "catches HANGS pm2 can't, keeps `pm2 save` fresh", flush=True)
    bad = {name: 0 for name, _ in CRITICAL}
    beat = 0
    while True:
        states = {}
        try:
            status = _pm2_status()
            for name, url in CRITICAL:
                online = status.get(name) == "online"
                healthy = online and _responding(url)
                states[name] = {"online": online, "healthy": healthy}
                if healthy:
                    bad[name] = 0
                else:
                    bad[name] += 1
                    print(f"[watchdog] {name} UNHEALTHY (pm2_online={online}) — strike {bad[name]}/{GRACE}",
                          flush=True)
                    if bad[name] >= GRACE:
                        _restart(name)
                        bad[name] = 0
            beat += 1
            _write_status(states, beat)
            if beat % HEARTBEAT_EVERY == 0:
                print(f"[watchdog] heartbeat — all guarded ({beat} cycles)", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"[watchdog] loop error: {str(e)[:120]}", flush=True)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
