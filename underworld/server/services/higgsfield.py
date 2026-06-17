"""Async Higgsfield client supporting both:
- Legacy Pixazo gateway (single Ocp-Apim-Subscription-Key or session cookie)
- Higgsfield platform API v2 (KEY_ID + KEY_SECRET, Authorization: Key ...)

Exposes image/video generation, motion listing, request cancellation, and
result-URL extraction. All functions return a plain dict so callers can mock
or inspect them easily.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import structlog

from underworld.server.config import get_settings

log = structlog.get_logger(__name__)


def uses_v2() -> bool:
    """True when KEY_ID + KEY_SECRET are configured (platform API v2)."""
    settings = get_settings()
    return bool(settings.higgsfield_key_id and settings.higgsfield_key_secret)


def _headers(credential: str | None = None, mode: str = "api") -> dict[str, str]:
    settings = get_settings()
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if uses_v2():
        headers["Authorization"] = f"Key {settings.higgsfield_key_id}:{settings.higgsfield_key_secret}"
        return headers
    cred = credential or settings.higgsfield_credential
    if mode == "api":
        headers["Ocp-Apim-Subscription-Key"] = cred
    else:
        headers["Cookie"] = cred
    return headers


def _base_url() -> str:
    settings = get_settings()
    return settings.higgsfield_base_url if uses_v2() else "https://gateway.pixazo.ai"


def _legacy_submit_url(kind: str) -> str:
    settings = get_settings()
    return (
        settings.higgsfield_video_gateway
        if kind == "video"
        else settings.higgsfield_image_gateway
    )


def _v2_image_endpoint(model: str | None) -> str:
    """Map an image model hint to a v2 endpoint path."""
    settings = get_settings()
    model = model or settings.higgsfield_model_image
    if model and model.startswith("/v1/"):
        return model
    # Default and known image endpoints.
    if model in ("soul", "higgsfield-ai/soul/standard"):
        return "/v1/text2image/soul"
    if model and "seedream" in model.lower():
        return "/v1/text2image/seedream"
    if model and "nano-banana" in model.lower():
        return "/v1/text2image/nano-banana"
    return "/v1/text2image/soul"


def _v2_video_endpoint(model: str | None) -> tuple[str, str]:
    """Return (endpoint_path, normalized_model) for a video model hint."""
    settings = get_settings()
    model = model or settings.higgsfield_model_video
    if model and model.startswith("/v1/"):
        return model, model.rstrip("/").split("/")[-1]
    # DoP models map to the dedicated DoP endpoint.
    if model in ("dop-lite", "dop-preview", "dop-turbo"):
        return "/v1/image2video/dop", model
    # Kling and most others use the generic image2video endpoint.
    # Valid values per live API: "kling-v2-1" or "kling-v2-1-master".
    if model in ("kling-v2-1", "kling-v2-1-master"):
        return "/v1/image2video/kling", model
    return "/v1/image2video/kling", model or "kling-v2-1"


def request_id_from_response(data: dict[str, Any]) -> str | None:
    """Best-effort extraction of a request id from a submission response."""
    if not isinstance(data, dict):
        return None
    for key in ("request_id", "id", "task_id", "job_id"):
        if key in data and data[key]:
            return str(data[key])
    nested = data.get("data") or data.get("result") or data.get("output")
    if isinstance(nested, dict):
        return request_id_from_response(nested)
    return None


async def _request(
    method: str,
    url: str,
    payload: dict[str, Any] | None = None,
    credential: str | None = None,
    mode: str = "api",
    timeout: int | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    timeout_s = timeout or settings.higgsfield_timeout_s
    headers = _headers(credential, mode)
    last_error: Exception | None = None

    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=timeout_s) as client:
                if method.upper() == "GET":
                    resp = await client.get(url, headers=headers)
                else:
                    resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                return {"ok": True, "data": data}
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            detail = exc.response.text[:800]
            if status in (429, 502, 503, 504):
                last_error = exc
                log.warning(
                    "higgsfield.transient_error",
                    status=status,
                    attempt=attempt,
                    detail=detail,
                )
                await asyncio.sleep(1.5 * (attempt + 1))
                continue
            return {"ok": False, "error": f"HTTP {status}", "detail": detail}
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            log.warning("higgsfield.request_error", attempt=attempt, error=str(exc))
            await asyncio.sleep(1.0 * (attempt + 1))

    return {"ok": False, "error": f"failed after retries: {last_error}"}


def _build_v2_image_payload(
    prompt: str,
    *,
    model: str | None = None,
    image_url: str | None = None,
    seed: int = 42,
    width_and_height: str = "1536x1536",
    quality: str = "basic",
    style_id: str | None = None,
    style_strength: float | None = None,
    negative_prompt: str | None = None,
) -> dict[str, Any]:
    endpoint = _v2_image_endpoint(model)
    params: dict[str, Any] = {
        "prompt": prompt,
        "width_and_height": width_and_height,
        "seed": seed,
        "quality": quality,
        # Higgsfield v2 requires input_images even for text-to-image.
        "input_images": [{"type": "image_url", "image_url": image_url.strip()}] if image_url else [],
    }
    if style_id:
        params["style_id"] = style_id
        if style_strength is not None:
            params["style_strength"] = style_strength
    if negative_prompt:
        params["negative_prompt"] = negative_prompt
    # Model is only meaningful for some endpoints (e.g. seedream/nano-banana expect it).
    if endpoint in ("/v1/text2image/seedream", "/v1/text2image/nano-banana"):
        params["model"] = model
    return {"model": model or "soul", "params": params}


def _build_v2_video_payload(
    prompt: str,
    *,
    model: str | None = None,
    image_url: str | None = None,
    seed: int = 42,
    motion_id: str | None = None,
    motion_strength: float | None = None,
    duration: int = 5,
    aspect_ratio: str = "16:9",
    negative_prompt: str | None = None,
) -> dict[str, Any]:
    endpoint, normalized_model = _v2_video_endpoint(model)
    params: dict[str, Any] = {"prompt": prompt}
    # All v2 image inputs use the typed object shape.
    image_input = {"type": "image_url", "image_url": image_url.strip()} if image_url else None
    if endpoint == "/v1/image2video/dop":
        params["model"] = normalized_model
        params["seed"] = seed
        params["motions_id"] = motion_id or "generic"
        params["motions_strength"] = motion_strength or 0.7
        params["enhance_prompt"] = False
        params["input_images"] = [image_input] if image_input else []
    else:
        # Generic / kling path expects a single input_image.
        params["model"] = normalized_model
        params["duration"] = duration
        params["aspect_ratio"] = aspect_ratio
        if image_input:
            params["input_image"] = image_input
    if negative_prompt:
        params["negative_prompt"] = negative_prompt
    return {"model": normalized_model, "params": params}


def _build_legacy_image_payload(
    prompt: str,
    *,
    model: str | None = None,
    image_url: str | None = None,
    seed: int = 42,
) -> dict[str, Any]:
    settings = get_settings()
    payload: dict[str, Any] = {
        "prompt": prompt,
        "model": model or settings.higgsfield_model_image,
        "seed": seed,
        "enhance_prompt": False,
    }
    if image_url:
        payload["input_images"] = [image_url.strip()]
    return payload


def _build_legacy_video_payload(
    prompt: str,
    *,
    model: str | None = None,
    image_url: str | None = None,
    seed: int = 42,
    motion_id: str | None = None,
    motion_strength: float | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    payload: dict[str, Any] = {
        "prompt": prompt,
        "model": model or settings.higgsfield_model_video,
        "seed": seed,
        "motions_id": motion_id or settings.higgsfield_default_motion_id,
        "motions_strength": motion_strength or settings.higgsfield_default_motion_strength,
        "enhance_prompt": False,
    }
    if image_url:
        payload["input_images"] = [image_url.strip()]
    return payload


async def submit_image(
    prompt: str,
    *,
    image_url: str | None = None,
    model: str | None = None,
    seed: int = 42,
    width_and_height: str = "1536x1536",
    quality: str = "basic",
    style_id: str | None = None,
    style_strength: float | None = None,
    negative_prompt: str | None = None,
    credential: str | None = None,
    mode: str = "api",
) -> dict[str, Any]:
    """Submit a text-to-image (or image-to-image) job."""
    if uses_v2():
        payload = _build_v2_image_payload(
            prompt,
            model=model,
            image_url=image_url,
            seed=seed,
            width_and_height=width_and_height,
            quality=quality,
            style_id=style_id,
            style_strength=style_strength,
            negative_prompt=negative_prompt,
        )
        url = f"{_base_url()}{_v2_image_endpoint(model)}"
    else:
        payload = _build_legacy_image_payload(prompt, model=model, image_url=image_url, seed=seed)
        url = _legacy_submit_url("image")
    return await _request("POST", url, payload, credential=credential, mode=mode)


async def submit_video(
    prompt: str,
    *,
    image_url: str | None = None,
    model: str | None = None,
    seed: int = 42,
    motion_id: str | None = None,
    motion_strength: float | None = None,
    duration: int = 5,
    aspect_ratio: str = "16:9",
    negative_prompt: str | None = None,
    credential: str | None = None,
    mode: str = "api",
) -> dict[str, Any]:
    """Submit an image-to-video (or text-to-video) job."""
    if uses_v2():
        payload = _build_v2_video_payload(
            prompt,
            model=model,
            image_url=image_url,
            seed=seed,
            motion_id=motion_id,
            motion_strength=motion_strength,
            duration=duration,
            aspect_ratio=aspect_ratio,
            negative_prompt=negative_prompt,
        )
        endpoint, _ = _v2_video_endpoint(model)
        url = f"{_base_url()}{endpoint}"
    else:
        payload = _build_legacy_video_payload(
            prompt,
            model=model,
            image_url=image_url,
            seed=seed,
            motion_id=motion_id,
            motion_strength=motion_strength,
        )
        url = _legacy_submit_url("video")
    return await _request("POST", url, payload, credential=credential, mode=mode)


async def get_status(
    request_id: str,
    *,
    credential: str | None = None,
    mode: str = "api",
) -> dict[str, Any]:
    """Poll the status of a submitted job."""
    settings = get_settings()
    if uses_v2():
        # Higgsfield v2 status lives at the root /requests path, not /v1/requests.
        url = f"{settings.higgsfield_base_url}/requests/{request_id}/status"
    else:
        url = f"{settings.higgsfield_status_gateway}/{request_id}"
    return await _request("GET", url, None, credential=credential, mode=mode)


async def cancel_request(request_id: str) -> dict[str, Any]:
    """Cancel a queued or running job (v2 only; legacy has no cancel endpoint)."""
    if not uses_v2():
        return {"ok": False, "error": "cancel not supported for legacy Pixazo gateway"}
    settings = get_settings()
    # Higgsfield v2 cancel mirrors the status path root.
    url = f"{settings.higgsfield_base_url}/requests/{request_id}/cancel"
    return await _request("POST", url, {})


async def list_motions() -> dict[str, Any]:
    """Return the list of available DoP motion presets (v2 only)."""
    if not uses_v2():
        return {"ok": False, "error": "motion listing not supported for legacy Pixazo gateway"}
    settings = get_settings()
    url = f"{settings.higgsfield_base_url}/v1/motions"
    return await _request("GET", url, None)


def extract_output_url(data: dict[str, Any]) -> str | None:
    """Best-effort extraction of a playable/viewable URL from a status response."""
    if not isinstance(data, dict):
        return None
    # v2 top-level image/video keys
    if isinstance(data.get("images"), list) and data["images"]:
        first = data["images"][0]
        if isinstance(first, dict) and first.get("url"):
            return first["url"]
    if isinstance(data.get("video"), dict) and data["video"].get("url"):
        return data["video"]["url"]
    # legacy / fallback keys
    for key in ("output_url", "video_url", "image_url", "url"):
        val = data.get(key)
        if val and isinstance(val, str):
            return val
    # nested legacy shapes
    nested = data.get("data") or data.get("result") or data.get("results") or data.get("output")
    if isinstance(nested, dict):
        return extract_output_url(nested)
    if isinstance(nested, list) and nested and isinstance(nested[0], dict):
        return extract_output_url(nested[0])
    return None


def is_terminal_status(status: str | None) -> bool:
    """Return True if the job is finished (success or failure)."""
    if not status:
        return False
    return status.lower() in {
        "completed",
        "done",
        "success",
        "ready",
        "failed",
        "error",
        "cancelled",
        "rejected",
        "moderated",
        "nsfw",
    }
