# Ontology Mapping Standard

## Rule
No source goes directly to a user or AI model. It must be mapped into controlled ontology objects, relationships, measurements, documents, events or evidence records.

## Mandatory mapping fields
- source_id
- source_record_id
- ontology_object_type
- property_type
- link_type
- action_type if operational
- provenance record
- confidence score
- valid time
- transaction time
- classification
- policy scope
- audit id

## Object targets
- Person
- Organisation
- Asset
- Place
- Event
- Document
- Measurement
- Relationship
- Workflow
- ModelOutput
- Action
- AuditRecord
