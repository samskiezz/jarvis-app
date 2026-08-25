/**
 * OpsEventsTimeline — F44 Ops Events Timeline.
 * Polls /v1/ops/events every 30 s; severity-sorted timeline with stat tiles,
 * ALL/CRITICAL/WARNING/INFO filter tabs + text search, expand for details,
 * ASSESS → /v1/jarvis/agent/chat 2-sentence ops brief + TTS.
 *
 * Button: ⊞ OPSEV (bottom strip, left:600 bottom:18)
 * Endpoint: /v1/ops/events
 * Voice trigger: "ops events" | "operational events" | "opsev" | "event timeline" | "event stream"
 * Additive only — mounted via App.jsx.
 */
import { useEffect, useRef, useState, useCallback } from "react";

const CY  = "#29E7FF";
const RED = "#FF3B6B";
const AMB = "#F59E0B";
const BLU = "#38BDF8";
const GRN = "#00E676";
const GRY = "#6E8AA0";
const BG  = "rgba(5,10,18,0.96)";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

const VOICE_RE = /\bops\s*event|operational\s*event|event\s*timeline|event\s*stream|opsev\b/i;

const SEV_META = {
  CRITICAL: { color: RED,  icon: "⚠", label: "CRITICAL" },
  WARNING:  { color: AMB,  icon: "◆", label: "WARNING"  },
  INFO:     { color: BLU,  icon: "◎", label: "INFO"     },
  DEBUG:    { color: GRY,  icon: "·", label: "DEBUG"    },
};

function sevMeta(sev) {
  const k = (sev || "").toUpperCase();
  return SEV_META[k] || { color: GRY, icon: "·", label: k || "UNKNOWN" };
}

function fmtTime(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

async function fetchEvents() {
  const r = await fetch(`${apiBase()}/v1/ops/events`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`${r.status}`);
  const d = await r.json();
  return Array.isArray(d)          ? d
    : Array.isArray(d?.data)       ? d.data
    : Array.isArray(d?.items)      ? d.items
    : Array.isArray(d?.events)     ? d.events
    : Array.isArray(d?.results)    ? d.results
    : [];
}

async function assessEvents(events) {
  const base = apiBase();
  const snippet = events.slice(0, 10).map((e) =>
    `[${e.severity || "?"}] ${e.type || e.event_type || "event"}: ${e.description || e.message || JSON.stringify(e).slice(0, 80)}`
  ).join("\n");
  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message:
        `Ops events snapshot (last ${events.length} events):\n${snippet}\n\nGive a 2-sentence operational situational awareness brief. Be direct and specific.`,
    }),
  });
  if (!r.ok) throw new Error(`assess ${r.status}`);
  const d = await r.json();
  return d?.response || d?.message || d?.content || d?.answer || JSON.stringify(d).slice(0, 300);
}

async function speakText(text) {
  const base = apiBase();
  const r = await fetch(`${base}/v1/voice/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, voice: "ash" }),
  });
  if (!r.ok) return;
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  await audio.play();
}

const TABS = ["ALL", "CRITICAL", "WARNING", "INFO"];

export default function OpsEventsTimeline() {
  const [open, setOpen]         = useState(false);
  const [events, setEvents]     = useState([]);
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [lastPoll, setLastPoll] = useState(null);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState(null);
  const timerRef                = useRef(null);

  const poll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEvents();
      data.sort((a, b) => {
        const sev = { CRITICAL: 0, WARNING: 1, INFO: 2, DEBUG: 3 };
        const sa = sev[(a.severity || "").toUpperCase()] ?? 9;
        const sb = sev[(b.severity || "").toUpperCase()] ?? 9;
        return sa !== sb ? sa - sb : (b.timestamp || "").localeCompare(a.timestamp || "");
      });
      setEvents(data);
      setLastPoll(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    poll();
    timerRef.current = setInterval(poll, 30_000);
    return () => clearInterval(timerRef.current);
  }, [open, poll]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.query || "";
      if (VOICE_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const filtered = events.filter((ev) => {
    if (tab !== "ALL" && (ev.severity || "").toUpperCase() !== tab) return false;
    if (search) {
      const hay = JSON.stringify(ev).toLowerCase();
      return hay.includes(search.toLowerCase());
    }
    return true;
  });

  const counts = {
    total:    events.length,
    critical: events.filter((e) => (e.severity || "").toUpperCase() === "CRITICAL").length,
    warning:  events.filter((e) => (e.severity || "").toUpperCase() === "WARNING").length,
    info:     events.filter((e) => (e.severity || "").toUpperCase() === "INFO").length,
  };

  const handleAssess = async () => {
    if (!events.length) return;
    setAssessing(true);
    setBrief(null);
    try {
      const text = await assessEvents(events);
      setBrief(text);
      speakText(text).catch(() => {});
    } catch (e) {
      setBrief(`Error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Ops Events Timeline — /v1/ops/events"
        style={{
          position: "fixed",
          bottom: 18,
          left: 600,
          zIndex: 9999,
          background: open ? `${RED}22` : "rgba(5,10,18,0.85)",
          border: `1px solid ${open ? RED : RED + "55"}`,
          borderRadius: 8,
          color: open ? RED : GRY,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1.5,
          padding: "4px 10px",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ⊞ OPSEV
        {counts.critical > 0 && (
          <span style={{
            marginLeft: 6,
            background: RED,
            color: "#fff",
            borderRadius: 8,
            fontSize: 9,
            padding: "1px 5px",
            fontWeight: "bold",
          }}>
            {counts.critical}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 50,
            left: 540,
            zIndex: 10002,
            width: 420,
            maxHeight: 520,
            display: "flex",
            flexDirection: "column",
            background: BG,
            border: `1px solid ${RED}44`,
            borderTop: `2px solid ${RED}`,
            borderRadius: 12,
            boxShadow: `0 0 60px ${RED}18, 0 20px 40px rgba(0,0,0,0.8)`,
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: `1px solid ${RED}22`,
            flexShrink: 0,
          }}>
            <span style={{ color: RED, fontSize: 11, letterSpacing: 2 }}>⊞ OPS EVENTS TIMELINE</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && <span style={{ color: AMB, fontSize: 9, letterSpacing: 1 }}>POLLING…</span>}
              <button onClick={poll} title="Refresh" style={{
                background: "transparent", border: `1px solid ${RED}44`,
                borderRadius: 4, color: RED, fontSize: 9, padding: "2px 7px", cursor: "pointer",
              }}>↺</button>
              <button onClick={() => setOpen(false)} style={{
                background: "transparent", border: "none",
                color: GRY, fontSize: 14, cursor: "pointer", lineHeight: 1,
              }}>×</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "flex", gap: 0,
            borderBottom: `1px solid ${RED}22`,
            flexShrink: 0,
          }}>
            {[
              { label: "TOTAL",    val: counts.total,    color: CY  },
              { label: "CRITICAL", val: counts.critical, color: RED },
              { label: "WARNING",  val: counts.warning,  color: AMB },
              { label: "INFO",     val: counts.info,     color: BLU },
            ].map((t) => (
              <div key={t.label} style={{
                flex: 1, textAlign: "center", padding: "8px 4px",
                borderRight: `1px solid ${RED}11`,
              }}>
                <div style={{ color: t.color, fontSize: 16, fontWeight: "bold", letterSpacing: 1 }}>
                  {t.val}
                </div>
                <div style={{ color: GRY, fontSize: 8, letterSpacing: 1.5, marginTop: 2 }}>
                  {t.label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{
            display: "flex", gap: 0, alignItems: "center",
            borderBottom: `1px solid ${RED}22`,
            flexShrink: 0,
          }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1,
                background: tab === t ? `${RED}22` : "transparent",
                border: "none",
                borderBottom: tab === t ? `2px solid ${RED}` : "2px solid transparent",
                color: tab === t ? RED : GRY,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9, letterSpacing: 1.5,
                padding: "6px 4px",
                cursor: "pointer",
              }}>
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                flex: 2,
                background: "transparent",
                border: "none",
                borderLeft: `1px solid ${RED}22`,
                color: CY, fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9, padding: "6px 8px", outline: "none",
              }}
            />
          </div>

          {/* Event list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {error && (
              <div style={{ padding: "12px 14px", color: RED, fontSize: 10 }}>
                Error: {error}
              </div>
            )}
            {!error && filtered.length === 0 && !loading && (
              <div style={{ padding: "16px 14px", color: GRY, fontSize: 10, textAlign: "center" }}>
                {events.length === 0 ? "Awaiting first poll…" : "No events match filter."}
              </div>
            )}
            {filtered.map((ev, i) => {
              const sm = sevMeta(ev.severity);
              const key = ev.id || ev.event_id || i;
              const isExp = expanded === key;
              const title = ev.type || ev.event_type || ev.name || "event";
              const desc  = ev.description || ev.message || ev.summary || "";
              return (
                <div
                  key={key}
                  onClick={() => setExpanded(isExp ? null : key)}
                  style={{
                    padding: "7px 14px",
                    borderBottom: `1px solid ${RED}11`,
                    cursor: "pointer",
                    background: isExp ? `${sm.color}08` : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: sm.color, fontSize: 12, width: 14, textAlign: "center" }}>
                      {sm.icon}
                    </span>
                    <span style={{ color: sm.color, fontSize: 9, letterSpacing: 1, width: 58, flexShrink: 0 }}>
                      {sm.label}
                    </span>
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {title}
                    </span>
                    <span style={{ color: GRY, fontSize: 9, flexShrink: 0 }}>
                      {fmtTime(ev.timestamp || ev.created_at || ev.time)}
                    </span>
                  </div>
                  {isExp && (
                    <div style={{
                      marginTop: 8, marginLeft: 22,
                      color: GRY, fontSize: 9, lineHeight: 1.6,
                    }}>
                      {desc && (
                        <div style={{ color: "#DCEBF5", marginBottom: 4 }}>{desc}</div>
                      )}
                      {Object.entries(ev)
                        .filter(([k]) => !["id","event_id","type","event_type","name","description","message","summary","severity","timestamp","created_at","time"].includes(k))
                        .slice(0, 8)
                        .map(([k, v]) => (
                          <div key={k}>
                            <span style={{ color: sm.color }}>{k}:</span>{" "}
                            {typeof v === "object" ? JSON.stringify(v).slice(0, 80) : String(v).slice(0, 80)}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Brief */}
          {brief && (
            <div style={{
              borderTop: `1px solid ${RED}22`,
              padding: "8px 14px",
              color: GRN,
              fontSize: 9,
              lineHeight: 1.6,
              flexShrink: 0,
            }}>
              <span style={{ color: CY, marginRight: 6 }}>▸ ASSESS</span>{brief}
            </div>
          )}

          {/* Footer */}
          <div style={{
            borderTop: `1px solid ${RED}1A`,
            padding: "6px 14px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            flexShrink: 0,
          }}>
            <span style={{ color: GRY, fontSize: 9, letterSpacing: 1 }}>
              {lastPoll
                ? `UPDATED ${lastPoll.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                : "AWAITING POLL"}
            </span>
            <button
              onClick={handleAssess}
              disabled={assessing || events.length === 0}
              style={{
                background: assessing ? `${RED}11` : `${RED}22`,
                border: `1px solid ${RED}55`,
                borderRadius: 4,
                color: assessing ? GRY : RED,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9, letterSpacing: 1,
                padding: "3px 10px",
                cursor: assessing ? "default" : "pointer",
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
