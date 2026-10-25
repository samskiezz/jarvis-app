/**
 * F174 Task × Dataset × Contact × Report × Ops Alert × Graph
 * Full Operational Mission Intelligence Coverage — ◈ TOCROA
 *
 * Fetches: /entities/Task + /v1/datasets + /entities/Contact
 *          + /v1/reports + /v1/ops/alerts + /v1/graph/centrality
 * Classifies each task across 4 tiers by cross-source keyword overlap:
 *   COVERED  — matched 5-6 sources
 *   STAFFED  — matched 3-4 sources
 *   MONITORED — matched 1-2 sources
 *   ADRIFT   — zero matches (no dataset, no contact, no report, no ops alert,
 *               no graph trace — full operational mission dead-ends)
 * Red pulse on ADRIFT count.
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

const CLS_COLOR = { COVERED: GREEN, STAFFED: CYAN, MONITORED: AMBER, ADRIFT: RED };
const CLS_ORDER = { COVERED: 4, STAFFED: 3, MONITORED: 2, ADRIFT: 1 };

const TOCROA_RE = /\b(tocroa|task.dataset.contact|task.report.ops|mission.coverage|operational.mission.coverage|task.graph.coverage|mission.intelligence.coverage|adrift.task|task.blind.spot|uncovered.task|task.ops.coverage|task.contact.report|task.ops.graph|mission.intel.coverage|full.mission.coverage|task.coverage.audit|task.adrift|operational.task.coverage|task.dataset.ops)\b/i;

export function isTocroacQuery(q) { return TOCROA_RE.test(q || ""); }

export function buildTocroaScript(rows) {
  const total    = rows.length;
  const covered  = rows.filter(r => r.cls === "COVERED").length;
  const adrift   = rows.filter(r => r.cls === "ADRIFT").length;
  return (
    `Full Operational Mission Intelligence Coverage: ${total} task${total !== 1 ? "s" : ""} assessed across dataset, contact, report, ops alert, and graph sources. ` +
    `${covered} fully covered (5-6 sources grounded). ` +
    (adrift > 0
      ? `${adrift} ADRIFT — no dataset backing, no assigned contact, no filed report, no ops alert, no graph trace. These are operational mission dead-ends requiring immediate grounding.`
      : "No operational dead-ends detected. All tasks have full mission intelligence coverage.")
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

function classify(sourceCount) {
  if (sourceCount >= 5) return "COVERED";
  if (sourceCount >= 3) return "STAFFED";
  if (sourceCount >= 1) return "MONITORED";
  return "ADRIFT";
}

async function loadData() {
  const [tasksRaw, datasetsRaw, contactsRaw, reportsRaw, opsRaw, graphRaw] = await Promise.all([
    fetcher("/entities/Task"),
    fetcher("/v1/datasets"),
    fetcher("/entities/Contact"),
    fetcher("/v1/reports"),
    fetcher("/v1/ops/alerts"),
    fetcher("/v1/graph/centrality"),
  ]);

  const tasks    = normalizeArray(tasksRaw,    ["name","title","task_name","description","id"]);
  const datasets = normalizeArray(datasetsRaw, ["name","title","dataset_name","id"]);
  const contacts = normalizeArray(contactsRaw, ["name","full_name","displayName","email","id"]);
  const reports  = normalizeArray(reportsRaw,  ["title","name","summary","id"]);
  const alerts   = normalizeArray(opsRaw,      ["message","title","name","description","id"]);
  const graphNodes = normalizeArray(
    Array.isArray(graphRaw?.nodes) ? graphRaw.nodes
      : Array.isArray(graphRaw?.data?.nodes) ? graphRaw.data.nodes
      : Array.isArray(graphRaw) ? graphRaw
      : [],
    ["label", "name", "id", "type"]
  );

  return tasks.map(task => {
    const tToks = tokens(task._label + " " + (task.description || "") + " " + (task.status || "") + " " + (task.tags || "").toString());

    const matchedDatasets = datasets.filter(d => overlaps(tToks, d._label + " " + (d.description || "")));
    const matchedContacts = contacts.filter(c => overlaps(tToks, c._label + " " + (c.role || "") + " " + (c.organization || c.org || "")));
    const matchedReports  = reports.filter(r => overlaps(tToks, r._label + " " + (r.summary || "") + " " + (r.category || "")));
    const matchedAlerts   = alerts.filter(a => overlaps(tToks, a._label + " " + (a.severity || "") + " " + (a.type || "")));
    const matchedGraph    = graphNodes.filter(g => overlaps(tToks, g._label + " " + (g.type || "") + " " + (g.description || "")));

    const sourceCount =
      (matchedDatasets.length > 0 ? 1 : 0) +
      (matchedContacts.length > 0 ? 1 : 0) +
      (matchedReports.length  > 0 ? 1 : 0) +
      (matchedAlerts.length   > 0 ? 1 : 0) +
      (matchedGraph.length    > 0 ? 1 : 0);

    return {
      ...task,
      cls: classify(sourceCount),
      matchedDatasets,
      matchedContacts,
      matchedReports,
      matchedAlerts,
      matchedGraph,
    };
  }).sort((a, b) => CLS_ORDER[b.cls] - CLS_ORDER[a.cls]);
}

const FILTERS = ["ALL", "COVERED", "STAFFED", "MONITORED", "ADRIFT"];
const LEFT_PX = 145800;
const Z_IDX   = 271;

export default function TaskDatasetContactReportOpsGraphCoverage() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);

  const load = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetch < 90_000) return;
    setLoading(true);
    try {
      const data = await loadData();
      setRows(data);
      setLastFetch(Date.now());
    } finally {
      setLoading(false);
    }
  }, [lastFetch]);

  useEffect(() => {
    const handler = () => { setOpen(v => { if (!v) load(true); return !v; }); };
    window.addEventListener("jarvis:tocroa-toggle", handler);
    return () => window.removeEventListener("jarvis:tocroa-toggle", handler);
  }, [load]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => load(true), 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildTocroaScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      if (r.ok) {
        const j = await r.json();
        const reply = j.response || j.message || j.reply || script;
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: reply }),
        });
      }
    } finally {
      setAssessing(false);
    }
  }, [assessing, rows]);

  const counts = {
    COVERED:   rows.filter(r => r.cls === "COVERED").length,
    STAFFED:   rows.filter(r => r.cls === "STAFFED").length,
    MONITORED: rows.filter(r => r.cls === "MONITORED").length,
    ADRIFT:    rows.filter(r => r.cls === "ADRIFT").length,
  };

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r._label || "").toLowerCase().includes(s) ||
             (r.description || "").toLowerCase().includes(s) ||
             (r.status || "").toLowerCase().includes(s);
    }
    return true;
  });

  const hasAdrift = counts.ADRIFT > 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen(v => { if (!v) load(true); return !v; }); }}
        style={{
          position: "fixed",
          bottom: 8,
          left: LEFT_PX,
          zIndex: Z_IDX,
          background: open ? `${RED}22` : "#0a1628cc",
          border: `1px solid ${hasAdrift ? RED : CYAN}55`,
          borderRadius: 7,
          color: hasAdrift ? RED : CYAN,
          cursor: "pointer",
          padding: "5px 10px",
          fontSize: 9,
          letterSpacing: 1,
          fontWeight: 700,
          fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 5,
          animation: hasAdrift ? "tocroa_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        {hasAdrift && (
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: RED, display: "inline-block",
            animation: "tocroa_pulse 1.4s ease-in-out infinite",
          }} />
        )}
        ◈ TOCROA
        {hasAdrift && (
          <span style={{
            background: `${RED}33`, color: RED,
            borderRadius: 4, padding: "1px 5px", fontSize: 8,
          }}>{counts.ADRIFT}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: 36,
          left: LEFT_PX - 340,
          zIndex: Z_IDX + 1,
          width: 440,
          maxHeight: 500,
          background: "#060e1eee",
          border: `1px solid ${RED}44`,
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          boxShadow: `0 0 32px ${RED}22`,
          backdropFilter: "blur(12px)",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px 6px",
            borderBottom: `1px solid ${RED}22`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span style={{ fontSize: 9, color: RED, fontWeight: 700, letterSpacing: 1 }}>
              ◈ TASK × DATASET × CONTACT × REPORT × OPS × GRAPH
            </span>
            <span style={{ flex: 1 }} />
            {loading && (
              <span style={{ fontSize: 8, color: DIM }}>LOADING…</span>
            )}
            <span style={{ fontSize: 8, color: DIM }}>
              {rows.length} tasks
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none",
              color: DIM, cursor: "pointer", fontSize: 12, padding: 0,
            }}>✕</button>
          </div>

          {/* Stats row */}
          <div style={{
            padding: "6px 14px",
            display: "flex",
            gap: 8,
            borderBottom: `1px solid ${RED}18`,
          }}>
            {Object.entries(counts).map(([cls, cnt]) => (
              <div key={cls} style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                flex: 1,
              }}>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: CLS_COLOR[cls],
                  animation: cls === "ADRIFT" && cnt > 0 ? "tocroa_pulse 1.4s ease-in-out infinite" : "none",
                }}>{cnt}</span>
                <span style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>{cls}</span>
              </div>
            ))}
          </div>

          {/* Filter row */}
          <div style={{
            padding: "4px 14px",
            display: "flex",
            gap: 4,
            alignItems: "center",
            borderBottom: `1px solid ${RED}12`,
            flexWrap: "wrap",
          }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background: filter === f ? `${CLS_COLOR[f] || CYAN}22` : "none",
                border: `1px solid ${filter === f ? (CLS_COLOR[f] || CYAN) : DIM}44`,
                borderRadius: 4,
                color: filter === f ? (CLS_COLOR[f] || CYAN) : DIM,
                cursor: "pointer",
                padding: "2px 6px",
                fontSize: 8,
                letterSpacing: 1,
              }}>{f}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                flex: 1,
                minWidth: 80,
                background: "#0c1a30",
                border: `1px solid ${DIM}44`,
                borderRadius: 4,
                color: "#DCEBF5",
                fontSize: 8,
                padding: "2px 6px",
                outline: "none",
                fontFamily: "'JetBrains Mono',monospace",
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px" }}>
            {visible.length === 0 && (
              <div style={{ fontSize: 9, color: DIM, textAlign: "center", padding: 16 }}>
                {loading ? "Fetching tasks…" : "No tasks match."}
              </div>
            )}
            {visible.map((task, i) => {
              const clsColor = CLS_COLOR[task.cls];
              const isExp    = expanded === i;
              return (
                <div
                  key={i}
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    marginBottom: 4,
                    background: `${clsColor}09`,
                    border: `1px solid ${clsColor}${task.cls === "ADRIFT" ? "55" : "33"}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    padding: "5px 8px",
                    animation: task.cls === "ADRIFT" ? "tocroa_pulse_card 2s ease-in-out infinite" : "none",
                  }}
                >
                  {/* Row header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontSize: 7,
                      color: clsColor,
                      background: `${clsColor}22`,
                      padding: "1px 5px",
                      borderRadius: 3,
                      letterSpacing: 1,
                      flexShrink: 0,
                    }}>{task.cls}</span>
                    <span style={{ fontSize: 9, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {task._label || task.title || task.name || "task"}
                    </span>
                    {task.status && (
                      <span style={{ fontSize: 7, color: DIM, flexShrink: 0 }}>
                        [{task.status}]
                      </span>
                    )}
                    <span style={{ fontSize: 8, color: clsColor, flexShrink: 0 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div style={{
                      marginTop: 6,
                      paddingTop: 6,
                      borderTop: `1px solid ${clsColor}22`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}>
                      {/* Datasets */}
                      {task.matchedDatasets.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: GREEN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ▶ DATASETS ({task.matchedDatasets.length})
                          </div>
                          {task.matchedDatasets.slice(0, 3).map((d, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${GREEN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: GREEN, background: `${GREEN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{typeof d.row_count === "number" ? d.row_count.toLocaleString() + "r" : "data"}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {d._label || d.name || d.title || "dataset"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Contacts */}
                      {task.matchedContacts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: CYAN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ● CONTACTS ({task.matchedContacts.length})
                          </div>
                          {task.matchedContacts.slice(0, 3).map((c, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${CYAN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {c._label || c.name || c.email || "contact"}
                              </span>
                              {(c.role || c.organization || c.org) && (
                                <span style={{ fontSize: 7, color: DIM, flexShrink: 0 }}>
                                  {(c.role || "") + (c.organization || c.org ? " · " + (c.organization || c.org) : "")}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Reports */}
                      {task.matchedReports.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: AMBER + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ◎ REPORTS ({task.matchedReports.length})
                          </div>
                          {task.matchedReports.slice(0, 3).map((r, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${AMBER}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: AMBER, background: `${AMBER}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{r.date ? new Date(r.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "rpt"}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {r._label || r.title || r.name || "report"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Ops alerts */}
                      {task.matchedAlerts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: RED + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⚡ OPS ALERTS ({task.matchedAlerts.length})
                          </div>
                          {task.matchedAlerts.slice(0, 3).map((a, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${RED}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: RED, background: `${RED}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(a.severity || a.level || "alrt").toString().toUpperCase().slice(0, 5)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {a._label || a.message || a.title || "alert"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Graph nodes */}
                      {task.matchedGraph.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: DIM + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⬡ GRAPH NODES ({task.matchedGraph.length})
                          </div>
                          {task.matchedGraph.slice(0, 3).map((g, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: "#1a2a3a33", borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: DIM, background: "#1a2a3a55",
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{typeof g.centrality === "number" ? g.centrality.toFixed(2) : (g.type || "node").slice(0, 4).toUpperCase()}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {g._label || g.label || g.name || "node"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {task.cls === "ADRIFT" &&
                        task.matchedDatasets.length === 0 &&
                        task.matchedContacts.length === 0 &&
                        task.matchedReports.length === 0 &&
                        task.matchedAlerts.length === 0 &&
                        task.matchedGraph.length === 0 && (
                        <div style={{ fontSize: 8, color: RED, padding: "4px 6px" }}>
                          ⚠ Operational mission dead-end — no dataset, no contact, no report, no ops alert, no graph trace.
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
            padding: "8px 14px",
            borderTop: `1px solid ${RED}18`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span style={{ fontSize: 8, color: DIM, flex: 1 }}>
              TASK×DS×CONT×RPT×OPS×GRAPH — 6-source
            </span>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: assessing ? `${RED}33` : `${RED}22`,
                border: `1px solid ${RED}66`,
                borderRadius: 6,
                color: RED,
                cursor: assessing ? "default" : "pointer",
                padding: "4px 12px",
                fontSize: 9,
                letterSpacing: 1,
                fontWeight: 700,
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
        @keyframes tocroa_pulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
        @keyframes tocroa_pulse_btn {
          0%,100% { box-shadow: 0 0 20px ${RED}44; }
          50% { box-shadow: 0 0 36px ${RED}bb; }
        }
        @keyframes tocroa_pulse_card {
          0%,100% { border-color: ${RED}55; }
          50% { border-color: ${RED}bb; }
        }
      `}</style>
    </>
  );
}
