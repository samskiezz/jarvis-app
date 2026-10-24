/**
 * F159 IntelProfile × Graph × Knowledge × Skill
 * Intelligence Asset Audit — ◈ IGKAUD
 *
 * Fetches: /entities/IntelProfile + /v1/graph/centrality
 *        + /knowledge/ + /v1/aip/skill
 * Keyword-matches each intel profile against graph centrality nodes,
 * knowledge articles, and skills to classify:
 *   GROUNDED  — matched all 3 intelligence sources (full asset grounding)
 *   NETWORKED — matched 2 sources
 *   KNOWN     — matched 1 source
 *   DORMANT   — zero matches (intel profiles with no graph trace,
 *                no knowledge article, no skill match — intelligence dead-ends)
 * Red pulse on DORMANT count.
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

const CLS_COLOR = { GROUNDED: GREEN, NETWORKED: CYAN, KNOWN: AMBER, DORMANT: RED };
const CLS_ORDER = { GROUNDED: 4, NETWORKED: 3, KNOWN: 2, DORMANT: 1 };

const REFRESH_MS = 90_000;

const IGKAUD_RE = /\b(igkaud|intel.*profile.*graph|intel.*profile.*knowledge|intel.*profile.*skill|intel.*asset.*audit|intelligence.*asset.*audit|dormant.*intel|intel.*dormant|intel.*grounded|intel.*networked|intel.*graph.*skill|intel.*knowledge.*skill|profile.*graph.*knowledge|profile.*knowledge.*skill|intel.*graph.*knowledge|intel.*skill.*audit|intel.*profile.*audit)\b/i;

export function isIgkaudQuery(q) { return IGKAUD_RE.test(q || ""); }

export function buildIgkaudScript(rows) {
  const total    = rows.length;
  const grounded = rows.filter(r => r.cls === "GROUNDED").length;
  const dormant  = rows.filter(r => r.cls === "DORMANT").length;
  return (
    `Intelligence Asset Audit: ${total} intel profile${total !== 1 ? "s" : ""} assessed across graph centrality nodes, knowledge articles, and skills. ` +
    `${grounded} fully grounded (graph trace, knowledge article, and skill match all confirmed). ` +
    (dormant > 0
      ? `${dormant} dormant — no graph trace, no knowledge article, no skill match. These are intelligence dead-ends with zero asset grounding requiring immediate remediation.`
      : "No dormant intel profiles detected — all intelligence assets have grounding coverage.")
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
  return Array.isArray(raw)                 ? raw
    : Array.isArray(raw?.data)              ? raw.data
    : Array.isArray(raw?.items)             ? raw.items
    : Array.isArray(raw?.results)           ? raw.results
    : Array.isArray(raw?.nodes)             ? raw.nodes
    : Array.isArray(raw?.articles)          ? raw.articles
    : Array.isArray(raw?.reports)           ? raw.reports
    : Array.isArray(raw?.skills)            ? raw.skills
    : Array.isArray(raw?.datasets)          ? raw.datasets
    : Array.isArray(raw?.scenarios)         ? raw.scenarios
    : Array.isArray(raw?.alerts)            ? raw.alerts
    : Array.isArray(raw?.investigations)    ? raw.investigations
    : Array.isArray(raw?.contacts)          ? raw.contacts
    : Array.isArray(raw?.profiles)          ? raw.profiles
    : Array.isArray(raw?.tasks)             ? raw.tasks
    : [];
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
  if (!r.ok) return null;
  return r.json();
}

async function fetchKnowledge() {
  const paths = ["/knowledge/", "/v1/knowledge", "/api/knowledge"];
  for (const p of paths) {
    try {
      const j = await fetchJson(`${apiBase()}${p}`);
      const arr = normalizeArray(j);
      if (arr.length) return arr;
    } catch { /* try next */ }
  }
  return [];
}

async function fetchAll() {
  const [profilesRaw, graphRaw, knowledgeArr, skillsRaw] = await Promise.all([
    fetchJson(`${apiBase()}/entities/IntelProfile`).catch(() => null),
    fetchJson(`${apiBase()}/v1/graph/centrality`).catch(() => null),
    fetchKnowledge(),
    fetchJson(`${apiBase()}/v1/aip/skill`).catch(() => null),
  ]);

  const profiles  = normalizeArray(profilesRaw).map(p => ({
    ...p, _label: p.name || p.title || p.label || p.id || "Unknown Profile",
  }));
  const graph     = normalizeArray(graphRaw).map(g => ({
    ...g, _label: g.name || g.label || g.entity || g.id || "",
  }));
  const knowledge = knowledgeArr.map(a => ({
    ...a, _label: a.title || a.name || a.heading || a.id || "",
  }));
  const skills    = normalizeArray(skillsRaw).map(s => ({
    ...s, _label: s.name || s.title || s.skill_name || s.id || "",
  }));

  return { profiles, graph, knowledge, skills };
}

function classify(matchedGraph, matchedKnowledge, matchedSkills) {
  const count = (matchedGraph.length > 0 ? 1 : 0)
              + (matchedKnowledge.length > 0 ? 1 : 0)
              + (matchedSkills.length > 0 ? 1 : 0);
  if (count === 3) return "GROUNDED";
  if (count === 2) return "NETWORKED";
  if (count === 1) return "KNOWN";
  return "DORMANT";
}

function buildRows(profiles, graph, knowledge, skills) {
  return profiles.map(p => {
    const pt = tokens(p._label + " " + (p.category || "") + " " + (p.description || "") + " " + (p.summary || ""));
    const matchedGraph     = graph.filter(g => overlaps(pt, g._label + " " + (g.type || "") + " " + (g.description || "")));
    const matchedKnowledge = knowledge.filter(a => overlaps(pt, a._label + " " + (a.category || "") + " " + (a.content || "") + " " + (a.summary || "")));
    const matchedSkills    = skills.filter(s => overlaps(pt, s._label + " " + (s.category || "") + " " + (s.description || "")));
    return {
      ...p,
      matchedGraph,
      matchedKnowledge,
      matchedSkills,
      cls: classify(matchedGraph, matchedKnowledge, matchedSkills),
    };
  }).sort((a, b) => CLS_ORDER[b.cls] - CLS_ORDER[a.cls] || a._label.localeCompare(b._label));
}

export default function IntelProfileGraphKnowledgeSkillAudit() {
  const [open,      setOpen]     = useState(false);
  const [rows,      setRows]     = useState([]);
  const [loading,   setLoading]  = useState(false);
  const [error,     setError]    = useState(null);
  const [filter,    setFilter]   = useState("ALL");
  const [search,    setSearch]   = useState("");
  const [expanded,  setExpanded] = useState({});
  const [assessing, setAssessing]= useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { profiles, graph, knowledge, skills } = await fetchAll();
      setRows(buildRows(profiles, graph, knowledge, skills));
    } catch (e) {
      setError(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:igkaud-toggle", toggle);
    return () => window.removeEventListener("jarvis:igkaud-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const dormantCount = rows.filter(r => r.cls === "DORMANT").length;

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r._label.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  async function assess() {
    if (!rows.length) return;
    setAssessing(true);
    try {
      const script = buildIgkaudScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const j = await r.json();
      const reply = j.response || j.message || j.reply || script;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: reply } }));
    } catch { /* ignore */ }
    setAssessing(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: 137400, zIndex: 256,
          background: dormantCount > 0 ? `${RED}22` : "#0a1628cc",
          border: `1px solid ${dormantCount > 0 ? RED : CYAN}55`,
          color: dormantCount > 0 ? RED : CYAN, fontSize: 9, padding: "3px 7px",
          borderRadius: 3, cursor: "pointer", fontFamily: "monospace", letterSpacing: 1,
          boxShadow: dormantCount > 0 ? `0 0 8px ${RED}44` : "none",
          animation: dormantCount > 0 ? "igkaud-pulse 2s infinite" : "none",
        }}
        title="Intelligence Asset Audit (◈ IGKAUD)"
      >
        <style>{`@keyframes igkaud-pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
        ◈ IGKAUD{dormantCount > 0 && <span style={{ color: RED, marginLeft: 4 }}>{dormantCount}▲</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 20, width: 520, maxHeight: "80vh",
      background: "#060e1f", border: `1px solid ${CYAN}44`, borderRadius: 6,
      zIndex: 1256, display: "flex", flexDirection: "column", overflow: "hidden",
      boxShadow: `0 0 32px ${CYAN}22`,
    }}>
      {/* Header */}
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${CYAN}22`,
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ color: CYAN, fontWeight: 700, fontSize: 11, letterSpacing: 1 }}>
          ◈ IGKAUD — Intelligence Asset Audit
        </span>
        <span style={{ color: DIM, fontSize: 9, flex: 1 }}>
          IntelProfile × Graph × Knowledge × Skill
        </span>
        {loading && <span style={{ color: AMBER, fontSize: 9 }}>LOADING…</span>}
        <button onClick={load} style={{ background: "none", border: "none", color: CYAN,
          cursor: "pointer", fontSize: 10 }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none",
          color: DIM, cursor: "pointer", fontSize: 12 }}>✕</button>
      </div>

      {/* Stats bar */}
      <div style={{ padding: "4px 12px", borderBottom: `1px solid ${CYAN}11`,
        display: "flex", gap: 12, fontSize: 9, flexShrink: 0 }}>
        {["GROUNDED","NETWORKED","KNOWN","DORMANT"].map(cls => {
          const n = rows.filter(r => r.cls === cls).length;
          return (
            <span key={cls} style={{ color: CLS_COLOR[cls] }}>
              {cls}: <b>{n}</b>
              {cls === "DORMANT" && n > 0 && (
                <span style={{ color: RED, marginLeft: 3,
                  animation: "igkaud-pulse 1.5s infinite" }}>●</span>
              )}
            </span>
          );
        })}
        <span style={{ color: DIM, marginLeft: "auto" }}>
          {rows.length} profiles
        </span>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "4px 12px",
        borderBottom: `1px solid ${CYAN}11`, flexShrink: 0, flexWrap: "wrap" }}>
        {["ALL","GROUNDED","NETWORKED","KNOWN","DORMANT"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? `${CLS_COLOR[f] || CYAN}22` : "transparent",
            border: `1px solid ${filter === f ? (CLS_COLOR[f] || CYAN) : DIM}55`,
            color: filter === f ? (CLS_COLOR[f] || CYAN) : DIM,
            fontSize: 8, padding: "2px 6px", borderRadius: 2, cursor: "pointer",
          }}>{f}</button>
        ))}
        <input
          placeholder="search profiles…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginLeft: "auto", background: "#0a1628", border: `1px solid ${CYAN}33`,
            color: CYAN, fontSize: 9, padding: "2px 6px", borderRadius: 2, outline: "none",
            width: 120 }}
        />
      </div>

      {/* ASSESS button */}
      <div style={{ padding: "4px 12px", borderBottom: `1px solid ${CYAN}11`, flexShrink: 0 }}>
        <button onClick={assess} disabled={assessing || !rows.length} style={{
          background: `${GREEN}18`, border: `1px solid ${GREEN}55`, color: GREEN,
          fontSize: 9, padding: "3px 10px", borderRadius: 2, cursor: "pointer",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>
        {error && <span style={{ color: RED, fontSize: 9, marginLeft: 8 }}>{error}</span>}
      </div>

      {/* Rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: DIM, fontSize: 10, padding: "12px 16px" }}>
            {rows.length === 0 ? "No intel profiles loaded." : "No profiles match filter."}
          </div>
        )}
        {visible.map((row, idx) => {
          const col    = CLS_COLOR[row.cls];
          const isExp  = expanded[idx];
          const cat    = row.category || row.type || row.profile_type;
          return (
            <div key={idx} style={{ borderBottom: `1px solid ${CYAN}11`,
              cursor: "pointer" }}
              onClick={() => setExpanded(e => ({ ...e, [idx]: !e[idx] }))}>
              <div style={{ display: "flex", alignItems: "center", gap: 6,
                padding: "5px 12px" }}>
                <span style={{ color: col, fontSize: 9, minWidth: 70,
                  background: `${col}18`, borderRadius: 2, padding: "0 4px" }}>
                  {row.cls}
                </span>
                <span style={{ color: "#c8e8f8", fontSize: 10, flex: 1 }}>
                  {row._label}
                </span>
                {cat && (
                  <span style={{ color: AMBER, background: `${AMBER}18`,
                    borderRadius: 2, padding: "0 4px", fontSize: 9 }}>{cat}</span>
                )}
                <span style={{ fontSize: 10, color: DIM }}>
                  G:{row.matchedGraph.length} K:{row.matchedKnowledge.length} S:{row.matchedSkills.length}
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "4px 12px 4px 20px", fontSize: 10,
                  borderLeft: `1px solid ${col}44`, marginLeft: 8, marginTop: 2 }}>
                  {row.matchedGraph.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: CYAN, fontWeight: 700 }}>
                        Graph Nodes ({row.matchedGraph.length}):
                      </span>
                      {row.matchedGraph.slice(0, 6).map((g, gi) => {
                        const score = g.centrality != null
                          ? Number(g.centrality).toFixed(3)
                          : (g.score != null ? Number(g.score).toFixed(3) : null);
                        return (
                          <span key={gi} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {g._label}
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
                  {row.matchedKnowledge.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: GREEN, fontWeight: 700 }}>
                        Knowledge ({row.matchedKnowledge.length}):
                      </span>
                      {row.matchedKnowledge.slice(0, 6).map((a, ai) => {
                        const aCat = a.category || a.type;
                        return (
                          <span key={ai} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {a._label}
                            {aCat && (
                              <span style={{ color: GREEN, background: `${GREEN}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {aCat}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedSkills.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: AMBER, fontWeight: 700 }}>
                        Skills ({row.matchedSkills.length}):
                      </span>
                      {row.matchedSkills.slice(0, 6).map((s, si) => {
                        const score = s.score != null
                          ? Number(s.score).toFixed(2)
                          : (s.confidence != null ? Number(s.confidence).toFixed(2) : null);
                        return (
                          <span key={si} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {s._label}
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
                  {row.matchedGraph.length === 0 && row.matchedKnowledge.length === 0 &&
                   row.matchedSkills.length === 0 && (
                    <span style={{ color: DIM }}>
                      No intelligence sources matched — dormant intel profile (zero asset grounding).
                    </span>
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
