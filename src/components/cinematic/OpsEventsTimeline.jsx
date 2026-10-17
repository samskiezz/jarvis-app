/**
 * OpsEventsTimeline — F296
 * Chronological timeline feed of real operational events from /v1/ops/events.
 *
 * Each entry shows: relative timestamp, severity pill, type badge, title + summary.
 * Severity colour: CRITICAL=red, HIGH=amber, MEDIUM=cyan, LOW=green, INFO=dim.
 * Filter chips to narrow by event type.
 * Auto-refreshes every 45 s.
 *
 * Toggle:  ⊙ OPS-EVT button (fixed bottom-left region).
 * Voice:   "JARVIS, ops events" / "JARVIS, operations log" / "JARVIS, event log".
 * Event:   jarvis:ops-events-toggle
 * Additive — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFB830";
const RED = "#FF3B3B";
const PRP = "#A78BFA";
const DIM = "#4A5568";

const POLL_MS = 45_000;
const MAX_DISPLAY = 50;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const OPS_EVT_RE =
  /\bops.event(s)?\b|\boperations.log\b|\bevent.log\b|\bops.log\b|\bops.feed\b|\boperational.event(s)?\b|\bops.timeline\b/i;

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseEvents(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.events)           ? raw.events
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr.map((e, i) => ({
    id:          e.id            || String(i),
    title:       e.title         || e.name          || e.event_type  || `Event ${i + 1}`,
    summary:     e.summary       || e.description   || e.message     || e.details || "",
    severity:    (e.severity     || e.level         || "INFO").toUpperCase(),
    type:        e.type          || e.category      || e.event_type  || e.kind    || "—",
    ts:          e.timestamp     || e.created_at    || e.ts          || "",
  }));
}

function sevColor(sev) {
  if (sev === "CRITICAL") return RED;
  if (sev === "HIGH")     return AMB;
  if (sev === "MEDIUM")   return CY;
  if (sev === "LOW")      return GRN;
  return DIM;
}

function relTime(tsStr) {
  if (!tsStr) return "—";
  const d = new Date(tsStr);
  if (isNaN(d.getTime())) return tsStr.slice(0, 16).replace("T", " ");
  const diffS = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffS < 0)       return "just now";
  if (diffS < 60)      return `${diffS}s ago`;
  if (diffS < 3600)    return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86400)   return `${Math.floor(diffS / 3600)}h ago`;
  return `${Math.floor(diffS / 86400)}d ago`;
}

async function fetchEvents() {
  const base = apiBase();
  const r = await fetch(`${base}/v1/ops/events`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return normaliseEvents(await r.json());
}

// ── exported voice intents ────────────────────────────────────────────────────

export function isOpsEventsQuery(text) {
  return OPS_EVT_RE.test(text || "");
}

export async function buildOpsEventsScript() {
  try {
    const events = await fetchEvents();
    if (!events.length)
      return "No operational events found at this time, sir.";

    const criticals = events.filter(e => e.severity === "CRITICAL").length;
    const highs     = events.filter(e => e.severity === "HIGH").length;
    const recents   = events.slice(0, 3);

    let script = `Ops Events Timeline, sir. ${events.length} events logged.`;
    if (criticals > 0) script += ` ${criticals} critical.`;
    if (highs > 0)     script += ` ${highs} high-severity.`;
    script += ` Most recent: `;
    script += recents.map(e => `${e.title} (${e.severity})`).join("; ");
    script += ".";
    return script;
  } catch {
    return "Operational events data unavailable at this time, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function OpsEventsTimeline() {
  const [open,     setOpen]     = useState(false);
  const [events,   setEvents]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [filter,   setFilter]   = useState("ALL");
  const [search,   setSearch]   = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEvents();
      setEvents(data);
    } catch (err) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const fn = () => setOpen(v => !v);
    window.addEventListener("jarvis:ops-events-toggle", fn);
    return () => window.removeEventListener("jarvis:ops-events-toggle", fn);
  }, []);

  // Derive available type filters
  const types = ["ALL", ...Array.from(new Set(events.map(e => e.type).filter(Boolean))).sort()];

  const critCount = events.filter(e => e.severity === "CRITICAL").length;

  const visible = events
    .filter(e => filter === "ALL" || e.type === filter)
    .filter(e => !search || `${e.title} ${e.summary} ${e.type}`.toLowerCase().includes(search.toLowerCase()))
    .slice(0, MAX_DISPLAY);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ops Events Timeline"
        style={{
          position: "fixed",
          left: 56200,
          bottom: 8,
          zIndex: 109,
          background: critCount > 0 ? `${RED}22` : "#0a0a0f",
          border: `1px solid ${critCount > 0 ? RED : DIM}`,
          borderRadius: 4,
          color: critCount > 0 ? RED : PRP,
          fontFamily: "monospace",
          fontSize: 10,
          padding: "3px 7px",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ⊙ OPS-EVT{critCount > 0 ? ` ⚠${critCount}` : ""}
        {loading && <span style={{ marginLeft: 4, opacity: 0.6 }}>…</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed",
      right: 20,
      bottom: 48,
      zIndex: 1090,
      width: 500,
      maxHeight: 560,
      background: "#0a0a0fee",
      border: `1px solid ${PRP}44`,
      borderRadius: 8,
      fontFamily: "monospace",
      color: "#DCEBF5",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 16px 8px",
        borderBottom: `1px solid ${PRP}22`,
      }}>
        <span style={{ fontSize: 11, letterSpacing: 2, color: PRP }}>⊙ OPS EVENTS TIMELINE</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: DIM, fontSize: 9 }}>
            {events.length} events · refresh {POLL_MS / 1000}s
          </span>
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: "none",
              border: `1px solid ${PRP}55`,
              borderRadius: 3,
              color: PRP,
              fontSize: 9,
              padding: "2px 6px",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
            }}
          >{loading ? "…" : "↻"}</button>
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: DIM, fontSize: 14, cursor: "pointer", lineHeight: 1 }}
          >×</button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: "6px 16px" }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search events…"
          style={{
            width: "100%",
            background: "#ffffff08",
            border: `1px solid ${PRP}33`,
            borderRadius: 4,
            color: "#DCEBF5",
            fontFamily: "monospace",
            fontSize: 10,
            padding: "4px 8px",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Type filter chips */}
      {types.length > 1 && (
        <div style={{
          display: "flex",
          gap: 4,
          padding: "0 16px 8px",
          flexWrap: "wrap",
        }}>
          {types.slice(0, 8).map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              style={{
                background: filter === t ? `${PRP}33` : "transparent",
                border: `1px solid ${filter === t ? PRP : DIM}`,
                borderRadius: 3,
                color: filter === t ? PRP : "#A0AEC0",
                fontSize: 9,
                padding: "2px 6px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >{t}</button>
          ))}
        </div>
      )}

      {/* Event list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 16px 12px" }}>
        {error && (
          <div style={{ color: RED, fontSize: 10, padding: "8px 0" }}>
            Error: {error}
          </div>
        )}
        {!error && !loading && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 10, padding: "12px 0", textAlign: "center" }}>
            No events match the current filter.
          </div>
        )}
        {visible.map((ev, idx) => (
          <div
            key={ev.id}
            style={{
              borderTop: idx === 0 ? "none" : `1px solid #ffffff08`,
              padding: "8px 0",
            }}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
              {/* Severity pill */}
              <span style={{
                background: `${sevColor(ev.severity)}22`,
                border: `1px solid ${sevColor(ev.severity)}55`,
                color: sevColor(ev.severity),
                borderRadius: 3,
                fontSize: 8,
                padding: "1px 5px",
                letterSpacing: 1,
                flexShrink: 0,
              }}>{ev.severity}</span>

              {/* Type badge */}
              {ev.type && ev.type !== "—" && (
                <span style={{
                  background: "#ffffff08",
                  border: `1px solid ${DIM}`,
                  color: "#A0AEC0",
                  borderRadius: 3,
                  fontSize: 8,
                  padding: "1px 5px",
                  maxWidth: 100,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}>{ev.type}</span>
              )}

              {/* Timestamp */}
              <span style={{ color: DIM, fontSize: 9, marginLeft: "auto", flexShrink: 0 }}>
                {relTime(ev.ts)}
              </span>
            </div>

            {/* Title */}
            <div style={{ fontSize: 11, color: "#DCEBF5", fontWeight: 600, marginBottom: 2 }}>
              {ev.title}
            </div>

            {/* Summary */}
            {ev.summary && (
              <div style={{
                fontSize: 10,
                color: "#718096",
                lineHeight: 1.4,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}>
                {ev.summary}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer stats */}
      <div style={{
        padding: "6px 16px",
        borderTop: `1px solid ${PRP}22`,
        display: "flex",
        gap: 12,
        fontSize: 9,
        color: DIM,
      }}>
        {[["CRITICAL", RED], ["HIGH", AMB], ["MEDIUM", CY], ["LOW", GRN]].map(([sev, clr]) => {
          const n = events.filter(e => e.severity === sev).length;
          return n > 0 ? (
            <span key={sev} style={{ color: clr }}>{sev[0]}: {n}</span>
          ) : null;
        })}
        <span style={{ marginLeft: "auto" }}>
          showing {visible.length}/{events.length}
        </span>
      </div>
    </div>
  );
}
