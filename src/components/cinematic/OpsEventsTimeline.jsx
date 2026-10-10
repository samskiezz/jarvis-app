/**
 * OpsEventsTimeline — F39.
 * Polls /v1/ops/events → 24-hour activity heatmap + scrollable events list.
 * Stat tiles: TOTAL / LAST HOUR / TYPES / CRITICAL.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts.
 * ◷ OPEV toggle button. 120-s auto-refresh.
 * Voice: "ops events"/"operations timeline"/"opev".
 * Additive only — mounted in App.jsx.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const AM  = "#F59E0B";
const RD  = "#EF4444";
const GR  = "#4ADE80";
const DIM = "#1A2A36";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const OPEV_RE =
  /\bops\s?events?|operations?\s+timeline|opev\b|event\s+log|ops\s+log|operations?\s+log/i;

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function hourOf(ts) {
  if (!ts) return -1;
  const d = new Date(ts);
  if (isNaN(d)) return -1;
  const now = new Date();
  const diffMs = now - d;
  const diffH = diffMs / 3_600_000;
  if (diffH < 0 || diffH >= 24) return -1;
  return 23 - Math.floor(diffH);
}

async function fetchEvents() {
  const r = await fetch(`${apiBase()}/v1/ops/events`, { headers: authHdr() });
  const d = await r.json();
  const arr = Array.isArray(d) ? d
    : Array.isArray(d?.data) ? d.data
    : Array.isArray(d?.events) ? d.events
    : Array.isArray(d?.items) ? d.items
    : [];
  return arr.map((e) => ({
    id: e.id || e._id || String(Math.random()),
    title: e.title || e.name || e.message || e.event || e.description || "Unnamed event",
    type: e.type || e.category || e.kind || "general",
    severity: (e.severity || e.level || "info").toLowerCase(),
    ts: e.timestamp || e.created_at || e.created || e.time || null,
  }));
}

function buildHeatmap(events) {
  const counts = Array(24).fill(0);
  for (const e of events) {
    const h = hourOf(e.ts);
    if (h >= 0) counts[h]++;
  }
  return counts;
}

export function isOpevQuery(text) {
  return OPEV_RE.test(text || "");
}

export async function buildOpevScript() {
  let events = [];
  try {
    events = await fetchEvents();
  } catch (_) {}
  if (!events.length)
    return "Operations events log is empty or unreachable. All quiet on the ops timeline, sir.";
  const total = events.length;
  const now = new Date();
  const lastHour = events.filter((e) => {
    if (!e.ts) return false;
    const d = new Date(e.ts);
    return !isNaN(d) && (now - d) < 3_600_000;
  }).length;
  const types = [...new Set(events.map((e) => e.type))].slice(0, 3).join(", ");
  const criticals = events.filter((e) =>
    ["critical", "error", "high"].includes(e.severity)
  ).length;
  return (
    `Operations events timeline: ${total} total events. ` +
    `${lastHour} in the last hour. ${criticals} critical or error-level. ` +
    `Event types active: ${types || "general"}. ` +
    `System is ${criticals > 0 ? "showing elevated activity — recommend review" : "operating normally"}.`
  );
}

function SevDot({ sev }) {
  const clr =
    ["critical", "error"].includes(sev) ? RD
    : sev === "high" ? AM
    : sev === "warning" ? AM
    : sev === "info" ? CY
    : GR;
  return (
    <span
      style={{
        display: "inline-block", width: 6, height: 6, borderRadius: "50%",
        background: clr, flexShrink: 0, marginTop: 2,
      }}
    />
  );
}

export default function OpsEventsTimeline() {
  const [open, setOpen]         = useState(false);
  const [events, setEvents]     = useState([]);
  const [heatmap, setHeatmap]   = useState(Array(24).fill(0));
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [aiText, setAiText]     = useState("");
  const timerRef                = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const evs = await fetchEvents();
      evs.sort((a, b) => {
        const ta = a.ts ? new Date(a.ts).getTime() : 0;
        const tb = b.ts ? new Date(b.ts).getTime() : 0;
        return tb - ta;
      });
      setEvents(evs);
      setHeatmap(buildHeatmap(evs));
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:opev-toggle", handler);
    return () => window.removeEventListener("jarvis:opev-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 120_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    setAiText("");
    try {
      const script = await buildOpevScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Assess recent operations events: ${
            events.slice(0, 5).map((e) => e.title).join(", ")
          }. Provide a brief operational status summary.`,
        }),
      });
      const d = await r.json();
      const reply = d?.response || d?.message || d?.content || script;
      setAiText(reply);
      try {
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { ...authHdr(), "Content-Type": "application/json" },
          body: JSON.stringify({ text: reply.slice(0, 400), voice: getActiveVoice() }),
        });
      } catch (_) {}
    } catch (_) {
      const fallback = await buildOpevScript();
      setAiText(fallback);
    }
    setAssessing(false);
  }

  const now = new Date();
  const lastHourCount = events.filter((e) => {
    if (!e.ts) return false;
    const d = new Date(e.ts);
    return !isNaN(d) && (now - d) < 3_600_000;
  }).length;
  const types = [...new Set(events.map((e) => e.type))].length;
  const criticals = events.filter((e) =>
    ["critical", "error", "high"].includes(e.severity)
  ).length;

  const maxCount = Math.max(...heatmap, 1);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Operations Events Timeline (F39)"
        style={{
          position: "fixed", bottom: 10, left: 9560, zIndex: 100,
          background: open ? `${CY}22` : "rgba(0,4,10,0.85)",
          border: `1px solid ${open ? CY : CY + "44"}`,
          borderRadius: 6, color: open ? CY : CY + "88",
          fontSize: 10, letterSpacing: 1.5, padding: "4px 10px",
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◷ OPEV{criticals > 0 && open ? ` ${criticals}!` : ""}
      </button>

      {open && (
        <div
          style={{
            position: "fixed", bottom: 38, right: 16, zIndex: 150,
            width: "min(580px, 96vw)", maxHeight: "75vh",
            background: "rgba(4,8,16,0.97)",
            border: `1px solid ${CY}44`, borderRadius: 14,
            boxShadow: `0 0 60px ${CY}14, 0 20px 48px rgba(0,0,0,0.9)`,
            fontFamily: "'JetBrains Mono',monospace",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              borderBottom: `1px solid ${CY}33`, padding: "12px 16px",
              display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
            }}
          >
            <span style={{ color: CY, fontSize: 14 }}>◷</span>
            <span style={{ color: CY, fontSize: 12, fontWeight: 700, letterSpacing: 2, flex: 1 }}>
              OPERATIONS EVENTS TIMELINE
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none", color: "#3A5060",
                cursor: "pointer", fontSize: 14, lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "flex", gap: 12, padding: "8px 16px",
              borderBottom: `1px solid ${CY}1A`, flexShrink: 0,
            }}
          >
            {[
              { label: "TOTAL", value: events.length, clr: CY },
              { label: "LAST HOUR", value: lastHourCount, clr: GR },
              { label: "TYPES", value: types, clr: AM },
              { label: "CRITICAL", value: criticals, clr: criticals > 0 ? RD : "#3A5060" },
            ].map(({ label, value, clr }) => (
              <div key={label} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ color: clr, fontSize: 16, fontWeight: 700 }}>{value}</div>
                <div style={{ color: "#3A5060", fontSize: 8, letterSpacing: 1.5, marginTop: 1 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* 24-hour heatmap */}
          <div
            style={{
              padding: "10px 16px 6px",
              borderBottom: `1px solid ${CY}1A`, flexShrink: 0,
            }}
          >
            <div style={{ color: "#3A5060", fontSize: 8, letterSpacing: 1.5, marginBottom: 6 }}>
              24-HOUR ACTIVITY (← oldest · newest →)
            </div>
            <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 40 }}>
              {heatmap.map((count, i) => {
                const pct = count / maxCount;
                const clr = pct > 0.7 ? RD : pct > 0.4 ? AM : pct > 0.1 ? CY : DIM;
                return (
                  <div
                    key={i}
                    title={`${23 - i}h ago: ${count} event${count !== 1 ? "s" : ""}`}
                    style={{
                      flex: 1,
                      height: `${Math.max(pct * 36, count > 0 ? 4 : 2)}px`,
                      background: count > 0 ? clr : DIM,
                      borderRadius: 2,
                      opacity: count > 0 ? 0.85 : 0.25,
                      transition: "height 0.3s ease",
                    }}
                  />
                );
              })}
            </div>
            <div
              style={{
                display: "flex", justifyContent: "space-between",
                color: "#2A3A46", fontSize: 7, marginTop: 3,
              }}
            >
              <span>24h ago</span>
              <span>now</span>
            </div>
          </div>

          {/* Events list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
            {loading && !events.length && (
              <div style={{ color: "#3A5060", fontSize: 11, textAlign: "center", padding: 24 }}>
                Loading operations events…
              </div>
            )}
            {!loading && !events.length && (
              <div style={{ color: GR, fontSize: 11, textAlign: "center", padding: 24 }}>
                ✓ No events returned — ops log is empty or quiet.
              </div>
            )}
            {events.slice(0, 60).map((e, i) => {
              const ts = e.ts ? new Date(e.ts) : null;
              const ago = ts && !isNaN(ts)
                ? (() => {
                    const diff = now - ts;
                    if (diff < 60_000) return "just now";
                    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
                    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
                    return ts.toLocaleDateString();
                  })()
                : "";
              return (
                <div
                  key={e.id}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    padding: "6px 16px",
                    background: i % 2 === 0 ? `${DIM}80` : "transparent",
                  }}
                >
                  <SevDot sev={e.severity} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        color: "#AABBC8", fontSize: 11, letterSpacing: 0.3,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}
                    >
                      {e.title}
                    </div>
                    <div style={{ color: "#3A5060", fontSize: 8, letterSpacing: 1, marginTop: 1 }}>
                      {e.type.toUpperCase()}
                    </div>
                  </div>
                  {ago && (
                    <span style={{ color: "#2A3A46", fontSize: 9, letterSpacing: 0.5, flexShrink: 0 }}>
                      {ago}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* AI text */}
          {aiText && (
            <div
              style={{
                borderTop: `1px solid ${CY}1A`, padding: "10px 16px",
                color: "#7A95AB", fontSize: 10, lineHeight: 1.6, flexShrink: 0,
                maxHeight: 90, overflowY: "auto",
              }}
            >
              {aiText}
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              borderTop: `1px solid ${CY}1A`, padding: "8px 16px",
              display: "flex", gap: 10, alignItems: "center", flexShrink: 0,
            }}
          >
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? `${CY}11` : `${CY}22`,
                border: `1px solid ${CY}55`, borderRadius: 6, color: CY,
                fontSize: 9, letterSpacing: 1.5, padding: "5px 14px",
                cursor: assessing ? "not-allowed" : "pointer",
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
            <button
              onClick={load}
              disabled={loading}
              style={{
                background: "none", border: `1px solid ${CY}33`,
                borderRadius: 6, color: CY + "88",
                fontSize: 9, letterSpacing: 1.5, padding: "5px 12px",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "…" : "↺"}
            </button>
            <span style={{ marginLeft: "auto", color: "#2E4050", fontSize: 9, letterSpacing: 1 }}>
              auto-refresh 120s
            </span>
          </div>
        </div>
      )}
    </>
  );
}
