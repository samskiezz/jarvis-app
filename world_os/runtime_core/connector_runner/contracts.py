
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional
from datetime import datetime, timezone
import hashlib, json

@dataclass
class SourceContext:
    source_id: str
    source_name: str
    url: str
    access_method: str
    auth: str = ""
    terms_status: str = "pending"
    domain_use: str = ""

@dataclass
class RawRecord:
    source_id: str
    record_id: str
    raw: Dict[str, Any]
    fetched_at: str
    raw_hash: str

@dataclass
class ConnectorResult:
    ok: bool
    source_id: str
    records: List[RawRecord] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    checkpoint: Optional[str] = None

def stable_hash(payload: Any) -> str:
    blob = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()

class BaseConnector:
    connector_name = "base"
    def discover(self, context: SourceContext) -> List[str]:
        raise NotImplementedError
    def fetch(self, context: SourceContext, checkpoint: Optional[str] = None) -> ConnectorResult:
        raise NotImplementedError
