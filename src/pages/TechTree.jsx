/**
 * TechTree — capability dependency tree.
 * A static capability graph (real Apex plugin capabilities) laid out in tiers,
 * rendered as SVG nodes connected by dependency lines. Nodes have locked /
 * unlocked local state; a node can only be unlocked when its prerequisites are.
 * Clicking a node opens a detail panel.
 */
import { useState, useMemo } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge } from "@/components/PageKit";

const ACCENT = C.purple;

// Capability graph — real plugin capabilities. tier drives x-layout, deps gate unlock.
const NODES = [
  { id: "llm",    name: "LLM Gateway",        tier: 0, deps: [], desc: "Unified inference router across model providers — the root of every reasoning capability." },
  { id: "gpu",    name: "GPU Compute",        tier: 0, deps: [], desc: "Elastic accelerator pool that powers training, embeddings and large-batch inference." },
  { id: "rag",    name: "RAG Memory",         tier: 1, deps: ["llm"], desc: "Retrieval-augmented memory store grounding the LLM Gateway in real corpus facts." },
  { id: "vision", name: "Vision Multimodal",  tier: 1, deps: ["llm", "gpu"], desc: "Image / document understanding feeding multimodal context into the gateway." },
  { id: "graph",  name: "Graph Intelligence", tier: 2, deps: ["rag"], desc: "Entity-relationship graph layered on RAG memory for traversal & inference." },
  { id: "opt",    name: "Optimisation",       tier: 2, deps: ["gpu"], desc: "Solver / scheduler that optimises resource and workflow allocation." },
  { id: "quantum",name: "Quantum Sim",        tier: 3, deps: ["opt"], desc: "Quantum circuit simulation for hard combinatorial optimisation problems." },
  { id: "agent",  name: "Agent Workflow",     tier: 3, deps: ["graph", "rag"], desc: "Autonomous multi-step agents orchestrating tools over the graph & memory." },
];

const TIER_W = 240;
const NODE_W = 168;
const NODE_H = 56;
const ROW_GAP = 84;

// Lay nodes out: tier => column, stacked vertically within tier.
function layout() {
  const byTier = {};
  NODES.forEach((n) => { (byTier[n.tier] ||= []).push(n); });
  const pos = {};
  Object.entries(byTier).forEach(([tier, list]) => {
    list.forEach((n, i) => {
      pos[n.id] = {
        x: Number(tier) * TIER_W + 30,
        y: i * (NODE_H + ROW_GAP) + 40,
      };
    });
  });
  const maxRows = Math.max(...Object.values(byTier).map((l) => l.length));
  const maxTier = Math.max(...NODES.map((n) => n.tier));
  return { pos, width: (maxTier + 1) * TIER_W + 40, height: maxRows * (NODE_H + ROW_GAP) + 40 };
}

export default function TechTree() {
  const { pos, width, height } = useMemo(layout, []);
  // Root nodes (no deps) start unlocked.
  const [unlocked, setUnlocked] = useState(() => {
    const init = {};
    NODES.forEach((n) => { init[n.id] = n.deps.length === 0; });
    return init;
  });
  const [selected, setSelected] = useState(NODES[0].id);

  const canUnlock = (n) => n.deps.every((d) => unlocked[d]);

  const toggle = (n) => {
    setUnlocked((prev) => {
      if (prev[n.id]) {
        // lock — also lock anything depending on it (cascade)
        const next = { ...prev, [n.id]: false };
        let changed = true;
        while (changed) {
          changed = false;
          NODES.forEach((m) => {
            if (next[m.id] && !m.deps.every((d) => next[d])) { next[m.id] = false; changed = true; }
          });
        }
        return next;
      }
      if (!n.deps.every((d) => prev[d])) return prev; // gated
      return { ...prev, [n.id]: true };
    });
  };

  const sel = NODES.find((n) => n.id === selected);
  const unlockedCount = Object.values(unlocked).filter(Boolean).length;

  return (
    <PageShell title="TECH TREE" subtitle="CAPABILITY DEPENDENCY GRAPH — UNLOCK PREREQUISITES TO PROGRESS" accent={ACCENT}>
      <Grid min={150} gap={10} style={{ marginBottom: 14 }}>
        <StatTile label="Capabilities" value={NODES.length} accent={ACCENT} />
        <StatTile label="Unlocked" value={unlockedCount} accent={C.neon} />
        <StatTile label="Locked" value={NODES.length - unlockedCount} accent={C.text} />
        <StatTile label="Completion" value={`${Math.round((unlockedCount / NODES.length) * 100)}%`} accent={C.gold} />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 14, alignItems: "start" }}>
        <PanelCard title="CAPABILITY TREE" accent={ACCENT}>
          <div style={{ overflowX: "auto" }}>
            <svg width={width} height={height} style={{ display: "block" }}>
              {/* dependency lines */}
              {NODES.map((n) =>
                n.deps.map((d) => {
                  const from = pos[d], to = pos[n.id];
                  const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2;
                  const x2 = to.x, y2 = to.y + NODE_H / 2;
                  const live = unlocked[d];
                  const mid = (x1 + x2) / 2;
                  return (
                    <path key={`${d}-${n.id}`}
                      d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                      fill="none" stroke={live ? ACCENT : C.border} strokeWidth={live ? 1.6 : 1}
                      strokeDasharray={live ? "0" : "4 4"} opacity={live ? 0.9 : 0.5} />
                  );
                })
              )}
              {/* nodes */}
              {NODES.map((n) => {
                const p = pos[n.id];
                const on = unlocked[n.id];
                const gated = !on && !canUnlock(n);
                const isSel = selected === n.id;
                const col = on ? ACCENT : gated ? C.text : C.gold;
                return (
                  <g key={n.id} transform={`translate(${p.x},${p.y})`}
                    style={{ cursor: "pointer" }} onClick={() => setSelected(n.id)}>
                    <rect width={NODE_W} height={NODE_H} rx={6}
                      fill={on ? ACCENT + "1f" : "rgba(0,0,0,0.4)"}
                      stroke={isSel ? C.neon : col} strokeWidth={isSel ? 2 : 1.2} />
                    <circle cx={14} cy={NODE_H / 2} r={4} fill={col} />
                    <text x={28} y={NODE_H / 2 - 3} fill={C.textB} fontSize={10} fontWeight={700}
                      fontFamily="'JetBrains Mono',monospace">{n.name}</text>
                    <text x={28} y={NODE_H / 2 + 12} fill={col} fontSize={7.5}
                      fontFamily="'JetBrains Mono',monospace">
                      {on ? "● UNLOCKED" : gated ? "🔒 LOCKED" : "○ AVAILABLE"}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </PanelCard>

        <PanelCard title="DETAIL" accent={ACCENT}>
          {sel && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.textB }}>{sel.name}</div>
              <div>
                {unlocked[sel.id]
                  ? <Badge color={C.neon}>UNLOCKED</Badge>
                  : canUnlock(sel)
                    ? <Badge color={C.gold}>AVAILABLE</Badge>
                    : <Badge color={C.text}>LOCKED</Badge>}
              </div>
              <div style={{ fontSize: 9.5, color: C.text, lineHeight: 1.6 }}>{sel.desc}</div>
              <div>
                <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 5 }}>PREREQUISITES</div>
                {sel.deps.length === 0
                  ? <span style={{ fontSize: 9, color: C.text }}>None — root capability.</span>
                  : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {sel.deps.map((d) => {
                        const dn = NODES.find((m) => m.id === d);
                        return <Badge key={d} color={unlocked[d] ? C.neon : C.red}>{dn.name}</Badge>;
                      })}
                    </div>
                  )}
              </div>
              <button onClick={() => toggle(sel)}
                disabled={!unlocked[sel.id] && !canUnlock(sel)}
                style={{
                  marginTop: 4, padding: "8px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                  letterSpacing: 1, fontFamily: "inherit",
                  cursor: (!unlocked[sel.id] && !canUnlock(sel)) ? "not-allowed" : "pointer",
                  background: unlocked[sel.id] ? C.redD : ACCENT + "1a",
                  border: `1px solid ${unlocked[sel.id] ? C.red + "66" : ACCENT + "66"}`,
                  color: unlocked[sel.id] ? C.red : ACCENT,
                  opacity: (!unlocked[sel.id] && !canUnlock(sel)) ? 0.4 : 1,
                }}>
                {unlocked[sel.id] ? "◼ LOCK CAPABILITY" : canUnlock(sel) ? "▶ UNLOCK" : "🔒 PREREQS REQUIRED"}
              </button>
            </div>
          )}
        </PanelCard>
      </div>
    </PageShell>
  );
}
