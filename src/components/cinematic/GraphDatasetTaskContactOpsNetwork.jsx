/**
 * F163 Graph × Dataset × Task × Contact × Ops Alert
 * Full Operational Coverage Network — ◈ GDTCOA
 *
 * Fetches: /v1/graph/centrality + /v1/datasets + /entities/Task
 *          + /entities/Contact + /v1/ops/alerts
 * Keyword-matches each graph node against datasets, tasks, contacts,
 * and ops alerts to classify:
 *   GROUNDED — matched all 4 supporting sources (full operational coverage)
 *   ACTIVE   — matched 2–3 sources
 *   PARTIAL  — matched 1 source
 *   DARK     — zero matches (blind-spot nodes with no dataset backing,
 *               no task, no contact owner, no ops alert coverage)
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

const CLS_COLOR = { GROUNDED: GREEN, ACTIVE: CYAN, PARTIAL: AMBER, DARK: RED };
const CLS_ORDER = { GROUNDED: 4, ACTIVE: 3, PARTIAL: 2, DARK: 1 };

const REFRESH_MS = 90_000;

const GDTCOA_RE = /\b(gdtcoa|graph.*dataset.*task|graph.*contact.*ops|graph.*operational.*coverage|operational.*coverage.*network|node.*coverage|coverage.*network|graph.*ops.*alert|dataset.*task.*contact|blind.?spot.*node|node.*blind.?spot|dark.*node|node.*dark)\b/i;

export function isGdtcoaQuery(q) { return GDTCOA_RE.test(q || ""); }

export function buildGdtcoaScript(rows) {
  const total    = rows.length;
  const grounded = rows.filter(r => r.cls === "GROUNDED").length;
  const dark     = rows.filter(r => r.cls === "DARK").length;
  return (
    `Graph Operational Coverage Network: ${total} graph node${total !== 1 ? "s" : ""} assessed across datasets, tasks, contacts, and ops alerts. ` +
    `${grounded} fully grounded (dataset backing, task assignment, contact owner, and ops alert coverage all confirmed). ` +
    (dark > 0
      ? `${dark} dark — no dataset, no task, no contact, no ops alert. These are operational blind-spot nodes requiring immediate coverage.`
      : "No dark nodes detected — all graph nodes have operational coverage.")
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
    : Array.isArray(raw?.investments)           ? raw.investments
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

function classifyNode(node, datasets, tasks, contacts, alerts) {
  const nText = [
    node._label, node.label, node.id, node.name, node.type,
    node.category, node.description, node.tags,
  ].filter(Boolean).join(" ");
  const aToks = tokens(nText);

  const matchedDatasets = datasets.filter(d =>
    overlaps(aToks, [d._label, d.name, d.title, d.description, d.category, d.tags, d.source].join(" "))
  );
  const matchedTasks = tasks.filter(t =>
    overlaps(aToks, [t._label, t.name, t.title, t.description, t.category, t.tags, t.type].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(aToks, [c._label, c.name, c.first_name, c.last_name, c.org, c.organisation, c.role, c.tags].join(" "))
  );
  const matchedAlerts = alerts.filter(a =>
    overlaps(aToks, [a._label, a.name, a.title, a.description, a.category, a.type, a.source, a.tags].join(" "))
  );

  const sources = [
    matchedDatasets.length > 0,
    matchedTasks.length > 0,
    matchedContacts.length > 0,
    matchedAlerts.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4)      cls = "GROUNDED";
  else if (sources >= 2)  cls = "ACTIVE";
  else if (sources === 1) cls = "PARTIAL";
  else                    cls = "DARK";

  return { node, cls, matchedDatasets, matchedTasks, matchedContacts, matchedAlerts };
}

export default function GraphDatasetTaskContactOpsNetwork() {
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
      const [graphRaw, datasetsRaw, tasksRaw, contactsRaw, alertsRaw] = await Promise.all([
        fetcher("/v1/graph/centrality"),
        fetcher("/v1/datasets"),
        fetcher("/entities/Task"),
        fetcher("/entities/Contact"),
        fetcher("/v1/ops/alerts"),
      ]);

      const graphNodes = normalizeArray(graphRaw,    ["label", "id", "name", "type"]);
      const datasets   = normalizeArray(datasetsRaw, ["name", "title", "description", "source"]);
      const tasks      = normalizeArray(tasksRaw,    ["name", "title", "description", "type"]);
      const contacts   = normalizeArray(contactsRaw, ["name", "first_name", "last_name", "org"]);
      const alerts     = normalizeArray(alertsRaw,   ["name", "title", "description", "type"]);

      const built = graphNodes.map(node =>
        classifyNode(node, datasets, tasks, contacts, alerts)
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
    window.addEventListener("jarvis:gdtcoa-toggle", toggle);
    return () => window.removeEventListener("jarvis:gdtcoa-toggle", toggle);
  }, []);

  const dark = rows.filter(r => r.cls === "DARK").length;
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.node?._label || r.node?.label || r.node?.id || r.node?.name || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildGdtcoaScript(rows);
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
        title="Graph × Dataset × Task × Contact × Ops Alert — Full Operational Coverage Network"
        style={{
          position: "fixed", left: 139640, bottom: 8, zIndex: 260,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${dark > 0 ? AMBER : CYAN}`,
          color: dark > 0 ? AMBER : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: dark > 0 ? `0 0 6px ${AMBER}` : "none",
          animation: dark > 0 ? "pulse-amber 1.4s infinite" : "none",
        }}
      >
        ◈ GDTCOA{dark > 0 ? ` — ${dark} DARK` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9260,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ GDTCOA — FULL OPERATIONAL COVERAGE NETWORK
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          Graph × Dataset × Task × Contact × Ops Alert (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} nodes ·{" "}
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
          style={{ background: "none", border: "none", color: DIM,
            fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, padding: "8px 16px", flexShrink: 0,
        borderBottom: `1px solid ${CYAN}11` }}>
        {["ALL", "GROUNDED", "ACTIVE", "PARTIAL", "DARK"].map(f => (
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
          placeholder="search nodes…"
          style={{ marginLeft: "auto", background: "rgba(255,255,255,0.05)",
            border: `1px solid ${CYAN}33`, color: CYAN, borderRadius: 3,
            padding: "2px 8px", fontSize: 10, outline: "none", width: 160 }}
        />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
        {loading && <div style={{ color: DIM, fontSize: 11, padding: 8 }}>Loading…</div>}
        {error   && <div style={{ color: RED,  fontSize: 11, padding: 8 }}>Error: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 11, padding: 8 }}>No nodes match current filter.</div>
        )}
        {visible.map((row, i) => {
          const nodeLabel = row.node?._label || row.node?.label || row.node?.id || row.node?.name || `node-${i}`;
          const nodeType  = row.node?.type || row.node?.category || null;
          const nodeScore = row.node?.centrality_score ?? row.node?.score ?? row.node?.centrality ?? null;
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
                  borderRadius: 2, padding: "1px 4px", minWidth: 58, textAlign: "center" }}>
                  {row.cls}
                </span>
                <span style={{ fontSize: 11, flex: 1, color: CYAN }}>{nodeLabel}</span>
                {nodeType && (
                  <span style={{ fontSize: 9, color: DIM,
                    border: `1px solid ${DIM}55`, borderRadius: 2, padding: "1px 4px" }}>
                    {nodeType}
                  </span>
                )}
                {nodeScore !== null && nodeScore !== undefined && (
                  <span style={{ fontSize: 9, color: DIM,
                    border: `1px solid ${DIM}55`, borderRadius: 2, padding: "1px 4px" }}>
                    c:{typeof nodeScore === "number" ? nodeScore.toFixed(3) : nodeScore}
                  </span>
                )}
                <span style={{ fontSize: 10, color: DIM }}>
                  {row.matchedDatasets.length}d · {row.matchedTasks.length}t ·{" "}
                  {row.matchedContacts.length}c · {row.matchedAlerts.length}a
                </span>
                <span style={{ fontSize: 10, color: DIM }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "6px 12px 8px 20px", fontSize: 10,
                  borderLeft: `2px solid ${CLS_COLOR[row.cls] || CYAN}44`, marginLeft: 8 }}>

                  {/* Datasets */}
                  {row.matchedDatasets.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>DATASETS</div>
                      {row.matchedDatasets.slice(0, 5).map((d, di) => (
                        <div key={di} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{d._label || d.name || d.title || `dataset-${di}`}</span>
                          {(d.row_count || d.rows || d.count) !== undefined && (d.row_count || d.rows || d.count) !== null && (
                            <span style={{ fontSize: 8, color: DIM,
                              border: `1px solid ${DIM}55`, borderRadius: 2, padding: "0 3px" }}>
                              {(d.row_count || d.rows || d.count).toLocaleString()} rows
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tasks */}
                  {row.matchedTasks.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>TASKS</div>
                      {row.matchedTasks.slice(0, 5).map((t, ti) => (
                        <div key={ti} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{t._label || t.name || t.title || `task-${ti}`}</span>
                          {(t.status || t.state) && (
                            <span style={{ fontSize: 8, color: GREEN,
                              border: `1px solid ${GREEN}55`, borderRadius: 2, padding: "0 3px" }}>
                              {t.status || t.state}
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
                          <span style={{ color: CYAN }}>{c._label || c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || `contact-${ci}`}</span>
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

                  {/* Ops Alerts */}
                  {row.matchedAlerts.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>OPS ALERTS</div>
                      {row.matchedAlerts.slice(0, 5).map((a, ai) => (
                        <div key={ai} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{a._label || a.name || a.title || `alert-${ai}`}</span>
                          {(a.severity || a.level || a.priority) && (
                            <span style={{ fontSize: 8, color: RED,
                              border: `1px solid ${RED}55`, borderRadius: 2, padding: "0 3px" }}>
                              {a.severity || a.level || a.priority}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {row.matchedDatasets.length === 0 && row.matchedTasks.length === 0 &&
                   row.matchedContacts.length === 0 && row.matchedAlerts.length === 0 && (
                    <div style={{ color: AMBER, fontStyle: "italic" }}>
                      No dataset, task, contact, or ops alert matched — operational blind-spot node.
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
        Graph × Dataset × Task × Contact × Ops Alert · auto-refresh 90s ·{" "}
        {rows.filter(r => r.cls === "GROUNDED").length} grounded ·{" "}
        {rows.filter(r => r.cls === "ACTIVE").length} active ·{" "}
        {rows.filter(r => r.cls === "PARTIAL").length} partial ·{" "}
        <span style={{ color: dark > 0 ? AMBER : DIM }}>{dark} dark</span>
      </div>
    </div>
  );
}
