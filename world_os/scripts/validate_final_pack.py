import os, csv
required = [
 'catalogues/domain_subjects_10000_iso_expanded.csv',
 'catalogues/priority_acquisition_points_1000.csv',
 'catalogues/source_families_350_expanded.csv',
 'catalogues/endpoint_candidates_actual_92000.csv',
 'catalogues/ocr_document_candidates_30000.csv',
 'benchmarks/benchmark_candidates_30000.csv',
 'ui/jarvis_command_center/src/App.tsx'
]
for f in required:
    if not os.path.exists(f):
        raise SystemExit(f'MISSING: {f}')
def count(p):
    with open(p, newline='', encoding='utf-8') as fh:
        return sum(1 for _ in csv.DictReader(fh))
for f in required[:6]:
    print(f, count(f))
print('OK')
