
CREATE CONSTRAINT subject_id IF NOT EXISTS FOR (s:DomainSubject) REQUIRE s.subject_id IS UNIQUE;
CREATE CONSTRAINT source_id IF NOT EXISTS FOR (s:SourceFamily) REQUIRE s.source_id IS UNIQUE;
CREATE CONSTRAINT neuron_id IF NOT EXISTS FOR (n:Neuron) REQUIRE n.neuron_id IS UNIQUE;

LOAD CSV WITH HEADERS FROM 'file:///domain_subjects_5000_iso_expanded.csv' AS row
MERGE (s:DomainSubject {subject_id: row.subject_id})
SET s.master_topic = row.master_topic,
    s.domain_subject = row.domain_subject,
    s.subniches = row.subniches_15,
    s.vector_namespace = row.vector_namespace,
    s.neuron_id = row.neuron_id,
    s.production_acceptance_gate = row.production_acceptance_gate;

LOAD CSV WITH HEADERS FROM 'file:///source_families_260_expanded.csv' AS row
MERGE (src:SourceFamily {source_id: row.source_id})
SET src.name = row.source_name,
    src.url = row.url,
    src.access_method = row.access_method,
    src.auth = row.auth;

LOAD CSV WITH HEADERS FROM 'file:///domain_subjects_5000_iso_expanded.csv' AS row
MERGE (n:Neuron {neuron_id: row.neuron_id})
SET n.neuron_type = row.neuron_type,
    n.vector_namespace = row.vector_namespace
WITH row, n
MATCH (s:DomainSubject {subject_id: row.subject_id})
MERGE (s)-[:ENCODES_AS]->(n);
