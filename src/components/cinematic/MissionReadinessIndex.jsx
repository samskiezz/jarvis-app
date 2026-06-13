/**
 * MissionReadinessIndex — F67.
 *
 * Parallel-fetch:
 *   /entities/Task           — task completion ratio      (25 %)
 *   /v1/aip/skill            — average skill score        (30 %)
 *   /entities/SwarmJob       — automation health          (20 %)
 *   /v1/jarvis/system/status — CPU / mem / load penalty   (25 %)
 *
 * Composite 0–100 Mission Readiness Index displayed as an SVG ring gauge
 * with four sub-score bars. Click ▶ ASSESS → /v1/jarvis/agent/chat for a
 * 2-sentence AI readiness assessment + TTS via jarvis:speak-dossier.
 *
 * Intent: "mission ready" / "readiness" / "ready index" / "operational ready"
 *   → jarvis:mission-ready-toggle + TTS brief via buildMissionReadyScript()
 *
 * Toggle: ◎ READY at left:5692, zIndex 65. Live score badge on button.
 * 45 s auto-refresh. Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GREEN = "#4ADE80";
const AMBER = "#F5A623";
const RED = "#FF3D5A";
const VIOLET = "#A78BFA";
const BTN_LEFT = 5692;
const REFRESH_MS = 45_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isMissionReadyQuery(q) {
  return /mission.read|readiness.index|operational.read|ready.index|combat.read|\bMRI\b|ready.status/i.test(
    q || ""
  );
}

export async function buildMissionReadyScript() {
  try {
    const { index, factors } = await computeIndex();
    window.dispatchEvent(new CustomEvent("jarvis:mission-ready-toggle"));
    const label =
      index >= 80 ? "MISSION READY" :
      index >= 60 ? "OPERATIONALLY CAPABLE" :
      index >= 40 ? "REDUCED CAPABILITY" : "CRITICAL SHORTFALL";
    return `Mission Readiness Index stands at ${Math.round(index)} of 100 — status: ${label}, sir. Contributing factors: tasks ${Math.round(factors.tasks)}%, skills ${Math.round(factors.skills)}%, automation ${Math.round(factors.automation)}%, system health ${Math.round(factors.system)}%.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:mission-ready-toggle"));
    return "Mission readiness panel open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function MissionReadinessIndex() {
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(null);
  const [factors, setFactors] = useState(null);
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:mission-ready-toggle", onToggle);
    return () => window.removeEventListener("jarvis:mission-ready-toggle", onToggle);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await computeIndex();
      setIndex(result.index);
      setFactors(result.factors);
      setRawData(result.raw);
    } catch {
      // leave existing data intact
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, load]);

  const assess = useCallback(async () => {
    if (assessing || index === null || !factors) return;
    setAssessing(true);
    try {
      const prompt =
        `In exactly 2 sentences: Given a Mission Readiness Index of ${Math.round(index)}/100 with sub-scores — tasks ${Math.round(factors.tasks)}%, skills ${Math.round(factors.skills)}%, automation ${Math.round(factors.automation)}%, system health ${Math.round(factors.system)}% — what is the operational assessment and what single action would most improve readiness? British-butler tone. No markdown.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (text) {
        setAssessment(text);
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setAssessment("Reasoning core unreachable. Please try again.");
    } finally {
      setAssessing(false);
    }
  }, [assessing, index, factors]);

  const score = index ?? 0;
  const readinessLabel =
    score >= 80 ? "MISSION READY" :
    score >= 60 ? "CAPABLE" :
    score >= 40 ? "REDUCED" : "CRITICAL";
  const readinessColor =
    score >= 80 ? GREEN : score >= 60 ? CY : score >= 40 ? AMBER : RED;

  // SVG ring gauge
  const R = 54;
  const CIRC = 2 * Math.PI * R;
  const arc = (CIRC * Math.min(100, Math.max(0, score))) / 100;

  const subScores = factors
    ? [
        { label: "TASKS (25%)",      val: factors.tasks,      col: VIOLET, detail: rawData?.taskDetail },
        { label: "SKILLS (30%)",     val: factors.skills,     col: CY,     detail: rawData?.skillDetail },
        { label: "AUTOMATION (20%)", val: factors.automation, col: GREEN,  detail: rawData?.swarmDetail },
        { label: "SYSTEM (25%)",     val: factors.system,     col: AMBER,  detail: rawData?.systemDetail },
      ]
    : [];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Mission Readiness Index"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
          height: 26, padding: "0 8px",
          background: visible ? `${CY}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? CY : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? CY : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 1,
          cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {index !== null && !visible && (
          <span
            style={{
              display: "inline-block", marginRight: 5,
              background: readinessColor, color: "#000", borderRadius: "50%",
              width: 14, height: 14, fontSize: 8, lineHeight: "14px", textAlign: "center",
              fontWeight: 700,
            }}
          >
            {Math.round(score)}
          </span>
        )}
        ◎ READY
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, typeof window !== "undefined" ? window.innerWidth - 520 : BTN_LEFT),
            zIndex: 65,
            width: 500,
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.97)",
            border: `1px solid ${CY}44`,
            borderTop: `2px solid ${CY}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${CY}14, 0 8px 32px rgba(0,0,0,0.75)`,
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderBottom: `1px solid ${CY}22`, flexShrink: 0,
            }}
          >
            <span style={{ color: CY, fontSize: 13 }}>◎</span>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              MISSION READINESS INDEX
            </span>
            {loading && (
              <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>computing…</span>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={load}
              title="Refresh"
              style={{ background: "transparent", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 13 }}
            >
              ↻
            </button>
            <button
              onClick={() => setVisible(false)}
              style={{ background: "transparent", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* Ring + sub-score bars */}
          <div
            style={{
              display: "flex", alignItems: "center", gap: 20,
              padding: "16px 20px", borderBottom: "1px solid #1A2A3A", flexShrink: 0,
            }}
          >
            {/* SVG ring gauge */}
            <div style={{ flexShrink: 0, position: "relative", width: 140, height: 140 }}>
              <svg width="140" height="140" viewBox="0 0 140 140">
                <circle cx="70" cy="70" r={R} fill="none" stroke="#1A2A3A" strokeWidth="12" />
                <circle
                  cx="70" cy="70" r={R} fill="none"
                  stroke={readinessColor} strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={`${arc} ${CIRC - arc}`}
                  strokeDashoffset={CIRC / 4}
                  style={{
                    filter: `drop-shadow(0 0 8px ${readinessColor})`,
                    transition: "stroke-dasharray 0.6s ease",
                  }}
                />
              </svg>
              <div
                style={{
                  position: "absolute", top: "50%", left: "50%",
                  transform: "translate(-50%,-50%)", textAlign: "center",
                }}
              >
                <div style={{ fontSize: 30, fontWeight: 700, color: readinessColor, lineHeight: 1 }}>
                  {index !== null ? Math.round(score) : "—"}
                </div>
                <div style={{ fontSize: 8, color: readinessColor, letterSpacing: 2, marginTop: 3 }}>
                  {readinessLabel}
                </div>
              </div>
            </div>

            {/* Sub-score bars */}
            {subScores.length > 0 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                {subScores.map(({ label, val, col, detail }) => (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 8, color: "#6E8AA0", letterSpacing: 1 }}>{label}</span>
                      <span style={{ fontSize: 10, color: col, fontWeight: 700 }}>{Math.round(val)}%</span>
                    </div>
                    <div style={{ height: 5, background: "#1A2A3A", borderRadius: 3, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.max(0, Math.min(100, val))}%`,
                          height: "100%", background: col, borderRadius: 3,
                          transition: "width 0.6s ease",
                          boxShadow: `0 0 6px ${col}88`,
                        }}
                      />
                    </div>
                    {detail && (
                      <div style={{ fontSize: 8, color: "#4E6A7A", marginTop: 2 }}>{detail}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              !loading && (
                <div style={{ flex: 1, textAlign: "center", color: "#4E6A7A", fontSize: 10, letterSpacing: 1 }}>
                  {loading ? "Computing…" : "Awaiting data."}
                </div>
              )
            )}
          </div>

          {/* Assess button + AI text */}
          <div style={{ padding: "12px 14px", flexShrink: 0 }}>
            <button
              onClick={assess}
              disabled={assessing || index === null}
              style={{
                width: "100%", padding: "8px 0", borderRadius: 6,
                border: `1px solid ${CY}55`,
                background: assessing || index === null ? "transparent" : `${CY}0F`,
                color: assessing || index === null ? "#4E6A7A" : CY,
                fontSize: 10, letterSpacing: 1,
                cursor: assessing || index === null ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {assessing ? "▷ ASSESSING…" : "▶ JARVIS ASSESS READINESS"}
            </button>
            {assessment && (
              <div
                style={{
                  marginTop: 10, padding: "8px 12px",
                  background: `${CY}08`, border: `1px solid ${CY}22`, borderRadius: 6,
                  fontSize: 10, color: "#C8DDF0", lineHeight: 1.7,
                }}
              >
                {assessment}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "7px 14px", borderTop: `1px solid ${CY}18`,
              fontSize: 8, color: "#4E6A7A", letterSpacing: 1, flexShrink: 0,
            }}
          >
            /entities/Task · /v1/aip/skill · /entities/SwarmJob · /v1/jarvis/system/status · auto-refresh 45 s
          </div>
        </div>
      )}
    </>
  );
}

// ─── data helpers ─────────────────────────────────────────────────────────────

async function computeIndex() {
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();

  const [taskRes, skillRes, swarmRes, statusRes] = await Promise.allSettled([
    fetch(`${base}/entities/Task`, { headers }).then((r) => r.json()),
    fetch(`${base}/v1/aip/skill`, { headers }).then((r) => r.json()),
    fetch(`${base}/entities/SwarmJob`, { headers }).then((r) => r.json()),
    fetch(`${base}/v1/jarvis/system/status`, { headers }).then((r) => r.json()),
  ]);

  // Tasks sub-score: fraction of done + half-credit for in-progress
  let tasksScore = 100;
  let taskDetail = "";
  if (taskRes.status === "fulfilled") {
    const tasks = normalizeArray(taskRes.value);
    if (tasks.length > 0) {
      const done = tasks.filter((t) =>
        /done|complete|finished|closed/i.test(t.status || "")
      ).length;
      const inProg = tasks.filter((t) =>
        /progress|active|running|in.progress/i.test(t.status || "")
      ).length;
      tasksScore = Math.min(100, Math.round(((done + inProg * 0.5) / tasks.length) * 100));
      taskDetail = `${done} done, ${inProg} in-progress of ${tasks.length} total`;
    }
  }

  // Skills sub-score: mean skill score (0–100 assumed)
  let skillsScore = 0;
  let skillDetail = "";
  if (skillRes.status === "fulfilled") {
    const skills = normalizeArray(skillRes.value);
    if (skills.length > 0) {
      const scores = skills.map((s) => {
        const v = s.score ?? s.level ?? s.value ?? s.rating ?? 0;
        return typeof v === "number" ? v : parseFloat(v) || 0;
      });
      skillsScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const below = scores.filter((s) => s < 70).length;
      skillDetail = `avg ${skillsScore}/100 · ${below} skill gap${below !== 1 ? "s" : ""}`;
    }
  }

  // Automation sub-score: penalise failed jobs
  let automationScore = 100;
  let swarmDetail = "";
  if (swarmRes.status === "fulfilled") {
    const jobs = normalizeArray(swarmRes.value);
    if (jobs.length > 0) {
      const failed = jobs.filter((j) =>
        /fail|error|crash/i.test(j.status || "")
      ).length;
      const active = jobs.filter((j) =>
        /run|active|queue|pending/i.test(j.status || "")
      ).length;
      automationScore =
        failed === 0 ? 100 : Math.round(Math.max(0, (1 - failed / jobs.length) * 100));
      swarmDetail = `${active} active · ${failed} failed of ${jobs.length} jobs`;
    }
  }

  // System sub-score: CPU + mem + load penalties
  let systemScore = 100;
  let systemDetail = "";
  if (statusRes.status === "fulfilled") {
    const s = statusRes.value ?? {};
    const cpu = extractNumber(s.cpu_percent ?? s.cpu ?? s.cpu_usage);
    const mem = extractNumber(
      s.memory_percent ?? s.mem_percent ?? s.memory?.percent ?? s.mem
    );
    const load1 = extractNumber(s.load_avg?.[0] ?? s.load_average?.[0] ?? s.load1);
    const cpuPen  = cpu    !== null ? Math.min(50, (cpu    / 100) * 50) : 0;
    const memPen  = mem    !== null ? Math.min(30, (mem    / 100) * 30) : 0;
    const loadPen = load1  !== null ? Math.min(20, (load1  / 8)   * 20) : 0;
    systemScore = Math.round(Math.max(0, 100 - cpuPen - memPen - loadPen));
    const parts = [];
    if (cpu   !== null) parts.push(`CPU ${Math.round(cpu)}%`);
    if (mem   !== null) parts.push(`mem ${Math.round(mem)}%`);
    if (load1 !== null) parts.push(`load ${load1.toFixed(2)}`);
    systemDetail = parts.join(" · ");
  }

  const index =
    tasksScore      * 0.25 +
    skillsScore     * 0.30 +
    automationScore * 0.20 +
    systemScore     * 0.25;

  return {
    index,
    factors: {
      tasks:      tasksScore,
      skills:     skillsScore,
      automation: automationScore,
      system:     systemScore,
    },
    raw: { taskDetail, skillDetail, swarmDetail, systemDetail },
  };
}

function normalizeArray(d) {
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data))     return d.data;
  if (Array.isArray(d?.items))    return d.items;
  if (Array.isArray(d?.results))  return d.results;
  if (Array.isArray(d?.entities)) return d.entities;
  return [];
}

function extractNumber(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? null : n;
}
