
/// <reference lib="webworker" />
// Production path: replace this reference worker with Rust/C++ WASM physics/layout.
// This worker deliberately has no DOM access and only receives graph layout payloads.

type WorkerNode = { id: string; x?: number; y?: number; plane?: string };
type LayoutRequest = { type: 'layout'; nodes: WorkerNode[] };

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  if (event.data.type !== 'layout') return;
  const nodes = event.data.nodes.map((n, i) => {
    const angle = (Math.PI * 2 * i) / Math.max(1, event.data.nodes.length);
    const radius = 220 + (i % 5) * 35;
    return { id: n.id, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  self.postMessage({ type: 'layout_result', nodes });
};
