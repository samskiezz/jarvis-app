from fastapi import Header, HTTPException

from .config import API_KEY, REQUIRE_AUTH


def _check(authorization: str | None) -> str | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if token != API_KEY:
        raise HTTPException(status_code=401, detail="invalid token")
    return token


def require_bearer(authorization: str | None = Header(default=None)) -> str:
    """Strict: always require a valid bearer token (entities, /auth/me)."""
    return _check(authorization)


def optional_bearer(authorization: str | None = Header(default=None)) -> str | None:
    """Public read endpoints.

    If JARVIS_REQUIRE_AUTH is set, behaves like require_bearer. Otherwise a token
    is validated when supplied but absence is allowed, so the local/playable
    build streams live data without a key.
    """
    if REQUIRE_AUTH:
        return _check(authorization)
    if authorization:
        return _check(authorization)
    return None
