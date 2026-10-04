/**
 * OpsAlertSeverityFunnel — F98 (OAPFUNL).
 *
 * Pulls /v1/ops/alerts and renders a real-time severity funnel:
 *   CRITICAL → HIGH → MEDIUM → LOW → INFO
 * Each tier shows count, % of total, and unacknowledged count.
 * Unacked critical alerts pulse red.
 *
 * 4 stat tiles: TOTAL | CRITICAL | HIGH | UNACKED
 * Filter tabs: ALL / CRITICAL / HIGH / MEDIUM / LOW / INFO
 * Text search on alert title/message.
 * Expand alert → source, rule, timestamp, status badge.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence triage brief + TTS.
 * 60-s auto-refresh.
 *
 * Toggle:  ◈ OAPFUNL at left:976820, bottom:8, zIndex:122
 * Mounted: App.jsx
 * Wired:   JarvisBrain.jsx via isOapfunlQuery / buildOapfunlScript
 *
 * Voice: "oapfunl" / "alert funnel" / "severity funnel" / "alert breakdown" /
 *        "unacked alerts" / "unacknowledged alerts" / "critical alerts"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#FFB347";
const RED   = "#FF3D5A";
const DIM   = "#1a2a38";
const PURPLE = "#A78BFA";

const BTN_LEFT   = 976820;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const SEV_ORDER  = ["critical", "high", "medium", "low", "info"];
const SEV_COLORS = { critical: RED, high: AMBER, medium: CY, low: GREEN, info: PURPLE };
const SEV_LABELS = { critical: "CRITICAL", high: "HIGH", medium: "MEDIUM", low: "LOW", info: "INFO" };

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normalise(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function sev(a) {
  return (a.severity || a.level || a.priority || "info").toLowerCase();
}

function isAcked(a) {
  const s = (a.status || a.state || "").toLowerCase();
  return s === "acked" || s === "acknowledged" || s === "resolved" || s === "closed";
}

function tile(label, value, color, pulse) {
  return (
    <div style={{
      flex: "1 1 100px", background: "rgba(255,255,255,0.04)", border: `1px solid ${color}33`,
      borderRadius: 8, padding: "8px 10px", textAlign: "center",
      boxShadow: pulse ? `0 0 14px ${color}55` : "none",
      animation: pulse ? "oapfunl-pulse 1.2s ease-in-out infinite" : "none",
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, letterSpacing: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 2, marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ─── exports for JarvisBrain ─────────────────────────────────────────────────

export function isOapfunlQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes("oapfunl") ||
    t.includes("alert funnel") ||
    t.includes("severity funnel") ||
    t.includes("alert breakdown") ||
    t.includes("unacked alert") ||
    t.includes("unacknowledged alert") ||
    (t.includes("critical") && t.includes("alert") && t.includes("funnel"))
  );
}

export async function buildOapfunlScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/ops/alerts`, { headers: authHdr() });
    const raw = await r.json();
    const alerts = normalise(raw);
    const totals = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const unacked = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const a of alerts) {
      const s = sev(a);
      const key = SEV_ORDER.includes(s) ? s : "info";
      totals[key]++;
      if (!isAcked(a)) unacked[key]++;
    }
    const totalCount = alerts.length;
    const critUnacked = unacked.critical;
    return (
      `Ops alert funnel: ${totalCount} total alerts. ` +
      `Critical: ${totals.critical} (${unacked.critical} unacked). ` +
      `High: ${totals.high} (${unacked.high} unacked). ` +
      `Medium: ${totals.medium}, Low: ${totals.low}, Info: ${totals.info}. ` +
      (critUnacked > 0 ? `${critUnacked} critical alert${critUnacked > 1 ? "s" : ""} require immediate attention.` : "No unacknowledged critical alerts.")
    );
  } catch {
    return "Could not retrieve ops alert funnel data.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function OpsAlertSeverityFunnel() {
  const [open,    setOpen]    = useState(false);
  const [alerts,  setAlerts]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab,     setTab]     = useState("ALL");
  const [search,  setSearch]  = useState("");
  const [expanded, setExpanded] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/v1/ops/alerts`, { headers: authHdr() });
      const raw = await r.json();
      setAlerts(normalise(raw));
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:oapfunl-toggle", onToggle);
    return () => window.removeEventListener("jarvis:oapfunl-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  // ── derived ────────────────────────────────────────────────────────────────
  const sevCounts  = {};
  const sevUnacked = {};
  for (const s of SEV_ORDER) { sevCounts[s] = 0; sevUnacked[s] = 0; }
  for (const a of alerts) {
    const s = sev(a);
    const key = SEV_ORDER.includes(s) ? s : "info";
    sevCounts[key]++;
    if (!isAcked(a)) sevUnacked[key]++;
  }
  const total      = alerts.length;
  const critCount  = sevCounts.critical;
  const highCount  = sevCounts.high;
  const totalUnacked = Object.values(sevUnacked).reduce((a, b) => a + b, 0);

  const tabs = ["ALL", ...SEV_ORDER.map(s => s.toUpperCase())];
  const filtered = alerts.filter(a => {
    const s = sev(a).toUpperCase();
    const matchTab = tab === "ALL" || s === tab;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (a.title || a.name || a.message || "").toLowerCase().includes(q) ||
      (a.rule || a.source || "").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const maxCount = Math.max(...SEV_ORDER.map(s => sevCounts[s]), 1);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ops Alert Severity Funnel (OAPFUNL)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 122,
          background: "rgba(5,8,13,0.75)", border: `1px solid ${RED}55`,
          color: RED, padding: "4px 10px", borderRadius: 6, fontSize: 11,
          fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
          letterSpacing: 1.5, backdropFilter: "blur(4px)",
          boxShadow: totalUnacked > 0 ? `0 0 12px ${RED}55` : "none",
        }}>
        ◈ OAPFUNL
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)",
      width: "min(780px, 94vw)", zIndex: 900,
      background: "rgba(5,10,18,0.95)", border: `1px solid ${RED}44`,
      borderRadius: 14, padding: "18px 20px", backdropFilter: "blur(12px)",
      boxShadow: `0 0 60px ${RED}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      maxHeight: "80vh", display: "flex", flexDirection: "column",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <span style={{ color: RED, fontWeight: 700, fontSize: 13, letterSpacing: 3 }}>◈ OPS ALERT SEVERITY FUNNEL</span>
        <span style={{ marginLeft: 8, fontSize: 9, color: "#6E8AA0", letterSpacing: 2 }}>OAPFUNL</span>
        {loading && <span style={{ marginLeft: "auto", fontSize: 9, color: CY }}>LOADING…</span>}
        <button onClick={() => setOpen(false)} style={{
          marginLeft: loading ? 8 : "auto", background: "none", border: "none",
          color: "#6E8AA0", cursor: "pointer", fontSize: 16, padding: "0 4px",
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {tile("TOTAL",    total,        CY,    false)}
        {tile("CRITICAL", critCount,    RED,   critCount > 0 && sevUnacked.critical > 0)}
        {tile("HIGH",     highCount,    AMBER, false)}
        {tile("UNACKED",  totalUnacked, RED,   totalUnacked > 0)}
      </div>

      {/* funnel bars */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 2, marginBottom: 8 }}>SEVERITY FUNNEL</div>
        {SEV_ORDER.map(s => {
          const count  = sevCounts[s];
          const unc    = sevUnacked[s];
          const pct    = total > 0 ? Math.round((count / total) * 100) : 0;
          const barPct = total > 0 ? Math.round((count / maxCount) * 100) : 0;
          const col    = SEV_COLORS[s];
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 70, fontSize: 10, color: col, letterSpacing: 1, flexShrink: 0 }}>
                {SEV_LABELS[s]}
              </div>
              <div style={{ flex: 1, background: DIM, borderRadius: 3, height: 14, position: "relative" }}>
                <div style={{
                  width: `${barPct}%`, height: "100%", borderRadius: 3,
                  background: col, opacity: 0.8, transition: "width 0.5s",
                }} />
              </div>
              <div style={{ width: 36, textAlign: "right", fontSize: 11, color: col, flexShrink: 0 }}>{count}</div>
              <div style={{ width: 36, textAlign: "right", fontSize: 10, color: "#6E8AA0", flexShrink: 0 }}>{pct}%</div>
              <div style={{
                width: 60, textAlign: "right", fontSize: 10,
                color: unc > 0 ? RED : "#3a5060", flexShrink: 0,
              }}>
                {unc > 0 ? `${unc} unacked` : "—"}
              </div>
            </div>
          );
        })}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "3px 10px", borderRadius: 5, fontSize: 10, cursor: "pointer",
            background: tab === t ? RED : "transparent",
            border: `1px solid ${tab === t ? RED : "#2a3a4a"}`,
            color: tab === t ? "#fff" : "#6E8AA0", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: "auto", background: "rgba(255,255,255,0.05)",
            border: "1px solid #2a3a4a", borderRadius: 5, color: "#DCEBF5",
            padding: "3px 8px", fontSize: 10, width: 120,
          }}
        />
      </div>

      {/* alert list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.length === 0 && (
          <div style={{ color: "#3a5060", textAlign: "center", padding: 20, fontSize: 12 }}>
            {total === 0 ? "No alerts." : "No alerts match filter."}
          </div>
        )}
        {filtered.slice(0, 80).map((a, i) => {
          const s      = sev(a);
          const key    = SEV_ORDER.includes(s) ? s : "info";
          const col    = SEV_COLORS[key];
          const acked  = isAcked(a);
          const title  = a.title || a.name || a.message || a.id || `Alert ${i + 1}`;
          const source = a.source || a.rule || a.service || "";
          const ts     = a.created_at || a.timestamp || a.time || "";
          const id     = a.id || i;
          const isExp  = expanded === id;
          return (
            <div key={id} style={{
              borderBottom: "1px solid #0d1a24", padding: "8px 4px",
              cursor: "pointer", transition: "background 0.2s",
            }} onClick={() => setExpanded(isExp ? null : id)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 9, color: col, border: `1px solid ${col}55`,
                  borderRadius: 4, padding: "1px 6px", letterSpacing: 1, flexShrink: 0,
                  animation: key === "critical" && !acked ? "oapfunl-pulse 1.4s ease-in-out infinite" : "none",
                }}>
                  {SEV_LABELS[key]}
                </span>
                <span style={{ fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {title}
                </span>
                <span style={{
                  fontSize: 9, borderRadius: 4, padding: "1px 6px",
                  background: acked ? "#1a3a28" : "#3a0a12",
                  color: acked ? GREEN : RED, flexShrink: 0,
                }}>
                  {acked ? "ACKED" : "UNACKED"}
                </span>
                <span style={{ color: "#3a5060", fontSize: 12, flexShrink: 0 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8, paddingLeft: 8, fontSize: 10, color: "#6E8AA0", lineHeight: 1.7 }}>
                  {source && <div><span style={{ color: CY }}>SOURCE:</span> {source}</div>}
                  {a.rule  && <div><span style={{ color: CY }}>RULE:</span> {a.rule}</div>}
                  {ts      && <div><span style={{ color: CY }}>TIME:</span> {new Date(ts).toLocaleString()}</div>}
                  {a.description && <div><span style={{ color: CY }}>DESC:</span> {a.description}</div>}
                  {a.status && <div><span style={{ color: CY }}>STATUS:</span> {a.status}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess button */}
      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={async () => {
          const script = await buildOapfunlScript();
          window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { text: script } }));
        }} style={{
          background: RED, color: "#fff", border: "none", borderRadius: 6,
          padding: "6px 16px", cursor: "pointer", fontSize: 11, fontWeight: 700,
          letterSpacing: 1.5, fontFamily: "'JetBrains Mono',monospace",
        }}>▶ ASSESS</button>
      </div>

      <style>{`
        @keyframes oapfunl-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px ${RED}88; }
          50%       { opacity: 0.6; box-shadow: 0 0 20px ${RED}; }
        }
      `}</style>
    </div>
  );
}
