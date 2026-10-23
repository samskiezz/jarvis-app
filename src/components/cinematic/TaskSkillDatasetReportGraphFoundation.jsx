/**
 * F138 Task × Skill × Dataset × Report × Graph
 * Operational Execution Intelligence Foundation — ◈ TEXIF
 *
 * Fetches: /entities/Task + /v1/aip/skill + /v1/datasets
 *          + /v1/reports + /v1/graph/centrality
 * Classifies each task across 4 tiers based on cross-source keyword overlap:
 *   GROUNDED — matched all 4 external sources (fully execution-grounded task)
 *   CAPABLE  — matched 2-3 sources
 *   SOURCED  — matched exactly 1 source
 *   ADRIFT   — zero matches (no skill coverage, no dataset, no report, no graph trace)
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

const CLS_COLOR = { GROUNDED: GREEN, CAPABLE: CYAN, SOURCED: AMBER, ADRIFT: RED };
const CLS_ORDER = { GROUNDED: 4, CAPABLE: 3, SOURCED: 2, ADRIFT: 1 };

const TEXIF_RE = /\b(texif|task.execution|task.foundation|task.intel|task.grounding|task.skill|task.dataset|task.report|task.graph|execution.foundation|execution.intel|adrift.task|operational.foundation|task.intelligence.foundation)\b/i;

export function isTexifQuery(q) { return TEXIF_RE.test(q || ""); }

export function buildTexifScript(rows) {
  const total    = rows.length;
  const adrift   = rows.filter(r => r.cls === "ADRIFT").length;
  const grounded = rows.filter(r => r.cls === "GROUNDED").length;
  return (
    `Task Execution Intelligence Foundation: ${total} task${total !== 1 ? "s" : ""} assessed. ` +
    `${grounded} grounded (all 4 execution sources confirmed). ` +
    (adrift > 0
      ? `${adrift} adrift — no skill coverage, no dataset, no report, no graph trace. Operationally blind.`
      : "No adrift tasks detected.")
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

function classifyTask(task, skills, datasets, reports, graphNodes) {
  const toks = tokens(
    [task._label, task.name, task.title, task.type, task.category, task.description].join(" ")
  );

  const matchedSkills = skills.filter(s =>
    overlaps(toks, [s._label, s.name, s.skill_name, s.category, s.description].join(" "))
  );
  const matchedDatasets = datasets.filter(d =>
    overlaps(toks, [d._label, d.name, d.dataset_name, d.type, d.category].join(" "))
  );
  const matchedReports = reports.filter(r =>
    overlaps(toks, [r._label, r.name, r.title, r.type, r.category].join(" "))
  );
  const matchedNodes = graphNodes.filter(n =>
    overlaps(toks, [n._label, n.label, n.name, n.type, n.category].join(" "))
  );

  const matchCount = [matchedSkills, matchedDatasets, matchedReports, matchedNodes]
    .filter(a => a.length > 0).length;
  const cls =
    matchCount >= 4 ? "GROUNDED" :
    matchCount >= 2 ? "CAPABLE"  :
    matchCount === 1 ? "SOURCED" :
    "ADRIFT";

  return { cls, matchedSkills, matchedDatasets, matchedReports, matchedNodes };
}

export default function TaskSkillDatasetReportGraphFoundation() {
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
      const [taskRaw, skillRaw, dsRaw, repRaw, graphRaw] = await Promise.all([
        fetcher("/entities/Task"),
        fetcher("/v1/aip/skill"),
        fetcher("/v1/datasets"),
        fetcher("/v1/reports"),
        fetcher("/v1/graph/centrality"),
      ]);

      const tasks      = normalizeArray(taskRaw,  ["name", "title", "task_name"]);
      const skills     = normalizeArray(skillRaw, ["name", "skill_name", "title"]);
      const datasets   = normalizeArray(dsRaw,    ["name", "dataset_name", "title"]);
      const reports    = normalizeArray(repRaw,   ["name", "title", "report_name"]);
      const graphNodes = normalizeArray(graphRaw, ["label", "name", "id"]);

      const classified = tasks.map(t => ({
        ...t,
        ...classifyTask(t, skills, datasets, reports, graphNodes),
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
    window.addEventListener("jarvis:texif-toggle", h);
    return () => window.removeEventListener("jarvis:texif-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = buildTexifScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `TEXIF ASSESS: ${script}` }),
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

  const adriftCount = rows.filter(r => r.cls === "ADRIFT").length;
  const counts = { ALL: rows.length, GROUNDED: 0, CAPABLE: 0, SOURCED: 0, ADRIFT: 0 };
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
        title="Task × Skill × Dataset × Report × Graph — Operational Execution Intelligence Foundation"
        style={{
          position: "fixed", left: 125640, bottom: 8, zIndex: 235,
          background: open ? RED + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${adriftCount > 0 ? RED : "#334455"}88`,
          borderRadius: 8, color: open ? "#fff" : RED,
          cursor: "pointer", padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${RED}${open || adriftCount > 0 ? "88" : "22"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
          animation: adriftCount > 0 && !open ? "texif_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        TEXIF
        {rows.length > 0 && (
          <span style={{
            background: adriftCount > 0 ? RED : "#334455",
            color: "#fff", borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {adriftCount > 0 ? `${adriftCount}!` : rows.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 235,
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
              animation: loading || adriftCount > 0 ? "texif_pulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: RED, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              EXECUTION INTELLIGENCE FOUNDATION
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
                { label: "TASKS",    val: counts.ALL,      col: CYAN  },
                { label: "GROUNDED", val: counts.GROUNDED, col: GREEN },
                { label: "CAPABLE",  val: counts.CAPABLE,  col: CYAN  },
                { label: "SOURCED",  val: counts.SOURCED,  col: AMBER },
                { label: "ADRIFT",   val: counts.ADRIFT,   col: RED   },
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
            {["ALL", "GROUNDED", "CAPABLE", "SOURCED", "ADRIFT"].map(cls => {
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
                {rows.length === 0 ? "No task data." : `No ${filter} tasks.`}
              </div>
            )}
            {visible.map((task, i) => {
              const col      = CLS_COLOR[task.cls] || CYAN;
              const name     = task._label || task.name || `Task #${i + 1}`;
              const taskType = task.type || task.status || task.category || "";
              const isExp    = (expanded[i] || false);
              return (
                <div key={task.id || i} style={{
                  margin: "5px 10px",
                  background: `${col}${task.cls === "ADRIFT" ? "10" : "07"}`,
                  border: `1px solid ${col}${task.cls === "ADRIFT" ? "55" : "28"}`,
                  borderRadius: 8, padding: "8px 11px",
                  animation: task.cls === "ADRIFT" ? "texif_pulse_card 2.4s ease-in-out infinite" : "none",
                  cursor: "pointer",
                }} onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}>
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{
                      fontSize: 8, fontWeight: 900, letterSpacing: 1, color: col,
                      background: `${col}22`, padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                      textShadow: task.cls === "ADRIFT" ? `0 0 8px ${col}` : "none",
                    }}>{task.cls}</span>
                    <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", fontWeight: 700 }}>
                      {name}
                    </span>
                    {taskType && (
                      <span style={{ fontSize: 8, color: col + "99", letterSpacing: 0.5 }}>
                        {String(taskType).toUpperCase().slice(0, 12)}
                      </span>
                    )}
                    <span style={{ color: DIM, fontSize: 10, marginLeft: 4 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {/* Skills */}
                      {task.matchedSkills.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: GREEN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⚡ SKILLS ({task.matchedSkills.length})
                          </div>
                          {task.matchedSkills.slice(0, 3).map((s, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${GREEN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: GREEN, background: `${GREEN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>
                                {s.score != null
                                  ? `★ ${Number(s.score).toFixed(2)}`
                                  : (s.category || "skill").toUpperCase().slice(0, 8)}
                              </span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {s._label || s.name || s.skill_name || "skill"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Datasets */}
                      {task.matchedDatasets.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: CYAN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ◉ DATASETS ({task.matchedDatasets.length})
                          </div>
                          {task.matchedDatasets.slice(0, 3).map((d, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${CYAN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: CYAN, background: `${CYAN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>
                                {d.row_count != null
                                  ? `${Number(d.row_count).toLocaleString()}r`
                                  : (d.type || "ds").toUpperCase().slice(0, 8)}
                              </span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {d._label || d.name || d.dataset_name || "dataset"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Reports */}
                      {task.matchedReports.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: AMBER + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ▶ REPORTS ({task.matchedReports.length})
                          </div>
                          {task.matchedReports.slice(0, 3).map((r, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${AMBER}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: AMBER, background: `${AMBER}22`,
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
                      {/* Graph nodes */}
                      {task.matchedNodes.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: RED + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⬡ GRAPH NODES ({task.matchedNodes.length})
                          </div>
                          {task.matchedNodes.slice(0, 3).map((n, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${RED}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: RED, background: `${RED}22`,
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
                      {task.cls === "ADRIFT" &&
                        task.matchedSkills.length === 0 &&
                        task.matchedDatasets.length === 0 &&
                        task.matchedReports.length === 0 &&
                        task.matchedNodes.length === 0 && (
                        <div style={{ fontSize: 8, color: RED, padding: "4px 6px" }}>
                          ⚠ Adrift task — no skill coverage, dataset, report, or graph trace.
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
              TASK×SKILL×DS×REP×GRAPH — 5-source
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
        @keyframes texif_pulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
        @keyframes texif_pulse_btn {
          0%,100% { box-shadow: 0 0 20px ${RED}44; }
          50% { box-shadow: 0 0 36px ${RED}bb; }
        }
        @keyframes texif_pulse_card {
          0%,100% { border-color: ${RED}55; }
          50% { border-color: ${RED}bb; }
        }
      `}</style>
    </>
  );
}
