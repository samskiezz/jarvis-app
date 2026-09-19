/**
 * F692 — Acoustic × Scenario × Skill Triple Nexus (ACSCNSKL)
 * Three-way cross-reference: /v1/acoustic/contacts × /v1/scenario/list × /v1/aip/skill.
 * Each acoustic contact is classified:
 *   FULLY_OPERATIONALIZED — matches ≥1 scenario AND ≥1 skill
 *   SCENARIO_ONLY         — scenario match but no skill backing
 *   SKILL_ONLY            — skill match but no scenario link
 *   DARK                  — neither (operational readiness gap)
 * Coverage % tile = FULLY_OPERATIONALIZED / total contacts.
 * Tabs: ALL / FULLY_OPERATIONALIZED / SCENARIO_ONLY / SKILL_ONLY / DARK + search.
 * Click-to-expand shows matched scenarios + matched skills per contact.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence readiness brief + TTS.
 * 90-second auto-refresh. Event: jarvis:acscnskl-toggle.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 145_800;
const Z_INDEX  = 228;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const ACSCNSKL_RE = /\b(acscnskl|acoustic\s+scenario\s+skill|scenario\s+skill\s+acoustic|acoustic\s+scenario\s+coverage|sensor\s+scenario\s+skill|sensor\s+readiness\s+triple|acoustic\s+skill\s+scenario|acoustic\s+playbook\s+skill|contact\s+readiness\s+triple|acoustic\s+operationalized)\b/i;

const KIND_COLOR = {
  FINANCIAL: "#00e5a0", GEOPOLITICAL: "#29E7FF", CRISIS: "#ff4444",
  OPERATIONAL: "#ff8800", CYBER: "#ff00ff", SOCIAL: "#ffcc00", DEFAULT: "#667",
};

// ── helpers ───────────────────────────────────────────────────────────────────

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function overlap(a, b) {
  const setA = new Set(keywords(a));
  return keywords(b).filter(w => setA.has(w)).length;
}

function normaliseContacts(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.contacts)) return raw.contacts;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normaliseScenarios(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.scenarios)) return raw.scenarios;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

function normaliseSkills(raw) {
  if (Array.isArray(raw))         return raw;
  if (Array.isArray(raw?.skills)) return raw.skills;
  if (Array.isArray(raw?.items))  return raw.items;
  if (Array.isArray(raw?.data))   return raw.data;
  return [];
}

function contactText(c) {
  return [c.name, c.callsign, c.id, c.type, c.classification, c.vessel_type, c.description]
    .filter(Boolean).join(" ");
}

function crossRef(contacts, scenarios, skills) {
  return contacts.map(c => {
    const ct = contactText(c);
    const matchedScenarios = scenarios.filter(s => {
      const st = [s.name, s.title, s.description, s.kind, s.tags].filter(Boolean).join(" ");
      return overlap(ct, st) > 0;
    }).map(s => ({
      ...s,
      hits: overlap(ct, [s.name, s.title, s.description, s.kind].filter(Boolean).join(" ")),
    }));
    const matchedSkills = skills.filter(sk => {
      const skt = [sk.name, sk.domain, sk.description, sk.tags].filter(Boolean).join(" ");
      return overlap(ct, skt) > 0;
    }).map(sk => ({
      ...sk,
      hits: overlap(ct, [sk.name, sk.domain, sk.description].filter(Boolean).join(" ")),
    }));
    const hasScenario = matchedScenarios.length > 0;
    const hasSkill    = matchedSkills.length > 0;
    const coverage    = hasScenario && hasSkill ? "FULLY_OPERATIONALIZED"
      : hasScenario ? "SCENARIO_ONLY"
      : hasSkill    ? "SKILL_ONLY"
      : "DARK";
    return { ...c, _scenarios: matchedScenarios, _skills: matchedSkills, _coverage: coverage };
  });
}

// ── JarvisBrain exports ────────────────────────────────────────────────────────

export function isAcscnsklQuery(text) {
  return ACSCNSKL_RE.test(text || "");
}

export async function buildAcscnsklScript() {
  const base    = apiBase();
  const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  try {
    const [cr, sr, skr] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
      fetch(`${base}/v1/scenario/list`,     { headers }).then(r => r.json()),
      fetch(`${base}/v1/aip/skill`,         { headers }).then(r => r.json()),
    ]);
    const contacts  = normaliseContacts(cr);
    const scenarios = normaliseScenarios(sr);
    const skills    = normaliseSkills(skr);
    const enriched  = crossRef(contacts, scenarios, skills);
    const fully     = enriched.filter(c => c._coverage === "FULLY_OPERATIONALIZED");
    const dark      = enriched.filter(c => c._coverage === "DARK");
    const summary   = `${contacts.length} acoustic contacts cross-referenced with ${scenarios.length} scenarios and ${skills.length} skills. FULLY_OPERATIONALIZED: ${fully.length}, DARK: ${dark.length}.`;
    const rr = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers,
      body: JSON.stringify({ message: `Acoustic × Scenario × Skill Triple: ${summary} Top dark contacts: ${dark.slice(0, 3).map(c => c.name || c.callsign || c.id).join(", ") || "none"}. Provide a 2-sentence operational readiness assessment.` }),
    });
    const rj = await rr.json();
    return rj?.response || rj?.message || rj?.answer || summary;
  } catch (e) {
    return `Acoustic Scenario Skill Triple error: ${e.message}`;
  }
}

// ── Coverage badge styles ─────────────────────────────────────────────────────

const COV_COLOR = {
  FULLY_OPERATIONALIZED: { bg: "#00e5a022", border: "#00e5a055", text: "#00e5a0" },
  SCENARIO_ONLY:         { bg: "#29E7FF22", border: "#29E7FF55", text: "#29E7FF" },
  SKILL_ONLY:            { bg: "#ff880022", border: "#ff880055", text: "#ff8800" },
  DARK:                  { bg: "#ff444422", border: "#ff444455", text: "#ff4444" },
};

// ── main component ─────────────────────────────────────────────────────────────

export default function AcousticScenarioSkillTriple() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [skills,    setSkills]    = useState([]);
  const [enriched,  setEnriched]  = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const base    = apiBase();
      const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const [cr, sr, skr] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
        fetch(`${base}/v1/scenario/list`,     { headers }).then(r => r.json()),
        fetch(`${base}/v1/aip/skill`,         { headers }).then(r => r.json()),
      ]);
      const c  = normaliseContacts(cr);
      const s  = normaliseScenarios(sr);
      const sk = normaliseSkills(skr);
      setContacts(c);
      setScenarios(s);
      setSkills(sk);
      setEnriched(crossRef(c, s, sk));
    } catch (_) { /* stale data stays */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:acscnskl-toggle", toggle);
    return () => window.removeEventListener("jarvis:acscnskl-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const fully        = enriched.filter(c => c._coverage === "FULLY_OPERATIONALIZED");
  const scenarioOnly = enriched.filter(c => c._coverage === "SCENARIO_ONLY");
  const skillOnly    = enriched.filter(c => c._coverage === "SKILL_ONLY");
  const dark         = enriched.filter(c => c._coverage === "DARK");
  const pct          = enriched.length > 0 ? Math.round(fully.length / enriched.length * 100) : 0;

  const tabMap = {
    ALL:                   enriched,
    FULLY_OPERATIONALIZED: fully,
    SCENARIO_ONLY:         scenarioOnly,
    SKILL_ONLY:            skillOnly,
    DARK:                  dark,
  };
  const visible = (tabMap[tab] || enriched)
    .filter(c => !search || [c.name, c.callsign, c.id, c.type].some(f => String(f || "").toLowerCase().includes(search.toLowerCase())));

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base    = apiBase();
      const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const summary = `${contacts.length} acoustic contacts: FULLY_OPERATIONALIZED ${fully.length}, SCENARIO_ONLY ${scenarioOnly.length}, SKILL_ONLY ${skillOnly.length}, DARK ${dark.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers,
        body: JSON.stringify({ message: `Acoustic × Scenario × Skill Triple: ${summary} Dark contacts (no scenario or skill match): ${dark.slice(0, 3).map(c => c.name || c.callsign || c.id).join(", ") || "none"}. Provide a 2-sentence sensor operational readiness assessment.` }),
      });
      const j = await r.json();
      const text = j?.response || j?.message || j?.answer || summary;
      setBrief(text);
      const ttsRes = await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers,
        body: JSON.stringify({ text }),
      });
      if (ttsRes.ok) {
        const blob = await ttsRes.blob();
        const url  = URL.createObjectURL(blob);
        new Audio(url).play().catch(() => {});
      }
    } catch (e) { setBrief(`Assessment error: ${e.message}`); }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Acoustic × Scenario × Skill Triple Nexus (ACSCNSKL)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: dark.length > 0 ? "rgba(255,170,0,0.18)" : "rgba(0,30,60,0.82)",
          border: `1px solid ${dark.length > 0 ? "#ffaa00" : "#00ffe7"}`,
          color: dark.length > 0 ? "#ffaa00" : "#00ffe7",
          borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer",
          fontFamily: "monospace", letterSpacing: 1,
        }}
      >
        ◈ ACSCNSKL{dark.length > 0 ? ` [${dark.length}]` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 20, width: 560, maxHeight: "85vh",
      background: "rgba(0,8,20,0.97)", border: "1px solid #00ffe7",
      borderRadius: 10, zIndex: Z_INDEX + 100, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#c8f0ff", boxShadow: "0 0 40px #00ffe722",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #00ffe733" }}>
        <span style={{ color: "#00ffe7", fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>
          ◈ ACOUSTIC × SCENARIO × SKILL
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ color: "#ffaa00", fontSize: 11 }}>⟳</span>}
          <span style={{ color: "#888", fontSize: 10 }}>{contacts.length} contacts · {scenarios.length} scenarios · {skills.length} skills</span>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#ff4444", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: "1px solid #00ffe711" }}>
        {[
          { label: "FULL OPS",      val: fully.length,        color: "#00e5a0" },
          { label: "SCENARIO ONLY", val: scenarioOnly.length, color: "#29E7FF" },
          { label: "SKILL ONLY",    val: skillOnly.length,    color: "#ff8800" },
          { label: "DARK",          val: dark.length,         color: dark.length > 0 ? "#ffaa00" : "#444" },
          { label: "COVERAGE %",    val: `${pct}%`,           color: pct >= 50 ? "#00e5a0" : "#ff8800" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ flex: 1, background: "rgba(0,255,231,0.04)", border: "1px solid #00ffe711", borderRadius: 6, padding: "5px 6px", textAlign: "center" }}>
            <div style={{ color, fontSize: 15, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#556", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "8px 14px 0", alignItems: "center", flexWrap: "wrap" }}>
        {["ALL", "FULLY_OPERATIONALIZED", "SCENARIO_ONLY", "SKILL_ONLY", "DARK"].map(t => {
          const ct = COV_COLOR[t] || { border: "#333", text: "#667", bg: "none" };
          const count = tabMap[t]?.length ?? enriched.length;
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? (ct.bg || "#00ffe722") : "none",
              border: `1px solid ${tab === t ? (ct.border || "#00ffe7") : "#333"}`,
              color: tab === t ? (ct.text || "#00ffe7") : "#667",
              borderRadius: 4, padding: "2px 7px", fontSize: 9, cursor: "pointer",
              letterSpacing: 0.5,
            }}>
              {t.replace(/_/g, " ")} ({count})
            </button>
          );
        })}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{ marginLeft: "auto", background: "rgba(0,255,231,0.06)", border: "1px solid #00ffe733", borderRadius: 4, padding: "2px 8px", color: "#c8f0ff", fontSize: 11, width: 100, outline: "none" }}
        />
      </div>

      {/* contact list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px" }}>
        {visible.length === 0 && (
          <div style={{ color: "#444", fontSize: 12, textAlign: "center", marginTop: 20 }}>No contacts</div>
        )}
        {visible.map((c, i) => {
          const id    = c.id || c.callsign || i;
          const label = c.name || c.callsign || c.id || `Contact ${i + 1}`;
          const isExp = expanded === id;
          const cc    = COV_COLOR[c._coverage] || COV_COLOR.DARK;
          return (
            <div key={id} style={{ marginBottom: 6, background: "rgba(0,255,231,0.03)", border: `1px solid ${cc.border}`, borderRadius: 6, overflow: "hidden" }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
              >
                <span style={{ flex: 1, fontSize: 12, color: "#c8f0ff" }}>{label}</span>
                {c.type && <span style={{ color: "#667", fontSize: 10 }}>{c.type}</span>}
                <span style={{ background: cc.bg, color: cc.text, border: `1px solid ${cc.border}`, borderRadius: 4, padding: "1px 7px", fontSize: 9, letterSpacing: 0.5 }}>
                  {c._coverage.replace(/_/g, " ")}
                </span>
                <span style={{ color: "#00ffe744", fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ borderTop: "1px solid #00ffe711", padding: "8px 12px", background: "rgba(0,0,0,0.3)" }}>
                  {c.classification && <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Classification: {c.classification}</div>}
                  {c.description    && <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6 }}>{c.description}</div>}

                  {/* Scenarios */}
                  <div style={{ fontSize: 11, color: "#29E7FF", marginBottom: 4, fontWeight: 700 }}>
                    Scenarios ({c._scenarios.length}):
                  </div>
                  {c._scenarios.length === 0 ? (
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>No scenario match.</div>
                  ) : c._scenarios.slice(0, 3).map((s, si) => {
                    const kc = KIND_COLOR[String(s.kind || "").toUpperCase()] || KIND_COLOR.DEFAULT;
                    return (
                      <div key={s.id || si} style={{ marginBottom: 4, padding: "3px 8px", background: "rgba(41,231,255,0.06)", border: "1px solid #29E7FF33", borderRadius: 4, fontSize: 11 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {s.kind && <span style={{ background: `${kc}22`, color: kc, border: `1px solid ${kc}55`, borderRadius: 3, padding: "0 5px", fontSize: 9 }}>{s.kind}</span>}
                          <span style={{ color: "#b8e0ff", flex: 1 }}>{s.name || s.title || s.id}</span>
                          <span style={{ color: "#888", fontSize: 10 }}>hits: {s.hits}</span>
                        </div>
                        {s.description && <div style={{ color: "#888", fontSize: 10, marginTop: 2 }}>{s.description.slice(0, 80)}{s.description.length > 80 ? "…" : ""}</div>}
                      </div>
                    );
                  })}
                  {c._scenarios.length > 3 && <div style={{ fontSize: 10, color: "#667", marginBottom: 4 }}>+{c._scenarios.length - 3} more…</div>}

                  {/* Skills */}
                  <div style={{ fontSize: 11, color: "#ff8800", marginBottom: 4, fontWeight: 700, marginTop: 6 }}>
                    Skills ({c._skills.length}):
                  </div>
                  {c._skills.length === 0 ? (
                    <div style={{ fontSize: 11, color: "#555" }}>No skill match.</div>
                  ) : c._skills.slice(0, 3).map((sk, ski) => (
                    <div key={sk.id || ski} style={{ marginBottom: 4, padding: "3px 8px", background: "rgba(255,136,0,0.06)", border: "1px solid #ff880033", borderRadius: 4, fontSize: 11 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {sk.domain && <span style={{ background: "#ff880022", color: "#ff8800", border: "1px solid #ff880055", borderRadius: 3, padding: "0 5px", fontSize: 9 }}>{sk.domain}</span>}
                        <span style={{ color: "#ffa855", flex: 1 }}>{sk.name || sk.id}</span>
                        {sk.score != null && <span style={{ color: "#888", fontSize: 10 }}>score: {sk.score}</span>}
                        <span style={{ color: "#888", fontSize: 10 }}>hits: {sk.hits}</span>
                      </div>
                      {sk.description && <div style={{ color: "#888", fontSize: 10, marginTop: 2 }}>{sk.description.slice(0, 80)}{sk.description.length > 80 ? "…" : ""}</div>}
                    </div>
                  ))}
                  {c._skills.length > 3 && <div style={{ fontSize: 10, color: "#667" }}>+{c._skills.length - 3} more…</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess + brief */}
      <div style={{ borderTop: "1px solid #00ffe733", padding: "10px 14px" }}>
        {brief && (
          <div style={{ fontSize: 11, color: "#c8f0ff", background: "rgba(0,255,231,0.06)", border: "1px solid #00ffe733", borderRadius: 6, padding: "8px 10px", marginBottom: 8 }}>
            {brief}
          </div>
        )}
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            width: "100%", background: assessing ? "#001a2e" : "rgba(0,255,231,0.12)",
            border: "1px solid #00ffe7", color: "#00ffe7", borderRadius: 6,
            padding: "6px 0", fontSize: 12, cursor: assessing ? "default" : "pointer",
            fontFamily: "monospace", letterSpacing: 1,
          }}
        >
          {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
        </button>
      </div>
    </div>
  );
}
