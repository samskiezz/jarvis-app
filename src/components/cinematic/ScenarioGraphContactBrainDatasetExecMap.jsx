/**
 * F164 Scenario × Graph × Contact × Brain × Dataset
 * Scenario Intelligence Execution Map — ◈ SIGEXM
 *
 * Fetches: /v1/scenario/list + /v1/graph/centrality + /entities/Contact
 *          + /v1/cinematic/brain + /v1/datasets
 * Keyword-matches each scenario against graph nodes, contacts,
 * brain nodes, and datasets to classify:
 *   ARMED    — matched all 4 supporting sources (fully executable scenario)
 *   STAGED   — matched 2–3 sources
 *   PARTIAL  — matched 1 source
 *   UNARMED  — zero matches (blind-spot scenarios with no graph node,
 *               no contact owner, no brain model, no dataset backing)
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

const CLS_COLOR = { ARMED: GREEN, STAGED: CYAN, PARTIAL: AMBER, UNARMED: RED };
const CLS_ORDER = { ARMED: 4, STAGED: 3, PARTIAL: 2, UNARMED: 1 };

const REFRESH_MS = 90_000;

const SIGEXM_RE = /\b(sigexm|scenario.*graph.*contact|scenario.*brain.*dataset|scenario.*execution.*map|scenario.*intel.*exec|execution.*map|scenario.*armed|unarmed.*scenario|scenario.*unarmed|scenario.*intelligence.*map|blind.?spot.*scenario|scenario.*blind.?spot|scenario.*coverage|execution.*coverage)\b/i;

export function isSigexmQuery(q) { return SIGEXM_RE.test(q || ""); }

export function buildSigexmScript(rows) {
  const total   = rows.length;
  const armed   = rows.filter(r => r.cls === "ARMED").length;
  const unarmed = rows.filter(r => r.cls === "UNARMED").length;
  return (
    `Scenario Intelligence Execution Map: ${total} scenario${total !== 1 ? "s" : ""} assessed across graph nodes, contacts, brain models, and datasets. ` +
    `${armed} fully armed (graph backing, contact owner, brain model, and dataset all confirmed — ready for immediate execution). ` +
    (unarmed > 0
      ? `${unarmed} unarmed — no graph trace, no contact, no brain model, no dataset. These scenarios cannot be executed — they are intelligence blind spots requiring immediate resourcing.`
      : "No unarmed scenarios detected — all scenarios have full execution backing.")
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
  return Array.isArray(raw)                      ? raw
    : Array.isArray(raw?.data)                   ? raw.data
    : Array.isArray(raw?.items)                  ? raw.items
    : Array.isArray(raw?.results)                ? raw.results
    : Array.isArray(raw?.nodes)                  ? raw.nodes
    : Array.isArray(raw?.scenarios)              ? raw.scenarios
    : Array.isArray(raw?.contacts)               ? raw.contacts
    : Array.isArray(raw?.brain_nodes)            ? raw.brain_nodes
    : Array.isArray(raw?.datasets)               ? raw.datasets
    : Array.isArray(raw?.articles)               ? raw.articles
    : [];
}

function labelOf(item, keys) {
  for (const k of keys) if (item[k]) return String(item[k]);
  return "";
}

async function fetcher(path) {
  try {
    const r = await fetch(`${apiBase()}${path}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

function classifyScenario(scenario, graphNodes, contacts, brainNodes, datasets) {
  const sText = [
    scenario.name, scenario.title, scenario.description,
    scenario.category, scenario.type, scenario.tags,
    scenario.id, scenario.status,
  ].filter(Boolean).join(" ");
  const aToks = tokens(sText);

  const matchedGraph = graphNodes.filter(n =>
    overlaps(aToks, [n.label, n.id, n.name, n.type, n.category, n.description].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(aToks, [c.name, c.first_name, c.last_name, c.org, c.organisation, c.role, c.tags].join(" "))
  );
  const matchedBrain = brainNodes.filter(b =>
    overlaps(aToks, [b.label, b.id, b.name, b.type, b.category, b.description].join(" "))
  );
  const matchedDatasets = datasets.filter(d =>
    overlaps(aToks, [d.name, d.title, d.description, d.category, d.source, d.tags].join(" "))
  );

  const sources = [
    matchedGraph.length > 0,
    matchedContacts.length > 0,
    matchedBrain.length > 0,
    matchedDatasets.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4)      cls = "ARMED";
  else if (sources >= 2)  cls = "STAGED";
  else if (sources === 1) cls = "PARTIAL";
  else                    cls = "UNARMED";

  return { scenario, cls, matchedGraph, matchedContacts, matchedBrain, matchedDatasets };
}

export default function ScenarioGraphContactBrainDatasetExecMap() {
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
      const [scenariosRaw, graphRaw, contactsRaw, brainRaw, datasetsRaw] = await Promise.all([
        fetcher("/v1/scenario/list"),
        fetcher("/v1/graph/centrality"),
        fetcher("/entities/Contact"),
        fetcher("/v1/cinematic/brain"),
        fetcher("/v1/datasets"),
      ]);

      const scenarios  = normalizeArray(scenariosRaw);
      const graphNodes = normalizeArray(graphRaw);
      const contacts   = normalizeArray(contactsRaw);
      const brainNodes = normalizeArray(brainRaw?.nodes ?? brainRaw);
      const datasets   = normalizeArray(datasetsRaw);

      const built = scenarios.map(s =>
        classifyScenario(s, graphNodes, contacts, brainNodes, datasets)
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
    window.addEventListener("jarvis:sigexm-toggle", toggle);
    return () => window.removeEventListener("jarvis:sigexm-toggle", toggle);
  }, []);

  const unarmed = rows.filter(r => r.cls === "UNARMED").length;
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.scenario?.name || r.scenario?.title || r.scenario?.id || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildSigexmScript(rows);
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
        title="Scenario × Graph × Contact × Brain × Dataset — Scenario Intelligence Execution Map"
        style={{
          position: "fixed", left: 140200, bottom: 8, zIndex: 261,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${unarmed > 0 ? RED : CYAN}`,
          color: unarmed > 0 ? RED : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: unarmed > 0 ? `0 0 6px ${RED}` : "none",
          animation: unarmed > 0 ? "pulse-red 1.4s infinite" : "none",
        }}
      >
        ◈ SIGEXM{unarmed > 0 ? ` — ${unarmed} UNARMED` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9261,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ SIGEXM — SCENARIO INTELLIGENCE EXECUTION MAP
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          Scenario × Graph × Contact × Brain × Dataset (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} scenarios ·{" "}
          {unarmed > 0
            ? <span style={{ color: RED, fontWeight: 700 }}>{unarmed} UNARMED</span>
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
        {["ALL", "ARMED", "STAGED", "PARTIAL", "UNARMED"].map(f => (
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
          const scenLabel  = row.scenario?.name || row.scenario?.title || row.scenario?.id || `scenario-${i}`;
          const scenStatus = row.scenario?.status || row.scenario?.state || null;
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
                  borderRadius: 2, padding: "1px 4px", minWidth: 54, textAlign: "center" }}>
                  {row.cls}
                </span>
                <span style={{ fontSize: 11, flex: 1, color: CYAN }}>{scenLabel}</span>
                {scenStatus && (
                  <span style={{ fontSize: 9, color: DIM,
                    border: `1px solid ${DIM}55`, borderRadius: 2, padding: "1px 4px" }}>
                    {scenStatus}
                  </span>
                )}
                <span style={{ fontSize: 10, color: DIM }}>
                  {row.matchedGraph.length}g · {row.matchedContacts.length}c ·{" "}
                  {row.matchedBrain.length}b · {row.matchedDatasets.length}d
                </span>
                <span style={{ fontSize: 10, color: DIM }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "6px 12px 8px 20px", fontSize: 10,
                  borderLeft: `2px solid ${CLS_COLOR[row.cls] || CYAN}44`, marginLeft: 8 }}>

                  {/* Graph nodes */}
                  {row.matchedGraph.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>GRAPH NODES</div>
                      {row.matchedGraph.slice(0, 5).map((n, ni) => (
                        <div key={ni} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{n.label || n.id || n.name || `node-${ni}`}</span>
                          {(n.centrality_score ?? n.score ?? n.centrality) !== undefined &&
                           (n.centrality_score ?? n.score ?? n.centrality) !== null && (
                            <span style={{ fontSize: 8, color: DIM,
                              border: `1px solid ${DIM}55`, borderRadius: 2, padding: "0 3px" }}>
                              c:{parseFloat(n.centrality_score ?? n.score ?? n.centrality).toFixed(3)}
                            </span>
                          )}
                          {n.type && (
                            <span style={{ fontSize: 8, color: DIM,
                              border: `1px solid ${DIM}55`, borderRadius: 2, padding: "0 3px" }}>
                              {n.type}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Contacts */}
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>CONTACTS</div>
                      {row.matchedContacts.slice(0, 5).map((c, ci) => (
                        <div key={ci} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || `contact-${ci}`}</span>
                          {(c.role || c.title) && (
                            <span style={{ fontSize: 8, color: DIM,
                              border: `1px solid ${DIM}55`, borderRadius: 2, padding: "0 3px" }}>
                              {c.role || c.title}
                            </span>
                          )}
                          {(c.org || c.organisation || c.organization) && (
                            <span style={{ fontSize: 8, color: DIM,
                              border: `1px solid ${DIM}55`, borderRadius: 2, padding: "0 3px" }}>
                              {c.org || c.organisation || c.organization}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Brain nodes */}
                  {row.matchedBrain.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>BRAIN NODES</div>
                      {row.matchedBrain.slice(0, 5).map((b, bi) => (
                        <div key={bi} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{b.label || b.id || b.name || `brain-${bi}`}</span>
                          {b.type && (
                            <span style={{ fontSize: 8, color: DIM,
                              border: `1px solid ${DIM}55`, borderRadius: 2, padding: "0 3px" }}>
                              {b.type}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Datasets */}
                  {row.matchedDatasets.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>DATASETS</div>
                      {row.matchedDatasets.slice(0, 5).map((d, di) => (
                        <div key={di} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{d.name || d.title || `dataset-${di}`}</span>
                          {(d.row_count || d.rows || d.count) !== undefined &&
                           (d.row_count || d.rows || d.count) !== null && (
                            <span style={{ fontSize: 8, color: DIM,
                              border: `1px solid ${DIM}55`, borderRadius: 2, padding: "0 3px" }}>
                              {(d.row_count || d.rows || d.count).toLocaleString()} rows
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {row.matchedGraph.length === 0 && row.matchedContacts.length === 0 &&
                   row.matchedBrain.length === 0 && row.matchedDatasets.length === 0 && (
                    <div style={{ color: RED, fontStyle: "italic" }}>
                      No graph node, contact, brain model, or dataset matched — scenario is unarmed and cannot execute.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "6px 16px", borderTop: `1px solid ${CYAN}22`,
        fontSize: 10, color: DIM, flexShrink: 0 }}>
        Scenario × Graph × Contact × Brain × Dataset · auto-refresh 90s ·{" "}
        {rows.filter(r => r.cls === "ARMED").length} armed ·{" "}
        {rows.filter(r => r.cls === "STAGED").length} staged ·{" "}
        {rows.filter(r => r.cls === "PARTIAL").length} partial ·{" "}
        <span style={{ color: unarmed > 0 ? RED : DIM }}>{unarmed} unarmed</span>
      </div>
    </div>
  );
}
