/**
 * F150 Knowledge × Scenario × Task × Contact × RiskSignal
 * Mission Intelligence Command Map — ◈ KSTCRM
 *
 * Fetches: /knowledge/ + /v1/scenario/list + /entities/Task
 *          + /entities/Contact + /entities/RiskSignal
 * Keyword-matches each knowledge article against scenarios, tasks,
 * contacts, and risk signals to classify:
 *   COMMANDING — matched all 4 operational sources (fully grounded article)
 *   ACTIVE      — matched 2-3 sources
 *   PARTIAL     — matched exactly 1 source
 *   SHADOW      — zero matches (knowledge with no mission footprint:
 *                 no scenario, no task, no contact owner, no risk signal —
 *                 intelligence dead-ends with zero operational grounding)
 * Amber pulse on SHADOW count.
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

const CLS_COLOR = { COMMANDING: GREEN, ACTIVE: CYAN, PARTIAL: AMBER, SHADOW: RED };
const CLS_ORDER = { COMMANDING: 4, ACTIVE: 3, PARTIAL: 2, SHADOW: 1 };

const REFRESH_MS = 90_000;

const KSTCRM_RE = /\b(kstcrm|knowledge.*mission|knowledge.*scenario.*task|knowledge.*command|mission.*intelligence.*map|knowledge.*contact.*risk|knowledge.*command.*map|knowledge.*shadow|shadow.*knowledge|intel.*command.*map|knowledge.*operational.*ground)\b/i;

export function isKstcrmQuery(q) { return KSTCRM_RE.test(q || ""); }

export function buildKstcrmScript(rows) {
  const total     = rows.length;
  const commanding = rows.filter(r => r.cls === "COMMANDING").length;
  const shadow    = rows.filter(r => r.cls === "SHADOW").length;
  return (
    `Mission Intelligence Command Map: ${total} knowledge article${total !== 1 ? "s" : ""} assessed across scenario, task, contact, and risk-signal sources. ` +
    `${commanding} fully commanding (scenario, task, contact, and risk-signal coverage confirmed). ` +
    (shadow > 0
      ? `${shadow} shadow — no scenario linkage, no task grounding, no contact owner, no risk signal. Intelligence dead-ends with zero operational mission footprint requiring immediate remediation.`
      : "No shadow knowledge articles detected.")
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
    : Array.isArray(raw?.articles)         ? raw.articles
    : Array.isArray(raw?.reports)          ? raw.reports
    : Array.isArray(raw?.skills)           ? raw.skills
    : Array.isArray(raw?.datasets)         ? raw.datasets
    : Array.isArray(raw?.scenarios)        ? raw.scenarios
    : Array.isArray(raw?.alerts)           ? raw.alerts
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

function classifyArticle(article, scenarios, tasks, contacts, riskSignals) {
  const artText = [
    article._label, article.name, article.title, article.type, article.category,
    article.summary, article.description, article.content, article.source,
  ].filter(Boolean).join(" ");
  const aToks = tokens(artText);

  const matchedScenarios = scenarios.filter(s =>
    overlaps(aToks, [s._label, s.name, s.title, s.type, s.category, s.description, s.tags].join(" "))
  );
  const matchedTasks = tasks.filter(t =>
    overlaps(aToks, [t._label, t.name, t.title, t.type, t.category, t.description, t.status].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(aToks, [c._label, c.name, c.title, c.role, c.org, c.organization, c.description].join(" "))
  );
  const matchedRisks = riskSignals.filter(r =>
    overlaps(aToks, [r._label, r.name, r.title, r.type, r.category, r.description, r.signal, r.source].join(" "))
  );

  const sources = [
    matchedScenarios.length > 0,
    matchedTasks.length > 0,
    matchedContacts.length > 0,
    matchedRisks.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4) cls = "COMMANDING";
  else if (sources >= 2) cls = "ACTIVE";
  else if (sources === 1) cls = "PARTIAL";
  else cls = "SHADOW";

  return { article, cls, matchedScenarios, matchedTasks, matchedContacts, matchedRisks };
}

export default function KnowledgeScenarioTaskContactRiskMap() {
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
      const [knowledgeRaw, scenariosRaw, tasksRaw, contactsRaw, risksRaw] = await Promise.all([
        fetcher("/knowledge/"),
        fetcher("/v1/scenario/list"),
        fetcher("/entities/Task"),
        fetcher("/entities/Contact"),
        fetcher("/entities/RiskSignal"),
      ]);

      const articles   = normalizeArray(knowledgeRaw,  ["title", "name", "type", "category"]);
      const scenarios  = normalizeArray(scenariosRaw,  ["name", "title", "type", "category"]);
      const tasks      = normalizeArray(tasksRaw,      ["name", "title", "type", "status"]);
      const contacts   = normalizeArray(contactsRaw,   ["name", "title", "role", "org", "organization"]);
      const riskSignals = normalizeArray(risksRaw,     ["name", "title", "type", "category", "signal"]);

      const built = articles.map(a => classifyArticle(a, scenarios, tasks, contacts, riskSignals));
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
    window.addEventListener("jarvis:kstcrm-toggle", toggle);
    return () => window.removeEventListener("jarvis:kstcrm-toggle", toggle);
  }, []);

  const shadow  = rows.filter(r => r.cls === "SHADOW").length;
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.article?._label || r.article?.title || r.article?.name || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildKstcrmScript(rows);
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
        title="Knowledge × Scenario × Task × Contact × RiskSignal — Mission Intelligence Command Map"
        style={{
          position: "fixed", left: 132360, bottom: 8, zIndex: 247,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${shadow > 0 ? AMBER : CYAN}`,
          color: shadow > 0 ? AMBER : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: shadow > 0 ? `0 0 6px ${AMBER}` : "none",
          animation: shadow > 0 ? "pulse-amber 1.4s infinite" : "none",
        }}
      >
        ◈ KSTCRM{shadow > 0 ? ` — ${shadow} SHADOW` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9247,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ KSTCRM — MISSION INTELLIGENCE COMMAND MAP
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          Knowledge × Scenario × Task × Contact × RiskSignal (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} articles · {shadow > 0
            ? <span style={{ color: AMBER, fontWeight: 700 }}>{shadow} SHADOW</span>
            : <span style={{ color: GREEN }}>0 shadow</span>}
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
        {["ALL", "COMMANDING", "ACTIVE", "PARTIAL", "SHADOW"].map(f => (
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
          placeholder="search article…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.06)",
            border: `1px solid ${CYAN}33`, color: CYAN, borderRadius: 3,
            padding: "2px 8px", fontSize: 10, outline: "none", width: 200 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
        {loading && <div style={{ color: DIM, fontSize: 12, padding: 8 }}>Loading…</div>}
        {error && <div style={{ color: RED, fontSize: 12, padding: 8 }}>Error: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 12, padding: 8 }}>No articles match current filter.</div>
        )}
        {visible.map((row, i) => {
          const key   = row.article._label || row.article.title || row.article.id || i;
          const isExp = !!expanded[key];
          const col   = CLS_COLOR[row.cls];
          const cat   = row.article.category || row.article.type;
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
                <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 88 }}>
                  {row.cls}
                </span>
                {cat && (
                  <span style={{ color: AMBER, fontSize: 9, fontWeight: 700, minWidth: 48,
                    background: `${AMBER}18`, borderRadius: 2, padding: "1px 4px" }}>
                    {cat}
                  </span>
                )}
                <span style={{ fontSize: 11, flex: 1, color: "#c8e8f8" }}>
                  {row.article._label || row.article.title || row.article.name || "(article)"}
                </span>
                <span style={{ fontSize: 10, color: DIM }}>
                  Sc:{row.matchedScenarios.length} T:{row.matchedTasks.length} C:{row.matchedContacts.length} R:{row.matchedRisks.length}
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "4px 12px 4px 20px", fontSize: 10,
                  borderLeft: `1px solid ${col}44`, marginLeft: 8, marginTop: 2 }}>
                  {row.matchedScenarios.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: CYAN, fontWeight: 700 }}>Scenarios ({row.matchedScenarios.length}):</span>
                      {row.matchedScenarios.slice(0, 6).map((s, si) => (
                        <span key={si} style={{ marginLeft: 6, color: "#a8d8f0" }}>
                          {s._label || s.name}
                          {(s.status || s.type)
                            ? <span style={{ color: DIM }}> [{s.status || s.type}]</span>
                            : null}
                        </span>
                      ))}
                    </div>
                  )}
                  {row.matchedTasks.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: GREEN, fontWeight: 700 }}>Tasks ({row.matchedTasks.length}):</span>
                      {row.matchedTasks.slice(0, 6).map((t, ti) => (
                        <span key={ti} style={{ marginLeft: 6, color: "#a8f0c8" }}>
                          {t._label || t.name}
                          {t.status
                            ? <span style={{ color: DIM }}> [{t.status}]</span>
                            : null}
                        </span>
                      ))}
                    </div>
                  )}
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: AMBER, fontWeight: 700 }}>Contacts ({row.matchedContacts.length}):</span>
                      {row.matchedContacts.slice(0, 6).map((c, ci) => (
                        <span key={ci} style={{ marginLeft: 6, color: "#f0d8a8" }}>
                          {c._label || c.name}
                          {(c.role || c.org)
                            ? <span style={{ color: DIM }}> [{[c.role, c.org].filter(Boolean).join(" / ")}]</span>
                            : null}
                        </span>
                      ))}
                    </div>
                  )}
                  {row.matchedRisks.length > 0 && (
                    <div>
                      <span style={{ color: RED, fontWeight: 700 }}>Risk Signals ({row.matchedRisks.length}):</span>
                      {row.matchedRisks.slice(0, 6).map((r, ri) => {
                        const sev = r.severity || r.level || r.priority;
                        const SEV_COLOR = { critical: RED, high: RED, medium: AMBER, low: GREEN };
                        const sevCol = SEV_COLOR[(sev || "").toLowerCase()] || DIM;
                        return (
                          <span key={ri} style={{ marginLeft: 6, color: "#f0a8a8" }}>
                            {r._label || r.name}
                            {sev
                              ? <span style={{ color: sevCol }}> [{sev}]</span>
                              : null}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedScenarios.length === 0 && row.matchedTasks.length === 0 &&
                   row.matchedContacts.length === 0 && row.matchedRisks.length === 0 && (
                    <span style={{ color: DIM }}>No matches across any operational source — intelligence dead-end with zero mission footprint.</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse-amber { 0%,100% { box-shadow: 0 0 6px ${AMBER}; } 50% { box-shadow: 0 0 14px ${AMBER}, 0 0 4px ${AMBER}; } }
      `}</style>
    </div>
  );
}
