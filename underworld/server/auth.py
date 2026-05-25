from fastapi import Header, HTTPException

from .config import get_settings


def require_bearer(authorization: str | None = Header(default=None)) -> str:
    settings = get_settings()
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if token != settings.api_key:
        raise HTTPException(status_code=401, detail="invalid token")
    return token
