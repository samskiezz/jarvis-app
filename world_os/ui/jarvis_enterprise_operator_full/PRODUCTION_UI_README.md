# V5 Production UI Pack

This folder now includes production UX/UI artefacts, not just a demonstrator.

## Included
- Design tokens and colour/effect rules.
- Route registry with page/subpage coverage.
- Dead-end audit for every page.
- Button/action registry with enabled states, risk and approval logic.
- Data-table rendering contracts.
- Component specifications.
- Operator user flows.
- Reference React/TypeScript shell.
- Graph policy engine that blocks random/unverified edges.
- Protobuf/WebSocket/WASM/GPU picking/quaternion contracts from V4.

## Design rules
1. No random vector lines.
2. No page without back path, empty state, error state and primary action.
3. No action button without risk, enabled condition, policy path and failure state.
4. No graph edge without relationship type, confidence, evidence ID and audit ID.
5. No AI/Jarvis output without policy-filtered context and citations/evidence when used for decisions.
6. No source acquisition without source legal/terms review.
7. No heavy visualisation through DOM if data exceeds operational thresholds.

## Production note
The reference UI is intentionally framework-agnostic in architecture. The included TypeScript shell is a source implementation starter, while heavy graph/map rendering should move to WebGPU/WebGL + WASM once connected to live services.
