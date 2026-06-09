/**
 * RiskBoard — F09 Risk Board.
 * Floating severity-sorted card panel sourced from /entities/RiskSignal.
 * Critical signals pulse red. "JARVIS, risks" opens the board.
 * Additive only — mounted via App.jsx; intent hook imported into JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const RED = "#FF3B6B";
const OR  = "#FF8800";
const GLD = "#FFD700";
const CY  = "#29E7FF";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SEV_ORDER = { critical: 4, high: 3, medium: 2, low: 1 };
const SEV_COLOR = { critical: RED, high: OR, medium: GLD, low: CY };
const RISK_RE   = /\brisk|signal|critical|threat|hazard|vulnerab/i;

function getSev(s) {
  return (s.severity || s.level || s.risk_level || "low").toLowerCase();
}

async function fetchSignals() {
  const r = await fetch(`${apiBase()}/entities/RiskSignal`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)         ? d
    : Array.isArray(d?.data)      ? d.data
    : Array.isArray(d?.items)     ? d.items
    : Array.isArray(d?.results)   ? d.results
    : [];
}

export function isRiskQuery(text) {
  return RISK_RE.test(text || "");
}

export async function buildRiskScript() {
  let signals = [];
  try { signals = await fetchSignals(); } catch (_) {}

  if (!signals.length) return "Risk board is clear, sir. No active risk signals detected.";

  const critical = signals.filter(s => getSev(s) === "critical");
  const high     = signals.filter(s => getSev(s) === "high");

  let script = `Risk board: ${signals.length} active signal${signals.length !== 1 ? "s" : ""}. `;
  if (critical.length > 0) {
    const names = critical.slice(0, 2)
      .map(s => s.title || s.name || s.signal_name || "unnamed signal")
      .join(", ");
    script += `${critical.length} critical: ${names}. `;
  } else {
    script += "No critical signals. ";
  }
  if (high.length > 0) script += `${high.length} high severity. `;
  return script.trim();
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

export default function RiskBoard() {
  const [open,      setOpen]      = useState(false);
  const [signals,   setSignals]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [filter,    setFilter]    = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const arr = await fetchSignals();
      arr.sort((a, b) => (SEV_ORDER[getSev(b)] ?? 0) - (SEV_ORDER[getSev(a)] ?? 0));
      setSignals(arr);
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
      if (RISK_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const criticalCount = signals.filter(s => getSev(s) === "critical").length;
  const filtered = filter === "all"
    ? signals
    : signals.filter(s => getSev(s) === filter);

  return (
    <>
      {/* Toggle button — bottom-left, after INCIDENTS button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Risk Board"
        style={{
          position: "fixed", left: 152, bottom: 18, zIndex: 68,
          background: open ? RED + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${criticalCount > 0 ? RED : "#992244"}88`,
          borderRadius: 8,
          color: open ? "#fff" : RED,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${RED}${open || criticalCount > 0 ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
          animation: criticalCount > 0 && !open ? "rbpulsebtn 2s ease-in-out infinite" : "none",
        }}
      >
        <span style={{ fontSize: 13 }}>⚠</span>
        RISKS
        {signals.length > 0 && (
          <span style={{
            background: criticalCount > 0 ? RED : "#992244",
            color: "#fff", borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {criticalCount > 0 ? `${criticalCount}!` : signals.length}
          </span>
        )}
      </button>

      {/* Risk board panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(390px,91vw)", maxHeight: "min(540px,74vh)",
          background: "rgba(5,9,16,0.93)",
          border: `1px solid ${RED}44`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${RED}22`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${RED}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: RED,
              boxShadow: `0 0 10px ${RED}`, display: "inline-block",
              animation: loading || criticalCount > 0 ? "rbpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: RED, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              RISK BOARD
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "SYNCING" : lastFetch ? `↻ ${fmtAge(lastFetch)}` : "—"}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Severity filter tabs */}
          <div style={{
            padding: "6px 12px", borderBottom: `1px solid ${RED}18`,
            display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
          }}>
            {["all", "critical", "high", "medium", "low"].map(sev => {
              const cnt = sev === "all"
                ? signals.length
                : signals.filter(s => getSev(s) === sev).length;
              const col = sev === "all" ? "#8ba3b8" : (SEV_COLOR[sev] || CY);
              return (
                <button key={sev} onClick={() => setFilter(sev)} style={{
                  background: filter === sev ? `${col}22` : "transparent",
                  border: `1px solid ${filter === sev ? col : col + "55"}`,
                  borderRadius: 5, color: col, cursor: "pointer",
                  padding: "2px 8px", fontSize: 9, letterSpacing: 1, fontWeight: 700,
                  fontFamily: "'JetBrains Mono',monospace", transition: "all 0.15s",
                }}>
                  {sev.toUpperCase()} {cnt}
                </button>
              );
            })}
          </div>

          {/* Signal cards */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {filtered.length === 0 && !loading && (
              <div style={{ padding: "24px 14px", color: "#566878", fontSize: 10, textAlign: "center" }}>
                {signals.length === 0 ? "No risk signals on record." : `No ${filter}-severity signals.`}
              </div>
            )}
            {filtered.map((s, i) => {
              const sev       = getSev(s);
              const col       = SEV_COLOR[sev] || CY;
              const isCrit    = sev === "critical";
              const title     = s.title || s.name || s.signal_name || "Unnamed signal";
              const desc      = s.description || s.details || s.summary || s.notes || "";
              const ts        = s.created_date || s.created_at || s.timestamp || s.updated_at;
              const category  = s.category || s.type || s.signal_type || "";
              const status    = s.status || "";
              return (
                <div key={s.id || i} style={{
                  margin: "6px 10px",
                  background: `${col}${isCrit ? "12" : "08"}`,
                  border: `1px solid ${col}${isCrit ? "55" : "30"}`,
                  borderRadius: 8, padding: "9px 12px",
                  animation: isCrit ? "rbcardpulse 2.4s ease-in-out infinite" : "none",
                }}>
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: desc ? 5 : 2 }}>
                    <span style={{
                      fontSize: 8, fontWeight: 900, letterSpacing: 1,
                      color: col, background: `${col}22`,
                      padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                      textShadow: isCrit ? `0 0 8px ${col}` : "none",
                    }}>
                      {sev.toUpperCase()}
                    </span>
                    <span style={{
                      flex: 1, fontSize: 10, color: "#DCEBF5",
                      fontWeight: 700, letterSpacing: 0.5,
                    }}>
                      {title}
                    </span>
                    {isCrit && (
                      <span style={{
                        fontSize: 11, color: RED,
                        animation: "rbpulse 1s ease-in-out infinite",
                      }}>●</span>
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
                    {category && (
                      <span style={{ fontSize: 8, color: col + "aa", letterSpacing: 0.8 }}>
                        {category}
                      </span>
                    )}
                    {status && (
                      <span style={{
                        fontSize: 8, color: "#566878",
                        border: "1px solid #334455", borderRadius: 3,
                        padding: "1px 5px", letterSpacing: 0.5,
                      }}>
                        {status}
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
        @keyframes rbpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
        @keyframes rbpulsebtn {
          0%,100% { box-shadow: 0 0 20px ${RED}44; }
          50% { box-shadow: 0 0 35px ${RED}bb; }
        }
        @keyframes rbcardpulse {
          0%,100% { border-color: ${RED}55; }
          50% { border-color: ${RED}bb; }
        }
      `}</style>
    </>
  );
}
