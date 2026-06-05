"""
species_occurrence_parser.py
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

def parse(raw_record, source_context=None):
    """Delegate to the real species pipeline parser (standard envelope)."""
    try:
        from server.services.world_species import parse_record
    except Exception:  # noqa: BLE001
        try:
            from services.world_species import parse_record  # type: ignore
        except Exception:  # noqa: BLE001
            parse_record = None  # type: ignore
    if parse_record is None:
        env = dict(STANDARD_ENVELOPE)
        env["record_type"] = "SpeciesOccurrence"
        return env
    return parse_record(raw_record)
