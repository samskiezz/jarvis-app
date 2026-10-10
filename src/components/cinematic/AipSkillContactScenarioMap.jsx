/**
 * F173 — AIP Skill × Contact × Scenario — Operator Capability Mapping (OPMAP)
 *
 * Parallel-fetches /v1/aip/skill + /entities/Contact + /v1/scenario/list every 90 s.
 * Keyword-correlates each AIP skill against contacts (operator personnel) AND scenarios
 * (operational contexts where the skill applies):
 *
 *   FULLY_MAPPED      — backed by ≥1 contact AND ≥1 scenario
 *   CONTACT_MAPPED    — contact coverage but no scenario alignment
 *   SCENARIO_MAPPED   — scenario coverage but no assigned contact
 *   UNMAPPED          — neither — capability with no operator or context
 *
 * Stat tiles: skills / contacts / scenarios / fully mapped / unmapped
 * Filter tabs: ALL | FULLY_MAPPED | CONTACT_MAPPED | SCENARIO_MAPPED | UNMAPPED
 * Text search on skill name/category/description.
 * Expand row → matched contacts (cyan bars) + matched scenarios (amber bars).
 * Amber badge + pulse on UNMAPPED count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence capability brief + TTS.
 *
 * Toggle:  ◈ OPMAP  at bottom:8 left:968220, zIndex:674.
 * Event:   jarvis:opmap-toggle
 * Voice:   "opmap / operator capability / skill contact / skill scenario /
 *           unmapped skill / skill operator / capability mapping / skill coverage /
 *           operational mapping / skill personnel"
 * Refresh: 90 s auto-poll.
 */
import { useEffect, useRef, useState } from "react";

const BTN_LEFT = 968_220;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ───────────────────────────────────────────────────

const OPMAP_RE =
  /\b(opmap|operator\s+capability|skill\s+contact|skill\s+scenario|unmapped\s+skill|skill\s+operator|capability\s+mapping|skill\s+coverage|operational\s+mapping|skill\s+personnel|operator\s+capability\s+map)\b/i;

export function isOpmapQuery(q) { return OPMAP_RE.test(q || ""); }

export async function buildOpmapScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [skillRes, contactRes, scenarioRes] = await Promise.all([
      fetch(`${base}/v1/aip/skill`,        { headers: hdr }),
      fetch(`${base}/entities/Contact`,    { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,    { headers: hdr }),
    ]);
    const skills    = normArr(await skillRes.json(),    ["skills","data","items","results"]);
    const contacts  = normArr(await contactRes.json(),  ["contacts","data","items","results"]);
    const scenarios = normArr(await scenarioRes.json(), ["scenarios","data","items","results"]);

    const rows       = classifySkills(skills, contacts, scenarios);
    const unmapped   = rows.filter((r) => r.cls === "UNMAPPED").length;
    const fullMapped = rows.filter((r) => r.cls === "FULLY_MAPPED").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS operator capability mapping audit (OPMAP): ${skills.length} AIP skills ` +
          `cross-referenced against ${contacts.length} contacts and ${scenarios.length} scenarios — ` +
          `${fullMapped} fully mapped (operator + scenario), ${unmapped} unmapped (no operator or context). ` +
          `Give a 2-sentence capability readiness brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return d?.response || d?.answer || d?.message || "Operator capability mapping audit complete.";
  } catch (e) {
    return `Operator capability mapping error: ${e.message}`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normArr(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function tokens(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter((t) => t.length > 2);
}

function hasOverlap(skillTokens, candidate) {
  const candToks = tokens(
    `${candidate.name || ""} ${candidate.title || ""} ${candidate.description || ""} ` +
    `${candidate.role || ""} ${candidate.category || ""} ${candidate.type || ""}`
  );
  return skillTokens.some((t) => candToks.includes(t));
}

function classifySkills(skills, contacts, scenarios) {
  return skills.map((skill) => {
    const skillToks       = tokens(
      `${skill.name || ""} ${skill.category || ""} ${skill.description || ""} ${skill.type || ""}`
    );
    const matchedContacts  = contacts.filter((c)  => hasOverlap(skillToks, c));
    const matchedScenarios = scenarios.filter((s) => hasOverlap(skillToks, s));
    const hasContact  = matchedContacts.length  > 0;
    const hasScenario = matchedScenarios.length > 0;
    let cls = "UNMAPPED";
    if (hasContact && hasScenario) cls = "FULLY_MAPPED";
    else if (hasContact)           cls = "CONTACT_MAPPED";
    else if (hasScenario)          cls = "SCENARIO_MAPPED";
    return { skill, cls, matchedContacts, matchedScenarios };
  });
}

// ── Colours ───────────────────────────────────────────────────────────────────

const CY  = "#29E7FF";
const GR  = "#2ECC71";
const AM  = "#F39C12";
const OR  = "#FF8C00";

const CLS_COLOR = {
  FULLY_MAPPED:    GR,
  CONTACT_MAPPED:  CY,
  SCENARIO_MAPPED: AM,
  UNMAPPED:        OR,
};
const TABS = ["ALL", "FULLY_MAPPED", "CONTACT_MAPPED", "SCENARIO_MAPPED", "UNMAPPED"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function AipSkillContactScenarioMap() {
  const [visible,    setVisible]    = useState(false);
  const [rows,       setRows]       = useState([]);
  const [skillCnt,   setSkillCnt]   = useState(0);
  const [contactCnt, setContactCnt] = useState(0);
  const [scenarioCnt,setScenarioCnt]= useState(0);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [answer,     setAnswer]     = useState("");
  const [loading,    setLoading]    = useState(false);
  const [assessing,  setAssessing]  = useState(false);
  const timer = useRef(null);

  const unmappedCount  = rows.filter((r) => r.cls === "UNMAPPED").length;
  const fullCount      = rows.filter((r) => r.cls === "FULLY_MAPPED").length;

  async function load() {
    try {
      setLoading(true);
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [skillRes, contactRes, scenarioRes] = await Promise.all([
        fetch(`${base}/v1/aip/skill`,     { headers: hdr }),
        fetch(`${base}/entities/Contact`, { headers: hdr }),
        fetch(`${base}/v1/scenario/list`, { headers: hdr }),
      ]);
      const skills    = normArr(await skillRes.json(),    ["skills","data","items","results"]);
      const contacts  = normArr(await contactRes.json(),  ["contacts","data","items","results"]);
      const scenarios = normArr(await scenarioRes.json(), ["scenarios","data","items","results"]);
      setSkillCnt(skills.length);
      setContactCnt(contacts.length);
      setScenarioCnt(scenarios.length);
      setRows(classifySkills(skills, contacts, scenarios));
    } catch (_) { /* silent — panel stays stale */ }
    finally    { setLoading(false); }
  }

  useEffect(() => {
    const toggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:opmap-toggle", toggle);
    return () => window.removeEventListener("jarvis:opmap-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [visible]);

  async function assess() {
    setAssessing(true);
    const text = await buildOpmapScript();
    setAnswer(text);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const filtered = rows
    .filter((r) => tab === "ALL" || r.cls === tab)
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      const s = r.skill;
      return (
        (s.name        || "").toLowerCase().includes(q) ||
        (s.category    || "").toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q)
      );
    });

  const S = {
    overlay: {
      position: "fixed", inset: 0, background: "rgba(0,0,0,.82)",
      backdropFilter: "blur(6px)", zIndex: 674, display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono',monospace",
    },
    panel: {
      width: 780, maxHeight: "88vh", background: "#0a0f14",
      border: "1px solid #1e3a4a", borderRadius: 10,
      display: "flex", flexDirection: "column", overflow: "hidden",
    },
    header: {
      padding: "14px 18px 10px", borderBottom: "1px solid #1a2e3a",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    },
    title: { color: AM, fontSize: 13, letterSpacing: 3, fontWeight: 700 },
    close: {
      background: "none", border: "none", color: "#4a6a7a",
      fontSize: 18, cursor: "pointer", lineHeight: 1,
    },
    tiles: {
      display: "flex", gap: 10, padding: "12px 18px",
      borderBottom: "1px solid #1a2e3a", flexWrap: "wrap",
    },
    tile: (col) => ({
      flex: "1 1 100px", background: "#0d1a24", borderRadius: 7,
      padding: "8px 10px", border: `1px solid ${col}44`,
      textAlign: "center",
    }),
    tileVal: (col) => ({ color: col, fontSize: 18, fontWeight: 700 }),
    tileLabel: { color: "#4a6a7a", fontSize: 9, letterSpacing: 2, marginTop: 2 },
    tabs: {
      display: "flex", gap: 6, padding: "8px 18px",
      borderBottom: "1px solid #1a2e3a", flexWrap: "wrap",
    },
    tabBtn: (active) => ({
      background: active ? "#1a2e3a" : "none",
      border: `1px solid ${active ? "#2a4a5a" : "#1a2a3a"}`,
      color: active ? "#e0f0ff" : "#4a6a7a",
      borderRadius: 5, padding: "3px 10px", fontSize: 10,
      letterSpacing: 1, cursor: "pointer",
    }),
    search: {
      margin: "8px 18px", background: "#0d1a24",
      border: "1px solid #1a2e3a", borderRadius: 5,
      color: "#b0d0e0", padding: "5px 10px", fontSize: 11,
      outline: "none", width: "calc(100% - 36px)", boxSizing: "border-box",
    },
    list: { overflowY: "auto", flex: 1, padding: "0 18px 12px" },
    row: (col) => ({
      borderLeft: `3px solid ${col}`,
      background: "#0d1a24", borderRadius: 5,
      marginBottom: 6, padding: "7px 10px",
      cursor: "pointer",
    }),
    rowHead: {
      display: "flex", justifyContent: "space-between", alignItems: "center",
    },
    rowName: { color: "#c0dff0", fontSize: 11, letterSpacing: 1 },
    clsBadge: (col) => ({
      background: `${col}22`, border: `1px solid ${col}55`,
      color: col, fontSize: 8, padding: "1px 6px", borderRadius: 3,
      letterSpacing: 2,
    }),
    expand: {
      marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap",
    },
    subCol: { flex: 1, minWidth: 200 },
    subTitle: { color: "#4a6a7a", fontSize: 9, letterSpacing: 2, marginBottom: 4 },
    bar: (col, pct) => ({
      height: 14, background: `${col}22`, borderRadius: 3,
      marginBottom: 3, overflow: "hidden", position: "relative",
    }),
    barFill: (col, pct) => ({
      width: `${Math.min(pct, 100)}%`, height: "100%",
      background: `${col}66`, transition: "width .4s",
    }),
    barLabel: {
      position: "absolute", top: 0, left: 4,
      color: "#b0c8d8", fontSize: 9, lineHeight: "14px",
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      maxWidth: "90%",
    },
    footer: {
      padding: "10px 18px", borderTop: "1px solid #1a2e3a",
      display: "flex", gap: 10, alignItems: "flex-start",
    },
    assessBtn: (busy) => ({
      background: busy ? "#1a2a3a" : "#0d2030",
      border: "1px solid #2a6a8a", color: busy ? "#4a6a7a" : CY,
      borderRadius: 5, padding: "5px 14px", fontSize: 10,
      letterSpacing: 2, cursor: busy ? "not-allowed" : "pointer",
      whiteSpace: "nowrap",
    }),
    answer: {
      flex: 1, color: "#80b0c8", fontSize: 10, lineHeight: 1.5,
      fontStyle: "italic",
    },
  };

  // pulse keyframes injected once
  useEffect(() => {
    if (document.getElementById("opmap-pulse-style")) return;
    const st = document.createElement("style");
    st.id = "opmap-pulse-style";
    st.textContent = `
      @keyframes opmap-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
      .opmap-pulse { animation: opmap-pulse 1.4s ease-in-out infinite; }
    `;
    document.head.appendChild(st);
  }, []);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("jarvis:opmap-toggle"))}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 674,
          background: "#0a1520", border: "1px solid #1a3a50",
          color: unmappedCount > 0 ? AM : "#3a5a6a",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 2, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", userSelect: "none",
        }}
        title="Operator Capability Mapping (OPMAP)"
      >
        <span
          className={unmappedCount > 0 ? "opmap-pulse" : ""}
          style={{ marginRight: unmappedCount > 0 ? 4 : 0, color: OR }}
        >
          {unmappedCount > 0 ? `${unmappedCount}⚠` : ""}
        </span>
        ◈ OPMAP
      </button>

      {/* Panel overlay */}
      {visible && (
        <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) setVisible(false); }}>
          <div style={S.panel}>
            {/* Header */}
            <div style={S.header}>
              <span style={S.title}>◈ OPERATOR CAPABILITY MAP — AIP SKILL × CONTACT × SCENARIO</span>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {loading && <span style={{ color: "#3a5a6a", fontSize: 9, letterSpacing: 2 }}>POLLING…</span>}
                <button style={S.close} onClick={() => setVisible(false)}>✕</button>
              </div>
            </div>

            {/* Stat tiles */}
            <div style={S.tiles}>
              <div style={S.tile("#29E7FF")}>
                <div style={S.tileVal("#29E7FF")}>{skillCnt}</div>
                <div style={S.tileLabel}>SKILLS</div>
              </div>
              <div style={S.tile("#8855FF")}>
                <div style={S.tileVal("#8855FF")}>{contactCnt}</div>
                <div style={S.tileLabel}>CONTACTS</div>
              </div>
              <div style={S.tile(AM)}>
                <div style={S.tileVal(AM)}>{scenarioCnt}</div>
                <div style={S.tileLabel}>SCENARIOS</div>
              </div>
              <div style={S.tile("#2ECC71")}>
                <div style={S.tileVal("#2ECC71")}>{fullCount}</div>
                <div style={S.tileLabel}>FULLY MAPPED</div>
              </div>
              <div style={S.tile(OR)} className={unmappedCount > 0 ? "opmap-pulse" : ""}>
                <div style={S.tileVal(OR)}>{unmappedCount}</div>
                <div style={S.tileLabel}>UNMAPPED</div>
              </div>
            </div>

            {/* Filter tabs */}
            <div style={S.tabs}>
              {TABS.map((t) => (
                <button key={t} style={S.tabBtn(tab === t)} onClick={() => setTab(t)}>{t}</button>
              ))}
            </div>

            {/* Search */}
            <input
              style={S.search}
              placeholder="search skill name / category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {/* List */}
            <div style={S.list}>
              {filtered.length === 0 && (
                <div style={{ color: "#2a4a5a", fontSize: 10, padding: "20px 0", textAlign: "center" }}>
                  {loading ? "LOADING…" : "NO RESULTS"}
                </div>
              )}
              {filtered.map((r, i) => {
                const col = CLS_COLOR[r.cls];
                const sk  = r.skill;
                const key = sk.id || sk.name || i;
                const open = expanded === key;
                const maxMatch = Math.max(
                  r.matchedContacts.length,
                  r.matchedScenarios.length,
                  1
                );
                return (
                  <div key={key} style={S.row(col)} onClick={() => setExpanded(open ? null : key)}>
                    <div style={S.rowHead}>
                      <span style={S.rowName}>
                        {sk.name || sk.id || `skill-${i}`}
                        {sk.category ? <span style={{ color: "#3a6a8a", fontSize: 9, marginLeft: 6 }}>[{sk.category}]</span> : null}
                      </span>
                      <span style={S.clsBadge(col)}>{r.cls}</span>
                    </div>
                    {sk.description && (
                      <div style={{ color: "#3a6a7a", fontSize: 9, marginTop: 3, letterSpacing: 1 }}>
                        {String(sk.description).slice(0, 90)}{String(sk.description).length > 90 ? "…" : ""}
                      </div>
                    )}
                    {open && (
                      <div style={S.expand}>
                        {/* Contacts */}
                        <div style={S.subCol}>
                          <div style={S.subTitle}>CONTACTS ({r.matchedContacts.length})</div>
                          {r.matchedContacts.length === 0
                            ? <div style={{ color: "#2a4a5a", fontSize: 9 }}>— none —</div>
                            : r.matchedContacts.slice(0, 6).map((c, ci) => (
                              <div key={ci} style={S.bar(CY, (r.matchedContacts.length / maxMatch) * 100)}>
                                <div style={S.barFill(CY, (r.matchedContacts.length / maxMatch) * 100)} />
                                <span style={S.barLabel}>{c.name || c.email || `contact-${ci}`}</span>
                              </div>
                            ))
                          }
                        </div>
                        {/* Scenarios */}
                        <div style={S.subCol}>
                          <div style={S.subTitle}>SCENARIOS ({r.matchedScenarios.length})</div>
                          {r.matchedScenarios.length === 0
                            ? <div style={{ color: "#2a4a5a", fontSize: 9 }}>— none —</div>
                            : r.matchedScenarios.slice(0, 6).map((sc, si) => (
                              <div key={si} style={S.bar(AM, (r.matchedScenarios.length / maxMatch) * 100)}>
                                <div style={S.barFill(AM, (r.matchedScenarios.length / maxMatch) * 100)} />
                                <span style={S.barLabel}>{sc.name || sc.title || sc.id || `scenario-${si}`}</span>
                              </div>
                            ))
                          }
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer / Assess */}
            <div style={S.footer}>
              <button style={S.assessBtn(assessing)} onClick={assess} disabled={assessing}>
                {assessing ? "ANALYSING…" : "▶ ASSESS"}
              </button>
              {answer && <div style={S.answer}>{answer}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
