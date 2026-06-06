from __future__ import annotations
from runtime_core.world_os_runtime.parsers import parse_by_name

def parse(raw=None, source_id="hurricane_track"):
    return parse_by_name("hurricane_track_parser", raw or {}, source_id)

def validate(raw=None):
    envelope = parse(raw or {})
    return {"valid": True, "record_type": envelope.get("record_type"), "source_id": envelope.get("source_id")}

def run(raw=None, source_id="hurricane_track"):
    return parse(raw, source_id)
