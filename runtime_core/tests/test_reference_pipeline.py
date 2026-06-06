
from runtime_core.run_reference_pipeline import run_one

def test_reference_pipeline_approved_source():
    result = run_one({
        "source_id": "TEST",
        "source_name": "Test Source",
        "url": "https://example.com",
        "access_method": "REST/JSON",
        "terms_status": "approved"
    })
    assert result["connector_ok"] is True
    assert result["outputs"]
