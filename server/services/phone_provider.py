"""Phone provider abstraction (gap #24 — phone dialer).

Tries backends in priority order:
  1. Twilio  (TWILIO_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER)
  2. Telnyx  (TELNYX_API_KEY + TELNYX_FROM_NUMBER)  — ~50% cheaper than Twilio
  3. Asterisk PJSIP local SIP server (ASTERISK_ARI_URL + ARI creds) — free if hosted

Each backend exposes the same surface:
    dial(number: str, twiml_or_text: str | None = None) -> dict
    send_sms(number: str, text: str) -> dict
    status() -> dict   # {"backend": "twilio", "configured": True}

Plug-in instructions (no code changes needed once env is set):

    # Twilio: https://console.twilio.com → Account info
    export TWILIO_SID=ACxxxxxxxx
    export TWILIO_AUTH_TOKEN=xxxxxxxx
    export TWILIO_FROM_NUMBER=+15551234567

    # Telnyx: https://portal.telnyx.com → API Keys
    export TELNYX_API_KEY=KEY01xxxxxxx
    export TELNYX_FROM_NUMBER=+15551234567

    # Asterisk (self-hosted, free):
    export ASTERISK_ARI_URL=http://localhost:8088/ari
    export ASTERISK_ARI_USER=asterisk
    export ASTERISK_ARI_PASS=changeme
    export ASTERISK_ENDPOINT=PJSIP/trunk

Pricing (June 2026):
    Twilio: voice ~$0.014/min outbound US, SMS ~$0.0083/msg
    Telnyx: voice ~$0.007/min outbound US, SIP outbound ~$0.005/min
    Asterisk PJSIP: free (you pay only your SIP trunk provider)
"""
from __future__ import annotations

import logging
import os
from typing import Any, Protocol

try:  # urllib is stdlib; keep deps zero
    from urllib import request as _urlreq
    from urllib import parse as _urlparse
    from urllib.error import URLError, HTTPError
except Exception:  # pragma: no cover
    _urlreq = None  # type: ignore

log = logging.getLogger(__name__)

E164_PREFIX = "+"
DEFAULT_TIMEOUT_S = 10.0


class PhoneBackend(Protocol):
    name: str

    def configured(self) -> bool: ...
    def dial(self, number: str, message: str | None = None) -> dict[str, Any]: ...
    def send_sms(self, number: str, text: str) -> dict[str, Any]: ...


def _normalize(number: str) -> str:
    number = (number or "").strip().replace(" ", "").replace("-", "")
    if not number:
        raise ValueError("phone number required")
    if not number.startswith(E164_PREFIX):
        # Assume US if no country code; caller should pass E.164 ideally
        if number.startswith("00"):
            number = E164_PREFIX + number[2:]
        elif len(number) == 10:
            number = E164_PREFIX + "1" + number
        else:
            number = E164_PREFIX + number
    return number


class _TwilioBackend:
    name = "twilio"

    def __init__(self) -> None:
        self.sid = os.environ.get("TWILIO_SID", "").strip()
        self.token = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
        self.from_number = os.environ.get("TWILIO_FROM_NUMBER", "").strip()

    def configured(self) -> bool:
        return bool(self.sid and self.token and self.from_number)

    def _request(self, path: str, data: dict[str, str]) -> dict[str, Any]:
        if _urlreq is None:
            return {"ok": False, "error": "urllib unavailable", "backend": self.name}
        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.sid}/{path}.json"
        body = _urlparse.urlencode(data).encode("utf-8")
        req = _urlreq.Request(url, data=body, method="POST")
        import base64
        auth = base64.b64encode(f"{self.sid}:{self.token}".encode()).decode()
        req.add_header("Authorization", f"Basic {auth}")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        try:
            with _urlreq.urlopen(req, timeout=DEFAULT_TIMEOUT_S) as resp:
                import json
                payload = json.loads(resp.read().decode("utf-8") or "{}")
            return {"ok": True, "backend": self.name, "result": payload}
        except HTTPError as exc:
            return {"ok": False, "backend": self.name, "error": f"HTTP {exc.code}", "detail": exc.read().decode("utf-8", "ignore")}
        except URLError as exc:
            return {"ok": False, "backend": self.name, "error": str(exc.reason)}

    def dial(self, number: str, message: str | None = None) -> dict[str, Any]:
        to = _normalize(number)
        twiml = message or "<Response><Say voice=\"Polly.Matthew\">Hello from JARVIS.</Say></Response>"
        return self._request(
            "Calls",
            {"To": to, "From": self.from_number, "Twiml": twiml},
        )

    def send_sms(self, number: str, text: str) -> dict[str, Any]:
        to = _normalize(number)
        return self._request(
            "Messages",
            {"To": to, "From": self.from_number, "Body": text or ""},
        )


class _TelnyxBackend:
    name = "telnyx"

    def __init__(self) -> None:
        self.key = os.environ.get("TELNYX_API_KEY", "").strip()
        self.from_number = os.environ.get("TELNYX_FROM_NUMBER", "").strip()
        self.connection_id = os.environ.get("TELNYX_CONNECTION_ID", "").strip()

    def configured(self) -> bool:
        return bool(self.key and self.from_number)

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        if _urlreq is None:
            return {"ok": False, "error": "urllib unavailable", "backend": self.name}
        import json
        url = f"https://api.telnyx.com/v2/{path}"
        body = json.dumps(payload).encode("utf-8")
        req = _urlreq.Request(url, data=body, method="POST")
        req.add_header("Authorization", f"Bearer {self.key}")
        req.add_header("Content-Type", "application/json")
        try:
            with _urlreq.urlopen(req, timeout=DEFAULT_TIMEOUT_S) as resp:
                data = json.loads(resp.read().decode("utf-8") or "{}")
            return {"ok": True, "backend": self.name, "result": data}
        except HTTPError as exc:
            return {"ok": False, "backend": self.name, "error": f"HTTP {exc.code}", "detail": exc.read().decode("utf-8", "ignore")}
        except URLError as exc:
            return {"ok": False, "backend": self.name, "error": str(exc.reason)}

    def dial(self, number: str, message: str | None = None) -> dict[str, Any]:
        to = _normalize(number)
        payload: dict[str, Any] = {"to": to, "from": self.from_number}
        if self.connection_id:
            payload["connection_id"] = self.connection_id
        return self._post("calls", payload)

    def send_sms(self, number: str, text: str) -> dict[str, Any]:
        to = _normalize(number)
        return self._post(
            "messages",
            {"to": to, "from": self.from_number, "text": text or ""},
        )


class _AsteriskBackend:
    """Asterisk ARI driver. Hits the Asterisk REST Interface (ARI).

    Requires an Asterisk install with PJSIP configured and a SIP trunk to a
    carrier (e.g. Twilio Elastic SIP, Telnyx SIP, or a local PBX). Free
    software; cost = whatever the SIP trunk charges.
    """

    name = "asterisk"

    def __init__(self) -> None:
        self.ari_url = os.environ.get("ASTERISK_ARI_URL", "").strip().rstrip("/")
        self.ari_user = os.environ.get("ASTERISK_ARI_USER", "").strip()
        self.ari_pass = os.environ.get("ASTERISK_ARI_PASS", "").strip()
        self.endpoint = os.environ.get("ASTERISK_ENDPOINT", "PJSIP/trunk").strip()
        self.context = os.environ.get("ASTERISK_CONTEXT", "from-internal").strip()

    def configured(self) -> bool:
        return bool(self.ari_url and self.ari_user and self.ari_pass)

    def _post(self, path: str, params: dict[str, str]) -> dict[str, Any]:
        if _urlreq is None:
            return {"ok": False, "error": "urllib unavailable", "backend": self.name}
        import json
        import base64
        qs = _urlparse.urlencode(params)
        url = f"{self.ari_url}{path}?{qs}"
        req = _urlreq.Request(url, method="POST")
        auth = base64.b64encode(f"{self.ari_user}:{self.ari_pass}".encode()).decode()
        req.add_header("Authorization", f"Basic {auth}")
        try:
            with _urlreq.urlopen(req, timeout=DEFAULT_TIMEOUT_S) as resp:
                payload = json.loads(resp.read().decode("utf-8") or "{}")
            return {"ok": True, "backend": self.name, "result": payload}
        except HTTPError as exc:
            return {"ok": False, "backend": self.name, "error": f"HTTP {exc.code}"}
        except URLError as exc:
            return {"ok": False, "backend": self.name, "error": str(exc.reason)}

    def dial(self, number: str, message: str | None = None) -> dict[str, Any]:
        to = _normalize(number).lstrip("+")
        return self._post(
            "/channels",
            {
                "endpoint": f"{self.endpoint}/{to}",
                "context": self.context,
                "extension": to,
                "priority": "1",
            },
        )

    def send_sms(self, number: str, text: str) -> dict[str, Any]:
        # Asterisk PJSIP can send SIP MESSAGE; depends on trunk capability.
        return {
            "ok": False,
            "backend": self.name,
            "error": "SMS via Asterisk PJSIP requires a SIP MESSAGE-capable trunk; not auto-shipped",
        }


def _pick_backend() -> PhoneBackend:
    for cls in (_TwilioBackend, _TelnyxBackend, _AsteriskBackend):
        backend = cls()
        if backend.configured():
            return backend
    # No backend configured — return a dry-run that surfaces what's missing.
    return _DryRunBackend()


class _DryRunBackend:
    name = "dry_run"

    def configured(self) -> bool:
        return False

    def dial(self, number: str, message: str | None = None) -> dict[str, Any]:
        return {
            "ok": False,
            "backend": self.name,
            "error": "no phone backend configured",
            "missing_env": ["TWILIO_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER",
                            "or TELNYX_API_KEY/TELNYX_FROM_NUMBER",
                            "or ASTERISK_ARI_URL/USER/PASS"],
            "would_dial": _normalize(number) if number else None,
        }

    def send_sms(self, number: str, text: str) -> dict[str, Any]:
        return {
            "ok": False,
            "backend": self.name,
            "error": "no phone backend configured",
            "would_send_to": _normalize(number) if number else None,
            "would_send_text": text,
        }


def get_backend() -> PhoneBackend:
    """Return the active backend (re-evaluated on each call to honor env changes)."""
    return _pick_backend()


def dial(number: str, message: str | None = None) -> dict[str, Any]:
    return get_backend().dial(number, message)


def send_sms(number: str, text: str) -> dict[str, Any]:
    return get_backend().send_sms(number, text)


def status() -> dict[str, Any]:
    backend = get_backend()
    return {
        "backend": backend.name,
        "configured": backend.configured(),
        "candidates": [
            {"name": "twilio", "configured": _TwilioBackend().configured()},
            {"name": "telnyx", "configured": _TelnyxBackend().configured()},
            {"name": "asterisk", "configured": _AsteriskBackend().configured()},
        ],
    }
