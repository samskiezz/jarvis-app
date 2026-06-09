/**
 * InvestigationsList — F12 Investigations panel.
 * Sources open cases from /v1/investigations.
 * "JARVIS, investigations" opens the panel and speaks a brief.
 * Additive only — mounted via App.jsx; intent exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const PRP = "#C070FF";
const CY  = "#29E7FF";
const GLD = "#FFD700";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const INVEST_RE = /\binvestig|case|open.case|operation|intel.case|inquiry\b/i;

const STATUS_ORDER = { open: 0, active: 0, "in-progress": 1, pending: 2, closed: 3, resolved: 3, archived: 4 };
const STATUS_COLOR = {
  open: "#00E5A0", active: "#00E5A0", "in-progress": GLD,
  pending: CY, closed: "#566878", resolved: "#566878", archived: "#3a4450",
};

function statusRank(s) {
  const key = (s || "").toLowerCase().replace(/_/g, "-");
  return STATUS_ORDER[key] ?? 2;
}

async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)                     ? d
    : Array.isArray(d?.data)                  ? d.data
    : Array.isArray(d?.items)                 ? d.items
    : Array.isArray(d?.investigations)        ? d.investigations
    : Array.isArray(d?.cases)                 ? d.cases
    : Array.isArray(d?.results)               ? d.results
    : [];
}

export function isInvestigationsQuery(text) {
  return INVEST_RE.test(text || "");
}

export async function buildInvestigationsScript() {
  let cases = [];
  try { cases = await fetchInvestigations(); } catch (_) {}

  if (!cases.length) return "No active investigations on record, sir.";

  const open   = cases.filter(c => statusRank(c.status) <= 1).length;
  const total  = cases.length;
  const top    = cases
    .slice(0, 2)
    .map(c => c.name || c.title || c.case_name || c.label || "Unnamed case")
    .join(" and ");

  return (
    `Intelligence graph shows ${total} investigation${total !== 1 ? "s" : ""}, ` +
    `${open} currently open. ` +
    (top ? `Active cases include ${top}.` : "")
  ).trim();
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

export default function InvestigationsList() {
  const [open,      setOpen]      = useState(false);
  const [cases,     setCases]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [filter,    setFilter]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const arr = await fetchInvestigations();
      arr.sort((a, b) => statusRank(a.status) - statusRank(b.status));
      setCases(arr);
      setLastFetch(new Date());
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (INVEST_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const visible = filter.trim()
    ? cases.filter(c => {
        const hay = [
          c.name, c.title, c.case_name, c.label, c.status,
          c.priority, c.description, c.summary, c.lead, c.assignee,
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(filter.toLowerCase());
      })
    : cases;

  const openCount = cases.filter(c => statusRank(c.status) <= 1).length;

  return (
    <>
      {/* Toggle button — bottom-left strip, after DATA */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Investigations"
        style={{
          position: "fixed", left: 388, bottom: 18, zIndex: 68,
          background: open ? PRP + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${PRP}55`,
          borderRadius: 8,
          color: open ? "#04060A" : PRP,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${PRP}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>⌖</span>
        INTEL
        {openCount > 0 && (
          <span style={{
            background: PRP + "44", color: PRP,
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
          width: "min(440px,93vw)", maxHeight: "min(580px,76vh)",
          background: "rgba(4,8,14,0.94)",
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
              animation: loading ? "invpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: PRP, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              INVESTIGATIONS — OPEN CASES
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "SYNCING" : lastFetch ? `↻ ${fmtAge(lastFetch)}` : "—"}
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
                <span style={{ fontSize: 9, color: "#00E5A0", letterSpacing: 1 }}>
                  {openCount} OPEN
                </span>
              )}
              <span style={{ fontSize: 9, color: "#566878", letterSpacing: 1 }}>
                {cases.length - openCount} CLOSED
              </span>
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
                background: `rgba(192,112,255,0.06)`, border: `1px solid ${PRP}33`,
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
              const name     = c.name || c.title || c.case_name || c.label || `Case ${i + 1}`;
              const status   = c.status || c.state || "unknown";
              const priority = c.priority || c.severity || "";
              const desc     = c.description || c.summary || c.notes || "";
              const lead     = c.lead || c.assignee || c.owner || c.analyst || "";
              const ts       = c.updated_at || c.last_updated || c.created_at || c.opened_at;
              const sColor   = STATUS_COLOR[(status || "").toLowerCase().replace(/_/g, "-")] || "#566878";
              const isOpen   = statusRank(status) <= 1;

              return (
                <div key={c.id || c.case_id || i} style={{
                  margin: "6px 10px",
                  background: isOpen ? `${PRP}08` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? PRP + "28" : "#2a3040"}`,
                  borderRadius: 8, padding: "9px 12px",
                }}>
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 8, color: sColor, background: sColor + "22",
                      border: `1px solid ${sColor}44`, borderRadius: 3,
                      padding: "1px 6px", letterSpacing: 1, fontWeight: 700, textTransform: "uppercase",
                      flexShrink: 0,
                    }}>
                      {status}
                    </span>
                    <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", fontWeight: 700, letterSpacing: 0.5 }}>
                      {name}
                    </span>
                    {priority && (
                      <span style={{
                        fontSize: 8, color: GLD, background: `${GLD}18`,
                        borderRadius: 4, padding: "1px 5px", letterSpacing: 0.5, fontWeight: 700,
                        textTransform: "uppercase", flexShrink: 0,
                      }}>
                        {priority}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {desc && (
                    <p style={{
                      margin: "0 0 5px", fontSize: 9, color: "#8ba3b8",
                      lineHeight: 1.5, letterSpacing: 0.3,
                    }}>
                      {desc.length > 130 ? desc.slice(0, 130) + "…" : desc}
                    </p>
                  )}

                  {/* Meta row */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {lead && (
                      <span style={{
                        fontSize: 8, color: CY + "aa", letterSpacing: 0.8,
                        border: `1px solid ${CY}33`, borderRadius: 3, padding: "1px 5px",
                      }}>
                        ⚑ {lead}
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
        @keyframes invpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
