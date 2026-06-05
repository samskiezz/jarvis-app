# Graph Relationship Standard

## Purpose
Prevent random graph lines by requiring every edge to be typed, weighted, evidenced and policy-bound.

## Required edge fields
- edge_id
- source_class
- target_class
- edge_type
- subject_id
- edge_weight
- evidence_required
- policy_gate
- audit_required

## Canonical edge chain
DataSource -> RawAsset -> Pipeline -> Neuron -> OntologyObject -> RelationshipGraph -> FeatureFunction -> ModelOutput -> Workflow -> Action -> AuditRecord -> Neuron

## Relationship examples
- DERIVED_FROM
- OBSERVED_AT
- LOCATED_IN
- AFFECTS
- TRIGGERS
- GOVERNED_BY
- EVIDENCED_BY
- USED_BY_MODEL
- CREATES_WORKFLOW
- PRODUCES_ACTION
- AUDITED_BY
