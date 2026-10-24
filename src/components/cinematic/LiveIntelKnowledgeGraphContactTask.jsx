/**
 * F167 LiveIntel × Knowledge × Graph × Contact × Task
 * Live Intelligence Activation Map — ◈ LKGCTM
 *
 * Fetches: /functions/getLiveIntel + /knowledge/ + /v1/graph/centrality
 *          + /entities/Contact + /entities/Task
 * Groups live events by category (quake region, crypto symbol, FX pair),
 * cross-references each category against knowledge articles, graph nodes,
 * contacts, and tasks to classify:
 *   ACTIVATED — matched all 4 supporting sources (fully grounded live category)
 *   ANCHORED  — matched 2–3 sources
 *   PARTIAL   — matched 1 source
 *   DARK      — zero matches (live event categories with no knowledge article,
 *               no graph trace, no contact owner, no task — blind activation spots)
 * Red pulse on DARK count.
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

const CLS_COLOR = { ACTIVATED: GREEN, ANCHORED: CYAN, PARTIAL: AMBER, DARK: RED };
const CLS_ORDER = { ACTIVATED: 4, ANCHORED: 3, PARTIAL: 2, DARK: 1 };

const REFRESH_MS = 90_000;

const LKGCTM_RE = /\b(lkgctm|live.*intel.*knowledge|live.*intel.*graph|live.*activation.*map|live.*knowledge.*graph|live.*contact.*task|live.*event.*knowledge|live.*event.*contact|live.*event.*task|activation.*map|live.*blind.*spot|dark.*activation|unactivated.*event|live.*intel.*contact)\b/i;

export function isLkgctmQuery(q) { return LKGCTM_RE.test(q || ""); }

export function buildLkgctmScript(rows) {
  const total     = rows.length;
  const activated = rows.filter(r => r.cls === "ACTIVATED").length;
  const dark      = rows.filter(r => r.cls === "DARK").length;
  return (
    `Live Intelligence Activation Map: ${total} live event categor${total !== 1 ? "ies" : "y"} assessed across knowledge, graph, contacts, and tasks. ` +
    `${activated} fully activated (knowledge article, graph trace, contact owner, and task all confirmed). ` +
    (dark > 0
      ? `${dark} dark — no knowledge article, no graph trace, no contact owner, no task. These live event categories are full activation blind spots with zero intelligence grounding.`
      : "No dark categories — all live event types have full intelligence activation coverage.")
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
  return Array.isArray(raw)                ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : Array.isArray(raw?.articles)         ? raw.articles
    : Array.isArray(raw?.nodes)            ? raw.nodes
    : Array.isArray(raw?.contacts)         ? raw.contacts
    : Array.isArray(raw?.tasks)            ? raw.tasks
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

function extractLiveCategories(intelRaw) {
  const cats = {};
  const add = (key, label) => {
    if (!cats[key]) cats[key] = { key, label, examples: [] };
  };

  const quakes = normalizeArray(intelRaw?.earthquakes ?? intelRaw?.quakes);
  quakes.forEach(q => {
    const region = q.place || q.location || q.region || q.area || "Unknown Region";
    const key = `quake:${region.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 32)}`;
    add(key, `Quake — ${region}`);
    cats[key].examples.push(q);
  });

  const crypto = normalizeArray(intelRaw?.crypto ?? intelRaw?.cryptocurrency);
  crypto.forEach(c => {
    const sym = c.symbol || c.name || c.id || "UNKNOWN";
    const key = `crypto:${sym.toLowerCase()}`;
    add(key, `Crypto — ${sym.toUpperCase()}`);
    cats[key].examples.push(c);
  });

  const fx = normalizeArray(intelRaw?.fx ?? intelRaw?.forex ?? intelRaw?.currency);
  fx.forEach(f => {
    const pair = f.pair || f.symbol || f.name || "UNKNOWN";
    const key = `fx:${pair.toLowerCase()}`;
    add(key, `FX — ${pair.toUpperCase()}`);
    cats[key].examples.push(f);
  });

  return Object.values(cats);
}

function classifyCategory(cat, knowledge, graphNodes, contacts, tasks) {
  const cText = cat.label + " " + cat.examples.map(e =>
    [e.place, e.location, e.region, e.area, e.symbol, e.name, e.pair, e.description, e.category].filter(Boolean).join(" ")
  ).join(" ");
  const aToks = tokens(cText);

  const matchedKnowledge = knowledge.filter(k =>
    overlaps(aToks, [k.title, k.name, k.content, k.summary, k.description, k.category, k.tags].join(" "))
  );
  const matchedGraph = graphNodes.filter(n =>
    overlaps(aToks, [n.label, n.id, n.name, n.type, n.category, n.description].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(aToks, [c.name, c.first_name, c.last_name, c.org, c.organisation, c.role, c.tags].join(" "))
  );
  const matchedTasks = tasks.filter(t =>
    overlaps(aToks, [t.title, t.name, t.description, t.category, t.type, t.tags, t.status].join(" "))
  );

  const sources = [
    matchedKnowledge.length > 0,
    matchedGraph.length > 0,
    matchedContacts.length > 0,
    matchedTasks.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4)      cls = "ACTIVATED";
  else if (sources >= 2)  cls = "ANCHORED";
  else if (sources === 1) cls = "PARTIAL";
  else                    cls = "DARK";

  return { cat, cls, matchedKnowledge, matchedGraph, matchedContacts, matchedTasks };
}

export default function LiveIntelKnowledgeGraphContactTask() {
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
      const [intelRaw, knowledgeRaw, graphRaw, contactsRaw, tasksRaw] = await Promise.all([
        fetcher("/functions/getLiveIntel"),
        fetcher("/knowledge/"),
        fetcher("/v1/graph/centrality"),
        fetcher("/entities/Contact"),
        fetcher("/entities/Task"),
      ]);

      const categories = extractLiveCategories(intelRaw);
      const knowledge  = normalizeArray(knowledgeRaw);
      const graphNodes = normalizeArray(graphRaw?.nodes ?? graphRaw);
      const contacts   = normalizeArray(contactsRaw);
      const tasks      = normalizeArray(tasksRaw);

      const built = categories.map(cat =>
        classifyCategory(cat, knowledge, graphNodes, contacts, tasks)
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
    window.addEventListener("jarvis:lkgctm-toggle", toggle);
    return () => window.removeEventListener("jarvis:lkgctm-toggle", toggle);
  }, []);

  const darkCount = rows.filter(r => r.cls === "DARK").length;
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.cat?.label || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildLkgctmScript(rows);
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
        title="LiveIntel × Knowledge × Graph × Contact × Task — Live Intelligence Activation Map"
        style={{
          position: "fixed", left: 141880, bottom: 8, zIndex: 264,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${darkCount > 0 ? RED : CYAN}`,
          color: darkCount > 0 ? RED : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: darkCount > 0 ? `0 0 6px ${RED}` : "none",
          animation: darkCount > 0 ? "pulse-red 1.4s infinite" : "none",
        }}
      >
        ◈ LKGCTM{darkCount > 0 ? ` — ${darkCount} DARK` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9264,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ LKGCTM — LIVE INTELLIGENCE ACTIVATION MAP
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          LiveIntel × Knowledge × Graph × Contact × Task (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} live categor{rows.length !== 1 ? "ies" : "y"} ·{" "}
          {darkCount > 0
            ? <span style={{ color: RED, fontWeight: 700 }}>{darkCount} DARK</span>
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
        {["ALL", "ACTIVATED", "ANCHORED", "PARTIAL", "DARK"].map(f => (
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
          placeholder="search categories…"
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
          <div style={{ color: DIM, fontSize: 11, padding: 8 }}>No categories match current filter.</div>
        )}
        {visible.map((row, i) => {
          const catLabel = row.cat?.label || `category-${i}`;
          const isExp    = expanded[i];
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
                  borderRadius: 2, padding: "1px 4px", minWidth: 68, textAlign: "center" }}>
                  {row.cls}
                </span>
                <span style={{ fontSize: 11, flex: 1, color: CYAN }}>{catLabel}</span>
                <span style={{ fontSize: 10, color: DIM }}>
                  {row.matchedKnowledge.length}k · {row.matchedGraph.length}g ·{" "}
                  {row.matchedContacts.length}c · {row.matchedTasks.length}t
                </span>
                <span style={{ fontSize: 10, color: DIM }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "6px 12px 8px 20px", fontSize: 10,
                  borderLeft: `2px solid ${CLS_COLOR[row.cls] || CYAN}44`, marginLeft: 8 }}>

                  {/* Knowledge */}
                  {row.matchedKnowledge.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>KNOWLEDGE ARTICLES</div>
                      {row.matchedKnowledge.slice(0, 5).map((k, ki) => (
                        <div key={ki} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{k.title || k.name || `article-${ki}`}</span>
                          {(k.category || k.type) && (
                            <span style={{ fontSize: 9, color: AMBER,
                              border: `1px solid ${AMBER}55`, borderRadius: 2, padding: "1px 4px" }}>
                              {k.category || k.type}
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

                  {/* Contacts */}
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>CONTACTS</div>
                      {row.matchedContacts.slice(0, 5).map((c, ci) => (
                        <div key={ci} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>
                            {c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || `contact-${ci}`}
                          </span>
                          {c.role && (
                            <span style={{ fontSize: 9, color: GREEN,
                              border: `1px solid ${GREEN}55`, borderRadius: 2, padding: "1px 4px" }}>
                              {c.role}
                            </span>
                          )}
                          {(c.org || c.organisation) && (
                            <span style={{ fontSize: 9, color: DIM }}>
                              {c.org || c.organisation}
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
                          <span style={{ color: CYAN }}>{t.title || t.name || `task-${ti}`}</span>
                          {t.status && (
                            <span style={{ fontSize: 9,
                              color: t.status === "completed" ? GREEN : t.status === "in_progress" ? CYAN : AMBER,
                              border: `1px solid ${t.status === "completed" ? GREEN : t.status === "in_progress" ? CYAN : AMBER}55`,
                              borderRadius: 2, padding: "1px 4px" }}>
                              {t.status}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {row.matchedKnowledge.length === 0 && row.matchedGraph.length === 0 &&
                   row.matchedContacts.length === 0 && row.matchedTasks.length === 0 && (
                    <div style={{ color: RED, fontStyle: "italic" }}>
                      No knowledge article, no graph trace, no contact, no task — full activation blind spot.
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
        Auto-refresh every 90s · {rows.length} live categor{rows.length !== 1 ? "ies" : "y"} assessed ·{" "}
        ACTIVATED:{rows.filter(r => r.cls === "ACTIVATED").length} ·{" "}
        ANCHORED:{rows.filter(r => r.cls === "ANCHORED").length} ·{" "}
        PARTIAL:{rows.filter(r => r.cls === "PARTIAL").length} ·{" "}
        <span style={{ color: darkCount > 0 ? RED : DIM }}>
          DARK:{darkCount}
        </span>
      </div>
    </div>
  );
}
