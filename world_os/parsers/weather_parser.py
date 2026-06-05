"""
weather_parser.py
Outputs the standard acquisition envelope.

Delegates to the real US weather-alerts pipeline so the parser and the running
ingest slice share one implementation.
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
    """Parse one NWS GeoJSON feature into the standard envelope.

    Imports defensively so a missing server package degrades gracefully instead
    of raising at import time.
    """
    try:
        from server.services.world_weather import parse_feature
    except Exception:  # noqa: BLE001
        try:
            from services.world_weather import parse_feature  # type: ignore
        except Exception:  # noqa: BLE001
            parse_feature = None  # type: ignore
    if parse_feature is None:
        return dict(STANDARD_ENVELOPE)
    return parse_feature(raw_record)
