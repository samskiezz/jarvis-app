
"""
Reference local pipeline:
source -> connector -> parser envelope -> quality gates -> audit -> optional action.

This is not a full production service. It is the executable nucleus used to replace passive stubs.
"""
from connector_runner.runner import run_connector
from parser_harness.standard_envelope import envelope_from_raw, validate_envelope
from quality_gate_runner.quality_gates import run_quality_gates
from audit_service.audit_writer import write_audit_event

def run_one(source):
    result = run_connector(source)
    audit = write_audit_event("runtime_core", "source_ingestion", "connector_fetch", {"source": source, "result_ok": result.ok}, "allow" if result.ok else "deny")
    outputs = []
    for record in result.records:
        raw = dict(record.raw)
        raw["record_id"] = record.record_id
        raw["raw_hash"] = record.raw_hash
        envelope = envelope_from_raw(raw)
        envelope_errors = validate_envelope(envelope)
        quality = run_quality_gates(envelope, source)
        audit2 = write_audit_event("runtime_core", "source_ingestion", "quality_gate", {"envelope": envelope, "quality": quality, "errors": envelope_errors}, "allow" if quality["passed"] else "deny")
        outputs.append({"record": record.record_id, "envelope_errors": envelope_errors, "quality": quality, "audit": audit2["audit_id"]})
    return {"connector_ok": result.ok, "fetch_audit": audit["audit_id"], "outputs": outputs, "errors": result.errors}

if __name__ == "__main__":
    source = {
        "source_id": "DEMO-SRC",
        "source_name": "Demo Approved Source",
        "url": "https://example.com",
        "access_method": "REST/JSON",
        "terms_status": "approved",
        "domain_use": "demo"
    }
    print(run_one(source))
