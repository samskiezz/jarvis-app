// Cause/effect graph ingestion skeleton
CREATE CONSTRAINT acquisition_point IF NOT EXISTS FOR (a:AcquisitionPoint) REQUIRE a.acquisition_point_id IS UNIQUE;
CREATE CONSTRAINT source_id IF NOT EXISTS FOR (s:SourceFamily) REQUIRE s.source_id IS UNIQUE;
// LOAD CSV WITH HEADERS FROM 'file:///v4_next_level_acquisition_points_5000.csv' AS row
// MERGE (a:AcquisitionPoint {acquisition_point_id: row.acquisition_point_id})
// SET a.domain_cluster=row.domain_cluster, a.technology_layer=row.technology_layer, a.ontology_target=row.ontology_target
// MERGE (s:SourceFamily {source_id: row.source_id})
// MERGE (a)-[:DERIVED_FROM]->(s);
