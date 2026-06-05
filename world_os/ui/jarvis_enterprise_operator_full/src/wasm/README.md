# WASM Layout Engine

Production implementation target:
- Rust or C++ compiled to WASM.
- Runs inside Web Worker.
- Inputs: binary graph delta, node attributes, edge index, viewport state.
- Outputs: SharedArrayBuffer-backed Float32Array positions and Uint32Array visible IDs.
- Deterministic layout seed required for audit replay.

This package includes the contract and worker boundary; the real WASM binary must be built by the UI/graphics team.
