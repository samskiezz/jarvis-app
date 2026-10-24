/**
 * F151 SwarmJob × Scenario × RiskSignal × Report × Contact
 * Automated Threat Response Intelligence — ◈ SSRRC
 *
 * Fetches: /entities/SwarmJob + /v1/scenario/list + /entities/RiskSignal
 *          + /v1/reports + /entities/Contact
 * Keyword-matches each swarm job against scenarios, risk signals, reports,
 * and contacts to classify:
 *   AUTONOMOUS — matched all 4 operational sources (full threat-response coverage)
 *   COVERED    — matched 2–3 sources
 *   DOCUMENTED — matched exactly 1 source
 *   BLIND      — zero matches (automation dead-ends: no scenario playbook,
 *                no risk signal, no filed report, no contact owner —
 *                fully undefended swarm with zero threat-response grounding)
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

const CLS_COLOR = { AUTONOMOUS: GREEN, COVERED: CYAN, DOCUMENTED: AMBER, BLIND: RED };
const CLS_ORDER = { AUTONOMOUS: 4, COVERED: 3, DOCUMENTED: 2, BLIND: 1 };

const REFRESH_MS = 90_000;

const SSRRC_RE = /\b(ssrrc|swarm.*threat.*response|swarm.*scenario.*risk|swarm.*blind|blind.*swarm|automated.*threat.*response|swarm.*report.*contact|swarm.*response.*intel|threat.*response.*intel|swarm.*coverage.*threat|automated.*response.*intel)\b/i;

export function isSsrrcQuery(q) { return SSRRC_RE.test(q || ""); }

export function buildSsrrcScript(rows) {
  const total      = rows.length;
  const autonomous = rows.filter(r => r.cls === "AUTONOMOUS").length;
  const blind      = rows.filter(r => r.cls === "BLIND").length;
  return (
    `Automated Threat Response Intelligence: ${total} swarm job${total !== 1 ? "s" : ""} assessed across scenario, risk signal, report, and contact sources. ` +
    `${autonomous} fully autonomous (scenario playbook, risk signal, report, and contact coverage confirmed). ` +
    (blind > 0
      ? `${blind} blind — no scenario playbook, no risk signal, no filed report, no contact owner. Fully undefended automation with zero threat-response grounding requiring immediate remediation.`
      : "No blind swarm jobs detected.")
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

function classifyJob(job, scenarios, riskSignals, reports, contacts) {
  const jobText = [
    job._label, job.name, job.title, job.type, job.category,
    job.status, job.description, job.tags, job.target,
  ].filter(Boolean).join(" ");
  const aToks = tokens(jobText);

  const matchedScenarios = scenarios.filter(s =>
    overlaps(aToks, [s._label, s.name, s.title, s.type, s.category, s.description, s.tags].join(" "))
  );
  const matchedRisks = riskSignals.filter(r =>
    overlaps(aToks, [r._label, r.name, r.title, r.type, r.category, r.description, r.signal, r.source].join(" "))
  );
  const matchedReports = reports.filter(rp =>
    overlaps(aToks, [rp._label, rp.name, rp.title, rp.type, rp.category, rp.description, rp.summary].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(aToks, [c._label, c.name, c.title, c.role, c.org, c.organization, c.description].join(" "))
  );

  const sources = [
    matchedScenarios.length > 0,
    matchedRisks.length > 0,
    matchedReports.length > 0,
    matchedContacts.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4) cls = "AUTONOMOUS";
  else if (sources >= 2) cls = "COVERED";
  else if (sources === 1) cls = "DOCUMENTED";
  else cls = "BLIND";

  return { job, cls, matchedScenarios, matchedRisks, matchedReports, matchedContacts };
}

export default function SwarmScenarioRiskReportContactResponse() {
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
      const [jobsRaw, scenariosRaw, risksRaw, reportsRaw, contactsRaw] = await Promise.all([
        fetcher("/entities/SwarmJob"),
        fetcher("/v1/scenario/list"),
        fetcher("/entities/RiskSignal"),
        fetcher("/v1/reports"),
        fetcher("/entities/Contact"),
      ]);

      const jobs      = normalizeArray(jobsRaw,      ["name", "title", "type", "status"]);
      const scenarios = normalizeArray(scenariosRaw, ["name", "title", "type", "category"]);
      const risks     = normalizeArray(risksRaw,     ["name", "title", "type", "category", "signal"]);
      const reports   = normalizeArray(reportsRaw,   ["title", "name", "type", "category"]);
      const contacts  = normalizeArray(contactsRaw,  ["name", "title", "role", "org", "organization"]);

      const built = jobs.map(j => classifyJob(j, scenarios, risks, reports, contacts));
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
    window.addEventListener("jarvis:ssrrc-toggle", toggle);
    return () => window.removeEventListener("jarvis:ssrrc-toggle", toggle);
  }, []);

  const blind   = rows.filter(r => r.cls === "BLIND").length;
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.job?._label || r.job?.name || r.job?.title || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildSsrrcScript(rows);
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
        title="SwarmJob × Scenario × RiskSignal × Report × Contact — Automated Threat Response Intelligence"
        style={{
          position: "fixed", left: 132920, bottom: 8, zIndex: 248,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${blind > 0 ? RED : CYAN}`,
          color: blind > 0 ? RED : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: blind > 0 ? `0 0 6px ${RED}` : "none",
          animation: blind > 0 ? "pulse-red 1.4s infinite" : "none",
        }}
      >
        ◈ SSRRC{blind > 0 ? ` — ${blind} BLIND` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9248,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ SSRRC — AUTOMATED THREAT RESPONSE INTELLIGENCE
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          SwarmJob × Scenario × RiskSignal × Report × Contact (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} jobs · {blind > 0
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
        {["ALL", "AUTONOMOUS", "COVERED", "DOCUMENTED", "BLIND"].map(f => (
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
          placeholder="search swarm job…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.06)",
            border: `1px solid ${CYAN}33`, color: CYAN, borderRadius: 3,
            padding: "2px 8px", fontSize: 10, outline: "none", width: 200 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
        {loading && <div style={{ color: DIM, fontSize: 12, padding: 8 }}>Loading…</div>}
        {error && <div style={{ color: RED, fontSize: 12, padding: 8 }}>Error: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 12, padding: 8 }}>No swarm jobs match current filter.</div>
        )}
        {visible.map((row, i) => {
          const key   = row.job._label || row.job.name || row.job.id || i;
          const isExp = !!expanded[key];
          const col   = CLS_COLOR[row.cls];
          const status = row.job.status || row.job.type;
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
                <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 96 }}>
                  {row.cls}
                </span>
                {status && (
                  <span style={{ color: AMBER, fontSize: 9, fontWeight: 700, minWidth: 48,
                    background: `${AMBER}18`, borderRadius: 2, padding: "1px 4px" }}>
                    {status}
                  </span>
                )}
                <span style={{ fontSize: 11, flex: 1, color: "#c8e8f8" }}>
                  {row.job._label || row.job.name || row.job.title || "(swarm job)"}
                </span>
                <span style={{ fontSize: 10, color: DIM }}>
                  Sc:{row.matchedScenarios.length} R:{row.matchedRisks.length} Rp:{row.matchedReports.length} C:{row.matchedContacts.length}
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
                  {row.matchedRisks.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
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
                  {row.matchedReports.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: GREEN, fontWeight: 700 }}>Reports ({row.matchedReports.length}):</span>
                      {row.matchedReports.slice(0, 6).map((rp, ri) => {
                        const date = rp.date || rp.created_at || rp.updated_at;
                        return (
                          <span key={ri} style={{ marginLeft: 6, color: "#a8f0c8" }}>
                            {rp._label || rp.title || rp.name}
                            {date ? <span style={{ color: DIM }}> [{date.slice(0, 10)}]</span> : null}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedContacts.length > 0 && (
                    <div>
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
                  {row.matchedScenarios.length === 0 && row.matchedRisks.length === 0 &&
                   row.matchedReports.length === 0 && row.matchedContacts.length === 0 && (
                    <span style={{ color: DIM }}>No matches across any threat-response source — fully undefended automation with zero threat-response grounding.</span>
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
