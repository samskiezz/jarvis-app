/**
 * F137 Scenario × Graph × Report × Ops Alert × Contact
 * Strategic Operations Coverage — ◈ SGROCOV
 *
 * Fetches: /v1/scenario/list + /v1/graph/centrality + /v1/reports
 *          + /v1/ops/alerts + /entities/Contact
 * Classifies each scenario across 4 tiers based on cross-source keyword overlap:
 *   COMMANDING — matched all 4 external sources (fully grounded scenario)
 *   ACTIVE     — matched 2-3 sources
 *   MONITORED  — matched exactly 1 source
 *   SHADOW     — zero matches (strategically ungrounded: no graph trace, no report,
 *                no ops alert, no contact owner)
 * Red pulse on SHADOW count.
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

const CLS_COLOR = { COMMANDING: GREEN, ACTIVE: CYAN, MONITORED: AMBER, SHADOW: RED };
const CLS_ORDER = { COMMANDING: 4, ACTIVE: 3, MONITORED: 2, SHADOW: 1 };

const SGROCOV_RE = /\b(sgrocov|scenario.graph|scenario.report|scenario.ops|scenario.alert|scenario.contact|scenario.coverage|strategic.coverage|strategic.ops|scenario.command|scenario.shadow|ungrounded.scenario|scenario.footprint)\b/i;

export function isSgrocovQuery(q) { return SGROCOV_RE.test(q || ""); }

export function buildSgrocovScript(rows) {
  const total      = rows.length;
  const shadow     = rows.filter(r => r.cls === "SHADOW").length;
  const commanding = rows.filter(r => r.cls === "COMMANDING").length;
  return (
    `Strategic Operations Coverage: ${total} scenario${total !== 1 ? "s" : ""} assessed. ` +
    `${commanding} commanding (all 4 external sources grounded). ` +
    (shadow > 0
      ? `${shadow} shadow — zero graph trace, report, ops alert, or contact owner. Strategically ungrounded.`
      : "No shadow scenarios detected.")
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

function fmtDate(t) {
  if (!t) return "";
  const d = new Date(typeof t === "number" ? t : Date.parse(t));
  if (Number.isNaN(d.getTime())) return String(t).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function classifyScenario(scenario, graphNodes, reports, opsAlerts, contacts) {
  const toks = tokens(
    [scenario._label, scenario.name, scenario.type, scenario.category, scenario.description].join(" ")
  );

  const matchedNodes = graphNodes.filter(n =>
    overlaps(toks, [n._label, n.label, n.name, n.type, n.category].join(" "))
  );
  const matchedReports = reports.filter(r =>
    overlaps(toks, [r._label, r.name, r.title, r.type, r.category].join(" "))
  );
  const matchedAlerts = opsAlerts.filter(a =>
    overlaps(toks, [a._label, a.name, a.message, a.type, a.category].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(toks, [c._label, c.name, c.role, c.organization, c.org].join(" "))
  );

  const matchCount = [matchedNodes, matchedReports, matchedAlerts, matchedContacts]
    .filter(a => a.length > 0).length;
  const cls =
    matchCount >= 4 ? "COMMANDING" :
    matchCount >= 2 ? "ACTIVE"     :
    matchCount === 1 ? "MONITORED" :
    "SHADOW";

  return { cls, matchedNodes, matchedReports, matchedAlerts, matchedContacts };
}

export default function ScenarioGraphReportOpsAlertContactCoverage() {
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
      const [scenRaw, graphRaw, repRaw, alertRaw, contRaw] = await Promise.all([
        fetcher("/v1/scenario/list"),
        fetcher("/v1/graph/centrality"),
        fetcher("/v1/reports"),
        fetcher("/v1/ops/alerts"),
        fetcher("/entities/Contact"),
      ]);

      const scenarios   = normalizeArray(scenRaw,  ["name", "title", "scenario_name"]);
      const graphNodes  = normalizeArray(graphRaw, ["label", "name", "id"]);
      const reports     = normalizeArray(repRaw,   ["name", "title", "report_name"]);
      const opsAlerts   = normalizeArray(alertRaw, ["name", "message", "title"]);
      const contacts    = normalizeArray(contRaw,  ["name", "full_name", "display_name"]);

      const classified = scenarios.map(s => ({
        ...s,
        ...classifyScenario(s, graphNodes, reports, opsAlerts, contacts),
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
    window.addEventListener("jarvis:sgrocov-toggle", h);
    return () => window.removeEventListener("jarvis:sgrocov-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = buildSgrocovScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `SGROCOV ASSESS: ${script}` }),
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

  const shadowCount = rows.filter(r => r.cls === "SHADOW").length;
  const counts = { ALL: rows.length, COMMANDING: 0, ACTIVE: 0, MONITORED: 0, SHADOW: 0 };
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
        title="Scenario × Graph × Report × Ops Alert × Contact — Strategic Operations Coverage"
        style={{
          position: "fixed", left: 125080, bottom: 8, zIndex: 234,
          background: open ? RED + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${shadowCount > 0 ? RED : "#334455"}88`,
          borderRadius: 8, color: open ? "#fff" : RED,
          cursor: "pointer", padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${RED}${open || shadowCount > 0 ? "88" : "22"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
          animation: shadowCount > 0 && !open ? "sgrocov_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        SGROCOV
        {rows.length > 0 && (
          <span style={{
            background: shadowCount > 0 ? RED : "#334455",
            color: "#fff", borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {shadowCount > 0 ? `${shadowCount}!` : rows.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 234,
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
              animation: loading || shadowCount > 0 ? "sgrocov_pulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: RED, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              STRATEGIC OPERATIONS COVERAGE
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
                { label: "SCENARIOS",  val: counts.ALL,        col: CYAN  },
                { label: "COMMANDING", val: counts.COMMANDING, col: GREEN },
                { label: "ACTIVE",     val: counts.ACTIVE,     col: CYAN  },
                { label: "MONITORED",  val: counts.MONITORED,  col: AMBER },
                { label: "SHADOW",     val: counts.SHADOW,     col: RED   },
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
            {["ALL", "COMMANDING", "ACTIVE", "MONITORED", "SHADOW"].map(cls => {
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
                {rows.length === 0 ? "No scenario data." : `No ${filter} scenarios.`}
              </div>
            )}
            {visible.map((scenario, i) => {
              const col     = CLS_COLOR[scenario.cls] || CYAN;
              const name    = scenario._label || scenario.name || `Scenario #${i + 1}`;
              const scnType = scenario.type || scenario.category || scenario.status || "";
              const isExp   = (expanded[i] || false);
              return (
                <div key={scenario.id || i} style={{
                  margin: "5px 10px",
                  background: `${col}${scenario.cls === "SHADOW" ? "10" : "07"}`,
                  border: `1px solid ${col}${scenario.cls === "SHADOW" ? "55" : "28"}`,
                  borderRadius: 8, padding: "8px 11px",
                  animation: scenario.cls === "SHADOW" ? "sgrocov_pulse_card 2.4s ease-in-out infinite" : "none",
                  cursor: "pointer",
                }} onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}>
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{
                      fontSize: 8, fontWeight: 900, letterSpacing: 1, color: col,
                      background: `${col}22`, padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                      textShadow: scenario.cls === "SHADOW" ? `0 0 8px ${col}` : "none",
                    }}>{scenario.cls}</span>
                    <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", fontWeight: 700 }}>
                      {name}
                    </span>
                    {scnType && (
                      <span style={{ fontSize: 8, color: col + "99", letterSpacing: 0.5 }}>
                        {String(scnType).toUpperCase().slice(0, 12)}
                      </span>
                    )}
                    <span style={{ color: DIM, fontSize: 10, marginLeft: 4 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {/* Graph nodes */}
                      {scenario.matchedNodes.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: CYAN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⬡ GRAPH NODES ({scenario.matchedNodes.length})
                          </div>
                          {scenario.matchedNodes.slice(0, 3).map((n, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${CYAN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: CYAN, background: `${CYAN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>
                                {n.centrality_score != null
                                  ? `⬡ ${Number(n.centrality_score).toFixed(3)}`
                                  : (n.type || "node").toUpperCase().slice(0, 8)}
                              </span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {n._label || n.label || n.name || "node"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Reports */}
                      {scenario.matchedReports.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: GREEN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ▶ REPORTS ({scenario.matchedReports.length})
                          </div>
                          {scenario.matchedReports.slice(0, 3).map((r, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${GREEN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: GREEN, background: `${GREEN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>
                                {fmtDate(r.created_at || r.date || r.published_at) || (r.type || "report").toUpperCase().slice(0, 8)}
                              </span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {r._label || r.name || r.title || "report"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Ops Alerts */}
                      {scenario.matchedAlerts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: RED + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⚠ OPS ALERTS ({scenario.matchedAlerts.length})
                          </div>
                          {scenario.matchedAlerts.slice(0, 3).map((a, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${RED}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: RED, background: `${RED}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>
                                {(a.severity || a.level || "alert").toUpperCase().slice(0, 8)}
                              </span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {a._label || a.message || a.name || "alert"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Contacts */}
                      {scenario.matchedContacts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: AMBER + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ● CONTACTS ({scenario.matchedContacts.length})
                          </div>
                          {scenario.matchedContacts.slice(0, 3).map((c, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${AMBER}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: AMBER, background: `${AMBER}22`,
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
                      {scenario.cls === "SHADOW" &&
                        scenario.matchedNodes.length === 0 &&
                        scenario.matchedReports.length === 0 &&
                        scenario.matchedAlerts.length === 0 &&
                        scenario.matchedContacts.length === 0 && (
                        <div style={{ fontSize: 8, color: RED, padding: "4px 6px" }}>
                          ⚠ Shadow scenario — no graph trace, report, ops alert or contact owner.
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
              SCEN×GRAPH×REP×OPS×CONT — 5-source
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
        @keyframes sgrocov_pulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
        @keyframes sgrocov_pulse_btn {
          0%,100% { box-shadow: 0 0 20px ${RED}44; }
          50% { box-shadow: 0 0 36px ${RED}bb; }
        }
        @keyframes sgrocov_pulse_card {
          0%,100% { border-color: ${RED}55; }
          50% { border-color: ${RED}bb; }
        }
      `}</style>
    </>
  );
}
