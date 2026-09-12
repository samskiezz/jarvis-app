/**
 * F291 — Contact × AIP Skill × Risk Signal Intelligence Mesh (CSRSM)
 *
 * Parallel-fetches /entities/Contact + /v1/aip/skill + /entities/RiskSignal,
 * then keyword-correlates each contact against AIP skills AND active risk
 * signals to classify:
 *   FULLY_COVERED — contact matches at least one skill AND one risk signal
 *   SKILLED_ONLY  — matches a skill but no risk signal
 *   RISK_ONLY     — matches a risk signal but no skill
 *   DARK          — matches neither (intelligence blind spot)
 *
 * Stat tiles:  contacts / AIP skills / risk signals / dark
 * Filter tabs: ALL | FULLY_COVERED | SKILLED_ONLY | RISK_ONLY | DARK
 * Text search: across contact name / organization / role.
 * Expand row → matched skills + matched risk signals with relevance bars.
 * Amber badge on dark count.
 * ▶ ASSESS: 2-sentence contact coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ CSRSM  at left:7200 bottom:18, zIndex:68.
 * Event:   jarvis:csrsm-toggle
 * Voice:   "csrsm" / "contact skill risk" / "contact skill coverage"
 *          / "contact risk coverage" / "which contacts have skills"
 *          / "which contacts have risks" / "dark contacts"
 *          / "contact intelligence mesh" / "skill risk contact"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 7200;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise ────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseContacts(raw) {
  return normaliseArray(raw).map((c, i) => ({
    id:           String(c.id ?? c.contact_id ?? i),
    name:         c.name ?? c.full_name ?? c.display_name ?? `Contact ${i + 1}`,
    organization: c.organization ?? c.company ?? c.org ?? "",
    role:         c.role ?? c.title ?? c.position ?? "",
    searchText:   [c.name, c.full_name, c.email, c.organization, c.company, c.role, c.title, c.tags]
                    .filter(Boolean).join(" "),
  }));
}

function normaliseSkills(raw) {
  return normaliseArray(raw).map((s, i) => ({
    id:       String(s.id ?? s.skill_id ?? i),
    name:     s.name ?? s.skill_name ?? s.title ?? `Skill ${i + 1}`,
    category: s.category ?? s.domain ?? s.type ?? "",
    haystack: [s.name, s.description, s.domain, s.category, s.type, s.tags, s.objective]
                .filter(Boolean).join(" "),
  }));
}

function normaliseSignals(raw) {
  return normaliseArray(raw).map((r, i) => ({
    id:       String(r.id ?? r.signal_id ?? i),
    title:    r.title ?? r.name ?? r.signal ?? `Signal ${i + 1}`,
    severity: (r.severity ?? r.level ?? r.risk_level ?? "").toUpperCase(),
    haystack: [r.title, r.name, r.description, r.category, r.source, r.tags]
                .filter(Boolean).join(" "),
  }));
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function buildKeywords(strings) {
  return strings
    .flatMap(s => String(s).toLowerCase().split(/[^a-z0-9]+/))
    .filter(t => t.length >= 3);
}

function scoreMatch(keywords, haystack) {
  const h = haystack.toLowerCase();
  return keywords.reduce((acc, kw) => acc + (h.includes(kw) ? 1 : 0), 0);
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const base = apiBase();
  const hdrs = { Authorization: `Bearer ${API_KEY}` };
  const [cRaw, sRaw, rRaw] = await Promise.all([
    fetch(`${base}/entities/Contact`,    { headers: hdrs }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/aip/skill`,        { headers: hdrs }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/entities/RiskSignal`, { headers: hdrs }).then(r => r.ok ? r.json() : []),
  ]);
  return {
    contacts: normaliseContacts(cRaw),
    skills:   normaliseSkills(sRaw),
    signals:  normaliseSignals(rRaw),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(contacts, skills, signals) {
  return contacts.map(c => {
    const kws = buildKeywords([c.searchText]);

    const matchedSkills = skills
      .map(s => ({ s, score: scoreMatch(kws, s.haystack) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const matchedSignals = signals
      .map(r => ({ r, score: scoreMatch(kws, r.haystack) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const hasSkill  = matchedSkills.length  > 0;
    const hasSignal = matchedSignals.length > 0;
    const classification =
      hasSkill && hasSignal ? "FULLY_COVERED" :
      hasSkill              ? "SKILLED_ONLY"  :
      hasSignal             ? "RISK_ONLY"     : "DARK";

    return { ...c, matchedSkills, matchedSignals, classification };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const CSRSM_RE =
  /\b(csrsm|contact[\s_-]?skill[\s_-]?risk|contact[\s_-]?risk[\s_-]?skill|skill[\s_-]?risk[\s_-]?contact|contact[\s_-]?(skill|aip)[\s_-]?coverage|contact[\s_-]?risk[\s_-]?coverage|which[\s_-]?contacts[\s_-]?have[\s_-]?(skill[s]?|risk[s]?)|dark[\s_-]?contacts?|contact[\s_-]?intelligence[\s_-]?mesh)\b/i;

export function isCsrsmQuery(q) { return CSRSM_RE.test(q); }

export async function buildCsrsmScript() {
  try {
    const { contacts, skills, signals } = await fetchAll();
    const rows          = correlate(contacts, skills, signals);
    const fullyCount    = rows.filter(r => r.classification === "FULLY_COVERED").length;
    const skilledCount  = rows.filter(r => r.classification === "SKILLED_ONLY").length;
    const riskCount     = rows.filter(r => r.classification === "RISK_ONLY").length;
    const darkCount     = rows.filter(r => r.classification === "DARK").length;
    const prompt =
      `Contact × AIP Skill × Risk Signal intelligence mesh: ${contacts.length} contacts cross-referenced ` +
      `against ${skills.length} AIP skills and ${signals.length} active risk signals. ` +
      `${fullyCount} FULLY_COVERED, ${skilledCount} SKILLED_ONLY, ${riskCount} RISK_ONLY, ` +
      `${darkCount} DARK (no skill or risk context). ` +
      `Provide a 2-sentence contact intelligence brief and identify which dark contacts are highest priority.`;
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    return (
      data.response ?? data.reply ?? data.message ??
      `${fullyCount} fully covered, ${darkCount} dark across ${contacts.length} contacts.`
    );
  } catch {
    return "Contact skill risk mesh data unavailable.";
  }
}

// ─── severity colour ──────────────────────────────────────────────────────────

function sevColour(sev) {
  if (sev === "CRITICAL") return RED;
  if (sev === "HIGH")     return AMBER;
  if (sev === "MEDIUM")   return CY;
  return GREEN;
}

// ─── component ────────────────────────────────────────────────────────────────

const FILTERS = ["ALL", "FULLY_COVERED", "SKILLED_ONLY", "RISK_ONLY", "DARK"];

export default function ContactSkillRiskMesh() {
  const [open,       setOpen]       = useState(false);
  const [rows,       setRows]       = useState([]);
  const [skillCount, setSkillCount] = useState(0);
  const [sigCount,   setSigCount]   = useState(0);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { contacts, skills, signals } = await fetchAll();
      setRows(correlate(contacts, skills, signals));
      setSkillCount(skills.length);
      setSigCount(signals.length);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:csrsm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:csrsm-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const darkCount = rows.filter(r => r.classification === "DARK").length;

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.classification !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.name, r.organization, r.role].some(s => s.toLowerCase().includes(q));
  });

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildCsrsmScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, []);

  const statTileStyle = {
    background: "rgba(41,231,255,0.04)", border: `1px solid ${CY}22`,
    borderRadius: 4, padding: "6px 10px", textAlign: "center", minWidth: 70,
  };

  const classColour = cl =>
    cl === "FULLY_COVERED" ? GREEN :
    cl === "SKILLED_ONLY"  ? CY    :
    cl === "RISK_ONLY"     ? AMBER : RED;

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: darkCount > 0 ? "rgba(245,166,35,0.13)" : "rgba(41,231,255,0.08)",
          border: `1px solid ${darkCount > 0 ? AMBER : CY}55`,
          borderRadius: 4, color: darkCount > 0 ? AMBER : CY,
          fontFamily: MONO, fontSize: 9, fontWeight: 700,
          padding: "3px 7px", cursor: "pointer", letterSpacing: 1,
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        ◈ CSRSM
        {darkCount > 0 && (
          <span style={{
            background: AMBER, color: "#000", borderRadius: 3,
            padding: "0 4px", fontSize: 8, fontWeight: 800,
          }}>{darkCount}</span>
        )}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
          zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
        }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div style={{
            width: "min(820px,96vw)", maxHeight: "88vh", display: "flex",
            flexDirection: "column", background: BG,
            border: `1px solid ${CY}33`, borderRadius: 8,
            boxShadow: `0 0 40px ${CY}18`,
          }}>
            {/* header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: CY, fontWeight: 700, letterSpacing: 2 }}>
                CONTACT × AIP SKILL × RISK SIGNAL MESH
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={assess} disabled={assessing} style={{
                  background: assessing ? "rgba(41,231,255,0.04)" : "rgba(41,231,255,0.09)",
                  border: `1px solid ${CY}44`, borderRadius: 3, color: CY,
                  fontFamily: MONO, fontSize: 8, padding: "3px 8px", cursor: "pointer",
                }}>
                  {assessing ? "…" : "▶ ASSESS"}
                </button>
                <button onClick={() => setOpen(false)} style={{
                  background: "transparent", border: `1px solid ${CY}33`,
                  borderRadius: 3, color: MUTED, fontSize: 11, cursor: "pointer", padding: "2px 7px",
                }}>✕</button>
              </div>
            </div>

            {/* stat tiles */}
            {rows.length > 0 && (
              <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
                {[
                  ["CONTACTS",      rows.length,                                          CY   ],
                  ["AIP SKILLS",    skillCount,                                           GREEN],
                  ["RISK SIGNALS",  sigCount,                                             AMBER],
                  ["FULLY COVERED", rows.filter(r=>r.classification==="FULLY_COVERED").length, GREEN],
                  ["SKILLED ONLY",  rows.filter(r=>r.classification==="SKILLED_ONLY").length,  CY   ],
                  ["RISK ONLY",     rows.filter(r=>r.classification==="RISK_ONLY").length,     AMBER],
                  ["DARK",          darkCount,                                            RED  ],
                ].map(([label, val, col]) => (
                  <div key={label} style={statTileStyle}>
                    <div style={{ fontFamily: MONO, fontSize: 14, color: col, fontWeight: 700 }}>{val}</div>
                    <div style={{ fontFamily: MONO, fontSize: 7, color: MUTED, marginTop: 1 }}>{label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* filters + search */}
            <div style={{ display: "flex", gap: 6, padding: "0 14px 8px", flexWrap: "wrap" }}>
              {FILTERS.map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  background: filter === f ? `${CY}18` : "transparent",
                  border: `1px solid ${filter === f ? CY : CY + "33"}`,
                  borderRadius: 3, color: filter === f ? CY : MUTED,
                  fontFamily: MONO, fontSize: 8, padding: "3px 7px", cursor: "pointer",
                }}>{f}</button>
              ))}
              <input
                placeholder="search contacts…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  background: "rgba(41,231,255,0.04)", border: `1px solid ${CY}22`,
                  borderRadius: 3, color: CY, fontFamily: MONO, fontSize: 8,
                  padding: "3px 8px", outline: "none", marginLeft: "auto", width: 160,
                }}
              />
            </div>

            {/* body */}
            <div style={{ overflowY: "auto", padding: "0 14px 14px", flex: 1 }}>
              {loading && (
                <div style={{ fontFamily: MONO, fontSize: 9, color: MUTED, padding: 20, textAlign: "center" }}>
                  Loading…
                </div>
              )}
              {error && (
                <div style={{ fontFamily: MONO, fontSize: 9, color: RED, padding: 12 }}>
                  Error: {error}
                </div>
              )}
              {!loading && !error && visible.length === 0 && (
                <div style={{ fontFamily: MONO, fontSize: 9, color: MUTED, padding: 20, textAlign: "center" }}>
                  No contacts match.
                </div>
              )}
              {visible.map(row => {
                const isExp   = expanded === row.id;
                const cl      = row.classification;
                const clColor = classColour(cl);
                return (
                  <div key={row.id} style={{
                    border: `1px solid ${clColor}22`,
                    borderRadius: 4, marginBottom: 5,
                    background: isExp ? `${clColor}05` : "transparent",
                  }}>
                    <div
                      style={{
                        display: "flex", justifyContent: "space-between",
                        alignItems: "center", padding: "7px 10px", cursor: "pointer",
                      }}
                      onClick={() => setExpanded(isExp ? null : row.id)}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: CY, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {row.name}
                        </div>
                        {(row.organization || row.role) && (
                          <div style={{ fontFamily: MONO, fontSize: 7, color: MUTED }}>
                            {[row.role, row.organization].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <span style={{
                          fontFamily: MONO, fontSize: 7, color: clColor,
                          border: `1px solid ${clColor}44`, borderRadius: 2, padding: "1px 4px",
                        }}>{cl}</span>
                        {row.matchedSkills.length > 0 && (
                          <span style={{ fontFamily: MONO, fontSize: 7, color: GREEN }}>
                            {row.matchedSkills.length} skill{row.matchedSkills.length !== 1 ? "s" : ""}
                          </span>
                        )}
                        {row.matchedSignals.length > 0 && (
                          <span style={{ fontFamily: MONO, fontSize: 7, color: AMBER }}>
                            {row.matchedSignals.length} signal{row.matchedSignals.length !== 1 ? "s" : ""}
                          </span>
                        )}
                        <span style={{ color: MUTED, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {isExp && (
                      <div style={{ padding: "0 10px 10px", borderTop: `1px solid ${clColor}11` }}>

                        {/* matched skills */}
                        <div style={{ fontFamily: MONO, fontSize: 8, color: GREEN, marginBottom: 4, marginTop: 8 }}>
                          AIP SKILLS ({row.matchedSkills.length})
                        </div>
                        {row.matchedSkills.length === 0 ? (
                          <div style={{ fontFamily: MONO, fontSize: 8, color: MUTED, marginBottom: 8 }}>
                            No matching skills.
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8 }}>
                            {row.matchedSkills.slice(0, 4).map(({ s, score }) => (
                              <div key={s.id} style={{
                                background: "rgba(0,200,120,0.04)", border: `1px solid ${GREEN}1a`,
                                borderRadius: 3, padding: "4px 8px",
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                              }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontFamily: MONO, fontSize: 8, color: GREEN, fontWeight: 600 }}>{s.name}</div>
                                  {s.category && (
                                    <span style={{
                                      fontSize: 7, color: CY,
                                      border: `1px solid ${CY}44`, borderRadius: 2,
                                      padding: "0 3px", display: "inline-block",
                                    }}>{s.category}</span>
                                  )}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                  <span style={{ fontFamily: MONO, fontSize: 7, color: GREEN }}>score {score}</span>
                                  <div style={{ width: 36, height: 3, background: "rgba(0,200,120,0.1)", borderRadius: 2 }}>
                                    <div style={{
                                      width: `${Math.min(100, score * 10)}%`, height: "100%",
                                      background: GREEN, borderRadius: 2,
                                    }} />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* matched signals */}
                        <div style={{ fontFamily: MONO, fontSize: 8, color: AMBER, marginBottom: 4 }}>
                          RISK SIGNALS ({row.matchedSignals.length})
                        </div>
                        {row.matchedSignals.length === 0 ? (
                          <div style={{ fontFamily: MONO, fontSize: 8, color: MUTED }}>
                            No matching risk signals.
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {row.matchedSignals.slice(0, 4).map(({ r, score }) => (
                              <div key={r.id} style={{
                                background: "rgba(245,166,35,0.04)", border: `1px solid ${AMBER}1a`,
                                borderRadius: 3, padding: "4px 8px",
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                              }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontFamily: MONO, fontSize: 8, color: AMBER, fontWeight: 600 }}>{r.title}</div>
                                  {r.severity && (
                                    <span style={{
                                      fontSize: 7, color: sevColour(r.severity),
                                      border: `1px solid ${sevColour(r.severity)}44`, borderRadius: 2,
                                      padding: "0 3px", display: "inline-block",
                                    }}>{r.severity}</span>
                                  )}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                  <span style={{ fontFamily: MONO, fontSize: 7, color: AMBER }}>score {score}</span>
                                  <div style={{ width: 36, height: 3, background: "rgba(245,166,35,0.1)", borderRadius: 2 }}>
                                    <div style={{
                                      width: `${Math.min(100, score * 10)}%`, height: "100%",
                                      background: AMBER, borderRadius: 2,
                                    }} />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
