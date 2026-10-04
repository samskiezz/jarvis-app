/**
 * MissionActivationScore — F108 (MASCORE).
 *
 * Synthesises five live data streams into a 0-100 mission activation score:
 *
 *   /entities/Task          → task activity rate  (in_progress + pending / total)
 *   /entities/RiskSignal    → risk exposure index (critical+high share)
 *   /v1/investigations       → investigation density (open / total, capped at 1)
 *   /v1/aip/skill            → skill availability  (skill count / 20, capped at 1)
 *   /v1/cinematic/brain      → synapse density     (synapses / max(nodes,1), normalised)
 *
 * Score = weighted average:
 *   task_activity  × 30%
 *   risk_coverage  × 25%  (inverted — high critical risk lowers mission readiness)
 *   investigations × 20%
 *   skill_avail    × 15%
 *   brain_density  × 10%
 *
 * Visual:
 *   • SVG gauge ring — green ≥ 75 / amber 40-74 / red < 40
 *   • 5 stat tiles: SCORE / TASKS / RISKS / INVESTIGATIONS / SKILLS
 *   • 5 component driver bars with sub-scores
 *   • ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 *
 * Toggle: ◈ MASCORE at left:985420, bottom:8, zIndex:132
 * Event:  jarvis:mascore-toggle
 * Wired:  App.jsx + JarvisBrain.jsx (isMascoreQuery / buildMascoreScript)
 *
 * Voice: "mascore" / "mission activation" / "activation score" /
 *        "mission readiness" / "operational score" / "jarvis mission" /
 *        "mission health"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const RED   = "#FF3D5A";
const GREEN = "#00c878";

const BTN_LEFT   = 985420;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normalise(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

async function computeScore() {
  const base = apiBase();
  const hdr  = authHdr();

  const [rawTasks, rawRisks, rawInvest, rawSkills, rawBrain] = await Promise.all([
    fetch(`${base}/entities/Task`,          { headers: hdr }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/RiskSignal`,    { headers: hdr }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/investigations`,      { headers: hdr }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/aip/skill`,           { headers: hdr }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/cinematic/brain`,     { headers: hdr }).then(r => r.json()).catch(() => ({})),
  ]);

  const tasks  = normalise(rawTasks);
  const risks  = normalise(rawRisks);
  const invest = normalise(rawInvest);
  const skills = normalise(rawSkills);

  // brain stats
  const nodes    = rawBrain?.nodes    ?? rawBrain?.total_nodes    ?? 0;
  const synapses = rawBrain?.synapses ?? rawBrain?.total_synapses ?? rawBrain?.edges ?? 0;

  // ── driver 1: task activity rate ─────────────────────────────────────────
  const activeTasks = tasks.filter(t => {
    const s = (t.status || "").toLowerCase();
    return s === "in_progress" || s === "pending" || s === "active";
  }).length;
  const taskRate = tasks.length > 0 ? clamp(activeTasks / tasks.length) : 0;

  // ── driver 2: risk exposure (inverted — high critical = low readiness) ───
  const critHigh  = risks.filter(r => {
    const s = (r.severity || r.level || "").toLowerCase();
    return s === "critical" || s === "high";
  }).length;
  const riskRaw   = risks.length > 0 ? clamp(critHigh / risks.length) : 0;
  const riskCover = clamp(1 - riskRaw); // invert: fewer critical risks = better

  // ── driver 3: investigation density (open cases signal active intel ops) ─
  const openInv    = invest.filter(i => {
    const s = (i.status || "").toLowerCase();
    return s === "open" || s === "active" || s === "in_progress";
  }).length;
  const invDensity = invest.length > 0 ? clamp(openInv / invest.length) : 0;

  // ── driver 4: skill availability (more skills = more capable) ────────────
  const SKILL_TARGET = 20;
  const skillAvail   = clamp(skills.length / SKILL_TARGET);

  // ── driver 5: brain synapse density ──────────────────────────────────────
  const synapseTarget = 500;
  const brainDensity  = clamp(synapses / synapseTarget);

  // ── weighted aggregate ────────────────────────────────────────────────────
  const score = Math.round(
    (taskRate   * 0.30 +
     riskCover  * 0.25 +
     invDensity * 0.20 +
     skillAvail * 0.15 +
     brainDensity * 0.10) * 100
  );

  return {
    score,
    drivers: [
      { label: "TASK ACTIVITY",       value: Math.round(taskRate    * 100), weight: 30, color: CY    },
      { label: "RISK COVERAGE",       value: Math.round(riskCover   * 100), weight: 25, color: AMBER },
      { label: "INVESTIGATION DEPTH", value: Math.round(invDensity  * 100), weight: 20, color: GREEN },
      { label: "SKILL AVAILABILITY",  value: Math.round(skillAvail  * 100), weight: 15, color: CY    },
      { label: "BRAIN DENSITY",       value: Math.round(brainDensity* 100), weight: 10, color: AMBER },
    ],
    counts: {
      tasks:  tasks.length,
      risks:  risks.length,
      invest: invest.length,
      skills: skills.length,
    },
    activeTasks,
    openInv,
    critHigh,
    nodes,
    synapses,
  };
}

// ── exported helpers for JarvisBrain ─────────────────────────────────────────

const MASCORE_RE =
  /\b(mascore|mission.activation|activation.score|mission.readiness|operational.score|jarvis.mission|mission.health)\b/i;

export function isMascoreQuery(q) {
  return MASCORE_RE.test(q || "");
}

export async function buildMascoreScript() {
  try {
    const data = await computeScore();
    const { score, counts, activeTasks, openInv, critHigh } = data;
    const readiness = score >= 75 ? "HIGH" : score >= 40 ? "MODERATE" : "LOW";
    window.dispatchEvent(new CustomEvent("jarvis:mascore-toggle"));
    return (
      `Mission activation score is ${score} — readiness status ${readiness}, sir. ` +
      `${activeTasks} of ${counts.tasks} tasks are active, ` +
      `${critHigh} critical or high-priority risk signals are unresolved, ` +
      `${openInv} investigations are open, ` +
      `and ${counts.skills} skills are available in the skill registry. ` +
      `The MASCORE panel is now open for detailed breakdown.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:mascore-toggle"));
    return "Mission activation score data is unavailable at present, sir.";
  }
}

// ── SVG gauge ring ────────────────────────────────────────────────────────────

function GaugeRing({ score, color }) {
  const R   = 56;
  const CX  = 72;
  const CY2 = 72;
  const circumference = 2 * Math.PI * R;
  const offset = circumference - (score / 100) * circumference;

  return (
    <svg width={144} height={144} viewBox="0 0 144 144">
      {/* track */}
      <circle cx={CX} cy={CY2} r={R}
        fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={10} />
      {/* fill */}
      <circle cx={CX} cy={CY2} r={R}
        fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${CX} ${CY2})`}
        style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s" }}
      />
      {/* score text */}
      <text x={CX} y={CY2 + 5} textAnchor="middle"
        fill={color} fontFamily="'JetBrains Mono','Courier New',monospace"
        fontSize={22} fontWeight={700}>
        {score}
      </text>
      <text x={CX} y={CY2 + 20} textAnchor="middle"
        fill="rgba(255,255,255,0.4)" fontFamily="'JetBrains Mono','Courier New',monospace"
        fontSize={8} letterSpacing={2}>
        MASCORE
      </text>
    </svg>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function MissionActivationScore() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await computeScore();
      setData(result);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:mascore-toggle", onToggle);
    return () => window.removeEventListener("jarvis:mascore-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const score = data?.score ?? 0;
  const gaugeColor = score >= 75 ? GREEN : score >= 40 ? AMBER : RED;
  const readiness  = score >= 75 ? "HIGH" : score >= 40 ? "MODERATE" : "LOW";

  async function assess() {
    if (!data) return;
    setAssessing(true);
    try {
      const { score: s, counts, activeTasks, openInv, critHigh } = data;
      const prompt =
        `Mission activation score: ${s}/100. ` +
        `Active tasks: ${activeTasks}/${counts.tasks}. ` +
        `Critical/high risks: ${critHigh}/${counts.risks}. ` +
        `Open investigations: ${openInv}/${counts.invest}. ` +
        `Skills available: ${counts.skills}. ` +
        `Provide a 2-sentence operational readiness assessment and top priority action.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (answer) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {}
    setAssessing(false);
  }

  const MONO = "'JetBrains Mono','Courier New',monospace";
  const TILE = {
    background: "rgba(0,0,0,0.55)", border: "1px solid rgba(41,231,255,0.2)",
    borderRadius: 6, padding: "8px 10px", minWidth: 76, textAlign: "center",
  };
  const PULSE = { animation: "pulse-mascore 1.4s ease-in-out infinite" };

  const tiles = data ? [
    { label: "SCORE",         value: score,              color: gaugeColor, pulse: score < 40 },
    { label: "TASKS",         value: data.counts.tasks,  color: CY    },
    { label: "RISKS",         value: data.counts.risks,  color: AMBER },
    { label: "INVESTIGATIONS",value: data.counts.invest, color: GREEN },
    { label: "SKILLS",        value: data.counts.skills, color: CY    },
  ] : [];

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 132,
          background: open ? CY : "rgba(5,8,13,0.82)",
          border: `1px solid ${CY}`,
          color: open ? "#04060A" : CY,
          fontFamily: MONO, fontSize: 9, letterSpacing: 2,
          padding: "4px 8px", cursor: "pointer", borderRadius: 4,
          boxShadow: `0 0 12px ${CY}${open ? "" : "44"}`,
        }}
      >
        ◈ MASCORE
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
          width: "min(780px,94vw)", zIndex: 3000,
          background: "rgba(4,6,10,0.97)", border: `1px solid ${CY}44`,
          borderRadius: 12, padding: "16px 18px",
          backdropFilter: "blur(14px)",
          boxShadow: `0 0 80px ${CY}22`,
          fontFamily: MONO, color: "#DCEBF5",
          maxHeight: "80vh", overflowY: "auto",
        }}>

          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, textShadow: `0 0 12px ${CY}` }}>
              ◈ MISSION ACTIVATION SCORE
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* gauge + tiles row */}
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            {/* gauge */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              {loading && !data
                ? <div style={{ width: 144, height: 144, display: "flex", alignItems: "center", justifyContent: "center", color: "#6E8AA0", fontSize: 10 }}>…</div>
                : <GaugeRing score={score} color={gaugeColor} />
              }
              <div style={{ marginTop: 4, fontSize: 8, letterSpacing: 2, color: gaugeColor }}>{readiness} READINESS</div>
            </div>

            {/* stat tiles */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, flex: 1 }}>
              {tiles.map(t => (
                <div key={t.label} style={TILE}>
                  <div style={{ fontSize: 7, color: "#6E8AA0", letterSpacing: 2, marginBottom: 3 }}>{t.label}</div>
                  <div style={{ fontSize: t.label === "SCORE" ? 24 : 18, color: t.color, fontWeight: 700, ...(t.pulse ? PULSE : {}) }}>
                    {loading && !data ? "…" : t.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* driver bars */}
          {data && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 8, color: "#6E8AA0", letterSpacing: 2, marginBottom: 8 }}>COMPONENT DRIVERS</div>
              {data.drivers.map(d => (
                <div key={d.label} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 8 }}>
                    <span style={{ color: "#A0BCC8" }}>{d.label}</span>
                    <span style={{ color: d.color }}>{d.value}%</span>
                    <span style={{ color: "#6E8AA0" }}>weight {d.weight}%</span>
                  </div>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
                    <div style={{
                      height: "100%",
                      width: `${d.value}%`,
                      background: d.value >= 75 ? GREEN : d.value >= 40 ? AMBER : RED,
                      borderRadius: 2,
                      transition: "width 0.5s",
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* assess */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={assess} disabled={assessing || !data}
              style={{
                background: assessing ? "rgba(0,0,0,0.4)" : `${CY}22`,
                border: `1px solid ${CY}`, color: CY,
                fontFamily: MONO, fontSize: 8, letterSpacing: 1,
                padding: "4px 12px", cursor: assessing || !data ? "default" : "pointer", borderRadius: 3,
              }}>
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse-mascore {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:.55; transform:scale(1.12); }
        }
      `}</style>
    </>
  );
}
