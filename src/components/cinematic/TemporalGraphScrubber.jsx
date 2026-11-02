/**
 * TemporalGraphScrubber — F269.
 *
 * POSTs to /v1/graph-time/playback with configurable N frames → receives
 * {frames, t0, t1, snapshots:[{ts,n_nodes,n_edges,nodes,edges}]}.
 * Renders an SVG force-positioned node graph that animates frame-by-frame:
 *   - node appearing  → green flash ring
 *   - node removed    → red fade-out
 * Controls: play/pause, step-back, step-forward, speed (1×/2×/5×/10×),
 * frame-count input (12–120), frame counter "12/50" + ISO timestamp.
 * ASSESS button → /v1/jarvis/agent/chat → speak + TTS via jarvis:speak-dossier.
 *
 * Toggle: ◈ TGSCRB at left:198440, zIndex:365; event jarvis:tgscrb-toggle.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GRN = "#00E5A0";
const RED = "#FF4444";
const AMBER = "#F5A623";
const DIM = "#1a2a3a";
const BTN_LEFT = 198440;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const SPEED_MAP = { "1×": 1200, "2×": 600, "5×": 240, "10×": 120 };
const SPEED_LABELS = Object.keys(SPEED_MAP);

// ── exported helpers for JarvisBrain ─────────────────────────────────────────

export function isTgscrbbQuery(q) {
  return /temporal.graph.scrub|tgscrb|graph.playback|graph.over.time.scrub|graph.scrubber|graph.growth.trajectory/i.test(q || "");
}

export async function buildTgscrbScript() {
  try {
    const data = await fetchPlayback(24);
    window.dispatchEvent(new CustomEvent("jarvis:tgscrb-toggle"));
    const snaps = data.snapshots || [];
    if (!snaps.length) return "Temporal graph scrubber is open, sir. No snapshot data available yet.";
    const first = snaps[0];
    const last = snaps[snaps.length - 1];
    const dNodes = (last.n_nodes || 0) - (first.n_nodes || 0);
    const trend = dNodes > 0 ? "growing" : dNodes < 0 ? "shrinking" : "stable";
    return `Temporal graph scrubber active, sir. ${snaps.length} frames loaded. The graph is ${trend}: from ${first.n_nodes ?? 0} nodes at frame 1 to ${last.n_nodes ?? 0} at frame ${snaps.length}. Net change: ${dNodes >= 0 ? "+" : ""}${dNodes} nodes, ${(last.n_edges ?? 0) - (first.n_edges ?? 0) >= 0 ? "+" : ""}${(last.n_edges ?? 0) - (first.n_edges ?? 0)} edges across the time window.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:tgscrb-toggle"));
    return "Temporal graph scrubber is open, sir.";
  }
}

// ── data layer ────────────────────────────────────────────────────────────────

async function fetchPlayback(n) {
  const r = await fetch(`${apiBase()}/v1/graph-time/playback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ frames: n }),
  });
  if (!r.ok) throw new Error(`playback ${r.status}`);
  return r.json();
}

function fmtIso(ts) {
  if (!ts) return "—";
  try {
    return new Date(typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts).toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch { return String(ts); }
}

// ── SVG force layout (deterministic via seeded positions) ─────────────────────

function hashId(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function nodePos(id, W, H, pad) {
  const h = hashId(id);
  const x = pad + ((Math.abs(h * 1234567) >>> 0) % (W - 2 * pad));
  const y = pad + ((Math.abs(h * 7654321) >>> 0) % (H - 2 * pad));
  return { x, y };
}

const SVG_W = 440;
const SVG_H = 260;
const PAD = 20;

function GraphCanvas({ prevSnap, snap, flash }) {
  if (!snap) return <rect width={SVG_W} height={SVG_H} fill={DIM} rx={4} />;

  const nodes = snap.nodes || [];
  const edges = snap.edges || [];
  const prevIds = new Set((prevSnap?.nodes || []).map(n => String(n.id ?? n)));
  const currIds = new Set(nodes.map(n => String(n.id ?? n)));

  // removed ids — kept for fade-out only when we have prevSnap
  const removed = prevSnap
    ? (prevSnap.nodes || []).filter(n => !currIds.has(String(n.id ?? n)))
    : [];

  const posFor = (id) => nodePos(id, SVG_W, SVG_H, PAD);

  return (
    <>
      <rect width={SVG_W} height={SVG_H} fill={DIM} rx={4} />
      {/* edges */}
      {edges.map((e, i) => {
        const aId = String(e.a ?? e.source ?? "");
        const bId = String(e.b ?? e.target ?? "");
        const pa = posFor(aId);
        const pb = posFor(bId);
        return (
          <line key={i} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
            stroke="#2a4a6a" strokeWidth={0.8} opacity={0.5} />
        );
      })}
      {/* removed nodes — fading red */}
      {removed.map(n => {
        const id = String(n.id ?? n);
        const p = posFor(id);
        return (
          <g key={`rm-${id}`}>
            <circle cx={p.x} cy={p.y} r={5} fill={RED} opacity={0.4} />
          </g>
        );
      })}
      {/* current nodes */}
      {nodes.map(n => {
        const id = String(n.id ?? n);
        const p = posFor(id);
        const isNew = flash && !prevIds.has(id);
        const label = n.label || n.name || id;
        return (
          <g key={id}>
            {isNew && (
              <circle cx={p.x} cy={p.y} r={10} fill="none"
                stroke={GRN} strokeWidth={1.5} opacity={0.7} />
            )}
            <circle cx={p.x} cy={p.y} r={4}
              fill={isNew ? GRN : CY} opacity={0.85} />
            <text x={p.x + 6} y={p.y + 4} fontSize={7}
              fill={isNew ? GRN : "#8ab8d0"} fontFamily="monospace">
              {String(label).slice(0, 14)}
            </text>
          </g>
        );
      })}
    </>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function TemporalGraphScrubber() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);      // full response
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("1×");
  const [frameCount, setFrameCount] = useState(24);
  const [flash, setFlash] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const playRef = useRef(null);

  const snaps = data?.snapshots || [];
  const total = snaps.length;

  const load = useCallback(async (n = frameCount) => {
    setLoading(true);
    setError(null);
    setPlaying(false);
    setFrameIdx(0);
    try {
      const d = await fetchPlayback(n);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [frameCount]);

  // toggle event
  useEffect(() => {
    const toggle = () => setVisible(v => {
      if (!v && !data) load();
      return !v;
    });
    window.addEventListener("jarvis:tgscrb-toggle", toggle);
    return () => window.removeEventListener("jarvis:tgscrb-toggle", toggle);
  }, [load, data]);

  // playback loop
  useEffect(() => {
    if (!playing || !total) return;
    const ms = SPEED_MAP[speed] || 1200;
    playRef.current = setInterval(() => {
      setFlash(true);
      setFrameIdx(i => {
        const next = i + 1;
        if (next >= total) { setPlaying(false); return i; }
        return next;
      });
      setTimeout(() => setFlash(false), Math.min(ms / 2, 300));
    }, ms);
    return () => clearInterval(playRef.current);
  }, [playing, total, speed]);

  async function assess() {
    if (!total) return;
    setAssessing(true);
    const snap = snaps[frameIdx];
    const first = snaps[0];
    const last = snaps[total - 1];
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Temporal graph analysis: ${total} frames, currently at frame ${frameIdx + 1}. At this frame: ${snap?.n_nodes ?? 0} nodes, ${snap?.n_edges ?? 0} edges (ISO: ${fmtIso(snap?.ts)}). Overall trajectory: nodes grew from ${first?.n_nodes ?? 0} to ${last?.n_nodes ?? 0}, edges from ${first?.n_edges ?? 0} to ${last?.n_edges ?? 0}. Provide a 2-sentence intelligence assessment of this graph growth trajectory and its operational significance.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.message || d.content || "Assessment complete.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: "Temporal graph assessment unavailable." } }));
    } finally {
      setAssessing(false);
    }
  }

  function stepBack() { setPlaying(false); setFrameIdx(i => Math.max(0, i - 1)); setFlash(true); setTimeout(() => setFlash(false), 300); }
  function stepFwd() { setPlaying(false); setFrameIdx(i => Math.min(total - 1, i + 1)); setFlash(true); setTimeout(() => setFlash(false), 300); }

  if (!visible) {
    return (
      <button
        title="Temporal Graph Scrubber"
        onClick={() => { setVisible(true); if (!data) load(); }}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 365,
          background: "#0a1628cc", border: `1px solid ${CY}44`,
          color: CY, fontFamily: "monospace", fontSize: 10,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ TGSCRB
      </button>
    );
  }

  const snap = snaps[frameIdx] || null;
  const prevSnap = frameIdx > 0 ? snaps[frameIdx - 1] : null;

  return (
    <div style={{
      position: "fixed", bottom: 40, left: BTN_LEFT, zIndex: 365,
      width: 460, background: "#050e1ddd", border: `1px solid ${CY}33`,
      borderRadius: 6, fontFamily: "monospace", color: CY, fontSize: 11,
      boxShadow: `0 0 16px #000a`,
    }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: `1px solid ${CY}22` }}>
        <span style={{ fontSize: 12, letterSpacing: 2 }}>◈ TEMPORAL GRAPH SCRUBBER</span>
        <button onClick={() => setVisible(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}>×</button>
      </div>

      {/* frame count control */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 10px", borderBottom: `1px solid ${CY}22` }}>
        <span style={{ color: "#6a8fa0", fontSize: 10 }}>FRAMES</span>
        <input
          type="number" min={12} max={120} value={frameCount}
          onChange={e => setFrameCount(Math.max(12, Math.min(120, +e.target.value)))}
          style={{ width: 48, background: "#0a1628", border: `1px solid ${CY}44`, color: CY, fontFamily: "monospace", fontSize: 10, padding: "1px 4px", borderRadius: 2 }}
        />
        <button onClick={() => load(frameCount)} disabled={loading}
          style={{ background: "#0e2040", border: `1px solid ${CY}55`, color: CY, fontFamily: "monospace", fontSize: 10, padding: "2px 8px", borderRadius: 3, cursor: "pointer" }}>
          {loading ? "…" : "LOAD"}
        </button>
        {error && <span style={{ color: RED, fontSize: 9 }}>{error}</span>}
        {data?.note && <span style={{ color: AMBER, fontSize: 8, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={data.note}>⚠ {data.note}</span>}
      </div>

      {/* SVG graph canvas */}
      <div style={{ padding: "6px 10px" }}>
        <svg width={SVG_W} height={SVG_H} style={{ display: "block", borderRadius: 4 }}>
          <GraphCanvas prevSnap={prevSnap} snap={snap} flash={flash} />
        </svg>
      </div>

      {/* stats bar */}
      {snap && (
        <div style={{ display: "flex", gap: 16, padding: "2px 10px 4px", fontSize: 10 }}>
          <span style={{ color: GRN }}>N {snap.n_nodes ?? 0}</span>
          <span style={{ color: CY }}>E {snap.n_edges ?? 0}</span>
          <span style={{ color: "#6a8fa0" }}>{fmtIso(snap.ts)}</span>
        </div>
      )}

      {/* playback controls */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 10px", borderTop: `1px solid ${CY}22` }}>
        <button onClick={stepBack} disabled={!total || frameIdx === 0}
          style={{ background: "#0e2040", border: `1px solid ${CY}44`, color: CY, fontFamily: "monospace", fontSize: 11, padding: "2px 7px", borderRadius: 3, cursor: "pointer" }}>
          ◀◀
        </button>
        <button onClick={() => setPlaying(p => !p)} disabled={!total}
          style={{ background: playing ? "#0e3020" : "#0e2040", border: `1px solid ${playing ? GRN : CY}66`, color: playing ? GRN : CY, fontFamily: "monospace", fontSize: 11, padding: "2px 9px", borderRadius: 3, cursor: "pointer" }}>
          {playing ? "⏸" : "▶"}
        </button>
        <button onClick={stepFwd} disabled={!total || frameIdx >= total - 1}
          style={{ background: "#0e2040", border: `1px solid ${CY}44`, color: CY, fontFamily: "monospace", fontSize: 11, padding: "2px 7px", borderRadius: 3, cursor: "pointer" }}>
          ▶▶
        </button>

        {/* scrubber slider */}
        <input type="range" min={0} max={Math.max(0, total - 1)} value={frameIdx}
          onChange={e => { setPlaying(false); setFrameIdx(+e.target.value); setFlash(true); setTimeout(() => setFlash(false), 200); }}
          style={{ flex: 1, accentColor: CY, cursor: "pointer" }} />

        {/* frame counter */}
        <span style={{ color: CY, fontSize: 10, minWidth: 40, textAlign: "right" }}>
          {total ? `${frameIdx + 1}/${total}` : "—"}
        </span>
      </div>

      {/* speed selector + ASSESS */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 10px 8px", borderTop: `1px solid ${CY}22` }}>
        <span style={{ color: "#6a8fa0", fontSize: 10 }}>SPEED</span>
        {SPEED_LABELS.map(s => (
          <button key={s} onClick={() => setSpeed(s)}
            style={{ background: speed === s ? "#0e3040" : "#0a1628", border: `1px solid ${speed === s ? CY : CY + "33"}`, color: speed === s ? CY : "#5a7a90", fontFamily: "monospace", fontSize: 9, padding: "2px 5px", borderRadius: 2, cursor: "pointer" }}>
            {s}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={assess} disabled={assessing || !total}
          style={{ background: "#0e2040", border: `1px solid ${AMBER}66`, color: AMBER, fontFamily: "monospace", fontSize: 10, padding: "2px 9px", borderRadius: 3, cursor: "pointer" }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>
    </div>
  );
}
