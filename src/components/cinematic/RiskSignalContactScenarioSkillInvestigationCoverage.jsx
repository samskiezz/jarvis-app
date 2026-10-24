/**
 * F156 RiskSignal × Contact × Scenario × Skill × Investigation
 * Threat Defence Coverage Network — ◈ RCSSI
 *
 * Fetches: /entities/RiskSignal + /entities/Contact + /v1/scenario/list
 *          + /v1/aip/skill + /v1/investigations
 * Keyword-matches each risk signal against contacts, scenarios, skills,
 * and investigations to classify:
 *   DEFENDED  — matched all 4 operational sources (fully covered threat)
 *   COVERED   — matched 3 sources
 *   PARTIAL   — matched 1-2 sources
 *   EXPOSED   — zero matches (threat with no assigned contact, no scenario
 *                playbook, no skill, no investigation — zero defence)
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

const RCSSI_RE = /\b(rcssi|risk.*contact.*scenario|risk.*defence.*coverage|risk.*signal.*contact|threat.*defence.*network|threat.*response.*coverage|risk.*skill.*investigation|risk.*covered|covered.*risk|threat.*exposure.*coverage|risk.*assigned.*contact|risk.*scenario.*coverage|risk.*playbook.*coverage|risk.*investigation.*coverage|threat.*defence.*matrix|exposed.*risk.*signal|risk.*signal.*exposed|defence.*coverage.*network|threat.*coverage.*network)\b/i;

export function isRcssiQuery(q) { return RCSSI_RE.test(q || ""); }

export function buildRcssiScript(rows) {
  const total    = rows.length;
  const defended = rows.filter(r => r.cls === "DEFENDED").length;
  const exposed  = rows.filter(r => r.cls === "EXPOSED").length;
  return (
    `Threat Defence Coverage Network: ${total} risk signal${total !== 1 ? "s" : ""} assessed across contact ownership, scenario playbooks, skill coverage, and active investigations. ` +
    `${defended} defended (contact owner, scenario playbook, skill, and investigation all confirmed). ` +
    (exposed > 0
      ? `${exposed} exposed — no assigned contact, no scenario playbook, no skill match, no investigation. Threats with zero defence coverage requiring immediate attention.`
      : "No exposed risk signals detected.")
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

function classifyRisk(risk, contacts, scenarios, skills, investigations) {
  const rText = [
    risk._label, risk.name, risk.title, risk.type, risk.category,
    risk.description, risk.tags, risk.source, risk.severity,
  ].filter(Boolean).join(" ");
  const aToks = tokens(rText);

  const matchedContacts     = contacts.filter(c =>
    overlaps(aToks, [c._label, c.name, c.role, c.org, c.organisation, c.title, c.category, c.tags].join(" "))
  );
  const matchedScenarios    = scenarios.filter(s =>
    overlaps(aToks, [s._label, s.name, s.title, s.category, s.description, s.tags, s.status].join(" "))
  );
  const matchedSkills       = skills.filter(sk =>
    overlaps(aToks, [sk._label, sk.name, sk.title, sk.category, sk.description, sk.tags].join(" "))
  );
  const matchedInvestigations = investigations.filter(inv =>
    overlaps(aToks, [inv._label, inv.name, inv.title, inv.category, inv.description, inv.status, inv.tags].join(" "))
  );

  const sources = [
    matchedContacts.length > 0,
    matchedScenarios.length > 0,
    matchedSkills.length > 0,
    matchedInvestigations.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4)      cls = "DEFENDED";
  else if (sources === 3) cls = "COVERED";
  else if (sources >= 1)  cls = "PARTIAL";
  else                    cls = "EXPOSED";

  return { risk, cls, matchedContacts, matchedScenarios, matchedSkills, matchedInvestigations };
}

export default function RiskSignalContactScenarioSkillInvestigationCoverage() {
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
      const [risksRaw, contactsRaw, scenariosRaw, skillsRaw, investigationsRaw] = await Promise.all([
        fetcher("/entities/RiskSignal"),
        fetcher("/entities/Contact"),
        fetcher("/v1/scenario/list"),
        fetcher("/v1/aip/skill"),
        fetcher("/v1/investigations"),
      ]);

      const risks          = normalizeArray(risksRaw,          ["name", "title", "type", "category"]);
      const contacts       = normalizeArray(contactsRaw,       ["name", "title", "role", "org"]);
      const scenarios      = normalizeArray(scenariosRaw,      ["title", "name", "category", "description"]);
      const skills         = normalizeArray(skillsRaw,         ["name", "title", "category", "description"]);
      const investigations = normalizeArray(investigationsRaw, ["title", "name", "status", "category"]);

      const built = risks.map(risk =>
        classifyRisk(risk, contacts, scenarios, skills, investigations)
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
    window.addEventListener("jarvis:rcssi-toggle", toggle);
    return () => window.removeEventListener("jarvis:rcssi-toggle", toggle);
  }, []);

  const exposed  = rows.filter(r => r.cls === "EXPOSED").length;
  const visible  = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.risk?._label || r.risk?.name || r.risk?.title || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildRcssiScript(rows);
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
        title="RiskSignal × Contact × Scenario × Skill × Investigation — Threat Defence Coverage Network"
        style={{
          position: "fixed", left: 135720, bottom: 8, zIndex: 253,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${exposed > 0 ? RED : CYAN}`,
          color: exposed > 0 ? RED : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: exposed > 0 ? `0 0 6px ${RED}` : "none",
          animation: exposed > 0 ? "pulse-red 1.4s infinite" : "none",
        }}
      >
        ◈ RCSSI{exposed > 0 ? ` — ${exposed} EXPOSED` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9253,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ RCSSI — THREAT DEFENCE COVERAGE NETWORK
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          RiskSignal × Contact × Scenario × Skill × Investigation (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} risk signals ·{" "}
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
          placeholder="search risk signal…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.06)",
            border: `1px solid ${CYAN}33`, color: CYAN, borderRadius: 3,
            padding: "2px 8px", fontSize: 10, outline: "none", width: 200 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
        {loading && <div style={{ color: DIM, fontSize: 12, padding: 8 }}>Loading…</div>}
        {error && <div style={{ color: RED, fontSize: 12, padding: 8 }}>Error: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 12, padding: 8 }}>No risk signals match current filter.</div>
        )}
        {visible.map((row, i) => {
          const key   = row.risk._label || row.risk.name || row.risk.title || i;
          const isExp = !!expanded[key];
          const col   = CLS_COLOR[row.cls];
          const sev   = row.risk.severity || row.risk.level || row.risk.priority;
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
                <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 80 }}>
                  {row.cls}
                </span>
                <span style={{ fontSize: 11, flex: 1, color: "#c8e8f8" }}>
                  {row.risk._label || row.risk.name || row.risk.title || "(risk signal)"}
                </span>
                {sev && (
                  <span style={{ color: RED, background: `${RED}18`, borderRadius: 2,
                    padding: "0 4px", fontSize: 9 }}>{sev}</span>
                )}
                <span style={{ fontSize: 10, color: DIM }}>
                  C:{row.matchedContacts.length} S:{row.matchedScenarios.length} Sk:{row.matchedSkills.length} I:{row.matchedInvestigations.length}
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "4px 12px 4px 20px", fontSize: 10,
                  borderLeft: `1px solid ${col}44`, marginLeft: 8, marginTop: 2 }}>
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: GREEN, fontWeight: 700 }}>Contacts ({row.matchedContacts.length}):</span>
                      {row.matchedContacts.slice(0, 6).map((c, ci) => {
                        const roleOrg = [c.role, c.org || c.organisation].filter(Boolean).join(" · ");
                        return (
                          <span key={ci} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {c._label || c.name}
                            {roleOrg && (
                              <span style={{ color: GREEN, background: `${GREEN}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {roleOrg}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedScenarios.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: CYAN, fontWeight: 700 }}>Scenarios ({row.matchedScenarios.length}):</span>
                      {row.matchedScenarios.slice(0, 6).map((s, si) => {
                        const status = s.status || s.state;
                        return (
                          <span key={si} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {s._label || s.title || s.name}
                            {status && (
                              <span style={{ color: CYAN, background: `${CYAN}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {status}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedSkills.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: AMBER, fontWeight: 700 }}>Skills ({row.matchedSkills.length}):</span>
                      {row.matchedSkills.slice(0, 6).map((sk, ski) => {
                        const score = sk.score != null ? Number(sk.score).toFixed(2) : null;
                        return (
                          <span key={ski} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {sk._label || sk.name || sk.title}
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
                  {row.matchedInvestigations.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: RED, fontWeight: 700 }}>Investigations ({row.matchedInvestigations.length}):</span>
                      {row.matchedInvestigations.slice(0, 6).map((inv, ii) => {
                        const status = inv.status || inv.state;
                        return (
                          <span key={ii} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {inv._label || inv.title || inv.name}
                            {status && (
                              <span style={{ color: RED, background: `${RED}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {status}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedContacts.length === 0 && row.matchedScenarios.length === 0 &&
                   row.matchedSkills.length === 0 && row.matchedInvestigations.length === 0 && (
                    <span style={{ color: DIM }}>No matching defence sources — exposed threat (zero defence coverage).</span>
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
