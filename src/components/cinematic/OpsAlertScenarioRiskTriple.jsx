/**
 * F740 — Ops Alerts × Scenario × Risk Signal Triple Nexus (OALSCNRSK)
 * Endpoints: /v1/ops/alerts  ×  /v1/scenario/list  ×  /entities/RiskSignal
 * Classification: FULLY_MITIGATED | SCRIPTED_ONLY | RISK_BACKED | UNMITIGATED
 * Shows whether each alert has a matching playbook scenario AND a backing risk signal.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const PR  = "#B47FFF";
const DIM = "#8899AA";

const BTN_LEFT = 908980;
const POLL_MS  = 90_000;

const OALSCNRSK_RE =
  /\b(oalscnrsk|ops\s*alert\s*scenario\s*risk|alert\s*mitigation|scripted\s*alerts?|unmitigated\s*alerts?|alert\s*playbook|scenario\s*alert\s*risk|alert\s*triple\s*mitigation|mitigation\s*coverage|alert\s*scenario\s*coverage)\b/i;

export function isOalscnrskQuery(t) {
  return OALSCNRSK_RE.test(t || "");
}

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

function normaliseAlerts(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw?.alerts)  return raw.alerts;
  if (raw?.data)    return raw.data;
  if (raw?.items)   return raw.items;
  return [];
}

function normaliseScenarios(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw?.scenarios) return raw.scenarios;
  if (raw?.data)      return raw.data;
  if (raw?.items)     return raw.items;
  return [];
}

function normaliseRisks(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw?.signals) return raw.signals;
  if (raw?.data)    return raw.data;
  if (raw?.items)   return raw.items;
  return [];
}

function keywords(obj) {
  return [
    obj.title, obj.name, obj.message, obj.description,
    obj.type, obj.category, obj.tags, obj.summary,
    obj.severity, obj.source, obj.kind, obj.topic,
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function bestMatch(alertKw, collection) {
  let best = { score: 0, item: null };
  for (const item of collection) {
    const score = alertKw
      .split(/\s+/)
      .filter(w => w.length > 3 && keywords(item).includes(w)).length;
    if (score > best.score) best = { score, item };
  }
  return best;
}

function buildNexus(alerts, scenarios, risks) {
  return alerts.map(alert => {
    const aKw       = keywords(alert);
    const scenMatch = bestMatch(aKw, scenarios);
    const riskMatch = bestMatch(aKw, risks);
    const hasScen   = scenMatch.score > 0;
    const hasRisk   = riskMatch.score > 0;
    const status =
      hasScen && hasRisk ? "FULLY_MITIGATED" :
      hasScen            ? "SCRIPTED_ONLY"   :
      hasRisk            ? "RISK_BACKED"     :
                           "UNMITIGATED";
    return {
      alert,
      matchedScenario : hasScen ? scenMatch.item : null,
      scenHits        : scenMatch.score,
      matchedRisk     : hasRisk ? riskMatch.item : null,
      riskHits        : riskMatch.score,
      status,
    };
  });
}

async function fetchAll() {
  const base = apiBase();
  const [alertsRes, scenariosRes, risksRes] = await Promise.all([
    fetch(`${base}/v1/ops/alerts`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/v1/scenario/list`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/entities/RiskSignal`).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);
  return {
    alerts    : normaliseAlerts(alertsRes),
    scenarios : normaliseScenarios(scenariosRes),
    risks     : normaliseRisks(risksRes),
  };
}

export async function buildOalscnrskScript() {
  try {
    const { alerts, scenarios, risks } = await fetchAll();
    const nexus = buildNexus(alerts, scenarios, risks);
    const counts = {
      FULLY_MITIGATED : nexus.filter(r => r.status === "FULLY_MITIGATED").length,
      SCRIPTED_ONLY   : nexus.filter(r => r.status === "SCRIPTED_ONLY").length,
      RISK_BACKED     : nexus.filter(r => r.status === "RISK_BACKED").length,
      UNMITIGATED     : nexus.filter(r => r.status === "UNMITIGATED").length,
    };
    const unmitigated = nexus
      .filter(r => r.status === "UNMITIGATED")
      .slice(0, 3)
      .map(r => r.alert.title || r.alert.name || r.alert.message || "Unnamed")
      .join("; ");
    return (
      `Ops Alert Mitigation Triple: ${alerts.length} alerts cross-referenced against ` +
      `${scenarios.length} scenarios and ${risks.length} risk signals. ` +
      `${counts.FULLY_MITIGATED} fully mitigated (playbook + risk signal). ` +
      `${counts.SCRIPTED_ONLY} scripted only (no risk signal). ` +
      `${counts.RISK_BACKED} risk-backed only (no playbook). ` +
      `${counts.UNMITIGATED} unmitigated with no coverage${unmitigated ? `: ${unmitigated}` : ""}. ` +
      `Mitigation gap requires immediate attention.`
    );
  } catch {
    return "Ops Alert Scenario Risk Triple data unavailable.";
  }
}

const STATUS_META = {
  FULLY_MITIGATED : { label: "FULLY MITIGATED", col: GN  },
  SCRIPTED_ONLY   : { label: "SCRIPTED ONLY",   col: CY  },
  RISK_BACKED     : { label: "RISK BACKED",      col: AM  },
  UNMITIGATED     : { label: "UNMITIGATED",      col: RD  },
};

export default function OpsAlertScenarioRiskTriple() {
  const [open,    setOpen]    = useState(false);
  const [rows,    setRows]    = useState([]);
  const [counts,  setCounts]  = useState({ FULLY_MITIGATED:0, SCRIPTED_ONLY:0, RISK_BACKED:0, UNMITIGATED:0 });
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);
  const [filter,  setFilter]  = useState("ALL");
  const [search,  setSearch]  = useState("");
  const [expanded, setExpanded] = useState({});
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { alerts, scenarios, risks } = await fetchAll();
      const nexus = buildNexus(alerts, scenarios, risks);
      setRows(nexus);
      setCounts({
        FULLY_MITIGATED : nexus.filter(r => r.status === "FULLY_MITIGATED").length,
        SCRIPTED_ONLY   : nexus.filter(r => r.status === "SCRIPTED_ONLY").length,
        RISK_BACKED     : nexus.filter(r => r.status === "RISK_BACKED").length,
        UNMITIGATED     : nexus.filter(r => r.status === "UNMITIGATED").length,
      });
    } catch (e) {
      setErr(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:oalscnrsk-toggle", toggle);
    return () => window.removeEventListener("jarvis:oalscnrsk-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows
    .filter(r => filter === "ALL" || r.status === filter)
    .filter(r => {
      if (!search) return true;
      const q = search.toLowerCase();
      return keywords(r.alert).includes(q);
    });

  function toggleExpand(i) {
    setExpanded(ex => ({ ...ex, [i]: !ex[i] }));
  }

  async function handleAssess(row) {
    const alertTitle = row.alert.title || row.alert.name || row.alert.message || "alert";
    const scenName   = row.matchedScenario?.name || row.matchedScenario?.title || "none";
    const riskName   = row.matchedRisk?.name || row.matchedRisk?.title || "none";
    const msg =
      `Ops alert "${alertTitle}" — status: ${row.status}. ` +
      `Matched scenario: ${scenName}. Matched risk signal: ${riskName}. ` +
      `Provide a 2-sentence mitigation assessment.`;
    try {
      const base = apiBase();
      const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method  : "POST",
        headers : { "Content-Type": "application/json" },
        body    : JSON.stringify({ message: msg }),
      });
      const d   = await res.json();
      const txt = (d.answer || "").trim();
      if (txt) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch { /* silent */ }
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position    : "fixed",
          bottom      : 8,
          left        : BTN_LEFT,
          zIndex      : 599,
          background  : open ? "rgba(255,68,68,0.18)" : "rgba(20,24,32,0.82)",
          border      : `1px solid ${open ? RD : DIM}`,
          color       : open ? RD : DIM,
          borderRadius: 6,
          padding     : "3px 10px",
          fontSize    : 11,
          cursor      : "pointer",
          fontFamily  : "monospace",
          letterSpacing:"0.05em",
          whiteSpace  : "nowrap",
        }}
        title="Ops Alert × Scenario × Risk Signal Triple Nexus (F740)"
      >
        OALSCNRSK
        {counts.UNMITIGATED > 0 && (
          <span style={{
            marginLeft  : 5,
            background  : RD,
            color       : "#fff",
            borderRadius: 8,
            padding     : "0 5px",
            fontSize    : 9,
            fontWeight  : 700,
          }}>
            {counts.UNMITIGATED}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position      : "fixed",
            bottom        : 36,
            left          : BTN_LEFT,
            width         : 820,
            maxHeight     : 540,
            zIndex        : 599,
            background    : "rgba(10,13,20,0.97)",
            border        : `1px solid ${RD}`,
            borderRadius  : 10,
            boxShadow     : `0 0 32px ${RD}55`,
            display       : "flex",
            flexDirection : "column",
            overflow      : "hidden",
            fontFamily    : "monospace",
          }}
        >
          {/* Header */}
          <div style={{
            padding     : "8px 14px 6px",
            borderBottom: `1px solid ${RD}44`,
            display     : "flex",
            alignItems  : "center",
            gap         : 10,
            flexShrink  : 0,
          }}>
            <span style={{ color: RD, fontWeight: 700, fontSize: 12, letterSpacing: "0.1em" }}>
              OPS ALERT × SCENARIO × RISK SIGNAL — TRIPLE NEXUS
            </span>
            <span style={{ color: DIM, fontSize: 10, marginLeft: "auto" }}>F740</span>
            {loading && <span style={{ color: AM, fontSize: 10 }}>LOADING…</span>}
            <button
              onClick={() => setOpen(false)}
              style={{ background:"none", border:"none", color: DIM, cursor:"pointer", fontSize:14 }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display     : "flex",
            gap         : 8,
            padding     : "6px 14px",
            borderBottom: `1px solid ${RD}22`,
            flexShrink  : 0,
            flexWrap    : "wrap",
          }}>
            {Object.entries(STATUS_META).map(([k, m]) => (
              <button
                key={k}
                onClick={() => setFilter(f => f === k ? "ALL" : k)}
                style={{
                  background  : filter === k ? `${m.col}22` : "transparent",
                  border      : `1px solid ${filter === k ? m.col : DIM + "66"}`,
                  color       : filter === k ? m.col : DIM,
                  borderRadius: 4,
                  padding     : "2px 8px",
                  fontSize    : 10,
                  cursor      : "pointer",
                  fontFamily  : "monospace",
                }}
              >
                {m.label} ({counts[k]})
              </button>
            ))}
            <button
              onClick={() => setFilter("ALL")}
              style={{
                background  : filter === "ALL" ? `${RD}22` : "transparent",
                border      : `1px solid ${filter === "ALL" ? RD : DIM+"66"}`,
                color       : filter === "ALL" ? RD : DIM,
                borderRadius: 4,
                padding     : "2px 8px",
                fontSize    : 10,
                cursor      : "pointer",
                fontFamily  : "monospace",
              }}
            >
              ALL ({rows.length})
            </button>
          </div>

          {/* Search + refresh */}
          <div style={{
            display     : "flex",
            gap         : 6,
            padding     : "4px 14px",
            borderBottom: `1px solid ${RD}11`,
            flexShrink  : 0,
          }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search alerts…"
              style={{
                flex        : 1,
                background  : "rgba(255,68,68,0.06)",
                border      : `1px solid ${RD}44`,
                borderRadius: 4,
                color       : "#E8EEF6",
                fontSize    : 10,
                padding     : "3px 8px",
                fontFamily  : "monospace",
                outline     : "none",
              }}
            />
            <button
              onClick={load}
              style={{
                background  : "transparent",
                border      : `1px solid ${DIM}66`,
                color       : DIM,
                borderRadius: 4,
                padding     : "2px 8px",
                fontSize    : 10,
                cursor      : "pointer",
              }}
            >↺</button>
          </div>

          {err && (
            <div style={{ padding:"6px 14px", color: RD, fontSize:11 }}>ERROR: {err}</div>
          )}

          {/* Rows */}
          <div style={{ overflowY:"auto", flex:1, padding:"4px 0" }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize:11, padding:"12px 14px" }}>
                No alerts{filter !== "ALL" ? ` in ${filter}` : ""}.
              </div>
            )}
            {visible.map((row, i) => {
              const a    = row.alert;
              const meta = STATUS_META[row.status];
              const title = a.title || a.name || a.message || `Alert #${i + 1}`;
              const sev   = a.severity || a.priority || "";
              const src   = a.source || "";
              const exp   = expanded[i];
              return (
                <div
                  key={i}
                  style={{
                    padding     : "6px 14px",
                    borderBottom: `1px solid ${RD}11`,
                    cursor      : "pointer",
                  }}
                  onClick={() => toggleExpand(i)}
                >
                  <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                    <span style={{
                      minWidth    : 160,
                      fontSize    : 9,
                      color       : meta.col,
                      fontWeight  : 700,
                      letterSpacing:"0.06em",
                      paddingTop  : 2,
                    }}>
                      {meta.label}
                    </span>
                    <div style={{ flex:1 }}>
                      <div style={{ color:"#E8EEF6", fontSize:11, fontWeight:600 }}>
                        {title}
                        {sev && (
                          <span style={{ color: DIM, fontWeight:400, marginLeft:6, fontSize:10 }}>
                            [{sev}]
                          </span>
                        )}
                      </div>
                      {src && <div style={{ color: DIM, fontSize:10 }}>src: {src}</div>}
                      <div style={{ display:"flex", gap:6, marginTop:2, flexWrap:"wrap" }}>
                        {row.matchedScenario && (
                          <span style={{ color: CY, fontSize:9, background:`${CY}12`, borderRadius:3, padding:"1px 5px" }}>
                            SCN: {row.matchedScenario.name || row.matchedScenario.title || "Scenario"} ({row.scenHits} hits)
                          </span>
                        )}
                        {row.matchedRisk && (
                          <span style={{ color: AM, fontSize:9, background:`${AM}12`, borderRadius:3, padding:"1px 5px" }}>
                            RISK: {row.matchedRisk.name || row.matchedRisk.title || "Signal"} ({row.riskHits} hits)
                          </span>
                        )}
                        {!row.matchedScenario && !row.matchedRisk && (
                          <span style={{ color: RD, fontSize:9, background:`${RD}12`, borderRadius:3, padding:"1px 5px" }}>
                            NO MITIGATION
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{ color: DIM, fontSize:10, paddingTop:2 }}>{exp ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {exp && (
                    <div
                      style={{
                        marginTop  : 6,
                        marginLeft : 170,
                        padding    : "6px 10px",
                        background : "rgba(255,68,68,0.05)",
                        borderRadius: 6,
                        border     : `1px solid ${RD}33`,
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      {row.matchedScenario && (
                        <div style={{ marginBottom:4 }}>
                          <span style={{ color: CY, fontSize:10, fontWeight:600 }}>Scenario:</span>
                          <span style={{ color:"#E8EEF6", fontSize:10, marginLeft:6 }}>
                            {row.matchedScenario.name || row.matchedScenario.title}
                          </span>
                          {row.matchedScenario.kind && (
                            <span style={{ color: DIM, fontSize:9, marginLeft:6 }}>
                              [{row.matchedScenario.kind}]
                            </span>
                          )}
                        </div>
                      )}
                      {row.matchedRisk && (
                        <div style={{ marginBottom:4 }}>
                          <span style={{ color: AM, fontSize:10, fontWeight:600 }}>Risk Signal:</span>
                          <span style={{ color:"#E8EEF6", fontSize:10, marginLeft:6 }}>
                            {row.matchedRisk.name || row.matchedRisk.title}
                          </span>
                          {row.matchedRisk.severity && (
                            <span style={{
                              color       : row.matchedRisk.severity === "CRITICAL" ? RD :
                                            row.matchedRisk.severity === "HIGH"     ? AM : DIM,
                              fontSize    : 9,
                              marginLeft  : 6,
                            }}>
                              [{row.matchedRisk.severity}]
                            </span>
                          )}
                        </div>
                      )}
                      <button
                        onClick={() => handleAssess(row)}
                        style={{
                          marginTop   : 4,
                          background  : "transparent",
                          border      : `1px solid ${PR}`,
                          color       : PR,
                          borderRadius: 4,
                          padding     : "2px 10px",
                          fontSize    : 10,
                          cursor      : "pointer",
                          fontFamily  : "monospace",
                        }}
                      >
                        ▶ ASSESS
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding   : "4px 14px",
            borderTop : `1px solid ${RD}22`,
            color     : DIM,
            fontSize  : 9,
            flexShrink: 0,
          }}>
            /v1/ops/alerts × /v1/scenario/list × /entities/RiskSignal | poll {POLL_MS / 1000}s | F740
          </div>
        </div>
      )}
    </>
  );
}
