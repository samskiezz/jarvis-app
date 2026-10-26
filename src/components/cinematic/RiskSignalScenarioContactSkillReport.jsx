/**
 * RiskSignalScenarioContactSkillReport — F197
 * Fetches /entities/RiskSignal + /v1/scenario/list + /entities/Contact +
 * /v1/aip/skill + /v1/reports and cross-references each risk signal
 * against all 4 other sources.
 * Classifies:
 *   DEFENDED — risk signal has matches across all 4 sources
 *   COVERED  — risk signal has 2–3 source matches
 *   PARTIAL  — risk signal has 1 source match
 *   EXPOSED  — risk signal has 0 matches (no scenario, no contact, no skill, no report)
 * Red pulse on EXPOSED count (fully undefended threat blind spots).
 * ASSESS → /v1/jarvis/agent/chat advisory for exposed threats + TTS.
 * Voice triggers: "threat coverage"/"rsscr"/"exposed threats"/"risk coverage"/
 *   "threat response"/"undefended threats"/"risk defence"
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF4D6D";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const PRP = "#B485FF";
const ORG = "#FF9A3C";
const POLL = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const RSSCR_RE =
  /\b(threat.coverage|rsscr|exposed.threats?|risk.coverage|threat.response|undefended.threats?|risk.defence|risk.defense|rsscr.toggle|comprehensive.threat|threat.response.coverage)\b/i;

export function isRsscrQuery(t) { return RSSCR_RE.test(t || ""); }

export function buildRsscrScript(rows) {
  const exposed = rows.filter(r => r.cls === "EXPOSED");
  if (!exposed.length) return "All risk signals have at least one supporting resource. No fully exposed threat blind spots detected.";
  return `You are JARVIS. ${exposed.length} risk signal(s) are EXPOSED — they have no matched scenario playbook, no contact owner, no matching skill, and no filed report. List each exposed risk signal by name and severity. Then provide a 2-sentence threat response advisory: what scenarios, contacts, or skills should be activated to defend against each exposed threat. Be direct and specific.`;
}

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function fetchRiskSignals() {
  const r = await fetch(`${apiBase()}/entities/RiskSignal`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.risks) ? d.risks :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(i => ({
    id: i.id || i._id || String(Math.random()),
    name: (i.name || i.title || i.signal || "").toString(),
    severity: i.severity || i.level || i.priority || "",
  }));
}

async function fetchScenarios() {
  const r = await fetch(`${apiBase()}/v1/scenario/list`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.scenarios) ? d.scenarios :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(s => ({
    id: s.id || s._id || String(Math.random()),
    name: (s.name || s.title || "").toString(),
    status: s.status || s.state || "",
  }));
}

async function fetchContacts() {
  const r = await fetch(`${apiBase()}/entities/Contact`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.contacts) ? d.contacts :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(c => ({
    id: c.id || c._id || String(Math.random()),
    name: (c.name || c.full_name || "").toString(),
    role: c.role || c.title || "",
    org: c.org || c.organization || c.company || "",
  }));
}

async function fetchSkills() {
  const r = await fetch(`${apiBase()}/v1/aip/skill`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.skills) ? d.skills :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(s => ({
    id: s.id || s._id || String(Math.random()),
    name: (s.name || s.skill || s.title || "").toString(),
    score: typeof s.score === "number" ? s.score :
           typeof s.proficiency === "number" ? s.proficiency : null,
  }));
}

async function fetchReports() {
  const r = await fetch(`${apiBase()}/v1/reports`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.reports) ? d.reports :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(r2 => ({
    id: r2.id || r2._id || String(Math.random()),
    name: (r2.name || r2.title || r2.subject || "").toString(),
    date: r2.date || r2.created_at || r2.timestamp || "",
  }));
}

function kw(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(w => w.length > 2);
}

function matchPool(item, pool) {
  const ik = kw(item.name);
  return pool.filter(p => {
    const pk = kw(p.name);
    return ik.some(w => pk.includes(w)) || pk.some(w => ik.includes(w));
  });
}

function classify(risk, scenarios, contacts, skills, reports) {
  const ms = matchPool(risk, scenarios);
  const mc = matchPool(risk, contacts);
  const mk = matchPool(risk, skills);
  const mr = matchPool(risk, reports);
  const score = [ms.length > 0, mc.length > 0, mk.length > 0, mr.length > 0].filter(Boolean).length;
  const cls =
    score === 4 ? "DEFENDED" :
    score >= 2  ? "COVERED" :
    score === 1 ? "PARTIAL" : "EXPOSED";
  return { ...risk, cls, matchedScenarios: ms, matchedContacts: mc, matchedSkills: mk, matchedReports: mr };
}

const clsColor = { DEFENDED: GRN, COVERED: CY, PARTIAL: AMB, EXPOSED: RED };
const clsOrder = { DEFENDED: 0, COVERED: 1, PARTIAL: 2, EXPOSED: 3 };

const StatusBadge = ({ s }) =>
  s ? <span style={{ fontSize: 10, border: `1px solid ${AMB}`, color: AMB, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{s}</span> : null;

const ScoreBadge = ({ v }) =>
  v != null ? <span style={{ fontSize: 10, border: `1px solid ${CY}`, color: CY, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{typeof v === "number" ? v.toFixed(2) : v}</span> : null;

const SevBadge = ({ s }) =>
  s ? <span style={{ fontSize: 10, border: `1px solid ${RED}`, color: RED, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{s}</span> : null;

const DateBadge = ({ s }) =>
  s ? <span style={{ fontSize: 10, border: `1px solid ${PRP}`, color: PRP, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{s.slice(0, 10)}</span> : null;

export default function RiskSignalScenarioContactSkillReport() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [expanded, setExp]    = useState({});
  const [filter, setFilter]   = useState("ALL");
  const [assessing, setAss]   = useState(false);
  const [advice, setAdvice]   = useState("");
  const timerRef              = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [risks, scenarios, contacts, skills, reports] = await Promise.all([
        fetchRiskSignals(), fetchScenarios(), fetchContacts(),
        fetchSkills(), fetchReports(),
      ]);
      const classified = risks
        .map(risk => classify(risk, scenarios, contacts, skills, reports))
        .sort((a, b) => clsOrder[a.cls] - clsOrder[b.cls]);
      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:rsscr-toggle", toggle);
    return () => window.removeEventListener("jarvis:rsscr-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAss(true); setAdvice("");
    const script = buildRsscrScript(rows);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || "";
      setAdvice(text);
      if (text) {
        try {
          await fetch(`${apiBase()}/v1/voice/tts`, {
            method: "POST",
            headers: { ...hdrs, "Content-Type": "application/json" },
            body: JSON.stringify({ text: text.slice(0, 400) }),
          });
        } catch { /* TTS optional */ }
      }
    } catch (e) {
      setAdvice("Advisory unavailable: " + e.message);
    } finally {
      setAss(false);
    }
  }, [rows]);

  const exposedCount = rows.filter(r => r.cls === "EXPOSED").length;
  const visible      = filter === "ALL" ? rows : rows.filter(r => r.cls === filter);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="RiskSignal × Scenario × Contact × Skill × Report Comprehensive Threat Response Coverage"
        style={{
          position: "fixed", bottom: 8, left: 158120, zIndex: 293,
          background: "rgba(0,0,0,0.7)", border: `1px solid ${exposedCount > 0 ? RED : ORG}`,
          color: exposedCount > 0 ? RED : ORG, fontSize: 10, padding: "3px 7px",
          borderRadius: 4, cursor: "pointer", fontFamily: "monospace",
          boxShadow: exposedCount > 0 ? `0 0 8px ${RED}88` : "none",
          animation: exposedCount > 0 ? "pulse-red 2s infinite" : "none",
        }}
      >
        ◈ RSSCR{exposedCount > 0 ? ` ⚠${exposedCount}` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 16, width: 560, maxHeight: "80vh",
      background: "rgba(5,10,18,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 8, zIndex: 9999, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CY, fontSize: 12,
      boxShadow: `0 0 24px ${CY}22`,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: `1px solid ${CY}33` }}>
        <span style={{ flex: 1, fontWeight: "bold", fontSize: 11 }}>
          ◈ RSSCR — RISKSIGNAL × SCENARIO × CONTACT × SKILL × REPORT
        </span>
        {exposedCount > 0 && (
          <span style={{ color: RED, fontWeight: "bold", marginRight: 10,
            animation: "pulse-red 2s infinite" }}>
            ⚠ {exposedCount} EXPOSED
          </span>
        )}
        <button onClick={load} disabled={loading} style={{ background: "none", border: `1px solid ${CY}55`, color: CY, borderRadius: 3, padding: "2px 7px", cursor: "pointer", fontSize: 10, marginRight: 6 }}>
          {loading ? "…" : "↺"}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, padding: "6px 12px", borderBottom: `1px solid ${CY}22` }}>
        {["ALL", "DEFENDED", "COVERED", "PARTIAL", "EXPOSED"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? `${clsColor[f] || CY}22` : "transparent",
            border: `1px solid ${clsColor[f] || CY}55`,
            color: clsColor[f] || CY, borderRadius: 3, padding: "2px 7px",
            cursor: "pointer", fontSize: 10,
          }}>
            {f}
            <span style={{ marginLeft: 4, opacity: 0.7 }}>
              {f === "ALL" ? rows.length : rows.filter(r => r.cls === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px" }}>
        {err && <div style={{ color: RED, padding: 8 }}>Error: {err}</div>}
        {!loading && !err && visible.length === 0 && (
          <div style={{ opacity: 0.5, padding: 8 }}>No risk signals to display.</div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ borderBottom: `1px solid ${CY}18`, padding: "5px 0" }}>
            <div
              onClick={() => setExp(e => ({ ...e, [row.id]: !e[row.id] }))}
              style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 6 }}
            >
              <span style={{ color: clsColor[row.cls], fontWeight: "bold", minWidth: 76 }}>{row.cls}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name || "(no name)"}</span>
              {row.severity && <SevBadge s={row.severity} />}
              <span style={{ opacity: 0.4, fontSize: 10 }}>{expanded[row.id] ? "▲" : "▼"}</span>
            </div>
            {expanded[row.id] && (
              <div style={{ paddingLeft: 16, paddingTop: 4, opacity: 0.85 }}>
                {row.matchedScenarios.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: AMB }}>scenarios: </span>
                    {row.matchedScenarios.slice(0, 3).map(s => (
                      <span key={s.id}>{s.name}<StatusBadge s={s.status} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.matchedContacts.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: GRN }}>contacts: </span>
                    {row.matchedContacts.slice(0, 3).map(c => (
                      <span key={c.id}>{c.name}
                        {c.role && <span style={{ fontSize: 10, color: AMB, marginLeft: 3 }}>{c.role}</span>}
                        {c.org && <span style={{ fontSize: 10, color: PRP, marginLeft: 3 }}>{c.org}</span>}
                        {" "}
                      </span>
                    ))}
                  </div>
                )}
                {row.matchedSkills.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: CY }}>skills: </span>
                    {row.matchedSkills.slice(0, 3).map(s => (
                      <span key={s.id}>{s.name}<ScoreBadge v={s.score} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.matchedReports.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: ORG }}>reports: </span>
                    {row.matchedReports.slice(0, 3).map(r2 => (
                      <span key={r2.id}>{r2.name}<DateBadge s={r2.date} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.cls === "EXPOSED" && (
                  <div style={{ color: RED, fontSize: 10, opacity: 0.8 }}>
                    ⚠ No scenario playbook, contact owner, skill match, or filed report — fully exposed threat blind spot.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* assess */}
      <div style={{ padding: "8px 12px", borderTop: `1px solid ${CY}33` }}>
        <button
          onClick={assess}
          disabled={assessing || rows.length === 0}
          style={{
            background: `${RED}22`, border: `1px solid ${RED}88`,
            color: RED, borderRadius: 4, padding: "4px 14px",
            cursor: assessing ? "wait" : "pointer", fontSize: 11,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS EXPOSED THREATS"}
        </button>
        {advice && (
          <div style={{ marginTop: 8, color: CY, fontSize: 11, opacity: 0.9,
            maxHeight: 120, overflowY: "auto", borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
            {advice}
          </div>
        )}
      </div>
    </div>
  );
}
