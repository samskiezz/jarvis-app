"""
ais_vessel_parser.py
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
    raise NotImplementedError("Implement ais_vessel_parser parser and return STANDARD_ENVELOPE-compatible dict.")
