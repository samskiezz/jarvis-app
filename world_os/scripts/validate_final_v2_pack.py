import os
missing=[]
expected=['science_domains/astronomy_space_science.yaml', 'science_domains/AI_model_governance.yaml', 'schemas/standard_acquisition_envelope.schema.json', 'connectors/CONNECTOR_CONTRACT.md', 'parsers/weather_parser.py', 'quality_gates/schema_validity.py', 'ontology_objects/Person.schema.json', 'ontology_objects/specialised/WeatherObservation.schema.json', 'graph/relationship_types/AFFECTS.yaml', 'cause_effect_engine/cause_effect_rules.yaml', 'vectors/namespace_registry.yaml', 'aip/agent_registry.yaml', 'apollo_runtime/desired_state/connectors.desired.yaml', 'foundry_pipelines/raw_zone_manifest.yaml', 'gotham_mission_apps/common_operating_picture.yaml', 'governance/ISO_27001_control_mapping.md', 'test_harness/vector_tests/retrieval_groundedness_tests.py', 'evals/retrieval_eval.yaml', 'source_legal_review/source_terms_register.csv', 'memory_runtime/memory_node_schema.json', 'actions/action_type_registry.yaml', 'audit_replay/audit_event_schema.json', 'ui/JARVIS_ENTERPRISE_UI_SPEC.md', 'ui/visualiser_contract.schema.json', 'deployment/production_topology.yaml']
for p in expected:
    if not os.path.exists(p): missing.append(p)
if missing:
    raise SystemExit('MISSING:\n'+'\n'.join(missing))
print('FINAL V2 PACK OK:', len(expected), 'critical paths verified')
