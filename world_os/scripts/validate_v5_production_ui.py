import os, csv, json

required = [
 'ui/jarvis_enterprise_operator_full/src/design/design_tokens.json',
 'ui/jarvis_enterprise_operator_full/src/styles/production-theme.css',
 'ui/jarvis_enterprise_operator_full/src/routes/route_registry.json',
 'ui/ux_dead_end_audit.csv',
 'ui/jarvis_enterprise_operator_full/src/features/button_action_registry.csv',
 'ui/jarvis_enterprise_operator_full/src/features/data_table_render_contracts.csv',
 'ui/jarvis_enterprise_operator_full/src/specs/component_specifications.csv',
 'ui/jarvis_enterprise_operator_full/src/specs/operator_user_flows.csv',
 'ui/jarvis_enterprise_operator_full/src/components/tables/DataGridPro.tsx',
 'ui/jarvis_enterprise_operator_full/src/components/feedback/StateBoundary.tsx',
 'manifests/v5_production_ui_gap_review.csv'
]

missing = [p for p in required if not os.path.exists(p)]
if missing:
    raise SystemExit('MISSING:\n' + '\n'.join(missing))

with open('ui/ux_dead_end_audit.csv', newline='', encoding='utf-8') as f:
    failed = [r for r in csv.DictReader(f) if r['dead_end_status'] != 'PASS']
if failed:
    raise SystemExit('DEAD END ROUTES FAILED: ' + str(failed[:5]))

print('V5 PRODUCTION UI OK', len(required), 'critical artefacts verified')
