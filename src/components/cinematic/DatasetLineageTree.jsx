/**
 * DatasetLineageTree — F278.
 *
 * Data sources:
 *   GET  /v1/datasets                → {items:[{name,source,...}]}
 *   GET  /v1/datasets/{name}/lineage → {dataset, nodes:[str], edges:[{output,input,op}]}
 *   GET  /v1/datasets/{name}/health  → {found,rows,freshness_ms,null_rate,...}
 *
 * Displays:
 *   - ◈ LINGTREE button  left:203480  bottom:8  zIndex:374
 *   - Dataset name selector from GET /v1/datasets
 *   - SVG 3-column tree: upstream sources (left) → selected dataset (centre) → downstream consumers (right)
 *   - Node color = derived health status (HEALTHY=green / DEGRADED=amber / DOWN=red / UNKNOWN=dim)
 *   - Click node → health detail tooltip
 *   - Lineage depth counter in header
 *   - ASSESS speaks about data quality chain and bottlenecks + TTS
 *
 * Toggle: ◈ LINGTREE  left:203480  bottom:8  zIndex:374
 * Event:  jarvis:lingtree-toggle
 * Voice:  "lineage / dataset lineage / lingtree / data quality chain / provenance /
 *          upstream / downstream dataset / data lineage"
 *
 * Exported for JarvisBrain: isLingtreeQuery
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ─── palette ──────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const GN   = "#00E5A0";
const AM   = "#F5A623";
const RD   = "#F87171";
const DIM  = "#566878";
const SURF = "rgba(4,10,18,0.97)";
const BORD = "rgba(41,231,255,0.18)";

// ─── constants ────────────────────────────────────────────────────────────────
const BTN_LEFT  = 203480;
const PANEL_W   = 700;
const PANEL_H   = 540;
const SVG_H     = 340;
const COL_LEFT  = 110;
const COL_MID   = 350;
const COL_RIGHT = 590;
const NODE_RX   = 52;
const NODE_RY   = 18;
const ROW_GAP   = 52;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── JarvisBrain export ───────────────────────────────────────────────────────
const LINGTREE_RE =
  /\b(lineage|dataset\s+lineage|lingtree|data\s+quality\s+chain|provenance|upstream\s+dataset|downstream\s+dataset|data\s+lineage)\b/i;

export function isLingtreeQuery(q) {
  return LINGTREE_RE.test(q || "");
}

// ─── health classification ────────────────────────────────────────────────────
function healthStatus(h) {
  if (!h || !h.found) return "DOWN";
  if (!h.rows || h.rows === 0) return "DOWN";
  if ((h.null_rate != null && h.null_rate > 0.1) ||
      (h.freshness_ms != null && h.freshness_ms > 86_400_000)) return "DEGRADED";
  return "HEALTHY";
}

function statusColor(s) {
  if (s === "HEALTHY")  return GN;
  if (s === "DEGRADED") return AM;
  if (s === "DOWN")     return RD;
  return DIM;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
async function apiFetch(path) {
  const r = await fetch(`${apiBase()}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function fmtFreshness(ms) {
  if (ms == null) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

async function tts(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) return;
    const blob = await r.blob();
    const url  = URL.createObjectURL(blob);
    const a    = new Audio(url);
    a.play();
    a.onended = () => URL.revokeObjectURL(url);
  } catch (_) {}
}

// Classify lineage nodes into upstream ancestors, centre, downstream descendants.
function classifyNodes(dataset, edges) {
  const upstream   = new Set();
  const downstream = new Set();

  function walkUp(name, visited = new Set()) {
    if (visited.has(name)) return;
    visited.add(name);
    for (const e of edges) {
      if (e.output === name && e.input !== dataset) {
        upstream.add(e.input);
        walkUp(e.input, visited);
      }
    }
  }

  function walkDown(name, visited = new Set()) {
    if (visited.has(name)) return;
    visited.add(name);
    for (const e of edges) {
      if (e.input === name && e.output !== dataset) {
        downstream.add(e.output);
        walkDown(e.output, visited);
      }
    }
  }

  walkUp(dataset);
  walkDown(dataset);

  return {
    upstream:   [...upstream],
    downstream: [...downstream],
  };
}

// Compute SVG depth = max(upstream chain depth, downstream chain depth).
function computeDepth(dataset, edges) {
  function depth(name, dir, visited = new Set()) {
    if (visited.has(name)) return 0;
    visited.add(name);
    const neighbors = dir === "up"
      ? edges.filter(e => e.output === name).map(e => e.input)
      : edges.filter(e => e.input  === name).map(e => e.output);
    if (!neighbors.length) return 0;
    return 1 + Math.max(...neighbors.map(n => depth(n, dir, new Set(visited))));
  }
  return Math.max(depth(dataset, "up"), depth(dataset, "down"));
}

// ─── NodeTooltip ──────────────────────────────────────────────────────────────
function NodeTooltip({ health, onClose }) {
  if (!health) return null;
  const st = healthStatus(health);
  const col = statusColor(st);
  return (
    <div style={{
      position: "absolute", right: 0, top: 0, zIndex: 10,
      background: "rgba(4,10,18,0.97)", border: `1px solid ${col}55`,
      borderRadius: 10, padding: "10px 14px", minWidth: 220,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
      boxShadow: `0 0 24px ${col}22`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ color: col, fontSize: 11, fontWeight: 700 }}>
          {health.name}
        </span>
        <span style={{
          marginLeft: "auto", color: col, background: col + "22",
          borderRadius: 6, padding: "1px 6px", fontSize: 9, fontWeight: 900,
        }}>
          {st}
        </span>
        <button onClick={onClose} style={{
          background: "none", border: "none", color: DIM,
          cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1,
        }}>×</button>
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        {[
          ["Series",   health.series_id || "—"],
          ["Rows",     health.rows != null ? health.rows.toLocaleString() : "—"],
          ["Freshness", fmtFreshness(health.freshness_ms)],
          ["Null rate", health.null_rate != null ? (health.null_rate * 100).toFixed(1) + "%" : "—"],
        ].map(([k, v]) => (
          <tr key={k}>
            <td style={{ color: DIM, paddingRight: 10, paddingBottom: 2 }}>{k}</td>
            <td style={{ color: CY }}>{String(v)}</td>
          </tr>
        ))}
      </table>
    </div>
  );
}

// ─── LineageTree ──────────────────────────────────────────────────────────────
export default function DatasetLineageTree() {
  const [open,       setOpen]       = useState(false);
  const [datasets,   setDatasets]   = useState([]);
  const [selected,   setSelected]   = useState("");
  const [lineage,    setLineage]     = useState(null);
  const [healthMap,  setHealthMap]   = useState({});
  const [loading,    setLoading]     = useState(false);
  const [tooltip,    setTooltip]     = useState(null); // {name, health}
  const [assessing,  setAssessing]   = useState(false);
  const [assessment, setAssessment]  = useState("");

  // Load dataset list on open
  const loadDatasets = useCallback(async () => {
    try {
      const d = await apiFetch("/v1/datasets");
      const items = Array.isArray(d)        ? d
        : Array.isArray(d?.items)           ? d.items
        : Array.isArray(d?.datasets)        ? d.datasets
        : [];
      setDatasets(items);
      if (items.length && !selected) setSelected(items[0].name || "");
    } catch (_) {}
  }, [selected]);

  useEffect(() => {
    if (open) loadDatasets();
  }, [open, loadDatasets]);

  // Load lineage + health when selected changes
  const loadLineage = useCallback(async (name) => {
    if (!name) return;
    setLoading(true);
    setLineage(null);
    setHealthMap({});
    setTooltip(null);
    setAssessment("");
    try {
      const lin = await apiFetch(`/v1/datasets/${encodeURIComponent(name)}/lineage`);
      setLineage(lin);

      // Fetch health for all nodes in parallel (max 12)
      const nodes = Array.isArray(lin.nodes) ? lin.nodes.slice(0, 12) : [name];
      const results = await Promise.allSettled(
        nodes.map(n => apiFetch(`/v1/datasets/${encodeURIComponent(n)}/health`))
      );
      const hm = {};
      results.forEach((r, i) => {
        hm[nodes[i]] = r.status === "fulfilled" ? r.value : null;
      });
      setHealthMap(hm);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && selected) loadLineage(selected);
  }, [open, selected, loadLineage]);

  // Toggle event
  useEffect(() => {
    function onToggle() { setOpen(v => !v); }
    window.addEventListener("jarvis:lingtree-toggle", onToggle);
    return () => window.removeEventListener("jarvis:lingtree-toggle", onToggle);
  }, []);

  // ASSESS
  const assess = useCallback(async () => {
    if (!lineage) return;
    setAssessing(true);
    setAssessment("");
    try {
      const { upstream, downstream } = classifyNodes(selected, lineage.edges || []);
      const nodeCount = (lineage.nodes || []).length;
      const downStatuses = downstream.map(n => {
        const h = healthMap[n];
        return healthStatus(h);
      });
      const degraded = [...upstream, ...downstream].filter(n => {
        const h = healthMap[n];
        return healthStatus(h) === "DEGRADED" || healthStatus(h) === "DOWN";
      });

      const prompt =
        `Dataset lineage report for "${selected}": ` +
        `${upstream.length} upstream source(s), ${downstream.length} downstream consumer(s), ` +
        `${nodeCount} total nodes. ` +
        (degraded.length
          ? `Unhealthy nodes: ${degraded.join(", ")}.`
          : "All nodes healthy.") +
        " Summarise data quality chain health and top bottleneck in 2 sentences.";

      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text =
        d?.response || d?.reply || d?.message || d?.content ||
        (typeof d === "string" ? d : "No assessment available.");
      setAssessment(text);
      tts(text);
    } catch (_) {
      setAssessment("Assessment unavailable.");
    }
    setAssessing(false);
  }, [lineage, selected, healthMap]);

  // ── Build SVG ───────────────────────────────────────────────────────────────
  function renderSvg() {
    if (!lineage) return null;
    const edges  = lineage.edges || [];
    const { upstream, downstream } = classifyNodes(selected, edges);
    const depth  = computeDepth(selected, edges);

    const svgH = Math.max(
      SVG_H,
      (Math.max(upstream.length, downstream.length, 1) + 1) * ROW_GAP + 60
    );

    function nodeY(idx, total) {
      if (total === 0) return svgH / 2;
      const span = total * ROW_GAP;
      const start = svgH / 2 - span / 2 + ROW_GAP / 2;
      return start + idx * ROW_GAP;
    }

    const midY = svgH / 2;

    function nodeEl(name, cx, cy) {
      const h  = healthMap[name];
      const st = h ? healthStatus(h) : "UNKNOWN";
      const col = statusColor(st);
      const label = name.length > 13 ? name.slice(0, 11) + "…" : name;
      const isSelected = name === selected;
      return (
        <g
          key={name + cx}
          style={{ cursor: "pointer" }}
          onClick={() => setTooltip(
            tooltip?.name === name ? null : { name, health: h }
          )}
        >
          <ellipse
            cx={cx} cy={cy} rx={NODE_RX} ry={NODE_RY}
            fill={isSelected ? col + "33" : "rgba(4,10,18,0.82)"}
            stroke={col}
            strokeWidth={isSelected ? 2 : 1.5}
          />
          {isSelected && (
            <ellipse
              cx={cx} cy={cy} rx={NODE_RX + 6} ry={NODE_RY + 5}
              fill="none" stroke={col} strokeWidth={0.5} strokeDasharray="3 3" opacity={0.5}
            />
          )}
          <text
            x={cx} y={cy + 4}
            textAnchor="middle"
            fill={col}
            fontSize={9}
            fontFamily="'JetBrains Mono',monospace"
            fontWeight={isSelected ? 700 : 500}
            style={{ pointerEvents: "none" }}
          >
            {label}
          </text>
        </g>
      );
    }

    function edgeLine(x1, y1, x2, y2, col) {
      const mx = (x1 + x2) / 2;
      return (
        <path
          key={`${x1}${y1}${x2}${y2}`}
          d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
          fill="none"
          stroke={col}
          strokeWidth={1}
          opacity={0.4}
          strokeDasharray="4 3"
        />
      );
    }

    return (
      <svg
        width="100%" viewBox={`0 0 ${PANEL_W} ${svgH}`}
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Column labels */}
        {[
          [COL_LEFT,  "UPSTREAM"],
          [COL_MID,   "CENTRE"],
          [COL_RIGHT, "DOWNSTREAM"],
        ].map(([x, label]) => (
          <text
            key={label}
            x={x} y={18}
            textAnchor="middle"
            fill={DIM}
            fontSize={8}
            fontFamily="'JetBrains Mono',monospace"
            letterSpacing={2}
          >
            {label}
          </text>
        ))}

        {/* Edges from upstream → centre */}
        {upstream.map((name, i) => {
          const h  = healthMap[name];
          const st = h ? healthStatus(h) : "UNKNOWN";
          const col = statusColor(st);
          const y1 = nodeY(i, upstream.length);
          return edgeLine(COL_LEFT + NODE_RX, y1, COL_MID - NODE_RX, midY, col);
        })}

        {/* Edges from centre → downstream */}
        {downstream.map((name, i) => {
          const h  = healthMap[name];
          const st = h ? healthStatus(h) : "UNKNOWN";
          const col = statusColor(st);
          const y2 = nodeY(i, downstream.length);
          return edgeLine(COL_MID + NODE_RX, midY, COL_RIGHT - NODE_RX, y2, col);
        })}

        {/* Upstream nodes */}
        {upstream.map((name, i) =>
          nodeEl(name, COL_LEFT, nodeY(i, upstream.length))
        )}

        {/* Centre node */}
        {nodeEl(selected, COL_MID, midY)}

        {/* Downstream nodes */}
        {downstream.map((name, i) =>
          nodeEl(name, COL_RIGHT, nodeY(i, downstream.length))
        )}
      </svg>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ◈ LINGTREE toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Dataset Lineage Tree"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 374,
          background: open ? CY + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${CY}55`,
          borderRadius: 8,
          color: open ? "#04060A" : CY,
          cursor: "pointer",
          padding: "6px 12px",
          fontSize: 10,
          letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace",
          fontWeight: 700,
          boxShadow: `0 0 20px ${CY}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          transition: "all 0.2s",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        LINGTREE
      </button>

      {/* Dataset Lineage Tree panel */}
      {open && (
        <div style={{
          position: "fixed",
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 1374,
          width: Math.min(PANEL_W, window.innerWidth - 32),
          maxHeight: "90vh",
          background: SURF,
          border: `1px solid ${BORD}`,
          borderRadius: 16,
          backdropFilter: "blur(14px)",
          boxShadow: `0 0 80px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 16px",
            borderBottom: `1px solid ${BORD}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: CY, boxShadow: `0 0 8px ${CY}`,
              display: "inline-block",
              animation: loading ? "lingtreepulse 0.9s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              DATASET LINEAGE TREE
            </span>

            {lineage && (
              <span style={{
                marginLeft: 8,
                color: DIM,
                fontSize: 9,
              }}>
                depth {computeDepth(selected, lineage.edges || [])} ·{" "}
                {(lineage.nodes || []).length} node{(lineage.nodes || []).length !== 1 ? "s" : ""}
              </span>
            )}

            <span style={{ marginLeft: "auto" }} />

            {/* Dataset selector */}
            <select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              style={{
                background: "rgba(41,231,255,0.08)",
                border: `1px solid ${CY}44`,
                borderRadius: 6,
                color: CY,
                padding: "3px 8px",
                fontSize: 10,
                fontFamily: "inherit",
                cursor: "pointer",
                maxWidth: 180,
              }}
            >
              {datasets.length === 0 && (
                <option value="">— no datasets —</option>
              )}
              {datasets.map(d => (
                <option key={d.name} value={d.name}>{d.name}</option>
              ))}
            </select>

            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none",
                color: DIM, cursor: "pointer",
                fontSize: 16, padding: "0 2px", lineHeight: 1,
              }}
            >×</button>
          </div>

          {/* SVG tree area */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 16px",
            position: "relative",
          }}>
            {loading && (
              <div style={{
                textAlign: "center", color: CY,
                padding: 40, fontSize: 10, letterSpacing: 2,
              }}>
                LOADING LINEAGE…
              </div>
            )}

            {!loading && !lineage && (
              <div style={{
                textAlign: "center", color: DIM,
                padding: 40, fontSize: 10,
              }}>
                {selected ? "No lineage data found." : "Select a dataset."}
              </div>
            )}

            {!loading && lineage && (
              <>
                {renderSvg()}

                {/* Inline health legend */}
                <div style={{
                  display: "flex", gap: 16, justifyContent: "center",
                  marginTop: 8,
                }}>
                  {[["HEALTHY", GN], ["DEGRADED", AM], ["DOWN", RD], ["UNKNOWN", DIM]].map(
                    ([label, col]) => (
                      <span key={label} style={{
                        display: "flex", alignItems: "center", gap: 4,
                        color: col, fontSize: 9, letterSpacing: 1,
                      }}>
                        <span style={{
                          width: 7, height: 7, borderRadius: "50%",
                          background: col, display: "inline-block",
                        }} />
                        {label}
                      </span>
                    )
                  )}
                </div>
              </>
            )}

            {/* Health tooltip */}
            {tooltip && (
              <div style={{
                position: "absolute",
                top: 12, right: 16,
              }}>
                <NodeTooltip
                  health={tooltip.health ? tooltip.health : { name: tooltip.name, found: false }}
                  onClose={() => setTooltip(null)}
                />
              </div>
            )}
          </div>

          {/* Assessment section */}
          <div style={{
            padding: "8px 16px 12px",
            borderTop: `1px solid ${BORD}`,
          }}>
            <button
              onClick={assess}
              disabled={assessing || !lineage}
              style={{
                background: assessing ? "rgba(41,231,255,0.08)" : CY + "22",
                border: `1px solid ${CY}44`,
                borderRadius: 8,
                color: CY,
                padding: "6px 18px",
                fontSize: 10,
                fontFamily: "inherit",
                fontWeight: 700,
                letterSpacing: 2,
                cursor: assessing || !lineage ? "not-allowed" : "pointer",
                opacity: assessing || !lineage ? 0.5 : 1,
                transition: "all 0.2s",
              }}
            >
              {assessing ? "⟳ ASSESSING…" : "▶ ASSESS"}
            </button>

            {assessment && (
              <div style={{
                marginTop: 8,
                color: DIM,
                fontSize: 9,
                lineHeight: 1.6,
                maxHeight: 72,
                overflowY: "auto",
              }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes lingtreepulse {
          0%,100% { opacity:1; box-shadow:0 0 8px ${CY}; }
          50%      { opacity:0.4; box-shadow:0 0 3px ${CY}; }
        }
      `}</style>
    </>
  );
}
