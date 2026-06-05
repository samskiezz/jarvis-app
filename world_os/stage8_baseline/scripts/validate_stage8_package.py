
import os, csv

required = [
 'catalogues/source_families_350_expanded.csv',
 'catalogues/domain_subjects_10000_iso_expanded.csv',
 'catalogues/domain_subjects_additional_5000.csv',
 'catalogues/endpoint_candidates_100000.csv',
 'catalogues/ocr_document_candidates_30000.csv',
 'benchmarks/benchmark_candidates_30000.csv',
 'sql/001_stage8_schema.sql',
 'graph/neo4j_stage8_ingestion.cypher',
 'vectors/vector_collections_stage8.json',
 'pipelines/pipeline_manifest_stage8.yaml'
]
for f in required:
    if not os.path.exists(f):
        raise SystemExit(f'MISSING: {f}')
def count(path):
    with open(path, newline='', encoding='utf-8') as fh:
        return sum(1 for _ in csv.DictReader(fh))
for f in required[:6]:
    print(f, count(f))
