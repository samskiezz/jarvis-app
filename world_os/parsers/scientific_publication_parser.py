"""
scientific_publication_parser.py
Outputs the standard acquisition envelope.

Delegates to the real pipeline parser in server.services.world_publications so the
parser and the running slice share one implementation.
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
    """Parse a single Crossref work item into the standard envelope."""
    try:
        from server.services.world_publications import parse_item
    except Exception:  # noqa: BLE001
        try:
            from services.world_publications import parse_item
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                "world_publications.parse_item unavailable: %r" % (exc,)
            )
    return parse_item(raw_record)
