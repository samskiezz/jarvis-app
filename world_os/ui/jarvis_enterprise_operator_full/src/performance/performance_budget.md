# Performance Budget

## UI thread
- No task over 50ms during interaction.
- No large JSON graph parse on main thread.
- Use binary Protobuf deltas for high-volume graph/event payloads.
- Use Web Worker / WASM for graph layout, clustering, path finding and heavy calculations.

## Graph visualisation thresholds
- 0-5,000 nodes: SVG/reference renderer acceptable for development.
- 5,000-50,000 nodes: WebGL/WebGPU renderer required.
- 50,000+ nodes: instanced rendering, viewport culling, LOD and edge bundling required.
- 10,000+ selectable objects: GPU color picking required.
- 10,000+ layout nodes: WASM worker required.

## Data tables
- 1,000+ rows: virtualised table rendering.
- 10,000+ rows: server-side pagination, sort and filter.
- 100,000+ rows: query-backed result windows only, never full client load.

## Telemetry per route
Every route must emit:
- first_contentful_panel_ms
- data_query_ms
- render_frame_ms
- table_rows_visible
- graph_nodes_visible
- graph_edges_visible
- dropped_frames
- policy_denied_count
- error_count
