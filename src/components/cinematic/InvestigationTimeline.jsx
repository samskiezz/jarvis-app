/**
 * InvestigationTimeline — F471
 * "JARVIS, investigation timeline / case timeline / invtl" opens a
 * chronological timeline of all investigations from /v1/investigations.
 * Additive only — mounted via App.jsx; helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const RED = "#FF3B3B";
const YLW = "#FFD700";
const GRY = "#4A6070";
const PRP = "#A855F7";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 60_000;

const INVTL_RE =
  /\binvestigation.?timeline\b|\bcase.?timeline\b|\btimeline.?cases?\b|\btimeline.?invest\b|\bcase.?history\b|\binvestigation.?history\b|\binvtl\b|\bcase.?chronology\b|\binvestigations?.?log\b/i;

export function isInvtlQuery(text) {
  return INVTL_RE.test(text || "");
}

function statusColor(status = "") {
  const s = String(status).toLowerCase();
  if (/open|new|pending/i.test(s))    return CY;
  if (/active|progress|ongoing/i.test(s)) return GRN;
  if (/closed|resolved|complete/i.test(s)) return GRY;
  if (/archived|historical/i.test(s)) return PRP;
  if (/escalated|critical/i.test(s))  return RED;
  if (/review|hold/i.test(s))         return YLW;
  return CY;
}

function statusLabel(status = "") {
  const s = String(status).toLowerCase();
  if (/open|new|pending/i.test(s))    return "OPEN";
  if (/active|progress|ongoing/i.test(s)) return "ACTIVE";
  if (/closed|resolved|complete/i.test(s)) return "CLOSED";
  if (/archived|historical/i.test(s)) return "ARCHIVED";
  if (/escalated|critical/i.test(s))  return "ESCALATED";
  if (/review|hold/i.test(s))         return "ON HOLD";
  return String(status).toUpperCase() || "OPEN";
}

function normalise(data) {
  if (!data) return [];
  const raw =
    data.investigations || data.cases || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.slice(0, 60).map((inv, i) => ({
    id:       inv.id || inv.case_id || inv.investigation_id || `inv-${i}`,
    title:    inv.title || inv.name || inv.subject || inv.label || `Case ${i + 1}`,
    status:   inv.status || inv.state || "open",
    type:     inv.type || inv.category || inv.kind || null,
    priority: inv.priority || inv.severity || null,
    opened:   inv.opened_at || inv.created_at || inv.start_date || inv.date || null,
    updated:  inv.updated_at || inv.last_modified || inv.modified_at || null,
    lead:     inv.lead || inv.owner || inv.assigned_to || inv.investigator || null,
    summary:  inv.summary || inv.description || inv.brief || null,
  }));
}

function fmtDate(ts) {
  if (!ts) return null;
  try {
    return new Date(ts).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return null; }
}

function ageLabel(ts) {
  if (!ts) return null;
  try {
    const ms = Date.now() - new Date(ts).getTime();
    const days = Math.floor(ms / 86_400_000);
    if (days < 1)  return "today";
    if (days === 1) return "1 day ago";
    if (days < 30)  return `${days}d ago`;
    const months = Math.floor(days / 30);
    return months === 1 ? "1 mo ago" : `${months} mo ago`;
  } catch { return null; }
}

export async function buildInvtlScript() {
  let data = null;
  try {
    const r = await fetch(`${apiBase()}/v1/investigations`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (r.ok) data = await r.json();
  } catch (_) {}

  if (!data) return "Unable to retrieve investigation timeline at this time, sir.";

  const cases = normalise(data);
  if (!cases.length) return "No investigations on record at this time, sir.";

  const open     = cases.filter(c => /open|new|pending/i.test(c.status)).length;
  const active   = cases.filter(c => /active|progress|ongoing/i.test(c.status)).length;
  const closed   = cases.filter(c => /closed|resolved|complete|archived/i.test(c.status)).length;
  const escalated = cases.filter(c => /escalated|critical/i.test(c.status)).length;

  const parts = [
    `Investigation timeline: ${cases.length} case${cases.length !== 1 ? "s" : ""} on record.`,
  ];
  if (open)     parts.push(`${open} open.`);
  if (active)   parts.push(`${active} active.`);
  if (escalated) parts.push(`${escalated} escalated — attention required.`);
  if (closed)   parts.push(`${closed} closed.`);

  const latest = cases.find(c => c.opened) || cases[0];
  if (latest?.title) {
    const age = ageLabel(latest.opened);
    parts.push(`Latest: ${latest.title.slice(0, 60)}${age ? `, ${age}` : ""}.`);
  }

  return parts.join(" ");
}

export default function InvestigationTimeline() {
  const [open,    setOpen]    = useState(false);
  const [cases,   setCases]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastTs,  setLastTs]  = useState(null);
  const [filter,  setFilter]  = useState("ALL");
  const [expand,  setExpand]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/v1/investigations`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (r.ok) {
        const data = await r.json();
        const sorted = normalise(data).sort((a, b) => {
          const ta = a.opened ? new Date(a.opened).getTime() : 0;
          const tb = b.opened ? new Date(b.opened).getTime() : 0;
          return tb - ta;
        });
        setCases(sorted);
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
      if (INVTL_RE.test(q)) { setOpen(true); load(); }
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:invtl-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invtl-toggle", onToggle);
  }, []);

  const openCount     = cases.filter(c => /open|new|pending/i.test(c.status)).length;
  const activeCount   = cases.filter(c => /active|progress|ongoing/i.test(c.status)).length;
  const closedCount   = cases.filter(c => /closed|resolved|complete|archived/i.test(c.status)).length;
  const escalCount    = cases.filter(c => /escalated|critical/i.test(c.status)).length;

  const FILTERS = ["ALL", "OPEN", "ACTIVE", "CLOSED", "ESCALATED"];
  const visible = cases.filter(c => {
    if (filter === "ALL") return true;
    return statusLabel(c.status) === filter;
  });

  const accentColor = escalCount > 0 ? RED : openCount > 0 ? CY : GRN;
  const badge = escalCount > 0 ? escalCount : openCount > 0 ? openCount : null;
  const ts = lastTs
    ? new Date(lastTs).toLocaleTimeString("en-GB", { hour12: false })
    : null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Investigation Timeline (F471)"
        style={{
          position: "fixed", left: 8760, bottom: 8, zIndex: 69,
          background: open ? accentColor + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? accentColor : accentColor + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : accentColor,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${accentColor}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        INVTL
        {badge != null && (
          <span style={{
            background: accentColor + "44", color: accentColor,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
            animation: escalCount > 0 ? "invtlpulse 1s ease-in-out infinite" : "none",
          }}>
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 69,
          width: "min(520px,95vw)", maxHeight: "min(680px,84vh)",
          background: "rgba(4,6,14,0.97)",
          border: `1px solid ${accentColor}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${accentColor}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${accentColor}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: accentColor, boxShadow: `0 0 10px ${accentColor}`,
              display: "inline-block",
              animation: loading ? "invtlpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: accentColor, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              INVESTIGATION TIMELINE
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
          {cases.length > 0 && (
            <div style={{
              display: "flex", gap: 8, padding: "8px 14px",
              borderBottom: `1px solid ${accentColor}18`, flexWrap: "wrap",
            }}>
              <StatTile label="TOTAL"     value={cases.length} color={CY} />
              {openCount > 0   && <StatTile label="OPEN"      value={openCount}   color={CY} />}
              {activeCount > 0 && <StatTile label="ACTIVE"    value={activeCount} color={GRN} />}
              {escalCount > 0  && <StatTile label="ESCALATED" value={escalCount}  color={RED} />}
              {closedCount > 0 && <StatTile label="CLOSED"    value={closedCount} color={GRY} />}
            </div>
          )}

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 14px",
            borderBottom: `1px solid ${accentColor}18`,
          }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background: filter === f ? accentColor + "22" : "transparent",
                border: `1px solid ${filter === f ? accentColor + "55" : accentColor + "22"}`,
                borderRadius: 5, color: filter === f ? accentColor : "#566878",
                padding: "3px 9px", fontSize: 9, cursor: "pointer",
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

          {/* Timeline */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px 14px" }}>
            {cases.length === 0 && (
              <div style={{
                padding: "28px 0", color: "#4A6070",
                fontSize: 11, textAlign: "center", letterSpacing: 1,
              }}>
                {loading ? "LOADING INVESTIGATIONS…" : "NO CASES — CHECK CONNECTION"}
              </div>
            )}
            {visible.length === 0 && cases.length > 0 && (
              <div style={{
                padding: "28px 0", color: "#4A6070",
                fontSize: 11, textAlign: "center", letterSpacing: 1,
              }}>
                NO {filter} CASES IN RECORD
              </div>
            )}
            {visible.map((inv, idx) => {
              const col   = statusColor(inv.status);
              const lbl   = statusLabel(inv.status);
              const date  = fmtDate(inv.opened);
              const age   = ageLabel(inv.opened);
              const upd   = fmtDate(inv.updated);
              const isExp = expand === inv.id;
              const isLast = idx === visible.length - 1;
              return (
                <div
                  key={inv.id}
                  style={{ display: "flex", gap: 0, position: "relative" }}
                >
                  {/* Timeline spine */}
                  <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    width: 24, flexShrink: 0,
                  }}>
                    <div style={{
                      width: 11, height: 11, borderRadius: "50%",
                      background: col, boxShadow: `0 0 10px ${col}`,
                      flexShrink: 0, marginTop: 10,
                      animation: lbl === "ESCALATED" ? "invtlpulse 1s ease-in-out infinite" : "none",
                      zIndex: 1,
                    }} />
                    {!isLast && (
                      <div style={{
                        width: 1, flex: 1, minHeight: 16,
                        background: `linear-gradient(to bottom, ${col}88, ${col}11)`,
                        marginTop: 2,
                      }} />
                    )}
                  </div>

                  {/* Case card */}
                  <div
                    onClick={() => setExpand(isExp ? null : inv.id)}
                    style={{
                      flex: 1, padding: "8px 10px",
                      marginBottom: isLast ? 0 : 2,
                      background: isExp ? col + "0D" : "transparent",
                      border: `1px solid ${isExp ? col + "33" : "transparent"}`,
                      borderRadius: 8,
                      cursor: "pointer",
                      transition: "background 0.2s, border 0.2s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        color: "#DCF0FF", fontSize: 11, flex: 1,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        letterSpacing: 0.5,
                      }}>
                        {inv.title}
                      </span>
                      <span style={{
                        fontSize: 9, letterSpacing: 1.5, fontWeight: 700,
                        color: col, background: col + "22",
                        borderRadius: 5, padding: "2px 7px", flexShrink: 0,
                      }}>
                        {lbl}
                      </span>
                    </div>

                    <div style={{
                      display: "flex", gap: 12, marginTop: 3,
                      fontSize: 9, color: "#566878",
                    }}>
                      {date && <span>OPENED: <span style={{ color: "#7A9AB0" }}>{date}</span>{age ? ` (${age})` : ""}</span>}
                      {inv.type && <span>TYPE: <span style={{ color: "#7A9AB0" }}>{inv.type}</span></span>}
                      {inv.priority && <span>PRI: <span style={{ color: col + "cc" }}>{String(inv.priority).toUpperCase()}</span></span>}
                    </div>

                    {isExp && (
                      <div style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: `1px solid ${col}22`,
                        fontSize: 10, color: "#8AAABB", lineHeight: 1.6,
                      }}>
                        {inv.summary && (
                          <div style={{ marginBottom: 6 }}>{inv.summary}</div>
                        )}
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 9, color: "#566878" }}>
                          {inv.lead && (
                            <span>LEAD: <span style={{ color: CY }}>{inv.lead}</span></span>
                          )}
                          {upd && (
                            <span>LAST UPDATED: <span style={{ color: "#7A9AB0" }}>{upd}</span></span>
                          )}
                          <span>ID: <span style={{ color: "#4A6070" }}>{inv.id}</span></span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px", borderTop: `1px solid ${accentColor}18`,
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 9, color: "#4A6070",
          }}>
            <span>SOURCE: /v1/investigations</span>
            <span style={{ marginLeft: "auto", color: accentColor + "88" }}>
              {escalCount > 0
                ? `${escalCount} ESCALATED — REVIEW REQUIRED`
                : openCount > 0
                  ? `${openCount} OPEN CASE${openCount !== 1 ? "S" : ""}`
                  : cases.length > 0 ? "ALL CASES RESOLVED" : "NO DATA"}
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes invtlpulse {
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
