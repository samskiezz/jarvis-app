/**
 * F144 Task × Knowledge × Graph × RiskSignal × Ops Alert
 * Operational Threat Intelligence Depth — ◈ TKGROA
 *
 * Fetches: /entities/Task + /knowledge/ + /v1/graph/centrality
 *          + /entities/RiskSignal + /v1/ops/alerts
 * Classifies each task across 4 tiers based on cross-source keyword overlap:
 *   GROUNDED — matched all 4 external sources (knowledge article, graph trace, risk signal, ops alert)
 *   AWARE    — matched 2-3 sources
 *   PARTIAL  — matched exactly 1 source
 *   BLIND    — zero matches (tasks with no knowledge grounding, no graph trace, no risk signal, no ops alert)
 * Red pulse on BLIND count.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CYAN  = "#29E7FF";
const GREEN = "#00FF88";
const AMBER = "#FFB347";
const RED   = "#FF3B6B";
const DIM   = "#566878";

const CLS_COLOR = { GROUNDED: GREEN, AWARE: CYAN, PARTIAL: AMBER, BLIND: RED };
const CLS_ORDER = { GROUNDED: 4, AWARE: 3, PARTIAL: 2, BLIND: 1 };

const REFRESH_MS = 90_000;

const TKGROA_RE = /\b(tkgroa|task.*knowledge.*graph|task.*risk.*ops|task.*intelligence.*depth|task.*threat.*intel|task.*blind|blind.*task|task.*graph.*risk|task.*ops.*alert.*knowledge|operational.*threat.*intel|threat.*intel.*depth)\b/i;

export function isTkgroaQuery(q) { return TKGROA_RE.test(q || ""); }

export function buildTkgroaScript(rows) {
  const total    = rows.length;
  const grounded = rows.filter(r => r.cls === "GROUNDED").length;
  const blind    = rows.filter(r => r.cls === "BLIND").length;
  return (
    `Operational Threat Intelligence Depth: ${total} task${total !== 1 ? "s" : ""} assessed. ` +
    `${grounded} grounded (knowledge, graph, risk signal, and ops alert coverage confirmed). ` +
    (blind > 0
      ? `${blind} blind — no knowledge grounding, no graph trace, no risk signal, no ops alert. Full intelligence dead spots.`
      : "No blind tasks detected.")
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
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : Array.isArray(raw?.nodes)            ? raw.nodes
    : Array.isArray(raw?.alerts)           ? raw.alerts
    : Array.isArray(raw?.articles)         ? raw.articles
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
    return r.ok ? r.json() : null;
  } catch { return null; }
}

function classifyTask(task, articles, graphNodes, riskSignals, alerts) {
  const taskText = [
    task.name, task.title, task.type, task.category, task.description,
    task.status, task.tags, task.owner, task.assignee,
  ].filter(Boolean).join(" ");
  const tToks = tokens(taskText);

  const matchedArticles = articles.filter(a =>
    overlaps(tToks, [a._label, a.title, a.name, a.category, a.content, a.description, a.type].join(" "))
  );
  const matchedNodes = graphNodes.filter(n =>
    overlaps(tToks, [n._label, n.label, n.name, n.title, n.type, n.description, n.id].join(" "))
  );
  const matchedRisks = riskSignals.filter(r =>
    overlaps(tToks, [r._label, r.name, r.title, r.type, r.category, r.description, r.source, r.signal].join(" "))
  );
  const matchedAlerts = alerts.filter(a =>
    overlaps(tToks, [a._label, a.name, a.title, a.type, a.category, a.message, a.source].join(" "))
  );

  const sources = [
    matchedArticles.length > 0,
    matchedNodes.length > 0,
    matchedRisks.length > 0,
    matchedAlerts.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4) cls = "GROUNDED";
  else if (sources >= 2) cls = "AWARE";
  else if (sources === 1) cls = "PARTIAL";
  else cls = "BLIND";

  return { task, cls, matchedArticles, matchedNodes, matchedRisks, matchedAlerts };
}

export default function TaskKnowledgeGraphRiskOpsDepth() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasksRaw, knowledgeRaw, graphRaw, risksRaw, alertsRaw] = await Promise.all([
        fetcher("/entities/Task"),
        fetcher("/knowledge/"),
        fetcher("/v1/graph/centrality"),
        fetcher("/entities/RiskSignal"),
        fetcher("/v1/ops/alerts"),
      ]);

      const tasks      = normalizeArray(tasksRaw,     ["name", "title", "type", "description"]);
      const articles   = normalizeArray(knowledgeRaw, ["title", "name", "category", "description"]);
      const graphNodes = normalizeArray(graphRaw,     ["label", "name", "title", "type", "id"]);
      const riskSignals = normalizeArray(risksRaw,    ["name", "title", "type", "category", "signal"]);
      const alerts     = normalizeArray(alertsRaw,    ["name", "title", "message", "type", "source", "category"]);

      const built = tasks.map(t => classifyTask(t, articles, graphNodes, riskSignals, alerts));
      built.sort((a, b) => (CLS_ORDER[a.cls] || 0) - (CLS_ORDER[b.cls] || 0));
      setRows(built);
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:tkgroa-toggle", handler);
    return () => window.removeEventListener("jarvis:tkgroa-toggle", handler);
  }, []);

  useEffect(() => {
    if (open) {
      load();
      timerRef.current = setInterval(load, REFRESH_MS);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildTkgroaScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      if (r.ok) {
        const json = await r.json();
        const text = json?.response || json?.message || json?.content || script;
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text, voice: "onyx" }),
        });
      }
    } catch { /* silent */ }
    finally { setAssessing(false); }
  }, [assessing, rows]);

  const blindCount = rows.filter(r => r.cls === "BLIND").length;

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const label = [r.task.name, r.task.title, r.task.type, r.task.status].filter(Boolean).join(" ").toLowerCase();
      return label.includes(q) || r.cls.toLowerCase().includes(q);
    }
    return true;
  });

  const btnPulse = open && blindCount > 0;

  return (
    <>
      {/* ◈ TKGROA toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Task × Knowledge × Graph × RiskSignal × Ops Alert — Operational Threat Intelligence Depth"
        style={{
          position: "fixed",
          bottom: 8,
          left: 129000,
          zIndex: 241,
          background: open ? RED + "33" : "#0a0f1a",
          border: `1px solid ${open ? RED : "#1e3a4a"}`,
          borderRadius: 6,
          color: open ? RED : CYAN,
          cursor: "pointer",
          padding: "3px 9px",
          fontSize: 9,
          letterSpacing: 2,
          fontFamily: "inherit",
          fontWeight: 700,
          whiteSpace: "nowrap",
          animation: btnPulse ? "tkgroa_pulse_btn 1.4s ease-in-out infinite" : "none",
        }}
      >
        {blindCount > 0 && (
          <span style={{
            display: "inline-block", marginRight: 5,
            width: 7, height: 7, borderRadius: "50%",
            background: RED,
            animation: "tkgroa_pulse 1.4s ease-in-out infinite",
          }} />
        )}
        ◈ TKGROA
      </button>

      {open && (
        <div style={{
          position: "fixed",
          bottom: 38,
          left: "50%",
          transform: "translateX(-50%)",
          width: 700,
          maxHeight: 480,
          background: "rgba(6,10,18,0.97)",
          border: `1px solid ${RED}55`,
          borderRadius: 10,
          zIndex: 9242,
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          color: CYAN,
          fontSize: 11,
          boxShadow: `0 0 40px ${RED}33`,
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "8px 12px",
            borderBottom: `1px solid ${RED}33`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}>
            <span style={{ color: RED, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>
              ◈ OPERATIONAL THREAT INTELLIGENCE DEPTH
            </span>
            {blindCount > 0 && (
              <span style={{
                background: RED + "33",
                border: `1px solid ${RED}`,
                borderRadius: 4,
                color: RED,
                padding: "1px 7px",
                fontSize: 9,
                fontWeight: 700,
                animation: "tkgroa_pulse 1.4s ease-in-out infinite",
              }}>
                {blindCount} BLIND
              </span>
            )}
            <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
              Task × Knowledge × Graph × RiskSignal × OpsAlert
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none", color: DIM,
                cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0,
              }}
            >✕</button>
          </div>

          {/* Filters */}
          <div style={{
            padding: "6px 12px",
            borderBottom: `1px solid ${RED}22`,
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexShrink: 0,
          }}>
            {["ALL", "GROUNDED", "AWARE", "PARTIAL", "BLIND"].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? (CLS_COLOR[f] || CYAN) + "22" : "none",
                  border: `1px solid ${filter === f ? (CLS_COLOR[f] || CYAN) : "#1e3a4a"}`,
                  borderRadius: 4,
                  color: filter === f ? (CLS_COLOR[f] || CYAN) : DIM,
                  cursor: "pointer",
                  padding: "2px 8px",
                  fontSize: 8,
                  letterSpacing: 1,
                  fontFamily: "inherit",
                  fontWeight: 700,
                }}
              >{f} {f !== "ALL" ? `(${rows.filter(r => r.cls === f).length})` : `(${rows.length})`}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search tasks…"
              style={{
                marginLeft: "auto",
                background: "#0a0f1a",
                border: `1px solid #1e3a4a`,
                borderRadius: 4,
                color: CYAN,
                padding: "2px 8px",
                fontSize: 9,
                fontFamily: "inherit",
                outline: "none",
                width: 130,
              }}
            />
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
            {loading && (
              <div style={{ padding: 20, textAlign: "center", color: DIM }}>Loading tasks…</div>
            )}
            {error && (
              <div style={{ padding: 10, color: RED }}>{error}</div>
            )}
            {!loading && !error && visible.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: DIM }}>No tasks match.</div>
            )}
            {!loading && visible.map((row, idx) => {
              const key = `task-${row.task.id || row.task.name || idx}`;
              const isExp = !!expanded[key];
              const clsColor = CLS_COLOR[row.cls] || CYAN;
              const taskLabel = row.task.name || row.task.title || row.task.type || `Task ${idx + 1}`;
              const statusType = [row.task.status, row.task.type].filter(Boolean).join(" · ");

              return (
                <div key={key} style={{
                  borderBottom: `1px solid ${RED}11`,
                  background: isExp ? "#0a0f1acc" : "transparent",
                }}>
                  <div
                    onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 12px",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{
                      minWidth: 80,
                      color: clsColor,
                      fontWeight: 700,
                      fontSize: 9,
                      letterSpacing: 1,
                    }}>{row.cls}</span>

                    <span style={{ flex: 1, color: CYAN, fontSize: 10 }}>{taskLabel}</span>

                    {statusType && (
                      <span style={{ fontSize: 9, color: DIM, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {statusType}
                      </span>
                    )}

                    {/* Source badges */}
                    {row.matchedArticles.length > 0 && (
                      <span style={{
                        background: GREEN + "22", border: `1px solid ${GREEN}55`,
                        borderRadius: 3, color: GREEN,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>K:{row.matchedArticles.length}</span>
                    )}
                    {row.matchedNodes.length > 0 && (
                      <span style={{
                        background: CYAN + "22", border: `1px solid ${CYAN}55`,
                        borderRadius: 3, color: CYAN,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>G:{row.matchedNodes.length}</span>
                    )}
                    {row.matchedRisks.length > 0 && (
                      <span style={{
                        background: AMBER + "22", border: `1px solid ${AMBER}55`,
                        borderRadius: 3, color: AMBER,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>R:{row.matchedRisks.length}</span>
                    )}
                    {row.matchedAlerts.length > 0 && (
                      <span style={{
                        background: RED + "22", border: `1px solid ${RED}55`,
                        borderRadius: 3, color: RED,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>A:{row.matchedAlerts.length}</span>
                    )}

                    <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{
                      padding: "4px 12px 10px 24px",
                      borderTop: `1px solid ${RED}11`,
                    }}>
                      {statusType && (
                        <div style={{ color: DIM, fontSize: 9, marginBottom: 6 }}>{statusType}</div>
                      )}

                      {row.matchedArticles.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: GREEN, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>KNOWLEDGE</div>
                          {row.matchedArticles.slice(0, 4).map((a, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                              <span style={{
                                background: GREEN + "22", border: `1px solid ${GREEN}55`,
                                borderRadius: 3, color: GREEN,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{a.category || a.type || "ART"}</span>
                              <span style={{ color: CYAN, fontSize: 9 }}>
                                {a._label || a.title || a.name || "Article"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedNodes.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: CYAN, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>GRAPH NODES</div>
                          {row.matchedNodes.slice(0, 4).map((n, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                              <span style={{
                                background: CYAN + "22", border: `1px solid ${CYAN}55`,
                                borderRadius: 3, color: CYAN,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{typeof n.centrality === "number" ? n.centrality.toFixed(3) : n.type || "NODE"}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>
                                {n._label || n.label || n.name || n.id || "Node"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedRisks.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: AMBER, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>RISK SIGNALS</div>
                          {row.matchedRisks.slice(0, 4).map((r, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                              <span style={{
                                background: AMBER + "22", border: `1px solid ${AMBER}55`,
                                borderRadius: 3, color: AMBER,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{r.severity || r.level || r.type || "RISK"}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>
                                {r._label || r.name || r.title || "Signal"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedAlerts.length > 0 && (
                        <div style={{ marginBottom: 2 }}>
                          <div style={{ color: RED, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>OPS ALERTS</div>
                          {row.matchedAlerts.slice(0, 4).map((a, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                              <span style={{
                                background: RED + "22", border: `1px solid ${RED}55`,
                                borderRadius: 3, color: RED,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{a.severity || a.level || "ALERT"}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>
                                {a._label || a.name || a.type || "Alert"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedArticles.length === 0 && row.matchedNodes.length === 0 &&
                        row.matchedRisks.length === 0 && row.matchedAlerts.length === 0 && (
                        <div style={{ color: RED, fontSize: 9, fontStyle: "italic" }}>
                          No knowledge article, graph node, risk signal, or ops alert — task is fully blind.
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
            padding: "8px 12px",
            borderTop: `1px solid ${RED}22`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: assessing ? RED + "44" : RED + "22",
                border: `1px solid ${RED}55`,
                borderRadius: 6,
                color: RED,
                cursor: assessing ? "not-allowed" : "pointer",
                padding: "4px 14px",
                fontSize: 9,
                letterSpacing: 2,
                fontFamily: "inherit",
                fontWeight: 700,
              }}
            >{assessing ? "ASSESSING…" : "▶ ASSESS"}</button>
            <span style={{ color: DIM, fontSize: 9 }}>
              Task × Knowledge × Graph × RiskSignal × OpsAlert
            </span>
            <button
              onClick={load}
              disabled={loading}
              style={{
                marginLeft: "auto",
                background: "none",
                border: `1px solid #334455`,
                borderRadius: 5,
                color: DIM,
                cursor: loading ? "not-allowed" : "pointer",
                padding: "3px 10px",
                fontSize: 9,
                fontFamily: "inherit",
              }}
            >{loading ? "…" : "↺"}</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes tkgroa_pulse {
          0%,100% { opacity:1; } 50% { opacity:0.3; }
        }
        @keyframes tkgroa_pulse_btn {
          0%,100% { box-shadow:0 0 20px ${RED}88; } 50% { box-shadow:0 0 40px ${RED}cc; }
        }
      `}</style>
    </>
  );
}
