/**
 * F147 Skill × IntelProfile × Graph × Dataset × Ops Alert
 * Intelligence Capability Coverage Network — ◈ SKICOV
 *
 * Fetches: /v1/aip/skill + /entities/IntelProfile + /v1/graph/centrality
 *          + /v1/datasets + /v1/ops/alerts
 * Classifies each skill across 4 tiers based on cross-source keyword overlap:
 *   DEPLOYED — matched all 4 external sources (intel profile, graph node, dataset, ops alert)
 *   ACTIVE   — matched 2-3 sources
 *   PARTIAL  — matched exactly 1 source
 *   BLIND    — zero matches (capability blind spots with no intel attribution, graph trace, dataset, or alert coverage)
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

const CLS_COLOR = { DEPLOYED: GREEN, ACTIVE: CYAN, PARTIAL: AMBER, BLIND: RED };
const CLS_ORDER = { DEPLOYED: 4, ACTIVE: 3, PARTIAL: 2, BLIND: 1 };

const REFRESH_MS = 90_000;

const SKICOV_RE = /\b(skicov|skill.*intel.*graph|skill.*capability.*coverage|intelligence.*capability.*network|skill.*graph.*dataset|skill.*ops.*coverage|blind.*skill|skill.*blind|capability.*blind|skill.*intel.*coverage|skill.*command.*network)\b/i;

export function isSkicovQuery(q) { return SKICOV_RE.test(q || ""); }

export function buildSkicovScript(rows) {
  const total    = rows.length;
  const deployed = rows.filter(r => r.cls === "DEPLOYED").length;
  const blind    = rows.filter(r => r.cls === "BLIND").length;
  return (
    `Intelligence Capability Coverage Network: ${total} skill${total !== 1 ? "s" : ""} assessed. ` +
    `${deployed} deployed (intel profile, graph node, dataset, and ops alert coverage confirmed). ` +
    (blind > 0
      ? `${blind} blind — no intel profile, no graph trace, no dataset, no ops alert. Full capability blind spots.`
      : "No blind skills detected.")
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
    : Array.isArray(raw?.reports)          ? raw.reports
    : Array.isArray(raw?.articles)         ? raw.articles
    : Array.isArray(raw?.skills)           ? raw.skills
    : Array.isArray(raw?.datasets)         ? raw.datasets
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

function classifySkill(skill, intelProfiles, graphNodes, datasets, opsAlerts) {
  const skillText = [
    skill.name, skill.title, skill.type, skill.category, skill.description, skill.id, skill._label,
  ].filter(Boolean).join(" ");
  const sToks = tokens(skillText);

  const matchedProfiles = intelProfiles.filter(p =>
    overlaps(sToks, [p._label, p.name, p.title, p.type, p.category, p.description, p.source, p.alias].join(" "))
  );
  const matchedNodes = graphNodes.filter(n =>
    overlaps(sToks, [n._label, n.label, n.name, n.title, n.type, n.description, n.id].join(" "))
  );
  const matchedDatasets = datasets.filter(d =>
    overlaps(sToks, [d._label, d.name, d.title, d.type, d.category, d.description, d.source].join(" "))
  );
  const matchedAlerts = opsAlerts.filter(a =>
    overlaps(sToks, [a._label, a.name, a.title, a.type, a.category, a.description, a.severity, a.message].join(" "))
  );

  const sources = [
    matchedProfiles.length > 0,
    matchedNodes.length > 0,
    matchedDatasets.length > 0,
    matchedAlerts.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4) cls = "DEPLOYED";
  else if (sources >= 2) cls = "ACTIVE";
  else if (sources === 1) cls = "PARTIAL";
  else cls = "BLIND";

  return { skill, cls, matchedProfiles, matchedNodes, matchedDatasets, matchedAlerts };
}

export default function SkillIntelGraphDatasetOpsCommand() {
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
      const [skillsRaw, profilesRaw, graphRaw, datasetsRaw, alertsRaw] = await Promise.all([
        fetcher("/v1/aip/skill"),
        fetcher("/entities/IntelProfile"),
        fetcher("/v1/graph/centrality"),
        fetcher("/v1/datasets"),
        fetcher("/v1/ops/alerts"),
      ]);

      const skills        = normalizeArray(skillsRaw,   ["name", "title", "type", "category"]);
      const intelProfiles = normalizeArray(profilesRaw, ["name", "title", "type", "category", "alias"]);
      const graphNodes    = normalizeArray(graphRaw,    ["label", "name", "title", "type", "id"]);
      const datasets      = normalizeArray(datasetsRaw, ["name", "title", "type", "category"]);
      const opsAlerts     = normalizeArray(alertsRaw,   ["name", "title", "type", "category", "message"]);

      const built = skills.map(s => classifySkill(s, intelProfiles, graphNodes, datasets, opsAlerts));
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
    window.addEventListener("jarvis:skicov-toggle", toggle);
    return () => window.removeEventListener("jarvis:skicov-toggle", toggle);
  }, []);

  const blind   = rows.filter(r => r.cls === "BLIND").length;
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.skill._label || r.skill.name || r.skill.title || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildSkicovScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
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
        title="Skill × IntelProfile × Graph × Dataset × Ops Alert — Intelligence Capability Coverage Network"
        style={{
          position: "fixed", left: 130680, bottom: 8, zIndex: 244,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${blind > 0 ? RED : CYAN}`,
          color: blind > 0 ? RED : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: blind > 0 ? `0 0 6px ${RED}` : "none",
          animation: blind > 0 ? "pulse-red 1.4s infinite" : "none",
        }}
      >
        ◈ SKICOV{blind > 0 ? ` — ${blind} BLIND` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9244,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ SKICOV — INTELLIGENCE CAPABILITY COVERAGE NETWORK
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          Skill × IntelProfile × Graph × Dataset × Ops Alert (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} skills · {blind > 0
            ? <span style={{ color: RED, fontWeight: 700 }}>{blind} BLIND</span>
            : <span style={{ color: GREEN }}>0 blind</span>}
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
        {["ALL", "DEPLOYED", "ACTIVE", "PARTIAL", "BLIND"].map(f => (
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
          placeholder="search skill…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.06)",
            border: `1px solid ${CYAN}33`, color: CYAN, borderRadius: 3,
            padding: "2px 8px", fontSize: 10, outline: "none", width: 180 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
        {loading && <div style={{ color: DIM, fontSize: 12, padding: 8 }}>Loading…</div>}
        {error && <div style={{ color: RED, fontSize: 12, padding: 8 }}>Error: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 12, padding: 8 }}>No skills match current filter.</div>
        )}
        {visible.map((row, i) => {
          const key = row.skill.id || row.skill._label || i;
          const isExp = !!expanded[key];
          const col = CLS_COLOR[row.cls];
          const label = row.skill._label || row.skill.name || row.skill.title || `skill-${i}`;
          const score = row.skill.score != null ? ` · score ${row.skill.score}` : "";
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
                <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 76 }}>
                  {row.cls}
                </span>
                <span style={{ fontSize: 11, flex: 1, color: "#c8e8f8" }}>
                  {label}{score}
                </span>
                <span style={{ fontSize: 10, color: DIM }}>
                  P:{row.matchedProfiles.length} G:{row.matchedNodes.length} D:{row.matchedDatasets.length} A:{row.matchedAlerts.length}
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "4px 12px 4px 20px", fontSize: 10,
                  borderLeft: `1px solid ${col}44`, marginLeft: 8, marginTop: 2 }}>
                  {row.matchedProfiles.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: CYAN, fontWeight: 700 }}>Intel Profiles ({row.matchedProfiles.length}):</span>
                      {row.matchedProfiles.slice(0, 6).map((p, pi) => (
                        <span key={pi} style={{ marginLeft: 6, color: "#a8d8f0" }}>
                          {p._label || p.name}
                          {p.category
                            ? <span style={{ color: DIM }}> [{p.category}]</span>
                            : null}
                        </span>
                      ))}
                    </div>
                  )}
                  {row.matchedNodes.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: GREEN, fontWeight: 700 }}>Graph Nodes ({row.matchedNodes.length}):</span>
                      {row.matchedNodes.slice(0, 6).map((n, ni) => (
                        <span key={ni} style={{ marginLeft: 6, color: "#a8f0c8" }}>
                          {n._label || n.label || n.name}
                          {n.centrality != null
                            ? <span style={{ color: DIM }}> [{n.centrality.toFixed ? n.centrality.toFixed(2) : n.centrality}]</span>
                            : null}
                        </span>
                      ))}
                    </div>
                  )}
                  {row.matchedDatasets.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: AMBER, fontWeight: 700 }}>Datasets ({row.matchedDatasets.length}):</span>
                      {row.matchedDatasets.slice(0, 6).map((d, di) => (
                        <span key={di} style={{ marginLeft: 6, color: "#f0d8a8" }}>
                          {d._label || d.name}
                          {d.row_count != null
                            ? <span style={{ color: DIM }}> [{d.row_count} rows]</span>
                            : null}
                        </span>
                      ))}
                    </div>
                  )}
                  {row.matchedAlerts.length > 0 && (
                    <div>
                      <span style={{ color: RED, fontWeight: 700 }}>Ops Alerts ({row.matchedAlerts.length}):</span>
                      {row.matchedAlerts.slice(0, 6).map((a, ai) => (
                        <span key={ai} style={{ marginLeft: 6, color: "#f0a8a8" }}>
                          {a._label || a.name || a.title}
                          {a.severity
                            ? <span style={{ color: DIM }}> [{a.severity}]</span>
                            : null}
                        </span>
                      ))}
                    </div>
                  )}
                  {row.matchedProfiles.length === 0 && row.matchedNodes.length === 0 &&
                   row.matchedDatasets.length === 0 && row.matchedAlerts.length === 0 && (
                    <span style={{ color: DIM }}>No matches across any source — full capability blind spot.</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse-red { 0%,100% { box-shadow: 0 0 6px ${RED}; } 50% { box-shadow: 0 0 14px ${RED}, 0 0 4px ${RED}; } }
      `}</style>
    </div>
  );
}
