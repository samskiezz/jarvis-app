
from __future__ import annotations
from typing import Dict, Any, List

def build_context(user: Dict[str, Any], purpose: str, candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
    allowed = []
    denied = []
    for c in candidates:
        if c.get("classification","internal") in user.get("allowed_classifications", ["internal"]) and c.get("source_terms_status","approved") == "approved":
            allowed.append(c)
        else:
            denied.append({"id": c.get("id"), "reason": "classification or source terms"})
    return {
        "user": user,
        "purpose": purpose,
        "allowed_objects": allowed,
        "denied": denied,
        "required_citations": True,
        "allowed_actions": user.get("allowed_actions", [])
    }
