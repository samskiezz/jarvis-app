/**
 * F739 — Ops Alerts × Ops Events × Knowledge Triple Nexus (OALOEKVTRI)
 * Endpoints: /v1/ops/alerts  ×  /v1/ops/events  ×  /knowledge/articles?limit=200
 * Classification: FULLY_CONTEXTUALIZED | EVENTS_ONLY | KB_ONLY | DARK
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY = "#29E7FF";
const AM = "#FFB347";
const GN = "#39FF14";
const RD = "#FF4444";
const PR = "#B47FFF";
const DIM = "#8899AA";

const BTN_LEFT  = 908120;
const POLL_MS   = 90_000;

const OALOEKVTRI_RE =
  /\b(oaloekvtri|ops\s*alert\s*context|alert\s*contextuali[sz]ed|ops\s*event\s*alert\s*knowledge|dark\s*alerts?|alert\s*intelligence\s*gap|ops\s*event\s*knowledge\s*nexus|alert\s*triple\s*nexus)\b/i;

export function isOaloekvtriQuery(t) {
  return OALOEKVTRI_RE.test(t || "");
}

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

function normaliseAlerts(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.alerts)) return raw.alerts;
  if (raw && Array.isArray(raw.data))   return raw.data;
  if (raw && Array.isArray(raw.items))  return raw.items;
  return [];
}

function normaliseEvents(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.events)) return raw.events;
  if (raw && Array.isArray(raw.data))   return raw.data;
  if (raw && Array.isArray(raw.items))  return raw.items;
  return [];
}

function normaliseKb(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.articles)) return raw.articles;
  if (raw && Array.isArray(raw.data))     return raw.data;
  if (raw && Array.isArray(raw.items))    return raw.items;
  return [];
}

function keywords(obj) {
  return [
    obj.title, obj.name, obj.message, obj.description,
    obj.type, obj.category, obj.tags, obj.summary,
    obj.severity, obj.source, obj.event_type, obj.topic,
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreMatch(aKw, bKw) {
  if (!aKw || !bKw) return 0;
  return aKw.split(/\s+/).filter(w => w.length > 3 && bKw.includes(w)).length;
}

function buildNexus(alerts, events, kb) {
  return alerts.map(alert => {
    const aKw = keywords(alert);
    const bestEvent = events.reduce(
      (best, e) => {
        const s = scoreMatch(aKw, keywords(e));
        return s > best.score ? { score: s, e } : best;
      },
      { score: 0, e: null },
    );
    const bestKb = kb.reduce(
      (best, k) => {
        const s = scoreMatch(aKw, keywords(k));
        return s > best.score ? { score: s, k } : best;
      },
      { score: 0, k: null },
    );
    const hasEvent = bestEvent.score > 0;
    const hasKb    = bestKb.score   > 0;
    const status =
      hasEvent && hasKb  ? "FULLY_CONTEXTUALIZED" :
      hasEvent           ? "EVENTS_ONLY"           :
      hasKb              ? "KB_ONLY"               :
                           "DARK";
    return {
      alert,
      matchedEvent : hasEvent ? bestEvent.e : null,
      matchedKb    : hasKb    ? bestKb.k    : null,
      status,
    };
  });
}

async function fetchAll() {
  const base = apiBase();
  const [alertsRes, eventsRes, kbRes] = await Promise.all([
    fetch(`${base}/v1/ops/alerts`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/v1/ops/events`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/knowledge/articles?limit=200`).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);
  return {
    alerts : normaliseAlerts(alertsRes),
    events : normaliseEvents(eventsRes),
    kb     : normaliseKb(kbRes),
  };
}

export async function buildOaloekvtriScript() {
  try {
    const { alerts, events, kb } = await fetchAll();
    const nexus = buildNexus(alerts, events, kb);
    const counts = {
      FULLY_CONTEXTUALIZED : nexus.filter(r => r.status === "FULLY_CONTEXTUALIZED").length,
      EVENTS_ONLY          : nexus.filter(r => r.status === "EVENTS_ONLY").length,
      KB_ONLY              : nexus.filter(r => r.status === "KB_ONLY").length,
      DARK                 : nexus.filter(r => r.status === "DARK").length,
    };
    const darkAlerts = nexus
      .filter(r => r.status === "DARK")
      .slice(0, 3)
      .map(r => r.alert.title || r.alert.name || r.alert.message || "Unnamed alert")
      .join("; ");
    return (
      `Ops Alert Triple Nexus: ${alerts.length} alerts cross-referenced against ` +
      `${events.length} ops events and ${kb.length} knowledge articles. ` +
      `${counts.FULLY_CONTEXTUALIZED} fully contextualized. ` +
      `${counts.EVENTS_ONLY} matched to events only. ` +
      `${counts.KB_ONLY} matched to knowledge only. ` +
      `${counts.DARK} dark — no context found${darkAlerts ? `: ${darkAlerts}` : ""}. ` +
      `Intelligence gap requires attention.`
    );
  } catch {
    return "Ops Alert Triple Nexus data unavailable.";
  }
}

const STATUS_META = {
  FULLY_CONTEXTUALIZED : { label: "FULLY CONTEXTUALIZED", col: GN  },
  EVENTS_ONLY          : { label: "EVENTS ONLY",          col: CY  },
  KB_ONLY              : { label: "KB ONLY",              col: AM  },
  DARK                 : { label: "DARK",                 col: RD  },
};

export default function OpsAlertOpsEventKnowledgeTriple() {
  const [open,   setOpen]   = useState(false);
  const [rows,   setRows]   = useState([]);
  const [counts, setCounts] = useState({ FULLY_CONTEXTUALIZED:0, EVENTS_ONLY:0, KB_ONLY:0, DARK:0 });
  const [loading, setLoading] = useState(false);
  const [err,    setErr]    = useState(null);
  const [filter, setFilter] = useState("ALL");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { alerts, events, kb } = await fetchAll();
      const nexus = buildNexus(alerts, events, kb);
      setRows(nexus);
      setCounts({
        FULLY_CONTEXTUALIZED : nexus.filter(r => r.status === "FULLY_CONTEXTUALIZED").length,
        EVENTS_ONLY          : nexus.filter(r => r.status === "EVENTS_ONLY").length,
        KB_ONLY              : nexus.filter(r => r.status === "KB_ONLY").length,
        DARK                 : nexus.filter(r => r.status === "DARK").length,
      });
    } catch (e) {
      setErr(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:oaloekvtri-toggle", toggle);
    return () => window.removeEventListener("jarvis:oaloekvtri-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = filter === "ALL" ? rows : rows.filter(r => r.status === filter);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position  : "fixed",
          bottom    : 8,
          left      : BTN_LEFT,
          zIndex    : 598,
          background: open ? "rgba(180,127,255,0.18)" : "rgba(20,24,32,0.82)",
          border    : `1px solid ${open ? PR : DIM}`,
          color     : open ? PR : DIM,
          borderRadius: 6,
          padding   : "3px 10px",
          fontSize  : 11,
          cursor    : "pointer",
          fontFamily: "monospace",
          letterSpacing: "0.05em",
          whiteSpace: "nowrap",
        }}
        title="Ops Alert × Ops Event × Knowledge Triple Nexus (F739)"
      >
        OALOEKVTRI
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position      : "fixed",
            bottom        : 36,
            left          : BTN_LEFT,
            width         : 780,
            maxHeight     : 520,
            zIndex        : 598,
            background    : "rgba(10,13,20,0.97)",
            border        : `1px solid ${PR}`,
            borderRadius  : 10,
            boxShadow     : `0 0 32px ${PR}55`,
            display       : "flex",
            flexDirection : "column",
            overflow      : "hidden",
            fontFamily    : "monospace",
          }}
        >
          {/* Header */}
          <div style={{
            padding    : "8px 14px 6px",
            borderBottom: `1px solid ${PR}44`,
            display    : "flex",
            alignItems : "center",
            gap        : 10,
            flexShrink : 0,
          }}>
            <span style={{ color: PR, fontWeight: 700, fontSize: 12, letterSpacing: "0.1em" }}>
              OPS ALERT × OPS EVENT × KNOWLEDGE — TRIPLE NEXUS
            </span>
            <span style={{ color: DIM, fontSize: 10, marginLeft: "auto" }}>F739</span>
            {loading && <span style={{ color: AM, fontSize: 10 }}>LOADING…</span>}
            <button
              onClick={() => setOpen(false)}
              style={{ background:"none", border:"none", color: DIM, cursor:"pointer", fontSize:14 }}
            >✕</button>
          </div>

          {/* Stat bar */}
          <div style={{
            display        : "flex",
            gap            : 8,
            padding        : "5px 14px",
            borderBottom   : `1px solid ${PR}22`,
            flexShrink     : 0,
            flexWrap       : "wrap",
          }}>
            {Object.entries(STATUS_META).map(([k, m]) => (
              <button
                key={k}
                onClick={() => setFilter(f => f === k ? "ALL" : k)}
                style={{
                  background  : filter === k ? `${m.col}22` : "transparent",
                  border      : `1px solid ${filter === k ? m.col : DIM + "66"}`,
                  color       : filter === k ? m.col : DIM,
                  borderRadius: 4,
                  padding     : "2px 8px",
                  fontSize    : 10,
                  cursor      : "pointer",
                  fontFamily  : "monospace",
                }}
              >
                {m.label} ({counts[k]})
              </button>
            ))}
            <button
              onClick={() => setFilter("ALL")}
              style={{
                background  : filter === "ALL" ? `${PR}22` : "transparent",
                border      : `1px solid ${filter === "ALL" ? PR : DIM+"66"}`,
                color       : filter === "ALL" ? PR : DIM,
                borderRadius: 4,
                padding     : "2px 8px",
                fontSize    : 10,
                cursor      : "pointer",
                fontFamily  : "monospace",
              }}
            >
              ALL ({rows.length})
            </button>
            <button
              onClick={load}
              style={{
                marginLeft  : "auto",
                background  : "transparent",
                border      : `1px solid ${DIM}66`,
                color       : DIM,
                borderRadius: 4,
                padding     : "2px 8px",
                fontSize    : 10,
                cursor      : "pointer",
              }}
            >↺</button>
          </div>

          {/* Error */}
          {err && (
            <div style={{ padding:"6px 14px", color: RD, fontSize:11 }}>
              ERROR: {err}
            </div>
          )}

          {/* Rows */}
          <div style={{ overflowY:"auto", flex:1, padding:"4px 0" }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize:11, padding:"12px 14px" }}>
                No alerts{filter !== "ALL" ? ` in ${filter}` : ""}.
              </div>
            )}
            {visible.map((row, i) => {
              const a = row.alert;
              const meta = STATUS_META[row.status];
              const title = a.title || a.name || a.message || `Alert #${i + 1}`;
              const sev   = a.severity || a.priority || "";
              const src   = a.source || a.origin || "";
              const evtLabel = row.matchedEvent
                ? (row.matchedEvent.title || row.matchedEvent.name || row.matchedEvent.event_type || "Event")
                : null;
              const kbLabel = row.matchedKb
                ? (row.matchedKb.title || row.matchedKb.name || row.matchedKb.topic || "Article")
                : null;
              return (
                <div
                  key={i}
                  style={{
                    padding     : "6px 14px",
                    borderBottom: `1px solid ${PR}11`,
                    display     : "flex",
                    gap         : 10,
                    alignItems  : "flex-start",
                  }}
                >
                  <span style={{
                    minWidth    : 170,
                    fontSize    : 9,
                    color       : meta.col,
                    fontWeight  : 700,
                    letterSpacing:"0.06em",
                    paddingTop  : 1,
                  }}>
                    {meta.label}
                  </span>
                  <div style={{ flex:1 }}>
                    <div style={{ color:"#E8EEF6", fontSize:11, fontWeight:600 }}>
                      {title}
                      {sev && (
                        <span style={{ color: DIM, fontWeight:400, marginLeft:6, fontSize:10 }}>
                          [{sev}]
                        </span>
                      )}
                    </div>
                    {src && (
                      <div style={{ color: DIM, fontSize:10 }}>src: {src}</div>
                    )}
                    <div style={{ display:"flex", gap:6, marginTop:2, flexWrap:"wrap" }}>
                      {evtLabel && (
                        <span style={{ color: CY, fontSize:9, background:`${CY}12`, borderRadius:3, padding:"1px 5px" }}>
                          EVENT: {evtLabel}
                        </span>
                      )}
                      {kbLabel && (
                        <span style={{ color: AM, fontSize:9, background:`${AM}12`, borderRadius:3, padding:"1px 5px" }}>
                          KB: {kbLabel}
                        </span>
                      )}
                      {!evtLabel && !kbLabel && (
                        <span style={{ color: RD, fontSize:9, background:`${RD}12`, borderRadius:3, padding:"1px 5px" }}>
                          NO CONTEXT
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding    : "4px 14px",
            borderTop  : `1px solid ${PR}22`,
            color      : DIM,
            fontSize   : 9,
            flexShrink : 0,
          }}>
            /v1/ops/alerts × /v1/ops/events × /knowledge/articles | poll {POLL_MS / 1000}s
          </div>
        </div>
      )}
    </>
  );
}
