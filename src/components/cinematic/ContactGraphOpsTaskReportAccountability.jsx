/**
 * F183 Contact × Graph × Ops Alert × Task × Report
 * Full Mission Accountability Network — ◈ CGORTR
 *
 * Fetches: /entities/Contact + /v1/graph/centrality + /v1/ops/alerts
 *          + /entities/Task + /v1/reports
 * Classifies each contact by keyword overlap across all 4 external sources:
 *   ACCOUNTABLE — matched all 4 (graph + ops alert + task + report)
 *   ACTIVE      — matched graph + task but missing alert/report
 *   MONITORED   — matched ops alert or report but missing graph + task
 *   GHOST       — zero matches (no graph trace, no ops alert, no task, no report)
 * Red pulse on GHOST count.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */

import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CYAN  = "#29E7FF";
const GREEN = "#00FF88";
const AMBER = "#FFB347";
const RED   = "#FF3B6B";

const CLS_COLOR = { ACCOUNTABLE: GREEN, ACTIVE: CYAN, MONITORED: AMBER, GHOST: "#6a7a8a" };
const CLS_ORDER = { ACCOUNTABLE: 4, ACTIVE: 3, MONITORED: 2, GHOST: 1 };

const CGORTR_RE = /\b(cgortr|contact.graph.ops|contact.accountability|mission.accountability|contact.ghost|contact.ops.alert|contact.report.mission|contact.task.graph|contact.network.accountability|ghost.contact|contact.zero.footprint|contact.mission.network|accountability.network)\b/i;

export function isCgortrQuery(q) { return CGORTR_RE.test(q || ""); }

export function buildCgortrScript(rows) {
  const total       = rows.length;
  const accountable = rows.filter(r => r.cls === "ACCOUNTABLE").length;
  const ghost       = rows.filter(r => r.cls === "GHOST").length;
  return (
    `Contact Mission Accountability Network: ${total} contact${total !== 1 ? "s" : ""} assessed across graph, ops alerts, tasks, and reports. ` +
    `${accountable} fully accountable (graph trace + ops alert + task + report grounding). ` +
    (ghost > 0
      ? `${ghost} GHOST — no graph trace, no ops alert, no task, no filed report. These contacts have zero operational footprint — immediate accountability grounding required.`
      : "No ghost contacts detected. All contacts have at least one operational accountability anchor.")
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

function classify(hasGraph, hasAlert, hasTask, hasReport) {
  if (hasGraph && hasAlert && hasTask && hasReport) return "ACCOUNTABLE";
  if (hasGraph && hasTask) return "ACTIVE";
  if (hasAlert || hasReport) return "MONITORED";
  return "GHOST";
}

async function loadData() {
  const [contactsRaw, graphRaw, alertsRaw, tasksRaw, reportsRaw] = await Promise.all([
    fetcher("/entities/Contact"),
    fetcher("/v1/graph/centrality"),
    fetcher("/v1/ops/alerts"),
    fetcher("/entities/Task"),
    fetcher("/v1/reports"),
  ]);

  const contacts = normalizeArray(contactsRaw, ["name", "full_name", "contact_name", "label", "id"]);
  const graph    = normalizeArray(graphRaw,    ["label", "name", "entity", "node_id", "id"]);
  const alerts   = normalizeArray(alertsRaw,   ["title", "name", "alert_name", "message", "label", "id"]);
  const tasks    = normalizeArray(tasksRaw,    ["title", "name", "task_name", "subject", "label", "id"]);
  const reports  = normalizeArray(reportsRaw,  ["title", "name", "report_title", "subject", "label", "id"]);

  return contacts.map(contact => {
    const cToks = tokens(
      contact._label + " " +
      (contact.role || "") + " " +
      (contact.organisation || contact.org || "") + " " +
      (contact.email || "") + " " +
      (contact.type || "") + " " +
      (contact.tags || "").toString()
    );

    const matchedGraph = graph.filter(n => overlaps(cToks,
      n._label + " " + (n.type || "") + " " + (n.category || "")
    ));
    const matchedAlerts = alerts.filter(a => overlaps(cToks,
      a._label + " " + (a.description || "") + " " + (a.severity || "") + " " + (a.type || "")
    ));
    const matchedTasks = tasks.filter(t => overlaps(cToks,
      t._label + " " + (t.description || "") + " " + (t.status || "") + " " + (t.assigned_to || "")
    ));
    const matchedReports = reports.filter(r => overlaps(cToks,
      r._label + " " + (r.summary || "") + " " + (r.category || "") + " " + (r.author || "")
    ));

    return {
      ...contact,
      cls: classify(
        matchedGraph.length > 0,
        matchedAlerts.length > 0,
        matchedTasks.length > 0,
        matchedReports.length > 0
      ),
      matchedGraph,
      matchedAlerts,
      matchedTasks,
      matchedReports,
    };
  }).sort((a, b) => CLS_ORDER[b.cls] - CLS_ORDER[a.cls]);
}

const FILTERS = ["ALL", "ACCOUNTABLE", "ACTIVE", "MONITORED", "GHOST"];
const LEFT_PX = 150840;
const Z_IDX   = 280;

export default function ContactGraphOpsTaskReportAccountability() {
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
    window.addEventListener("jarvis:cgortr-toggle", handler);
    return () => window.removeEventListener("jarvis:cgortr-toggle", handler);
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
      const script = buildCgortrScript(rows);
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
    ACCOUNTABLE: rows.filter(r => r.cls === "ACCOUNTABLE").length,
    ACTIVE:      rows.filter(r => r.cls === "ACTIVE").length,
    MONITORED:   rows.filter(r => r.cls === "MONITORED").length,
    GHOST:       rows.filter(r => r.cls === "GHOST").length,
  };

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r._label || "").toLowerCase().includes(s) ||
             (r.role || "").toLowerCase().includes(s) ||
             (r.organisation || r.org || "").toLowerCase().includes(s);
    }
    return true;
  });

  const hasGhost = counts.GHOST > 0;

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
          border: `1px solid ${hasGhost ? RED : CYAN}55`,
          borderRadius: 7,
          color: hasGhost ? RED : CYAN,
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
          animation: hasGhost ? "cgortr_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        {hasGhost && (
          <span style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: RED,
            animation: "cgortr_dot_pulse 1.2s ease-in-out infinite",
          }} />
        )}
        ◈ CGORTR
        {hasGhost && (
          <span style={{
            background: `${RED}33`,
            border: `1px solid ${RED}66`,
            borderRadius: 4,
            padding: "1px 5px",
            fontSize: 8,
          }}>
            {counts.GHOST} GHOST
          </span>
        )}
      </button>

      <style>{`
        @keyframes cgortr_pulse_btn {
          0%,100% { box-shadow: 0 0 0 0 ${RED}44; }
          50%      { box-shadow: 0 0 12px 3px ${RED}44; }
        }
        @keyframes cgortr_dot_pulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
      `}</style>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: 40,
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(1100px, 96vw)",
          maxHeight: "78vh",
          zIndex: Z_IDX + 1,
          background: "linear-gradient(145deg,#040d1aee,#071426ee)",
          border: `1px solid ${hasGhost ? RED : CYAN}33`,
          borderRadius: 14,
          boxShadow: `0 0 40px ${hasGhost ? RED : CYAN}22`,
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 18px 10px",
            borderBottom: "1px solid #ffffff11",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}>
            <span style={{ color: CYAN, fontSize: 11, fontWeight: 800, letterSpacing: 2 }}>
              ◈ CONTACT MISSION ACCOUNTABILITY NETWORK
            </span>
            <span style={{ color: "#566878", fontSize: 9 }}>
              CONTACT × GRAPH × OPS ALERT × TASK × REPORT
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {Object.entries(counts).map(([k, v]) => (
                <span key={k} style={{
                  background: `${CLS_COLOR[k]}15`,
                  border: `1px solid ${CLS_COLOR[k]}44`,
                  borderRadius: 5,
                  color: CLS_COLOR[k],
                  fontSize: 9,
                  padding: "2px 8px",
                  fontWeight: 700,
                }}>
                  {k} {v}
                </span>
              ))}
              <button
                onClick={assess}
                disabled={assessing || rows.length === 0}
                style={{
                  background: assessing ? "#1a2a3a" : `${GREEN}22`,
                  border: `1px solid ${GREEN}55`,
                  borderRadius: 6,
                  color: GREEN,
                  cursor: assessing ? "not-allowed" : "pointer",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "4px 10px",
                  letterSpacing: 1,
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {assessing ? "ASSESSING…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "1px solid #ffffff22",
                  borderRadius: 5,
                  color: "#566878",
                  cursor: "pointer",
                  fontSize: 10,
                  padding: "3px 8px",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Filters + search */}
          <div style={{
            padding: "8px 18px",
            borderBottom: "1px solid #ffffff0a",
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
          }}>
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? `${f === "ALL" ? CYAN : CLS_COLOR[f]}22` : "none",
                  border: `1px solid ${filter === f ? (f === "ALL" ? CYAN : CLS_COLOR[f]) : "#ffffff22"}`,
                  borderRadius: 5,
                  color: filter === f ? (f === "ALL" ? CYAN : CLS_COLOR[f]) : "#566878",
                  cursor: "pointer",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "3px 9px",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {f}{f !== "ALL" ? ` (${counts[f] || 0})` : ""}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search contacts…"
              style={{
                marginLeft: "auto",
                background: "#071426",
                border: "1px solid #ffffff22",
                borderRadius: 5,
                color: CYAN,
                fontSize: 9,
                padding: "4px 10px",
                fontFamily: "'JetBrains Mono',monospace",
                outline: "none",
                width: 180,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
            {loading && (
              <div style={{ color: CYAN, fontSize: 10, padding: "20px", textAlign: "center" }}>
                LOADING CONTACT ACCOUNTABILITY DATA…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: "#566878", fontSize: 10, padding: "20px", textAlign: "center" }}>
                No contacts match current filter.
              </div>
            )}
            {!loading && visible.map((row, i) => {
              const isExp = expanded === i;
              const clsColor = CLS_COLOR[row.cls];
              return (
                <div
                  key={i}
                  style={{ borderBottom: "1px solid #ffffff08", padding: "0 18px" }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 0",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{
                      minWidth: 90,
                      background: `${clsColor}18`,
                      border: `1px solid ${clsColor}44`,
                      borderRadius: 4,
                      color: clsColor,
                      fontSize: 8,
                      fontWeight: 700,
                      padding: "2px 7px",
                      letterSpacing: 1,
                      textAlign: "center",
                    }}>
                      {row.cls}
                    </span>
                    <span style={{ color: "#c8d8e8", fontSize: 10, flex: 1 }}>
                      {row._label || row.id || "—"}
                    </span>
                    {row.role && (
                      <span style={{
                        background: `${AMBER}18`,
                        border: `1px solid ${AMBER}44`,
                        borderRadius: 3,
                        color: AMBER,
                        fontSize: 8,
                        padding: "1px 5px",
                        fontWeight: 600,
                      }}>
                        {row.role}
                      </span>
                    )}
                    {(row.organisation || row.org) && (
                      <span style={{
                        background: `${CYAN}18`,
                        border: `1px solid ${CYAN}44`,
                        borderRadius: 3,
                        color: CYAN,
                        fontSize: 8,
                        padding: "1px 5px",
                        fontWeight: 600,
                      }}>
                        {row.organisation || row.org}
                      </span>
                    )}
                    <span style={{ color: "#2a3a4a", fontSize: 9, marginLeft: 4 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{
                      padding: "0 0 12px 12px",
                      borderLeft: `2px solid ${clsColor}33`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}>
                      <DetailSection
                        label="GRAPH NODES" color={CYAN}
                        items={row.matchedGraph}
                        renderItem={n => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{n._label}</span>
                            {n.centrality !== undefined && (
                              <Badge color={CYAN}>{typeof n.centrality === "number" ? n.centrality.toFixed(3) : n.centrality}</Badge>
                            )}
                          </>
                        )}
                      />
                      <DetailSection
                        label="OPS ALERTS" color={RED}
                        items={row.matchedAlerts}
                        renderItem={a => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{a._label}</span>
                            {a.severity && (
                              <Badge color={a.severity === "critical" || a.severity === "high" ? RED : AMBER}>
                                {a.severity}
                              </Badge>
                            )}
                          </>
                        )}
                      />
                      <DetailSection
                        label="TASKS" color={GREEN}
                        items={row.matchedTasks}
                        renderItem={t => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{t._label}</span>
                            {t.status && (
                              <Badge color={t.status === "complete" || t.status === "done" ? GREEN : AMBER}>
                                {t.status}
                              </Badge>
                            )}
                          </>
                        )}
                      />
                      <DetailSection
                        label="REPORTS" color={AMBER}
                        items={row.matchedReports}
                        renderItem={r => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{r._label}</span>
                            {(r.created_at || r.date || r.published_at) && (
                              <Badge color={AMBER}>
                                {(r.created_at || r.date || r.published_at || "").toString().slice(0, 10)}
                              </Badge>
                            )}
                          </>
                        )}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 18px",
            borderTop: "1px solid #ffffff0a",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}>
            <span style={{ color: "#566878", fontSize: 8 }}>
              {rows.length} contacts · auto-refresh 90s
            </span>
            {loading && <span style={{ color: CYAN, fontSize: 8 }}>LOADING…</span>}
            <button
              onClick={() => load(true)}
              style={{
                marginLeft: "auto",
                background: "none",
                border: `1px solid ${CYAN}33`,
                borderRadius: 4,
                color: CYAN,
                cursor: "pointer",
                fontSize: 8,
                padding: "2px 8px",
                fontFamily: "'JetBrains Mono',monospace",
              }}
            >
              ↺ REFRESH
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function DetailSection({ label, color, items, renderItem }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div style={{ color, fontSize: 8, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
        {label} ({items.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {items.slice(0, 6).map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {renderItem(item)}
          </div>
        ))}
        {items.length > 6 && (
          <span style={{ color: "#566878", fontSize: 8 }}>+{items.length - 6} more</span>
        )}
      </div>
    </div>
  );
}

function Badge({ color, children }) {
  return (
    <span style={{
      background: `${color}18`,
      border: `1px solid ${color}44`,
      borderRadius: 3,
      color,
      fontSize: 8,
      padding: "1px 5px",
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}
