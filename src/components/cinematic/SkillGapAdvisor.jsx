/**
 * SkillGapAdvisor — F46
 * Fetches /v1/aip/skill, identifies the lowest-scoring skills, then sends each
 * to /v1/jarvis/agent/chat to generate targeted training recommendations.
 * Distinct from SkillScorecard (F15) which only displays scores; this produces
 * AI-generated actionable development plans for the weakest areas.
 * "JARVIS, skill gap" | "training plan" | "how do I improve" | "learning plan" → panel + TTS.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const RED  = "#FF4D6D";
const AMB  = "#FFD700";
const GRN  = "#00E5A0";
const PRP  = "#B485FF";
const POLL = 5 * 60_000; // 5 min
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const GAP_RE =
  /\b(skill.gap|gap.advisor|training.plan|learning.plan|development.plan|improve.skill|skill.improve|growth.plan|upskill|how.to.improve|weakest.skill|skill.deficit|capability.gap)\b/i;

export function isSkillGapQuery(t) {
  return GAP_RE.test(t || "");
}

/* ── fetchers ───────────────────────────────────────────────────────────────── */
const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function fetchSkills() {
  const r = await fetch(`${apiBase()}/v1/aip/skill`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const arr = Array.isArray(d) ? d
    : Array.isArray(d?.data)   ? d.data
    : Array.isArray(d?.items)  ? d.items
    : Array.isArray(d?.skills) ? d.skills
    : [];
  return arr.map(s => ({
    id:    s.id || s._id || s.skill_id || String(Math.random()),
    name:  s.name || s.skill_name || s.title || "Unnamed skill",
    score: typeof s.score === "number" ? s.score
           : typeof s.current_score === "number" ? s.current_score
           : typeof s.value === "number" ? s.value : 50,
    level: s.level || s.tier || "",
  }));
}

async function fetchRecommendation(skillName, score) {
  try {
    const prompt =
      `You are JARVIS, an AI advisor. In 2 concise sentences, give a specific, actionable training recommendation for improving the skill "${skillName}" which currently scores ${score}/100. Be direct and practical.`;
    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: prompt }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.answer || d.response || d.text || "").trim() || null;
  } catch (_) { return null; }
}

export async function buildSkillGapScript() {
  try {
    const skills = await fetchSkills();
    if (!skills.length) return "Skill data unavailable at this time, sir.";
    const sorted = [...skills].sort((a, b) => a.score - b.score);
    const gaps = sorted.slice(0, 3);
    const names = gaps.map(s => `${s.name} at ${Math.round(s.score)}`).join(", ");
    const avg = Math.round(skills.reduce((s, x) => s + x.score, 0) / skills.length);
    return `Skill gap analysis complete, sir. Overall capability average is ${avg} out of 100. The three weakest areas requiring development are: ${names}. Training recommendations are ready in the gap advisor panel.`;
  } catch (_) {
    return "Unable to retrieve skill gap data at this time, sir.";
  }
}

/* ── score colour ─────────────────────────────────────────────────────────── */
function scoreColor(s) {
  if (s < 40) return RED;
  if (s < 70) return AMB;
  return GRN;
}
function urgencyLabel(s) {
  if (s < 40) return "CRITICAL GAP";
  if (s < 70) return "NEEDS WORK";
  return "DEVELOPING";
}

/* ── main component ──────────────────────────────────────────────────────── */
export default function SkillGapAdvisor() {
  const [open, setOpen]           = useState(false);
  const [skills, setSkills]       = useState([]);
  const [gaps, setGaps]           = useState([]); // bottom 3 enriched with AI recs
  const [loading, setLoading]     = useState(false);
  const [recLoading, setRecLoading] = useState(false);
  const [error, setError]         = useState(null);
  const [badgeCount, setBadgeCount] = useState(0);
  const timerRef                  = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const fetched = await fetchSkills();
      setSkills(fetched);
      const sorted = [...fetched].sort((a, b) => a.score - b.score);
      const critical = sorted.filter(s => s.score < 70).length;
      setBadgeCount(critical);
      const bottom3 = sorted.slice(0, 3);
      // Seed gaps without recs first so panel renders immediately
      setGaps(bottom3.map(s => ({ ...s, rec: null })));
      setLoading(false);
      // Fetch AI recommendations sequentially to avoid hammering the endpoint
      setRecLoading(true);
      const enriched = [];
      for (const s of bottom3) {
        const rec = await fetchRecommendation(s.name, Math.round(s.score));
        enriched.push({ ...s, rec });
      }
      setGaps(enriched);
      setRecLoading(false);
    } catch (e) {
      setError("Failed to load skill data.");
      setLoading(false);
      setRecLoading(false);
    }
  }, []);

  // initial load + interval
  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [load]);

  // toggle via event
  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:skillgap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:skillgap-toggle", onToggle);
  }, []);

  const avg = skills.length
    ? Math.round(skills.reduce((s, x) => s + x.score, 0) / skills.length)
    : 0;

  /* ── render ─────────────────────────────────────────────────────────────── */
  return (
    <>
      {/* bottom-strip toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Skill Gap Advisor (F46)"
        style={{
          position: "fixed", bottom: 8, left: 3508, zIndex: 60,
          background: open ? PRP : "rgba(5,8,13,0.75)",
          border: `1px solid ${PRP}88`, borderRadius: 6, padding: "3px 8px",
          color: open ? "#04060A" : PRP, fontSize: 10, letterSpacing: 1,
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          boxShadow: open ? `0 0 14px ${PRP}` : "none", whiteSpace: "nowrap",
        }}>
        ◈ GAPS{badgeCount > 0 && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: 8, padding: "1px 5px", fontSize: 9,
          }}>{badgeCount}</span>
        )}
      </button>

      {/* main panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: 3408, zIndex: 65,
          width: 480, maxHeight: "72vh", overflow: "hidden",
          background: "rgba(8,12,22,0.93)", border: `1px solid ${PRP}55`,
          borderRadius: 14, display: "flex", flexDirection: "column",
          backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${PRP}22`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* header */}
          <div style={{
            padding: "12px 16px 10px", borderBottom: `1px solid ${PRP}33`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <span style={{ color: PRP, fontWeight: 700, letterSpacing: 2, fontSize: 12,
                textShadow: `0 0 12px ${PRP}` }}>◈ SKILL GAP ADVISOR</span>
              <span style={{ marginLeft: 10, color: "#6E8AA0", fontSize: 10 }}>
                overall avg: <b style={{ color: CY }}>{avg}</b>/100
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {(loading || recLoading) && (
                <span style={{ color: AMB, fontSize: 10, animation: "jpulse 1s infinite" }}>
                  {loading ? "fetching…" : "generating plans…"}
                </span>
              )}
              <button onClick={load} style={{
                background: "none", border: `1px solid ${PRP}55`, borderRadius: 4,
                color: PRP, fontSize: 10, cursor: "pointer", padding: "2px 6px",
              }}>↺</button>
              <button onClick={() => setOpen(false)} style={{
                background: "none", border: "none", color: "#6E8AA0",
                fontSize: 14, cursor: "pointer", lineHeight: 1,
              }}>✕</button>
            </div>
          </div>

          {/* subheader */}
          <div style={{
            padding: "6px 16px", borderBottom: `1px solid ${PRP}22`,
            color: "#6E8AA0", fontSize: 10, letterSpacing: 1,
          }}>
            BOTTOM 3 SKILLS — AI-GENERATED DEVELOPMENT PLANS
          </div>

          {/* body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "10px 14px 14px" }}>
            {error && (
              <div style={{ color: RED, fontSize: 11, padding: 10 }}>{error}</div>
            )}

            {!loading && !error && gaps.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 11, padding: 10 }}>
                No skill data available.
              </div>
            )}

            {gaps.map((g, i) => {
              const col = scoreColor(g.score);
              return (
                <div key={g.id} style={{
                  marginBottom: 16,
                  background: `${col}0A`,
                  border: `1px solid ${col}44`,
                  borderRadius: 10, padding: "12px 14px",
                }}>
                  {/* skill header row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{
                      fontSize: 10, color: col, border: `1px solid ${col}55`,
                      borderRadius: 4, padding: "1px 6px", letterSpacing: 1,
                    }}>{urgencyLabel(g.score)}</span>
                    <span style={{ color: "#DCEBF5", fontSize: 12, fontWeight: 600, flex: 1 }}>
                      #{i + 1} {g.name}
                    </span>
                    <span style={{ color: col, fontSize: 13, fontWeight: 700 }}>
                      {Math.round(g.score)}<span style={{ color: "#6E8AA0", fontSize: 10 }}>/100</span>
                    </span>
                  </div>

                  {/* score bar */}
                  <div style={{
                    height: 4, background: "#1A2530", borderRadius: 2, marginBottom: 10,
                  }}>
                    <div style={{
                      height: 4, borderRadius: 2,
                      width: `${Math.min(100, Math.max(0, g.score))}%`,
                      background: col, boxShadow: `0 0 8px ${col}`,
                      transition: "width 0.6s ease",
                    }} />
                  </div>

                  {/* AI recommendation */}
                  <div style={{ fontSize: 11, color: "#B0C4D4", lineHeight: 1.55 }}>
                    {g.rec == null
                      ? <span style={{ color: "#6E8AA0", fontStyle: "italic" }}>
                          {recLoading ? "generating recommendation…" : "Recommendation unavailable."}
                        </span>
                      : g.rec
                    }
                  </div>
                </div>
              );
            })}

            {/* all skills summary */}
            {skills.length > 3 && !loading && (
              <div style={{
                marginTop: 6, borderTop: `1px solid ${PRP}22`, paddingTop: 10,
              }}>
                <div style={{ color: "#6E8AA0", fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>
                  ALL SKILLS ({skills.length})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[...skills].sort((a, b) => a.score - b.score).map(s => (
                    <div key={s.id} style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 6,
                      border: `1px solid ${scoreColor(s.score)}44`,
                      color: scoreColor(s.score), background: `${scoreColor(s.score)}0A`,
                      whiteSpace: "nowrap",
                    }}>
                      {s.name} <b>{Math.round(s.score)}</b>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <style>{`@keyframes jpulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
        </div>
      )}
    </>
  );
}
