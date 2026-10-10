/**
 * SkillKnowledgeReportMatrix — F44 (overnight 2026-09-13)
 * Sources: /v1/aip/skill + /knowledge/ + /v1/reports
 * Keyword-correlates each skill against matching knowledge articles AND reports:
 *   FULLY_DOCUMENTED (skill has both KB article + report)
 *   KB_ONLY          (skill has KB article but no report)
 *   REPORT_ONLY      (skill has report but no KB article)
 *   UNDOCUMENTED     (no KB or report match)
 * Stat tiles: skills / kb articles / reports / undocumented count.
 * Filter tabs: ALL / FULLY_DOCUMENTED / KB_ONLY / REPORT_ONLY / UNDOCUMENTED.
 * Text search on skill name.
 * Expand row → matched KB titles + matched report names with relevance bars.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence documentation-coverage brief + TTS.
 * ◈ SKRM button (left:931240 bottom:8 zIndex:627).
 * Voice triggers: "skill knowledge" / "skill docs" / "skrm" / "undocumented skills" /
 *                 "skill documentation" / "skill report coverage" / "skill coverage matrix".
 * Toggle: jarvis:skrm-toggle event.
 * 120-s auto-refresh.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA040";
const RED = "#FF4D6D";
const PRP = "#A855F7";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SKRM_RE =
  /\bskill.knowled|skill.doc|skrm\b|undocumented.skill|skill.report.cover|skill.cover|skill.documentation|skill.report.matrix|skill.knowledge.report\b/i;

// ── fetch helpers ─────────────────────────────────────────────────────────────

async function fetchSkills() {
  const r = await fetch(`${apiBase()}/v1/aip/skill`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.skills) ? d.skills
    : Array.isArray(d?.data)   ? d.data
    : [];
}

async function fetchKnowledge() {
  const r = await fetch(`${apiBase()}/knowledge/`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.articles) ? d.articles
    : Array.isArray(d?.items)    ? d.items
    : Array.isArray(d?.data)     ? d.data
    : Array.isArray(d?.results)  ? d.results
    : [];
}

async function fetchReports() {
  const r = await fetch(`${apiBase()}/v1/reports`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.reports) ? d.reports
    : Array.isArray(d?.data)    ? d.data
    : Array.isArray(d?.results) ? d.results
    : [];
}

// ── keyword-matching ──────────────────────────────────────────────────────────

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function overlap(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setB = new Set(tokensB);
  const hits = tokensA.filter((t) => setB.has(t)).length;
  return hits / Math.max(tokensA.length, tokensB.length);
}

function buildMatrix(skills, kbArticles, reports) {
  const kbItems = kbArticles.map((a) => ({
    title: a.title ?? a.name ?? a.id ?? "",
    tokens: tokenize(
      [a.title, a.name, a.content, a.description, a.tags].filter(Boolean).join(" ")
    ),
  }));
  const reportItems = reports.map((r) => ({
    title: r.title ?? r.name ?? r.report_name ?? r.id ?? "",
    tokens: tokenize(
      [r.title, r.name, r.summary, r.description, r.category].filter(Boolean).join(" ")
    ),
  }));

  return skills.map((sk) => {
    const name = sk.name ?? sk.skill_name ?? sk.id ?? "";
    const stoks = tokenize(
      [sk.name, sk.description, sk.tags, sk.category].filter(Boolean).join(" ")
    );

    const matchedKb = kbItems
      .map((kb) => ({ ...kb, score: overlap(stoks, kb.tokens) }))
      .filter((m) => m.score >= 0.08)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const matchedRep = reportItems
      .map((rp) => ({ ...rp, score: overlap(stoks, rp.tokens) }))
      .filter((m) => m.score >= 0.08)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const hasKb  = matchedKb.length > 0;
    const hasRep = matchedRep.length > 0;
    const status =
      hasKb && hasRep ? "FULLY_DOCUMENTED"
      : hasKb          ? "KB_ONLY"
      : hasRep         ? "REPORT_ONLY"
      :                  "UNDOCUMENTED";

    return { name, status, matchedKb, matchedRep, score: sk.score ?? sk.skill_score ?? null };
  });
}

// ── exported intents ──────────────────────────────────────────────────────────

export function isSkrmQuery(text) {
  return SKRM_RE.test(text || "");
}

export async function buildSkrmScript() {
  let skills = [], kb = [], reports = [];
  try {
    [skills, kb, reports] = await Promise.all([fetchSkills(), fetchKnowledge(), fetchReports()]);
  } catch (_) {}
  const matrix = buildMatrix(skills, kb, reports);
  const undoc  = matrix.filter((s) => s.status === "UNDOCUMENTED").length;
  const full   = matrix.filter((s) => s.status === "FULLY_DOCUMENTED").length;
  return (
    `Skill documentation matrix: ${matrix.length} skills assessed against ${kb.length} knowledge articles and ${reports.length} reports. ` +
    `${full} skills are fully documented; ${undoc} skills have no matching knowledge article or report and require documentation.`
  );
}

// ── status config ─────────────────────────────────────────────────────────────

const STATUS_CFG = {
  FULLY_DOCUMENTED: { label: "FULLY DOCUMENTED", color: GRN  },
  KB_ONLY:          { label: "KB ONLY",           color: CY   },
  REPORT_ONLY:      { label: "REPORT ONLY",        color: PRP  },
  UNDOCUMENTED:     { label: "UNDOCUMENTED",       color: RED  },
};

const TABS = ["ALL", "FULLY_DOCUMENTED", "KB_ONLY", "REPORT_ONLY", "UNDOCUMENTED"];

// ── component ─────────────────────────────────────────────────────────────────

export default function SkillKnowledgeReportMatrix() {
  const [visible,  setVisible]  = useState(false);
  const [matrix,   setMatrix]   = useState([]);
  const [nKb,      setNKb]      = useState(0);
  const [nRep,     setNRep]     = useState(0);
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [skills, kb, reports] = await Promise.all([
        fetchSkills(), fetchKnowledge(), fetchReports(),
      ]);
      setNKb(kb.length);
      setNRep(reports.length);
      setMatrix(buildMatrix(skills, kb, reports));
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const h = (e) => {
      setVisible((v) => !v);
      if (!matrix.length) load();
    };
    window.addEventListener("jarvis:skrm-toggle", h);
    return () => window.removeEventListener("jarvis:skrm-toggle", h);
  }, [load, matrix.length]);

  useEffect(() => {
    if (!visible) return;
    load();
    const iv = setInterval(load, 120_000);
    return () => clearInterval(iv);
  }, [visible, load]);

  const undocCount = matrix.filter((s) => s.status === "UNDOCUMENTED").length;
  const fullCount  = matrix.filter((s) => s.status === "FULLY_DOCUMENTED").length;

  const filtered = matrix.filter((s) => {
    if (tab !== "ALL" && s.status !== tab) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function assess() {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildSkrmScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d?.response ?? d?.message ?? d?.text ?? script;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {}
    setAssessing(false);
  }

  if (!visible) {
    return (
      <button
        onClick={() => { setVisible(true); if (!matrix.length) load(); }}
        title="Skill × Knowledge × Report Coverage Matrix"
        style={{
          position: "fixed", left: 931240, bottom: 8, zIndex: 627,
          background: "rgba(0,0,0,0.7)", border: `1px solid ${CY}44`,
          color: CY, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 8, padding: "3px 6px", cursor: "pointer",
          borderRadius: 2, letterSpacing: 1,
        }}
      >
        ◈ SKRM
        {undocCount > 0 && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: "50%", padding: "0 4px", fontSize: 7,
          }}>{undocCount}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 20, zIndex: 2800,
      width: 420, maxHeight: "80vh",
      background: "rgba(0,8,16,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 6, overflow: "hidden",
      fontFamily: "'JetBrains Mono',monospace",
      display: "flex", flexDirection: "column",
    }}>
      {/* header */}
      <div style={{
        padding: "10px 14px 8px", borderBottom: `1px solid ${CY}22`,
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
      }}>
        <span style={{ color: CY, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>
          ◈ SKILL × KNOWLEDGE × REPORT MATRIX
        </span>
        <button onClick={assess} disabled={assessing} style={{
          marginLeft: "auto", background: "none", border: `1px solid ${CY}66`,
          color: CY, fontSize: 8, padding: "2px 8px", cursor: "pointer",
          borderRadius: 2, letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setVisible(false)} style={{
          background: "none", border: "none", color: "#4A6070",
          fontSize: 12, cursor: "pointer", lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)",
        gap: 1, padding: "8px 10px", flexShrink: 0,
      }}>
        {[
          { label: "SKILLS",       val: matrix.length, color: CY  },
          { label: "KB ARTICLES",  val: nKb,           color: GRN },
          { label: "REPORTS",      val: nRep,           color: PRP },
          { label: "UNDOCUMENTED", val: undocCount,     color: RED },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            background: "rgba(0,20,32,0.8)", borderRadius: 3, padding: "6px 4px",
            textAlign: "center",
          }}>
            <div style={{ color, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#3A5060", fontSize: 7, letterSpacing: 1, marginTop: 2 }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{
        display: "flex", gap: 4, padding: "0 10px 6px", flexShrink: 0, flexWrap: "wrap",
      }}>
        {TABS.map((t) => {
          const cfg  = t === "ALL" ? null : STATUS_CFG[t];
          const cnt  = t === "ALL" ? matrix.length : matrix.filter((s) => s.status === t).length;
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? (cfg?.color ?? CY) + "22" : "rgba(0,16,24,0.5)",
              border: `1px solid ${tab === t ? (cfg?.color ?? CY) : "#1A3040"}`,
              color: tab === t ? (cfg?.color ?? CY) : "#3A5060",
              fontSize: 7, padding: "2px 6px", cursor: "pointer",
              borderRadius: 2, letterSpacing: 1,
            }}>
              {t === "ALL" ? "ALL" : STATUS_CFG[t].label} ({cnt})
            </button>
          );
        })}
      </div>

      {/* search */}
      <div style={{ padding: "0 10px 6px", flexShrink: 0 }}>
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skill…"
          style={{
            width: "100%", background: "rgba(0,20,32,0.7)", border: `1px solid ${CY}33`,
            color: CY, fontFamily: "inherit", fontSize: 9, padding: "4px 8px",
            borderRadius: 3, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 10px 10px" }}>
        {loading && !matrix.length ? (
          <div style={{ color: CY + "88", fontSize: 9, padding: 10 }}>◌ LOADING…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "#3A5060", fontSize: 9, padding: 10 }}>NO SKILLS MATCH</div>
        ) : (
          filtered.map((sk, i) => {
            const cfg = STATUS_CFG[sk.status];
            const open = expanded === i;
            return (
              <div key={i} style={{
                marginBottom: 4, background: "rgba(0,16,24,0.7)",
                border: `1px solid ${cfg.color}33`, borderRadius: 3, overflow: "hidden",
              }}>
                <div
                  onClick={() => setExpanded(open ? null : i)}
                  style={{
                    padding: "6px 10px", display: "flex", alignItems: "center",
                    gap: 8, cursor: "pointer",
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: cfg.color, flexShrink: 0,
                    ...(sk.status === "UNDOCUMENTED" && {
                      animation: "skrmpulse 1.4s ease-in-out infinite",
                    }),
                  }} />
                  <span style={{ color: "#C0D8E8", fontSize: 9, flex: 1 }}>{sk.name}</span>
                  {sk.score != null && (
                    <span style={{ color: cfg.color, fontSize: 8 }}>
                      {Math.round(sk.score * 100) / 100}
                    </span>
                  )}
                  <span style={{
                    color: cfg.color, fontSize: 7, background: cfg.color + "18",
                    padding: "1px 5px", borderRadius: 2, letterSpacing: 1,
                  }}>
                    {cfg.label}
                  </span>
                  <span style={{ color: "#3A5060", fontSize: 8 }}>{open ? "▲" : "▼"}</span>
                </div>

                {open && (
                  <div style={{ padding: "0 10px 8px", borderTop: `1px solid ${cfg.color}22` }}>
                    {/* KB matches */}
                    <div style={{ color: GRN, fontSize: 7, letterSpacing: 1, marginTop: 6, marginBottom: 3 }}>
                      KB ARTICLES ({sk.matchedKb.length})
                    </div>
                    {sk.matchedKb.length === 0 ? (
                      <div style={{ color: "#3A5060", fontSize: 8 }}>— no match</div>
                    ) : sk.matchedKb.map((m, j) => (
                      <div key={j} style={{ marginBottom: 4 }}>
                        <div style={{ color: "#A0C8D8", fontSize: 8, marginBottom: 2 }}>
                          {m.title || "(untitled)"}
                        </div>
                        <div style={{
                          height: 3, background: "#0A1E28", borderRadius: 2, overflow: "hidden",
                        }}>
                          <div style={{
                            width: `${Math.round(m.score * 100)}%`,
                            height: "100%", background: GRN, borderRadius: 2,
                          }} />
                        </div>
                      </div>
                    ))}

                    {/* Report matches */}
                    <div style={{ color: PRP, fontSize: 7, letterSpacing: 1, marginTop: 8, marginBottom: 3 }}>
                      REPORTS ({sk.matchedRep.length})
                    </div>
                    {sk.matchedRep.length === 0 ? (
                      <div style={{ color: "#3A5060", fontSize: 8 }}>— no match</div>
                    ) : sk.matchedRep.map((m, j) => (
                      <div key={j} style={{ marginBottom: 4 }}>
                        <div style={{ color: "#A0C8D8", fontSize: 8, marginBottom: 2 }}>
                          {m.title || "(untitled)"}
                        </div>
                        <div style={{
                          height: 3, background: "#0A1E28", borderRadius: 2, overflow: "hidden",
                        }}>
                          <div style={{
                            width: `${Math.round(m.score * 100)}%`,
                            height: "100%", background: PRP, borderRadius: 2,
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* footer */}
      <div style={{
        padding: "6px 14px", borderTop: `1px solid ${CY}22`,
        display: "flex", gap: 10, fontSize: 8, color: "#3A5060", flexShrink: 0,
      }}>
        <span>{filtered.length} OF {matrix.length} SKILLS</span>
        <span style={{ marginLeft: "auto", color: fullCount > 0 ? GRN + "AA" : "#3A5060" }}>
          {fullCount} FULLY DOCUMENTED
        </span>
      </div>

      <style>{`
        @keyframes skrmpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.5); opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
