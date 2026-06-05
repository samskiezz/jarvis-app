
import os, csv, sys

required = [
 'catalogues/source_families_260_expanded.csv',
 'catalogues/domain_subjects_5000_iso_expanded.csv',
 'catalogues/endpoint_candidates_50000.csv',
 'catalogues/ocr_document_candidates_15000.csv',
 'benchmarks/benchmark_candidates_15000.csv',
 'sql/001_world_ontology_stage7_schema.sql',
 'graph/neo4j_stage7_ingestion.cypher',
 'vectors/vector_collections_stage7.json',
 'pipelines/pipeline_manifest.yaml'
]

for f in required:
    if not os.path.exists(f):
        raise SystemExit(f'MISSING: {f}')

def count_rows(path):
    with open(path, newline='', encoding='utf-8') as fh:
        return sum(1 for _ in csv.DictReader(fh))

print('subjects', count_rows('catalogues/domain_subjects_5000_iso_expanded.csv'))
print('sources', count_rows('catalogues/source_families_260_expanded.csv'))
print('endpoints', count_rows('catalogues/endpoint_candidates_50000.csv'))
print('ocr_docs', count_rows('catalogues/ocr_document_candidates_15000.csv'))
print('benchmarks', count_rows('benchmarks/benchmark_candidates_15000.csv'))
