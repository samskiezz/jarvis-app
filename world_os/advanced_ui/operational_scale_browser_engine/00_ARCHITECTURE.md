# Operational-Scale Browser Engine

## Core principle
The UI shell may use a standard framework for menus, panels and command routing, but heavy operational visualisation must bypass DOM/SVG/Canvas2D.

## Production rendering stack
- Data transport: gRPC-Web and WebSocket streams using Protobuf binary frames.
- State sync: CRDT document state for multiplayer collaboration.
- Heavy layout/physics: Rust or C++ compiled to WASM, executed in Web Workers.
- Shared memory: SharedArrayBuffer with cross-origin isolation headers.
- Rendering: WebGPU primary, WebGL fallback, instanced rendering for large node/edge sets.
- Hit detection: GPU color picking using an offscreen framebuffer.
- Camera math: quaternions and spherical linear interpolation.
- Dense UI shell: compact enterprise design system; Blueprint-style density is acceptable.
- Ontology interface: UI talks to Objects, Properties, Links, Actions and Workflows, not raw tables.

## Non-negotiable rule
Every visual node, edge, map object, timeline entry and action button must be backed by a typed ontology object, relationship record, evidence ID, policy decision and audit path.
