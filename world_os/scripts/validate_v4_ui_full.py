import os, csv
required = [
 'ui/jarvis_enterprise_operator_full/package.json',
 'ui/jarvis_enterprise_operator_full/src/main.tsx',
 'ui/jarvis_enterprise_operator_full/src/data/architecture.manifest.json',
 'ui/jarvis_enterprise_operator_full/src/data/visual_graph.sample.json',
 'ui/jarvis_enterprise_operator_full/src/engine/graphPolicy.ts',
 'ui/jarvis_enterprise_operator_full/src/engine/binaryTransport.ts',
 'ui/jarvis_enterprise_operator_full/src/engine/gpuPicking.ts',
 'ui/jarvis_enterprise_operator_full/src/engine/quaternionCamera.ts',
 'ui/jarvis_enterprise_operator_full/src/proto/graph_delta.proto',
 'ui/jarvis_enterprise_operator_full/src/workers/layout.worker.ts',
 'advanced_docs/v4_ui_gap_review_after_rescan.csv'
]
missing = [p for p in required if not os.path.exists(p)]
if missing:
    raise SystemExit('MISSING:\n' + '\n'.join(missing))
print('V4 UI FULL OK', len(required), 'critical files verified')
