/**
 * GraphTimeDiff — F299 (overnight 2026-11-03)
 *
 * CANVAS-GRAPH + TIMELINE: compare graph snapshots at two timestamps and
 * render the diff as a colour-coded SVG force graph.
 *
 * Data sources:
 *   GET  /v1/graph-time/at?ts={t1}   → {nodes:[{id,label,type,…}], edges:[…]}
 *   GET  /v1/graph-time/at?ts={t2}   → same shape
 *   POST /v1/jarvis/agent/chat       → ASSESS narration
 *   POST /v1/voice/tts               → speak
 *
 * Diff logic:
 *   added nodes   (in t2, not t1) → green  (#4ADE80)
 *   removed nodes (in t1, not t2) → red    (#FF4D6A)
 *   unchanged nodes (both)        → white  (#DCEBF5)
 *
 * Toggle: ◈ GRTMDIFF  left:215240  bottom:8  zIndex:395
 * Event:  jarvis:grtmdiff-toggle
 * Voice:  "graph time diff / grtmdiff / graph diff / graph delta /
 *          time diff / node diff / graph compare / temporal diff"
 *
 * Exported for JarvisBrain: isGrtmdiffQuery
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ─── palette ──────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const GN   = "#4ADE80";
const RD   = "#FF4D6A";
const WH   = "#DCEBF5";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const PANEL_W = 780;
const PANEL_H = 700;
const SVG_W   = PANEL_W - 20;
const SVG_H   = 390;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain export ───────────────────────────────────────────────────────
const GRTMDIFF_RE =
  /\b(gr(aph)?[\s_-]?time[\s_-]?diff|grtmdiff|graph[\s_-]?diff|graph[\s_-]?delta|time[\s_-]?diff|node[\s_-]?diff|graph[\s_-]?compare|temporal[\s_-]?diff)\b/i;

export function isGrtmdiffQuery(q) {
  return GRTMDIFF_RE.test(q || "");
}

// ─── Verlet force simulation ──────────────────────────────────────────────────
function useForceGraph(nodes, edges, svgW, svgH) {
  const [pos, setPos] = useState({});
  const velRef = useRef({});
  const posRef = useRef({});
  const rafRef = useRef(null);

  useEffect(() => {
    if (!nodes || nodes.length === 0) { setPos({}); return; }

    const cx = svgW / 2, cy = svgH / 2;
    const initPos = {};
    const initVel = {};
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      const r = Math.min(svgW, svgH) * 0.32;
      initPos[n.id] = {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      };
      initVel[n.id] = { vx: 0, vy: 0 };
    });
    posRef.current = initPos;
    velRef.current = initVel;
    setPos({ ...initPos });

    const edgeSet = new Map();
    edges.forEach(e => {
      if (!edgeSet.has(e.source)) edgeSet.set(e.source, []);
      edgeSet.get(e.source).push(e.target);
    });

    let tick = 0;
    function step() {
      if (tick++ > 300) return;
      const p = posRef.current;
      const v = velRef.current;
      const ids = nodes.map(n => n.id);
      const REPEL = 3200, SPRING_LEN = 90, SPRING_K = 0.04, DAMP = 0.82, PULL = 0.008;

      ids.forEach(a => {
        ids.forEach(b => {
          if (a === b) return;
          const dx = p[a].x - p[b].x, dy = p[a].y - p[b].y;
          const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const f = REPEL / (d * d);
          v[a].vx += (dx / d) * f;
          v[a].vy += (dy / d) * f;
        });
      });

      (edgeSet || new Map()).forEach((targets, src) => {
        targets.forEach(tgt => {
          if (!p[src] || !p[tgt]) return;
          const dx = p[tgt].x - p[src].x, dy = p[tgt].y - p[src].y;
          const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const f = SPRING_K * (d - SPRING_LEN);
          const fx = (dx / d) * f, fy = (dy / d) * f;
          v[src].vx += fx; v[src].vy += fy;
          if (v[tgt]) { v[tgt].vx -= fx; v[tgt].vy -= fy; }
        });
      });

      ids.forEach(id => {
        v[id].vx += (cx - p[id].x) * PULL;
        v[id].vy += (cy - p[id].y) * PULL;
        v[id].vx *= DAMP; v[id].vy *= DAMP;
        p[id].x = Math.max(20, Math.min(svgW - 20, p[id].x + v[id].vx));
        p[id].y = Math.max(20, Math.min(svgH - 20, p[id].y + v[id].vy));
      });

      setPos({ ...p });
      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [nodes, edges, svgW, svgH]);

  return pos;
}

// ─── main component ───────────────────────────────────────────────────────────
export default function GraphTimeDiff() {
  const [open, setOpen] = useState(false);

  // timestamps
  const [t1, setT1] = useState("");
  const [t2, setT2] = useState("");

  // data
  const [snap1, setSnap1] = useState(null);
  const [snap2, setSnap2] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]     = useState("");

  // diff result
  const [diffNodes, setDiffNodes] = useState([]);
  const [diffEdges, setDiffEdges] = useState([]);
  const [summary, setSummary]     = useState(null);

  // tooltip
  const [tooltip, setTooltip] = useState(null);

  // assess
  const [assessing, setAssessing] = useState(false);

  const pos = useForceGraph(diffNodes, diffEdges, SVG_W, SVG_H);

  // open/close via toggle event
  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:grtmdiff-toggle", toggle);
    return () => window.removeEventListener("jarvis:grtmdiff-toggle", toggle);
  }, []);

  // set sensible default timestamps on first open
  useEffect(() => {
    if (!open) return;
    if (t1 || t2) return;
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
    const fmt = (d) => d.toISOString().slice(0, 16);
    setT1(fmt(yesterday));
    setT2(fmt(now));
  }, [open]);

  // compute diff whenever both snaps available
  useEffect(() => {
    if (!snap1 || !snap2) return;
    const ids1 = new Set((snap1.nodes || []).map(n => n.id));
    const ids2 = new Set((snap2.nodes || []).map(n => n.id));

    const added     = (snap2.nodes || []).filter(n => !ids1.has(n.id)).map(n => ({ ...n, _status: "added" }));
    const removed   = (snap1.nodes || []).filter(n => !ids2.has(n.id)).map(n => ({ ...n, _status: "removed" }));
    const unchanged = (snap2.nodes || []).filter(n =>  ids1.has(n.id)).map(n => ({ ...n, _status: "unchanged" }));

    const nodes = [...added, ...removed, ...unchanged];
    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = [
      ...(snap1.edges || []),
      ...(snap2.edges || []),
    ].filter((e, i, arr) =>
      nodeIds.has(e.source) && nodeIds.has(e.target) &&
      arr.findIndex(x => x.source === e.source && x.target === e.target) === i
    );

    setDiffNodes(nodes);
    setDiffEdges(edges);
    setSummary({ added: added.length, removed: removed.length, unchanged: unchanged.length });
  }, [snap1, snap2]);

  const fetchDiff = useCallback(async () => {
    if (!t1 || !t2) { setErr("Both timestamps required."); return; }
    setErr(""); setLoading(true); setSnap1(null); setSnap2(null);
    setSummary(null); setDiffNodes([]); setDiffEdges([]);
    try {
      const base = apiBase();
      const [r1, r2] = await Promise.all([
        fetch(`${base}/v1/graph-time/at?ts=${encodeURIComponent(t1)}`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${base}/v1/graph-time/at?ts=${encodeURIComponent(t2)}`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      if (!r1.ok) throw new Error(`t1 snapshot: ${r1.status}`);
      if (!r2.ok) throw new Error(`t2 snapshot: ${r2.status}`);
      const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
      setSnap1(d1);
      setSnap2(d2);
    } catch (e) {
      setErr(e.message || "Fetch failed.");
    } finally {
      setLoading(false);
    }
  }, [t1, t2]);

  const assess = useCallback(async () => {
    if (!summary) return;
    setAssessing(true);
    const prompt =
      `Graph time diff between ${t1} and ${t2}: ` +
      `${summary.added} nodes added, ${summary.removed} removed, ${summary.unchanged} unchanged. ` +
      `Summarise what changed in the graph between these two timestamps. ` +
      `Provide an operational assessment of the significance of these changes.`;
    try {
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || d.response || "No assessment available.").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }, [summary, t1, t2]);

  const nodeColor = (status) => {
    if (status === "added")     return GN;
    if (status === "removed")   return RD;
    return WH;
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Time Diff"
        style={{
          position: "fixed", left: 215240, bottom: 8, zIndex: 395,
          background: "rgba(10,18,28,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          letterSpacing: 2, padding: "4px 10px", borderRadius: 4, cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        ◈ GRTMDIFF
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: "50%", top: "50%",
      transform: "translate(-50%,-50%)",
      width: PANEL_W, maxWidth: "98vw",
      height: PANEL_H, maxHeight: "96vh",
      background: SURF, border: `1px solid ${BORD}`,
      borderRadius: 12, zIndex: 395, display: "flex", flexDirection: "column",
      fontFamily: "'JetBrains Mono',monospace", color: WH,
      boxShadow: `0 0 60px ${CY}18`, overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
        borderBottom: `1px solid ${BORD}`, flexShrink: 0,
      }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 3 }}>◈ GRAPH TIME DIFF</span>
        <span style={{ fontSize: 10, color: "#5A7A90", marginLeft: 6 }}>
          node delta between two snapshots
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{ marginLeft: "auto", background: "none", border: "none", color: "#5A7A90",
            cursor: "pointer", fontSize: 16, lineHeight: 1 }}
        >✕</button>
      </div>

      {/* controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
        borderBottom: `1px solid ${BORD}`, flexShrink: 0, flexWrap: "wrap" }}>
        <label style={{ fontSize: 10, color: CY }}>T1</label>
        <input
          type="datetime-local"
          value={t1}
          onChange={e => setT1(e.target.value)}
          style={{ background: "rgba(41,231,255,0.06)", border: `1px solid ${BORD}`,
            color: WH, fontSize: 11, padding: "4px 8px", borderRadius: 4,
            fontFamily: "inherit", colorScheme: "dark" }}
        />
        <label style={{ fontSize: 10, color: CY }}>T2</label>
        <input
          type="datetime-local"
          value={t2}
          onChange={e => setT2(e.target.value)}
          style={{ background: "rgba(41,231,255,0.06)", border: `1px solid ${BORD}`,
            color: WH, fontSize: 11, padding: "4px 8px", borderRadius: 4,
            fontFamily: "inherit", colorScheme: "dark" }}
        />
        <button
          onClick={fetchDiff}
          disabled={loading}
          style={{ background: loading ? "transparent" : `${CY}22`, border: `1px solid ${CY}55`,
            color: CY, fontSize: 10, letterSpacing: 1, padding: "5px 14px", borderRadius: 4,
            cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "LOADING…" : "DIFF"}
        </button>
        {summary && (
          <button
            onClick={assess}
            disabled={assessing}
            style={{ background: "transparent", border: `1px solid #F5A62355`,
              color: "#F5A623", fontSize: 10, letterSpacing: 1, padding: "5px 14px",
              borderRadius: 4, cursor: assessing ? "not-allowed" : "pointer" }}
          >
            {assessing ? "ASSESSING…" : "ASSESS"}
          </button>
        )}
      </div>

      {/* error */}
      {err && (
        <div style={{ padding: "6px 16px", color: RD, fontSize: 11, flexShrink: 0 }}>{err}</div>
      )}

      {/* diff summary bar */}
      {summary && (
        <div style={{
          display: "flex", gap: 20, padding: "8px 16px",
          borderBottom: `1px solid ${BORD}`, flexShrink: 0,
        }}>
          <span style={{ color: GN, fontSize: 12 }}>+{summary.added} added</span>
          <span style={{ color: RD, fontSize: 12 }}>-{summary.removed} removed</span>
          <span style={{ color: WH, fontSize: 12 }}>{summary.unchanged} unchanged</span>
          <span style={{ color: "#5A7A90", fontSize: 12, marginLeft: "auto" }}>
            {summary.added + summary.removed + summary.unchanged} total
          </span>
        </div>
      )}

      {/* SVG force graph */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {!summary && !loading && (
          <div style={{ position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "#3A5A70", fontSize: 13 }}>
            Enter two timestamps and click DIFF
          </div>
        )}
        {summary && diffNodes.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "#3A5A70", fontSize: 13 }}>
            No nodes in either snapshot
          </div>
        )}
        {diffNodes.length > 0 && (
          <svg
            width={SVG_W} height={SVG_H}
            style={{ display: "block" }}
            onClick={() => setTooltip(null)}
          >
            {/* edges */}
            {diffEdges.map((e, i) => {
              const s = pos[e.source], t = pos[e.target];
              if (!s || !t) return null;
              return (
                <line key={i}
                  x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke="rgba(41,231,255,0.12)" strokeWidth={1} />
              );
            })}
            {/* nodes */}
            {diffNodes.map(n => {
              const p = pos[n.id];
              if (!p) return null;
              const col = nodeColor(n._status);
              return (
                <g key={n.id}
                  style={{ cursor: "pointer" }}
                  onClick={ev => {
                    ev.stopPropagation();
                    setTooltip({ node: n, x: p.x, y: p.y });
                  }}
                >
                  <circle
                    cx={p.x} cy={p.y} r={7}
                    fill={`${col}33`}
                    stroke={col} strokeWidth={1.5}
                  />
                  <text x={p.x} y={p.y - 11}
                    textAnchor="middle" fontSize={9} fill={col}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {(n.label || n.id || "").slice(0, 16)}
                  </text>
                </g>
              );
            })}
            {/* tooltip */}
            {tooltip && pos[tooltip.node.id] && (() => {
              const tx = Math.min(pos[tooltip.node.id].x + 14, SVG_W - 160);
              const ty = Math.max(pos[tooltip.node.id].y - 60, 6);
              const n  = tooltip.node;
              const col = nodeColor(n._status);
              return (
                <foreignObject x={tx} y={ty} width={155} height={90}>
                  <div xmlns="http://www.w3.org/1999/xhtml" style={{
                    background: "rgba(8,14,22,0.96)", border: `1px solid ${col}66`,
                    borderRadius: 6, padding: "6px 9px", fontSize: 10, color: WH,
                    lineHeight: 1.5, pointerEvents: "none",
                  }}>
                    <div style={{ color: col, fontWeight: "bold", marginBottom: 2 }}>
                      {n._status.toUpperCase()}
                    </div>
                    <div><b>id:</b> {(n.id || "").slice(0, 20)}</div>
                    {n.label && <div><b>label:</b> {n.label.slice(0, 20)}</div>}
                    {n.type  && <div><b>type:</b> {n.type}</div>}
                  </div>
                </foreignObject>
              );
            })()}
          </svg>
        )}
      </div>

      {/* legend */}
      <div style={{
        display: "flex", gap: 18, padding: "8px 16px",
        borderTop: `1px solid ${BORD}`, flexShrink: 0,
      }}>
        {[
          { col: GN, label: "Added" },
          { col: RD, label: "Removed" },
          { col: WH, label: "Unchanged" },
        ].map(({ col, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <svg width={12} height={12}>
              <circle cx={6} cy={6} r={5} fill={`${col}33`} stroke={col} strokeWidth={1.5} />
            </svg>
            <span style={{ fontSize: 10, color: col }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
