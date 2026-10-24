/**
 * F152 Investigation × Skill × Graph × Contact × RiskSignal
 * Active Threat Defense Coverage — ◈ ISGRCD
 *
 * Fetches: /v1/investigations + /v1/aip/skill + /v1/graph/centrality
 *          + /entities/Contact + /entities/RiskSignal
 * Keyword-matches each investigation against skills, graph nodes, contacts,
 * and risk signals to classify:
 *   DEFENDED   — matched all 4 operational sources (full active defense)
 *   COVERED    — matched 2–3 sources
 *   PARTIAL    — matched exactly 1 source
 *   EXPOSED    — zero matches (open investigation with no skill, no graph trace,
 *                no contact owner, no risk signal — fully undefended open case)
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

const CLS_COLOR = { DEFENDED: GREEN, COVERED: CYAN, PARTIAL: AMBER, EXPOSED: RED };
const CLS_ORDER = { DEFENDED: 4, COVERED: 3, PARTIAL: 2, EXPOSED: 1 };

const REFRESH_MS = 90_000;

const ISGRCD_RE = /\b(isgrcd|investigation.*skill.*graph|investigation.*defense|threat.*defense.*coverage|active.*defense.*coverage|investigation.*contact.*risk|defense.*coverage.*investigation|open.*case.*defense|investigation.*threat.*response|undefended.*investigation|exposed.*investigation)\b/i;

export function isIsgrcdQuery(q) { return ISGRCD_RE.test(q || ""); }

export function buildIsgrcdScript(rows) {
  const total    = rows.length;
  const defended = rows.filter(r => r.cls === "DEFENDED").length;
  const exposed  = rows.filter(r => r.cls === "EXPOSED").length;
  return (
    `Active Threat Defense Coverage: ${total} investigation${total !== 1 ? "s" : ""} assessed across skill, graph, contact, and risk signal sources. ` +
    `${defended} fully defended (skill coverage, graph trace, contact owner, and risk signal all confirmed). ` +
    (exposed > 0
      ? `${exposed} exposed — no skill, no graph trace, no contact owner, no risk signal. Fully undefended open investigations with zero active defense requiring immediate remediation.`
      : "No exposed investigations detected.")
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
    : Array.isArray(raw?.investigations)   ? raw.investigations
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

function classifyInvestigation(inv, skills, graphNodes, contacts, riskSignals) {
  const invText = [
    inv._label, inv.name, inv.title, inv.type, inv.category,
    inv.status, inv.description, inv.tags, inv.subject, inv.target,
  ].filter(Boolean).join(" ");
  const aToks = tokens(invText);

  const matchedSkills = skills.filter(s =>
    overlaps(aToks, [s._label, s.name, s.title, s.type, s.category, s.description, s.tags].join(" "))
  );
  const matchedNodes = graphNodes.filter(n =>
    overlaps(aToks, [n._label, n.name, n.label, n.type, n.category, n.description].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(aToks, [c._label, c.name, c.title, c.role, c.org, c.organization, c.description].join(" "))
  );
  const matchedRisks = riskSignals.filter(r =>
    overlaps(aToks, [r._label, r.name, r.title, r.type, r.category, r.description, r.signal, r.source].join(" "))
  );

  const sources = [
    matchedSkills.length > 0,
    matchedNodes.length > 0,
    matchedContacts.length > 0,
    matchedRisks.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4) cls = "DEFENDED";
  else if (sources >= 2) cls = "COVERED";
  else if (sources === 1) cls = "PARTIAL";
  else cls = "EXPOSED";

  return { inv, cls, matchedSkills, matchedNodes, matchedContacts, matchedRisks };
}

export default function InvestigationSkillGraphContactRiskDefense() {
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
      const [invsRaw, skillsRaw, graphRaw, contactsRaw, risksRaw] = await Promise.all([
        fetcher("/v1/investigations"),
        fetcher("/v1/aip/skill"),
        fetcher("/v1/graph/centrality"),
        fetcher("/entities/Contact"),
        fetcher("/entities/RiskSignal"),
      ]);

      const invs     = normalizeArray(invsRaw,     ["name", "title", "type", "status", "subject"]);
      const skills   = normalizeArray(skillsRaw,   ["name", "title", "type", "category"]);
      const nodes    = normalizeArray(graphRaw,     ["name", "label", "type", "category"]);
      const contacts = normalizeArray(contactsRaw,  ["name", "title", "role", "org", "organization"]);
      const risks    = normalizeArray(risksRaw,     ["name", "title", "type", "category", "signal"]);

      const built = invs.map(i => classifyInvestigation(i, skills, nodes, contacts, risks));
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
    window.addEventListener("jarvis:isgrcd-toggle", toggle);
    return () => window.removeEventListener("jarvis:isgrcd-toggle", toggle);
  }, []);

  const exposed  = rows.filter(r => r.cls === "EXPOSED").length;
  const visible  = rows.filter(r => {
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
      const script = buildIsgrcdScript(rows);
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
        title="Investigation × Skill × Graph × Contact × RiskSignal — Active Threat Defense Coverage"
        style={{
          position: "fixed", left: 133480, bottom: 8, zIndex: 249,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${exposed > 0 ? RED : CYAN}`,
          color: exposed > 0 ? RED : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: exposed > 0 ? `0 0 6px ${RED}` : "none",
          animation: exposed > 0 ? "pulse-red 1.4s infinite" : "none",
        }}
      >
        ◈ ISGRCD{exposed > 0 ? ` — ${exposed} EXPOSED` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9249,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ ISGRCD — ACTIVE THREAT DEFENSE COVERAGE
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          Investigation × Skill × Graph × Contact × RiskSignal (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} investigations · {exposed > 0
            ? <span style={{ color: RED, fontWeight: 700 }}>{exposed} EXPOSED</span>
            : <span style={{ color: GREEN }}>0 exposed</span>}
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
        {["ALL", "DEFENDED", "COVERED", "PARTIAL", "EXPOSED"].map(f => (
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
          placeholder="search investigation…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.06)",
            border: `1px solid ${CYAN}33`, color: CYAN, borderRadius: 3,
            padding: "2px 8px", fontSize: 10, outline: "none", width: 200 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
        {loading && <div style={{ color: DIM, fontSize: 12, padding: 8 }}>Loading…</div>}
        {error && <div style={{ color: RED, fontSize: 12, padding: 8 }}>Error: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 12, padding: 8 }}>No investigations match current filter.</div>
        )}
        {visible.map((row, i) => {
          const key   = row.inv._label || row.inv.name || row.inv.id || i;
          const isExp = !!expanded[key];
          const col   = CLS_COLOR[row.cls];
          const status = row.inv.status || row.inv.type;
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
                {status && (
                  <span style={{ color: AMBER, fontSize: 9, fontWeight: 700, minWidth: 48,
                    background: `${AMBER}18`, borderRadius: 2, padding: "1px 4px" }}>
                    {status}
                  </span>
                )}
                <span style={{ fontSize: 11, flex: 1, color: "#c8e8f8" }}>
                  {row.inv._label || row.inv.name || row.inv.title || "(investigation)"}
                </span>
                <span style={{ fontSize: 10, color: DIM }}>
                  Sk:{row.matchedSkills.length} G:{row.matchedNodes.length} C:{row.matchedContacts.length} R:{row.matchedRisks.length}
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "4px 12px 4px 20px", fontSize: 10,
                  borderLeft: `1px solid ${col}44`, marginLeft: 8, marginTop: 2 }}>
                  {row.matchedSkills.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: CYAN, fontWeight: 700 }}>Skills ({row.matchedSkills.length}):</span>
                      {row.matchedSkills.slice(0, 6).map((s, si) => {
                        const score = s.score ?? s.rating ?? s.level;
                        return (
                          <span key={si} style={{ marginLeft: 6, color: "#a8d8f0" }}>
                            {s._label || s.name}
                            {score != null ? <span style={{ color: GREEN }}> [{score}]</span> : null}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedNodes.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: AMBER, fontWeight: 700 }}>Graph Nodes ({row.matchedNodes.length}):</span>
                      {row.matchedNodes.slice(0, 6).map((n, ni) => {
                        const score = n.centrality ?? n.score ?? n.weight;
                        return (
                          <span key={ni} style={{ marginLeft: 6, color: "#f0d8a8" }}>
                            {n._label || n.name || n.label}
                            {score != null ? <span style={{ color: DIM }}> [{typeof score === "number" ? score.toFixed(3) : score}]</span> : null}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: GREEN, fontWeight: 700 }}>Contacts ({row.matchedContacts.length}):</span>
                      {row.matchedContacts.slice(0, 6).map((c, ci) => (
                        <span key={ci} style={{ marginLeft: 6, color: "#a8f0c8" }}>
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
                            {sev ? <span style={{ color: sevCol }}> [{sev}]</span> : null}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedSkills.length === 0 && row.matchedNodes.length === 0 &&
                   row.matchedContacts.length === 0 && row.matchedRisks.length === 0 && (
                    <span style={{ color: DIM }}>No matches across any defense source — fully undefended open investigation with zero active threat-defense grounding.</span>
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
