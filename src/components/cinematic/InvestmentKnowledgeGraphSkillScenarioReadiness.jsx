/**
 * F162 Investment × Knowledge × Graph × Skill × Scenario
 * Wealth Intelligence Readiness Matrix — ◈ IKGSM
 *
 * Fetches: /entities/Investment + /knowledge/ + /v1/graph/centrality
 *          + /v1/aip/skill + /v1/scenario/list
 * Keyword-matches each investment against knowledge articles, graph nodes,
 * skills, and scenarios to classify:
 *   FORTIFIED — matched all 4 supporting sources (fully backed wealth asset)
 *   RESEARCHED — matched 2–3 sources
 *   PARTIAL   — matched 1 source
 *   EXPOSED   — zero matches (investments with no knowledge article, no graph
 *               trace, no skill coverage, and no defensive scenario — full
 *               wealth intelligence blind spots)
 * Red pulse on EXPOSED count.
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

const CLS_COLOR = { FORTIFIED: GREEN, RESEARCHED: CYAN, PARTIAL: AMBER, EXPOSED: RED };
const CLS_ORDER = { FORTIFIED: 4, RESEARCHED: 3, PARTIAL: 2, EXPOSED: 1 };

const REFRESH_MS = 90_000;

const IKGSM_RE = /\b(ikgsm|investment.*knowledge.*graph|investment.*skill.*scenario|wealth.*intelligence.*readiness|wealth.*readiness.*matrix|investment.*graph.*skill|investment.*scenario.*skill|exposed.*investment|investment.*exposed|wealth.*blind|blind.*wealth|investment.*intelligence.*readiness|wealth.*coverage|investment.*coverage)\b/i;

export function isIkgsmQuery(q) { return IKGSM_RE.test(q || ""); }

export function buildIkgsmScript(rows) {
  const total      = rows.length;
  const fortified  = rows.filter(r => r.cls === "FORTIFIED").length;
  const exposed    = rows.filter(r => r.cls === "EXPOSED").length;
  return (
    `Wealth Intelligence Readiness: ${total} investment${total !== 1 ? "s" : ""} assessed across knowledge articles, graph nodes, skills, and scenarios. ` +
    `${fortified} fully fortified (knowledge grounding, graph trace, skill coverage, and scenario playbook all confirmed). ` +
    (exposed > 0
      ? `${exposed} exposed — no knowledge article, no graph trace, no skill match, no defensive scenario. These are full wealth intelligence blind spots requiring immediate attention.`
      : "No exposed investments detected — all assets have intelligence backing.")
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

function classifyInvestment(inv, knowledge, graphNodes, skills, scenarios) {
  const iText = [
    inv._label, inv.name, inv.title, inv.type, inv.category,
    inv.description, inv.ticker, inv.symbol, inv.asset_class,
    inv.sector, inv.tags,
  ].filter(Boolean).join(" ");
  const aToks = tokens(iText);

  const matchedKnowledge = knowledge.filter(k =>
    overlaps(aToks, [k._label, k.title, k.name, k.category, k.tags, k.summary, k.content].join(" "))
  );
  const matchedNodes = graphNodes.filter(n =>
    overlaps(aToks, [n._label, n.label, n.id, n.name, n.type, n.category, n.description, n.tags].join(" "))
  );
  const matchedSkills = skills.filter(s =>
    overlaps(aToks, [s._label, s.name, s.title, s.description, s.category, s.tags, s.domain].join(" "))
  );
  const matchedScenarios = scenarios.filter(sc =>
    overlaps(aToks, [sc._label, sc.name, sc.title, sc.description, sc.category, sc.tags, sc.type].join(" "))
  );

  const sources = [
    matchedKnowledge.length > 0,
    matchedNodes.length > 0,
    matchedSkills.length > 0,
    matchedScenarios.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4)      cls = "FORTIFIED";
  else if (sources >= 2)  cls = "RESEARCHED";
  else if (sources === 1) cls = "PARTIAL";
  else                    cls = "EXPOSED";

  return { inv, cls, matchedKnowledge, matchedNodes, matchedSkills, matchedScenarios };
}

export default function InvestmentKnowledgeGraphSkillScenarioReadiness() {
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
      const [invRaw, knowledgeRaw, graphRaw, skillsRaw, scenariosRaw] = await Promise.all([
        fetcher("/entities/Investment"),
        fetcher("/knowledge/"),
        fetcher("/v1/graph/centrality"),
        fetcher("/v1/aip/skill"),
        fetcher("/v1/scenario/list"),
      ]);

      const investments = normalizeArray(invRaw,       ["name", "title", "type", "ticker", "symbol"]);
      const articles    = normalizeArray(knowledgeRaw, ["title", "name", "category", "summary"]);
      const graphNodes  = normalizeArray(graphRaw,     ["label", "id", "name", "type"]);
      const skills      = normalizeArray(skillsRaw,    ["name", "title", "description", "category"]);
      const scenarios   = normalizeArray(scenariosRaw, ["name", "title", "description", "type"]);

      const built = investments.map(inv =>
        classifyInvestment(inv, articles, graphNodes, skills, scenarios)
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
    window.addEventListener("jarvis:ikgsm-toggle", toggle);
    return () => window.removeEventListener("jarvis:ikgsm-toggle", toggle);
  }, []);

  const exposed = rows.filter(r => r.cls === "EXPOSED").length;
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.inv?._label || r.inv?.name || r.inv?.title || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildIkgsmScript(rows);
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
        title="Investment × Knowledge × Graph × Skill × Scenario — Wealth Intelligence Readiness Matrix"
        style={{
          position: "fixed", left: 139080, bottom: 8, zIndex: 259,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${exposed > 0 ? RED : CYAN}`,
          color: exposed > 0 ? RED : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: exposed > 0 ? `0 0 6px ${RED}` : "none",
          animation: exposed > 0 ? "pulse-red 1.4s infinite" : "none",
        }}
      >
        ◈ IKGSM{exposed > 0 ? ` — ${exposed} EXPOSED` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9259,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ IKGSM — WEALTH INTELLIGENCE READINESS MATRIX
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          Investment × Knowledge × Graph × Skill × Scenario (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} investments ·{" "}
          {exposed > 0
            ? <span style={{ color: RED, fontWeight: 700 }}>{exposed} EXPOSED</span>
            : <span style={{ color: GREEN }}>0 exposed</span>}
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
        {["ALL", "FORTIFIED", "RESEARCHED", "PARTIAL", "EXPOSED"].map(f => (
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
          placeholder="search investments…"
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
          <div style={{ color: DIM, fontSize: 11, padding: 8 }}>No investments match current filter.</div>
        )}
        {visible.map((row, i) => {
          const invLabel = row.inv?._label || row.inv?.name || row.inv?.title || row.inv?.ticker || `investment-${i}`;
          const invType  = row.inv?.type || row.inv?.asset_class || null;
          const invVal   = row.inv?.value || row.inv?.amount || row.inv?.current_value || null;
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
                  borderRadius: 2, padding: "1px 4px", minWidth: 66, textAlign: "center" }}>
                  {row.cls}
                </span>
                <span style={{ fontSize: 11, flex: 1, color: CYAN }}>{invLabel}</span>
                {invType && (
                  <span style={{ fontSize: 9, color: DIM,
                    border: `1px solid ${DIM}55`, borderRadius: 2, padding: "1px 4px" }}>
                    {invType}
                  </span>
                )}
                {invVal !== null && invVal !== undefined && (
                  <span style={{ fontSize: 9, color: GREEN,
                    border: `1px solid ${GREEN}55`, borderRadius: 2, padding: "1px 4px" }}>
                    {typeof invVal === "number" ? invVal.toLocaleString() : invVal}
                  </span>
                )}
                <span style={{ fontSize: 10, color: DIM }}>
                  {row.matchedKnowledge.length}k · {row.matchedNodes.length}g ·{" "}
                  {row.matchedSkills.length}s · {row.matchedScenarios.length}sc
                </span>
                <span style={{ fontSize: 10, color: DIM }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "6px 12px 8px 20px", fontSize: 10,
                  borderLeft: `2px solid ${CLS_COLOR[row.cls] || CYAN}44`, marginLeft: 8 }}>

                  {/* Knowledge */}
                  {row.matchedKnowledge.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>KNOWLEDGE</div>
                      {row.matchedKnowledge.slice(0, 5).map((k, ki) => (
                        <div key={ki} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{k._label || k.title || k.name || `article-${ki}`}</span>
                          {k.category && (
                            <span style={{ fontSize: 8, color: AMBER,
                              border: `1px solid ${AMBER}55`, borderRadius: 2, padding: "0 3px" }}>
                              {k.category}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Graph Nodes */}
                  {row.matchedNodes.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>GRAPH NODES</div>
                      {row.matchedNodes.slice(0, 5).map((n, ni) => (
                        <div key={ni} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{n._label || n.label || n.id || n.name || `node-${ni}`}</span>
                          {(n.centrality_score ?? n.score ?? n.centrality) !== undefined && (
                            <span style={{ fontSize: 8, color: DIM,
                              border: `1px solid ${DIM}55`, borderRadius: 2, padding: "0 3px" }}>
                              c:{typeof (n.centrality_score ?? n.score ?? n.centrality) === "number"
                                ? (n.centrality_score ?? n.score ?? n.centrality).toFixed(3)
                                : (n.centrality_score ?? n.score ?? n.centrality)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Skills */}
                  {row.matchedSkills.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>SKILLS</div>
                      {row.matchedSkills.slice(0, 5).map((s, si) => (
                        <div key={si} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{s._label || s.name || s.title || `skill-${si}`}</span>
                          {(s.score || s.level || s.proficiency) && (
                            <span style={{ fontSize: 8, color: GREEN,
                              border: `1px solid ${GREEN}55`, borderRadius: 2, padding: "0 3px" }}>
                              {s.score || s.level || s.proficiency}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Scenarios */}
                  {row.matchedScenarios.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>SCENARIOS</div>
                      {row.matchedScenarios.slice(0, 5).map((sc, sci) => (
                        <div key={sci} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{sc._label || sc.name || sc.title || `scenario-${sci}`}</span>
                          {(sc.status || sc.state) && (
                            <span style={{ fontSize: 8, color: GREEN,
                              border: `1px solid ${GREEN}55`, borderRadius: 2, padding: "0 3px" }}>
                              {sc.status || sc.state}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {row.matchedKnowledge.length === 0 && row.matchedNodes.length === 0 &&
                   row.matchedSkills.length === 0 && row.matchedScenarios.length === 0 && (
                    <div style={{ color: RED, fontStyle: "italic" }}>
                      No knowledge article, graph node, skill, or scenario matched — full wealth intelligence blind spot.
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
        Investment × Knowledge × Graph × Skill × Scenario · auto-refresh 90s ·{" "}
        {rows.filter(r => r.cls === "FORTIFIED").length} fortified ·{" "}
        {rows.filter(r => r.cls === "RESEARCHED").length} researched ·{" "}
        {rows.filter(r => r.cls === "PARTIAL").length} partial ·{" "}
        <span style={{ color: exposed > 0 ? RED : DIM }}>{exposed} exposed</span>
      </div>
    </div>
  );
}
