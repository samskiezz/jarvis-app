/**
 * F290 — AIP Skill × Investigation Coverage (ASIC)
 *
 * Parallel-fetches /v1/aip/skill + /v1/investigations, then keyword-correlates
 * each JARVIS AIP skill against active investigations to classify:
 *   DRIVEN     — at least one investigation provides operational context for the skill
 *   AUTONOMOUS — no investigation backs or drives this skill's deployment
 *
 * Stat tiles:  skills / investigations / driven / autonomous
 * Filter tabs: ALL | DRIVEN | AUTONOMOUS
 * Text search: across skill name / description.
 * Expand row → matched investigation cards with status badge + relevance score + bar.
 * Amber badge on autonomous count.
 * ▶ ASSESS: 2-sentence skill-investigation coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ ASIC  at left:7140 bottom:18, zIndex:68.
 * Event:   jarvis:asic-toggle
 * Voice:   "asic" / "aip investigation" / "skill investigation" / "driven skills"
 *          / "autonomous skills" / "investigation skill coverage" / "skill investigation coverage"
 *          / "which skills have investigations" / "aip skill investigation"
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

const BTN_LEFT   = 7140;
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

function normaliseSkills(raw) {
  return normaliseArray(raw).map((s, i) => ({
    id:          String(s.id ?? s.skill_id ?? i),
    name:        s.name ?? s.skill_name ?? s.title ?? `Skill ${i + 1}`,
    description: [s.description, s.domain, s.category, s.type, s.tags, s.objective]
                   .filter(Boolean).join(" "),
    status:      s.status ?? s.state ?? "",
  }));
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv, i) => ({
    id:      String(inv.id ?? inv.investigation_id ?? i),
    title:   inv.title ?? inv.name ?? inv.subject ?? `Investigation ${i + 1}`,
    status:  inv.status ?? inv.state ?? inv.phase ?? "",
    summary: [inv.summary, inv.description, inv.body, inv.details, inv.tags]
               .filter(Boolean).join(" ").slice(0, 400),
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
  let hits = 0;
  for (const kw of keywords) if (h.includes(kw)) hits++;
  return hits;
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [sRes, iRes] = await Promise.all([
    fetch(`${base}/v1/aip/skill`,       { headers: hdr }),
    fetch(`${base}/v1/investigations`,  { headers: hdr }),
  ]);
  return {
    skills:         normaliseSkills(await sRes.json()),
    investigations: normaliseInvestigations(await iRes.json()),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(skills, investigations) {
  return skills.map(skill => {
    const kws = buildKeywords([skill.name, skill.description]);
    const matched = investigations
      .map(inv => ({
        inv,
        score: scoreMatch(kws, `${inv.title} ${inv.summary}`),
      }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return {
      ...skill,
      matched,
      classification: matched.length > 0 ? "DRIVEN" : "AUTONOMOUS",
    };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const ASIC_RE =
  /\b(asic|aip[\s_-]?(skill[\s_-]?)?investigation[s]?|skill[\s_-]?investigation[s]?|investigation[\s_-]?(skill[s]?|aip|coverage)|driven[\s_-]?skill[s]?|autonomous[\s_-]?skill[s]?|which[\s_-]?skill[s]?[\s_-]?(have|lack)[\s_-]?investigation[s]?|skill[\s_-]?investigation[\s_-]?coverage)\b/i;

export function isAsicQuery(q) { return ASIC_RE.test(q); }

export async function buildAsicScript() {
  try {
    const { skills, investigations } = await fetchAll();
    const rows       = correlate(skills, investigations);
    const driven     = rows.filter(r => r.classification === "DRIVEN").length;
    const autonomous = rows.filter(r => r.classification === "AUTONOMOUS").length;
    const prompt =
      `AIP skill investigation coverage: ${skills.length} JARVIS skills cross-referenced against ` +
      `${investigations.length} active investigations. ` +
      `${driven} skills are DRIVEN — at least one investigation provides operational context; ` +
      `${autonomous} skills are AUTONOMOUS — deployed with no investigation backing. ` +
      `Provide a 2-sentence operational assessment and identify which autonomous skills most urgently need investigation context.`;
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    return (
      data.response ?? data.reply ?? data.message ??
      `${driven} skills driven, ${autonomous} autonomous across ${investigations.length} investigations.`
    );
  } catch {
    return "AIP skill investigation coverage data unavailable.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

const FILTERS = ["ALL", "DRIVEN", "AUTONOMOUS"];

export default function AipSkillInvestigationCoverage() {
  const [open,           setOpen]           = useState(false);
  const [rows,           setRows]           = useState([]);
  const [invCount,       setInvCount]       = useState(0);
  const [filter,         setFilter]         = useState("ALL");
  const [search,         setSearch]         = useState("");
  const [expanded,       setExpanded]       = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState(null);
  const [assessing,      setAssessing]      = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { skills, investigations } = await fetchAll();
      setRows(correlate(skills, investigations));
      setInvCount(investigations.length);
    } catch (e) {
      setError(String(e?.message ?? e));
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
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:asic-toggle", handler);
    return () => window.removeEventListener("jarvis:asic-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildAsicScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const driven     = rows.filter(r => r.classification === "DRIVEN").length;
  const autonomous = rows.filter(r => r.classification === "AUTONOMOUS").length;

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.classification !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
  });

  // ── toggle button ──────────────────────────────────────────────────────────
  const toggleBtn = (
    <button
      onClick={() => setOpen(v => !v)}
      title="AIP Skill × Investigation Coverage (ASIC)"
      style={{
        position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
        background: open ? AMBER : "rgba(245,166,35,0.10)",
        border: `1px solid ${AMBER}`,
        color: open ? "#000" : AMBER,
        fontFamily: MONO, fontSize: 9, fontWeight: 700,
        padding: "3px 7px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        display: "flex", alignItems: "center", gap: 4,
      }}
    >
      ◈ ASIC
      {autonomous > 0 && (
        <span style={{
          background: AMBER, color: "#000", borderRadius: 8,
          fontSize: 8, padding: "1px 4px", fontWeight: 900,
        }}>{autonomous}</span>
      )}
    </button>
  );

  if (!open) return toggleBtn;

  // ── panel ─────────────────────────────────────────────────────────────────
  return (
    <>
      {toggleBtn}
      <div style={{
        position: "fixed", inset: 0, zIndex: 210,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          width: "min(860px,96vw)", maxHeight: "88vh",
          background: BG, border: `1px solid ${AMBER}33`,
          borderRadius: 8, display: "flex", flexDirection: "column",
          fontFamily: MONO, color: AMBER, overflow: "hidden",
        }}>
          {/* header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderBottom: `1px solid ${AMBER}22`,
            background: "rgba(245,166,35,0.04)",
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>
              ◈ AIP SKILL × INVESTIGATION COVERAGE
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={assess} disabled={assessing} style={{
                background: "transparent", border: `1px solid ${AMBER}66`,
                color: AMBER, fontFamily: MONO, fontSize: 9, padding: "2px 8px",
                borderRadius: 3, cursor: "pointer",
              }}>
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button onClick={load} style={{
                background: "transparent", border: `1px solid ${AMBER}44`,
                color: AMBER, fontFamily: MONO, fontSize: 9, padding: "2px 6px",
                borderRadius: 3, cursor: "pointer",
              }}>↺</button>
              <button onClick={() => setOpen(false)} style={{
                background: "transparent", border: "none",
                color: MUTED, fontSize: 14, cursor: "pointer", lineHeight: 1,
              }}>✕</button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 1, background: `${AMBER}11`, margin: "10px 14px 6px",
            borderRadius: 4, overflow: "hidden",
          }}>
            {[
              { label: "SKILLS",        value: rows.length,  color: AMBER },
              { label: "INVESTIGATIONS",value: invCount,      color: CY   },
              { label: "DRIVEN",        value: driven,        color: GREEN },
              { label: "AUTONOMOUS",    value: autonomous,    color: RED  },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: "rgba(4,7,14,0.85)", padding: "8px 10px", textAlign: "center",
              }}>
                <div style={{ fontSize: 18, fontWeight: 900, color }}>{loading ? "…" : value}</div>
                <div style={{ fontSize: 8, color: MUTED, letterSpacing: 1.5 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter + search */}
          <div style={{ display: "flex", gap: 8, padding: "4px 14px 8px", alignItems: "center" }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background:   filter === f ? AMBER : "transparent",
                color:        filter === f ? "#000" : MUTED,
                border:       `1px solid ${filter === f ? AMBER : MUTED + "44"}`,
                fontFamily:   MONO, fontSize: 8, padding: "2px 8px",
                borderRadius: 3, cursor: "pointer", fontWeight: filter === f ? 700 : 400,
              }}>{f}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search skills…"
              style={{
                flex: 1, background: "rgba(245,166,35,0.06)", border: `1px solid ${AMBER}33`,
                color: AMBER, fontFamily: MONO, fontSize: 9, padding: "3px 8px",
                borderRadius: 3, outline: "none",
              }}
            />
          </div>

          {/* error */}
          {error && (
            <div style={{ color: RED, fontSize: 9, padding: "4px 14px" }}>
              Error: {error}
            </div>
          )}

          {/* rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 14px" }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: MUTED, fontSize: 9, textAlign: "center", paddingTop: 24 }}>
                No skills match current filter.
              </div>
            )}
            {visible.map(row => {
              const isExp   = expanded === row.id;
              const isAuto  = row.classification === "AUTONOMOUS";
              const topScore = row.matched[0]?.score ?? 0;
              const barPct  = Math.min(100, topScore * 10);
              return (
                <div key={row.id} style={{
                  background:   isExp ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.02)",
                  border:       `1px solid ${isAuto ? RED + "44" : GREEN + "33"}`,
                  borderRadius: 4, marginBottom: 4, overflow: "hidden",
                }}>
                  {/* row header */}
                  <div
                    onClick={() => setExpanded(isExp ? null : row.id)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "7px 10px", cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{
                        fontSize: 8, fontWeight: 700, letterSpacing: 1,
                        color:   isAuto ? RED : GREEN,
                        border:  `1px solid ${isAuto ? RED + "66" : GREEN + "66"}`,
                        padding: "1px 5px", borderRadius: 2, whiteSpace: "nowrap",
                      }}>
                        {row.classification}
                      </span>
                      <span style={{ fontSize: 9, color: AMBER, fontWeight: 600 }}>
                        {row.name}
                      </span>
                      {row.status && (
                        <span style={{ fontSize: 7, color: MUTED }}>
                          [{row.status}]
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {row.matched.length > 0 && (
                        <span style={{ fontSize: 8, color: CY }}>
                          {row.matched.length} inv
                        </span>
                      )}
                      <div style={{ width: 60, height: 4, background: "rgba(245,166,35,0.1)", borderRadius: 2 }}>
                        <div style={{
                          width: `${barPct}%`, height: "100%",
                          background: isAuto ? RED : GREEN, borderRadius: 2,
                        }} />
                      </div>
                      <span style={{ color: MUTED, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* expanded detail */}
                  {isExp && (
                    <div style={{ padding: "0 10px 10px", borderTop: `1px solid ${AMBER}11` }}>
                      {row.description && (
                        <div style={{ fontSize: 8, color: MUTED, marginBottom: 8, marginTop: 6 }}>
                          {row.description.slice(0, 200)}
                        </div>
                      )}
                      {row.matched.length === 0 ? (
                        <div style={{
                          fontSize: 8, color: RED, padding: "6px 8px",
                          background: "rgba(255,59,107,0.06)", borderRadius: 3,
                        }}>
                          No matching investigations — this skill operates without investigation context.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {row.matched.map(({ inv, score }) => (
                            <div key={inv.id} style={{
                              background: "rgba(245,166,35,0.04)", border: `1px solid ${AMBER}1a`,
                              borderRadius: 3, padding: "5px 8px",
                              display: "flex", justifyContent: "space-between", alignItems: "center",
                            }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 8, color: AMBER, fontWeight: 600 }}>{inv.title}</div>
                                {inv.status && (
                                  <span style={{
                                    fontSize: 7, color: CY,
                                    border: `1px solid ${CY}44`, borderRadius: 2,
                                    padding: "0 3px", marginTop: 2, display: "inline-block",
                                  }}>{inv.status}</span>
                                )}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                <span style={{ fontSize: 7, color: GREEN }}>score {score}</span>
                                <div style={{ width: 40, height: 3, background: "rgba(245,166,35,0.1)", borderRadius: 2 }}>
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
    </>
  );
}
