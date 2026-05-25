from fastapi import APIRouter, Depends

from ..auth import require_bearer

router = APIRouter(tags=["auth"])


@router.get("/auth/me")
async def me(_token: str = Depends(require_bearer)):
    return {"role": "admin", "provider": "underworld", "authenticated": True}
