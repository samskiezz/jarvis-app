import os, csv
required=[
 'advanced_sources/source_families_added_v4_150.csv',
 'advanced_sources/source_families_total_v4.csv',
 'advanced_acquisition_points/v4_next_level_acquisition_points_5000.csv',
 'advanced_ui/operational_scale_browser_engine/00_ARCHITECTURE.md',
 'advanced_ui/operational_scale_browser_engine/03_PROTOBUF_CONTRACT.proto',
 'advanced_ui/operational_scale_browser_engine/05_GPU_RENDER_CONTRACT.md',
 'kernel_runtime/ebpf/ebpf_probe_contract.yaml',
 'identity_runtime/spiffe/spiffe_workload_identity.schema.json',
 'policy_runtime/opa/rego_policy_template.rego',
 'lineage_runtime/openlineage/openlineage_event.schema.json',
 'event_runtime/cloudevents/cloudevent_envelope.schema.json',
 'object_runtime/bitemporal/bitemporal_object_model.sql',
 'query_engine/roaring_bitmap/bitmap_query_plan.md',
 'sovereign_sync/merkle_dag/merkle_bundle_manifest.schema.json',
 'observability_runtime/opentelemetry/otel_signal_contract.yaml',
 'privacy_safety/differential_privacy/dp_release_policy.yaml',
 'advanced_docs/v4_remaining_gaps_review.csv'
]
missing=[p for p in required if not os.path.exists(p)]
if missing:
    raise SystemExit('MISSING:\n'+'\n'.join(missing))
def count(p):
    with open(p,newline='',encoding='utf-8') as f:
        return sum(1 for _ in csv.DictReader(f))
print('v4_added_sources', count('advanced_sources/source_families_added_v4_150.csv'))
print('v4_total_sources', count('advanced_sources/source_families_total_v4.csv'))
print('v4_acquisition_points', count('advanced_acquisition_points/v4_next_level_acquisition_points_5000.csv'))
print('V4 OK')
