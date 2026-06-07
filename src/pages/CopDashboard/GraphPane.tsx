/**
 * GraphPane — COP graph pane showing node-link subgraph.
 *
 * A lightweight SVG radial layout (like Investigations MiniGraph) so it works
 * inside the small pane without a full canvas engine. Click a node to select.
 */
import { useMemo } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";
import { panelStyle, panelHeaderStyle } from "./CopDashboard";

interface Node {
  id: string;
  label?: string;
  type?: string;
  mark?: string;
}

interface Edge {
  a: string;
  b: string;
  strength?: number;
  relation?: string;
}

interface Props {
  nodes: Node[];
  edges: Edge[];
  highlightNodes?: Node[];
  highlightEdges?: Edge[];
  selection?: any;
  onSelect: (node: Node) => void;
}

export default function GraphPane({ nodes, edges, highlightNodes, highlightEdges, selection, onSelect }: Props) {
  const displayNodes = useMemo(() => {
    const hl = highlightNodes || [];
    const base = nodes.slice(0, 80);
    const hlIds = new Set(hl.map((n) => n.id));
    // Merge highlighted nodes into the base set
    const merged = [...base];
    const existing = new Set(base.map((n) => n.id));
    for (const n of hl) {
      if (!existing.has(n.id)) {
        merged.push(n);
        existing.add(n.id);
      }
    }
    return merged;
  }, [nodes, highlightNodes]);

  const displayEdges = useMemo(() => {
    const ids = new Set(displayNodes.map((n) => n.id));
    const base = edges.filter((e) => ids.has(e.a) && ids.has(e.b));
    const hl = highlightEdges || [];
    const existing = new Set(base.map((e) => `${e.a}|${e.b}`));
    const merged = [...base];
    for (const e of hl) {
      const key = `${e.a}|${e.b}`;
      if (!existing.has(key) && ids.has(e.a) && ids.has(e.b)) {
        merged.push(e);
        existing.add(key);
      }
    }
    return merged.slice(0, 120);
  }, [displayNodes, edges, highlightEdges]);

  const W = 520;
  const H = 320;
  const R = Math.min(W, H) / 2 - 28;

  const pos = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    displayNodes.forEach((n, i, arr) => {
      const a = (i / Math.max(1, arr.length)) * Math.PI * 2;
      map[n.id] = { x: W / 2 + R * Math.cos(a), y: H / 2 + R * Math.sin(a) };
    });
    return map;
  }, [displayNodes, R]);

  const selectedId = selection?.id || selection?.object_id;
  const hlNodeIds = new Set((highlightNodes || []).map((n) => n.id));

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle(C.purple)}>GRAPH</div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {displayNodes.length === 0 ? (
          <div style={{ color: C.text, fontSize: 10, padding: 20 }}>empty graph</div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", minHeight: H }}>
            {displayEdges.map((e, i) => {
              const a = pos[e.a];
              const b = pos[e.b];
              if (!a || !b) return null;
              const isHl = hlNodeIds.has(e.a) && hlNodeIds.has(e.b);
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={isHl ? `${C.purple}80` : `${C.text}30`}
                  strokeWidth={isHl ? 1.2 : 0.6}
                />
              );
            })}
            {displayNodes.map((n) => {
              const p = pos[n.id];
              if (!p) return null;
              const isSel = selectedId === n.id;
              const isHl = hlNodeIds.has(n.id);
              const r = isSel ? 6 : isHl ? 5 : 3.5;
              const fill = isSel ? C.purple : isHl ? `${C.purple}cc` : C.neon;
              return (
                <g
                  key={n.id}
                  onClick={() => onSelect({ ...n, source_pane: "graph" })}
                  style={{ cursor: "pointer" }}
                >
                  <circle cx={p.x} cy={p.y} r={r} fill={fill} stroke={S.bg} strokeWidth={1} />
                  {(isSel || isHl) && (
                    <text x={p.x + 8} y={p.y + 3} fill={C.textB} fontSize={8} fontFamily="monospace">
                      {n.label || n.id}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
