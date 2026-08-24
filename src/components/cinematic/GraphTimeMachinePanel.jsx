/**
 * GraphTimeMachinePanel — F361
 * Point-in-time knowledge graph inspection + growth sparkline.
 *
 * Endpoints:
 *   GET  /v1/graph-time/at?ts=<epoch_ms>   — graph snapshot at a specific instant
 *   POST /v1/graph-time/playback           — N-frame growth sparkline over a window
 *   POST /v1/jarvis/agent/chat             — AI temporal graph brief + TTS
 *
 * Toggle: ◷ GTMX  left:652800  bottom:8  zIndex:237
 * Event:  jarvis:gtmx-toggle
 * Voice:  "graph time machine" | "graph snapshot" | "graph at" | "temporal graph"
 *         "gtmx" | "historical graph" | "graph as of" | "how big was the graph"
 *         "graph in the past" | "graph time" | "past graph"
 *
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GN  = "#00E5A0";
const AM  = "#F59E0B";
const RO  = "#F43F5E";
const VIO = "#A78BFA";
const DIM = "#4A6070";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const GTMX_RE =
  /\bgraph\s+time\s+machine\b|\bgraph\s+snap|\bgraph\s+at\b|\btemporal\s+graph\b|\bgtmx\b|\bhistorical\s+graph\b|\bgraph\s+as\s+of\b|\bhow\s+big\s+was\s+the\s+graph\b|\bgraph\s+in\s+the\s+past\b|\bgraph\s+time\b|\bpast\s+graph\b/i;

export function isGtmxQuery(text) {
  return GTMX_RE.test(text || "");
}

export async function buildGtmxScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/graph-time/playback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ frames: 12 }),
    });
    if (!r.ok) throw new Error("no data");
    const d = await r.json();
    const frames = Array.isArray(d) ? d : (d.frames || d.snapshots || []);
    if (!frames.length) {
      return "Graph Time Machine is online, sir. No temporal frame data is available yet — the knowledge graph may not carry created timestamps.";
    }
    const first = frames[0];
    const last = frames[frames.length - 1];
    const nodeNow = last.node_count ?? last.nodes ?? last.n_nodes ?? 0;
    const nodeStart = first.node_count ?? first.nodes ?? first.n_nodes ?? 0;
    const delta = nodeNow - nodeStart;
    const trend = delta > 0 ? "growing" : delta < 0 ? "shrinking" : "stable";
    return (
      `Graph Time Machine: ${frames.length} temporal frames loaded. ` +
      `The knowledge graph is ${trend} — ${nodeStart} nodes at the earliest recorded instant to ${nodeNow} now` +
      (delta !== 0 ? `, a delta of ${delta > 0 ? "+" : ""}${delta} nodes` : "") +
      ". Opening time machine panel for point-in-time inspection, sir."
    );
  } catch {
    return "Graph Time Machine is online, sir. Use it to inspect the knowledge graph at any point in history.";
  }
}

function fmtTs(ms) {
  if (!ms) return "—";
  try {
    const d = new Date(typeof ms === "number" && ms < 1e12 ? ms * 1000 : ms);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

function nowLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function daysAgoLocal(days) {
  const d = new Date(Date.now() - days * 86400_000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function GrowthSparkline({ frames }) {
  if (!frames.length) return <div style={{ color: DIM, fontSize: 12, textAlign: "center", padding: 12 }}>No frame data.</div>;
  const W = 360, H = 60, PAD = 4;
  const maxN = Math.max(...frames.map((f) => f.node_count ?? f.nodes ?? f.n_nodes ?? 0), 1);
  const barW = Math.max(1, Math.floor((W - PAD * 2) / frames.length) - 1);
  return (
    <svg width={W} height={H} style={{ display: "block", margin: "0 auto", overflow: "visible" }}>
      {frames.map((f, i) => {
        const n = f.node_count ?? f.nodes ?? f.n_nodes ?? 0;
        const h = Math.max(2, Math.floor((n / maxN) * (H - 8)));
        const x = PAD + i * (barW + 1);
        return (
          <rect key={i} x={x} y={H - h} width={barW} height={h}
            fill={CY} opacity={0.7} rx={1} />
        );
      })}
    </svg>
  );
}

function StatTile({ label, value, accent }) {
  return (
    <div style={{
      flex: "1 1 0", minWidth: 80, background: "rgba(0,229,160,0.04)",
      border: `1px solid ${accent || GN}33`, borderRadius: 8,
      padding: "8px 10px", textAlign: "center",
    }}>
      <div style={{ color: accent || GN, fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ color: DIM, fontSize: 10, marginTop: 3, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function Chip({ label, color }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 7px", borderRadius: 4,
      border: `1px solid ${color || CY}55`, color: color || CY,
      fontSize: 10, marginRight: 4, marginBottom: 3, letterSpacing: 0.5,
    }}>{label}</span>
  );
}

export default function GraphTimeMachinePanel() {
  const [open, setOpen]           = useState(false);
  const [tab, setTab]             = useState("AT");        // AT | GROWTH
  const [atTs, setAtTs]           = useState(nowLocal());
  const [snapshot, setSnapshot]   = useState(null);
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapError, setSnapError] = useState(null);
  const [growT0, setGrowT0]       = useState(daysAgoLocal(30));
  const [growT1, setGrowT1]       = useState(nowLocal());
  const [frames, setFrames]       = useState(16);
  const [playback, setPlayback]   = useState([]);
  const [pbLoading, setPbLoading] = useState(false);
  const [pbError, setPbError]     = useState(null);
  const [assessing, setAssessing] = useState(false);
  const pollRef = useRef(null);

  const fetchSnapshot = useCallback(async (dtStr) => {
    setSnapLoading(true);
    setSnapError(null);
    setSnapshot(null);
    try {
      const ts = new Date(dtStr).getTime();
      const r = await fetch(`${apiBase()}/v1/graph-time/at?ts=${ts}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setSnapshot(d);
    } catch (e) {
      setSnapError(e.message || "Fetch failed");
    } finally {
      setSnapLoading(false);
    }
  }, []);

  const fetchPlayback = useCallback(async () => {
    setPbLoading(true);
    setPbError(null);
    try {
      const t0 = new Date(growT0).getTime();
      const t1 = new Date(growT1).getTime();
      const r = await fetch(`${apiBase()}/v1/graph-time/playback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ frames, t0, t1 }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const raw = Array.isArray(d) ? d : (d.frames || d.snapshots || []);
      setPlayback(raw.map((f, i) => ({
        index: i,
        ts: f.ts ?? f.timestamp ?? null,
        node_count: f.node_count ?? f.nodes ?? f.n_nodes ?? 0,
        link_count: f.link_count ?? f.links ?? f.n_edges ?? 0,
        note: f.note || null,
      })));
    } catch (e) {
      setPbError(e.message || "Fetch failed");
      setPlayback([]);
    } finally {
      setPbLoading(false);
    }
  }, [growT0, growT1, frames]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const ctx = snapshot
        ? `Graph at ${fmtTs(new Date(atTs).getTime())}: ${snapshot.n_nodes ?? 0} nodes, ${snapshot.n_edges ?? 0} edges.${snapshot.note ? " Note: " + snapshot.note : ""}`
        : playback.length
        ? `Growth over ${playback.length} frames — ${playback[0]?.node_count ?? 0} → ${playback[playback.length - 1]?.node_count ?? 0} nodes.`
        : "No temporal graph data loaded yet.";
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          message: `Graph Time Machine context: ${ctx}. Give a 2-sentence temporal insight and operational recommendation.`,
        }),
      });
      const d = await r.json();
      const txt = (d.answer || "Temporal graph analysis complete, sir.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
      try {
        const voice = getActiveVoice?.();
        if (voice?.speak) voice.speak(txt);
      } catch (_) {}
    } catch (_) {}
    setAssessing(false);
  }, [snapshot, playback, atTs]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:gtmx-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gtmx-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (open && tab === "AT" && !snapshot && !snapLoading) {
      fetchSnapshot(atTs);
    }
    if (open && tab === "GROWTH" && !playback.length && !pbLoading) {
      fetchPlayback();
    }
  }, [open, tab]);

  const nodeCount   = snapshot ? (snapshot.n_nodes ?? 0) : 0;
  const edgeCount   = snapshot ? (snapshot.n_edges ?? 0) : 0;
  const pbFirst     = playback[0];
  const pbLast      = playback[playback.length - 1];
  const growthDelta = pbFirst && pbLast
    ? (pbLast.node_count ?? 0) - (pbFirst.node_count ?? 0)
    : 0;

  const nodes = snapshot?.nodes || [];
  const typeCounts = {};
  nodes.forEach((n) => {
    const t = n.type || n.kind || n.object_type || "unknown";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  const topTypes = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Time Machine"
        style={{
          position: "fixed", left: 652800, bottom: 8, zIndex: 237,
          background: "rgba(5,8,13,0.7)", border: `1px solid ${CY}55`,
          color: CY, borderRadius: 6, padding: "4px 8px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10, cursor: "pointer",
          letterSpacing: 1, whiteSpace: "nowrap",
          boxShadow: `0 0 8px ${CY}33`,
        }}
      >
        ◷ GTMX
      </button>
    );
  }

  const TAB_STYLE = (active) => ({
    padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 11,
    border: `1px solid ${active ? CY : "transparent"}`,
    color: active ? CY : DIM, background: active ? `${CY}11` : "transparent",
    letterSpacing: 1,
  });

  const LABEL_STYLE = {
    color: DIM, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4,
  };

  return (
    <>
      <button
        onClick={() => setOpen(false)}
        title="Graph Time Machine"
        style={{
          position: "fixed", left: 652800, bottom: 8, zIndex: 237,
          background: `${CY}22`, border: `1px solid ${CY}`,
          color: CY, borderRadius: 6, padding: "4px 8px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10, cursor: "pointer",
          letterSpacing: 1, whiteSpace: "nowrap",
          boxShadow: `0 0 14px ${CY}44`,
        }}
      >
        ◷ GTMX
      </button>

      <div style={{
        position: "fixed", left: 80, top: 60, zIndex: 237,
        width: "min(480px, 90vw)", maxHeight: "80vh",
        background: "rgba(6,10,18,0.93)", border: `1px solid ${CY}44`,
        borderRadius: 12, padding: 16, overflowY: "auto",
        fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
        boxShadow: `0 0 40px ${CY}22`, backdropFilter: "blur(8px)",
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ color: CY, fontSize: 14 }}>◷</span>
          <b style={{ color: CY, letterSpacing: 2, fontSize: 12, textShadow: `0 0 10px ${CY}` }}>
            GRAPH TIME MACHINE
          </b>
          <button onClick={assess} disabled={assessing} style={{
            marginLeft: "auto", background: `${GN}22`, border: `1px solid ${GN}55`,
            color: GN, borderRadius: 4, padding: "3px 10px", fontSize: 10,
            cursor: assessing ? "not-allowed" : "pointer", letterSpacing: 1,
          }}>▶ {assessing ? "…" : "ASSESS"}</button>
          <button onClick={() => setOpen(false)} style={{
            background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14, padding: "0 4px",
          }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <StatTile label="Snapshot Nodes" value={nodeCount} accent={CY} />
          <StatTile label="Snapshot Edges" value={edgeCount} accent={VIO} />
          <StatTile label="Growth Frames" value={playback.length} accent={GN} />
          <StatTile label="Node Delta"
            value={growthDelta !== 0 ? `${growthDelta > 0 ? "+" : ""}${growthDelta}` : "—"}
            accent={growthDelta > 0 ? GN : growthDelta < 0 ? RO : DIM} />
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {["AT", "GROWTH"].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={TAB_STYLE(tab === t)}>{t}</button>
          ))}
        </div>

        {/* ── AT tab ── */}
        {tab === "AT" && (
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={LABEL_STYLE}>Point in Time</div>
                <input
                  type="datetime-local"
                  value={atTs}
                  onChange={(e) => setAtTs(e.target.value)}
                  style={{
                    background: "rgba(5,8,13,0.6)", border: `1px solid ${CY}44`,
                    color: "#DCEBF5", borderRadius: 4, padding: "4px 8px",
                    fontSize: 11, fontFamily: "inherit", width: "100%",
                  }}
                />
              </div>
              <button
                onClick={() => fetchSnapshot(atTs)}
                disabled={snapLoading}
                style={{
                  background: `${CY}22`, border: `1px solid ${CY}55`, color: CY,
                  borderRadius: 4, padding: "6px 12px", fontSize: 10, cursor: "pointer", letterSpacing: 1,
                  whiteSpace: "nowrap",
                }}
              >
                {snapLoading ? "…" : "⌕ FETCH"}
              </button>
            </div>

            {snapError && (
              <div style={{ color: RO, fontSize: 11, marginBottom: 8 }}>⚠ {snapError}</div>
            )}

            {snapshot && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, color: CY }}>
                    <b>{snapshot.n_nodes ?? 0}</b>
                    <span style={{ color: DIM }}> nodes</span>
                  </div>
                  <div style={{ fontSize: 12, color: VIO }}>
                    <b>{snapshot.n_edges ?? 0}</b>
                    <span style={{ color: DIM }}> edges</span>
                  </div>
                  <div style={{ fontSize: 12, color: AM }}>
                    @ <span style={{ color: "#DCEBF5" }}>{fmtTs(new Date(atTs).getTime())}</span>
                  </div>
                </div>

                {snapshot.note && (
                  <div style={{
                    background: `${AM}11`, border: `1px solid ${AM}33`,
                    borderRadius: 4, padding: "6px 10px", fontSize: 10, color: AM, marginBottom: 10,
                  }}>
                    ℹ {snapshot.note}
                  </div>
                )}

                {topTypes.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={LABEL_STYLE}>Node Types at Snapshot</div>
                    <div style={{ display: "flex", flexWrap: "wrap" }}>
                      {topTypes.map(([type, count]) => (
                        <Chip key={type} label={`${type} ×${count}`} color={CY} />
                      ))}
                    </div>
                  </div>
                )}

                {nodes.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={LABEL_STYLE}>
                      Sample Nodes ({Math.min(nodes.length, 8)} of {nodes.length})
                    </div>
                    {nodes.slice(0, 8).map((n, i) => (
                      <div key={i} style={{
                        background: "rgba(0,0,0,0.2)", borderRadius: 4,
                        padding: "4px 8px", marginBottom: 3, fontSize: 11,
                        display: "flex", gap: 8, alignItems: "center",
                      }}>
                        <Chip label={n.type || n.object_type || n.kind || "?"} color={VIO} />
                        <span style={{ color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {n.label || n.title || n.name || n.id || "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── GROWTH tab ── */}
        {tab === "GROWTH" && (
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={LABEL_STYLE}>From</div>
                <input
                  type="datetime-local"
                  value={growT0}
                  onChange={(e) => setGrowT0(e.target.value)}
                  style={{
                    background: "rgba(5,8,13,0.6)", border: `1px solid ${CY}44`,
                    color: "#DCEBF5", borderRadius: 4, padding: "4px 8px",
                    fontSize: 11, fontFamily: "inherit", width: "100%",
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={LABEL_STYLE}>To</div>
                <input
                  type="datetime-local"
                  value={growT1}
                  onChange={(e) => setGrowT1(e.target.value)}
                  style={{
                    background: "rgba(5,8,13,0.6)", border: `1px solid ${CY}44`,
                    color: "#DCEBF5", borderRadius: 4, padding: "4px 8px",
                    fontSize: 11, fontFamily: "inherit", width: "100%",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={LABEL_STYLE}>Frames: {frames}</div>
                <input
                  type="range"
                  min={4} max={48} step={4}
                  value={frames}
                  onChange={(e) => setFrames(Number(e.target.value))}
                  style={{ width: "100%", accentColor: CY }}
                />
              </div>
              <button
                onClick={fetchPlayback}
                disabled={pbLoading}
                style={{
                  background: `${CY}22`, border: `1px solid ${CY}55`, color: CY,
                  borderRadius: 4, padding: "6px 12px", fontSize: 10, cursor: "pointer", letterSpacing: 1,
                  whiteSpace: "nowrap",
                }}
              >
                {pbLoading ? "…" : "⌕ LOAD"}
              </button>
            </div>

            {pbError && (
              <div style={{ color: RO, fontSize: 11, marginBottom: 8 }}>⚠ {pbError}</div>
            )}

            {playback.length > 0 && (
              <>
                <div style={{ marginBottom: 10 }}>
                  <div style={LABEL_STYLE}>Node Growth Sparkline</div>
                  <GrowthSparkline frames={playback} />
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 10, fontSize: 12, flexWrap: "wrap" }}>
                  <span style={{ color: DIM }}>Start:</span>
                  <span style={{ color: CY }}>
                    <b>{pbFirst?.node_count ?? 0}</b> nodes / <b>{pbFirst?.link_count ?? 0}</b> edges
                  </span>
                  <span style={{ color: DIM }}>→ End:</span>
                  <span style={{ color: GN }}>
                    <b>{pbLast?.node_count ?? 0}</b> nodes / <b>{pbLast?.link_count ?? 0}</b> edges
                  </span>
                </div>

                {growthDelta !== 0 && (
                  <div style={{
                    background: `${growthDelta > 0 ? GN : RO}11`,
                    border: `1px solid ${growthDelta > 0 ? GN : RO}33`,
                    borderRadius: 4, padding: "6px 10px", fontSize: 11,
                    color: growthDelta > 0 ? GN : RO, marginBottom: 10,
                  }}>
                    {growthDelta > 0 ? "▲" : "▼"} {Math.abs(growthDelta)} node{Math.abs(growthDelta) !== 1 ? "s" : ""} {growthDelta > 0 ? "added" : "removed"} across this window
                  </div>
                )}

                <div style={{ marginBottom: 4 }}>
                  <div style={LABEL_STYLE}>Frame Log ({playback.length})</div>
                  {playback.map((f, i) => (
                    <div key={i} style={{
                      display: "flex", gap: 8, fontSize: 10, padding: "2px 0",
                      borderBottom: `1px solid rgba(41,231,255,0.05)`,
                    }}>
                      <span style={{ color: DIM, minWidth: 24, textAlign: "right" }}>#{i + 1}</span>
                      <span style={{ color: AM, minWidth: 120 }}>{f.ts ? fmtTs(f.ts) : "—"}</span>
                      <span style={{ color: CY }}>{f.node_count}N</span>
                      <span style={{ color: VIO }}>{f.link_count}E</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
