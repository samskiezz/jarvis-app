/**
 * GraphTimelineScrubber — F49.
 *
 * POSTs to /v1/graph-time/playback (24 frames) to retrieve the temporal
 * growth of the knowledge graph. Renders a mini SVG bar chart (nodes +
 * links per frame), a scrubber slider to step through history, and a
 * per-frame detail readout. Clicking ▶ ASSESS sends the growth trend to
 * /v1/jarvis/agent/chat for a 2-sentence narrative + TTS.
 *
 * Voice triggers: "graph timeline / graph history / graph over time /
 *   how did the graph grow / graph evolution / temporal graph /
 *   time series graph / gtime"
 * Toggle: ◈ GTIME at left:10060, zIndex:70; event jarvis:graph-timeline-toggle.
 * 5-min auto-refresh. Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GRN = "#00E5A0";
const AMBER = "#F5A623";
const VIOLET = "#A78BFA";
const BTN_LEFT = 10060;
const REFRESH_MS = 5 * 60_000;
const FRAMES = 24;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isGraphTimelineQuery(q) {
  return /graph.timeline|graph.histor|graph.over.time|graph.grew|graph.evolution|temporal.graph|time.series.graph|how.did.the.graph|\bgtime\b/i.test(
    q || ""
  );
}

export async function buildGraphTimelineScript() {
  try {
    const frames = await fetchPlayback();
    window.dispatchEvent(new CustomEvent("jarvis:graph-timeline-toggle"));
    if (!frames.length) {
      return "Graph timeline data is unavailable, sir. The temporal graph service may not have enough timestamped records yet.";
    }
    const first = frames[0];
    const last = frames[frames.length - 1];
    const nodeGrowth = (last.node_count || 0) - (first.node_count || 0);
    const linkGrowth = (last.link_count || 0) - (first.link_count || 0);
    const trend = nodeGrowth > 0 ? "growing" : nodeGrowth < 0 ? "contracting" : "stable";
    return `Graph timeline analysis complete, sir. The knowledge graph has been ${trend} across ${frames.length} temporal frames — from ${first.node_count || 0} nodes at the start to ${last.node_count || 0} nodes now, a delta of ${nodeGrowth >= 0 ? "+" : ""}${nodeGrowth} nodes and ${linkGrowth >= 0 ? "+" : ""}${linkGrowth} links. The scrubber panel is now open for detailed frame-by-frame inspection.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:graph-timeline-toggle"));
    return "Graph timeline scrubber is open, sir.";
  }
}

// ─── data helpers ─────────────────────────────────────────────────────────────

async function fetchPlayback() {
  const r = await fetch(`${apiBase()}/v1/graph-time/playback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ frames: FRAMES }),
  });
  if (!r.ok) throw new Error("playback failed");
  const data = await r.json();
  // Response shape: array of frame objects or { frames: [...] }
  const raw = Array.isArray(data) ? data : (data.frames || data.snapshots || []);
  return raw.map((f, i) => ({
    index: i,
    ts: f.ts ?? f.timestamp ?? null,
    node_count: f.node_count ?? f.nodes ?? (Array.isArray(f.nodes_list) ? f.nodes_list.length : 0),
    link_count: f.link_count ?? f.links ?? (Array.isArray(f.links_list) ? f.links_list.length : 0),
    note: f.note || null,
  }));
}

function fmtTs(ts) {
  if (!ts) return "—";
  try {
    const d = new Date(typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
  } catch { return "—"; }
}

// ─── SVG sparkline bar chart ───────────────────────────────────────────────────

function BarChart({ frames, activeIdx, onHover }) {
  if (!frames.length) return null;
  const W = 360, H = 60, PAD = 4;
  const maxN = Math.max(...frames.map(f => f.node_count), 1);
  const maxL = Math.max(...frames.map(f => f.link_count), 1);
  const barW = Math.floor((W - PAD * 2) / frames.length) - 1;

  return (
    <svg width={W} height={H} style={{ display: "block", margin: "0 auto" }}>
      {frames.map((f, i) => {
        const x = PAD + i * (barW + 1);
        const nh = Math.max(2, Math.round((f.node_count / maxN) * (H - 8)));
        const lh = Math.max(1, Math.round((f.link_count / maxL) * (H - 8)));
        const isActive = i === activeIdx;
        return (
          <g key={i} onMouseEnter={() => onHover(i)} style={{ cursor: "pointer" }}>
            {/* link bar (back) */}
            <rect
              x={x} y={H - lh} width={barW} height={lh}
              fill={isActive ? VIOLET : "#3a2f6a"} opacity={0.8}
            />
            {/* node bar (front, narrower) */}
            <rect
              x={x + 1} y={H - nh} width={Math.max(1, barW - 2)} height={nh}
              fill={isActive ? CY : "#0d4d5c"} opacity={0.9}
            />
          </g>
        );
      })}
      {/* axis line */}
      <line x1={PAD} y1={H} x2={W - PAD} y2={H} stroke="#ffffff22" strokeWidth={1} />
    </svg>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export default function GraphTimelineScrubber() {
  const [visible, setVisible] = useState(false);
  const [frames, setFrames] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchPlayback();
      setFrames(data);
      setActiveIdx(data.length > 0 ? data.length - 1 : 0);
    } catch (e) {
      setError("Temporal graph data unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setVisible(v => {
        const next = !v;
        if (next && frames.length === 0) load();
        return next;
      });
    };
    window.addEventListener("jarvis:graph-timeline-toggle", toggle);
    return () => window.removeEventListener("jarvis:graph-timeline-toggle", toggle);
  }, [load, frames.length]);

  useEffect(() => {
    if (!visible) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, load]);

  async function assess(frame) {
    setAssessing(frame.index);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `The knowledge graph had ${frame.node_count} nodes and ${frame.link_count} links at frame ${frame.index + 1} of ${frames.length} (timestamp: ${fmtTs(frame.ts)}). Provide a 2-sentence intelligence assessment of this growth stage and its operational significance.`,
        }),
      });
      const d = await r.json();
      const answer = d.response || d.message || d.content || "Assessment complete.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: "Assessment unavailable." } }));
    } finally {
      setAssessing(null);
    }
  }

  if (!visible) {
    return (
      <button
        title="Graph Timeline"
        onClick={() => { setVisible(true); if (frames.length === 0) load(); }}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 70,
          background: "#0a1628cc", border: `1px solid ${CY}44`,
          color: CY, fontFamily: "monospace", fontSize: 10,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ GTIME
      </button>
    );
  }

  const active = frames[activeIdx] || null;
  const maxNodes = Math.max(...frames.map(f => f.node_count), 1);
  const maxLinks = Math.max(...frames.map(f => f.link_count), 1);
  const nodeGrowth = frames.length > 1
    ? (frames[frames.length - 1].node_count - frames[0].node_count)
    : 0;

  return (
    <div style={{
      position: "fixed", bottom: 40, left: BTN_LEFT - 160, zIndex: 9100,
      width: 400, background: "#050d1aee",
      border: `1px solid ${CY}44`, borderRadius: 8,
      fontFamily: "monospace", color: CY, fontSize: 11,
      boxShadow: `0 0 24px ${CY}22`,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid ${CY}22` }}>
        <span style={{ fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>
          ◈ GRAPH TIMELINE
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={load} style={{ background: "none", border: `1px solid ${CY}44`,
            color: CY, fontFamily: "monospace", fontSize: 10, padding: "2px 6px",
            borderRadius: 3, cursor: "pointer" }}>↻</button>
          <button onClick={() => setVisible(false)} style={{ background: "none",
            border: "none", color: "#ffffff66", fontFamily: "monospace",
            fontSize: 14, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
      </div>

      <div style={{ padding: "10px 12px" }}>
        {loading && (
          <div style={{ color: CY, opacity: 0.6, textAlign: "center", padding: "12px 0" }}>
            Loading temporal frames…
          </div>
        )}
        {error && !loading && (
          <div style={{ color: "#FF3D5A", textAlign: "center", padding: "12px 0" }}>{error}</div>
        )}
        {!loading && !error && frames.length === 0 && (
          <div style={{ color: "#ffffff44", textAlign: "center", padding: "12px 0" }}>
            No temporal data available.
          </div>
        )}

        {!loading && frames.length > 0 && (
          <>
            {/* summary pills */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {[
                { label: "FRAMES", val: frames.length, col: CY },
                { label: "PEAK NODES", val: maxNodes, col: GRN },
                { label: "PEAK LINKS", val: maxLinks, col: VIOLET },
                { label: "NODE DELTA", val: (nodeGrowth >= 0 ? "+" : "") + nodeGrowth, col: nodeGrowth >= 0 ? GRN : AMBER },
              ].map(({ label, val, col }) => (
                <span key={label} style={{
                  background: "#0a1628", border: `1px solid ${col}44`,
                  borderRadius: 3, padding: "2px 7px", color: col, fontSize: 10,
                }}>
                  {label}: <b>{val}</b>
                </span>
              ))}
            </div>

            {/* bar chart */}
            <div style={{ marginBottom: 8 }}>
              <BarChart frames={frames} activeIdx={activeIdx} onHover={setActiveIdx} />
              <div style={{ display: "flex", justifyContent: "space-between",
                color: "#ffffff44", fontSize: 9, marginTop: 2, padding: "0 4px" }}>
                <span style={{ color: CY }}>■ nodes</span>
                <span style={{ color: VIOLET }}>■ links</span>
              </div>
            </div>

            {/* scrubber slider */}
            <input
              type="range" min={0} max={frames.length - 1} value={activeIdx}
              onChange={e => setActiveIdx(Number(e.target.value))}
              style={{ width: "100%", accentColor: CY, marginBottom: 8 }}
            />

            {/* active frame detail */}
            {active && (
              <div style={{
                background: "#0a1628", border: `1px solid ${CY}33`,
                borderRadius: 4, padding: "8px 10px", marginBottom: 8,
              }}>
                <div style={{ color: "#ffffff88", fontSize: 10, marginBottom: 4 }}>
                  FRAME {active.index + 1} / {frames.length}
                  {active.ts ? <span style={{ marginLeft: 8, color: CY }}>{fmtTs(active.ts)}</span> : ""}
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 9, color: "#ffffff55" }}>NODES</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: CY }}>
                      {active.node_count}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: "#ffffff55" }}>LINKS</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: VIOLET }}>
                      {active.link_count}
                    </div>
                  </div>
                  {active.note && (
                    <div style={{ fontSize: 9, color: AMBER, alignSelf: "flex-end" }}>
                      {active.note}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => assess(active)}
                  disabled={assessing === active.index}
                  style={{
                    marginTop: 8,
                    background: assessing === active.index ? "#0a1628" : "#0d2a1a",
                    border: `1px solid ${GRN}66`,
                    color: GRN, fontFamily: "monospace", fontSize: 10,
                    padding: "3px 10px", borderRadius: 3, cursor: "pointer",
                  }}
                >
                  {assessing === active.index ? "Assessing…" : "▶ ASSESS"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
