# Source to Neuron to Action Design

## Meaning of neuron
A neuron is an engineering abstraction for a reusable memory/feature node. It is not a biological claim.

Each neuron is:
- a vector record
- a graph node
- a metadata object
- a provenance container
- a policy-controlled memory point
- a feature-function target
- an audit participant

## Operational chain
Source -> RawAsset -> Pipeline -> Neuron -> OntologyObject -> RelationshipGraph -> FeatureFunction -> ModelOutput -> Workflow -> Action -> AuditRecord -> Neuron feedback.

## Why it matters
This lets the system remember not just content, but context:
- where a fact came from
- how reliable it is
- what object it belongs to
- what workflows it affected
- what action was taken
- how the result fed back into future decisions
