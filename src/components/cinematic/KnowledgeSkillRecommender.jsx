/**
 * KnowledgeSkillRecommender — F71.
 *
 * Parallel-fetches /v1/aip/skill + /knowledge/.
 * Identifies skill gaps (score < 70) and keyword-correlates each gap's
 * name/description against knowledge article titles/content to surface
 * targeted learning resources per gap.
 *
 * Stat tiles: skills / gaps / articles / gaps with matched articles
 * Filter tabs: ALL / GAPS / MATCHED
 * Skill-gap rows expand to show matched article list.
 * Click ▶ LEARN on any gap → /v1/jarvis/agent/chat AI 2-sentence
 *   learning recommendation + TTS via jarvis:speak-dossier.
 * 5-min auto-refresh.
 *
 * Intent: "knowledge skill" / "learning recommendation" / "article recommend"
 *         / "ksrec" / "knowledge gap" / "learn skill"
 *   → jarvis:ksrec-toggle + TTS brief via buildKsrecScript()
 *
 * Toggle: ◈ KSREC at left:6108, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED = "#FF3D5A";
const BTN_LEFT = 6108;
const REFRESH_MS = 5 * 60 * 1000;
const GAP_THRESHOLD = 70;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseSkills(raw) {
  return normaliseArray(raw).map((s) => ({
    id: s.id || s.skill_id || s.name || String(Math.random()),
    name: s.name || s.title || s.skill || s.label || "Unnamed skill",
    score: typeof s.score === "number" ? s.score
      : typeof s.proficiency === "number" ? s.proficiency
      : typeof s.level === "number" ? s.level * 10
      : 0,
    description: s.description || s.desc || s.summary || "",
    category: s.category || s.domain || s.type || "",
  }));
}

function normaliseArticles(raw) {
  return normaliseArray(raw).map((a) => ({
    id: a.id || a.article_id || String(Math.random()),
    title: a.title || a.name || a.label || "Untitled article",
    summary: a.summary || a.content || a.description || a.excerpt || "",
    category: a.category || a.domain || a.type || "",
    tags: [...(a.tags || []), ...(a.keywords || [])].map(String),
    date: a.date || a.created_at || a.updated_at || "",
  }));
}

function keywords(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(skill, article) {
  const skillWords = [
    ...keywords(skill.name),
    ...keywords(skill.description),
    ...keywords(skill.category),
  ];
  const articleText = `${article.title} ${article.summary} ${article.category} ${article.tags.join(" ")}`.toLowerCase();
  return skillWords.reduce((acc, w) => acc + (articleText.includes(w) ? 1 : 0), 0);
}

function correlate(skills, articles) {
  return skills.map((skill) => {
    const matched = articles
      .map((a) => ({ ...a, _score: matchScore(skill, a) }))
      .filter((a) => a._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...skill, matched };
  });
}

// ─── exported intent helpers (consumed by JarvisBrain) ──────────────────────

const KSREC_RE =
  /knowledge.{0,15}skill|skill.{0,15}(article|knowledge|learn)|learning\s+rec|article\s+rec|ksrec\b|knowledge\s+gap|learn\s+skill/i;

export function isKsrecQuery(q) {
  return KSREC_RE.test(q || "");
}

export async function buildKsrecScript() {
  try {
    const [skillRaw, artRaw] = await Promise.all([
      fetch(`${apiBase()}/v1/aip/skill`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/knowledge/`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const skills = normaliseSkills(skillRaw);
    const articles = normaliseArticles(artRaw);
    const gaps = skills.filter((s) => s.score < GAP_THRESHOLD);
    const withMatches = correlate(gaps, articles).filter((s) => s.matched.length > 0);
    return `Knowledge-skill recommender active, sir. ${skills.length} skill${skills.length !== 1 ? "s" : ""} assessed, ${gaps.length} gap${gaps.length !== 1 ? "s" : ""} identified. ${articles.length} knowledge article${articles.length !== 1 ? "s" : ""} cross-referenced. ${withMatches.length} gap${withMatches.length !== 1 ? "s" : ""} have targeted reading material surfaced. Select a skill gap to review recommended articles.`;
  } catch (_) {
    return "Knowledge-skill recommender is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function KnowledgeSkillRecommender() {
  const [visible, setVisible] = useState(false);
  const [skills, setSkills] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("GAPS");
  const [expanded, setExpanded] = useState(null);
  const [learning, setLearning] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [skillRaw, artRaw] = await Promise.all([
        fetch(`${apiBase()}/v1/aip/skill`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/knowledge/`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setSkills(normaliseSkills(skillRaw));
      setArticles(normaliseArticles(artRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:ksrec-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ksrec-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function learnSkill(skill) {
    setLearning(skill.id);
    const articleTitles = skill.matched.map((a) => `"${a.title}"`).join(", ");
    const prompt = `As JARVIS, provide a 2-sentence targeted learning recommendation for improving the skill "${skill.name}" (current score: ${Math.round(skill.score)}/100). These knowledge articles are available: ${articleTitles}. Which should the operator prioritise, and why?`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Focus on the top-matched article first, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: "Recommendation unavailable at this time, sir." } }));
    }
    setLearning(null);
  }

  // Correlate and filter
  const correlated = correlate(
    skills.filter((s) => s.score < GAP_THRESHOLD),
    articles
  );

  const allSkillsWithMatches = correlate(skills, articles);

  const displayed =
    tab === "ALL"
      ? allSkillsWithMatches
      : tab === "GAPS"
      ? correlated
      : correlated.filter((s) => s.matched.length > 0);

  const gaps = skills.filter((s) => s.score < GAP_THRESHOLD);
  const matchedGaps = correlated.filter((s) => s.matched.length > 0);

  const scoreBadge = (score) => {
    if (score >= 80) return { color: GREEN, label: "PROFICIENT" };
    if (score >= 60) return { color: AMBER, label: "DEVELOPING" };
    return { color: RED, label: "GAP" };
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Knowledge-Skill Recommender (F71)"
        style={{
          position: "fixed", bottom: 6, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${AMBER}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? AMBER : CY}44`,
          color: visible ? AMBER : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ KSREC
        {matchedGaps.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{matchedGaps.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: BTN_LEFT - 280, zIndex: 65,
          width: 520, maxHeight: "70vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${AMBER}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${AMBER}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2 }}>◈ KNOWLEDGE-SKILL RECOMMENDER</span>
            <button
              onClick={fetchData}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${CY}33`, borderRadius: 3,
                color: `${CY}88`, padding: "2px 6px", fontSize: 7,
                cursor: "pointer", letterSpacing: 1,
              }}
            >↻ REFRESH</button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent", border: "none",
                color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
              }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["SKILLS", skills.length, CY],
              ["GAPS", gaps.length, RED],
              ["ARTICLES", articles.length, CY],
              ["MATCHED", matchedGaps.length, AMBER],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : val}</div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {["ALL", "GAPS", "MATCHED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${AMBER}22` : "transparent",
                  border: `1px solid ${tab === t ? AMBER : "#1e3040"}`,
                  color: tab === t ? AMBER : "#445566",
                  borderRadius: 4, padding: "3px 10px",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                  letterSpacing: 1, cursor: "pointer",
                }}
              >{t}</button>
            ))}
          </div>

          {/* Skill gap rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              loading skill-article correlations…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "MATCHED" ? "No gaps with matching articles found." : "No skill gaps detected."}
            </div>
          ) : (
            displayed.map((skill) => {
              const { color: sc, label: sl } = scoreBadge(skill.score);
              const isOpen = expanded === skill.id;
              const hasMatches = skill.matched.length > 0;
              return (
                <div key={skill.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${AMBER}44` : "#1a2530"}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isOpen ? null : skill.id)}>
                  {/* Skill header row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 7, color: sc, border: `1px solid ${sc}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1, whiteSpace: "nowrap",
                    }}>{sl}</span>
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{skill.name}</span>
                    {skill.category && (
                      <span style={{ fontSize: 7, color: "#334455" }}>{skill.category}</span>
                    )}
                    <span style={{ color: sc, fontSize: 10, fontWeight: "bold", minWidth: 28, textAlign: "right" }}>
                      {Math.round(skill.score)}
                    </span>
                  </div>

                  {/* Score bar */}
                  <div style={{
                    height: 2, background: "#0d1a25", borderRadius: 1, marginBottom: 6,
                    overflow: "hidden",
                  }}>
                    <div style={{
                      width: `${Math.min(skill.score, 100)}%`, height: "100%",
                      background: sc, transition: "width 0.4s",
                    }} />
                  </div>

                  {/* Article count badge + learn button */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 8, color: hasMatches ? AMBER : "#334455" }}>
                      {hasMatches ? `${skill.matched.length} article${skill.matched.length !== 1 ? "s" : ""} matched` : "no articles matched"}
                    </span>
                    {hasMatches && (
                      <button
                        onClick={(e) => { e.stopPropagation(); learnSkill(skill); }}
                        disabled={learning === skill.id}
                        style={{
                          marginLeft: "auto",
                          background: learning === skill.id ? "#1a2530" : `${AMBER}18`,
                          color: learning === skill.id ? "#445566" : AMBER,
                          border: `1px solid ${AMBER}44`,
                          borderRadius: 3, padding: "2px 8px",
                          fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                          letterSpacing: 1, cursor: learning === skill.id ? "default" : "pointer",
                        }}
                      >{learning === skill.id ? "…advising" : "▶ LEARN"}</button>
                    )}
                  </div>

                  {/* Expanded article list */}
                  {isOpen && hasMatches && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${AMBER}18` }}>
                      {skill.matched.map((art) => (
                        <div key={art.id} style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid #1e3040",
                          borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                        }}>
                          <div style={{ color: "#a0b8cc", fontSize: 10, marginBottom: 2 }}>
                            {art.title}
                          </div>
                          {art.summary && (
                            <div style={{ color: "#445566", fontSize: 8, lineHeight: 1.4 }}>
                              {art.summary.slice(0, 140)}{art.summary.length > 140 ? "…" : ""}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                            {art.category && (
                              <span style={{
                                fontSize: 7, color: "#A78BFA",
                                border: "1px solid #A78BFA33", borderRadius: 2, padding: "1px 5px",
                              }}>{art.category}</span>
                            )}
                            {art.date && (
                              <span style={{ fontSize: 7, color: "#334455" }}>
                                {String(art.date).slice(0, 10)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && !hasMatches && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${AMBER}18`, color: "#334455", fontSize: 8 }}>
                      No knowledge articles matched this skill gap.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /v1/aip/skill + /knowledge/ · 5-min auto-refresh · click ▶ LEARN for AI reading recommendation
          </div>
        </div>
      )}
    </>
  );
}
