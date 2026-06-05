# Source Acquisition SOP

## Purpose
Define the controlled procedure for registering, acquiring and operationalising source data.

## Procedure
1. Register source family.
2. Record source owner, official URL, terms and access method.
3. Classify the source: official API, database, file/document, telemetry, geospatial, registry, event, benchmark or public web/open data.
4. Assign ingestion connector.
5. Define parser and schema.
6. Define refresh cadence.
7. Perform licence/terms review.
8. Implement raw capture.
9. Validate schema and freshness.
10. Map to ontology target.
11. Emit acquisition event and audit record.
12. Project to search/graph/vector if authorised.

## Rejection conditions
Reject any source if it requires:
- bypassing authentication;
- scanning private devices;
- intercepting private communication;
- violating robots/terms;
- collecting personal data without lawful basis;
- using restricted/classified sources without authorisation.
