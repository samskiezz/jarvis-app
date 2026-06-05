
\copy world_ontology_stage8.source_family FROM 'catalogues/source_families_350_expanded.csv' CSV HEADER;
\copy world_ontology_stage8.domain_subject FROM 'catalogues/domain_subjects_10000_iso_expanded.csv' CSV HEADER;
\copy world_ontology_stage8.endpoint_candidate FROM 'catalogues/endpoint_candidates_100000.csv' CSV HEADER;
\copy world_ontology_stage8.ocr_document_candidate FROM 'catalogues/ocr_document_candidates_30000.csv' CSV HEADER;
\copy world_ontology_stage8.benchmark_candidate FROM 'benchmarks/benchmark_candidates_30000.csv' CSV HEADER;
