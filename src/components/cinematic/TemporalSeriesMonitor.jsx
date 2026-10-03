/**
 * TemporalSeriesMonitor — F256.
 *
 * Data sources (real — backed by server/routes/temporal.py):
 *   POST /v1/temporal/timeline  { limit: 50 }
 *       → { count, events: [{series_id, t, v, direction, threshold}] }
 *   GET  /v1/temporal/patterns?series_id=X
 *       → { series_id, anomalies:[{t,v,z_score}], volatility_windows:[{t0,t1,std}] }
 *
 * Displays:
 *   - Stat tiles: total events / unique series / max z-score / spike count
 *   - ALL/SPIKE/CROSSING filter tabs + series_id text search
 *   - Per-event row: series_id chip + value + direction badge + age
 *   - Expand event row → lazy GET /v1/temporal/patterns for z-score anomaly list
 *     + volatility windows with std bars
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence temporal brief + TTS
 *
 * Toggle: ◷ TMPRL at left:192240, bottom:8, zIndex:135.
 * Badge: amber = event count.
 * 90 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isTemporalSeriesQuery(q) / buildTemporalSeriesScript()
 *
 * Voice triggers: "temporal series / series monitor / timeline events / z score /
 *   threshold crossing / time series / tmprl / series anomaly / temporal timeline /
 *   series spikes / temporal events / which series / series threshold"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const RED = "#F87171";
const DIM = "#3A4A55";
const PUR = "#A78BFA";

const BTN_LEFT   = 192240;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const TMPRL_RE =
  /\b(temporal series|series monitor|timeline events?|z[- ]?score|threshold crossing|time series|tmprl|series anomal|temporal timeline|series spikes?|temporal events?|which series|series threshold)\b/i;

export function isTemporalSeriesQuery(t) {
  return TMPRL_RE.test(t || "");
}

export async function buildTemporalSeriesScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/temporal/timeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ limit: 50 }),
    });
    const d = await r.json();
    const events = Array.isArray(d.events) ? d.events : [];
    if (events.length === 0) {
      return "No temporal threshold events detected. The History Lake has no series crossings in the current window.";
    }
    const seriesSet = new Set(events.map((e) => e.series_id).filter(Boolean));
    const spikes = events.filter((e) => (e.z_score || 0) > 2).length;
    const newest = events[0];
    return (
      `The temporal timeline holds ${events.length} event${events.length !== 1 ? "s" : ""} ` +
      `across ${seriesSet.size} series; ${spikes} z-score spike${spikes !== 1 ? "s" : ""} detected. ` +
      `Most recent event on series "${newest?.series_id || "—"}" ` +
      `(value ${newest?.v ?? "—"}, direction ${newest?.direction || "—"}).`
    );
  } catch {
    return "Unable to reach the temporal timeline endpoint at this time.";
  }
}

// ─── fetch helpers ──────────────────────────────────────────────────────────

async function fetchTimeline(limit = 50) {
  const r = await fetch(`${apiBase()}/v1/temporal/timeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ limit }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return Array.isArray(d.events) ? d.events : [];
}

async function fetchPatterns(seriesId) {
  const r = await fetch(
    `${apiBase()}/v1/temporal/patterns?series_id=${encodeURIComponent(seriesId)}`,
    { headers: { Authorization: `Bearer ${API_KEY}` } },
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function agentAssess(eventCount, seriesCount) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        `Assess the temporal series monitor in 2 sentences: ` +
        `${eventCount} threshold event${eventCount !== 1 ? "s" : ""} detected ` +
        `across ${seriesCount} series. Identify the most operationally relevant pattern.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No assessment available.";
}

// ─── sub-components ─────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 55, background: `${color}0d`,
      border: `1px solid ${color}33`, borderRadius: 8,
      padding: "8px 8px", display: "flex", flexDirection: "column", gap: 3,
    }}>
      <span style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: 1 }}>{value}</span>
    </div>
  );
}

function timeAgo(tsMs) {
  if (!tsMs) return "—";
  const diff = (Date.now() - tsMs) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  return `${Math.round(diff / 86400)}d`;
}

function Chip({ label, color }) {
  return (
    <span style={{
      fontSize: 7, padding: "1px 5px", borderRadius: 3,
      border: `1px solid ${color}55`, color, flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

function PatternDetail({ patterns }) {
  if (!patterns) return null;
  const anomalies = patterns.anomalies || [];
  const vols = patterns.volatility_windows || [];
  const maxStd = vols.reduce((m, w) => Math.max(m, w.std || 0), 0) || 1;
  return (
    <div style={{
      padding: "7px 14px", background: `${CY}06`,
      borderBottom: `1px solid ${CY}11`, fontSize: 7, lineHeight: 1.6,
    }}>
      {anomalies.length > 0 && (
        <>
          <div style={{ color: DIM, marginBottom: 4, letterSpacing: 1 }}>
            Z-SCORE ANOMALIES ({anomalies.length})
          </div>
          {anomalies.slice(0, 5).map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
              <span style={{ color: "#C8D8E0", minWidth: 60 }}>
                {timeAgo(a.t)}
              </span>
              <span style={{ color: CY, minWidth: 40 }}>
                v={typeof a.v === "number" ? a.v.toFixed(2) : "—"}
              </span>
              <span style={{
                color: Math.abs(a.z_score || 0) > 3 ? RED : AM,
                fontWeight: 700,
              }}>
                z={typeof a.z_score === "number" ? a.z_score.toFixed(2) : "—"}
              </span>
            </div>
          ))}
          {anomalies.length > 5 && (
            <div style={{ color: DIM, marginTop: 2 }}>+{anomalies.length - 5} more</div>
          )}
        </>
      )}
      {vols.length > 0 && (
        <>
          <div style={{ color: DIM, margin: "6px 0 4px", letterSpacing: 1 }}>
            VOLATILITY WINDOWS ({vols.length})
          </div>
          {vols.slice(0, 4).map((w, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
              <span style={{ color: "#C8D8E0", minWidth: 60 }}>
                {timeAgo(w.t0)}
              </span>
              <div style={{
                flex: 1, height: 5, background: `${CY}15`, borderRadius: 3, overflow: "hidden",
              }}>
                <div style={{
                  width: `${Math.min(100, ((w.std || 0) / maxStd) * 100)}%`,
                  height: "100%", background: CY, borderRadius: 3,
                }} />
              </div>
              <span style={{ color: AM, minWidth: 36 }}>
                σ={typeof w.std === "number" ? w.std.toFixed(3) : "—"}
              </span>
            </div>
          ))}
        </>
      )}
      {anomalies.length === 0 && vols.length === 0 && (
        <div style={{ color: DIM }}>No anomalies or volatility data for this series.</div>
      )}
    </div>
  );
}

function EventRow({ event, expanded, patterns, loadingPatterns, onExpand }) {
  const dir = event.direction || "";
  const dirColor = dir === "up" ? GN : dir === "down" ? RED : AM;
  const dirSymbol = dir === "up" ? "▲" : dir === "down" ? "▼" : "◆";
  const seriesId = event.series_id || "—";
  const ts = event.t || 0;
  const val = typeof event.v === "number" ? event.v.toFixed(3) : "—";
  return (
    <>
      <div
        onClick={() => onExpand(seriesId)}
        style={{
          padding: "7px 12px", borderBottom: `1px solid ${CY}11`,
          display: "flex", alignItems: "center", gap: 8,
          cursor: "pointer",
          background: expanded ? `${CY}07` : "transparent",
        }}
      >
        <span style={{
          fontSize: 7, padding: "1px 5px", borderRadius: 3,
          border: `1px solid ${CY}44`, color: CY, flexShrink: 0,
          maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontFamily: "monospace",
        }}>
          {seriesId.slice(0, 16)}
        </span>
        <span style={{ flex: 1, fontSize: 8, color: "#C8D8E0", fontFamily: "monospace" }}>
          {val}
        </span>
        <span style={{ fontSize: 8, color: dirColor, flexShrink: 0 }}>
          {dirSymbol} {dir || "—"}
        </span>
        <span style={{ fontSize: 7, color: DIM, flexShrink: 0 }}>
          {timeAgo(ts)}
        </span>
        <span style={{ fontSize: 8, color: DIM }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        loadingPatterns
          ? <div style={{ padding: "6px 14px", fontSize: 7, color: DIM }}>Loading patterns…</div>
          : patterns !== undefined
            ? <PatternDetail patterns={patterns} />
            : <div style={{ padding: "6px 14px", fontSize: 7, color: RED }}>Failed to load.</div>
      )}
    </>
  );
}

// ─── main component ─────────────────────────────────────────────────────────

export default function TemporalSeriesMonitor() {
  const [open,          setOpen]          = useState(false);
  const [events,        setEvents]        = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [tab,           setTab]           = useState("ALL");
  const [search,        setSearch]        = useState("");
  const [expandedId,    setExpandedId]    = useState(null);
  const [patternsMap,   setPatternsMap]   = useState({});
  const [loadingPats,   setLoadingPats]   = useState({});
  const [assessing,     setAssessing]     = useState(false);
  const [dossier,       setDossier]       = useState(null);

  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchTimeline(50);
      setEvents(list);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (TMPRL_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:tmprl-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:tmprl-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleExpand(seriesId) {
    if (expandedId === seriesId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(seriesId);
    if (patternsMap[seriesId] !== undefined) return;
    setLoadingPats((p) => ({ ...p, [seriesId]: true }));
    try {
      const d = await fetchPatterns(seriesId);
      setPatternsMap((p) => ({ ...p, [seriesId]: d }));
    } catch {
      setPatternsMap((p) => ({ ...p, [seriesId]: null }));
    }
    setLoadingPats((p) => ({ ...p, [seriesId]: false }));
  }

  async function handleAssess() {
    if (assessing) return;
    setAssessing(true);
    setDossier(null);
    try {
      const seriesSet = new Set(events.map((e) => e.series_id).filter(Boolean));
      const text = await agentAssess(events.length, seriesSet.size);
      setDossier(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  // derived stats
  const seriesSet = new Set(events.map((e) => e.series_id).filter(Boolean));
  const spikes    = events.filter((e) => (e.z_score || 0) > 2);
  const maxZ      = spikes.reduce((m, e) => Math.max(m, Math.abs(e.z_score || 0)), 0);

  const filtered = events
    .filter((e) => {
      if (tab === "SPIKE")    return (e.z_score || 0) > 2;
      if (tab === "CROSSING") return e.direction === "up" || e.direction === "down";
      return true;
    })
    .filter((e) => {
      if (!search) return true;
      return (e.series_id || "").toLowerCase().includes(search.toLowerCase());
    });

  const badgeCount = events.length;
  const TABS = ["ALL", "SPIKE", "CROSSING"];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 135,
          background: "#091520", border: `1px solid ${CY}44`, borderRadius: 6,
          color: CY, fontSize: 7, padding: "3px 7px", cursor: "pointer",
          letterSpacing: 1, display: "flex", alignItems: "center", gap: 4,
          whiteSpace: "nowrap",
        }}
      >
        ◷ TMPRL
        {badgeCount > 0 && (
          <span style={{
            background: AM, color: "#000", borderRadius: "50%",
            fontSize: 6, width: 12, height: 12, display: "flex",
            alignItems: "center", justifyContent: "center", fontWeight: 700,
          }}>
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 280, bottom: 32, zIndex: 135,
      width: 340, maxHeight: 540,
      background: "rgba(6,16,24,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      fontFamily: "monospace", boxShadow: `0 0 18px ${CY}22`,
    }}>
      {/* header */}
      <div style={{
        padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 8, color: CY, letterSpacing: 2, fontWeight: 700, flex: 1 }}>
          ◷ TEMPORAL SERIES MONITOR
        </span>
        {loading && <span style={{ fontSize: 8, color: DIM }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM,
          fontSize: 10, cursor: "pointer", lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="EVENTS"  value={events.length}       color={events.length > 0 ? AM : DIM} />
        <Tile label="SERIES"  value={seriesSet.size}      color={CY} />
        <Tile label="SPIKES"  value={spikes.length}       color={spikes.length > 0 ? RED : GN} />
        <Tile label="MAX Z"   value={maxZ > 0 ? maxZ.toFixed(1) : "—"} color={maxZ > 3 ? RED : maxZ > 2 ? AM : DIM} />
      </div>

      {/* tabs + search */}
      <div style={{ padding: "0 12px 6px", display: "flex", gap: 4, alignItems: "center" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: 7, padding: "2px 6px", borderRadius: 4, cursor: "pointer",
              border: `1px solid ${tab === t ? CY : CY + "33"}`,
              color: tab === t ? CY : DIM,
              background: tab === t ? `${CY}14` : "transparent",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search series…"
          style={{
            flex: 1, fontSize: 7, padding: "2px 6px", borderRadius: 4,
            background: "#0a1a24", border: `1px solid ${CY}22`, color: "#C8D8E0",
            outline: "none",
          }}
        />
      </div>

      {/* assess */}
      <div style={{ padding: "0 12px 6px" }}>
        <button
          onClick={handleAssess}
          disabled={assessing}
          style={{
            width: "100%", fontSize: 8, padding: "4px 0", borderRadius: 5, cursor: "pointer",
            border: `1px solid ${CY}55`, color: CY, background: `${CY}0d`,
            opacity: assessing ? 0.6 : 1,
          }}
        >
          {assessing ? "▶ Assessing…" : "▶ ASSESS"}
        </button>
        {dossier && (
          <div style={{
            marginTop: 5, fontSize: 8, color: AM, lineHeight: 1.4,
            padding: "5px 7px", background: `${AM}0a`, borderRadius: 5,
          }}>
            {dossier}
          </div>
        )}
      </div>

      {/* event list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 8, color: DIM, padding: "12px 16px", textAlign: "center" }}>
            {loading ? "Loading…" : "No temporal events found."}
          </div>
        ) : (
          filtered.map((event, idx) => {
            const key = `${event.series_id || "?"}-${event.t || idx}`;
            return (
              <EventRow
                key={key}
                event={event}
                expanded={expandedId === event.series_id}
                patterns={patternsMap[event.series_id]}
                loadingPatterns={!!loadingPats[event.series_id]}
                onExpand={handleExpand}
              />
            );
          })
        )}
      </div>

      {/* footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${CY}11`,
        fontSize: 7, color: DIM, display: "flex", justifyContent: "space-between",
      }}>
        <span>{filtered.length} shown</span>
        <span>90 s poll · /v1/temporal</span>
      </div>
    </div>
  );
}
