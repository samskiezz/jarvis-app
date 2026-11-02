/**
 * CrossSeriesTimelineFeed — F286.
 *
 * Multi-select series_ids → POST /v1/temporal/timeline
 * Response: [{t, value, kind, series_id}] newest-first event log.
 *
 * Left gutter: horizontal SVG sparkline per selected series (GET /v1/temporal/series catalog).
 * Event log: series_id badge + event_type (kind) + value + timestamp, newest at top.
 * Filter by series or event type; time-range selector (1h/6h/24h/7d/all).
 * ASSESS → /v1/jarvis/agent/chat + TTS via jarvis:speak-dossier.
 * 90-s auto-refresh.
 *
 * Button: ◈ CSTLFEED (left:207960, zIndex:382). Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const RED   = "#FF3B6B";
const GREEN = "#00c878";
const MUTED = "#445566";

const BTN_LEFT = 207960;
const Z_IDX    = 382;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const RANGE_OPTIONS = [
  { label: "1h",  ms: 3_600_000 },
  { label: "6h",  ms: 21_600_000 },
  { label: "24h", ms: 86_400_000 },
  { label: "7d",  ms: 604_800_000 },
  { label: "all", ms: 0 },
];

const KIND_COLORS = {
  rise: GREEN,
  fall: RED,
  spike: AMBER,
  dip: AMBER,
  default: CY,
};

function kindColor(kind) {
  return KIND_COLORS[kind] || KIND_COLORS.default;
}

function normaliseSeriesList(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.series)) return raw.series;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && typeof raw === "object") return Object.values(raw).flat().filter(Boolean);
  return [];
}

function seriesId(s) {
  return typeof s === "string" ? s : s?.series_id || s?.id || "";
}

// ── intent helpers ──────────────────────────────────────────────────────────

const CSTLFEED_RE =
  /cross.{0,15}series|timeline.{0,15}feed|cstlfeed\b|series.{0,15}timeline/i;

export function isCstlfeedQuery(q) {
  return CSTLFEED_RE.test(q || "");
}

// ── sparkline helper ────────────────────────────────────────────────────────

function Sparkline({ events, color, width = 80, height = 18 }) {
  if (!events || events.length < 2) {
    return (
      <svg width={width} height={height}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2}
          stroke={`${color}33`} strokeWidth={1} />
      </svg>
    );
  }
  const vals = events.map((e) => e.value);
  const min  = Math.min(...vals);
  const max  = Math.max(...vals);
  const range = max - min || 1;
  const pad = 2;
  const pts = events.map((e, i) => {
    const x = pad + (i / (events.length - 1)) * (width - pad * 2);
    const y = height - pad - ((e.value - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />
    </svg>
  );
}

// ── component ────────────────────────────────────────────────────────────────

export default function CrossSeriesTimelineFeed() {
  const [visible, setVisible]         = useState(false);
  const [seriesList, setSeriesList]   = useState([]);
  const [selected, setSelected]       = useState([]);      // selected series ids
  const [events, setEvents]           = useState([]);
  const [loading, setLoading]         = useState(false);
  const [rangeIdx, setRangeIdx]       = useState(4);       // "all" by default
  const [filterSeries, setFilterSeries] = useState("");
  const [filterKind, setFilterKind]   = useState("");
  const [assessing, setAssessing]     = useState(false);
  const timerRef = useRef(null);

  // ── auto-refresh ────────────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      timerRef.current = setInterval(() => fetchTimeline(), 90_000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [visible, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── toggle event ────────────────────────────────────────────────────────
  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:cstlfeed-toggle", onToggle);
    return () => window.removeEventListener("jarvis:cstlfeed-toggle", onToggle);
  }, []);

  // ── load series catalog ──────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    fetch(`${apiBase()}/v1/temporal/series`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
      .then((r) => r.json())
      .then((raw) => {
        const list = normaliseSeriesList(raw);
        setSeriesList(list);
        if (list.length > 0 && selected.length === 0) {
          // auto-select first 3
          setSelected(list.slice(0, 3).map(seriesId).filter(Boolean));
        }
      })
      .catch(() => {});
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTimeline = useCallback(() => {
    setLoading(true);
    fetch(`${apiBase()}/v1/temporal/timeline`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        series_ids: selected.length > 0 ? selected : null,
        limit: 300,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        const raw = Array.isArray(data) ? data : data?.events || [];
        // newest first
        setEvents([...raw].sort((a, b) => (b.t || 0) - (a.t || 0)));
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [selected]);

  useEffect(() => {
    if (visible && selected.length > 0) fetchTimeline();
  }, [visible, selected, fetchTimeline]);

  // ── assess ────────────────────────────────────────────────────────────────
  async function assess() {
    if (!events.length) return;
    setAssessing(true);
    const kinds = [...new Set(events.map((e) => e.kind || "event"))];
    const activeSeries = [...new Set(events.map((e) => e.series_id))];
    const prompt = `As JARVIS, provide a 2-sentence briefing on the cross-series timeline feed. ` +
      `${events.length} events across ${activeSeries.length} series (${activeSeries.slice(0, 4).join(", ")}). ` +
      `Event kinds: ${kinds.join(", ")}. ` +
      `Which series are most active and what does the pattern imply operationally?`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        `Cross-series timeline assessment is unavailable, sir.`;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Timeline assessment is temporarily unavailable, sir." },
      }));
    }
    setAssessing(false);
  }

  // ── derived data ──────────────────────────────────────────────────────────

  const rangeMs = RANGE_OPTIONS[rangeIdx].ms;
  const nowMs = Date.now();

  const filteredEvents = events.filter((e) => {
    if (rangeMs > 0 && e.t) {
      const tMs = e.t * 1000; // assume unix seconds; if already ms, adapt
      // try both: if value is large it's ms, if small it's seconds
      const adjustedMs = e.t > 1e12 ? e.t : e.t * 1000;
      if (nowMs - adjustedMs > rangeMs) return false;
    }
    if (filterSeries && e.series_id !== filterSeries) return false;
    if (filterKind && (e.kind || "event") !== filterKind) return false;
    return true;
  });

  const seriesColors = {};
  const palette = [CY, GREEN, AMBER, RED, "#9B5DE5", "#F15BB5", "#00BBF9", "#FEE440"];
  const knownSeries = [...new Set(events.map((e) => e.series_id))];
  knownSeries.forEach((sid, i) => {
    seriesColors[sid] = palette[i % palette.length];
  });

  // per-series events for sparklines (use all events, not filtered by range)
  const perSeries = {};
  events.forEach((e) => {
    if (!perSeries[e.series_id]) perSeries[e.series_id] = [];
    perSeries[e.series_id].push(e);
  });
  // reverse per-series to ascending for sparkline
  Object.keys(perSeries).forEach((sid) => {
    perSeries[sid] = [...perSeries[sid]].sort((a, b) => (a.t || 0) - (b.t || 0));
  });

  const uniqueKinds = [...new Set(events.map((e) => e.kind || "event"))];

  function toggleSeries(sid) {
    setSelected((prev) =>
      prev.includes(sid) ? prev.filter((s) => s !== sid) : [...prev, sid]
    );
  }

  function fmtTime(t) {
    if (!t) return "—";
    const ms = t > 1e12 ? t : t * 1000;
    const d = new Date(ms);
    return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Cross-Series Timeline Feed (F286)"
        style={{
          position: "fixed", bottom: 6, left: BTN_LEFT, zIndex: Z_IDX,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : CY}44`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ CSTLFEED
        {events.length > 0 && visible && (
          <span style={{
            marginLeft: 4, background: CY, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{filteredEvents.length}</span>
        )}
      </button>

      {visible && (
        <div
          style={{
            position: "fixed", bottom: 32, left: BTN_LEFT - 540, zIndex: Z_IDX,
            width: 720, maxHeight: "82vh", overflowY: "auto",
            background: "rgba(6,11,18,0.95)",
            border: `1px solid ${CY}44`,
            borderRadius: 10, padding: "14px 16px",
            fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
            backdropFilter: "blur(12px)",
            boxShadow: `0 0 60px ${CY}18`,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◈ CROSS-SERIES TIMELINE FEED
            </span>
            <button
              onClick={fetchTimeline}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${CY}33`, borderRadius: 3,
                color: `${CY}88`, padding: "2px 6px", fontSize: 7,
                cursor: "pointer", letterSpacing: 1,
              }}
            >↻ REFRESH</button>
            <button
              onClick={(e) => { e.stopPropagation(); assess(); }}
              disabled={assessing || !events.length}
              style={{
                background: assessing ? "#1a2530" : `${CY}18`,
                color: assessing ? MUTED : CY,
                border: `1px solid ${CY}44`,
                borderRadius: 3, padding: "3px 10px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                letterSpacing: 1, cursor: assessing || !events.length ? "default" : "pointer",
              }}
            >{assessing ? "…" : "▶ ASSESS"}</button>
            <button
              onClick={() => setVisible(false)}
              style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* Time-range selector */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {RANGE_OPTIONS.map((opt, i) => (
              <button
                key={opt.label}
                onClick={() => setRangeIdx(i)}
                style={{
                  background: rangeIdx === i ? `${CY}22` : "transparent",
                  border: `1px solid ${rangeIdx === i ? CY : CY + "33"}`,
                  color: rangeIdx === i ? CY : MUTED,
                  borderRadius: 3, padding: "2px 7px",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                  letterSpacing: 1, cursor: "pointer",
                }}
              >{opt.label}</button>
            ))}
            <select
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value)}
              style={{
                marginLeft: 8,
                background: "rgba(0,150,212,0.08)", border: `1px solid ${CY}33`,
                color: CY, borderRadius: 4, padding: "2px 6px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                cursor: "pointer",
              }}
            >
              <option value="">ALL KINDS</option>
              {uniqueKinds.map((k) => (
                <option key={k} value={k}>{k.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {/* Two-column layout: left gutter (sparklines) + right (event log) */}
          <div style={{ display: "flex", gap: 14 }}>
            {/* Left gutter: series list + sparklines */}
            <div style={{
              width: 160, flexShrink: 0,
              borderRight: `1px solid ${CY}22`, paddingRight: 10,
            }}>
              <div style={{ color: MUTED, fontSize: 7, letterSpacing: 1, marginBottom: 6 }}>
                SERIES ({seriesList.length})
              </div>
              {seriesList.length === 0 && (
                <div style={{ color: MUTED, fontSize: 8 }}>loading…</div>
              )}
              {seriesList.map((s) => {
                const sid  = seriesId(s);
                const col  = seriesColors[sid] || CY;
                const isOn = selected.includes(sid);
                return (
                  <div
                    key={sid}
                    onClick={() => toggleSeries(sid)}
                    style={{
                      display: "flex", flexDirection: "column", gap: 2,
                      marginBottom: 8, cursor: "pointer",
                      opacity: isOn ? 1 : 0.35,
                    }}
                  >
                    <div style={{
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: 2,
                        background: isOn ? col : MUTED, flexShrink: 0,
                      }} />
                      <span
                        style={{
                          color: isOn ? col : MUTED, fontSize: 7, letterSpacing: 0.5,
                          maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        onClick={(e) => { e.stopPropagation(); setFilterSeries(filterSeries === sid ? "" : sid); }}
                        title={sid}
                      >{sid}</span>
                    </div>
                    <Sparkline
                      events={(perSeries[sid] || []).slice(-40)}
                      color={isOn ? col : MUTED}
                      width={140}
                      height={16}
                    />
                  </div>
                );
              })}
              {filterSeries && (
                <button
                  onClick={() => setFilterSeries("")}
                  style={{
                    marginTop: 4, background: "transparent",
                    border: `1px solid ${AMBER}44`, borderRadius: 3,
                    color: AMBER, padding: "2px 6px",
                    fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                    cursor: "pointer",
                  }}
                >✕ CLEAR FILTER</button>
              )}
            </div>

            {/* Right: event log */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6, marginBottom: 6,
              }}>
                <span style={{ color: MUTED, fontSize: 7, letterSpacing: 1 }}>
                  EVENTS
                </span>
                <span style={{
                  background: `${CY}18`, color: CY, borderRadius: 3,
                  padding: "0 5px", fontSize: 7,
                }}>{filteredEvents.length}</span>
                {filterSeries && (
                  <span style={{
                    background: `${AMBER}18`, color: AMBER, borderRadius: 3,
                    padding: "0 5px", fontSize: 7,
                  }}>series: {filterSeries}</span>
                )}
              </div>

              {loading ? (
                <div style={{ color: MUTED, fontSize: 10, textAlign: "center", padding: "20px 0" }}>
                  loading timeline…
                </div>
              ) : filteredEvents.length === 0 ? (
                <div style={{ color: MUTED, fontSize: 10, textAlign: "center", padding: "20px 0" }}>
                  {selected.length === 0
                    ? "Select series on the left to load events."
                    : "No events in this range."}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: "62vh", overflowY: "auto" }}>
                  {filteredEvents.map((ev, i) => {
                    const col = seriesColors[ev.series_id] || CY;
                    const kc  = kindColor(ev.kind || "event");
                    return (
                      <div
                        key={i}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "100px 64px 70px 1fr",
                          gap: 6, alignItems: "center",
                          padding: "4px 6px",
                          background: "rgba(0,0,0,0.18)",
                          border: `1px solid ${col}18`,
                          borderRadius: 4,
                        }}
                      >
                        {/* series badge */}
                        <span
                          style={{
                            color: col, fontSize: 7, letterSpacing: 0.5,
                            background: `${col}18`, borderRadius: 3, padding: "1px 4px",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                          title={ev.series_id}
                        >{ev.series_id}</span>
                        {/* kind badge */}
                        <span
                          style={{
                            color: kc, fontSize: 7, letterSpacing: 0.5,
                            background: `${kc}18`, borderRadius: 3, padding: "1px 4px",
                            textAlign: "center",
                          }}
                        >{(ev.kind || "event").toUpperCase()}</span>
                        {/* value */}
                        <span style={{ color: "#DCEBF5", fontSize: 8 }}>
                          {ev.value != null ? Number(ev.value).toFixed(3) : "—"}
                        </span>
                        {/* timestamp */}
                        <span style={{ color: MUTED, fontSize: 7, textAlign: "right" }}>
                          {fmtTime(ev.t)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
