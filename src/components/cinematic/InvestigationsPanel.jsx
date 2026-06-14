/**
 * InvestigationsPanel — F12 Investigations List.
 * Floating panel sourced from /v1/investigations.
 * Shows open cases sorted by priority/status.
 * "JARVIS, investigations" or "JARVIS, cases" opens the panel.
 * Refreshes every 90s.
 * Additive only — mounted via App.jsx.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const ORG = "#FF8C00";
const PRP = "#9B59F5";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const INVESTIGATIONS_RE = /\binvestigat|cases?\b|open case|active case|dossier list/i;

const STATUS_ORDER = { open: 0, active: 1, pending: 2, review: 3, closed: 4 };
const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function statusColor(s = "") {
  const v = s.toLowerCase();
  if (v === "open" || v === "active") return "#FF4444";
  if (v === "pending" || v === "review") return ORG;
  return "#566878";
}

function priorityColor(p = "") {
  const v = p.toLowerCase();
  if (v === "critical") return "#FF2222";
  if (v === "high") return ORG;
  if (v === "medium") return CY;
  return "#566878";
}

async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)                   ? d
    : Array.isArray(d?.data)               ? d.data
    : Array.isArray(d?.items)              ? d.items
    : Array.isArray(d?.investigations)     ? d.investigations
    : Array.isArray(d?.cases)              ? d.cases
    : Array.isArray(d?.results)            ? d.results
    : [];
}

export function isInvestigationsQuery(text) {
  return INVESTIGATIONS_RE.test(text || "");
}

export async function buildInvestigationsScript() {
  let cases = [];
  try { cases = await fetchInvestigations(); } catch (_) {}

  if (!cases.length) return "No active investigations on record, sir.";

  const open = cases.filter(c => {
    const s = (c.status || c.state || "").toLowerCase();
    return s === "open" || s === "active";
  });

  const top = cases
    .slice(0, 3)
    .map(c => c.title || c.name || c.case_name || "unnamed")
    .join("; ");

  return (
    `Intelligence vault: ${cases.length} investigation${cases.length !== 1 ? "s" : ""} on record` +
    (open.length ? `, ${open.length} currently open` : "") +
    `. Active cases include: ${top}.`
  );
}

function sortCases(arr) {
  return [...arr].sort((a, b) => {
    const sa = STATUS_ORDER[a.status?.toLowerCase()] ?? 9;
    const sb = STATUS_ORDER[b.status?.toLowerCase()] ?? 9;
    if (sa !== sb) return sa - sb;
    const pa = PRIORITY_ORDER[a.priority?.toLowerCase()] ?? 9;
    const pb = PRIORITY_ORDER[b.priority?.toLowerCase()] ?? 9;
    return pa - pb;
  });
}

function fmtAge(t) {
  if (!t) return "";
  const d = new Date(typeof t === "number" ? t : Date.parse(t));
  if (Number.isNaN(d.getTime())) return String(t).slice(0, 16);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function InvestigationsPanel() {
  const [open,      setOpen]      = useState(false);
  const [cases,     setCases]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [filter,    setFilter]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const arr = await fetchInvestigations();
      setCases(arr);
      setLastFetch(new Date());
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e?.detail?.text || e?.detail?.query || "");
      if (INVESTIGATIONS_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const openCount = cases.filter(c => {
    const s = (c.status || c.state || "").toLowerCase();
    return s === "open" || s === "active";
  }).length;

  const sorted = sortCases(cases);

  const visible = filter.trim()
    ? sorted.filter(c => {
        const hay = [
          c.title, c.name, c.case_name, c.status, c.priority,
          c.subject, c.description, c.summary, c.lead, c.assigned_to,
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(filter.toLowerCase());
      })
    : sorted;

  return (
    <>
      {/* Toggle button — bottom-left strip, after DATA at 420 */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Investigations Panel"
        style={{
          position: "fixed", left: 554, bottom: 18, zIndex: 68,
          background: open ? PRP + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${PRP}55`,
          borderRadius: 8,
          color: open ? "#FFF" : PRP,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${PRP}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>⬟</span>
        CASES
        {openCount > 0 && (
          <span style={{
            background: "#FF444444", color: "#FF4444",
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {openCount}
          </span>
        )}
      </button>

      {/* Investigations panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(420px,93vw)", maxHeight: "min(560px,76vh)",
          background: "rgba(4,6,14,0.95)",
          border: `1px solid ${PRP}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${PRP}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${PRP}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: PRP,
              boxShadow: `0 0 10px ${PRP}`, display: "inline-block",
              animation: loading ? "ivpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: PRP, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              INVESTIGATIONS VAULT
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "SYNCING"
                : lastFetch ? `↻ ${fmtAge(lastFetch)}` : "—"}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stats bar */}
          {cases.length > 0 && (
            <div style={{
              padding: "5px 14px", borderBottom: `1px solid ${PRP}18`,
              display: "flex", gap: 16, alignItems: "center",
            }}>
              <span style={{ fontSize: 9, color: PRP, letterSpacing: 1 }}>
                {cases.length} CASE{cases.length !== 1 ? "S" : ""}
              </span>
              {openCount > 0 && (
                <span style={{ fontSize: 9, color: "#FF4444", letterSpacing: 1 }}>
                  {openCount} OPEN
                </span>
              )}
            </div>
          )}

          {/* Filter */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${PRP}18` }}>
            <input
              type="text"
              placeholder="filter cases…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                background: `${PRP}0a`, border: `1px solid ${PRP}33`,
                borderRadius: 5, color: "#DCEBF5", fontSize: 10,
                padding: "5px 9px", fontFamily: "'JetBrains Mono',monospace",
                outline: "none", letterSpacing: 0.5,
              }}
            />
          </div>

          {/* Case cards */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: "24px 14px", color: "#566878", fontSize: 10, textAlign: "center" }}>
                {cases.length === 0 ? "No investigations on record." : "No matches."}
              </div>
            )}
            {visible.map((c, i) => {
              const title    = c.title || c.name || c.case_name || `Case ${i + 1}`;
              const desc     = c.description || c.summary || c.notes || "";
              const status   = c.status || c.state || "";
              const priority = c.priority || c.severity || "";
              const subject  = c.subject || c.entity || c.target || "";
              const lead     = c.lead || c.assigned_to || c.investigator || "";
              const ts       = c.updated_at || c.last_updated || c.created_at;
              const isOpen   = ["open", "active"].includes(status.toLowerCase());

              return (
                <div key={c.id || c.case_id || i} style={{
                  margin: "6px 10px",
                  background: `${PRP}08`,
                  border: `1px solid ${isOpen ? "#FF444428" : PRP + "22"}`,
                  borderRadius: 8, padding: "9px 12px",
                  position: "relative",
                }}>
                  {isOpen && (
                    <span style={{
                      position: "absolute", top: 10, right: 10,
                      width: 7, height: 7, borderRadius: "50%",
                      background: "#FF4444",
                      boxShadow: "0 0 8px #FF4444",
                      animation: "ivpulse 1.6s ease-in-out infinite",
                      display: "inline-block",
                    }} />
                  )}

                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, paddingRight: 18 }}>
                    <span style={{ fontSize: 13, lineHeight: 1 }}>⬟</span>
                    <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", fontWeight: 700, letterSpacing: 0.5 }}>
                      {title}
                    </span>
                  </div>

                  {/* Description */}
                  {desc && (
                    <p style={{
                      margin: "0 0 5px", fontSize: 9, color: "#8ba3b8",
                      lineHeight: 1.5, letterSpacing: 0.3,
                    }}>
                      {desc.length > 120 ? desc.slice(0, 120) + "…" : desc}
                    </p>
                  )}

                  {/* Meta row */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {status && (
                      <span style={{
                        fontSize: 8, color: statusColor(status),
                        border: `1px solid ${statusColor(status)}55`,
                        borderRadius: 3, padding: "1px 5px", letterSpacing: 0.8, fontWeight: 700,
                      }}>
                        {status.toUpperCase()}
                      </span>
                    )}
                    {priority && (
                      <span style={{
                        fontSize: 8, color: priorityColor(priority),
                        border: `1px solid ${priorityColor(priority)}44`,
                        borderRadius: 3, padding: "1px 5px", letterSpacing: 0.8,
                      }}>
                        {priority.toUpperCase()}
                      </span>
                    )}
                    {subject && (
                      <span style={{
                        fontSize: 8, color: CY + "bb", letterSpacing: 0.5,
                        border: `1px solid ${CY}22`, borderRadius: 3, padding: "1px 5px",
                      }}>
                        {subject.length > 24 ? subject.slice(0, 24) + "…" : subject}
                      </span>
                    )}
                    {lead && (
                      <span style={{ fontSize: 8, color: "#566878", letterSpacing: 0.4 }}>
                        ◎ {lead.length > 20 ? lead.slice(0, 20) + "…" : lead}
                      </span>
                    )}
                    {ts && (
                      <span style={{ fontSize: 8, color: "#566878", marginLeft: "auto" }}>
                        {fmtAge(ts)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes ivpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
