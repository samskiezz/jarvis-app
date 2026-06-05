
CREATE CONSTRAINT subject_id IF NOT EXISTS FOR (s:DomainSubject) REQUIRE s.subject_id IS UNIQUE;
CREATE CONSTRAINT source_id IF NOT EXISTS FOR (s:SourceFamily) REQUIRE s.source_id IS UNIQUE;
CREATE CONSTRAINT endpoint_id IF NOT EXISTS FOR (e:EndpointCandidate) REQUIRE e.endpoint_candidate_id IS UNIQUE;

LOAD CSV WITH HEADERS FROM 'file:///domain_subjects_10000_iso_expanded.csv' AS row
MERGE (s:DomainSubject {subject_id: row.subject_id})
SET s.master_topic=row.master_topic,
    s.domain_subject=row.domain_subject,
    s.neuron_id=row.neuron_id,
    s.neuron_type=row.neuron_type,
    s.vector_namespace=row.vector_namespace,
    s.subniches=row.subniches_15,
    s.source_coverage_status=row.source_coverage_status;

LOAD CSV WITH HEADERS FROM 'file:///endpoint_candidates_100000.csv' AS row
MERGE (e:EndpointCandidate {endpoint_candidate_id: row.endpoint_candidate_id})
SET e.official_url=row.official_url,
    e.connector=row.recommended_ingestion_connector,
    e.refresh_cadence=row.refresh_cadence,
    e.production_status=row.production_status
WITH row, e
MATCH (s:DomainSubject {subject_id: row.subject_id})
MERGE (s)-[:HAS_ENDPOINT_CANDIDATE]->(e);
