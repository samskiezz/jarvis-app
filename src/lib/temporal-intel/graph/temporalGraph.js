export class TemporalWorldStateGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
    this.snapshots = [];
  }

  upsertNode(node) {
    const id = node.id || globalThis.crypto.randomUUID();
    const existing = this.nodes.get(id) || {};
    this.nodes.set(id, {
      ...existing,
      ...node,
      id,
      first_seen: existing.first_seen || Date.now(),
      last_updated: Date.now()
    });
    return id;
  }

  addEdge(edge) {
    this.edges.push({
      id: globalThis.crypto.randomUUID(),
      weight: 1,
      confidence: 0.5,
      valid_from: Date.now(),
      valid_to: null,
      ...edge
    });
  }

  neighbors(nodeId, { hops = 2 } = {}) {
    const frontier = new Set([nodeId]);
    const visited = new Set([nodeId]);
    for (let i = 0; i < hops; i += 1) {
      const next = new Set();
      for (const edge of this.edges) {
        if (frontier.has(edge.from) && !visited.has(edge.to)) next.add(edge.to);
        if (frontier.has(edge.to) && !visited.has(edge.from)) next.add(edge.from);
      }
      next.forEach((item) => visited.add(item));
      frontier.clear();
      next.forEach((item) => frontier.add(item));
    }
    visited.delete(nodeId);
    return [...visited].map((id) => this.nodes.get(id)).filter(Boolean);
  }

  snapshot(timestamp = Date.now()) {
    const snap = {
      timestamp,
      nodes: [...this.nodes.values()],
      edges: this.edges.map((edge) => ({ ...edge }))
    };
    this.snapshots.push(snap);
    return snap;
  }

  queryAsOf(timestamp) {
    const ordered = [...this.snapshots].sort((a, b) => a.timestamp - b.timestamp);
    let selected = null;
    for (const snap of ordered) {
      if (snap.timestamp <= timestamp) selected = snap;
    }
    return selected;
  }
}
