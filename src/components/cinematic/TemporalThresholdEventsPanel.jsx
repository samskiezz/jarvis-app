/**
 * TemporalThresholdEventsPanel — F305.
 *
 * series_id selector from GET /v1/history/series.
 * GET /v1/temporal/events?series_id=&threshold=&direction= → threshold-crossing events.
 * SVG timeline: events as vertical markers at crossing value.
 * Click event → inspector: exact value, timestamp, delta from threshold, duration above/below.
 * Frequency histogram below (events per day).
 * ASSESS speaks about threshold crossing patterns + TTS.
 *
 * Button: ◈ THRSHEVT (left:218600, zIndex:401). Mounted in App.jsx.
 */
import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#FF3B6B";
const PURP = "#B06EFF";

const BTN_LEFT = 218600;
const Z_IDX    = 401;
const PANEL_W  = 820;
const PANEL_H  = 620;
const SVG_W    = 760;
const SVG_H    = 200;
const HIST_H   = 100;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const THRSHEVT_RE = /thrshevt|threshold.*event|temporal.*threshold|crossing.*event/i;
export function isThrshevtQuery(q) {
  return THRSHEVT_RE.test(q || "");
}

function fmtTs(epochMs) {
  if (!epochMs) return "—";
  return new Date(epochMs).toISOString().replace("T", " ").slice(0, 19);
}

function fmtVal(v) {
  if (v == null) return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return String(v);
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(3);
}

function normSeriesList(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.series)) return raw.series;
  if (raw && Array.isArray(raw.items)) return raw.items;
  return [];
}

function normEvents(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.events)) return raw.events;
  return [];
}

// build per-day histogram buckets from events
function buildHistogram(events) {
  if (!events || events.length === 0) return [];
  const dayMap = {};
  for (const ev of events) {
    const ts = ev.t || ev.timestamp || ev.time || 0;
    const day = new Date(ts).toISOString().slice(0, 10);
    dayMap[day] = (dayMap[day] || 0) + 1;
  }
  return Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day, count }));
}

export default function TemporalThresholdEventsPanel() {
  const [open, setOpen]       = useState(false);
  const [seriesList, setSeriesList] = useState([]);
  const [seriesErr, setSeriesErr]   = useState("");
  const [selSeries, setSelSeries]   = useState("");
  const [threshold, setThreshold]   = useState("");
  const [direction, setDirection]   = useState("both");
  const [loading, setLoading]       = useState(false);
  const [events, setEvents]         = useState(null);
  const [thresholdUsed, setThresholdUsed] = useState(null);
  const [fetchErr, setFetchErr]     = useState("");
  const [selected, setSelected]     = useState(null);
  const [assessText, setAssessText] = useState("");
  const [assessing, setAssessing]   = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:thrshevt-toggle", toggle);
    return () => window.removeEventListener("jarvis:thrshevt-toggle", toggle);
  }, []);

  // load series catalog when panel opens
  useEffect(() => {
    if (!open || seriesList.length > 0) return;
    setSeriesErr("");
    fetch(`${apiBase()}/v1/history/series`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        const list = normSeriesList(d);
        setSeriesList(list);
        if (list.length > 0 && !selSeries) {
          setSelSeries(list[0].series_id || list[0].id || "");
        }
      })
      .catch(e => setSeriesErr(`Series load failed: ${e}`));
  }, [open]);

  async function speak(text) {
    try {
      const r = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
      if (!r.ok) return;
      const url = URL.createObjectURL(await r.blob());
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
      const a = new Audio(url);
      audioRef.current = a;
      a.play().catch(() => {});
    } catch {}
  }

  async function fetchEvents() {
    if (!selSeries) return;
    setLoading(true); setFetchErr(""); setEvents(null); setSelected(null); setAssessText("");
    const params = new URLSearchParams({ series_id: selSeries, direction });
    if (threshold.trim() !== "") params.set("threshold", threshold.trim());
    try {
      const r = await fetch(`${apiBase()}/v1/temporal/events?${params}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) { setFetchErr(`HTTP ${r.status}`); return; }
      const d = await r.json();
      const evList = normEvents(d);
      setEvents(evList);
      setThresholdUsed(d.threshold ?? null);
    } catch (e) {
      setFetchErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function assess() {
    if (!events) return;
    setAssessing(true);
    const summary = `Series ${selSeries}: ${events.length} threshold-crossing event(s), direction=${direction}, threshold=${thresholdUsed ?? "auto"}.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Assess threshold crossing patterns. ${summary} Top events: ${JSON.stringify(events.slice(0, 5))}` }),
      });
      if (r.ok) {
        const d = await r.json();
        const txt = d.response || d.message || d.text || "No assessment.";
        setAssessText(txt);
        speak(txt.slice(0, 400));
      }
    } catch {}
    setAssessing(false);
  }

  // SVG timeline rendering
  function renderTimeline() {
    if (!events || events.length === 0) return null;
    const tvals = events.map(e => e.t || e.timestamp || e.time || 0).filter(Boolean);
    const vals  = events.map(e => parseFloat(e.value ?? e.v ?? 0));
    if (tvals.length === 0) return null;
    const tMin = Math.min(...tvals);
    const tMax = Math.max(...tvals) || tMin + 1;
    const vMin = Math.min(...vals, parseFloat(thresholdUsed ?? 0)) * 0.95;
    const vMax = Math.max(...vals, parseFloat(thresholdUsed ?? 0)) * 1.05 || vMin + 1;
    const pad = { l: 48, r: 16, t: 16, b: 24 };
    const w = SVG_W - pad.l - pad.r;
    const h = SVG_H - pad.t - pad.b;

    function tx(t) { return pad.l + ((t - tMin) / (tMax - tMin)) * w; }
    function ty(v) { return pad.t + h - ((v - vMin) / (vMax - vMin)) * h; }

    const thY = typeof thresholdUsed === "number" ? ty(thresholdUsed) : null;

    return (
      <svg width={SVG_W} height={SVG_H} style={{ display: "block", background: "rgba(0,0,0,0.3)", borderRadius: 4, border: `1px solid ${BORD}` }}>
        {/* threshold line */}
        {thY != null && (
          <line x1={pad.l} y1={thY} x2={pad.l + w} y2={thY}
            stroke={AM} strokeWidth={1} strokeDasharray="4,3" opacity={0.7} />
        )}
        {thY != null && (
          <text x={pad.l + 2} y={thY - 3} fill={AM} fontSize={9} opacity={0.8}>
            {fmtVal(thresholdUsed)}
          </text>
        )}
        {/* event markers */}
        {events.map((ev, i) => {
          const t = ev.t || ev.timestamp || ev.time || 0;
          const v = parseFloat(ev.value ?? ev.v ?? 0);
          const x = tx(t);
          const y = ty(v);
          const isSel = selected && selected === i;
          const col = (ev.direction || ev.kind || "").includes("down") ? RD : CY;
          return (
            <g key={i} style={{ cursor: "pointer" }} onClick={() => setSelected(isSel ? null : i)}>
              <line x1={x} y1={pad.t + h} x2={x} y2={y} stroke={col} strokeWidth={isSel ? 2 : 1} opacity={0.7} />
              <circle cx={x} cy={y} r={isSel ? 5 : 3} fill={col} opacity={0.9} />
            </g>
          );
        })}
        {/* axes */}
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + h} stroke={BORD} strokeWidth={1} />
        <line x1={pad.l} y1={pad.t + h} x2={pad.l + w} y2={pad.t + h} stroke={BORD} strokeWidth={1} />
        <text x={pad.l - 2} y={pad.t + 10} fill={CY} fontSize={8} textAnchor="end" opacity={0.6}>{fmtVal(vMax)}</text>
        <text x={pad.l - 2} y={pad.t + h} fill={CY} fontSize={8} textAnchor="end" opacity={0.6}>{fmtVal(vMin)}</text>
      </svg>
    );
  }

  // histogram
  function renderHistogram() {
    if (!events || events.length === 0) return null;
    const buckets = buildHistogram(events);
    if (buckets.length === 0) return null;
    const maxCount = Math.max(...buckets.map(b => b.count), 1);
    const bw = Math.max(4, Math.floor((SVG_W - 40) / buckets.length) - 2);
    return (
      <svg width={SVG_W} height={HIST_H} style={{ display: "block", background: "rgba(0,0,0,0.2)", borderRadius: 4, border: `1px solid ${BORD}`, marginTop: 8 }}>
        <text x={8} y={12} fill={CY} fontSize={9} opacity={0.6}>Events / day</text>
        {buckets.map((b, i) => {
          const barH = Math.round(((b.count / maxCount) * (HIST_H - 28)));
          const x = 8 + i * (bw + 2);
          const y = HIST_H - 16 - barH;
          return (
            <g key={b.day}>
              <rect x={x} y={y} width={bw} height={barH} fill={PURP} opacity={0.75} rx={1} />
              {bw >= 12 && (
                <text x={x + bw / 2} y={HIST_H - 4} fill={CY} fontSize={7} textAnchor="middle" opacity={0.5}>
                  {b.day.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  }

  if (!open) {
    return (
      <div
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, top: 32, zIndex: Z_IDX,
          color: CY, fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1, cursor: "pointer", userSelect: "none",
          background: "rgba(10,18,28,0.75)", border: `1px solid ${BORD}`,
          padding: "3px 7px", borderRadius: 3,
        }}
      >
        ◈ THRSHEVT
      </div>
    );
  }

  const selEvent = selected != null && events ? events[selected] : null;

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 400, top: 60, zIndex: Z_IDX,
      width: PANEL_W, maxHeight: PANEL_H, overflowY: "auto",
      background: SURF, border: `1px solid ${BORD}`,
      borderRadius: 6, padding: 16, fontFamily: "'JetBrains Mono',monospace",
      color: CY, fontSize: 11,
    }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>
          ◈ TEMPORAL THRESHOLD EVENTS
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: RD, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ color: CY, opacity: 0.7, fontSize: 10 }}>SERIES</label>
          {seriesErr ? (
            <span style={{ color: RD, fontSize: 10 }}>{seriesErr}</span>
          ) : (
            <select
              value={selSeries}
              onChange={e => setSelSeries(e.target.value)}
              style={{ background: "rgba(0,0,0,0.5)", color: CY, border: `1px solid ${BORD}`, borderRadius: 3, padding: "2px 6px", fontSize: 10, minWidth: 180 }}
            >
              {seriesList.length === 0 && <option value="">— loading —</option>}
              {seriesList.map(s => {
                const sid = s.series_id || s.id || "";
                const lbl = s.label || s.metric || sid;
                return <option key={sid} value={sid}>{lbl}</option>;
              })}
            </select>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ color: CY, opacity: 0.7, fontSize: 10 }}>THRESHOLD (blank=auto)</label>
          <input
            type="number"
            value={threshold}
            onChange={e => setThreshold(e.target.value)}
            placeholder="mean+1σ"
            style={{ background: "rgba(0,0,0,0.5)", color: CY, border: `1px solid ${BORD}`, borderRadius: 3, padding: "2px 6px", fontSize: 10, width: 110 }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ color: CY, opacity: 0.7, fontSize: 10 }}>DIRECTION</label>
          <select
            value={direction}
            onChange={e => setDirection(e.target.value)}
            style={{ background: "rgba(0,0,0,0.5)", color: CY, border: `1px solid ${BORD}`, borderRadius: 3, padding: "2px 6px", fontSize: 10 }}
          >
            <option value="up">Up</option>
            <option value="down">Down</option>
            <option value="both">Both</option>
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 4 }}>
          <button
            onClick={fetchEvents}
            disabled={loading || !selSeries}
            style={{ background: loading ? "rgba(41,231,255,0.1)" : CY, color: "#0A121C", border: "none", borderRadius: 3, padding: "4px 14px", fontFamily: "inherit", fontWeight: 700, fontSize: 10, cursor: loading ? "wait" : "pointer" }}
          >
            {loading ? "LOADING…" : "FETCH EVENTS"}
          </button>
        </div>
      </div>

      {fetchErr && <div style={{ color: RD, fontSize: 10, marginBottom: 8 }}>{fetchErr}</div>}

      {/* timeline SVG */}
      {events && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: CY, opacity: 0.7, fontSize: 10 }}>
              TIMELINE — {events.length} event{events.length !== 1 ? "s" : ""} · threshold {thresholdUsed != null ? fmtVal(thresholdUsed) : "auto"} · {direction.toUpperCase()}
            </span>
            <span style={{ color: GN, fontSize: 10 }}>click marker → inspector</span>
          </div>
          {renderTimeline()}
        </div>
      )}

      {/* event inspector */}
      {selEvent && (
        <div style={{ background: "rgba(41,231,255,0.06)", border: `1px solid ${BORD}`, borderRadius: 4, padding: 10, marginBottom: 10, fontSize: 10 }}>
          <div style={{ color: AM, fontWeight: 700, marginBottom: 6 }}>◈ EVENT INSPECTOR</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
            <span style={{ opacity: 0.6 }}>Timestamp</span>
            <span>{fmtTs(selEvent.t || selEvent.timestamp || selEvent.time)}</span>
            <span style={{ opacity: 0.6 }}>Value at crossing</span>
            <span style={{ color: AM }}>{fmtVal(selEvent.value ?? selEvent.v)}</span>
            <span style={{ opacity: 0.6 }}>Threshold</span>
            <span>{fmtVal(thresholdUsed)}</span>
            <span style={{ opacity: 0.6 }}>Delta</span>
            <span style={{ color: (parseFloat(selEvent.value ?? 0) - (thresholdUsed ?? 0)) >= 0 ? GN : RD }}>
              {fmtVal(parseFloat(selEvent.value ?? 0) - (thresholdUsed ?? 0))}
            </span>
            <span style={{ opacity: 0.6 }}>Direction</span>
            <span style={{ color: (selEvent.direction || selEvent.kind || "").includes("down") ? RD : CY }}>
              {selEvent.direction || selEvent.kind || "—"}
            </span>
            {(selEvent.duration_above != null || selEvent.duration != null) && <>
              <span style={{ opacity: 0.6 }}>Duration above/below</span>
              <span>{fmtVal(selEvent.duration_above ?? selEvent.duration ?? null)}s</span>
            </>}
          </div>
        </div>
      )}

      {/* histogram */}
      {events && events.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {renderHistogram()}
        </div>
      )}

      {/* events list */}
      {events && events.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: CY, opacity: 0.7, fontSize: 10, marginBottom: 4 }}>ALL EVENTS (newest first)</div>
          <div style={{ maxHeight: 120, overflowY: "auto", border: `1px solid ${BORD}`, borderRadius: 3, padding: 4 }}>
            {[...events].reverse().map((ev, i) => {
              const realIdx = events.length - 1 - i;
              const col = (ev.direction || ev.kind || "").includes("down") ? RD : CY;
              return (
                <div
                  key={i}
                  onClick={() => setSelected(selected === realIdx ? null : realIdx)}
                  style={{ display: "flex", justifyContent: "space-between", padding: "2px 4px", borderRadius: 2, cursor: "pointer", background: selected === realIdx ? "rgba(41,231,255,0.1)" : "transparent", marginBottom: 1 }}
                >
                  <span style={{ color: col, opacity: 0.8, fontSize: 9 }}>
                    {fmtTs(ev.t || ev.timestamp || ev.time)} · {fmtVal(ev.value ?? ev.v)}
                  </span>
                  <span style={{ color: col, fontSize: 9 }}>{ev.direction || ev.kind || ""}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {events && events.length === 0 && (
        <div style={{ color: AM, fontSize: 10, marginBottom: 8 }}>No threshold-crossing events found for these parameters.</div>
      )}

      {/* ASSESS */}
      {events && events.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{ background: assessing ? "rgba(176,110,255,0.15)" : PURP, color: "#0A121C", border: "none", borderRadius: 3, padding: "4px 14px", fontFamily: "inherit", fontWeight: 700, fontSize: 10, cursor: assessing ? "wait" : "pointer" }}
          >
            {assessing ? "ASSESSING…" : "ASSESS"}
          </button>
          {assessText && (
            <div style={{ marginTop: 8, background: "rgba(176,110,255,0.08)", border: `1px solid rgba(176,110,255,0.3)`, borderRadius: 4, padding: 8, color: PURP, fontSize: 10, lineHeight: 1.5, maxHeight: 100, overflowY: "auto" }}>
              {assessText}
            </div>
          )}
        </div>
      )}

      <div style={{ color: CY, opacity: 0.3, fontSize: 9, marginTop: 4 }}>
        /v1/history/series · /v1/temporal/events?series_id=&threshold=&direction= · click marker → inspector · histogram = events/day
      </div>
    </div>
  );
}
