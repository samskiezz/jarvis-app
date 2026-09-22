/**
 * F31 — Urgent Skill Gap Radar
 * Crosses /v1/aip/skill scores against /entities/Task priorities to surface the
 * most dangerous operational gaps: high-urgency tasks with low or absent skill backing.
 * Danger index = priority_weight × (1 - best_skill_score / 100).
 * Additive-only. Mounted in App.jsx. No fake data.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY = "#29E7FF";
const RED = "#FF4444";
const AMB = "#FFA500";
const GRN = "#44FF88";
const BG = "rgba(5,10,18,0.97)";
const API = import.meta.env.VITE_API_BASE || "";

const PRIORITY_WEIGHT = { CRITICAL: 1.0, HIGH: 0.8, URGENT: 0.9, MEDIUM: 0.5, LOW: 0.2 };

function dangerColor(d) {
  if (d >= 0.7) return RED;
  if (d >= 0.4) return AMB;
  return GRN;
}

function bestSkillMatch(taskTitle, taskDesc, skills) {
  const tokens = `${taskTitle} ${taskDesc}`.toLowerCase().split(/\W+/).filter(t => t.length > 3);
  let best = null;
  let bestScore = -1;
  for (const sk of skills) {
    const haystack = `${sk.name} ${sk.description || ""}`.toLowerCase();
    const hits = tokens.filter(t => haystack.includes(t)).length;
    if (hits > bestScore) { bestScore = hits; best = sk; }
  }
  return { skill: best, hits: bestScore };
}

function computeGaps(tasks, skills) {
  return tasks
    .filter(t => ["IN_PROGRESS", "PENDING", "URGENT", "ACTIVE"].includes((t.status || "").toUpperCase()))
    .map(t => {
      const prio = (t.priority || t.urgency || "MEDIUM").toUpperCase();
      const pw = PRIORITY_WEIGHT[prio] ?? 0.5;
      const { skill, hits } = bestSkillMatch(t.title || t.name || "", t.description || "", skills);
      const skillScore = skill ? (skill.score ?? skill.level ?? 50) : 0;
      const danger = pw * (1 - Math.min(skillScore, 100) / 100);
      return { task: t, prio, pw, skill, skillScore: skill ? skillScore : null, hits, danger };
    })
    .sort((a, b) => b.danger - a.danger)
    .slice(0, 10);
}

export default function UrgentSkillGapRadar() {
  const [open, setOpen] = useState(false);
  const [gaps, setGaps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [skRes, taskRes] = await Promise.all([
        fetch(`${API}/v1/aip/skill`),
        fetch(`${API}/entities/Task`),
      ]);
      if (!skRes.ok) throw new Error(`/v1/aip/skill ${skRes.status}`);
      if (!taskRes.ok) throw new Error(`/entities/Task ${taskRes.status}`);
      const skData = await skRes.json();
      const taskData = await taskRes.json();
      const skills = Array.isArray(skData) ? skData : (skData.skills || skData.data || []);
      const tasks = Array.isArray(taskData) ? taskData : (taskData.tasks || taskData.data || []);
      setGaps(computeGaps(tasks, skills));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      load();
      timerRef.current = setInterval(load, 120_000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = (e) => {
      const msg = (e.detail?.message || "").toLowerCase();
      if (/urgent gap|skill gap radar|dangerous gap|urgap/.test(msg)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", handler);
    return () => window.removeEventListener("jarvis:ask", handler);
  }, []);

  const assess = useCallback(async () => {
    if (!gaps.length) return;
    setAssessing(true);
    setAssessment(null);
    const top3 = gaps.slice(0, 3).map(g =>
      `Task: "${g.task.title || g.task.name}" (${g.prio}, danger ${(g.danger * 100).toFixed(0)}%) — ` +
      (g.skill ? `best skill "${g.skill.name}" score ${g.skillScore}` : "no skill match")
    ).join("; ");
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Skill gap radar: top 3 dangerous gaps are: ${top3}. Give a 2-sentence operational risk assessment and immediate recommendation.` }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.text || "No assessment available.";
      setAssessment(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAssessment("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [gaps]);

  const dangerCount = gaps.filter(g => g.danger >= 0.7).length;

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Urgent Skill Gap Radar"
        style={{
          position: "fixed", bottom: 8, left: 10540, zIndex: 69,
          background: BG, border: `1px solid ${dangerCount > 0 ? RED : CY}55`,
          color: dangerCount > 0 ? RED : CY, borderRadius: 8,
          padding: "4px 10px", fontSize: 10, letterSpacing: 1.5,
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        ◈ URGAP{dangerCount > 0 ? ` (${dangerCount}!)` : ""}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 40, left: 10540, zIndex: 70,
          width: 460, background: BG, border: `1px solid ${CY}44`,
          borderRadius: 12, fontFamily: "'JetBrains Mono',monospace",
          boxShadow: `0 0 40px ${CY}18, 0 16px 40px rgba(0,0,0,0.8)`,
        }}>
          <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${CY}22`, gap: 8 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, flex: 1 }}>◈ URGENT SKILL GAP RADAR</span>
            {loading && <span style={{ color: "#4E6070", fontSize: 9 }}>LOADING…</span>}
            <button onClick={assess} disabled={assessing || !gaps.length}
              style={{ background: "transparent", border: `1px solid ${CY}55`, color: CY, borderRadius: 5, padding: "2px 8px", fontSize: 9, cursor: "pointer", letterSpacing: 1 }}>
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button onClick={() => setOpen(false)}
              style={{ background: "transparent", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 13 }}>✕</button>
          </div>

          <div style={{ maxHeight: 340, overflowY: "auto", padding: "8px 0" }}>
            {error && <div style={{ padding: "10px 14px", color: RED, fontSize: 10 }}>ERROR: {error}</div>}
            {!loading && !error && gaps.length === 0 && (
              <div style={{ padding: "16px 14px", color: "#4E6070", fontSize: 10, textAlign: "center" }}>
                No active tasks found or all tasks have skill coverage.
              </div>
            )}
            {gaps.map((g, i) => {
              const dc = dangerColor(g.danger);
              return (
                <div key={i} style={{
                  padding: "8px 14px",
                  borderBottom: `1px solid ${CY}0D`,
                  background: i % 2 === 0 ? "rgba(41,231,255,0.02)" : "transparent",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{
                      background: dc + "22", color: dc, border: `1px solid ${dc}55`,
                      borderRadius: 4, padding: "1px 5px", fontSize: 9, letterSpacing: 1, flexShrink: 0,
                    }}>
                      {(g.danger * 100).toFixed(0)}%
                    </span>
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {g.task.title || g.task.name || "Untitled"}
                    </span>
                    <span style={{
                      background: "rgba(255,165,0,0.12)", color: AMB, borderRadius: 3,
                      padding: "1px 4px", fontSize: 8, letterSpacing: 1, flexShrink: 0,
                    }}>
                      {g.prio}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, height: 3, background: `${CY}18`, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${g.danger * 100}%`, height: "100%", background: dc, borderRadius: 2 }} />
                    </div>
                    <span style={{ color: "#4E6070", fontSize: 8, flexShrink: 0 }}>
                      {g.skill ? `${g.skill.name || "skill"} — score ${g.skillScore ?? "?"}` : "NO SKILL MATCH"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {assessment && (
            <div style={{ padding: "10px 14px", borderTop: `1px solid ${CY}22`, color: "#7A95AB", fontSize: 9, lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ padding: "6px 14px", borderTop: `1px solid ${CY}11`, color: "#2E4050", fontSize: 8, letterSpacing: 1 }}>
            danger = priority × (1 − skill_score)  ·  auto-refresh 120s
          </div>
        </div>
      )}
    </>
  );
}
