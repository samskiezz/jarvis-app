/**
 * F174 — RiskSignal × Scenario × Contact — Threat Attribution Matrix (THRMAT)
 *
 * Parallel-fetches /entities/RiskSignal + /v1/scenario/list + /entities/Contact every 90 s.
 * Keyword-correlates each risk signal against active scenarios AND responsible contacts:
 *
 *   FULLY_ATTRIBUTED  — backed by ≥1 scenario AND ≥1 contact
 *   SCENARIO_LINKED   — scenario context but no responsible contact
 *   CONTACT_LINKED    — contact responsible but no scenario alignment
 *   UNATTRIBUTED      — neither — threat with no context or owner
 *
 * Stat tiles: risk signals / scenarios / contacts / fully attributed / unattributed
 * Filter tabs: ALL | FULLY_ATTRIBUTED | SCENARIO_LINKED | CONTACT_LINKED | UNATTRIBUTED
 * Text search on signal name/severity/type/description.
 * Expand row → matched scenarios (amber bars) + matched contacts (cyan bars).
 * Red badge + pulse on UNATTRIBUTED count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat attribution brief + TTS.
 *
 * Toggle:  ◈ THRMAT  at bottom:8 left:969080, zIndex:675.
 * Event:   jarvis:thrmat-toggle
 * Voice:   "thrmat / threat attribution / risk signal scenario / risk contact /
 *           unattributed risk / threat attribution matrix / risk attribution /
 *           threat contact / signal attribution / risk scenario"
 * Refresh: 90 s auto-poll.
 */
import { useEffect, useRef, useState } from "react";

const BTN_LEFT = 969_080;
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

const THRMAT_RE =
  /\b(thrmat|threat\s+attribution|risk\s+signal\s+scenario|risk\s+contact|unattributed\s+risk|threat\s+attribution\s+matrix|risk\s+attribution|threat\s+contact|signal\s+attribution|risk\s+scenario\s+contact)\b/i;

export function isThrmtQuery(q) { return THRMAT_RE.test(q || ""); }

export async function buildThrmtScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [riskRes, scenarioRes, contactRes] = await Promise.all([
      fetch(`${base}/entities/RiskSignal`,  { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,     { headers: hdr }),
      fetch(`${base}/entities/Contact`,     { headers: hdr }),
    ]);
    const risks     = normArr(await riskRes.json(),     ["risks","risk_signals","data","items","results"]);
    const scenarios = normArr(await scenarioRes.json(), ["scenarios","data","items","results"]);
    const contacts  = normArr(await contactRes.json(),  ["contacts","data","items","results"]);

    const rows          = classifyRisks(risks, scenarios, contacts);
    const unattributed  = rows.filter((r) => r.cls === "UNATTRIBUTED").length;
    const fullyAttrib   = rows.filter((r) => r.cls === "FULLY_ATTRIBUTED").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS threat attribution matrix audit (THRMAT): ${risks.length} risk signals ` +
          `cross-referenced against ${scenarios.length} active scenarios and ${contacts.length} contacts — ` +
          `${fullyAttrib} fully attributed (scenario + contact), ${unattributed} unattributed (no context or owner). ` +
          `Give a 2-sentence threat attribution readiness brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return d?.response || d?.answer || d?.message || "Threat attribution matrix audit complete.";
  } catch (e) {
    return `Threat attribution matrix error: ${e.message}`;
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

function hasOverlap(riskToks, candidate) {
  const candToks = tokens(
    `${candidate.name || ""} ${candidate.title || ""} ${candidate.description || ""} ` +
    `${candidate.type || ""} ${candidate.category || ""} ${candidate.severity || ""} ` +
    `${candidate.role || ""} ${candidate.email || ""}`
  );
  return riskToks.some((t) => candToks.includes(t));
}

function classifyRisks(risks, scenarios, contacts) {
  return risks.map((risk) => {
    const riskToks       = tokens(
      `${risk.name || ""} ${risk.type || ""} ${risk.description || ""} ` +
      `${risk.severity || ""} ${risk.category || ""} ${risk.signal || ""}`
    );
    const matchedScenarios = scenarios.filter((s) => hasOverlap(riskToks, s));
    const matchedContacts  = contacts.filter((c)  => hasOverlap(riskToks, c));
    const hasScenario = matchedScenarios.length > 0;
    const hasContact  = matchedContacts.length  > 0;
    let cls = "UNATTRIBUTED";
    if (hasScenario && hasContact) cls = "FULLY_ATTRIBUTED";
    else if (hasScenario)          cls = "SCENARIO_LINKED";
    else if (hasContact)           cls = "CONTACT_LINKED";
    return { risk, cls, matchedScenarios, matchedContacts };
  });
}

// ── Colours ───────────────────────────────────────────────────────────────────

const CY  = "#29E7FF";
const GR  = "#2ECC71";
const AM  = "#F39C12";
const RD  = "#E74C3C";

const CLS_COLOR = {
  FULLY_ATTRIBUTED: GR,
  SCENARIO_LINKED:  AM,
  CONTACT_LINKED:   CY,
  UNATTRIBUTED:     RD,
};

const TABS = ["ALL", "FULLY_ATTRIBUTED", "SCENARIO_LINKED", "CONTACT_LINKED", "UNATTRIBUTED"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function RiskSignalScenarioContactMatrix() {
  const [visible,       setVisible]       = useState(false);
  const [rows,          setRows]          = useState([]);
  const [riskCnt,       setRiskCnt]       = useState(0);
  const [scenarioCnt,   setScenarioCnt]   = useState(0);
  const [contactCnt,    setContactCnt]    = useState(0);
  const [tab,           setTab]           = useState("ALL");
  const [search,        setSearch]        = useState("");
  const [expanded,      setExpanded]      = useState(null);
  const [answer,        setAnswer]        = useState("");
  const [loading,       setLoading]       = useState(false);
  const [assessing,     setAssessing]     = useState(false);
  const timer = useRef(null);

  const unattributedCount = rows.filter((r) => r.cls === "UNATTRIBUTED").length;
  const fullCount         = rows.filter((r) => r.cls === "FULLY_ATTRIBUTED").length;

  async function load() {
    try {
      setLoading(true);
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [riskRes, scenarioRes, contactRes] = await Promise.all([
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
        fetch(`${base}/v1/scenario/list`,    { headers: hdr }),
        fetch(`${base}/entities/Contact`,    { headers: hdr }),
      ]);
      const risks     = normArr(await riskRes.json(),     ["risks","risk_signals","data","items","results"]);
      const scenarios = normArr(await scenarioRes.json(), ["scenarios","data","items","results"]);
      const contacts  = normArr(await contactRes.json(),  ["contacts","data","items","results"]);
      setRiskCnt(risks.length);
      setScenarioCnt(scenarios.length);
      setContactCnt(contacts.length);
      setRows(classifyRisks(risks, scenarios, contacts));
    } catch (_) { /* silent — panel stays stale */ }
    finally    { setLoading(false); }
  }

  useEffect(() => {
    const toggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:thrmat-toggle", toggle);
    return () => window.removeEventListener("jarvis:thrmat-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [visible]);

  async function assess() {
    setAssessing(true);
    const text = await buildThrmtScript();
    setAnswer(text);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const filtered = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const rk = r.risk;
    return (
      String(rk.name || "").toLowerCase().includes(q) ||
      String(rk.type || "").toLowerCase().includes(q) ||
      String(rk.severity || "").toLowerCase().includes(q) ||
      String(rk.description || "").toLowerCase().includes(q)
    );
  });

  // ── Styles ──────────────────────────────────────────────────────────────────

  const S = {
    overlay: {
      position: "fixed", inset: 0, background: "rgba(0,8,16,.72)",
      zIndex: 9400, display: "flex", alignItems: "center", justifyContent: "center",
    },
    panel: {
      background: "#060e18", border: "1px solid #1a3a50",
      borderRadius: 10, width: "min(900px,95vw)", maxHeight: "88vh",
      display: "flex", flexDirection: "column", overflow: "hidden",
      boxShadow: "0 0 60px #E74C3C22",
    },
    header: {
      padding: "12px 18px", borderBottom: "1px solid #1a2e3a",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    },
    title: { color: RD, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 3 },
    close: {
      background: "none", border: "none", color: "#3a5a6a",
      fontSize: 14, cursor: "pointer", padding: "0 4px",
    },
    tiles: { display: "flex", gap: 8, padding: "10px 18px", flexWrap: "wrap" },
    tile: (col) => ({
      flex: "1 1 90px", background: `${col}0d`, border: `1px solid ${col}33`,
      borderRadius: 6, padding: "8px 12px", textAlign: "center",
    }),
    tileVal: (col) => ({
      color: col, fontFamily: "'JetBrains Mono',monospace",
      fontSize: 18, fontWeight: 700, lineHeight: 1,
    }),
    tileLabel: { color: "#3a5a6a", fontSize: 8, letterSpacing: 2, marginTop: 4 },
    tabs: {
      display: "flex", gap: 4, padding: "0 18px 8px", flexWrap: "wrap",
    },
    tabBtn: (active) => ({
      background: active ? "#0d2030" : "none",
      border: `1px solid ${active ? "#2a6a8a" : "#1a2e3a"}`,
      color: active ? CY : "#3a5a6a",
      borderRadius: 4, padding: "4px 10px", fontSize: 9,
      letterSpacing: 2, cursor: "pointer",
    }),
    search: {
      margin: "0 18px 8px", padding: "6px 10px",
      background: "#0a1520", border: "1px solid #1a2e3a",
      borderRadius: 5, color: "#80b0c8", fontSize: 10,
      outline: "none",
    },
    list: { flex: 1, overflowY: "auto", padding: "0 18px 8px" },
    row: (col) => ({
      border: `1px solid ${col}22`, borderRadius: 6, marginBottom: 6,
      padding: "8px 12px", cursor: "pointer",
      background: `${col}08`, transition: "background .2s",
    }),
    rowHead: { display: "flex", alignItems: "center", justifyContent: "space-between" },
    rowName: {
      color: "#b0d0e8", fontFamily: "'JetBrains Mono',monospace",
      fontSize: 10, letterSpacing: 1,
    },
    clsBadge: (col) => ({
      background: `${col}22`, border: `1px solid ${col}55`,
      color: col, borderRadius: 3, padding: "1px 7px",
      fontSize: 8, letterSpacing: 2,
    }),
    expand: {
      marginTop: 10, display: "flex", gap: 16,
      borderTop: "1px solid #1a2e3a", paddingTop: 10,
    },
    subCol: { flex: 1, minWidth: 200 },
    subTitle: { color: "#4a6a7a", fontSize: 9, letterSpacing: 2, marginBottom: 4 },
    bar: (col) => ({
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

  useEffect(() => {
    if (document.getElementById("thrmat-pulse-style")) return;
    const st = document.createElement("style");
    st.id = "thrmat-pulse-style";
    st.textContent = `
      @keyframes thrmat-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
      .thrmat-pulse { animation: thrmat-pulse 1.4s ease-in-out infinite; }
    `;
    document.head.appendChild(st);
  }, []);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("jarvis:thrmat-toggle"))}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 675,
          background: "#0a1520", border: "1px solid #1a3a50",
          color: unattributedCount > 0 ? RD : "#3a5a6a",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 2, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", userSelect: "none",
        }}
        title="Threat Attribution Matrix (THRMAT)"
      >
        <span
          className={unattributedCount > 0 ? "thrmat-pulse" : ""}
          style={{ marginRight: unattributedCount > 0 ? 4 : 0, color: RD }}
        >
          {unattributedCount > 0 ? `${unattributedCount}⚠` : ""}
        </span>
        ◈ THRMAT
      </button>

      {/* Panel overlay */}
      {visible && (
        <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) setVisible(false); }}>
          <div style={S.panel}>
            {/* Header */}
            <div style={S.header}>
              <span style={S.title}>◈ THREAT ATTRIBUTION MATRIX — RISK SIGNAL × SCENARIO × CONTACT</span>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {loading && <span style={{ color: "#3a5a6a", fontSize: 9, letterSpacing: 2 }}>POLLING…</span>}
                <button style={S.close} onClick={() => setVisible(false)}>✕</button>
              </div>
            </div>

            {/* Stat tiles */}
            <div style={S.tiles}>
              <div style={S.tile(RD)}>
                <div style={S.tileVal(RD)}>{riskCnt}</div>
                <div style={S.tileLabel}>RISK SIGNALS</div>
              </div>
              <div style={S.tile(AM)}>
                <div style={S.tileVal(AM)}>{scenarioCnt}</div>
                <div style={S.tileLabel}>SCENARIOS</div>
              </div>
              <div style={S.tile(CY)}>
                <div style={S.tileVal(CY)}>{contactCnt}</div>
                <div style={S.tileLabel}>CONTACTS</div>
              </div>
              <div style={S.tile(GR)}>
                <div style={S.tileVal(GR)}>{fullCount}</div>
                <div style={S.tileLabel}>FULLY ATTRIBUTED</div>
              </div>
              <div style={S.tile(RD)} className={unattributedCount > 0 ? "thrmat-pulse" : ""}>
                <div style={S.tileVal(RD)}>{unattributedCount}</div>
                <div style={S.tileLabel}>UNATTRIBUTED</div>
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
              placeholder="search signal name / type / severity…"
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
                const rk  = r.risk;
                const key = rk.id || rk.name || i;
                const open = expanded === key;
                const maxMatch = Math.max(
                  r.matchedScenarios.length,
                  r.matchedContacts.length,
                  1
                );
                return (
                  <div key={key} style={S.row(col)} onClick={() => setExpanded(open ? null : key)}>
                    <div style={S.rowHead}>
                      <span style={S.rowName}>
                        {rk.name || rk.id || `signal-${i}`}
                        {rk.severity
                          ? <span style={{ color: "#3a6a8a", fontSize: 9, marginLeft: 6 }}>[{rk.severity}]</span>
                          : null}
                        {rk.type
                          ? <span style={{ color: "#3a6a8a", fontSize: 9, marginLeft: 4 }}>{rk.type}</span>
                          : null}
                      </span>
                      <span style={S.clsBadge(col)}>{r.cls}</span>
                    </div>
                    {rk.description && (
                      <div style={{ color: "#3a6a7a", fontSize: 9, marginTop: 3, letterSpacing: 1 }}>
                        {String(rk.description).slice(0, 90)}{String(rk.description).length > 90 ? "…" : ""}
                      </div>
                    )}
                    {open && (
                      <div style={S.expand}>
                        {/* Scenarios */}
                        <div style={S.subCol}>
                          <div style={S.subTitle}>SCENARIOS ({r.matchedScenarios.length})</div>
                          {r.matchedScenarios.length === 0
                            ? <div style={{ color: "#2a4a5a", fontSize: 9 }}>— none —</div>
                            : r.matchedScenarios.slice(0, 6).map((sc, si) => (
                              <div key={si} style={S.bar(AM)}>
                                <div style={S.barFill(AM, (r.matchedScenarios.length / maxMatch) * 100)} />
                                <span style={S.barLabel}>{sc.name || sc.title || sc.id || `scenario-${si}`}</span>
                              </div>
                            ))
                          }
                        </div>
                        {/* Contacts */}
                        <div style={S.subCol}>
                          <div style={S.subTitle}>CONTACTS ({r.matchedContacts.length})</div>
                          {r.matchedContacts.length === 0
                            ? <div style={{ color: "#2a4a5a", fontSize: 9 }}>— none —</div>
                            : r.matchedContacts.slice(0, 6).map((c, ci) => (
                              <div key={ci} style={S.bar(CY)}>
                                <div style={S.barFill(CY, (r.matchedContacts.length / maxMatch) * 100)} />
                                <span style={S.barLabel}>{c.name || c.email || `contact-${ci}`}</span>
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
