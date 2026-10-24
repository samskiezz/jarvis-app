/**
 * F160 SwarmJob × Scenario × Contact × RiskSignal × Report
 * Threat Operations Coverage — ◈ SSCRR
 *
 * Fetches: /entities/SwarmJob + /v1/scenario/list + /entities/Contact
 *          + /entities/RiskSignal + /v1/reports
 * Keyword-matches each swarm job against scenarios, contacts, risk signals,
 * and reports to classify:
 *   COVERED   — matched all 4 operational sources (full threat operations coverage)
 *   PARTIAL   — matched 2–3 sources
 *   MINIMAL   — matched 1 source
 *   BLIND     — zero matches (fully undefended automation — no scenario playbook,
 *                no contact owner, no risk signal, no filed report)
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

const CLS_COLOR = { COVERED: GREEN, PARTIAL: CYAN, MINIMAL: AMBER, BLIND: RED };
const CLS_ORDER = { COVERED: 4, PARTIAL: 3, MINIMAL: 2, BLIND: 1 };

const REFRESH_MS = 90_000;

const SSCRR_RE = /\b(sscrr|swarm.*scenario.*contact|swarm.*risk.*report|swarm.*operations.*coverage|threat.*operations.*coverage|swarm.*threat.*coverage|automation.*threat.*coverage|swarm.*contact.*risk|swarm.*scenario.*risk|swarm.*blind|blind.*swarm|undefended.*swarm|swarm.*undefended|swarm.*coverage|automation.*coverage|swarm.*playbook|swarm.*contact.*report)\b/i;

export function isSscrrQuery(q) { return SSCRR_RE.test(q || ""); }

export function buildSscrrScript(rows) {
  const total   = rows.length;
  const covered = rows.filter(r => r.cls === "COVERED").length;
  const blind   = rows.filter(r => r.cls === "BLIND").length;
  return (
    `Threat Operations Coverage: ${total} swarm job${total !== 1 ? "s" : ""} assessed across scenarios, contacts, risk signals, and reports. ` +
    `${covered} fully covered (scenario playbook, contact owner, risk signal, and report all confirmed). ` +
    (blind > 0
      ? `${blind} blind — no scenario playbook, no contact owner, no risk signal, no filed report. These are fully undefended automation jobs requiring immediate operational attention.`
      : "No blind swarm jobs detected — all automation has operational coverage.")
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
    : Array.isArray(raw?.jobs)                  ? raw.jobs
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

function classifySwarmJob(job, scenarios, contacts, riskSignals, reports) {
  const jText = [
    job._label, job.name, job.title, job.description,
    job.type, job.category, job.tags, job.target, job.task,
  ].filter(Boolean).join(" ");
  const aToks = tokens(jText);

  const matchedScenarios = scenarios.filter(s =>
    overlaps(aToks, [s._label, s.name, s.title, s.description, s.type, s.category, s.tags].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(aToks, [c._label, c.name, c.role, c.organisation, c.org, c.email, c.department, c.tags].join(" "))
  );
  const matchedRisks = riskSignals.filter(r =>
    overlaps(aToks, [r._label, r.name, r.title, r.type, r.category, r.description, r.source, r.signal].join(" "))
  );
  const matchedReports = reports.filter(r =>
    overlaps(aToks, [r._label, r.name, r.title, r.type, r.category, r.description, r.tags, r.author].join(" "))
  );

  const sources = [
    matchedScenarios.length > 0,
    matchedContacts.length > 0,
    matchedRisks.length > 0,
    matchedReports.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4)      cls = "COVERED";
  else if (sources >= 2)  cls = "PARTIAL";
  else if (sources === 1) cls = "MINIMAL";
  else                    cls = "BLIND";

  return { job, cls, matchedScenarios, matchedContacts, matchedRisks, matchedReports };
}

export default function SwarmScenarioContactRiskReportCoverage() {
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
      const [swarmRaw, scenariosRaw, contactsRaw, riskRaw, reportsRaw] = await Promise.all([
        fetcher("/entities/SwarmJob"),
        fetcher("/v1/scenario/list"),
        fetcher("/entities/Contact"),
        fetcher("/entities/RiskSignal"),
        fetcher("/v1/reports"),
      ]);

      const jobs      = normalizeArray(swarmRaw,     ["name", "title", "description", "type"]);
      const scenarios = normalizeArray(scenariosRaw, ["name", "title", "description", "type"]);
      const contacts  = normalizeArray(contactsRaw,  ["name", "role", "organisation", "email"]);
      const risks     = normalizeArray(riskRaw,      ["name", "title", "type", "category", "signal"]);
      const reports   = normalizeArray(reportsRaw,   ["title", "name", "type", "category", "description"]);

      const built = jobs.map(j =>
        classifySwarmJob(j, scenarios, contacts, risks, reports)
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
    window.addEventListener("jarvis:sscrr-toggle", toggle);
    return () => window.removeEventListener("jarvis:sscrr-toggle", toggle);
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
      const script = buildSscrrScript(rows);
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
        title="SwarmJob × Scenario × Contact × RiskSignal × Report — Threat Operations Coverage"
        style={{
          position: "fixed", left: 137960, bottom: 8, zIndex: 257,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${blind > 0 ? RED : CYAN}`,
          color: blind > 0 ? RED : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: blind > 0 ? `0 0 6px ${RED}` : "none",
          animation: blind > 0 ? "pulse-red 1.4s infinite" : "none",
        }}
      >
        ◈ SSCRR{blind > 0 ? ` — ${blind} BLIND` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9257,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ SSCRR — THREAT OPERATIONS COVERAGE
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          SwarmJob × Scenario × Contact × RiskSignal × Report (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} jobs ·{" "}
          {blind > 0
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
        {["ALL", "COVERED", "PARTIAL", "MINIMAL", "BLIND"].map(f => (
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
          placeholder="search job…"
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
          const key   = row.job._label || row.job.name || row.job.title || i;
          const isExp = !!expanded[key];
          const col   = CLS_COLOR[row.cls];
          const status = row.job.status || row.job.state;
          const progress = row.job.progress != null ? row.job.progress : row.job.completion;
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
                <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 60 }}>
                  {row.cls}
                </span>
                <span style={{ fontSize: 11, flex: 1, color: "#c8e8f8" }}>
                  {row.job._label || row.job.name || row.job.title || "(job)"}
                </span>
                {status && (
                  <span style={{ color: CYAN, background: `${CYAN}18`, borderRadius: 2,
                    padding: "0 4px", fontSize: 9 }}>{status}</span>
                )}
                {progress != null && (
                  <span style={{ color: AMBER, background: `${AMBER}18`, borderRadius: 2,
                    padding: "0 4px", fontSize: 9 }}>{progress}%</span>
                )}
                <span style={{ fontSize: 10, color: DIM }}>
                  S:{row.matchedScenarios.length} C:{row.matchedContacts.length} R:{row.matchedRisks.length} P:{row.matchedReports.length}
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "4px 12px 4px 20px", fontSize: 10,
                  borderLeft: `1px solid ${col}44`, marginLeft: 8, marginTop: 2 }}>
                  {row.matchedScenarios.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: CYAN, fontWeight: 700 }}>Scenarios ({row.matchedScenarios.length}):</span>
                      {row.matchedScenarios.slice(0, 5).map((s, si) => {
                        const st = s.status || s.state;
                        return (
                          <span key={si} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {s._label || s.name || s.title}
                            {st && (
                              <span style={{ color: CYAN, background: `${CYAN}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {st}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: AMBER, fontWeight: 700 }}>Contacts ({row.matchedContacts.length}):</span>
                      {row.matchedContacts.slice(0, 5).map((c, ci) => {
                        const role = c.role || c.position;
                        const org  = c.organisation || c.org || c.company;
                        return (
                          <span key={ci} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {c._label || c.name}
                            {role && (
                              <span style={{ color: AMBER, background: `${AMBER}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {role}{org ? ` · ${org}` : ""}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedRisks.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: RED, fontWeight: 700 }}>Risk Signals ({row.matchedRisks.length}):</span>
                      {row.matchedRisks.slice(0, 5).map((r, ri) => {
                        const sev = r.severity || r.level || r.priority;
                        return (
                          <span key={ri} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {r._label || r.name || r.title}
                            {sev && (
                              <span style={{ color: RED, background: `${RED}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {sev}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedReports.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: GREEN, fontWeight: 700 }}>Reports ({row.matchedReports.length}):</span>
                      {row.matchedReports.slice(0, 5).map((r, ri) => {
                        const dt = r.date || r.created_at || r.timestamp;
                        return (
                          <span key={ri} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {r._label || r.title || r.name}
                            {dt && (
                              <span style={{ color: GREEN, background: `${GREEN}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {dt}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedScenarios.length === 0 && row.matchedContacts.length === 0 &&
                   row.matchedRisks.length === 0 && row.matchedReports.length === 0 && (
                    <span style={{ color: DIM }}>No operational sources matched — blind swarm job (zero threat operations coverage).</span>
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
