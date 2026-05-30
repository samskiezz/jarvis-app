"""WhatsApp approval channel for APEX Forge.

Sends an approval request for a proposed change and parses the human's reply.
Two real providers (pick via FORGE_WHATSAPP_PROVIDER) plus a console fallback so
it runs with no credentials:

  * twilio  — Twilio WhatsApp API (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
               TWILIO_WHATSAPP_FROM, e.g. "whatsapp:+14155238886")
  * meta    — WhatsApp Cloud API (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)
  * console — prints the message (default when nothing is configured)

The user approves from their phone by replying e.g. "APPROVE a1b2" or "YES a1b2"
(or just "APPROVE" when one change is pending). The webhook turns that into a
merge.
"""

from __future__ import annotations

import os
import re

try:
    import requests
except Exception:  # pragma: no cover
    requests = None  # type: ignore

_APPROVE_WORDS = {"approve", "yes", "y", "ok", "lgtm", "ship", "merge", "👍", "✅"}
_REJECT_WORDS = {"reject", "no", "n", "cancel", "discard", "stop", "👎", "❌"}


def build_request_text(change) -> str:
    """A concise, phone-friendly approval prompt with a diff preview."""
    files = ", ".join(os.path.basename(f) for f in change.files[:6])
    if len(change.files) > 6:
        files += f" (+{len(change.files) - 6} more)"
    diff_preview = change.diff.strip()
    if len(diff_preview) > 1200:
        diff_preview = diff_preview[:1200] + "\n… (truncated)"
    return (
        f"🔥 APEX Forge change {change.id}\n"
        f"Branch: {change.branch} → {change.base}\n"
        f"Files: {files}\n"
        f"{change.summary}\n\n"
        f"{diff_preview}\n\n"
        f"Reply: APPROVE {change.id}  or  REJECT {change.id}"
    )


def parse_decision(text: str) -> tuple[str | None, str | None]:
    """Parse an inbound reply into (decision, change_id).

    decision ∈ {"approve","reject",None}. change_id may be None (caller can fall
    back to the single pending change).
    """
    if not text:
        return None, None
    tokens = re.findall(r"[A-Za-z0-9👍✅👎❌]+", text.strip().lower())
    if not tokens:
        return None, None
    decision = None
    change_id = None
    for tok in tokens:
        if tok in _APPROVE_WORDS and decision is None:
            decision = "approve"
        elif tok in _REJECT_WORDS and decision is None:
            decision = "reject"
        elif re.fullmatch(r"[0-9a-f]{8}", tok):
            change_id = tok
    return decision, change_id


class ConsoleNotifier:
    name = "console"

    def send(self, text: str) -> bool:
        print("[forge:whatsapp:console]\n" + text, flush=True)
        return True


class TwilioNotifier:
    name = "twilio"

    def __init__(self):
        self.sid = os.environ["TWILIO_ACCOUNT_SID"]
        self.token = os.environ["TWILIO_AUTH_TOKEN"]
        self.from_ = os.environ["TWILIO_WHATSAPP_FROM"]
        self.to = os.environ["FORGE_WHATSAPP_TO"]

    def send(self, text: str) -> bool:
        if requests is None:
            return False
        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.sid}/Messages.json"
        data = {"From": self.from_, "To": _wa(self.to), "Body": text}
        try:
            r = requests.post(url, data=data, auth=(self.sid, self.token), timeout=20)
            return r.status_code < 300
        except Exception:
            return False


class MetaNotifier:
    name = "meta"

    def __init__(self):
        self.token = os.environ["WHATSAPP_TOKEN"]
        self.phone_id = os.environ["WHATSAPP_PHONE_NUMBER_ID"]
        self.to = os.environ["FORGE_WHATSAPP_TO"]
        self.api = os.environ.get("WHATSAPP_API_BASE", "https://graph.facebook.com/v20.0")

    def send(self, text: str) -> bool:
        if requests is None:
            return False
        url = f"{self.api}/{self.phone_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "to": self.to.lstrip("+").replace("whatsapp:", ""),
            "type": "text",
            "text": {"body": text},
        }
        try:
            r = requests.post(url, json=payload,
                              headers={"Authorization": f"Bearer {self.token}"}, timeout=20)
            return r.status_code < 300
        except Exception:
            return False


def _wa(num: str) -> str:
    return num if num.startswith("whatsapp:") else f"whatsapp:{num}"


def from_env():
    provider = os.environ.get("FORGE_WHATSAPP_PROVIDER", "").lower()
    try:
        if provider == "twilio":
            return TwilioNotifier()
        if provider == "meta":
            return MetaNotifier()
    except KeyError as exc:  # missing credential → fail safe to console
        print(f"[forge] WhatsApp provider {provider!r} missing env {exc}; using console", flush=True)
    return ConsoleNotifier()
