"""JARVIS MERKLE — content-addressed Merkle-DAG + store-and-forward sync.

For sovereign edge/air-gapped operation you need verifiable, conflict-free state
transfer: nodes are content-addressed (id = hash of content + child links), so the
root hash commits to the entire history (tamper-evident), and two replicas
reconcile by exchanging only the nodes the other is missing.

  * CONTENT ADDRESSING — identical content (and links) => identical id; structural
    sharing/dedup is automatic.
  * INTEGRITY — verify() recomputes every id and checks every link resolves; any
    mutation changes the id and is detected.
  * SYNC — want_list(remote_root, remote_nodes) returns exactly the reachable nodes
    a replica lacks; export_bundle/import_bundle move them; import re-verifies every
    hash (a corrupted bundle node raises).

This is the model for git/IPFS-style sync and the air-gap import/export workflow.
Pure stdlib (sha256).
"""

from __future__ import annotations

import hashlib
import json


def node_hash(data, links: list[str]) -> str:
    payload = json.dumps({"data": data, "links": sorted(links)},
                         sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class MerkleDAG:
    def __init__(self):
        self.nodes: dict[str, dict] = {}     # hash -> {"data":..., "links":[...]}

    def add(self, data, links: list[str] | None = None) -> str:
        links = list(links or [])
        h = node_hash(data, links)
        self.nodes[h] = {"data": data, "links": links}
        return h

    def get(self, h: str) -> dict | None:
        return self.nodes.get(h)

    def reachable(self, root: str, source: dict | None = None) -> set[str]:
        source = source if source is not None else self.nodes
        seen, stack = set(), [root]
        while stack:
            h = stack.pop()
            if h in seen or h not in source:
                continue
            seen.add(h)
            stack.extend(source[h]["links"])
        return seen

    def verify(self) -> dict:
        """Recompute every id; report broken nodes and dangling links."""
        broken, dangling = [], []
        for h, n in self.nodes.items():
            if node_hash(n["data"], n["links"]) != h:
                broken.append(h)
            for l in n["links"]:
                if l not in self.nodes:
                    dangling.append((h, l))
        return {"ok": not broken and not dangling, "broken": broken, "dangling": dangling}

    # -- store-and-forward sync ----------------------------------------------
    def export_bundle(self, root: str) -> dict[str, dict]:
        return {h: self.nodes[h] for h in self.reachable(root)}

    def want_list(self, remote_root: str, remote_nodes: dict[str, dict]) -> list[str]:
        """Hashes reachable from remote_root (in the remote set) that we lack."""
        need = self.reachable(remote_root, source=remote_nodes)
        return sorted(need - set(self.nodes))

    def import_bundle(self, bundle: dict[str, dict]) -> int:
        """Add nodes after re-verifying each hash. Corrupt node => ValueError."""
        added = 0
        for h, n in bundle.items():
            if node_hash(n["data"], n["links"]) != h:
                raise ValueError(f"tamper: node {h[:12]} hash mismatch")
            if h not in self.nodes:
                self.nodes[h] = {"data": n["data"], "links": list(n["links"])}
                added += 1
        return added
