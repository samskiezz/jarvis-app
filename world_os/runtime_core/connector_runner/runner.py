
from __future__ import annotations
from typing import Optional, Dict, Any
from contracts import SourceContext, ConnectorResult, RawRecord, stable_hash
import datetime

class TermsNotApproved(Exception):
    pass

class ReferenceRestConnector:
    connector_name = "reference_rest_json_connector"

    def discover(self, context: SourceContext):
        return [context.url]

    def fetch(self, context: SourceContext, checkpoint: Optional[str] = None) -> ConnectorResult:
        if context.terms_status not in ("approved", "public_approved", "owned"):
            return ConnectorResult(ok=False, source_id=context.source_id, errors=["source terms not approved"])
        now = datetime.datetime.now(datetime.UTC).isoformat()
        # This is a safe reference record. Real connectors replace this with HTTP/API/download execution.
        raw = {
            "source_id": context.source_id,
            "source_name": context.source_name,
            "url": context.url,
            "access_method": context.access_method,
            "fetched_at": now,
            "checkpoint": checkpoint,
            "record_type": "source_health_reference"
        }
        return ConnectorResult(
            ok=True,
            source_id=context.source_id,
            records=[RawRecord(context.source_id, f"{context.source_id}:health:{now}", raw, now, stable_hash(raw))],
            checkpoint=now
        )

def run_connector(source: Dict[str, Any], checkpoint: Optional[str] = None) -> ConnectorResult:
    ctx = SourceContext(
        source_id=source.get("source_id",""),
        source_name=source.get("source_name",""),
        url=source.get("url",""),
        access_method=source.get("access_method",""),
        auth=source.get("auth",""),
        terms_status=source.get("terms_status","pending"),
        domain_use=source.get("domain_use","")
    )
    return ReferenceRestConnector().fetch(ctx, checkpoint)
