/**
 * GuardianIncidentMonitor — F228.
 *
 * Polls /v1/guardian/status every 60 s for unacked/high counts.
 * On panel open, fetches /v1/guardian/incidents (limit=50).
 * ACK button calls POST /v1/guardian/ack.
 *
 * Stat tiles: total events / unacked / high+critical open / cleared.
 * Filter tabs: ALL | HIGH/CRITICAL | UNACKED + text search.
 * Severity badge: critical=red, high=orange, med=yellow, low=cyan.
 * ◈ GRDN button left:78000 bottom:8 zIndex:111.
 * Red badge if high_open > 0; amber badge if unacked > 0.
 * jarvis:grdn-toggle event.
 * 60-s status auto-refresh.
 *
 * Intent: "guardian / security incidents / sensor alerts /
 *          unacked incidents / home security / grdn /
 *          physical security / guardian status / incident monitor"
 *   → buildGrdnScript() + TTS.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00C878";
const RED    = "#FF3B3B";
const ORANGE = "#FF8C00";
const YELLOW = "#FFD700";

const BTN_LEFT    = 78000;
const STATUS_MS   = 60_000;
const API_KEY     =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── intent exports ───────────────────────────────────────────────────────────

const GRDN_RE =
  /\b(guardian|grdn|security.?incident|sensor.?alert|unacked.?incident|home.?security|physical.?security|incident.?monitor|active.?sensor|guardian.?status)\b/i;

export function isGrdnQuery(t) { return GRDN_RE.test(t || ""); }

export async function buildGrdnScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/guardian/status`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) {
      window.dispatchEvent(new CustomEvent("jarvis:grdn-toggle"));
      return "Guardian incident monitor is online. Opening now, sir.";
    }
    const d = await r.json();
    const unacked = d.unacked ?? 0;
    const high    = d.high_open ?? 0;
    const total   = d.total_events ?? 0;
    window.dispatchEvent(new CustomEvent("jarvis:grdn-toggle"));
    if (high > 0) {
      return (
        `Sir, Guardian is reporting ${high} high-severity incident${high !== 1 ? "s" : ""} ` +
        `requiring immediate attention. ${unacked} total events unacknowledged across ${total} logged. ` +
        "Opening Guardian now."
      );
    }
    if (unacked > 0) {
      return (
        `Guardian: ${unacked} unacknowledged incident${unacked !== 1 ? "s" : ""} from ${total} total events. ` +
        "All within normal severity bounds. Opening monitor now, sir."
      );
    }
    return `Guardian is clear, sir. ${total} events logged, all acknowledged. Opening monitor.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:grdn-toggle"));
    return "Guardian incident monitor is online. Opening now, sir.";
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function severityMeta(s) {
  switch ((s || "").toLowerCase()) {
    case "critical": return { label: "CRITICAL", color: RED,    pulse: true };
    case "high":     return { label: "HIGH",     color: ORANGE, pulse: false };
    case "med":      return { label: "MED",      color: YELLOW, pulse: false };
    default:         return { label: "LOW",      color: CY,     pulse: false };
  }
}

function kindIcon(kind) {
  const k = (kind || "").toLowerCase();
  if (k.includes("motion"))    return "⟡";
  if (k.includes("door"))      return "⊡";
  if (k.includes("window"))    return "⊡";
  if (k.includes("smoke"))     return "⊛";
  if (k.includes("leak"))      return "⊕";
  if (k.includes("co"))        return "◉";
  if (k.includes("fall"))      return "⊗";
  return "◈";
}

function fmtTs(ts) {
  if (!ts || ts === 0) return "—";
  try {
    return new Date(ts * 1000).toLocaleString("en-GB", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

function normaliseItems(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  return [];
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div style={{
      flex: "1 1 80px", textAlign: "center",
      background: "rgba(255,255,255,0.03)", borderRadius: 8,
      border: `1px solid ${color}33`, padding: "10px 6px",
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1.5, marginTop: 3, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function IncidentRow({ item, onAck, acking }) {
  const { label, color, pulse } = severityMeta(item.severity);
  return (
    <div style={{
      borderRadius: 8, border: `1px solid ${color}33`,
      borderLeft: `3px solid ${color}`,
      background: "rgba(255,255,255,0.02)",
      padding: "9px 12px", marginBottom: 7,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 16, color, lineHeight: 1,
          animation: pulse ? "jpulse 1s ease-in-out infinite" : "none",
        }}>{kindIcon(item.kind)}</span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color }}>{label}</span>
        <span style={{ fontSize: 10, color: "#6E8AA0", letterSpacing: 0.5, textTransform: "uppercase" }}>
          {item.kind || "event"}
        </span>
        {item.ack && (
          <span style={{ fontSize: 9, color: GREEN, letterSpacing: 1, marginLeft: "auto" }}>✓ ACK</span>
        )}
        {!item.ack && (
          <button
            disabled={acking === item.id}
            onClick={() => onAck(item.id)}
            style={{
              marginLeft: "auto", fontSize: 9, padding: "2px 8px", borderRadius: 4,
              border: `1px solid ${AMBER}66`, background: "rgba(245,166,35,0.08)",
              color: AMBER, cursor: acking === item.id ? "default" : "pointer",
              letterSpacing: 0.5, opacity: acking === item.id ? 0.5 : 1,
            }}
          >
            {acking === item.id ? "…" : "ACK"}
          </button>
        )}
      </div>
      <div style={{ marginTop: 5 }}>
        <span style={{ fontSize: 12, color: "#DCEBF5" }}>
          {item.sensor_id || "unknown-sensor"}
        </span>
        {item.value !== undefined && item.value !== "" && (
          <span style={{ fontSize: 10, color: "#6E8AA0", marginLeft: 8 }}>
            {String(item.value)}
          </span>
        )}
      </div>
      <div style={{ marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, color: "#445A6A" }}>{item.source || "manual"}</span>
        <span style={{ fontSize: 9, color: "#445A6A" }}>{fmtTs(item.ts)}</span>
        {item.location && (
          <span style={{ fontSize: 9, color: "#445A6A" }}>{item.location}</span>
        )}
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function GuardianIncidentMonitor() {
  const [open, setOpen]       = useState(false);
  const [status, setStatus]   = useState(null);
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [filter, setFilter]   = useState("ALL");
  const [search, setSearch]   = useState("");
  const [acking, setAcking]   = useState(null);
  const statusTimer = useRef(null);

  // 60-s status poll for badge
  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/v1/guardian/status`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) return;
      setStatus(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    statusTimer.current = setInterval(fetchStatus, STATUS_MS);
    return () => clearInterval(statusTimer.current);
  }, [fetchStatus]);

  // load incidents when panel opens
  const fetchIncidents = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${apiBase()}/v1/guardian/incidents?limit=50`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setItems(normaliseItems(d));
      // refresh status too
      fetchStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  useEffect(() => {
    if (open) fetchIncidents();
  }, [open, fetchIncidents]);

  // toggle via event
  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:grdn-toggle", onToggle);
    return () => window.removeEventListener("jarvis:grdn-toggle", onToggle);
  }, []);

  // ACK an incident
  async function handleAck(id) {
    if (!id || id <= 0) return;
    setAcking(id);
    try {
      await fetch(`${apiBase()}/v1/guardian/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ id }),
      });
      setItems((prev) => prev.map((it) => it.id === id ? { ...it, ack: true } : it));
      fetchStatus();
    } catch {}
    setAcking(null);
  }

  // badge
  const highOpen  = status?.high_open  ?? 0;
  const unacked   = status?.unacked    ?? 0;
  const badgeColor = highOpen > 0 ? RED : unacked > 0 ? AMBER : null;
  const badgeCount = highOpen > 0 ? highOpen : unacked;

  // filtered list
  const visible = items.filter((it) => {
    if (filter === "HIGH/CRITICAL") {
      const s = (it.severity || "").toLowerCase();
      if (s !== "high" && s !== "critical") return false;
    } else if (filter === "UNACKED") {
      if (it.ack) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (it.sensor_id || "").toLowerCase().includes(q) ||
        (it.kind      || "").toLowerCase().includes(q) ||
        (it.value     || "").toLowerCase().includes(q) ||
        (it.source    || "").toLowerCase().includes(q) ||
        (it.location  || "").toLowerCase().includes(q) ||
        (it.severity  || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  // stat totals
  const totalItems    = items.length;
  const highCrit      = items.filter((i) => ["high","critical"].includes((i.severity||"").toLowerCase())).length;
  const unackedLocal  = items.filter((i) => !i.ack).length;
  const clearedLocal  = items.filter((i) => i.ack).length;

  return (
    <>
      <style>{`
        @keyframes jpulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.5}}
        @keyframes gfade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* dock button */}
      <div style={{
        position: "fixed",
        left: `min(${BTN_LEFT}px, calc(100vw - 110px))`,
        bottom: 8, zIndex: 111,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        <button
          onClick={() => setOpen((v) => !v)}
          title="Guardian Incident Monitor"
          style={{
            position: "relative",
            background: open ? CY : "rgba(5,8,13,0.8)",
            color: open ? "#04060A" : CY,
            border: `1px solid ${CY}`,
            borderRadius: 6, padding: "3px 10px",
            fontSize: 11, letterSpacing: 1.5, cursor: "pointer",
            boxShadow: `0 0 18px ${CY}${open ? "99" : "44"}`,
            backdropFilter: "blur(6px)",
          }}
        >
          ◈ GRDN
          {badgeColor && (
            <span style={{
              position: "absolute", top: -5, right: -6,
              background: badgeColor, color: "#fff",
              borderRadius: "50%", width: 16, height: 16,
              fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, boxShadow: `0 0 8px ${badgeColor}`,
              animation: highOpen > 0 ? "jpulse 1.5s ease-in-out infinite" : "none",
            }}>{badgeCount > 9 ? "9+" : badgeCount}</span>
          )}
        </button>
      </div>

      {/* panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 44, right: 18, zIndex: 110,
          width: "min(540px, 96vw)",
          maxHeight: "80vh",
          background: "rgba(5,9,16,0.96)",
          border: `1px solid ${CY}44`,
          borderRadius: 14, overflow: "hidden",
          boxShadow: `0 0 60px ${CY}18`,
          display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono', monospace",
          animation: "gfade 0.2s ease-out",
        }}>
          {/* header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px",
            borderBottom: `1px solid ${CY}22`,
            background: "rgba(41,231,255,0.04)",
            flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>◈ GUARDIAN</span>
            <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>INCIDENT MONITOR</span>
            {status?.source && (
              <span style={{ marginLeft: "auto", fontSize: 9, color: GREEN, letterSpacing: 1 }}>
                ● {status.source === "live" ? "LIVE" : "DEFAULT"}
              </span>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16, padding: 0 }}
            >×</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "12px 16px 0", flexShrink: 0 }}>
            <StatTile label="Total"      value={totalItems}    color={CY}     />
            <StatTile label="Unacked"    value={unackedLocal}  color={AMBER}  />
            <StatTile label="High/Crit"  value={highCrit}      color={RED}    />
            <StatTile label="Cleared"    value={clearedLocal}  color={GREEN}  />
          </div>

          {/* filters */}
          <div style={{ display: "flex", gap: 6, padding: "10px 16px 0", flexShrink: 0 }}>
            {["ALL","HIGH/CRITICAL","UNACKED"].map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "3px 10px", borderRadius: 5, fontSize: 10, letterSpacing: 1,
                border: `1px solid ${filter === f ? CY : CY + "33"}`,
                background: filter === f ? CY + "22" : "transparent",
                color: filter === f ? CY : "#6E8AA0", cursor: "pointer",
              }}>{f}</button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto", background: "rgba(41,231,255,0.06)",
                border: `1px solid ${CY}33`, borderRadius: 5,
                color: "#DCEBF5", fontSize: 10, padding: "3px 8px",
                outline: "none", width: 120,
              }}
            />
            <button
              onClick={fetchIncidents}
              disabled={loading}
              style={{
                background: "none", border: `1px solid ${CY}44`,
                borderRadius: 5, color: CY, cursor: loading ? "default" : "pointer",
                fontSize: 10, padding: "3px 8px", opacity: loading ? 0.5 : 1,
              }}
            >{loading ? "…" : "↺"}</button>
          </div>

          {/* list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px 14px" }}>
            {loading && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: "24px 0" }}>
                Loading incidents…
              </div>
            )}
            {!loading && error && (
              <div style={{ color: RED, fontSize: 11, padding: "12px 0" }}>
                Error: {error}
              </div>
            )}
            {!loading && !error && visible.length === 0 && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: "24px 0" }}>
                {items.length === 0 ? "No incidents recorded." : "No incidents match current filter."}
              </div>
            )}
            {!loading && visible.map((it) => (
              <IncidentRow
                key={it.id ?? `${it.sensor_id}-${it.ts}`}
                item={it}
                onAck={handleAck}
                acking={acking}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
