/**
 * OpsEventsFeed — F31
 * "JARVIS, ops events / operations feed / event log" opens a live operational
 * events panel sourced from the real /v1/ops/events endpoint.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const RED = "#FF3B3B";
const YLW = "#FFD700";
const PRP = "#A855F7";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 30_000;

const OPS_RE =
  /\bops.events?\b|\boperations?.feed\b|\boperations?.log\b|\bevent.log\b|\brecent.events?\b|\bops.feed\b|\blive.events?\b|\bops.log\b|\boperational.events?\b/i;

export function isOpsEventsQuery(text) {
  return OPS_RE.test(text || "");
}

function sevColor(severity = "") {
  const s = String(severity).toLowerCase();
  if (/critical|fatal|emergency/i.test(s)) return RED;
  if (/warn|alert|high/i.test(s)) return YLW;
  if (/info|low|notice/i.test(s)) return CY;
  if (/debug|trace/i.test(s)) return PRP;
  return GRN;
}

function sevLabel(severity = "") {
  const s = String(severity).toLowerCase();
  if (/critical|fatal|emergency/i.test(s)) return "CRITICAL";
  if (/warn|alert|high/i.test(s)) return "WARNING";
  if (/info|low|notice/i.test(s)) return "INFO";
  if (/debug|trace/i.test(s)) return "DEBUG";
  return String(severity).toUpperCase() || "NOMINAL";
}

function normaliseEvents(data) {
  if (!data) return [];
  const raw =
    data.events || data.items || data.results || data.ops_events ||
    (Array.isArray(data) ? data : []);
  return raw.slice(0, 50).map((e, i) => ({
    id:          e.id || e.event_id || `evt-${i}`,
    type:        e.type || e.event_type || e.kind || "event",
    severity:    e.severity || e.level || e.priority || "info",
    summary:     e.summary || e.message || e.description || e.title || "",
    source:      e.source || e.service || e.component || null,
    timestamp:   e.timestamp || e.created_at || e.occurred_at || null,
    status:      e.status || e.state || null,
  }));
}

export async function buildOpsEventsScript() {
  let data = null;
  try {
    const r = await fetch(`${apiBase()}/v1/ops/events`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (r.ok) data = await r.json();
  } catch (_) {}

  if (!data) return "Unable to retrieve operational events at this time, sir.";

  const events = normaliseEvents(data);
  if (!events.length) return "No operational events on record at this time, sir.";

  const criticals = events.filter(e => /critical|fatal|emergency/i.test(e.severity)).length;
  const warnings  = events.filter(e => /warn|alert|high/i.test(e.severity)).length;

  const parts = [
    `Ops events feed: ${events.length} event${events.length !== 1 ? "s" : ""} on record.`,
  ];
  if (criticals) parts.push(`${criticals} critical.`);
  if (warnings)  parts.push(`${warnings} warnings.`);
  if (!criticals && !warnings) parts.push("No critical events detected.");

  const latest = events[0];
  if (latest?.summary) {
    parts.push(`Latest: ${latest.summary.slice(0, 80)}.`);
  }

  return parts.join(" ");
}

export default function OpsEventsFeed() {
  const [open,    setOpen]    = useState(false);
  const [events,  setEvents]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastTs,  setLastTs]  = useState(null);
  const [filter,  setFilter]  = useState("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/v1/ops/events`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (r.ok) {
        const data = await r.json();
        setEvents(normaliseEvents(data));
        setLastTs(Date.now());
      }
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (OPS_RE.test(q)) { setOpen(true); load(); }
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:ops-events-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ops-events-toggle", onToggle);
  }, []);

  const criticals = events.filter(e => /critical|fatal|emergency/i.test(e.severity)).length;
  const warnings  = events.filter(e => /warn|alert|high/i.test(e.severity)).length;

  const FILTERS = ["ALL", "CRITICAL", "WARNING", "INFO"];
  const visible = events.filter(e => {
    if (filter === "ALL") return true;
    return sevLabel(e.severity) === filter;
  });

  const badgeColor = criticals > 0 ? RED : warnings > 0 ? YLW : CY;
  const badge = criticals > 0 ? criticals : warnings > 0 ? warnings : null;

  const ts = lastTs ? new Date(lastTs).toLocaleTimeString("en-GB", { hour12: false }) : null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Ops Events Feed (F31)"
        style={{
          position: "fixed", left: 8640, bottom: 8, zIndex: 68,
          background: open ? badgeColor + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? badgeColor : badgeColor + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : badgeColor,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${badgeColor}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        OPS
        {badge != null && (
          <span style={{
            background: badgeColor + "44", color: badgeColor,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
            animation: criticals > 0 ? "opspulse 1s ease-in-out infinite" : "none",
          }}>
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(540px,96vw)", maxHeight: "min(640px,82vh)",
          background: "rgba(4,6,14,0.97)",
          border: `1px solid ${badgeColor}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${badgeColor}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${badgeColor}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: badgeColor, boxShadow: `0 0 10px ${badgeColor}`,
              display: "inline-block",
              animation: loading ? "opspulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: badgeColor, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              OPS EVENTS FEED
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "SYNCING" : ts ? `UPDATED ${ts}` : "—"} · REFRESH {POLL_MS / 1000}s
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stats row */}
          {events.length > 0 && (
            <div style={{
              display: "flex", gap: 8, padding: "8px 14px",
              borderBottom: `1px solid ${badgeColor}18`,
            }}>
              <StatTile label="TOTAL" value={events.length} color={CY} />
              {criticals > 0 && <StatTile label="CRITICAL" value={criticals} color={RED} />}
              {warnings > 0  && <StatTile label="WARNING"  value={warnings}  color={YLW} />}
              <StatTile
                label="STATUS"
                value={criticals > 0 ? "ALERT" : warnings > 0 ? "WARN" : "NOMINAL"}
                color={criticals > 0 ? RED : warnings > 0 ? YLW : GRN}
              />
            </div>
          )}

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 14px",
            borderBottom: `1px solid ${badgeColor}18`,
          }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background: filter === f ? badgeColor + "22" : "transparent",
                border: `1px solid ${filter === f ? badgeColor + "55" : badgeColor + "22"}`,
                borderRadius: 5, color: filter === f ? badgeColor : "#566878",
                padding: "3px 10px", fontSize: 9, cursor: "pointer",
                letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
              }}>
                {f}
              </button>
            ))}
            <button onClick={load} style={{
              marginLeft: "auto",
              background: "transparent", border: `1px solid ${CY}33`,
              borderRadius: 5, color: "#566878", padding: "3px 9px",
              fontSize: 9, cursor: "pointer", letterSpacing: 1,
              fontFamily: "'JetBrains Mono',monospace",
            }}>↺</button>
          </div>

          {/* Event list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {events.length === 0 && (
              <div style={{
                padding: "28px 18px", color: "#4A6070",
                fontSize: 11, textAlign: "center", letterSpacing: 1,
              }}>
                {loading ? "LOADING OPS EVENTS…" : "NO EVENTS — CHECK CONNECTION"}
              </div>
            )}
            {visible.length === 0 && events.length > 0 && (
              <div style={{
                padding: "28px 18px", color: "#4A6070",
                fontSize: 11, textAlign: "center", letterSpacing: 1,
              }}>
                NO {filter} EVENTS IN RECORD
              </div>
            )}
            {visible.map((evt) => {
              const col = sevColor(evt.severity);
              const lbl = sevLabel(evt.severity);
              const ts2 = evt.timestamp
                ? new Date(evt.timestamp).toLocaleString("en-GB", {
                    day: "2-digit", month: "short",
                    hour: "2-digit", minute: "2-digit", hour12: false,
                  })
                : null;
              return (
                <div key={evt.id} style={{
                  padding: "9px 14px",
                  borderBottom: `1px solid ${col}0F`,
                  borderLeft: `3px solid ${col}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: col, boxShadow: `0 0 8px ${col}`,
                      flexShrink: 0,
                      animation: lbl === "CRITICAL" ? "opspulse 1s ease-in-out infinite" : "none",
                    }} />
                    <span style={{
                      color: "#DCF0FF", fontSize: 11, flex: 1,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      textTransform: "uppercase", letterSpacing: 1,
                    }}>
                      {evt.type}
                    </span>
                    <span style={{
                      fontSize: 9, letterSpacing: 1.5, fontWeight: 700,
                      color: col, background: col + "22",
                      borderRadius: 5, padding: "2px 8px", flexShrink: 0,
                    }}>
                      {lbl}
                    </span>
                  </div>
                  {evt.summary && (
                    <div style={{
                      fontSize: 10, color: "#8AAABB",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      paddingLeft: 15,
                    }}>
                      {evt.summary}
                    </div>
                  )}
                  <div style={{
                    display: "flex", gap: 12, paddingLeft: 15, marginTop: 3,
                    fontSize: 9, color: "#4A6070",
                  }}>
                    {evt.source && <span>SRC: <span style={{ color: "#7A9AB0" }}>{evt.source}</span></span>}
                    {ts2 && <span>{ts2}</span>}
                    {evt.status && <span>STATUS: <span style={{ color: col + "cc" }}>{evt.status}</span></span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px", borderTop: `1px solid ${badgeColor}18`,
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 9, color: "#4A6070",
          }}>
            <span>SOURCE: /v1/ops/events</span>
            <span style={{ marginLeft: "auto", color: badgeColor + "88" }}>
              {criticals > 0 ? `${criticals} CRITICAL — ATTENTION REQUIRED`
                : warnings > 0 ? `${warnings} WARNINGS ACTIVE`
                : "ALL SYSTEMS NOMINAL"}
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes opspulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.4); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}

function StatTile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, background: color + "11",
      border: `1px solid ${color}33`,
      borderRadius: 8, padding: "6px 10px",
      display: "flex", flexDirection: "column", gap: 2, minWidth: 60,
    }}>
      <div style={{ fontSize: 9, color: "#566878", letterSpacing: 1.5 }}>{label}</div>
      <div style={{ fontSize: 15, color, fontWeight: 700, letterSpacing: 1 }}>{value}</div>
    </div>
  );
}
