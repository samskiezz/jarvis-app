import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const RED = "#FF3B3B";
const ORANGE = "#FF8C00";
const YLW = "#FFD700";
const GRN = "#00E5A0";
const POLL_MS = 15_000;
const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const OPS_RE = /\bops\b|\bops\s+log\b|\bops\s+events?\b|\bops\s+stream\b|\boperations?\s+log\b|\boperations?\s+events?\b/i;
export function isOpsQuery(text) { return OPS_RE.test(text || ""); }

export async function buildOpsScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/ops/events`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) throw new Error("no data");
    const data = await r.json();
    const events = Array.isArray(data) ? data : (data.items || data.events || data.results || []);
    const total = events.length;
    const critical = events.filter(e => getSeverity(e) >= 90).length;
    if (critical > 0)
      return `Ops event stream shows ${total} recent events, ${critical} critical. Opening the stream now, sir.`;
    return `Ops event stream shows ${total} recent events. All nominal, sir.`;
  } catch {
    return "Ops event stream is available. Opening the panel now, sir.";
  }
}

function getSeverity(ev) {
  return ev.severity ?? ev.payload?.severity ?? ev.level ?? 0;
}

function getTimestamp(ev) {
  return ev.created_at || ev.timestamp || ev.time || ev.occurred_at || null;
}

function getName(ev) {
  return ev.name || ev.message || ev.title || ev.type || `Event #${ev.id}`;
}

function getType(ev) {
  return ev.type || ev.event_type || ev.category || "OPS";
}

function getTarget(ev) {
  return ev.target || ev.payload?.target || ev.resource || null;
}

function sevMeta(sev) {
  if (sev >= 90) return { label: "CRITICAL", color: RED, pulse: true };
  if (sev >= 70) return { label: "HIGH", color: ORANGE, pulse: false };
  if (sev >= 40) return { label: "MEDIUM", color: YLW, pulse: false };
  return { label: "LOW", color: GRN, pulse: false };
}

function fmtTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

const FILTERS = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"];
function matchFilter(ev, f) {
  if (f === "ALL") return true;
  const sev = getSeverity(ev);
  if (f === "CRITICAL") return sev >= 90;
  if (f === "HIGH") return sev >= 70 && sev < 90;
  if (f === "MEDIUM") return sev >= 40 && sev < 70;
  return sev < 40;
}

export default function OpsEventStream() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastTs, setLastTs] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const seenIds = useRef(new Set());

  const announceVoice = useCallback(async (ev) => {
    const name = getName(ev);
    const sev = getSeverity(ev);
    const { label } = sevMeta(sev);
    const script = `Sir, critical ops event: ${name}.`;
    try {
      const r = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: script }),
      });
      if (!r.ok) return;
      const url = URL.createObjectURL(await r.blob());
      const a = new Audio(url);
      a.onended = () => URL.revokeObjectURL(url);
      a.play().catch(() => {});
    } catch (_) {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/v1/ops/events`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error("no data");
      const data = await r.json();
      const evs = Array.isArray(data) ? data : (data.items || data.events || data.results || []);
      // reverse-chronological: newest first
      const sorted = [...evs].sort((a, b) => {
        const ta = new Date(getTimestamp(a) || 0).getTime();
        const tb = new Date(getTimestamp(b) || 0).getTime();
        return tb - ta;
      });
      setEvents(sorted);
      setLastTs(Date.now());
      // announce new criticals not yet seen
      sorted.forEach((ev) => {
        const id = ev.id ?? JSON.stringify(ev);
        if (!seenIds.current.has(id)) {
          seenIds.current.add(id);
          if (getSeverity(ev) >= 90) announceVoice(ev);
        }
      });
    } catch (_) {
      // leave previous events intact on error
    } finally {
      setLoading(false);
    }
  }, [announceVoice]);

  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || "";
      if (isOpsQuery(q)) { setOpen(true); load(); }
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, [load]);

  const visible = events.filter(ev => matchFilter(ev, filter));
  const critCount = events.filter(ev => getSeverity(ev) >= 90).length;
  const ts = lastTs ? new Date(lastTs).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
  const btnColor = critCount > 0 ? RED : CY;

  return (
    <>
      <style>{`
        @keyframes opspulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes opsslide{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <button
        onClick={() => setOpen(v => !v)}
        title="Ops Event Stream (F35)"
        style={{
          position: "fixed", left: 2364, bottom: 18, zIndex: 68,
          background: open ? `${btnColor}22` : "rgba(5,8,13,0.78)",
          border: `1px solid ${btnColor}${open ? "cc" : "55"}`,
          borderRadius: 7, padding: "5px 10px", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          letterSpacing: 1.5, color: btnColor,
          boxShadow: open ? `0 0 18px ${btnColor}44` : "none",
          display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
        }}
      >
        <span style={{ animation: critCount > 0 ? "opspulse 1.4s ease-in-out infinite" : "none" }}>⬡</span>
        OPS
        {critCount > 0 && (
          <span style={{
            background: RED, color: "#fff", borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 700, lineHeight: 1.4,
          }}>{critCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(540px,96vw)", maxHeight: "min(660px,84vh)",
          background: "rgba(4,6,14,0.97)", border: `1px solid ${CY}22`,
          borderRadius: 12, display: "flex", flexDirection: "column",
          backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}11`,
          fontFamily: "'JetBrains Mono',monospace", animation: "opsslide 0.2s ease-out",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 14px", borderBottom: `1px solid ${CY}18`,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>⬡ OPS EVENT STREAM</span>
            <span style={{ marginLeft: "auto", fontSize: 9, color: "#6E8AA0", letterSpacing: 0.5 }}>
              {loading ? "SYNCING…" : `UPDATED ${ts}`} · POLL 15s
            </span>
            <button
              onClick={load}
              style={{ background: "none", border: "none", cursor: "pointer", color: CY, fontSize: 12, padding: "0 4px" }}
              title="Refresh"
            >↺</button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#6E8AA0", fontSize: 16, lineHeight: 1 }}
            >×</button>
          </div>

          {/* Stats row */}
          <div style={{
            display: "flex", gap: 14, padding: "8px 14px",
            borderBottom: `1px solid ${CY}11`, fontSize: 10, color: "#6E8AA0",
          }}>
            <span><span style={{ color: CY }}>{events.length}</span> TOTAL</span>
            <span><span style={{ color: RED }}>{events.filter(e => getSeverity(e) >= 90).length}</span> CRITICAL</span>
            <span><span style={{ color: ORANGE }}>{events.filter(e => { const s = getSeverity(e); return s >= 70 && s < 90; }).length}</span> HIGH</span>
            <span><span style={{ color: YLW }}>{events.filter(e => { const s = getSeverity(e); return s >= 40 && s < 70; }).length}</span> MEDIUM</span>
            <span><span style={{ color: GRN }}>{events.filter(e => getSeverity(e) < 40).length}</span> LOW</span>
          </div>

          {/* Severity filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "8px 14px",
            borderBottom: `1px solid ${CY}11`,
          }}>
            {FILTERS.map(f => {
              const active = filter === f;
              const fc = f === "ALL" ? CY : f === "CRITICAL" ? RED : f === "HIGH" ? ORANGE : f === "MEDIUM" ? YLW : GRN;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    background: active ? `${fc}22` : "none",
                    border: `1px solid ${active ? fc : fc + "44"}`,
                    borderRadius: 5, padding: "3px 8px", cursor: "pointer",
                    fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
                    letterSpacing: 1, color: active ? fc : fc + "99",
                  }}
                >{f}</button>
              );
            })}
          </div>

          {/* Event list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {visible.length === 0 && (
              <div style={{ padding: 24, color: "#6E8AA0", fontSize: 11, textAlign: "center", letterSpacing: 1 }}>
                {loading ? "LOADING…" : "NO EVENTS MATCH FILTER"}
              </div>
            )}
            {visible.map((ev, idx) => {
              const id = ev.id ?? idx;
              const sev = getSeverity(ev);
              const { label, color, pulse } = sevMeta(sev);
              const name = getName(ev);
              const type = getType(ev);
              const target = getTarget(ev);
              const time = fmtTime(getTimestamp(ev));
              return (
                <div
                  key={id}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "9px 14px", borderBottom: `1px solid ${CY}0a`,
                    borderLeft: `3px solid ${color}`,
                  }}
                >
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%", background: color,
                    boxShadow: `0 0 8px ${color}`, marginTop: 4, flexShrink: 0,
                    animation: pulse ? "opspulse 1.2s ease-in-out infinite" : "none",
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 9, color, letterSpacing: 1.5, fontWeight: 700 }}>{label}</span>
                      <span style={{ fontSize: 9, color: "#4E6E88", letterSpacing: 0.5 }}>
                        {type.toString().toUpperCase()}
                      </span>
                      {time && (
                        <span style={{ marginLeft: "auto", fontSize: 9, color: "#4E6E88" }}>{time}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#DCEBF5", lineHeight: 1.4, wordBreak: "break-word" }}>
                      {name}
                    </div>
                    {target && (
                      <div style={{ fontSize: 10, color: "#6E8AA0", marginTop: 2 }}>
                        target: {target}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px", borderTop: `1px solid ${CY}11`,
            fontSize: 9, color: "#4E6E88", letterSpacing: 0.5,
          }}>
            SOURCE: /v1/ops/events · REVERSE-CHRONOLOGICAL · AUTO-POLL 15s
            {critCount > 0 && (
              <span style={{ color: RED, marginLeft: 12 }}>
                ● {critCount} CRITICAL — TTS ANNOUNCED
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
