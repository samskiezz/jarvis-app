/**
 * F168 Scenario × Brain × Graph × Ops Alert × Report
 * Strategic Command Authority Map — ◈ SBGORA
 *
 * Fetches: /v1/scenario/list + /v1/cinematic/brain + /v1/graph/centrality
 *          + /v1/ops/alerts + /v1/reports
 * Keyword-cross-references each scenario against brain nodes, graph centrality
 * nodes, ops alerts, and reports to classify:
 *   COMMANDING — matched all 4 supporting sources (fully grounded scenario)
 *   ACTIVE     — matched 2–3 sources
 *   PARTIAL    — matched 1 source
 *   UNARMED    — zero matches (scenarios with no brain model, no graph trace,
 *               no ops alert, no filed report — strategic authority blind spots)
 * Red pulse on UNARMED count.
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

const CLS_COLOR = { COMMANDING: GREEN, ACTIVE: CYAN, PARTIAL: AMBER, UNARMED: RED };
const CLS_ORDER = { COMMANDING: 4, ACTIVE: 3, PARTIAL: 2, UNARMED: 1 };

const REFRESH_MS = 90_000;

const SBGORA_RE = /\b(sbgora|scenario.*brain.*graph|scenario.*ops.*report|strategic.*command.*authority|scenario.*command|scenario.*authority|unarmed.*scenario|scenario.*unarmed|scenario.*no.*brain|scenario.*no.*report|scenario.*blind|command.*authority|strategic.*authority)\b/i;

export function isSbgoraQuery(q) { return SBGORA_RE.test(q || ""); }

export function buildSbgoraScript(rows) {
  const total      = rows.length;
  const commanding = rows.filter(r => r.cls === "COMMANDING").length;
  const unarmed    = rows.filter(r => r.cls === "UNARMED").length;
  return (
    `Strategic Command Authority Map: ${total} scenario${total !== 1 ? "s" : ""} assessed across brain models, graph nodes, ops alerts, and reports. ` +
    `${commanding} fully commanding (brain model, graph trace, ops alert trigger, and filed report all confirmed). ` +
    (unarmed > 0
      ? `${unarmed} unarmed — no brain model, no graph trace, no ops alert, no filed report. These scenarios are full strategic authority blind spots with zero command grounding.`
      : "No unarmed scenarios — all scenarios have full strategic command authority coverage.")
  );
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const bToks = new Set(tokens(bStr));
  return aToks.some(t => bToks.has(t));
}

function normalizeArray(raw) {
  return Array.isArray(raw)               ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : Array.isArray(raw?.scenarios)       ? raw.scenarios
    : Array.isArray(raw?.nodes)           ? raw.nodes
    : Array.isArray(raw?.alerts)          ? raw.alerts
    : Array.isArray(raw?.reports)         ? raw.reports
    : [];
}

async function fetcher(path) {
  try {
    const r = await fetch(`${apiBase()}${path}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

function classifyScenario(scenario, brainNodes, graphNodes, opsAlerts, reports) {
  const sText = [
    scenario.title, scenario.name, scenario.description,
    scenario.category, scenario.type, scenario.tags,
  ].filter(Boolean).join(" ");
  const aToks = tokens(sText);

  const matchedBrain = brainNodes.filter(n =>
    overlaps(aToks, [n.label, n.id, n.name, n.type, n.category, n.description].join(" "))
  );
  const matchedGraph = graphNodes.filter(n =>
    overlaps(aToks, [n.label, n.id, n.name, n.type, n.category, n.description].join(" "))
  );
  const matchedAlerts = opsAlerts.filter(a =>
    overlaps(aToks, [a.title, a.name, a.message, a.description, a.type, a.category, a.severity].join(" "))
  );
  const matchedReports = reports.filter(rep =>
    overlaps(aToks, [rep.title, rep.name, rep.summary, rep.description, rep.category, rep.type].join(" "))
  );

  const sources = [
    matchedBrain.length > 0,
    matchedGraph.length > 0,
    matchedAlerts.length > 0,
    matchedReports.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4)      cls = "COMMANDING";
  else if (sources >= 2)  cls = "ACTIVE";
  else if (sources === 1) cls = "PARTIAL";
  else                    cls = "UNARMED";

  return { scenario, cls, matchedBrain, matchedGraph, matchedAlerts, matchedReports };
}

export default function ScenarioBrainGraphOpsReportAuthority() {
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
      const [scenariosRaw, brainRaw, graphRaw, opsRaw, reportsRaw] = await Promise.all([
        fetcher("/v1/scenario/list"),
        fetcher("/v1/cinematic/brain"),
        fetcher("/v1/graph/centrality"),
        fetcher("/v1/ops/alerts"),
        fetcher("/v1/reports"),
      ]);

      const scenarios  = normalizeArray(scenariosRaw);
      const brainNodes = normalizeArray(brainRaw?.nodes ?? brainRaw);
      const graphNodes = normalizeArray(graphRaw?.nodes ?? graphRaw);
      const opsAlerts  = normalizeArray(opsRaw);
      const reports    = normalizeArray(reportsRaw);

      const built = scenarios.map(s =>
        classifyScenario(s, brainNodes, graphNodes, opsAlerts, reports)
      );
      built.sort((a, b) => (CLS_ORDER[a.cls] || 0) - (CLS_ORDER[b.cls] || 0));
      setRows(built);
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:sbgora-toggle", toggle);
    return () => window.removeEventListener("jarvis:sbgora-toggle", toggle);
  }, []);

  const unarmedCount = rows.filter(r => r.cls === "UNARMED").length;
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.scenario?.title || r.scenario?.name || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildSbgoraScript(rows);
      const resp = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await resp.json();
      const text = d.response || d.answer || d.message || script;
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text }),
      });
    } catch { /* non-fatal */ }
    finally { setAssessing(false); }
  }, [assessing, rows]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scenario × Brain × Graph × Ops Alert × Report — Strategic Command Authority Map"
        style={{
          position: "fixed", left: 142440, bottom: 8, zIndex: 265,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${unarmedCount > 0 ? RED : CYAN}`,
          color: unarmedCount > 0 ? RED : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: unarmedCount > 0 ? `0 0 6px ${RED}` : "none",
          animation: unarmedCount > 0 ? "pulse-red 1.4s infinite" : "none",
        }}
      >
        ◈ SBGORA{unarmedCount > 0 ? ` — ${unarmedCount} UNARMED` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9265,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ SBGORA — STRATEGIC COMMAND AUTHORITY MAP
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          Scenario × Brain × Graph × Ops Alert × Report (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} scenario{rows.length !== 1 ? "s" : ""} ·{" "}
          {unarmedCount > 0
            ? <span style={{ color: RED, fontWeight: 700 }}>{unarmedCount} UNARMED</span>
            : <span style={{ color: GREEN }}>0 unarmed</span>}
        </span>
        <button onClick={assess} disabled={assessing || rows.length === 0}
          style={{ background: "none", border: `1px solid ${CYAN}`, color: CYAN,
            borderRadius: 3, padding: "2px 10px", fontSize: 11, cursor: "pointer" }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: DIM,
            fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, padding: "8px 16px", flexShrink: 0,
        borderBottom: `1px solid ${CYAN}11` }}>
        {["ALL", "COMMANDING", "ACTIVE", "PARTIAL", "UNARMED"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              background: filter === f ? `${CLS_COLOR[f] || CYAN}22` : "none",
              border: `1px solid ${filter === f ? (CLS_COLOR[f] || CYAN) : DIM}`,
              color: filter === f ? (CLS_COLOR[f] || CYAN) : DIM,
              borderRadius: 3, padding: "2px 8px", fontSize: 10, cursor: "pointer",
            }}>
            {f}{f !== "ALL" ? ` (${rows.filter(r => r.cls === f).length})` : ` (${rows.length})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search scenarios…"
          style={{ marginLeft: "auto", background: "rgba(255,255,255,0.05)",
            border: `1px solid ${CYAN}33`, color: CYAN, borderRadius: 3,
            padding: "2px 8px", fontSize: 10, outline: "none", width: 160 }}
        />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
        {loading && <div style={{ color: DIM, fontSize: 11, padding: 8 }}>Loading…</div>}
        {error   && <div style={{ color: RED, fontSize: 11, padding: 8 }}>Error: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 11, padding: 8 }}>No scenarios match current filter.</div>
        )}
        {visible.map((row, i) => {
          const label = row.scenario?.title || row.scenario?.name || `scenario-${i}`;
          const isExp = expanded[i];
          return (
            <div key={i} style={{ marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 8px", borderRadius: 3, cursor: "pointer",
                  background: isExp ? "rgba(41,231,255,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${CLS_COLOR[row.cls] || CYAN}33`,
                }}
              >
                <span style={{ fontSize: 9, color: CLS_COLOR[row.cls] || CYAN,
                  border: `1px solid ${CLS_COLOR[row.cls] || CYAN}`,
                  borderRadius: 2, padding: "1px 4px", minWidth: 76, textAlign: "center" }}>
                  {row.cls}
                </span>
                <span style={{ fontSize: 11, flex: 1, color: CYAN }}>{label}</span>
                {row.scenario?.status && (
                  <span style={{ fontSize: 9, color: AMBER,
                    border: `1px solid ${AMBER}55`, borderRadius: 2, padding: "1px 4px" }}>
                    {row.scenario.status}
                  </span>
                )}
                <span style={{ fontSize: 10, color: DIM }}>
                  {row.matchedBrain.length}b · {row.matchedGraph.length}g ·{" "}
                  {row.matchedAlerts.length}a · {row.matchedReports.length}r
                </span>
                <span style={{ fontSize: 10, color: DIM }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "6px 12px 8px 20px", fontSize: 10,
                  borderLeft: `2px solid ${CLS_COLOR[row.cls] || CYAN}44`, marginLeft: 8 }}>

                  {/* Brain nodes */}
                  {row.matchedBrain.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>BRAIN NODES</div>
                      {row.matchedBrain.slice(0, 5).map((n, ni) => (
                        <div key={ni} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{n.label || n.name || n.id || `node-${ni}`}</span>
                          {(n.centrality !== undefined || n.score !== undefined) && (
                            <span style={{ fontSize: 9, color: DIM,
                              border: `1px solid ${DIM}55`, borderRadius: 2, padding: "1px 4px" }}>
                              centrality:{typeof (n.centrality ?? n.score) === "number"
                                ? (n.centrality ?? n.score).toFixed(3)
                                : (n.centrality ?? n.score)}
                            </span>
                          )}
                          {(n.type || n.category) && (
                            <span style={{ fontSize: 9, color: AMBER,
                              border: `1px solid ${AMBER}55`, borderRadius: 2, padding: "1px 4px" }}>
                              {n.type || n.category}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Graph nodes */}
                  {row.matchedGraph.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>GRAPH NODES</div>
                      {row.matchedGraph.slice(0, 5).map((n, ni) => (
                        <div key={ni} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{n.label || n.name || n.id || `node-${ni}`}</span>
                          {(n.centrality !== undefined || n.score !== undefined) && (
                            <span style={{ fontSize: 9, color: DIM,
                              border: `1px solid ${DIM}55`, borderRadius: 2, padding: "1px 4px" }}>
                              centrality:{typeof (n.centrality ?? n.score) === "number"
                                ? (n.centrality ?? n.score).toFixed(3)
                                : (n.centrality ?? n.score)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ops Alerts */}
                  {row.matchedAlerts.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>OPS ALERTS</div>
                      {row.matchedAlerts.slice(0, 5).map((a, ai) => (
                        <div key={ai} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{a.title || a.name || a.message || `alert-${ai}`}</span>
                          {a.severity && (
                            <span style={{ fontSize: 9,
                              color: a.severity === "critical" ? RED : a.severity === "high" ? AMBER : DIM,
                              border: `1px solid ${a.severity === "critical" ? RED : a.severity === "high" ? AMBER : DIM}55`,
                              borderRadius: 2, padding: "1px 4px" }}>
                              {a.severity}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reports */}
                  {row.matchedReports.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>REPORTS</div>
                      {row.matchedReports.slice(0, 5).map((rep, ri) => (
                        <div key={ri} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{rep.title || rep.name || `report-${ri}`}</span>
                          {(rep.date || rep.created_at || rep.timestamp) && (
                            <span style={{ fontSize: 9, color: DIM,
                              border: `1px solid ${DIM}55`, borderRadius: 2, padding: "1px 4px" }}>
                              {(rep.date || rep.created_at || rep.timestamp || "").slice(0, 10)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {row.matchedBrain.length === 0 && row.matchedGraph.length === 0 &&
                   row.matchedAlerts.length === 0 && row.matchedReports.length === 0 && (
                    <div style={{ color: RED, fontStyle: "italic" }}>
                      No brain model, no graph trace, no ops alert, no filed report — full strategic authority blind spot.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "6px 16px", borderTop: `1px solid ${CYAN}11`,
        fontSize: 10, color: DIM, flexShrink: 0 }}>
        Auto-refresh every 90s · {rows.length} scenario{rows.length !== 1 ? "s" : ""} assessed ·{" "}
        COMMANDING:{rows.filter(r => r.cls === "COMMANDING").length} ·{" "}
        ACTIVE:{rows.filter(r => r.cls === "ACTIVE").length} ·{" "}
        PARTIAL:{rows.filter(r => r.cls === "PARTIAL").length} ·{" "}
        UNARMED:<span style={{ color: unarmedCount > 0 ? RED : DIM }}>{unarmedCount}</span>
      </div>
    </div>
  );
}
