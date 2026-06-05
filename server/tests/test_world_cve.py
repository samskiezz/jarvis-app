"""CVE vertical slice: parser/gate offline (always), live fetch (skip if no net)."""
import pytest
from server.services import world_cve as cve

SAMPLE = {"vulnerabilities": [
    {"cve": {
        "id": "CVE-2024-12345",
        "descriptions": [{"lang": "en", "value": "A buffer overflow in the widget allows RCE."}],
        "published": "2024-01-02T00:00:00.000",
        "lastModified": "2024-01-03T00:00:00.000",
        "metrics": {"cvssMetricV31": [{"cvssData": {"baseScore": 9.8, "baseSeverity": "CRITICAL"}}]},
    }},
    {"cve": {  # bad id + no description -> rejected
        "id": "NOTACVE-1",
        "descriptions": [],
        "published": "2024-01-02T00:00:00.000",
        "metrics": {},
    }},
]}


def test_parser_produces_standard_envelope():
    env = cve.parse_item(SAMPLE["vulnerabilities"][0])
    for k in ("source_id", "record_id", "record_type", "observed_at", "valid_time", "location",
              "measurements", "documents", "provenance", "raw_hash"):
        assert k in env
    assert env["record_type"] == "Vulnerability"
    assert env["record_id"] == "CVE-2024-12345"
    assert env["documents"][0]["url"] == "https://nvd.nist.gov/vuln/detail/CVE-2024-12345"
    assert any(m["name"] == "cvss_base" and m["value"] == 9.8 for m in env["measurements"])
    assert env["_desc"].startswith("A buffer overflow") and env["_severity"] == "CRITICAL"


def test_quality_gate_rejects_bad_record():
    good = cve.quality_gate(cve.parse_item(SAMPLE["vulnerabilities"][0]))
    bad = cve.quality_gate(cve.parse_item(SAMPLE["vulnerabilities"][1]))
    assert good["pass"] is True
    assert bad["pass"] is False
    assert bad["checks"]["valid_cve_id"] is False and bad["checks"]["has_description"] is False


def test_pipeline_writes_ontology_objects(tmp_path, monkeypatch):
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "cve.db"))
    out = cve.run_pipeline(raw=SAMPLE, live=False)        # injected data, no network
    assert out["status"] == "ok"
    assert out["ingested"] == 1 and out["rejected"] == 1  # good one in, bad one gated out
    from server.services import jarvis_ontology as ont
    objs = ont.list_objects("Vulnerability")
    assert len(objs) >= 1


@pytest.mark.skipif(cve.fetch() is None, reason="NVD feed unreachable / rate-limited")
def test_live_nvd_fetch():
    data = cve.fetch()
    assert data and isinstance(data.get("vulnerabilities"), list)
