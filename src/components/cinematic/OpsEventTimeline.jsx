/**
 * OpsEventTimeline — F49.
 *
 * Fetches /v1/ops/events every 60 s. Displays events in reverse-chronological
 * order colour-coded by severity (CRITICAL=red, WARNING=amber, INFO=cyan).
 * Filter tabs: ALL / CRITICAL / WARNING / INFO.
 *
 * Click ▶ ASSESS on any event → /v1/jarvis/agent/chat 2-sentence context brief
 * + spoken via jarvis:speak-dossier TTS.
 *
 * Automatically announces any new CRITICAL event that arrives during a poll
 * cycle via jarvis:speak-dossier (one announce per event id, deduplicated).
 *
 * Intent: "ops events" / "ops timeline" / "event log" / "oevt"
 *   → jarvis:oevt-toggle + TTS summary via buildOpsEventTimelineScript()
 *
 * Toggle: ◈ OEVT at left:9900, zIndex 65.
 * 60 s auto-refresh. Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const RED  = "#FF3D5A";
const AMB  = "#F5A623";
const GRN  = "#34D399";
const BTN_LEFT = 9900;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isOpsEventTimelineQuery(q) {
  return /ops.event|event.log|event.timeline|ops.timeline|oevt|operational.event|event.feed/i.test(q || "");
}

export async function buildOpsEventTimelineScript() {
  try {
    const events = await fetchEvents();
    window.dispatchEvent(new CustomEvent("jarvis:oevt-toggle"));
    const criticals = events.filter((e) => severity(e) === "CRITICAL");
    const total = events.length;
    if (!total) {
      return "Ops event timeline is now open, sir. No events found in the current window.";
    }
    return `Ops event timeline open, sir. ${total} event${total !== 1 ? "s" : ""} retrieved — ${criticals.length} critical${criticals.length !== 1 ? "s" : ""}. ${criticals.length > 0 ? `Most recent critical: "${criticals[0].title || criticals[0].type || criticals[0].event_type || "unnamed"}". Recommend immediate review.` : "No critical events at this time."}`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:oevt-toggle"));
    return "Ops event timeline open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function OpsEventTimeline() {
  const [visible, setVisible]     = useState(false);
  const [events, setEvents]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [assessing, setAssessing] = useState(null);
  const [assessments, setAssessments] = useState({});
  const timerRef   = useRef(null);
  const announcedRef = useRef(new Set());

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:oevt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:oevt-toggle", onToggle);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEvents();
      setEvents(data);
      // announce new criticals once
      data.filter((e) => severity(e) === "CRITICAL").forEach((e) => {
        const id = eventId(e);
        if (!announcedRef.current.has(id)) {
          announcedRef.current.add(id);
          const title = e.title || e.type || e.event_type || "CRITICAL event";
          window.dispatchEvent(
            new CustomEvent("jarvis:speak-dossier", {
              detail: { text: `Critical ops event detected, sir: "${title}". Immediate attention recommended.` },
            })
          );
        }
      });
    } catch {
      // leave existing data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, load]);

  const displayed = events.filter((e) => {
    if (tab === "ALL") return true;
    return severity(e) === tab;
  });

  const critCount = events.filter((e) => severity(e) === "CRITICAL").length;
  const warnCount = events.filter((e) => severity(e) === "WARNING").length;
  const infoCount = events.filter((e) => severity(e) === "INFO").length;

  const assess = useCallback(
    async (ev) => {
      const key = eventId(ev);
      if (assessing === key) return;
      setAssessing(key);
      try {
        const title = ev.title || ev.type || ev.event_type || "unknown";
        const sev   = severity(ev);
        const ts    = relTime(ev);
        const prompt =
          `In exactly 2 sentences: What operational significance does a "${sev}" ops event titled "${title}" (${ts}) carry? What immediate action should the operator consider? British-butler tone. No markdown.`;
        const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ message: prompt }),
        });
        const d = await r.json();
        const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
        if (text) {
          setAssessments((prev) => ({ ...prev, [key]: text }));
          window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
        }
      } catch {
        setAssessments((prev) => ({
          ...prev,
          [eventId(ev)]: "Reasoning core unreachable. Please try again.",
        }));
      } finally {
        setAssessing(null);
      }
    },
    [assessing]
  );

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Ops Event Timeline"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 65,
          height: 26,
          padding: "0 8px",
          background: visible ? `${CY}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? CY : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? CY : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {critCount > 0 && !visible && (
          <span
            style={{
              display: "inline-block",
              marginRight: 5,
              background: RED,
              color: "#000",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
            }}
          >
            {critCount}
          </span>
        )}
        ◈ OEVT
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 620),
            zIndex: 65,
            width: 600,
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.97)",
            border: `1px solid ${CY}44`,
            borderTop: `2px solid ${CY}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${CY}12, 0 8px 32px rgba(0,0,0,0.75)`,
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderBottom: `1px solid ${CY}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: CY, fontSize: 13 }}>◈</span>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              OPS EVENT TIMELINE
            </span>
            {loading && (
              <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>loading…</span>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={load}
              title="Refresh"
              style={{ background: "transparent", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 13 }}
            >
              ↻
            </button>
            <button
              onClick={() => setVisible(false)}
              style={{ background: "transparent", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "8px 14px",
              borderBottom: "1px solid #1A2A3A",
              flexShrink: 0,
            }}
          >
            {[
              { label: "TOTAL",    val: events.length, col: CY  },
              { label: "CRITICAL", val: critCount,      col: RED },
              { label: "WARNING",  val: warnCount,      col: AMB },
              { label: "INFO",     val: infoCount,      col: GRN },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid #1A2A3A",
                  borderRadius: 6,
                  padding: "5px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, color: t.col, fontWeight: 700 }}>{t.val}</div>
                <div style={{ fontSize: 8, color: "#4E6A7A", letterSpacing: 1, marginTop: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1A2A3A", flexShrink: 0 }}>
            {["ALL", "CRITICAL", "WARNING", "INFO"].map((t) => {
              const col = t === "CRITICAL" ? RED : t === "WARNING" ? AMB : t === "INFO" ? GRN : CY;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    flex: 1,
                    padding: "6px 0",
                    border: "none",
                    borderBottom: tab === t ? `2px solid ${col}` : "2px solid transparent",
                    background: "transparent",
                    color: tab === t ? col : "#6E8AA0",
                    fontSize: 9,
                    letterSpacing: 1,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {/* Event list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {!loading && events.length === 0 && (
              <div style={{ textAlign: "center", padding: "28px 0", color: "#4E6A7A", fontSize: 10, letterSpacing: 1 }}>
                No events returned by /v1/ops/events.
              </div>
            )}
            {!loading && events.length > 0 && displayed.length === 0 && (
              <div style={{ textAlign: "center", padding: "28px 0", color: "#4E6A7A", fontSize: 10, letterSpacing: 1 }}>
                No {tab.toLowerCase()} events in current window.
              </div>
            )}
            {displayed.map((ev) => {
              const key  = eventId(ev);
              const sev  = severity(ev);
              const col  = sev === "CRITICAL" ? RED : sev === "WARNING" ? AMB : GRN;
              const title = ev.title || ev.type || ev.event_type || ev.name || "Untitled event";
              const desc  = ev.description || ev.detail || ev.message || ev.body || "";
              const ts    = relTime(ev);
              const assessment = assessments[key];
              const isAss = assessing === key;
              return (
                <div
                  key={key}
                  style={{
                    margin: "0 10px 8px",
                    background: "rgba(255,255,255,0.025)",
                    border: `1px solid ${col}33`,
                    borderLeft: `3px solid ${col}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                  }}
                >
                  {/* Top row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 8,
                        color: col,
                        letterSpacing: 1,
                        border: `1px solid ${col}55`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {sev}
                    </span>
                    <span style={{ fontSize: 11, color: "#C8DDF0", flex: 1, fontWeight: 600 }}>
                      {title}
                    </span>
                    <span style={{ fontSize: 9, color: "#4E6A7A", whiteSpace: "nowrap" }}>{ts}</span>
                  </div>

                  {/* Description */}
                  {desc && (
                    <div style={{ fontSize: 9, color: "#7A9AB0", marginBottom: 6, lineHeight: 1.55 }}>
                      {desc.slice(0, 200)}{desc.length > 200 ? "…" : ""}
                    </div>
                  )}

                  {/* Assess button */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => assess(ev)}
                      disabled={isAss}
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        border: `1px solid ${isAss ? "#2A3A4A" : col + "66"}`,
                        background: isAss ? "transparent" : `${col}18`,
                        color: isAss ? "#4E6A7A" : col,
                        fontSize: 9,
                        letterSpacing: 1,
                        cursor: isAss ? "default" : "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {isAss ? "…" : "▶ ASSESS"}
                    </button>
                  </div>

                  {/* AI assessment */}
                  {assessment && (
                    <div
                      style={{
                        marginTop: 6,
                        padding: "6px 10px",
                        background: `${col}0A`,
                        border: `1px solid ${col}22`,
                        borderRadius: 5,
                        fontSize: 9,
                        color: "#C8DDF0",
                        lineHeight: 1.65,
                      }}
                    >
                      {assessment}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "7px 14px",
              borderTop: `1px solid ${CY}18`,
              fontSize: 8,
              color: "#4E6A7A",
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            /v1/ops/events → chronological severity timeline · auto-refresh 60 s
          </div>
        </div>
      )}
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function fetchEvents() {
  const r = await fetch(`${apiBase()}/v1/ops/events?limit=100`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  const raw = Array.isArray(d) ? d
    : Array.isArray(d?.data)   ? d.data
    : Array.isArray(d?.events) ? d.events
    : Array.isArray(d?.items)  ? d.items
    : Array.isArray(d?.results)? d.results
    : [];
  // Reverse-chronological: sort by timestamp descending
  return [...raw].sort((a, b) => {
    const ta = new Date(a.timestamp || a.created_at || a.ts || 0).getTime();
    const tb = new Date(b.timestamp || b.created_at || b.ts || 0).getTime();
    return tb - ta;
  });
}

function eventId(ev) {
  return String(ev.id || ev.event_id || ev.uuid || ev.title || ev.type || Math.random());
}

function severity(ev) {
  const s = (ev.severity || ev.level || ev.priority || ev.type || "").toUpperCase();
  if (/CRIT/.test(s) || s === "HIGH" || s === "FATAL" || s === "ERROR") return "CRITICAL";
  if (/WARN/.test(s) || s === "MEDIUM") return "WARNING";
  return "INFO";
}

function relTime(ev) {
  const raw = ev.timestamp || ev.created_at || ev.ts;
  if (!raw) return "—";
  const diff = Date.now() - new Date(raw).getTime();
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
