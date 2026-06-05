import os, csv
required = [
'source_legal_review/robots_review_register.csv',
'source_legal_review/licence_register.csv',
'source_legal_review/restricted_sources_register.csv',
'source_legal_review/source_risk_rating.yaml',
'source_legal_review/approval_workflow.yaml',
'manifests/exact_20_group_compliance_report.csv'
]
missing=[p for p in required if not os.path.exists(p)]
if missing: raise SystemExit('MISSING: '+', '.join(missing))
with open('manifests/exact_20_group_compliance_report.csv', newline='', encoding='utf-8') as f:
    bad=[r for r in csv.DictReader(f) if r['status']!='PASS']
if bad: raise SystemExit('CHECK GROUPS: '+str(bad))
print('V3 exact 20-group completion OK')
