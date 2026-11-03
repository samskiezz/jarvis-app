/**
 * TemporalReplayAnimator — F295.
 *
 * GET /v1/temporal/series → series_id selector.
 * GET /v1/temporal/replay?series_id=&n_frames=50 → N cumulative frames.
 * Each frame holds values[0..k] — SVG line chart grows frame-by-frame.
 * At the final frame: GET /v1/temporal/events?series_id= → event markers.
 * Controls: play/pause, step-back, step-forward, scrubber slider, speed 1×/2×/5×.
 * Newest point pulses with a cyan ring.
 * ASSESS → /v1/jarvis/agent/chat + TTS via jarvis:speak-dossier.
 *
 * Toggle: ◈ TMPRLPY at left:213000, zIndex:391; event jarvis:tmprlpy-toggle.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GRN = "#00E5A0";
const RED = "#FF4444";
const AMBER = "#F5A623";
const DIM = "#0a1628";
const BTN_LEFT = 213000;
const Z = 391;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const SPEED_MAP = { "1×": 1200, "2×": 600, "5×": 240 };
const SPEED_LABELS = Object.keys(SPEED_MAP);

const SVG_W = 440;
const SVG_H = 200;
const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 24;

// ── exported helpers for JarvisBrain ─────────────────────────────────────────

export function isTmprlpyQuery(q) {
  return /temporal.replay|tmprlpy|replay.animator|series.replay|time.replay|series.trajectory/i.test(q || "");
}

export async function buildTmprlpyScript() {
  try {
    const seriesList = await fetchSeriesList();
    const series = seriesList?.series_ids || seriesList?.series || seriesList || [];
    window.dispatchEvent(new CustomEvent("jarvis:tmprlpy-toggle"));
    if (!series.length) return "Temporal replay animator is open, sir. No series available yet.";
    return `Temporal replay animator active, sir. ${series.length} series available in the history lake. Select a series and press play to animate its trajectory over time.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:tmprlpy-toggle"));
    return "Temporal replay animator is open, sir.";
  }
}

// ── data layer ────────────────────────────────────────────────────────────────

async function fetchSeriesList() {
  const r = await fetch(`${apiBase()}/v1/temporal/series`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`series ${r.status}`);
  return r.json();
}

async function fetchReplay(seriesId, nFrames) {
  const url = `${apiBase()}/v1/temporal/replay?series_id=${encodeURIComponent(seriesId)}&n_frames=${nFrames}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
  if (!r.ok) throw new Error(`replay ${r.status}`);
  return r.json();
}

async function fetchEvents(seriesId) {
  const url = `${apiBase()}/v1/temporal/events?series_id=${encodeURIComponent(seriesId)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
  if (!r.ok) return { events: [] };
  return r.json();
}

function fmtIso(ts) {
  if (!ts) return "—";
  try {
    return new Date(typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts)
      .toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch { return String(ts); }
}

// ── SVG line chart ─────────────────────────────────────────────────────────────

function LineChart({ frames, frameIdx, events }) {
  if (!frames || !frames.length) {
    return <rect width={SVG_W} height={SVG_H} fill={DIM} rx={4} />;
  }

  // current frame data: values up to this frame
  const frame = frames[frameIdx];
  const values = frame?.values || [];
  if (!values.length) {
    return (
      <>
        <rect width={SVG_W} height={SVG_H} fill={DIM} rx={4} />
        <text x={SVG_W / 2} y={SVG_H / 2} fill="#4a6a80" fontSize={10}
          textAnchor="middle">No data</text>
      </>
    );
  }

  const W = SVG_W - PAD_L - PAD_R;
  const H = SVG_H - PAD_T - PAD_B;

  const allVals = frames.flatMap(f => f?.values || []).filter(v => typeof v === "number");
  const minVal = allVals.length ? Math.min(...allVals) : 0;
  const maxVal = allVals.length ? Math.max(...allVals) : 1;
  const range = maxVal - minVal || 1;

  const toX = (i, total) => PAD_L + (i / Math.max(total - 1, 1)) * W;
  const toY = v => PAD_T + H - ((v - minVal) / range) * H;

  // total number of points across all frames — use final frame length for full x-axis
  const totalPts = (frames[frames.length - 1]?.values || []).length;

  // build polyline for current slice
  const pts = values.map((v, i) => `${toX(i, totalPts)},${toY(v)}`).join(" ");

  // event markers (only on final frame)
  const isFinal = frameIdx === frames.length - 1;
  const evtMarkers = isFinal ? (events?.events || events || []) : [];

  // newest point
  const lastVal = values[values.length - 1];
  const nx = toX(values.length - 1, totalPts);
  const ny = toY(lastVal ?? 0);

  // y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    v: minVal + t * range,
    y: PAD_T + H - t * H,
  }));

  return (
    <>
      <rect width={SVG_W} height={SVG_H} fill={DIM} rx={4} />

      {/* grid lines */}
      {yTicks.map(({ y }, i) => (
        <line key={i} x1={PAD_L} x2={SVG_W - PAD_R} y1={y} y2={y}
          stroke="#ffffff0a" strokeWidth={1} />
      ))}

      {/* y-axis labels */}
      {yTicks.map(({ v, y }, i) => (
        <text key={i} x={PAD_L - 4} y={y + 3} fill="#4a6a80" fontSize={8}
          textAnchor="end">{v.toFixed(1)}</text>
      ))}

      {/* event markers */}
      {evtMarkers.map((ev, i) => {
        const evTs = ev.timestamp || ev.ts;
        const evV = ev.value;
        if (evV == null) return null;
        const evIdx = values.findIndex((_, idx) => {
          const fTs = frame?.timestamps?.[idx];
          return fTs && String(fTs) === String(evTs);
        });
        if (evIdx < 0) return null;
        const ex = toX(evIdx, totalPts);
        const ey = toY(evV);
        return (
          <g key={i}>
            <line x1={ex} x2={ex} y1={PAD_T} y2={PAD_T + H}
              stroke={RED} strokeWidth={1} strokeDasharray="3,3" opacity={0.6} />
            <circle cx={ex} cy={ey} r={4} fill={RED} opacity={0.85} />
          </g>
        );
      })}

      {/* line */}
      {values.length > 1 && (
        <polyline points={pts} fill="none" stroke={CY} strokeWidth={1.5}
          opacity={0.9} />
      )}

      {/* area fill */}
      {values.length > 1 && (
        <polyline
          points={`${toX(0, totalPts)},${PAD_T + H} ${pts} ${nx},${PAD_T + H}`}
          fill={CY} opacity={0.06}
        />
      )}

      {/* pulsing newest point */}
      {values.length > 0 && (
        <>
          <circle cx={nx} cy={ny} r={8} fill="none" stroke={CY} strokeWidth={1} opacity={0.3}>
            <animate attributeName="r" values="5;10;5" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0.1;0.4" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <circle cx={nx} cy={ny} r={3} fill={CY} />
        </>
      )}

      {/* x-axis baseline */}
      <line x1={PAD_L} x2={SVG_W - PAD_R} y1={PAD_T + H} y2={PAD_T + H}
        stroke="#ffffff18" strokeWidth={1} />
    </>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function TemporalReplayAnimator() {
  const [visible, setVisible] = useState(false);
  const [seriesList, setSeriesList] = useState([]);
  const [seriesId, setSeriesId] = useState("");
  const [nFrames, setNFrames] = useState(50);
  const [frames, setFrames] = useState([]);
  const [events, setEvents] = useState(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("1×");
  const [loading, setLoading] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [error, setError] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const playRef = useRef(null);

  const total = frames.length;

  // toggle via custom event
  useEffect(() => {
    const h = () => { setVisible(v => !v); };
    window.addEventListener("jarvis:tmprlpy-toggle", h);
    return () => window.removeEventListener("jarvis:tmprlpy-toggle", h);
  }, []);

  // load series list when panel opens
  useEffect(() => {
    if (!visible || seriesList.length) return;
    setLoadingSeries(true);
    fetchSeriesList()
      .then(d => {
        const ids = d?.series_ids || d?.series || (Array.isArray(d) ? d : []);
        setSeriesList(ids);
        if (ids.length && !seriesId) setSeriesId(ids[0]);
      })
      .catch(() => setSeriesList([]))
      .finally(() => setLoadingSeries(false));
  }, [visible, seriesList.length, seriesId]);

  const loadReplay = useCallback(async (sid, n) => {
    if (!sid) return;
    setLoading(true);
    setError(null);
    setFrames([]);
    setFrameIdx(0);
    setPlaying(false);
    setEvents(null);
    try {
      const [replayData, evtData] = await Promise.all([
        fetchReplay(sid, n),
        fetchEvents(sid).catch(() => ({ events: [] })),
      ]);
      const fs = replayData?.frames || [];
      setFrames(fs);
      setEvents(evtData);
      if (fs.length) setFrameIdx(0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // playback loop
  useEffect(() => {
    if (!playing || !total) return;
    const ms = SPEED_MAP[speed] || 1200;
    playRef.current = setInterval(() => {
      setFrameIdx(i => {
        const next = i + 1;
        if (next >= total) { setPlaying(false); return i; }
        return next;
      });
    }, ms);
    return () => clearInterval(playRef.current);
  }, [playing, total, speed]);

  async function assess() {
    if (!total) return;
    setAssessing(true);
    const frame = frames[frameIdx];
    const vals = frame?.values || [];
    const firstFrame = frames[0];
    const lastFrame = frames[total - 1];
    const firstVal = firstFrame?.values?.[0] ?? 0;
    const lastVal = lastFrame?.values?.[lastFrame.values.length - 1] ?? 0;
    const trend = lastVal > firstVal ? "ascending" : lastVal < firstVal ? "descending" : "flat";
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Temporal series replay analysis for series "${seriesId}": ${total} frames loaded. Currently at frame ${frameIdx + 1}/${total} with ${vals.length} data points visible. Series trajectory is ${trend}: opened at ${firstVal.toFixed(3)} and closed at ${lastVal.toFixed(3)}. Current frame timestamp: ${fmtIso(frame?.timestamp || frame?.ts)}. Provide a 2-sentence intelligence assessment of this series trajectory and its operational significance.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.message || d.content || "Assessment complete.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: "Temporal replay assessment unavailable." } }));
    } finally {
      setAssessing(false);
    }
  }

  function stepBack() {
    setPlaying(false);
    setFrameIdx(i => Math.max(0, i - 1));
  }
  function stepFwd() {
    setPlaying(false);
    setFrameIdx(i => Math.min(total - 1, i + 1));
  }

  const frame = frames[frameIdx] || null;
  const frameTs = frame?.timestamp || frame?.ts || null;
  const vals = frame?.values || [];
  const lastVal = vals[vals.length - 1];

  if (!visible) {
    return (
      <button
        title="Temporal Replay Animator"
        onClick={() => setVisible(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z,
          background: "#0a1628cc", border: `1px solid ${CY}44`,
          color: CY, fontFamily: "monospace", fontSize: 10,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ TMPRLPY
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 40, left: BTN_LEFT, zIndex: Z,
      width: 470, background: "#050e1ddd", border: `1px solid ${CY}33`,
      borderRadius: 6, fontFamily: "monospace", color: CY, fontSize: 11,
      boxShadow: "0 0 16px #000a",
    }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: `1px solid ${CY}22` }}>
        <span style={{ fontSize: 12, letterSpacing: 2 }}>◈ TEMPORAL REPLAY ANIMATOR</span>
        <button onClick={() => { setVisible(false); setPlaying(false); }}
          style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}>×</button>
      </div>

      {/* series selector + load controls */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 10px", borderBottom: `1px solid ${CY}22`, flexWrap: "wrap" }}>
        <span style={{ color: "#6a8fa0", fontSize: 10 }}>SERIES</span>
        {loadingSeries ? (
          <span style={{ color: "#6a8fa0", fontSize: 10 }}>loading…</span>
        ) : (
          <select
            value={seriesId}
            onChange={e => setSeriesId(e.target.value)}
            style={{ background: DIM, border: `1px solid ${CY}44`, color: CY, fontFamily: "monospace", fontSize: 10, padding: "1px 4px", borderRadius: 2, maxWidth: 160 }}
          >
            {seriesList.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
            {!seriesList.length && <option value="">— no series —</option>}
          </select>
        )}
        <span style={{ color: "#6a8fa0", fontSize: 10 }}>N</span>
        <input
          type="number" min={10} max={200} value={nFrames}
          onChange={e => setNFrames(Math.max(10, Math.min(200, +e.target.value)))}
          style={{ width: 44, background: DIM, border: `1px solid ${CY}44`, color: CY, fontFamily: "monospace", fontSize: 10, padding: "1px 4px", borderRadius: 2 }}
        />
        <button onClick={() => loadReplay(seriesId, nFrames)} disabled={loading || !seriesId}
          style={{ background: "#0e2040", border: `1px solid ${CY}55`, color: CY, fontFamily: "monospace", fontSize: 10, padding: "2px 8px", borderRadius: 3, cursor: "pointer" }}>
          {loading ? "…" : "LOAD"}
        </button>
        {error && <span style={{ color: RED, fontSize: 9 }}>{error}</span>}
      </div>

      {/* frame timestamp */}
      <div style={{ padding: "3px 10px", fontSize: 10, color: "#5a8a9a", borderBottom: `1px solid ${CY}22`, display: "flex", gap: 12 }}>
        <span>FRAME {total ? `${frameIdx + 1}/${total}` : "—"}</span>
        <span>{fmtIso(frameTs)}</span>
        {lastVal != null && (
          <span style={{ color: CY }}>LAST {lastVal.toFixed(4)}</span>
        )}
        {total > 0 && frameIdx === total - 1 && (
          <span style={{ color: GRN, fontSize: 9 }}>● FULL SERIES</span>
        )}
      </div>

      {/* SVG chart */}
      <div style={{ padding: "6px 10px" }}>
        <svg width={SVG_W} height={SVG_H} style={{ display: "block", borderRadius: 4 }}>
          <LineChart frames={frames} frameIdx={frameIdx} events={events} />
        </svg>
      </div>

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
        <input
          type="range" min={0} max={Math.max(0, total - 1)} value={frameIdx}
          onChange={e => { setPlaying(false); setFrameIdx(+e.target.value); }}
          style={{ flex: 1, accentColor: CY, cursor: "pointer" }}
        />
        <span style={{ color: CY, fontSize: 10, minWidth: 40, textAlign: "right" }}>
          {total ? `${frameIdx + 1}/${total}` : "—"}
        </span>
      </div>

      {/* speed + assess */}
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
