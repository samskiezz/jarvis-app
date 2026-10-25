/**
 * F171 Graph × RiskSignal × Task × Contact × Scenario × Ops Alert
 * Full Operational Threat Response Coverage Network — ◈ GRTCSA
 *
 * Fetches: /v1/graph/centrality + /entities/RiskSignal + /entities/Task
 *          + /entities/Contact + /v1/scenario/list + /v1/ops/alerts
 * Classifies each graph node across 4 tiers by cross-source keyword overlap:
 *   FORTIFIED — matched 5-6 sources (maximum operational coverage)
 *   COVERED   — matched 3-4 sources
 *   PARTIAL   — matched 1-2 sources
 *   BLIND     — zero matches (graph node with no threat signal, no task,
 *               no contact owner, no scenario playbook, no ops alert — full blind spot)
 * Red pulse on BLIND count.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */

import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CYAN  = "#29E7FF";
const GREEN = "#00FF88";
const AMBER = "#FFB347";
const RED   = "#FF3B6B";
const DIM   = "#566878";

const CLS_COLOR = { FORTIFIED: GREEN, COVERED: CYAN, PARTIAL: AMBER, BLIND: RED };
const CLS_ORDER = { FORTIFIED: 4, COVERED: 3, PARTIAL: 2, BLIND: 1 };

const GRTCSA_RE = /\b(grtcsa|graph.risk.task|graph.contact.scenario|graph.ops.alert|operational.threat.coverage|threat.response.coverage|threat.response.network|full.threat.response|ops.threat.coverage|blind.graph|graph.blind.spot|graph.threat.blind|threat.operational.coverage|ops.threat.network|fortified.node|graph.ops.coverage)\b/i;

export function isGrtcsaQuery(q) { return GRTCSA_RE.test(q || ""); }

export function buildGrtcsaScript(rows) {
  const total     = rows.length;
  const blind     = rows.filter(r => r.cls === "BLIND").length;
  const fortified = rows.filter(r => r.cls === "FORTIFIED").length;
  return (
    `Operational Threat Response Coverage Network: ${total} graph node${total !== 1 ? "s" : ""} assessed across risk signal, task, contact, scenario, and ops alert sources. ` +
    `${fortified} fully fortified (5-6 sources grounded). ` +
    (blind > 0
      ? `${blind} BLIND — no risk signal, no task, no contact owner, no scenario playbook, no ops alert. These are full operational blind spots requiring immediate attention.`
      : "No operational blind spots detected.")
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
    : Array.isArray(raw?.nodes)   ? raw.nodes
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

function classifyNode(node, risks, tasks, contacts, scenarios, opsAlerts) {
  const toks = tokens(
    [node._label, node.name, node.type, node.category, node.label].join(" ")
  );

  const matchedRisks = risks.filter(r =>
    overlaps(toks, [r._label, r.name, r.type, r.category, r.description].join(" "))
  );
  const matchedTasks = tasks.filter(t =>
    overlaps(toks, [t._label, t.name, t.title, t.description, t.type].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(toks, [c._label, c.name, c.role, c.organization, c.org].join(" "))
  );
  const matchedScenarios = scenarios.filter(s =>
    overlaps(toks, [s._label, s.name, s.title, s.description, s.type].join(" "))
  );
  const matchedOpsAlerts = opsAlerts.filter(a =>
    overlaps(toks, [a._label, a.name, a.title, a.type, a.severity, a.message].join(" "))
  );

  const matchCount = [matchedRisks, matchedTasks, matchedContacts, matchedScenarios, matchedOpsAlerts]
    .filter(a => a.length > 0).length;
  const cls =
    matchCount >= 5 ? "FORTIFIED" :
    matchCount >= 3 ? "COVERED"   :
    matchCount >= 1 ? "PARTIAL"   :
    "BLIND";

  return { cls, matchedRisks, matchedTasks, matchedContacts, matchedScenarios, matchedOpsAlerts };
}

export default function GraphRiskTaskContactScenarioOpsNetwork() {
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
      const [graphRaw, riskRaw, taskRaw, contRaw, scenRaw, opsRaw] = await Promise.all([
        fetcher("/v1/graph/centrality"),
        fetcher("/entities/RiskSignal"),
        fetcher("/entities/Task"),
        fetcher("/entities/Contact"),
        fetcher("/v1/scenario/list"),
        fetcher("/v1/ops/alerts"),
      ]);

      const nodes     = normalizeArray(graphRaw, ["name", "label", "id", "entity"]);
      const risks     = normalizeArray(riskRaw,  ["name", "title", "signal_name", "id"]);
      const tasks     = normalizeArray(taskRaw,  ["name", "title", "task_name", "id"]);
      const contacts  = normalizeArray(contRaw,  ["name", "full_name", "display_name"]);
      const scenarios = normalizeArray(scenRaw,  ["name", "title", "scenario_name"]);
      const opsAlerts = normalizeArray(opsRaw,   ["name", "title", "message", "type"]);

      const classified = nodes.map(n => ({
        ...n,
        ...classifyNode(n, risks, tasks, contacts, scenarios, opsAlerts),
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
    window.addEventListener("jarvis:grtcsa-toggle", h);
    return () => window.removeEventListener("jarvis:grtcsa-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = buildGrtcsaScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `GRTCSA ASSESS: ${script}` }),
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
  }, [rows]);

  const blindCount = rows.filter(r => r.cls === "BLIND").length;
  const counts = { ALL: rows.length, FORTIFIED: 0, COVERED: 0, PARTIAL: 0, BLIND: 0 };
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
        title="Graph × RiskSignal × Task × Contact × Scenario × Ops Alert — Full Operational Threat Response Coverage Network"
        style={{
          position: "fixed", left: 144120, bottom: 8, zIndex: 268,
          background: open ? RED + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${blindCount > 0 ? RED : "#334455"}88`,
          borderRadius: 8, color: open ? "#fff" : RED,
          cursor: "pointer", padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${RED}${open || blindCount > 0 ? "88" : "22"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
          animation: blindCount > 0 && !open ? "grtcsa_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        GRTCSA
        {rows.length > 0 && (
          <span style={{
            background: blindCount > 0 ? RED : "#334455",
            color: "#fff", borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {blindCount > 0 ? `${blindCount}!` : rows.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 268,
          width: "min(440px,94vw)", maxHeight: "min(610px,82vh)",
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
              animation: loading || blindCount > 0 ? "grtcsa_pulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: RED, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              OPERATIONAL THREAT RESPONSE COVERAGE
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
                { label: "NODES",     val: counts.ALL,       col: CYAN  },
                { label: "FORTIFIED", val: counts.FORTIFIED, col: GREEN },
                { label: "COVERED",   val: counts.COVERED,   col: CYAN  },
                { label: "PARTIAL",   val: counts.PARTIAL,   col: AMBER },
                { label: "BLIND",     val: counts.BLIND,     col: RED   },
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
            {["ALL", "FORTIFIED", "COVERED", "PARTIAL", "BLIND"].map(cls => {
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
                {rows.length === 0 ? "No graph node data." : `No ${filter} nodes.`}
              </div>
            )}
            {visible.map((node, i) => {
              const col   = CLS_COLOR[node.cls] || CYAN;
              const name  = node._label || node.name || `Node #${i + 1}`;
              const score = node.centrality_score != null
                ? `c:${Number(node.centrality_score).toFixed(3)}`
                : (node.type || "");
              const isExp = (expanded[i] || false);
              return (
                <div key={node.id || i} style={{
                  margin: "5px 10px",
                  background: `${col}${node.cls === "BLIND" ? "10" : "07"}`,
                  border: `1px solid ${col}${node.cls === "BLIND" ? "55" : "28"}`,
                  borderRadius: 8, padding: "8px 11px",
                  animation: node.cls === "BLIND" ? "grtcsa_pulse_card 2.4s ease-in-out infinite" : "none",
                  cursor: "pointer",
                }} onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}>
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{
                      fontSize: 8, fontWeight: 900, letterSpacing: 1, color: col,
                      background: `${col}22`, padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                      textShadow: node.cls === "BLIND" ? `0 0 8px ${col}` : "none",
                    }}>{node.cls}</span>
                    <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", fontWeight: 700 }}>
                      {name}
                    </span>
                    {score && (
                      <span style={{
                        fontSize: 8, color: col + "99",
                        background: `${col}18`, padding: "1px 5px", borderRadius: 4,
                      }}>{String(score).toUpperCase().slice(0, 12)}</span>
                    )}
                    <span style={{ color: DIM, fontSize: 10, marginLeft: 4 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {/* Risk Signals */}
                      {node.matchedRisks.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: RED + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⚡ RISK SIGNALS ({node.matchedRisks.length})
                          </div>
                          {node.matchedRisks.slice(0, 3).map((r, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${RED}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: RED, background: `${RED}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(r.severity || r.level || r.type || "risk").toUpperCase().slice(0, 8)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {r._label || r.name || "signal"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Tasks */}
                      {node.matchedTasks.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: CYAN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ◧ TASKS ({node.matchedTasks.length})
                          </div>
                          {node.matchedTasks.slice(0, 3).map((t, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${CYAN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: CYAN, background: `${CYAN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(t.status || t.state || "task").toUpperCase().slice(0, 8)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {t._label || t.name || t.title || "task"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Contacts */}
                      {node.matchedContacts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: GREEN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ● CONTACTS ({node.matchedContacts.length})
                          </div>
                          {node.matchedContacts.slice(0, 3).map((c, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${GREEN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: GREEN, background: `${GREEN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0, maxWidth: 60,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>{(c.role || c.organization || c.org || "contact").toUpperCase().slice(0, 12)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {c._label || c.name || "contact"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Scenarios */}
                      {node.matchedScenarios.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: AMBER + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ▷ SCENARIOS ({node.matchedScenarios.length})
                          </div>
                          {node.matchedScenarios.slice(0, 3).map((s, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${AMBER}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: AMBER, background: `${AMBER}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(s.status || s.state || "scen").toUpperCase().slice(0, 8)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {s._label || s.name || s.title || "scenario"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Ops Alerts */}
                      {node.matchedOpsAlerts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: RED + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⚠ OPS ALERTS ({node.matchedOpsAlerts.length})
                          </div>
                          {node.matchedOpsAlerts.slice(0, 3).map((a, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${RED}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: RED, background: `${RED}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(a.severity || a.level || "alert").toUpperCase().slice(0, 8)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {a._label || a.name || a.title || a.message || "alert"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {node.cls === "BLIND" &&
                        node.matchedRisks.length === 0 &&
                        node.matchedTasks.length === 0 &&
                        node.matchedContacts.length === 0 &&
                        node.matchedScenarios.length === 0 &&
                        node.matchedOpsAlerts.length === 0 && (
                        <div style={{ fontSize: 8, color: RED, padding: "4px 6px" }}>
                          ⚠ Full blind spot — no risk signal, task, contact, scenario, or ops alert.
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
              GRAPH×RISK×TASK×CONT×SCEN×OPS — 6-source
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
        @keyframes grtcsa_pulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
        @keyframes grtcsa_pulse_btn {
          0%,100% { box-shadow: 0 0 20px ${RED}44; }
          50% { box-shadow: 0 0 36px ${RED}bb; }
        }
        @keyframes grtcsa_pulse_card {
          0%,100% { border-color: ${RED}55; }
          50% { border-color: ${RED}bb; }
        }
      `}</style>
    </>
  );
}
