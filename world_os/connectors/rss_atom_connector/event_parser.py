"""
rss_atom_connector/event_parser.py
Production template. Implement connector-specific logic here.
"""
from dataclasses import dataclass
from typing import Any, Dict

@dataclass
class ConnectorResult:
    ok: bool
    raw_uri: str | None
    provenance: Dict[str, Any]
    errors: list[str]

def run(config: Dict[str, Any]) -> ConnectorResult:
    """Execute connector after source terms, auth and rate-limit validation."""
    raise NotImplementedError("Implement rss_atom_connector production connector.")
