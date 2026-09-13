/**
 * NexusEventBusMonitor — F275.
 *
 * Data sources (all real — backed by server/routes/bus.py + control.py):
 *   GET /v1/bus/stats      (poll 60 s) → {events, streams:[str], consumers}
 *   GET /v1/control/state  (poll 60 s) → {services:{count,alive,roster:[...]},
 *                                          latest_snapshot, latest_tasks,
 *                                          recent_events:[{seq,ts,topic,type,payload,actor}]}
 *
 * Displays:
 *   - Stat tiles: total events / stream count / consumers / alive services
 *   - STREAMS | SERVICES | EVENTS tab switcher + text search
 *   - STREAMS: stream name chips + subscriber consumer count
 *   - SERVICES: per-service alive dot + id/name/role/port from roster
 *   - EVENTS: recent 25 events from control plane with seq/topic/type/age + expand → payload excerpt
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence nexus brief + TTS
 *
 * Toggle: ⊞ NXBT at left:274320, bottom:8, zIndex:153.
 * Badge: green=alive-service-count, amber=any stream has events, dim=empty.
 * 60 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isNxbtQuery(q) / buildNxbtScript()
 *
 * Voice triggers: "nexus bus / event bus / bus stats / bus monitor / nxbt /
 *   nexus events / control state / system bus / event stream /
 *   what's on the bus / nexus control / bus monitor"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const PU   = "#A78BFA";
const DIM  = "#3A4A55";
const GRAY = "#4E6070";

const BTN_LEFT = 274320;
const POLL_MS  = 60_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const NXBT_RE =
  /\b(nexus\s+bus|event\s+bus|bus\s+stats|bus\s+monitor|nxbt\b|nexus\s+events?|control\s+state|system\s+bus|event\s+stream|on\s+the\s+bus|nexus\s+control|bus\s+log|bus\s+feed|event\s+feed|nexus\s+log)\b/i;

export function isNxbtQuery(q) {
  return NXBT_RE.test(q || "");
}

export async function buildNxbtScript() {
  try {
    const [statsR, stateR] = await Promise.all([
      fetch(`${apiBase()}/v1/bus/stats`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/control/state`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const stats = await statsR.json();
    const state = await stateR.json();
    window.dispatchEvent(new CustomEvent("jarvis:nxbt-toggle"));
    const evts   = stats?.events ?? 0;
    const strms  = (stats?.streams ?? []).length;
    const alive  = state?.services?.alive ?? 0;
    const total  = state?.services?.count ?? 0;
    const recent = (state?.recent_events ?? []).length;
    return (
      `Nexus Event Bus: ${evts.toLocaleString()} events across ${strms} stream${strms !== 1 ? "s" : ""}, ` +
      `${stats?.consumers ?? 0} consumer${(stats?.consumers ?? 0) !== 1 ? "s" : ""}. ` +
      `Control plane: ${alive} of ${total} service${total !== 1 ? "s" : ""} alive, ` +
      `${recent} recent event${recent !== 1 ? "s" : ""} on record.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:nxbt-toggle"));
    return "Nexus Event Bus Monitor open, sir.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function age(ts) {
  if (!ts) return "—";
  const raw = typeof ts === "string" ? new Date(ts).getTime() / 1000 : Number(ts);
  if (isNaN(raw)) return "—";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - raw));
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function topicColor(topic) {
  if (!topic) return CY;
  if (topic === "system" || topic === "health") return GN;
  if (topic === "cost" || topic === "gpu")      return AM;
  if (topic === "tasks" || topic === "control") return PU;
  if (topic === "correlation")                  return RD;
  return CY;
}

function svcColor(alive) {
  return alive ? GN : RD;
}

function truncate(str, len = 120) {
  if (!str) return "";
  const s = typeof str === "object" ? JSON.stringify(str) : String(str);
  return s.length > len ? s.slice(0, len) + "…" : s;
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchBusStats() {
  const r = await fetch(`${apiBase()}/v1/bus/stats`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`bus/stats ${r.status}`);
  return r.json();
}

async function fetchControlState() {
  const r = await fetch(`${apiBase()}/v1/control/state`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`control/state ${r.status}`);
  return r.json();
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        background: "rgba(41,231,255,0.04)",
        border: "1px solid rgba(41,231,255,0.10)",
        borderRadius: 6,
        padding: "8px 10px",
        minWidth: 70,
      }}
    >
      <div style={{ color, fontSize: 18, fontWeight: 700, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ color: GRAY, fontSize: 10, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
    </div>
  );
}

function TabBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "rgba(41,231,255,0.12)" : "transparent",
        border: `1px solid ${active ? CY : "rgba(41,231,255,0.15)"}`,
        borderRadius: 4,
        color: active ? CY : GRAY,
        cursor: "pointer",
        fontSize: 10,
        fontFamily: "monospace",
        letterSpacing: "0.06em",
        padding: "3px 8px",
      }}
    >
      {label}
    </button>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function NexusEventBusMonitor() {
  const [open, setOpen]       = useState(false);
  const [stats, setStats]     = useState(null);
  const [state, setState]     = useState(null);
  const [tab, setTab]         = useState("STREAMS");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([fetchBusStats(), fetchControlState()]);
      setStats(s);
      setState(c);
    } catch {
      // leave previous data intact on transient failure
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => {
      setOpen((o) => !o);
      if (!stats && !state) load();
    };
    window.addEventListener("jarvis:nxbt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:nxbt-toggle", onToggle);
  }, [load, stats, state]);

  // badge colour: green = alive services, amber = any events on bus
  const aliveCount = state?.services?.alive ?? 0;
  const evtTotal   = stats?.events ?? 0;
  const badgeColor = aliveCount > 0 ? GN : evtTotal > 0 ? AM : DIM;
  const badgeVal   = aliveCount > 0 ? aliveCount : evtTotal > 0 ? evtTotal : "—";

  const streams  = stats?.streams ?? [];
  const roster   = state?.services?.roster ?? [];
  const events   = state?.recent_events ?? [];

  const lc = search.toLowerCase();
  const filteredStreams  = streams.filter((s) => !lc || s.toLowerCase().includes(lc));
  const filteredRoster   = roster.filter((s) =>
    !lc || (s.id || "").toLowerCase().includes(lc) || (s.name || "").toLowerCase().includes(lc)
  );
  const filteredEvents   = events.filter((e) =>
    !lc ||
    (e.topic || "").toLowerCase().includes(lc) ||
    (e.type  || "").toLowerCase().includes(lc) ||
    (e.actor || "").toLowerCase().includes(lc)
  );

  async function assess() {
    setAssessing(true); setAssessText("");
    try {
      const brief = await buildNxbtScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message:
            `Nexus Event Bus context: ${evtTotal.toLocaleString()} total events, ` +
            `${streams.length} streams (${streams.slice(0, 8).join(", ")}), ` +
            `${state?.services?.alive ?? 0}/${state?.services?.count ?? 0} services alive. ` +
            "Give a 2-sentence operational status brief for the nexus bus.",
        }),
      });
      const d = await r.json();
      const text = d?.response || d?.message || brief;
      setAssessText(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAssessText("Nexus bus assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  function toggleExpand(key) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <>
      {/* ── dock button ─────────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Nexus Event Bus Monitor"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 153,
          background: open ? "rgba(41,231,255,0.15)" : "rgba(10,18,26,0.85)",
          border: `1px solid ${open ? CY : "rgba(41,231,255,0.25)"}`,
          borderRadius: 5,
          color: open ? CY : "#8BAFC4",
          cursor: "pointer",
          fontFamily: "monospace",
          fontSize: 10,
          letterSpacing: "0.06em",
          padding: "4px 8px",
          display: "flex",
          alignItems: "center",
          gap: 5,
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
      >
        <span>⊞</span>
        <span>NXBT</span>
        <span
          style={{
            background: badgeColor,
            borderRadius: 3,
            color: "#0A121A",
            fontSize: 9,
            fontWeight: 700,
            minWidth: 16,
            padding: "0 3px",
            textAlign: "center",
          }}
        >
          {badgeVal}
        </span>
      </button>

      {/* ── panel ───────────────────────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: BTN_LEFT - 360,
            bottom: 44,
            zIndex: 153,
            width: 420,
            maxHeight: 560,
            background: "rgba(8,16,24,0.97)",
            border: "1px solid rgba(41,231,255,0.22)",
            borderRadius: 8,
            boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
            display: "flex",
            flexDirection: "column",
            fontFamily: "monospace",
            overflow: "hidden",
          }}
        >
          {/* header */}
          <div
            style={{
              borderBottom: "1px solid rgba(41,231,255,0.12)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
            }}
          >
            <span style={{ color: CY, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", flex: 1 }}>
              ⊞ NEXUS EVENT BUS MONITOR
            </span>
            <span style={{ color: GN, fontSize: 10 }}>
              {state?.services?.alive ?? "—"}/{state?.services?.count ?? "—"} svc
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: GRAY, cursor: "pointer", fontSize: 13 }}
            >
              ✕
            </button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px 4px" }}>
            <StatTile label="Events"    value={evtTotal.toLocaleString()} color={CY} />
            <StatTile label="Streams"   value={streams.length}            color={PU} />
            <StatTile label="Consumers" value={stats?.consumers ?? "—"}   color={AM} />
            <StatTile label="Svc Alive" value={aliveCount}                color={GN} />
          </div>

          {/* tab bar + search */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 12px" }}>
            {["STREAMS", "SERVICES", "EVENTS"].map((t) => (
              <TabBtn key={t} label={t} active={tab === t} onClick={() => { setTab(t); setSearch(""); }} />
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                background: "rgba(41,231,255,0.05)",
                border: "1px solid rgba(41,231,255,0.12)",
                borderRadius: 4,
                color: CY,
                flex: 1,
                fontFamily: "monospace",
                fontSize: 10,
                marginLeft: 4,
                outline: "none",
                padding: "3px 6px",
              }}
            />
          </div>

          {/* body */}
          <div style={{ flex: 1, overflow: "auto", padding: "4px 12px 8px" }}>

            {/* STREAMS tab */}
            {tab === "STREAMS" && (
              <div>
                {filteredStreams.length === 0 && (
                  <div style={{ color: GRAY, fontSize: 11, padding: "12px 0", textAlign: "center" }}>
                    {streams.length === 0 ? "No streams on bus yet." : "No matches."}
                  </div>
                )}
                {filteredStreams.map((s) => (
                  <div
                    key={s}
                    style={{
                      borderBottom: "1px solid rgba(41,231,255,0.06)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 0",
                    }}
                  >
                    <span
                      style={{
                        background: `${topicColor(s)}22`,
                        border: `1px solid ${topicColor(s)}44`,
                        borderRadius: 3,
                        color: topicColor(s),
                        fontSize: 10,
                        padding: "1px 6px",
                      }}
                    >
                      {s}
                    </span>
                    <span style={{ color: GRAY, fontSize: 10, marginLeft: "auto" }}>
                      {events.filter((e) => e.topic === s).length} recent
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* SERVICES tab */}
            {tab === "SERVICES" && (
              <div>
                {filteredRoster.length === 0 && (
                  <div style={{ color: GRAY, fontSize: 11, padding: "12px 0", textAlign: "center" }}>
                    {roster.length === 0 ? "No services in registry." : "No matches."}
                  </div>
                )}
                {filteredRoster.map((svc) => (
                  <div
                    key={svc.id || svc.name}
                    style={{
                      borderBottom: "1px solid rgba(41,231,255,0.06)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 0",
                    }}
                  >
                    <span
                      style={{
                        background: svcColor(svc.alive),
                        borderRadius: "50%",
                        display: "inline-block",
                        flexShrink: 0,
                        height: 7,
                        width: 7,
                      }}
                    />
                    <span style={{ color: CY, fontSize: 11, fontWeight: 600, flex: 1 }}>
                      {svc.name || svc.id || "unknown"}
                    </span>
                    {svc.role && (
                      <span style={{ color: AM, fontSize: 9 }}>{svc.role}</span>
                    )}
                    {svc.port && (
                      <span style={{ color: GRAY, fontSize: 9 }}>:{svc.port}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* EVENTS tab */}
            {tab === "EVENTS" && (
              <div>
                {filteredEvents.length === 0 && (
                  <div style={{ color: GRAY, fontSize: 11, padding: "12px 0", textAlign: "center" }}>
                    {events.length === 0 ? "No recent events from control plane." : "No matches."}
                  </div>
                )}
                {filteredEvents.map((evt) => {
                  const key = `evt-${evt.seq}`;
                  const isExp = !!expanded[key];
                  return (
                    <div
                      key={key}
                      style={{ borderBottom: "1px solid rgba(41,231,255,0.06)", padding: "5px 0" }}
                    >
                      <div
                        onClick={() => toggleExpand(key)}
                        style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                      >
                        <span
                          style={{
                            background: `${topicColor(evt.topic)}22`,
                            border: `1px solid ${topicColor(evt.topic)}44`,
                            borderRadius: 3,
                            color: topicColor(evt.topic),
                            fontSize: 9,
                            padding: "1px 5px",
                            flexShrink: 0,
                          }}
                        >
                          {evt.topic}
                        </span>
                        <span style={{ color: "#8BAFC4", fontSize: 11, flex: 1 }}>
                          {evt.type}
                        </span>
                        {evt.actor && (
                          <span style={{ color: GRAY, fontSize: 9 }}>{evt.actor}</span>
                        )}
                        <span style={{ color: GRAY, fontSize: 9, flexShrink: 0 }}>
                          {age(evt.ts)}
                        </span>
                        <span style={{ color: GRAY, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                      </div>
                      {isExp && (
                        <div
                          style={{
                            background: "rgba(41,231,255,0.03)",
                            border: "1px solid rgba(41,231,255,0.08)",
                            borderRadius: 4,
                            color: "#8BAFC4",
                            fontSize: 10,
                            marginTop: 4,
                            padding: "5px 8px",
                            wordBreak: "break-all",
                          }}
                        >
                          <span style={{ color: GRAY }}>seq {evt.seq} · </span>
                          {truncate(evt.payload)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* assess */}
          <div
            style={{
              borderTop: "1px solid rgba(41,231,255,0.10)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "6px 12px 8px",
            }}
          >
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                alignSelf: "flex-start",
                background: "rgba(41,231,255,0.08)",
                border: `1px solid ${CY}44`,
                borderRadius: 4,
                color: CY,
                cursor: assessing ? "wait" : "pointer",
                fontFamily: "monospace",
                fontSize: 10,
                padding: "3px 10px",
              }}
            >
              {assessing ? "Assessing…" : "▶ ASSESS"}
            </button>
            {assessText && (
              <div
                style={{
                  background: "rgba(41,231,255,0.04)",
                  border: "1px solid rgba(41,231,255,0.10)",
                  borderRadius: 4,
                  color: "#8BAFC4",
                  fontSize: 10,
                  lineHeight: 1.5,
                  padding: "5px 8px",
                }}
              >
                {assessText}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
