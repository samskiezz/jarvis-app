/**
 * SkillLearningTracker — F724 Skill Learning Velocity Tracker (LTRACK).
 * Polls /v1/aip/skill every 5 min; stores up to 20 readings in localStorage.
 * Computes per-skill velocity: IMPROVING (delta>0.5) / DECLINING (delta<-0.5) / STABLE.
 * Toggle: ◈ LTRACK button left:897800 bottom:8 zIndex:258.
 * BRIEF → /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 * Listens to jarvis:ltrack-toggle CustomEvent.
 * Exports: isSkillLearningQuery, buildSkillLearningScript.
 */
import { useState, useEffect, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const PRP = "#B485FF";
const GRN = "#22c55e";
const RED = "#ef4444";
const AMB = "#f59e0b";
const CY  = "#29E7FF";
const GLD = "#FFD700";

const API_KEY      = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const HISTORY_KEY  = "jarvis_skill_ltrack_history";
const MAX_READINGS = 20;
const POLL_MS      = 300_000;
const VELOCITY_THRESHOLD = 0.5;

const LTRACK_RE = /\bskill[\s-]*(progress|velocity|learning|improv|declin|trend)|ltrack|learning[\s-]*(tracker?|velocity|trend)|skill[\s-]*trend\b/i;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}"); } catch { return {}; }
}
function saveHistory(h) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch { /* quota */ }
}

function skillId(s) { return s.id || s.skill_id || s.skill || s.name || s.title || ""; }
function skillName(s) { return s.skill || s.name || s.skill_name || s.title || "Unknown"; }
function skillScore(s) {
  const raw = s.score ?? s.value ?? s.level_score ?? s.rating ?? null;
  if (raw === null) return null;
  const n = parseFloat(raw);
  return Number.isNaN(n) ? null : (n <= 1 ? n * 100 : n);
}

async function fetchSkillData() {
  const r = await fetch(`${apiBase()}/v1/aip/skill`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  const arr = Array.isArray(d)           ? d
    : Array.isArray(d?.data)             ? d.data
    : Array.isArray(d?.items)            ? d.items
    : Array.isArray(d?.skills)           ? d.skills
    : Array.isArray(d?.results)          ? d.results
    : typeof d === "object" && d !== null
      ? Object.entries(d).map(([k, v]) =>
          typeof v === "object" ? { skill: k, ...v } : { skill: k, score: v }
        )
      : [];
  return arr;
}

function computeVelocity(skillArr, history) {
  const now = Date.now();
  const newHistory = { ...history };

  const result = skillArr.map(s => {
    const id    = skillId(s);
    const name  = skillName(s);
    const score = skillScore(s);
    if (!id) return null;

    const readings = newHistory[id] || [];
    const updated  = [...readings, { t: now, v: score }].slice(-MAX_READINGS);
    newHistory[id] = updated;

    let delta = 0;
    let trend = "STABLE";
    if (updated.length >= 2) {
      const oldest = updated[0].v;
      const newest = updated[updated.length - 1].v;
      if (oldest !== null && newest !== null) {
        delta = newest - oldest;
        if (delta > VELOCITY_THRESHOLD) trend = "IMPROVING";
        else if (delta < -VELOCITY_THRESHOLD) trend = "DECLINING";
      }
    }

    return { id, name, score, delta, trend, raw: s };
  }).filter(Boolean);

  saveHistory(newHistory);
  return { result, newHistory };
}

function VelocityBadge({ trend }) {
  const map = {
    IMPROVING: { bg: `${GRN}22`, color: GRN, label: "▲ IMPROVING" },
    DECLINING: { bg: `${RED}22`, color: RED, label: "▼ DECLINING" },
    STABLE:    { bg: `${CY}18`,  color: CY,   label: "● STABLE" },
  };
  const s = map[trend] || map.STABLE;
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, letterSpacing: 0.8,
      background: s.bg, color: s.color,
      borderRadius: 3, padding: "1px 5px", flexShrink: 0,
    }}>
      {s.label}
    </span>
  );
}

function ScoreBar({ score }) {
  if (score == null) return null;
  const pct = Math.min(100, Math.round(score));
  const color = pct >= 80 ? "#00E5A0" : pct >= 50 ? PRP : pct >= 25 ? GLD : RED;
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, marginTop: 3 }}>
      <div style={{
        height: "100%", width: `${pct}%`, borderRadius: 2,
        background: color, transition: "width 0.4s ease",
      }} />
    </div>
  );
}

export function isSkillLearningQuery(text) {
  return LTRACK_RE.test(text || "");
}

export async function buildSkillLearningScript() {
  const history = loadHistory();
  const keys = Object.keys(history);
  if (!keys.length) return "No skill learning history available yet, sir. Check back after the first poll.";

  const velocities = keys.map(id => {
    const readings = history[id] || [];
    if (readings.length < 2) return { id, trend: "STABLE", delta: 0 };
    const oldest = readings[0].v;
    const newest = readings[readings.length - 1].v;
    if (oldest === null || newest === null) return { id, trend: "STABLE", delta: 0 };
    const delta = newest - oldest;
    const trend = delta > VELOCITY_THRESHOLD ? "IMPROVING"
                : delta < -VELOCITY_THRESHOLD ? "DECLINING"
                : "STABLE";
    return { id, trend, delta };
  });

  const improving = velocities.filter(v => v.trend === "IMPROVING").length;
  const declining = velocities.filter(v => v.trend === "DECLINING").length;

  return (
    `Skill Learning Velocity: ${keys.length} skill${keys.length !== 1 ? "s" : ""} tracked across ${Object.values(history)[0]?.length || 1} reading${(Object.values(history)[0]?.length || 1) !== 1 ? "s" : ""}. ` +
    `${improving} improving, ${declining} declining.` +
    (declining > 0 ? ` Attention required on ${declining} declining skill${declining !== 1 ? "s" : ""}.` : " All stable or improving.")
  );
}

export default function SkillLearningTracker() {
  const [open,    setOpen]    = useState(false);
  const [skills,  setSkills]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState("ALL");
  const [search,  setSearch]  = useState("");
  const [briefing, setBriefing] = useState(false);

  const poll = useCallback(async () => {
    setLoading(true);
    try {
      const arr = await fetchSkillData();
      if (!arr.length) return;
      const history = loadHistory();
      const { result } = computeVelocity(arr, history);
      setSkills(result);
    } catch { /* silent — no live data */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:ltrack-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ltrack-toggle", onToggle);
  }, []);

  const declining = skills.filter(s => s.trend === "DECLINING").length;
  const improving = skills.filter(s => s.trend === "IMPROVING").length;

  const TABS = ["ALL", "IMPROVING", "DECLINING", "STABLE"];

  const visible = skills.filter(s => {
    if (filter !== "ALL" && s.trend !== filter) return false;
    if (search.trim()) {
      return s.name.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  async function handleBrief() {
    if (briefing || !skills.length) return;
    setBriefing(true);
    const improving = skills.filter(s => s.trend === "IMPROVING").map(s => s.name).join(", ") || "none";
    const declining = skills.filter(s => s.trend === "DECLINING").map(s => s.name).join(", ") || "none";
    const prompt = `Skill learning velocity brief: ${skills.length} skills tracked. Improving: ${improving}. Declining: ${declining}. Give a 2-sentence analysis of skill trajectory and recommended focus.`;
    try {
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await res.json();
      const text = d?.response || d?.message || d?.content || d?.text || "";
      if (text) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch { /* no TTS on failure */ }
    finally { setBriefing(false); }
  }

  const tabColor = t => t === "IMPROVING" ? GRN : t === "DECLINING" ? RED : t === "STABLE" ? CY : PRP;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Skill Learning Velocity Tracker"
        style={{
          position: "fixed", left: 897800, bottom: 8, zIndex: 258,
          background: open ? `${PRP}cc` : "rgba(5,8,13,0.78)",
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
        LTRACK
        {declining > 0 && (
          <span style={{
            background: `${RED}44`, color: RED,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {declining}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", right: 18, bottom: 72, zIndex: 258,
          width: "min(460px,94vw)", maxHeight: "min(600px,78vh)",
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
              animation: loading ? "ltpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: PRP, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              SKILL LEARNING VELOCITY
            </span>
            <button onClick={() => setOpen(false)} style={{
              marginLeft: "auto", background: "none", border: "none",
              color: "#566878", cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stat tiles */}
          {skills.length > 0 && (
            <div style={{
              display: "flex", gap: 8, padding: "8px 14px",
              borderBottom: `1px solid ${PRP}18`,
            }}>
              {[
                { label: "TRACKED",   value: skills.length,  color: PRP },
                { label: "IMPROVING", value: improving,       color: GRN },
                { label: "DECLINING", value: declining,       color: RED },
                { label: "STABLE",    value: skills.length - improving - declining, color: CY },
              ].map(t => (
                <div key={t.label} style={{
                  flex: 1, textAlign: "center",
                  background: `${t.color}08`, border: `1px solid ${t.color}22`,
                  borderRadius: 6, padding: "5px 4px",
                }}>
                  <div style={{ fontSize: 14, color: t.color, fontWeight: 700 }}>{t.value}</div>
                  <div style={{ fontSize: 8, color: "#566878", letterSpacing: 0.5 }}>{t.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${PRP}18` }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setFilter(t)} style={{
                  fontSize: 9, letterSpacing: 1, padding: "3px 8px",
                  borderRadius: 4, cursor: "pointer", fontFamily: "inherit",
                  fontWeight: filter === t ? 700 : 400,
                  background: filter === t ? `${tabColor(t)}33` : "transparent",
                  border: `1px solid ${filter === t ? tabColor(t) : "#2e4050"}`,
                  color: filter === t ? tabColor(t) : "#566878",
                  transition: "all 0.15s",
                }}>
                  {t}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="search skills…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                background: `rgba(180,133,255,0.06)`, border: `1px solid ${PRP}33`,
                borderRadius: 5, color: "#DCEBF5", fontSize: 10,
                padding: "5px 9px", fontFamily: "'JetBrains Mono',monospace",
                outline: "none", letterSpacing: 0.5,
              }}
            />
          </div>

          {/* Skill rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: "24px 14px", color: "#566878", fontSize: 10, textAlign: "center" }}>
                {skills.length === 0 ? "No skill data available." : "No matches."}
              </div>
            )}
            {visible.map((s, i) => {
              const deltaStr = s.delta !== 0
                ? (s.delta > 0 ? `+${s.delta.toFixed(1)}` : s.delta.toFixed(1)) + "%"
                : "±0%";
              return (
                <div key={s.id + i} style={{
                  margin: "5px 10px",
                  background: `${PRP}06`,
                  border: `1px solid ${PRP}22`,
                  borderRadius: 7, padding: "8px 11px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <VelocityBadge trend={s.trend} />
                    <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", fontWeight: 600, letterSpacing: 0.5 }}>
                      {s.name}
                    </span>
                    <span style={{ fontSize: 9, color: GLD, letterSpacing: 0.5 }}>
                      {deltaStr}
                    </span>
                    {s.score !== null && (
                      <span style={{
                        fontSize: 9, color: GLD,
                        background: `${GLD}18`, borderRadius: 4, padding: "1px 5px",
                      }}>
                        {Math.round(s.score)}%
                      </span>
                    )}
                  </div>
                  <ScoreBar score={s.score} />
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            borderTop: `1px solid ${PRP}18`, padding: "8px 14px",
            display: "flex", gap: 8, alignItems: "center",
          }}>
            <button
              onClick={handleBrief}
              disabled={briefing || !skills.length}
              style={{
                fontSize: 9, letterSpacing: 1, padding: "5px 14px",
                borderRadius: 5, cursor: briefing ? "wait" : "pointer",
                fontFamily: "inherit", fontWeight: 700,
                background: briefing ? `${PRP}22` : `${PRP}33`,
                border: `1px solid ${PRP}55`, color: PRP,
                opacity: (!skills.length) ? 0.4 : 1,
              }}
            >
              {briefing ? "BRIEFING…" : "▶ BRIEF"}
            </button>
            <span style={{ fontSize: 9, color: "#566878", marginLeft: "auto" }}>
              {visible.length} skill{visible.length !== 1 ? "s" : ""}
              {filter !== "ALL" ? ` · ${filter}` : ""}
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ltpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
