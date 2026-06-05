import os
required = [
 'runtime_core/connector_runner/runner.py',
 'runtime_core/parser_harness/standard_envelope.py',
 'runtime_core/quality_gate_runner/quality_gates.py',
 'runtime_core/audit_service/audit_writer.py',
 'runtime_core/action_engine/action_engine.py',
 'runtime_core/run_reference_pipeline.py',
 'security_runtime/policy_engine/policy_model.rego',
 'security_runtime/identity/spiffe_identity_contract.json',
 'security_runtime/export_control/export_control_policy.yaml',
 'apollo_control_plane/node_agent/node_agent.py',
 'apollo_control_plane/desired_state/desired_state.schema.json',
 'apollo_control_plane/reconciliation/reconciliation_loop.py',
 'apollo_control_plane/rollout_planner/rollout_planner.py',
 'apollo_control_plane/health_gates/health_gate_evaluator.py',
 'apollo_control_plane/rollback_engine/rollback_engine.py',
 'aip_runtime/context_builder/context_builder.py',
 'aip_runtime/tool_executor/tool_executor.py',
 'foundry_runtime/object_runtime/object_store.sql',
 'gotham_runtime/case_engine/case_engine_schema.sql',
 'manifests/v7_gap_closure_matrix.csv'
]
missing=[p for p in required if not os.path.exists(p)]
if missing:
    raise SystemExit('MISSING:\n' + '\n'.join(missing))
print('V7 RUNTIME SECURITY APOLLO OK', len(required), 'critical files verified')
