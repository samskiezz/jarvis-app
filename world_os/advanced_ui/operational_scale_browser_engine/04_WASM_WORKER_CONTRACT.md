# WASM Worker Contract

Worker inputs:
- graph delta buffer
- node attribute buffer
- edge index buffer
- viewport/camera state
- clustering mode
- layout mode

Worker outputs:
- Float32Array node positions
- Uint32Array visible node ids
- Uint32Array visible edge ids
- cluster summaries
- pick-buffer object IDs

Rules:
- no DOM access
- no network access from layout worker
- deterministic layout seed for replay
- every output linked to workspace version and graph sequence
