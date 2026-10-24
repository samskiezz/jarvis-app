/**
 * F157 Dataset × Knowledge × Graph × Ops Alert
 * Intelligence Evidence Saturation Index — ◈ DKGOAD
 *
 * Fetches: /v1/datasets + /knowledge/ + /v1/graph/centrality + /v1/ops/alerts
 * Keyword-matches each dataset against knowledge articles, graph centrality
 * nodes, and ops alerts to classify:
 *   SATURATED — matched all 3 intelligence sources (full evidence coverage)
 *   INDEXED   — matched 2 sources
 *   MONITORED — matched 1 source
 *   DARK      — zero matches (blind-spot data with no knowledge article,
 *                no graph trace, no ops alert coverage)
 * Amber pulse on DARK count.
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

const CLS_COLOR = { SATURATED: GREEN, INDEXED: CYAN, MONITORED: AMBER, DARK: RED };
const CLS_ORDER = { SATURATED: 4, INDEXED: 3, MONITORED: 2, DARK: 1 };

const REFRESH_MS = 90_000;

const DKGOAD_RE = /\b(dkgoad|dataset.*knowledge.*graph|dataset.*evidence.*saturation|dataset.*intelligence.*saturation|knowledge.*graph.*ops.*alert|dataset.*graph.*alert|data.*intelligence.*saturation|evidence.*saturation|dataset.*coverage.*saturation|blind.*spot.*dataset|dark.*dataset|dataset.*dark|unmonitored.*dataset|dataset.*unindexed|intelligence.*evidence.*index|data.*evidence.*index|saturation.*index)\b/i;

export function isDkgoadQuery(q) { return DKGOAD_RE.test(q || ""); }

export function buildDkgoadScript(rows) {
  const total     = rows.length;
  const saturated = rows.filter(r => r.cls === "SATURATED").length;
  const dark      = rows.filter(r => r.cls === "DARK").length;
  return (
    `Intelligence Evidence Saturation Index: ${total} dataset${total !== 1 ? "s" : ""} assessed across knowledge articles, graph centrality nodes, and ops alerts. ` +
    `${saturated} fully saturated (knowledge article, graph trace, and ops alert all confirmed). ` +
    (dark > 0
      ? `${dark} dark — no knowledge article, no graph trace, no ops alert coverage. These are blind-spot datasets with zero intelligence grounding requiring immediate attention.`
      : "No dark datasets detected — all data sources have intelligence coverage.")
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
  const arr = Array.isArray(raw)                ? raw
    : Array.isArray(raw?.data)                  ? raw.data
    : Array.isArray(raw?.items)                 ? raw.items
    : Array.isArray(raw?.results)               ? raw.results
    : Array.isArray(raw?.nodes)                 ? raw.nodes
    : Array.isArray(raw?.articles)              ? raw.articles
    : Array.isArray(raw?.reports)               ? raw.reports
    : Array.isArray(raw?.skills)                ? raw.skills
    : Array.isArray(raw?.datasets)              ? raw.datasets
    : Array.isArray(raw?.scenarios)             ? raw.scenarios
    : Array.isArray(raw?.alerts)                ? raw.alerts
    : Array.isArray(raw?.investigations)        ? raw.investigations
    : Array.isArray(raw?.contacts)              ? raw.contacts
    : Array.isArray(raw?.profiles)              ? raw.profiles
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

function classifyDataset(dataset, knowledge, graphNodes, alerts) {
  const dText = [
    dataset._label, dataset.name, dataset.title, dataset.description,
    dataset.category, dataset.tags, dataset.source, dataset.type,
  ].filter(Boolean).join(" ");
  const aToks = tokens(dText);

  const matchedKnowledge = knowledge.filter(k =>
    overlaps(aToks, [k._label, k.name, k.title, k.category, k.description, k.tags, k.topic].join(" "))
  );
  const matchedGraph = graphNodes.filter(g =>
    overlaps(aToks, [g._label, g.name, g.id, g.label, g.type, g.category].join(" "))
  );
  const matchedAlerts = alerts.filter(a =>
    overlaps(aToks, [a._label, a.name, a.title, a.type, a.category, a.description, a.source, a.message].join(" "))
  );

  const sources = [
    matchedKnowledge.length > 0,
    matchedGraph.length > 0,
    matchedAlerts.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 3)      cls = "SATURATED";
  else if (sources === 2) cls = "INDEXED";
  else if (sources === 1) cls = "MONITORED";
  else                    cls = "DARK";

  return { dataset, cls, matchedKnowledge, matchedGraph, matchedAlerts };
}

export default function DatasetKnowledgeGraphOpsAlertSaturation() {
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
      const [datasetsRaw, knowledgeRaw, graphRaw, alertsRaw] = await Promise.all([
        fetcher("/v1/datasets"),
        fetcher("/knowledge/"),
        fetcher("/v1/graph/centrality"),
        fetcher("/v1/ops/alerts"),
      ]);

      const datasets    = normalizeArray(datasetsRaw,  ["name", "title", "description", "category"]);
      const knowledge   = normalizeArray(knowledgeRaw, ["title", "name", "category", "topic", "description"]);
      const graphNodes  = normalizeArray(graphRaw,     ["name", "label", "id", "type", "category"]);
      const alerts      = normalizeArray(alertsRaw,    ["title", "name", "type", "category", "message"]);

      const built = datasets.map(ds =>
        classifyDataset(ds, knowledge, graphNodes, alerts)
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
    window.addEventListener("jarvis:dkgoad-toggle", toggle);
    return () => window.removeEventListener("jarvis:dkgoad-toggle", toggle);
  }, []);

  const dark    = rows.filter(r => r.cls === "DARK").length;
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.dataset?._label || r.dataset?.name || r.dataset?.title || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildDkgoadScript(rows);
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
        title="Dataset × Knowledge × Graph × Ops Alert — Intelligence Evidence Saturation Index"
        style={{
          position: "fixed", left: 136280, bottom: 8, zIndex: 254,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${dark > 0 ? AMBER : CYAN}`,
          color: dark > 0 ? AMBER : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: dark > 0 ? `0 0 6px ${AMBER}` : "none",
          animation: dark > 0 ? "pulse-amber 1.4s infinite" : "none",
        }}
      >
        ◈ DKGOAD{dark > 0 ? ` — ${dark} DARK` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9254,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ DKGOAD — INTELLIGENCE EVIDENCE SATURATION INDEX
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          Dataset × Knowledge × Graph × Ops Alert (4-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} datasets ·{" "}
          {dark > 0
            ? <span style={{ color: AMBER, fontWeight: 700 }}>{dark} DARK</span>
            : <span style={{ color: GREEN }}>0 dark</span>}
        </span>
        <button onClick={assess} disabled={assessing || rows.length === 0}
          style={{ background: "none", border: `1px solid ${CYAN}`, color: CYAN,
            borderRadius: 3, padding: "2px 10px", fontSize: 11, cursor: "pointer" }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: DIM, fontSize: 16, cursor: "pointer" }}>
          ✕
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, padding: "8px 16px", flexShrink: 0,
        borderBottom: `1px solid ${CYAN}11` }}>
        {["ALL", "SATURATED", "INDEXED", "MONITORED", "DARK"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              background: filter === f ? `${CLS_COLOR[f] || CYAN}22` : "none",
              border: `1px solid ${filter === f ? (CLS_COLOR[f] || CYAN) : DIM}`,
              color: filter === f ? (CLS_COLOR[f] || CYAN) : DIM,
              borderRadius: 3, padding: "2px 8px", fontSize: 10, cursor: "pointer",
            }}>
            {f}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search dataset…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.06)",
            border: `1px solid ${CYAN}33`, color: CYAN, borderRadius: 3,
            padding: "2px 8px", fontSize: 10, outline: "none", width: 200 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
        {loading && <div style={{ color: DIM, fontSize: 12, padding: 8 }}>Loading…</div>}
        {error && <div style={{ color: RED, fontSize: 12, padding: 8 }}>Error: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 12, padding: 8 }}>No datasets match current filter.</div>
        )}
        {visible.map((row, i) => {
          const key   = row.dataset._label || row.dataset.name || row.dataset.title || i;
          const isExp = !!expanded[key];
          const col   = CLS_COLOR[row.cls];
          const rowCount = row.dataset.row_count ?? row.dataset.rows ?? row.dataset.count;
          return (
            <div key={key} style={{ marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 8px", borderRadius: 4, cursor: "pointer",
                  background: "rgba(41,231,255,0.03)",
                  border: `1px solid ${col}33`,
                }}
              >
                <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 90 }}>
                  {row.cls}
                </span>
                <span style={{ fontSize: 11, flex: 1, color: "#c8e8f8" }}>
                  {row.dataset._label || row.dataset.name || row.dataset.title || "(dataset)"}
                </span>
                {rowCount != null && (
                  <span style={{ color: CYAN, background: `${CYAN}18`, borderRadius: 2,
                    padding: "0 4px", fontSize: 9 }}>{rowCount} rows</span>
                )}
                <span style={{ fontSize: 10, color: DIM }}>
                  K:{row.matchedKnowledge.length} G:{row.matchedGraph.length} A:{row.matchedAlerts.length}
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "4px 12px 4px 20px", fontSize: 10,
                  borderLeft: `1px solid ${col}44`, marginLeft: 8, marginTop: 2 }}>
                  {row.matchedKnowledge.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: GREEN, fontWeight: 700 }}>Knowledge ({row.matchedKnowledge.length}):</span>
                      {row.matchedKnowledge.slice(0, 6).map((k, ki) => {
                        const cat = k.category || k.topic;
                        return (
                          <span key={ki} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {k._label || k.title || k.name}
                            {cat && (
                              <span style={{ color: GREEN, background: `${GREEN}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {cat}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedGraph.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: CYAN, fontWeight: 700 }}>Graph Nodes ({row.matchedGraph.length}):</span>
                      {row.matchedGraph.slice(0, 6).map((g, gi) => {
                        const score = g.centrality != null ? Number(g.centrality).toFixed(3) : (g.score != null ? Number(g.score).toFixed(3) : null);
                        return (
                          <span key={gi} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {g._label || g.name || g.label || g.id}
                            {score && (
                              <span style={{ color: CYAN, background: `${CYAN}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {score}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedAlerts.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: AMBER, fontWeight: 700 }}>Ops Alerts ({row.matchedAlerts.length}):</span>
                      {row.matchedAlerts.slice(0, 6).map((a, ai) => {
                        const sev = a.severity || a.level || a.priority;
                        return (
                          <span key={ai} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {a._label || a.title || a.name || a.message}
                            {sev && (
                              <span style={{ color: AMBER, background: `${AMBER}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {sev}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedKnowledge.length === 0 && row.matchedGraph.length === 0 &&
                   row.matchedAlerts.length === 0 && (
                    <span style={{ color: DIM }}>No intelligence sources matched — dark dataset (zero evidence coverage).</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
