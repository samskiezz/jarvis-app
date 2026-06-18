"""Phone dialer route (gap #24).

Endpoints:
    POST /v1/phone/dial   {"number": "+15551234567", "message": "optional TwiML/text"}
    POST /v1/phone/sms    {"number": "+15551234567", "text": "hello"}
    GET  /v1/phone/status

Backed by server.services.phone_provider which auto-selects Twilio → Telnyx →
Asterisk based on environment variables. See the service docstring for setup.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..services import phone_provider

log = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/phone", tags=["phone"])


class DialRequest(BaseModel):
    number: str = Field(..., min_length=3, max_length=32)
    message: str | None = Field(default=None, max_length=4096)


class SmsRequest(BaseModel):
    number: str = Field(..., min_length=3, max_length=32)
    text: str = Field(..., min_length=1, max_length=1600)


@router.post("/dial")
def post_dial(req: DialRequest) -> dict[str, Any]:
    try:
        return phone_provider.dial(req.number, req.message)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    except Exception as exc:  # defensive — surface, don't crash
        log.exception("phone dial failed")
        return {"ok": False, "error": "unexpected_error", "detail": str(exc)}


@router.post("/sms")
def post_sms(req: SmsRequest) -> dict[str, Any]:
    try:
        return phone_provider.send_sms(req.number, req.text)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    except Exception as exc:
        log.exception("phone sms failed")
        return {"ok": False, "error": "unexpected_error", "detail": str(exc)}


@router.get("/status")
def get_status() -> dict[str, Any]:
    return phone_provider.status()
