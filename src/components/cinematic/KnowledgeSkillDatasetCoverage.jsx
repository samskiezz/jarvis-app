/**
 * F76 – Knowledge × Skill × Dataset Learning Coverage (KSDLCOV)
 * Cross-correlates /knowledge/ × /v1/aip/skill × /v1/datasets.
 * Classifies each knowledge article:
 *   FULLY_COVERED – matched by ≥1 skill AND ≥1 dataset
 *   SKILL_ONLY    – matched by skills but no dataset backing
 *   DATA_ONLY     – dataset backing but no skill alignment
 *   UNCOVERED     – no skill or dataset match (learning blind spot)
 * UNCOVERED rows pulse red.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 957900;
const Z          = 658;
const REFRESH_MS = 120_000;

const CY   = "#29E7FF";
const GR   = "#00c878";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

function kw(item) {
  return [
    item.name, item.title, item.description,
    item.subject, item.topic, item.category,
    item.type, item.kind, item.tags, item.source,
    item.skill_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function overlap(a, b) {
  const wa = a.split(/\W+/).filter(w => w.length > 3);
  const wb = new Set(b.split(/\W+/).filter(w => w.length > 3));
  return wa.filter(w => wb.has(w)).length;
}

function classifyArticle(article, skills, datasets) {
  const ak = kw(article);
  const matchedSkills   = skills.filter(s  => overlap(ak, kw(s))  >= 2);
  const matchedDatasets = datasets.filter(d => overlap(ak, kw(d)) >= 2);

  const hasSkill   = matchedSkills.length > 0;
  const hasDataset = matchedDatasets.length > 0;
  let cls;
  if (hasSkill && hasDataset)  cls = "FULLY_COVERED";
  else if (hasSkill)           cls = "SKILL_ONLY";
  else if (hasDataset)         cls = "DATA_ONLY";
  else                         cls = "UNCOVERED";

  return {
    id: article.id || article.name || article.title || Math.random().toString(36).slice(2),
    article,
    cls,
    matchedSkills: matchedSkills.slice(0, 5).map(s => ({
      name:  s.name || s.skill_name || s.title || "?",
      score: overlap(ak, kw(s)),
    })),
    matchedDatasets: matchedDatasets.slice(0, 5).map(d => ({
      name:  d.name || d.title || "?",
      rows:  d.row_count || d.rows || "",
      score: overlap(ak, kw(d)),
    })),
  };
}

async function loadAll(base) {
  const [kr, sr, dr] = await Promise.allSettled([
    fetch(`${base}/knowledge/`,      { headers: authHdr() }),
    fetch(`${base}/v1/aip/skill`,    { headers: authHdr() }),
    fetch(`${base}/v1/datasets`,     { headers: authHdr() }),
  ]);
  const [kd, sd, dd] = await Promise.all([
    kr.status === "fulfilled" && kr.value.ok ? kr.value.json() : [],
    sr.status === "fulfilled" && sr.value.ok ? sr.value.json() : [],
    dr.status === "fulfilled" && dr.value.ok ? dr.value.json() : [],
  ]);
  const articles  = Array.isArray(kd) ? kd : kd.data || kd.items || kd.articles || [];
  const skills    = Array.isArray(sd) ? sd : sd.data || sd.items || sd.skills || [];
  const datasets  = Array.isArray(dd) ? dd : dd.data || dd.items || [];
  return { articles, skills, datasets };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────
export function isKsdlcovQuery(q) {
  return /\b(ksdlcov|knowledge\s+coverage|skill\s+knowledge|dataset\s+knowledge|knowledge\s+backing|uncovered\s+knowledge|learning\s+coverage|knowledge\s+skill\s+gap|knowledge\s+learning\s+gap|knowledge\s+skill|knowledge\s+dataset)\b/i.test(q);
}

export async function buildKsdlcovScript() {
  try {
    const base = apiBase();
    const { articles, skills, datasets } = await loadAll(base);
    const rows      = articles.map(a => classifyArticle(a, skills, datasets));
    const uncovered = rows.filter(r => r.cls === "UNCOVERED").length;
    const covered   = rows.filter(r => r.cls === "FULLY_COVERED").length;
    return `Knowledge learning coverage: ${articles.length} articles, ${skills.length} skills, ${datasets.length} datasets. Fully covered (skill + data): ${covered}. Uncovered (no backing): ${uncovered}. ${uncovered > 0 ? `${uncovered} knowledge articles have no skill or dataset alignment — learning blind spots.` : "All knowledge articles are backed by skills or datasets."}`;
  } catch (_) {
    return "Knowledge learning coverage status unavailable.";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function KnowledgeSkillDatasetCoverage() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [aiText, setAiText]       = useState("");
  const timerRef                  = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const { articles, skills, datasets } = await loadAll(base);
      setRows(articles.map(a => classifyArticle(a, skills, datasets)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) { load(); timerRef.current = setInterval(load, REFRESH_MS); }
    else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:ksdlcov-toggle", handler);
    return () => window.removeEventListener("jarvis:ksdlcov-toggle", handler);
  }, []);

  const uncovered  = rows.filter(r => r.cls === "UNCOVERED").length;
  const fully      = rows.filter(r => r.cls === "FULLY_COVERED").length;
  const skillOnly  = rows.filter(r => r.cls === "SKILL_ONLY").length;
  const dataOnly   = rows.filter(r => r.cls === "DATA_ONLY").length;

  const TABS = ["ALL", "FULLY_COVERED", "SKILL_ONLY", "DATA_ONLY", "UNCOVERED"];
  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const name = r.article.name || r.article.title || r.article.subject || "";
      if (!name.toLowerCase().includes(search.toLowerCase())) return false;
    }
    return true;
  });

  async function assess() {
    if (assessing) return;
    setAssessing(true); setAiText("");
    try {
      const base   = apiBase();
      const script = await buildKsdlcovScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Knowledge learning coverage analysis:\n${script}\n\nUncovered articles (sample):\n${rows.filter(r => r.cls === "UNCOVERED").slice(0, 6).map(r => `- ${r.article.name || r.article.title || r.article.subject || "?"}`).join("\n")}\n\nProvide a concise 3-sentence recommendation on closing the knowledge coverage gaps.`,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const reply = (d.answer || d.response || d.message || script).slice(0, 600);
        setAiText(reply);
        const voice = (typeof getActiveVoice === "function" ? getActiveVoice() : null) || "ash";
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { ...authHdr(), "Content-Type": "application/json" },
          body: JSON.stringify({ text: script, voice }),
        });
      }
    } catch (_) {}
    setAssessing(false);
  }

  const CLS_COL = {
    FULLY_COVERED: GR,
    SKILL_ONLY:    CY,
    DATA_ONLY:     AM,
    UNCOVERED:     RD,
  };

  const btnPulse = uncovered > 0;

  return (
    <>
      {/* Fixed toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z,
          background: open ? `rgba(41,231,255,0.18)` : `rgba(5,12,20,0.82)`,
          border: `1px solid ${open ? CY : DIM}`,
          borderRadius: 6,
          color: open ? CY : DIM,
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.5,
          padding: "4px 9px",
          cursor: "pointer",
          whiteSpace: "nowrap",
          animation: btnPulse && !open ? "ksdlcov-pulse 2.4s ease-in-out infinite" : "none",
        }}
        title="Knowledge × Skill × Dataset Learning Coverage"
      >
        ◈ KSDLCOV
      </button>

      <style>{`
        @keyframes ksdlcov-pulse {
          0%,100% { border-color: ${DIM}; box-shadow: none; }
          50%      { border-color: ${RD}; box-shadow: 0 0 8px ${RD}66; }
        }
      `}</style>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: Z + 100,
            background: "rgba(0,4,8,0.82)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: SANS,
          }}
          onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div style={{
            width: "min(960px,96vw)", maxHeight: "88vh",
            background: "rgba(5,12,20,0.97)", border: `1px solid ${CY}44`,
            borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: `0 0 40px ${CY}18`,
          }}>
            {/* Header */}
            <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${CY}22`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: MONO, color: CY, fontSize: 13, letterSpacing: 2 }}>
                ◈ KNOWLEDGE × SKILL × DATASET LEARNING COVERAGE (KSDLCOV)
              </div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 8, padding: "10px 18px", borderBottom: `1px solid ${CY}12` }}>
              {[
                { label: "ARTICLES",      val: rows.length, col: CY },
                { label: "FULLY COVERED", val: fully,       col: GR },
                { label: "SKILL ONLY",    val: skillOnly,   col: CY },
                { label: "DATA ONLY",     val: dataOnly,    col: AM },
                { label: "UNCOVERED",     val: uncovered,   col: RD },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ color: s.col, fontFamily: MONO, fontSize: 18, fontWeight: 700 }}>{loading ? "…" : s.val}</div>
                  <div style={{ color: "#555", fontSize: 9, letterSpacing: 1.2, fontFamily: MONO, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Controls */}
            <div style={{ padding: "8px 18px", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : "#333"}`,
                  color: tab === t ? CY : "#666",
                  fontFamily: MONO, fontSize: 9, padding: "3px 8px",
                  borderRadius: 4, cursor: "pointer", letterSpacing: 0.8,
                }}>{t.replace(/_/g, " ")}</button>
              ))}
              <input
                placeholder="search articles…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  flex: 1, minWidth: 120, background: "rgba(255,255,255,0.05)",
                  border: "1px solid #333", color: "#ccc",
                  fontFamily: MONO, fontSize: 10, padding: "4px 8px",
                  borderRadius: 4, outline: "none",
                }}
              />
              <button onClick={load} style={{ background: "transparent", border: `1px solid #333`, color: "#555", fontFamily: MONO, fontSize: 9, padding: "3px 8px", borderRadius: 4, cursor: "pointer" }}>↺</button>
              <button
                onClick={assess}
                disabled={assessing || !rows.length}
                style={{
                  background: assessing ? `rgba(41,231,255,0.1)` : `rgba(41,231,255,0.15)`,
                  border: `1px solid ${CY}`, color: CY,
                  fontFamily: MONO, fontSize: 9, padding: "3px 8px",
                  borderRadius: 4, cursor: "pointer", letterSpacing: 1,
                  opacity: assessing ? 0.6 : 1,
                }}
              >{assessing ? "…" : "▶ ASSESS"}</button>
            </div>

            {/* Row list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 14px" }}>
              {error && <div style={{ color: RD, fontFamily: MONO, fontSize: 10, padding: "8px 0" }}>ERROR: {error}</div>}
              {!loading && !error && visible.length === 0 && (
                <div style={{ color: GR, fontFamily: MONO, fontSize: 11, padding: "16px 0", textAlign: "center" }}>
                  ✓ No articles match this filter.
                </div>
              )}
              {visible.map(row => {
                const name  = row.article.name || row.article.title || row.article.subject || "Unnamed Article";
                const sub   = row.article.category || row.article.type || row.article.kind || "";
                const col   = CLS_COL[row.cls] || CY;
                const isExp = expanded === row.id;
                const pulse = row.cls === "UNCOVERED";
                return (
                  <div
                    key={row.id}
                    style={{
                      borderBottom: `1px solid rgba(255,255,255,0.06)`,
                      padding: "7px 0",
                      animation: pulse ? "ksdlcov-pulse 2.4s ease-in-out infinite" : "none",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                      onClick={() => setExpanded(isExp ? null : row.id)}
                    >
                      <div style={{ flexShrink: 0, width: 130, fontFamily: MONO, fontSize: 9, color: col, letterSpacing: 0.8 }}>
                        {row.cls.replace(/_/g, " ")}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "#e0e0e0", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {name}
                        </div>
                        {sub && (
                          <div style={{ color: "#555", fontSize: 10, fontFamily: MONO, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {sub}
                          </div>
                        )}
                      </div>
                      <div style={{ color: "#444", fontSize: 10 }}>{isExp ? "▲" : "▼"}</div>
                    </div>

                    {isExp && (
                      <div style={{ paddingLeft: 138, paddingTop: 6 }}>
                        {row.matchedSkills.length > 0 && (
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ color: "#555", fontFamily: MONO, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>SKILLS</div>
                            {row.matchedSkills.map((s, i) => (
                              <div key={i} style={{ marginBottom: 4 }}>
                                <div style={{ color: CY, fontSize: 10, minWidth: 140, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 2 }}>{s.name}</div>
                                <div style={{ height: 3, borderRadius: 2, background: "#1a2a3a", width: "60%" }}>
                                  <div style={{ height: 3, borderRadius: 2, background: CY, width: `${Math.min(100, s.score * 20)}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {row.matchedDatasets.length > 0 && (
                          <div>
                            <div style={{ color: "#555", fontFamily: MONO, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>DATASETS</div>
                            {row.matchedDatasets.map((d, i) => (
                              <div key={i} style={{ marginBottom: 4 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                  <div style={{ color: AM, fontSize: 10, minWidth: 140, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
                                  {d.rows && <div style={{ color: "#555", fontSize: 9, fontFamily: MONO }}>{d.rows} rows</div>}
                                </div>
                                <div style={{ height: 3, borderRadius: 2, background: "#1a2a3a", width: "60%" }}>
                                  <div style={{ height: 3, borderRadius: 2, background: AM, width: `${Math.min(100, d.score * 20)}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {row.matchedSkills.length === 0 && row.matchedDatasets.length === 0 && (
                          <div style={{ color: RD, fontFamily: MONO, fontSize: 9 }}>⚠ No skill or dataset match — learning blind spot</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* AI text */}
            {aiText && (
              <div style={{ borderTop: `1px solid ${CY}22`, padding: "10px 18px", background: `${CY}08` }}>
                <div style={{ color: "#888", fontFamily: MONO, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>JARVIS ASSESSMENT</div>
                <div style={{ color: "#ccc", fontSize: 11, lineHeight: 1.6 }}>{aiText}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
