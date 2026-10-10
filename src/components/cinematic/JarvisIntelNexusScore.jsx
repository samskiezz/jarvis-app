/**
 * F175 — JARVIS Intelligence Nexus Score (JINSCORE)
 *
 * Parallel-fetches six data sources to compute a composite Intelligence Nexus Score:
 *   /v1/jarvis/system/status  → SYSTEM_HEALTH dimension (service uptime)
 *   /v1/cinematic/brain       → BRAIN_DEPTH dimension (nodes + synapses)
 *   /entities/RiskSignal      → THREAT_AWARENESS dimension (active risk signals)
 *   /v1/aip/skill             → SKILL_COVERAGE dimension (enabled skills)
 *   /v1/investigations        → ACTIVE_CASES dimension (open investigations)
 *   /knowledge/               → KNOWLEDGE_BASE dimension (article count)
 *
 * Scores each dimension 0–100, then computes a composite JINS (JARVIS Intelligence
 * Nexus Score). Readiness bands:
 *   PEAK      ≥ 85 — full operational intelligence
 *   OPTIMAL   ≥ 65 — strong coverage with minor gaps
 *   ADEQUATE  ≥ 40 — usable but gaps present
 *   DEGRADED   < 40 — critical intelligence shortfall
 *
 * Layout: central JINS ring + hex radar pentagon + six dimension stat tiles.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 60-s auto-refresh. jarvis:jinscore-toggle event.
 *
 * Voice triggers:
 *   "jinscore / intelligence nexus / jins / jarvis score / system intelligence score /
 *    nexus score / intelligence score / jarvis intelligence"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_040_360;
const Z_INDEX  = 236;
const POLL_MS  = 60_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const JINSCORE_RE = /\b(jinscore|intelligence[\s-]nexus|jins\b|jarvis[\s-]score|system[\s-]intelligence[\s-]score|nexus[\s-]score|intelligence[\s-]score|jarvis[\s-]intelligence)\b/i;

const CY   = "#00CFFF";
const GR   = "#22C55E";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const PU   = "#A855F7";
const BL   = "#3B82F6";
const OR   = "#F97316";
const BG   = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT = "'JetBrains Mono',monospace";

const DIMS = [
  { key: "system",    label: "SYSTEM HEALTH",    color: GR,  icon: "⬡" },
  { key: "brain",     label: "BRAIN DEPTH",       color: CY,  icon: "◈" },
  { key: "threat",    label: "THREAT AWARENESS",  color: RD,  icon: "⚠" },
  { key: "skill",     label: "SKILL COVERAGE",    color: PU,  icon: "◎" },
  { key: "cases",     label: "ACTIVE CASES",      color: BL,  icon: "⬢" },
  { key: "knowledge", label: "KNOWLEDGE BASE",    color: OR,  icon: "◉" },
];

function bandInfo(score) {
  if (score >= 85) return { label: "PEAK",     color: GR };
  if (score >= 65) return { label: "OPTIMAL",  color: CY };
  if (score >= 40) return { label: "ADEQUATE", color: AM };
  return               { label: "DEGRADED",    color: RD };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function scoreFromRaw(raw) {
  const sys     = raw.system  || {};
  const brain   = raw.brain   || {};
  const risks   = raw.risks   || [];
  const skills  = raw.skills  || [];
  const cases   = raw.cases   || [];
  const kb      = raw.kb      || [];

  // SYSTEM_HEALTH — % services that are "online" / "healthy" / "ok"
  const services = Object.values(sys?.services || {});
  const sysScore = services.length
    ? clamp(Math.round((services.filter(s =>
        /online|healthy|ok|running|up/i.test(String(s?.status || s))
      ).length / services.length) * 100), 5, 100)
    : 50;

  // BRAIN_DEPTH — map node count logarithmically 0…10000+ → 0…100
  const nodes = brain?.node_count || brain?.total_nodes || 0;
  const brainScore = clamp(Math.round(Math.log10(Math.max(nodes, 1)) / Math.log10(10000) * 100), 5, 100);

  // THREAT_AWARENESS — active risk signals present → score by count (20 = 100)
  const activeRisks = risks.filter(r => /active|open|new/i.test(String(r?.status || ""))).length || risks.length;
  const threatScore = clamp(Math.round(Math.min(activeRisks / 20, 1) * 100), 5, 100);

  // SKILL_COVERAGE — % of fetched skills that are enabled
  const enabledSkills = skills.filter(s => s?.enabled !== false).length;
  const skillScore = skills.length
    ? clamp(Math.round((enabledSkills / skills.length) * 100), 5, 100)
    : 20;

  // ACTIVE_CASES — open investigations, count → score (10 = 100)
  const openCases = cases.filter(c => /open|active|ongoing/i.test(String(c?.status || ""))).length || cases.length;
  const caseScore = clamp(Math.round(Math.min(openCases / 10, 1) * 100), 5, 100);

  // KNOWLEDGE_BASE — article count → score (100 articles = 100)
  const kbScore = clamp(Math.round(Math.min(kb.length / 100, 1) * 100), 5, 100);

  const dims = {
    system:    sysScore,
    brain:     brainScore,
    threat:    threatScore,
    skill:     skillScore,
    cases:     caseScore,
    knowledge: kbScore,
  };
  const composite = Math.round(
    Object.values(dims).reduce((a, b) => a + b, 0) / Object.keys(dims).length
  );
  return { dims, composite };
}

// Simplified hexagon radar as inline SVG (6 axes, regular hexagon)
function HexRadar({ scores, size = 180 }) {
  const cx = size / 2, cy = size / 2, r = size * 0.4;
  const keys = DIMS.map(d => d.key);
  const N = keys.length;
  const pts = (val) =>
    keys.map((_, i) => {
      const angle = (i * 2 * Math.PI) / N - Math.PI / 2;
      const frac  = clamp(val[DIMS[i].key] / 100, 0, 1);
      return [cx + r * frac * Math.cos(angle), cy + r * frac * Math.sin(angle)];
    });

  const bg100 = keys.map((_, i) => {
    const angle = (i * 2 * Math.PI) / N - Math.PI / 2;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });

  const toPath = (arr) => arr.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";

  const dataPts = pts(scores);

  return (
    <svg width={size} height={size} style={{ overflow: "visible" }}>
      {/* grid rings */}
      {[0.25, 0.5, 0.75, 1].map(frac => {
        const ring = keys.map((_, i) => {
          const angle = (i * 2 * Math.PI) / N - Math.PI / 2;
          return [cx + r * frac * Math.cos(angle), cy + r * frac * Math.sin(angle)];
        });
        return <path key={frac} d={toPath(ring)} fill="none" stroke={`rgba(0,207,255,${frac === 1 ? 0.3 : 0.1})`} strokeWidth="1" />;
      })}
      {/* axis lines */}
      {bg100.map(([x, y], i) => (
        <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(0,207,255,0.15)" strokeWidth="1" />
      ))}
      {/* data area */}
      <path d={toPath(dataPts)} fill="rgba(0,207,255,0.12)" stroke={CY} strokeWidth="1.5" />
      {/* data points */}
      {dataPts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill={DIMS[i].color} />
      ))}
      {/* dimension labels */}
      {bg100.map(([x, y], i) => {
        const dx = x - cx, dy = y - cy;
        const lx = cx + (r + 22) * Math.cos((i * 2 * Math.PI) / N - Math.PI / 2);
        const ly = cy + (r + 22) * Math.sin((i * 2 * Math.PI) / N - Math.PI / 2);
        return (
          <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
            style={{ fontSize: 8, fill: DIMS[i].color, fontFamily: FONT, letterSpacing: 1 }}>
            {DIMS[i].icon}
          </text>
        );
      })}
    </svg>
  );
}

// Circular progress ring
function ScoreRing({ score, band, size = 120 }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (score / 100);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,207,255,0.12)" strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={band.color}
        strokeWidth={8} strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`}
        strokeLinecap="round" style={{ transition: "stroke-dasharray 0.6s ease" }} />
      <text x={size / 2} y={size / 2 - 6} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 26, fontWeight: 700, fill: band.color, fontFamily: FONT,
          transform: "rotate(90deg)", transformOrigin: `${size/2}px ${size/2}px`,
          filter: `drop-shadow(0 0 8px ${band.color})` }}>
        {score}
      </text>
      <text x={size / 2} y={size / 2 + 18} textAnchor="middle"
        style={{ fontSize: 9, fill: band.color, fontFamily: FONT, letterSpacing: 2,
          transform: "rotate(90deg)", transformOrigin: `${size/2}px ${size/2}px` }}>
        {band.label}
      </text>
    </svg>
  );
}

export async function buildJinscoreScript() {
  const base = apiBase();
  const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  const safe = async (url) => { try { const r = await fetch(url, { headers: hdrs }); return r.ok ? r.json() : {}; } catch { return {}; } };
  const [sys, brain, risks, skills, cases, kb] = await Promise.all([
    safe(`${base}/v1/jarvis/system/status`),
    safe(`${base}/v1/cinematic/brain`),
    safe(`${base}/entities/RiskSignal`),
    safe(`${base}/v1/aip/skill`),
    safe(`${base}/v1/investigations`),
    safe(`${base}/knowledge/`),
  ]);
  const raw = {
    system:  sys,
    brain:   brain,
    risks:   Array.isArray(risks) ? risks : (risks?.items || risks?.data || []),
    skills:  Array.isArray(skills) ? skills : (skills?.items || skills?.data || []),
    cases:   Array.isArray(cases) ? cases : (cases?.items || cases?.data || []),
    kb:      Array.isArray(kb) ? kb : (kb?.items || kb?.data || []),
  };
  const { dims, composite } = scoreFromRaw(raw);
  const band = bandInfo(composite);
  const weakest = DIMS.reduce((a, b) => dims[a.key] < dims[b.key] ? a : b);
  return `JARVIS Intelligence Nexus Score stands at ${composite} — ${band.label}. Weakest dimension is ${weakest.label} at ${dims[weakest.key]} points; recommend prioritising ${weakest.label.toLowerCase()} to advance readiness, sir.`;
}

export default function JarvisIntelNexusScore() {
  const [open,    setOpen]    = useState(false);
  const [scores,  setScores]  = useState({ dims: { system: 0, brain: 0, threat: 0, skill: 0, cases: 0, knowledge: 0 }, composite: 0 });
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [brief,   setBrief]   = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const safe = async (url) => { try { const r = await fetch(url, { headers: hdrs }); return r.ok ? r.json() : {}; } catch { return {}; } };
      const [sys, brain, risks, skills, cases, kb] = await Promise.all([
        safe(`${base}/v1/jarvis/system/status`),
        safe(`${base}/v1/cinematic/brain`),
        safe(`${base}/entities/RiskSignal`),
        safe(`${base}/v1/aip/skill`),
        safe(`${base}/v1/investigations`),
        safe(`${base}/knowledge/`),
      ]);
      const raw = {
        system:  sys,
        brain:   brain,
        risks:   Array.isArray(risks) ? risks : (risks?.items || risks?.data || []),
        skills:  Array.isArray(skills) ? skills : (skills?.items || skills?.data || []),
        cases:   Array.isArray(cases) ? cases : (cases?.items || cases?.data || []),
        kb:      Array.isArray(kb) ? kb : (kb?.items || kb?.data || []),
      };
      setScores(scoreFromRaw(raw));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:jinscore-toggle", onToggle);
    return () => window.removeEventListener("jarvis:jinscore-toggle", onToggle);
  }, []);

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const script = await buildJinscoreScript();
      setBrief(script);
      // speak via TTS
      const base = apiBase();
      const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      try {
        const r = await fetch(`${base}/v1/voice/tts`, { method: "POST", headers: hdrs, body: JSON.stringify({ text: script }) });
        if (r.ok) {
          const blob = await r.blob();
          new Audio(URL.createObjectURL(blob)).play();
        }
      } catch { /* TTS optional */ }
    } catch { setBrief("Unable to compute intelligence nexus score at this time, sir."); }
    finally { setAssessing(false); }
  }

  const { dims, composite } = scores;
  const band = bandInfo(composite);

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? CY : "rgba(5,8,13,0.82)", color: open ? "#04060A" : CY,
          border: `1px solid ${CY}66`, borderRadius: 6, padding: "4px 10px",
          fontFamily: FONT, fontSize: 11, letterSpacing: 2, cursor: "pointer",
          boxShadow: open ? `0 0 18px ${CY}88` : "none", whiteSpace: "nowrap",
        }}>
        ◈ JINSCORE
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 54, zIndex: Z_INDEX + 1,
          width: "min(680px,94vw)", background: BG,
          border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 18px",
          fontFamily: FONT, color: "#DCEBF5", backdropFilter: "blur(10px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ color: CY, fontSize: 12, letterSpacing: 3, fontWeight: 700,
              textShadow: `0 0 12px ${CY}` }}>◈ JARVIS INTELLIGENCE NEXUS SCORE</span>
            {loading && <span style={{ fontSize: 10, color: CY, marginLeft: "auto", letterSpacing: 1 }}>COMPUTING…</span>}
            <button onClick={() => setOpen(false)} style={{
              marginLeft: "auto", background: "none", border: "none", color: "#6E8AA0",
              cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
          </div>

          {/* main body: ring + radar side by side */}
          <div style={{ display: "flex", gap: 24, alignItems: "center", marginBottom: 16 }}>
            {/* JINS ring */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <ScoreRing score={composite} band={band} size={130} />
              <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 2 }}>JINS</span>
            </div>

            {/* hex radar */}
            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <HexRadar scores={dims} size={190} />
            </div>
          </div>

          {/* dimension tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
            {DIMS.map(d => (
              <div key={d.key} style={{
                background: "rgba(0,0,0,0.3)", border: `1px solid ${d.color}33`,
                borderRadius: 8, padding: "8px 10px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{d.label}</span>
                  <span style={{ fontSize: 12, color: d.color }}>{d.icon}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: d.color, marginTop: 2,
                  textShadow: `0 0 10px ${d.color}` }}>{dims[d.key]}</div>
                {/* mini bar */}
                <div style={{ marginTop: 4, height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
                  <div style={{ height: "100%", width: `${dims[d.key]}%`, background: d.color,
                    borderRadius: 2, transition: "width 0.5s ease" }} />
                </div>
              </div>
            ))}
          </div>

          {/* assess button + brief */}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <button onClick={assess} disabled={assessing} style={{
              background: assessing ? "rgba(0,207,255,0.15)" : "rgba(0,207,255,0.1)",
              border: `1px solid ${CY}55`, borderRadius: 6, padding: "6px 14px",
              color: CY, fontFamily: FONT, fontSize: 11, letterSpacing: 1, cursor: assessing ? "default" : "pointer",
              whiteSpace: "nowrap", flexShrink: 0,
            }}>{assessing ? "ASSESSING…" : "▶ ASSESS NEXUS"}</button>
            {brief && (
              <div style={{ fontSize: 11, color: "#AECCD8", lineHeight: 1.6, paddingTop: 4 }}>{brief}</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
