# Jarvis Enterprise Command UI — Product Architecture

## Correction
This UI is not claiming Palantir uses React or Three.js. The included web shell is a demonstrator only. The production UI architecture is framework-agnostic and can be implemented in any enterprise front-end stack.

## Three operating planes

### 1. Foundry Plane
Purpose: operate the data and ontology system.
User sees:
- source catalogue
- pipeline topology
- dataset lineage
- ontology object explorer
- graph/vector memory
- quality gates
- release controls
- audit evidence

Backend calls:
- Source Registry API
- Pipeline Registry API
- Object Runtime API
- Graph Query API
- Vector Retrieval API
- Lineage API
- Audit API

### 2. Gotham Plane
Purpose: operate the mission/intelligence system.
User sees:
- common operating picture
- live alerts
- entity cards
- geospatial map
- timeline replay
- evidence chains
- case workspace
- action approval queue
- AI briefing panel

Backend calls:
- Event Stream API
- Entity Resolution API
- Relationship Graph API
- Geospatial Tile API
- Timeline API
- Workflow API
- Action Engine API
- Audit Replay API

### 3. Apollo Plane
Purpose: operate the runtime/deployment state of the full platform.
User sees:
- desired state
- current state
- drift
- fleet health
- rollout waves
- release gates
- rollback candidates
- connector/parser/model versions
- policy compliance

Backend calls:
- Desired State API
- Fleet Agent API
- Rollout Planner API
- Health Gate API
- Drift Detector API
- Rollback Engine API
- SBOM/CVE API
- Deployment Audit API

## Visualisation design
Do not use fake random lines. Every visible edge must come from a typed relationship record:
- Source -> RawAsset
- RawAsset -> Pipeline
- Pipeline -> OntologyObject
- OntologyObject -> RelationshipGraph
- RelationshipGraph -> ModelOutput
- ModelOutput -> Workflow
- Workflow -> Action
- Action -> AuditRecord

## Interaction model
The operator can ask Jarvis:
- trace this source
- show impacted objects
- explain this alert
- run what-if scenario
- create a case
- propose action
- deploy connector through Apollo approval
- replay decision
- show data lineage
- show policy gates
