"""
cve_parser.py
Outputs the standard acquisition envelope.
"""
STANDARD_ENVELOPE = {
  "source_id": "",
  "record_id": "",
  "record_type": "",
  "observed_at": "",
  "valid_time": "",
  "location": {},
  "entities": [],
  "measurements": [],
  "relationships": [],
  "documents": [],
  "quality": {},
  "provenance": {},
  "raw_hash": ""
}

def parse(raw_record, source_context):
    """Delegate to the real NVD CVE pipeline parser (standard envelope).

    ``raw_record`` is one element of the NVD ``vulnerabilities`` list.
    """
    try:
        from server.services.world_cve import parse_item
    except Exception:  # noqa: BLE001
        try:
            from services.world_cve import parse_item  # type: ignore
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError("world_cve.parse_item unavailable") from exc
    return parse_item(raw_record)
