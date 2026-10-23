/**
 * F135 Investment × RiskSignal × Ops Alert × SwarmJob × Investigation
 * Wealth Threat Defence Operations Matrix — ◈ IROSI
 *
 * Fetches: /entities/Investment + /entities/RiskSignal + /v1/ops/alerts
 *          + /entities/SwarmJob + /v1/investigations
 * Classifies each investment across 4 tiers based on cross-source keyword overlap:
 *   SECURED  — matched all 4 external sources (full defensive coverage)
 *   MONITORED — matched 2-3 sources
 *   FLAGGED  — matched exactly 1 source
 *   EXPOSED  — zero matches (wealth blind spot: no risk signal, no alert, no automation, no investigation)
 * Red pulse on EXPOSED count.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */

import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CYAN   = "#29E7FF";
const GREEN  = "#00FF88";
const AMBER  = "#FFB347";
const RED    = "#FF3B6B";
const DIM    = "#566878";

const CLS_COLOR = { SECURED: GREEN, MONITORED: CYAN, FLAGGED: AMBER, EXPOSED: RED };
const CLS_ORDER = { SECURED: 4, MONITORED: 3, FLAGGED: 2, EXPOSED: 1 };

const IROSI_RE = /\b(irosi|wealth.threat|wealth.defen[cs]e|wealth.ops|investment.risk|investment.ops|investment.alert|investment.swarm|investment.invest|financial.threat|financial.defen[cs]e|wealth.matrix|threat.matrix|financial.ops|wealth.investigation|investment.investigation|financial.matrix)\b/i;

export function isIrosiQuery(q) { return IROSI_RE.test(q || ""); }

export function buildIrosiScript(investments, cls) {
  const total    = investments.length;
  const exposed  = investments.filter(i => i.cls === "EXPOSED").length;
  const secured  = investments.filter(i => i.cls === "SECURED").length;
  return (
    `Wealth Threat Defence Matrix: ${total} investment${total !== 1 ? "s" : ""} assessed. ` +
    `${secured} secured across all threat vectors. ` +
    (exposed > 0
      ? `${exposed} exposed — zero defensive coverage. Immediate review recommended.`
      : "No fully-exposed assets detected.")
  );
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const bToks = new Set(tokens(bStr));
  return aToks.some(t => bToks.has(t));
}

function normalizeArray(raw, keys) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.data)    ? raw.data
    : Array.isArray(raw?.items)   ? raw.items
    : Array.isArray(raw?.results) ? raw.results
    : [];
  return arr.map(item => {
    let label = "";
    for (const k of keys) if (item[k]) { label = String(item[k]); break; }
    return { ...item, _label: label };
  });
}

async function fetcher(path) {
  try {
    const r = await fetch(`${apiBase()}${path}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    return r.ok ? r.json() : [];
  } catch { return []; }
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

function fmtValue(inv) {
  const v = inv.value || inv.amount || inv.total_value || inv.current_value;
  if (!v) return null;
  const n = parseFloat(v);
  if (Number.isNaN(n)) return String(v);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function classifyInvestment(inv, risks, alerts, swarms, investigations) {
  const toks = tokens(
    [inv._label, inv.type || "", inv.asset_class || "", inv.ticker || "", inv.sector || ""].join(" ")
  );

  const matchedRisks   = risks.filter(r => overlaps(toks, [r._label, r.category, r.signal_type].join(" ")));
  const matchedAlerts  = alerts.filter(a => overlaps(toks, [a._label, a.type, a.category].join(" ")));
  const matchedSwarms  = swarms.filter(s => overlaps(toks, [s._label, s.job_type, s.status].join(" ")));
  const matchedInvests = investigations.filter(iv => overlaps(toks, [iv._label, iv.type, iv.case_type].join(" ")));

  const matchCount = [matchedRisks, matchedAlerts, matchedSwarms, matchedInvests].filter(a => a.length > 0).length;
  const cls =
    matchCount >= 4 ? "SECURED"  :
    matchCount >= 2 ? "MONITORED" :
    matchCount === 1 ? "FLAGGED"  :
    "EXPOSED";

  return { cls, matchedRisks, matchedAlerts, matchedSwarms, matchedInvests };
}

export default function InvestmentRiskOpsSwarmInvestigationMatrix() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invRaw, riskRaw, alertRaw, swarmRaw, invstRaw] = await Promise.all([
        fetcher("/entities/Investment"),
        fetcher("/entities/RiskSignal"),
        fetcher("/v1/ops/alerts"),
        fetcher("/entities/SwarmJob"),
        fetcher("/v1/investigations"),
      ]);

      const investments   = normalizeArray(invRaw,  ["name", "ticker", "asset_name", "title"]);
      const risks         = normalizeArray(riskRaw,  ["title", "name", "signal_name"]);
      const alerts        = normalizeArray(alertRaw, ["title", "name", "message", "type"]);
      const swarms        = normalizeArray(swarmRaw, ["name", "title", "job_name", "task_name"]);
      const investigations= normalizeArray(invstRaw, ["title", "name", "case_title", "subject"]);

      const classified = investments.map(inv => ({
        ...inv,
        ...classifyInvestment(inv, risks, alerts, swarms, investigations),
      }));
      classified.sort((a, b) => (CLS_ORDER[b.cls] ?? 0) - (CLS_ORDER[a.cls] ?? 0));
      setRows(classified);
      setLastFetch(new Date());
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 90_000); return () => clearInterval(id); }, [load]);

  useEffect(() => {
    const h = () => { setOpen(v => !v); };
    window.addEventListener("jarvis:irosi-toggle", h);
    return () => window.removeEventListener("jarvis:irosi-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = buildIrosiScript(rows, filter);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `IROSI ASSESS: ${script}` }),
      });
      const d = await r.json();
      const answer = (d.answer || script).slice(0, 600);
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: answer }),
      });
    } catch (_) {
    } finally { setAssessing(false); }
  }, [rows, filter]);

  const exposedCount = rows.filter(r => r.cls === "EXPOSED").length;
  const counts = { ALL: rows.length, SECURED: 0, MONITORED: 0, FLAGGED: 0, EXPOSED: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (r._label || r.name || "").toLowerCase().includes(s) || r.cls.toLowerCase().includes(s);
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Investment × RiskSignal × Ops Alert × SwarmJob × Investigation Matrix"
        style={{
          position: "fixed", left: 123960, bottom: 8, zIndex: 232,
          background: open ? RED + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${exposedCount > 0 ? RED : "#334455"}88`,
          borderRadius: 8, color: open ? "#fff" : RED,
          cursor: "pointer", padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${RED}${open || exposedCount > 0 ? "88" : "22"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
          animation: exposedCount > 0 && !open ? "irosi_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        IROSI
        {rows.length > 0 && (
          <span style={{
            background: exposedCount > 0 ? RED : "#334455",
            color: "#fff", borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {exposedCount > 0 ? `${exposedCount}!` : rows.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 232,
          width: "min(430px,93vw)", maxHeight: "min(600px,80vh)",
          background: "rgba(4,8,16,0.95)",
          border: `1px solid ${RED}44`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(14px)",
          boxShadow: `0 0 60px ${RED}18`,
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
              animation: loading || exposedCount > 0 ? "irosi_pulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: RED, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              WEALTH THREAT DEFENCE MATRIX
            </span>
            <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
              {loading ? "SYNCING" : lastFetch ? `↻ ${fmtAge(lastFetch)}` : "—"}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: DIM,
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stat tiles */}
          {rows.length > 0 && (
            <div style={{
              padding: "8px 12px", borderBottom: `1px solid ${RED}12`,
              display: "flex", gap: 8, flexWrap: "wrap",
            }}>
              {[
                { label: "INVEST", val: counts.ALL, col: CYAN },
                { label: "SECURED", val: counts.SECURED, col: GREEN },
                { label: "MONITORED", val: counts.MONITORED, col: CYAN },
                { label: "FLAGGED", val: counts.FLAGGED, col: AMBER },
                { label: "EXPOSED", val: counts.EXPOSED, col: RED },
              ].map(({ label, val, col }) => (
                <div key={label} style={{
                  background: `${col}14`, border: `1px solid ${col}33`,
                  borderRadius: 6, padding: "3px 8px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: col }}>{val}</div>
                  <div style={{ fontSize: 7, color: col + "99", letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{
            padding: "6px 12px", borderBottom: `1px solid ${RED}12`,
            display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap",
          }}>
            {["ALL", "SECURED", "MONITORED", "FLAGGED", "EXPOSED"].map(cls => {
              const col = cls === "ALL" ? "#8ba3b8" : CLS_COLOR[cls];
              return (
                <button key={cls} onClick={() => setFilter(cls)} style={{
                  background: filter === cls ? `${col}22` : "transparent",
                  border: `1px solid ${filter === cls ? col : col + "44"}`,
                  borderRadius: 5, color: col, cursor: "pointer",
                  padding: "2px 7px", fontSize: 8, letterSpacing: 1, fontWeight: 700,
                  fontFamily: "'JetBrains Mono',monospace", transition: "all 0.15s",
                }}>
                  {cls} {counts[cls] ?? counts.ALL}
                </button>
              );
            })}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.04)",
                border: "1px solid #334455", borderRadius: 5,
                color: CYAN, fontSize: 9, padding: "3px 8px",
                fontFamily: "'JetBrains Mono',monospace", outline: "none", width: 90,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: "24px 14px", color: DIM, fontSize: 10, textAlign: "center" }}>
                {rows.length === 0 ? "No investment data." : `No ${filter} assets.`}
              </div>
            )}
            {visible.map((inv, i) => {
              const col     = CLS_COLOR[inv.cls] || CYAN;
              const name    = inv._label || inv.name || `Asset #${i + 1}`;
              const assetType = inv.type || inv.asset_class || "";
              const val     = fmtValue(inv);
              const isExp   = (expanded[i] || false);
              return (
                <div key={inv.id || i} style={{
                  margin: "5px 10px",
                  background: `${col}${inv.cls === "EXPOSED" ? "10" : "07"}`,
                  border: `1px solid ${col}${inv.cls === "EXPOSED" ? "55" : "28"}`,
                  borderRadius: 8, padding: "8px 11px",
                  animation: inv.cls === "EXPOSED" ? "irosi_pulse_card 2.4s ease-in-out infinite" : "none",
                  cursor: "pointer",
                }} onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}>
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{
                      fontSize: 8, fontWeight: 900, letterSpacing: 1, color: col,
                      background: `${col}22`, padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                      textShadow: inv.cls === "EXPOSED" ? `0 0 8px ${col}` : "none",
                    }}>{inv.cls}</span>
                    <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", fontWeight: 700 }}>
                      {name}
                    </span>
                    {assetType && (
                      <span style={{ fontSize: 8, color: col + "99", letterSpacing: 0.5 }}>{assetType}</span>
                    )}
                    {val && (
                      <span style={{
                        fontSize: 8, color: GREEN, background: `${GREEN}18`,
                        padding: "1px 5px", borderRadius: 4,
                      }}>{val}</span>
                    )}
                    <span style={{ color: DIM, fontSize: 10, marginLeft: 4 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {/* Risk signals */}
                      {inv.matchedRisks.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: RED + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⚑ RISK SIGNALS ({inv.matchedRisks.length})
                          </div>
                          {inv.matchedRisks.slice(0, 3).map((r, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${RED}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: RED, background: `${RED}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(r.severity || r.level || "risk").toUpperCase()}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {r._label || r.title || "signal"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Ops alerts */}
                      {inv.matchedAlerts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: AMBER + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⚡ OPS ALERTS ({inv.matchedAlerts.length})
                          </div>
                          {inv.matchedAlerts.slice(0, 3).map((a, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${AMBER}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: AMBER, background: `${AMBER}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(a.severity || a.level || "alert").toUpperCase()}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {a._label || a.title || "alert"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Swarm jobs */}
                      {inv.matchedSwarms.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: CYAN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ◈ SWARM JOBS ({inv.matchedSwarms.length})
                          </div>
                          {inv.matchedSwarms.slice(0, 3).map((s, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${CYAN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: CYAN, background: `${CYAN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(s.status || "job").toUpperCase()}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {s._label || s.name || "job"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Investigations */}
                      {inv.matchedInvests.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: GREEN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⬡ INVESTIGATIONS ({inv.matchedInvests.length})
                          </div>
                          {inv.matchedInvests.slice(0, 3).map((iv, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${GREEN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: GREEN, background: `${GREEN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(iv.status || "open").toUpperCase()}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {iv._label || iv.title || "case"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {inv.cls === "EXPOSED" && inv.matchedRisks.length === 0 && inv.matchedAlerts.length === 0 && inv.matchedSwarms.length === 0 && inv.matchedInvests.length === 0 && (
                        <div style={{ fontSize: 8, color: RED, padding: "4px 6px" }}>
                          ⚠ No defensive coverage — wealth blind spot.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "8px 14px", borderTop: `1px solid ${RED}18`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 8, color: DIM, flex: 1 }}>
              INVEST×RISK×OPS×SWARM×INVEST — 5-source
            </span>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: assessing ? `${RED}33` : `${RED}22`,
                border: `1px solid ${RED}66`, borderRadius: 6,
                color: RED, cursor: assessing ? "default" : "pointer",
                padding: "4px 12px", fontSize: 9, letterSpacing: 1, fontWeight: 700,
                fontFamily: "'JetBrains Mono',monospace",
                transition: "all 0.2s",
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes irosi_pulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
        @keyframes irosi_pulse_btn {
          0%,100% { box-shadow: 0 0 20px ${RED}44; }
          50% { box-shadow: 0 0 36px ${RED}bb; }
        }
        @keyframes irosi_pulse_card {
          0%,100% { border-color: ${RED}55; }
          50% { border-color: ${RED}bb; }
        }
      `}</style>
    </>
  );
}
