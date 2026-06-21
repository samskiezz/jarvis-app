/**
 * SkillScorecard — F15 Skill Scorecard.
 * Sources real self-improvement metrics from /v1/aip/skill.
 * Shows each skill with score bar, level, and last-updated timestamp.
 * "JARVIS, skills" intent opens the panel + TTS brief.
 * Toggle button in bottom-left strip; auto-refreshes every 60s.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const PRP = "#B485FF"; // purple — skill/AIP accent
const CY  = "#29E7FF";
const GLD = "#FFD700";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SKILL_RE = /\bskill|scorecard|aip|self.improv|capability|competenc|proficien/i;

async function fetchSkills() {
  const r = await fetch(`${apiBase()}/v1/aip/skill`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)           ? d
    : Array.isArray(d?.data)        ? d.data
    : Array.isArray(d?.items)       ? d.items
    : Array.isArray(d?.skills)      ? d.skills
    : Array.isArray(d?.results)     ? d.results
    : typeof d === "object" && d !== null
      ? Object.entries(d).map(([k, v]) =>
          typeof v === "object" ? { skill: k, ...v } : { skill: k, score: v }
        )
      : [];
}

export function isSkillQuery(text) {
  return SKILL_RE.test(text || "");
}

export async function buildSkillScript() {
  let skills = [];
  try { skills = await fetchSkills(); } catch (_) {}

  if (!skills.length) return "No skill metrics are currently available, sir.";

  const getName = s => s.skill || s.name || s.skill_name || s.title || "Unknown";
  const getScore = s => {
    const raw = s.score ?? s.value ?? s.level_score ?? s.rating ?? null;
    if (raw === null) return null;
    const n = parseFloat(raw);
    return Number.isNaN(n) ? null : n;
  };

  const top = [...skills]
    .sort((a, b) => {
      const sa = getScore(a) ?? 0;
      const sb = getScore(b) ?? 0;
      return sb - sa;
    })
    .slice(0, 3)
    .map(s => {
      const sc = getScore(s);
      const pct = sc != null ? (sc <= 1 ? Math.round(sc * 100) : Math.round(sc)) : null;
      return `${getName(s)}${pct !== null ? ` at ${pct}%` : ""}`;
    })
    .join(", ");

  return (
    `AIP Skill Scorecard: ${skills.length} skill${skills.length !== 1 ? "s" : ""} tracked. ` +
    `Top performers: ${top}.`
  );
}

function fmtAge(t) {
  if (!t) return "";
  const d = new Date(typeof t === "number" ? t : Date.parse(t));
  if (Number.isNaN(d.getTime())) return String(t).slice(0, 16);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function ScoreBar({ value, max100 }) {
  if (value == null) return null;
  const pct = max100 ? Math.min(100, Math.round(value)) : Math.min(100, Math.round(value * 100));
  const color = pct >= 80 ? "#00E5A0" : pct >= 50 ? PRP : pct >= 25 ? GLD : "#FF4466";
  return (
    <div style={{ marginTop: 4, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
      <div style={{
        height: "100%", width: `${pct}%`, borderRadius: 2,
        background: color, boxShadow: `0 0 6px ${color}88`,
        transition: "width 0.4s ease",
      }} />
    </div>
  );
}

export default function SkillScorecard() {
  const [open,      setOpen]      = useState(false);
  const [skills,    setSkills]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [filter,    setFilter]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const arr = await fetchSkills();
      setSkills(arr);
      setLastFetch(new Date());
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e?.detail?.text || e?.detail?.query || "");
      if (SKILL_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const getName  = s => s.skill || s.name || s.skill_name || s.title || "Unnamed";
  const getScore = s => {
    const raw = s.score ?? s.value ?? s.level_score ?? s.rating ?? null;
    if (raw === null) return null;
    const n = parseFloat(raw);
    return Number.isNaN(n) ? null : n;
  };
  const getLevel = s => s.level || s.tier || s.grade || s.category || "";
  const getDesc  = s => s.description || s.summary || s.notes || "";
  const getTs    = s => s.updated_at || s.last_updated || s.assessed_at || s.created_at || "";

  const visible = filter.trim()
    ? skills.filter(s => {
        const hay = [getName(s), getLevel(s), getDesc(s)].join(" ").toLowerCase();
        return hay.includes(filter.toLowerCase());
      })
    : skills;

  const avgScore = (() => {
    const scored = skills.map(getScore).filter(v => v != null);
    if (!scored.length) return null;
    const avg = scored.reduce((a, b) => a + b, 0) / scored.length;
    return avg <= 1 ? Math.round(avg * 100) : Math.round(avg);
  })();

  return (
    <>
      {/* Toggle button — bottom-left strip, after DOCS */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Skill Scorecard"
        style={{
          position: "fixed", left: 700, bottom: 18, zIndex: 68,
          background: open ? PRP + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${PRP}55`,
          borderRadius: 8,
          color: open ? "#04060A" : PRP,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${PRP}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        SKILLS
        {skills.length > 0 && (
          <span style={{
            background: PRP + "44", color: PRP,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {skills.length}
          </span>
        )}
      </button>

      {/* Scorecard panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(440px,93vw)", maxHeight: "min(580px,76vh)",
          background: "rgba(4,8,14,0.94)",
          border: `1px solid ${PRP}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${PRP}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${PRP}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: PRP,
              boxShadow: `0 0 10px ${PRP}`, display: "inline-block",
              animation: loading ? "skpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: PRP, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              AIP SKILL SCORECARD
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "SYNCING"
                : lastFetch ? `↻ ${fmtAge(lastFetch)}` : "—"}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stats bar */}
          {skills.length > 0 && (
            <div style={{
              padding: "5px 14px", borderBottom: `1px solid ${PRP}18`,
              display: "flex", gap: 16, alignItems: "center",
            }}>
              <span style={{ fontSize: 9, color: PRP, letterSpacing: 1 }}>
                {skills.length} SKILL{skills.length !== 1 ? "S" : ""}
              </span>
              {avgScore !== null && (
                <span style={{ fontSize: 9, color: GLD, letterSpacing: 1 }}>
                  AVG {avgScore}%
                </span>
              )}
            </div>
          )}

          {/* Filter input */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${PRP}18` }}>
            <input
              type="text"
              placeholder="filter skills…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                background: `rgba(180,133,255,0.06)`, border: `1px solid ${PRP}33`,
                borderRadius: 5, color: "#DCEBF5", fontSize: 10,
                padding: "5px 9px", fontFamily: "'JetBrains Mono',monospace",
                outline: "none", letterSpacing: 0.5,
              }}
            />
          </div>

          {/* Skill cards */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: "24px 14px", color: "#566878", fontSize: 10, textAlign: "center" }}>
                {skills.length === 0 ? "No skill metrics available." : "No matches."}
              </div>
            )}
            {visible.map((s, i) => {
              const name  = getName(s);
              const score = getScore(s);
              const pct   = score != null
                ? (score <= 1 ? Math.round(score * 100) : Math.round(score))
                : null;
              const level = getLevel(s);
              const desc  = getDesc(s);
              const ts    = getTs(s);
              const isAboveOne = score != null && score > 1;

              return (
                <div key={s.id || s.skill_id || name + i} style={{
                  margin: "6px 10px",
                  background: `${PRP}08`,
                  border: `1px solid ${PRP}28`,
                  borderRadius: 8, padding: "9px 12px",
                }}>
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 14, lineHeight: 1, color: PRP }}>◈</span>
                    <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", fontWeight: 700, letterSpacing: 0.5 }}>
                      {name}
                    </span>
                    {pct !== null && (
                      <span style={{
                        fontSize: 9, color: GLD, background: `${GLD}18`,
                        borderRadius: 4, padding: "1px 6px", letterSpacing: 0.5, fontWeight: 700,
                      }}>
                        {pct}%
                      </span>
                    )}
                  </div>

                  {/* Score bar */}
                  <ScoreBar value={score} max100={isAboveOne} />

                  {/* Description */}
                  {desc && (
                    <p style={{
                      margin: "5px 0 4px", fontSize: 9, color: "#8ba3b8",
                      lineHeight: 1.5, letterSpacing: 0.3,
                    }}>
                      {desc.length > 120 ? desc.slice(0, 120) + "…" : desc}
                    </p>
                  )}

                  {/* Meta row */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                    {level && (
                      <span style={{
                        fontSize: 8, color: PRP + "aa", letterSpacing: 0.8,
                        border: `1px solid ${PRP}33`, borderRadius: 3, padding: "1px 5px",
                      }}>
                        {level}
                      </span>
                    )}
                    {ts && (
                      <span style={{ fontSize: 8, color: "#566878", marginLeft: "auto" }}>
                        {fmtAge(ts)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes skpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%  { transform: scale(1.5); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
