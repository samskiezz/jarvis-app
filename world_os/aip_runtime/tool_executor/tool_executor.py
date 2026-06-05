
from __future__ import annotations
from typing import Dict, Any

HIGH_RISK_TOOLS = {"deploy_connector","quarantine_data","export_evidence","disable_source"}

def execute_tool(tool_name: str, context: Dict[str, Any], args: Dict[str, Any]) -> Dict[str, Any]:
    if tool_name in HIGH_RISK_TOOLS and not args.get("approval_id"):
        return {"ok": False, "reason": "approval required", "tool": tool_name}
    if tool_name not in context.get("allowed_actions", []) and tool_name not in ("ontology_search","graph_expand","retrieve_evidence"):
        return {"ok": False, "reason": "tool not allowed by context", "tool": tool_name}
    return {"ok": True, "tool": tool_name, "result": {"status": "reference_execution", "args": args}}
