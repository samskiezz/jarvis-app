
-- Example psql load commands. Adjust file paths for your environment.
\copy world_ontology_stage7.source_family FROM 'catalogues/source_families_260_expanded.csv' CSV HEADER;
\copy world_ontology_stage7.domain_subject FROM 'catalogues/domain_subjects_5000_iso_expanded.csv' CSV HEADER;
\copy world_ontology_stage7.endpoint_candidate FROM 'catalogues/endpoint_candidates_50000.csv' CSV HEADER;
\copy world_ontology_stage7.ocr_document_candidate FROM 'catalogues/ocr_document_candidates_15000.csv' CSV HEADER;
\copy world_ontology_stage7.benchmark_candidate FROM 'benchmarks/benchmark_candidates_15000.csv' CSV HEADER;
