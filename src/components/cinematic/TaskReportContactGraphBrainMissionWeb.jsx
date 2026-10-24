/**
 * F158 Task × Report × Contact × Graph × Brain
 * Mission Execution Intelligence Web — ◈ TRCGBX
 *
 * Fetches: /entities/Task + /v1/reports + /entities/Contact
 *        + /v1/graph/centrality + /v1/cinematic/brain
 * Keyword-matches each task against reports, contacts, graph nodes,
 * and brain nodes to classify:
 *   EXECUTING — matched all 4 intelligence sources (full mission grounding)
 *   DOCUMENTED — matched 3 sources
 *   STAFFED   — matched 2 sources
 *   ADRIFT    — zero or 1 match (mission dead-ends with no report trail,
 *                no contact owner, no graph trace, no brain grounding)
 * Red pulse on ADRIFT count.
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

const CLS_COLOR = { EXECUTING: GREEN, DOCUMENTED: CYAN, STAFFED: AMBER, ADRIFT: RED };
const CLS_ORDER = { EXECUTING: 4, DOCUMENTED: 3, STAFFED: 2, ADRIFT: 1 };

const REFRESH_MS = 90_000;

const TRCGBX_RE = /\b(trcgbx|task.*report.*contact|task.*graph.*brain|mission.*execution.*web|mission.*intelligence.*web|mission.*execution.*intel|task.*brain.*graph|adrift.*task|task.*adrift|task.*mission.*web|mission.*web.*intel|task.*contact.*graph|task.*report.*brain|task.*execution.*depth|mission.*grounding|task.*operational.*web|task.*grounding)\b/i;

export function isTrcgbxQuery(q) { return TRCGBX_RE.test(q || ""); }

export function buildTrcgbxScript(rows) {
  const total     = rows.length;
  const executing = rows.filter(r => r.cls === "EXECUTING").length;
  const adrift    = rows.filter(r => r.cls === "ADRIFT").length;
  return (
    `Mission Execution Intelligence Web: ${total} task${total !== 1 ? "s" : ""} assessed across reports, contacts, graph centrality nodes, and brain model. ` +
    `${executing} fully executing (report trail, contact owner, graph trace, and brain model all confirmed). ` +
    (adrift > 0
      ? `${adrift} adrift — no report trail, no contact owner, no graph trace, no brain grounding. These are mission dead-ends with zero execution intelligence requiring immediate operational attention.`
      : "No adrift tasks detected — all missions have execution intelligence coverage.")
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
    : Array.isArray(raw?.tasks)                 ? raw.tasks
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

function classifyTask(task, reports, contacts, graphNodes, brainNodes) {
  const tText = [
    task._label, task.name, task.title, task.description,
    task.category, task.tags, task.type, task.status,
  ].filter(Boolean).join(" ");
  const aToks = tokens(tText);

  const matchedReports = reports.filter(r =>
    overlaps(aToks, [r._label, r.name, r.title, r.description, r.tags, r.category, r.type].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(aToks, [c._label, c.name, c.title, c.role, c.organization, c.org, c.department, c.tags].join(" "))
  );
  const matchedGraph = graphNodes.filter(g =>
    overlaps(aToks, [g._label, g.name, g.id, g.label, g.type, g.category].join(" "))
  );
  const matchedBrain = brainNodes.filter(b =>
    overlaps(aToks, [b._label, b.name, b.label, b.id, b.type, b.category].join(" "))
  );

  const sources = [
    matchedReports.length > 0,
    matchedContacts.length > 0,
    matchedGraph.length > 0,
    matchedBrain.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources >= 4)     cls = "EXECUTING";
  else if (sources >= 3) cls = "DOCUMENTED";
  else if (sources >= 2) cls = "STAFFED";
  else                   cls = "ADRIFT";

  return { task, cls, matchedReports, matchedContacts, matchedGraph, matchedBrain };
}

export default function TaskReportContactGraphBrainMissionWeb() {
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
      const [tasksRaw, reportsRaw, contactsRaw, graphRaw, brainRaw] = await Promise.all([
        fetcher("/entities/Task"),
        fetcher("/v1/reports"),
        fetcher("/entities/Contact"),
        fetcher("/v1/graph/centrality"),
        fetcher("/v1/cinematic/brain"),
      ]);

      const tasks      = normalizeArray(tasksRaw,    ["name", "title", "description", "category"]);
      const reports    = normalizeArray(reportsRaw,  ["title", "name", "description", "category"]);
      const contacts   = normalizeArray(contactsRaw, ["name", "title", "role", "organization"]);
      const graphNodes = normalizeArray(graphRaw,    ["name", "label", "id", "type", "category"]);
      const brainNodes = normalizeArray(brainRaw,    ["name", "label", "id", "type", "category"]);

      const built = tasks.map(t =>
        classifyTask(t, reports, contacts, graphNodes, brainNodes)
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
    window.addEventListener("jarvis:trcgbx-toggle", toggle);
    return () => window.removeEventListener("jarvis:trcgbx-toggle", toggle);
  }, []);

  const adrift  = rows.filter(r => r.cls === "ADRIFT").length;
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.task?._label || r.task?.name || r.task?.title || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildTrcgbxScript(rows);
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
        title="Task × Report × Contact × Graph × Brain — Mission Execution Intelligence Web"
        style={{
          position: "fixed", left: 136840, bottom: 8, zIndex: 255,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${adrift > 0 ? RED : CYAN}`,
          color: adrift > 0 ? RED : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: adrift > 0 ? `0 0 6px ${RED}` : "none",
          animation: adrift > 0 ? "pulse-red 1.4s infinite" : "none",
        }}
      >
        ◈ TRCGBX{adrift > 0 ? ` — ${adrift} ADRIFT` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9255,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ TRCGBX — MISSION EXECUTION INTELLIGENCE WEB
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          Task × Report × Contact × Graph × Brain (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} tasks ·{" "}
          {adrift > 0
            ? <span style={{ color: RED, fontWeight: 700 }}>{adrift} ADRIFT</span>
            : <span style={{ color: GREEN }}>0 adrift</span>}
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
        {["ALL", "EXECUTING", "DOCUMENTED", "STAFFED", "ADRIFT"].map(f => (
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
          placeholder="search task…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.06)",
            border: `1px solid ${CYAN}33`, color: CYAN, borderRadius: 3,
            padding: "2px 8px", fontSize: 10, outline: "none", width: 200 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
        {loading && <div style={{ color: DIM, fontSize: 12, padding: 8 }}>Loading…</div>}
        {error && <div style={{ color: RED, fontSize: 12, padding: 8 }}>Error: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 12, padding: 8 }}>No tasks match current filter.</div>
        )}
        {visible.map((row, i) => {
          const key   = row.task._label || row.task.name || row.task.title || i;
          const isExp = !!expanded[key];
          const col   = CLS_COLOR[row.cls];
          const status = row.task.status || row.task.state;
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
                  {row.task._label || row.task.name || row.task.title || "(task)"}
                </span>
                {status && (
                  <span style={{ color: CYAN, background: `${CYAN}18`, borderRadius: 2,
                    padding: "0 4px", fontSize: 9 }}>{status}</span>
                )}
                <span style={{ fontSize: 10, color: DIM }}>
                  R:{row.matchedReports.length} C:{row.matchedContacts.length} G:{row.matchedGraph.length} B:{row.matchedBrain.length}
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "4px 12px 4px 20px", fontSize: 10,
                  borderLeft: `1px solid ${col}44`, marginLeft: 8, marginTop: 2 }}>
                  {row.matchedReports.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: GREEN, fontWeight: 700 }}>Reports ({row.matchedReports.length}):</span>
                      {row.matchedReports.slice(0, 6).map((r, ri) => {
                        const date = r.date || r.created_at || r.timestamp;
                        return (
                          <span key={ri} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {r._label || r.title || r.name}
                            {date && (
                              <span style={{ color: GREEN, background: `${GREEN}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {String(date).slice(0, 10)}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: CYAN, fontWeight: 700 }}>Contacts ({row.matchedContacts.length}):</span>
                      {row.matchedContacts.slice(0, 6).map((c, ci) => {
                        const role = c.role || c.title;
                        const org  = c.organization || c.org || c.company;
                        return (
                          <span key={ci} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {c._label || c.name}
                            {(role || org) && (
                              <span style={{ color: CYAN, background: `${CYAN}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {[role, org].filter(Boolean).join(" / ")}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedGraph.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: AMBER, fontWeight: 700 }}>Graph Nodes ({row.matchedGraph.length}):</span>
                      {row.matchedGraph.slice(0, 6).map((g, gi) => {
                        const score = g.centrality != null ? Number(g.centrality).toFixed(3) : (g.score != null ? Number(g.score).toFixed(3) : null);
                        return (
                          <span key={gi} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {g._label || g.name || g.label || g.id}
                            {score && (
                              <span style={{ color: AMBER, background: `${AMBER}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {score}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedBrain.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: "#BF7FFF", fontWeight: 700 }}>Brain Nodes ({row.matchedBrain.length}):</span>
                      {row.matchedBrain.slice(0, 6).map((b, bi) => {
                        const score = b.centrality != null ? Number(b.centrality).toFixed(3) : null;
                        return (
                          <span key={bi} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {b._label || b.name || b.label || b.id}
                            {score && (
                              <span style={{ color: "#BF7FFF", background: "#BF7FFF18",
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {score}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedReports.length === 0 && row.matchedContacts.length === 0 &&
                   row.matchedGraph.length === 0 && row.matchedBrain.length === 0 && (
                    <span style={{ color: DIM }}>No intelligence sources matched — adrift task (zero mission execution grounding).</span>
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
