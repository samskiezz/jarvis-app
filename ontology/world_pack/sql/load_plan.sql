
-- PostgreSQL COPY load order
-- 1. source_families_260_expanded.csv -> world_ontology_stage7.source_family
-- 2. domain_subjects_5000_iso_expanded.csv -> world_ontology_stage7.domain_subject
-- 3. endpoint_candidates_50000.csv -> world_ontology_stage7.endpoint_candidate
-- 4. ocr_document_candidates_15000.csv -> world_ontology_stage7.ocr_document_candidate
-- 5. benchmark_candidates_15000.csv -> world_ontology_stage7.benchmark_candidate

-- Use staging tables first if your CSV headers include extra columns. Then INSERT selected columns into production tables.
