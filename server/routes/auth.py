from fastapi import APIRouter, Depends

from ..auth import require_bearer

router = APIRouter()


@router.get("/auth/me")
async def me(_token: str = Depends(require_bearer)):
    return {"role": "admin", "provider": "kimi-k2.6", "authenticated": True}
