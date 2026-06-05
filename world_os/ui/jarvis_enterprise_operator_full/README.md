# Jarvis Enterprise Operator Full UI

This is the complete architecture-aware UI source tree for the pack.

## What it does
- Loads `architecture.manifest.json`.
- Understands Foundry, Gotham, Apollo and AIP as separate operating planes.
- Renders typed architecture nodes and evidence-backed edges.
- Enforces no-random-edge rendering rules through `graphPolicy.ts`.
- Provides a Jarvis operator panel for tracing flows, gaps, deployments and mission paths.
- Includes high-performance production contracts for Protobuf, WebSocket binary deltas, WASM workers, GPU picking and quaternion camera math.

## What still requires engineering
- Replace SVG reference graph with WebGPU/WebGL instanced renderer for 50k+ nodes.
- Compile Rust/C++ WASM layout engine.
- Wire live gRPC-Web/WebSocket Protobuf streams.
- Wire CRDT multiplayer persistence.
- Connect to real backend APIs and auth/policy services.
