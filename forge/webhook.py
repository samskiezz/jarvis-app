"""Inbound WhatsApp webhook — turns an approval reply into a merge.

Run alongside the agent:
    uvicorn forge.webhook:app --host 0.0.0.0 --port 8088

Endpoints:
  GET  /forge/whatsapp/webhook   — Meta Cloud API verification handshake
  POST /forge/whatsapp/webhook   — inbound message (Meta JSON or Twilio form)
  GET  /forge/approvals          — list pending/decided changes

On "APPROVE <id>" the change's branch is merged into its base and pushed (the
automation the human just authorised from their phone). On "REJECT <id>" the
branch is abandoned. Replies without an id act on the single pending change.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

from fastapi import APIRouter, FastAPI, Request, Response

from . import approvals as approvals_mod
from . import notify


def land_change(app_root: Path, change: approvals_mod.Change, by: str) -> tuple[bool, str]:
    """Merge an approved change's branch into its base and push it.

    Works whether the webhook shares the agent's working copy (local branch) or
    runs from its own clone (the agent pushed the branch to origin). Best-effort
    fetch, then merge whichever ref exists.
    """
    def git(*args: str) -> subprocess.CompletedProcess:
        return subprocess.run(["git", *args], cwd=app_root, capture_output=True, text=True)

    def ref_exists(ref: str) -> bool:
        return git("rev-parse", "--verify", "--quiet", ref).returncode == 0

    git("fetch", "origin", change.base, change.branch)  # best-effort
    if ref_exists(f"origin/{change.base}"):
        co = git("checkout", "-B", change.base, f"origin/{change.base}")
    else:
        co = git("checkout", change.base)
    if co.returncode != 0:
        return False, f"checkout {change.base} failed: {co.stderr.strip()}"

    merge_ref = f"origin/{change.branch}" if ref_exists(f"origin/{change.branch}") else change.branch
    if not ref_exists(merge_ref):
        return False, f"branch {change.branch} not found locally or on origin"
    mg = git("merge", "--no-ff", merge_ref, "-m",
             f"APEX Forge: land {change.id} (approved by {by})")
    if mg.returncode != 0:
        git("merge", "--abort")
        return False, f"merge failed: {mg.stderr.strip()}"
    if os.environ.get("FORGE_PUSH", "1") == "1":
        ps = git("push", "origin", change.base)
        if ps.returncode != 0:
            return False, f"push failed: {ps.stderr.strip()}"
    return True, "landed"


def reject_change(app_root: Path, change: approvals_mod.Change) -> None:
    subprocess.run(["git", "branch", "-D", change.branch], cwd=app_root,
                   capture_output=True, text=True)


def _extract_message(payload: dict | None, form: dict | None) -> tuple[str, str]:
    """Return (text, sender) from either a Meta JSON body or Twilio form."""
    if payload and "entry" in payload:
        try:
            msg = payload["entry"][0]["changes"][0]["value"]["messages"][0]
            return msg.get("text", {}).get("body", ""), msg.get("from", "")
        except (KeyError, IndexError, TypeError):
            return "", ""
    if form:
        return form.get("Body", ""), form.get("From", "")
    return "", ""


def create_app(
    store: approvals_mod.ApprovalStore | None = None,
    app_root: Path | str | None = None,
    lander=land_change,
    rejecter=reject_change,
) -> FastAPI:
    store = store or approvals_mod.ApprovalStore()
    root = Path(app_root or os.environ.get("APP_ROOT", ".")).resolve()
    router = APIRouter(prefix="/forge", tags=["forge"])

    @router.get("/whatsapp/webhook")
    async def verify(request: Request):
        # Meta Cloud API subscription handshake.
        params = request.query_params
        verify_token = os.environ.get("WHATSAPP_VERIFY_TOKEN", "")
        if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == verify_token:
            return Response(content=params.get("hub.challenge", ""), media_type="text/plain")
        return Response(status_code=403)

    @router.post("/whatsapp/webhook")
    async def inbound(request: Request):
        payload = None
        form = None
        ctype = request.headers.get("content-type", "")
        if "application/json" in ctype:
            payload = await request.json()
        else:
            form = dict((await request.form()))
        text, sender = _extract_message(payload, form)
        decision, change_id = notify.parse_decision(text)
        if decision is None:
            return {"ok": True, "ignored": True, "reason": "no decision in message"}

        change = store.get(change_id) if change_id else store.latest_pending()
        if change is None or change.status != approvals_mod.PENDING:
            return {"ok": True, "ignored": True, "reason": "no matching pending change"}

        by = sender or "whatsapp"
        if decision == "reject":
            store.set_status(change.id, approvals_mod.REJECTED, by=by)
            rejecter(root, change)
            return {"ok": True, "change": change.id, "status": approvals_mod.REJECTED}

        # approve → land it
        store.set_status(change.id, approvals_mod.APPROVED, by=by)
        ok, note = lander(root, change, by)
        final = approvals_mod.LANDED if ok else approvals_mod.FAILED
        store.set_status(change.id, final, by=by, note=note)
        return {"ok": ok, "change": change.id, "status": final, "note": note}

    @router.get("/approvals")
    async def list_approvals(status: str | None = None):
        return {"changes": [c.__dict__ for c in store.list(status)]}

    app = FastAPI(title="APEX Forge Approval Webhook")
    app.include_router(router)
    return app


app = create_app()
