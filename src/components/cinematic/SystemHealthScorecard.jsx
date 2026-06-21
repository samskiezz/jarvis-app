/**
 * SystemHealthScorecard — F56
 * Composite 0–100 JARVIS health score computed from three real endpoints:
 *   - /v1/jarvis/system/status  → CPU / memory / load  (system sub-score, 40 %)
 *   - /v1/cinematic/brain       → nodes / synapses      (brain sub-score,  30 %)
 *   - /entities/RiskSignal      → active critical/high  (risk sub-score,   30 %)
 * AI anomaly commentary via /v1/jarvis/agent/chat + TTS on demand.
 *
 * Toggle: ⊕ SCORE at left:4548 bottom strip.
 * Event:  jarvis:healthscore-toggle
 * Voice:  "JARVIS, health score" | "system score" | "overall health"
 */
import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GN = "#39FF14";
const AM = "#F5A623";
const RD = "#FF4444";
const DIM = "#4A6070";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const HISTORY_KEY = "jarvis_health_score_history_v1";
const MAX_HISTORY = 20;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function scoreColor(s) {
  if (s >= 80) return GN;
  if (s >= 60) return CY;
  if (s >= 40) return AM;
  return RD;
}

function scoreLabel(s) {
  if (s >= 80) return "NOMINAL";
  if (s >= 60) return "DEGRADED";
  if (s >= 40) return "WARNING";
  return "CRITICAL";
}

function computeSystemScore(status) {
  if (!status) return null;
  const cpu = status.cpu_percent ?? status.cpu ?? null;
  const mem = status.memory_percent ?? status.memory ?? null;
  const load = status.load_avg ?? status.load_average ?? null;
  const scores = [];
  if (cpu !== null) scores.push(clamp(100 - cpu, 0, 100));
  if (mem !== null) scores.push(clamp(100 - mem, 0, 100));
  if (load !== null) {
    const l = Array.isArray(load) ? load[0] : load;
    scores.push(clamp(100 - l * 50, 0, 100));
  }
  if (scores.length === 0) return 70;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function computeBrainScore(brain) {
  if (!brain) return null;
  const nodes = brain.node_count ?? brain.nodes ?? 0;
  const synapses = brain.synapse_count ?? brain.synapses ?? brain.edges ?? 0;
  if (nodes === 0) return 30;
  const nodeScore = clamp((nodes / 500) * 100, 20, 100);
  const synRatio = synapses > 0 ? clamp((synapses / nodes / 2) * 100, 0, 100) : 50;
  return Math.round(nodeScore * 0.6 + synRatio * 0.4);
}

function computeRiskScore(risks) {
  if (!Array.isArray(risks)) return null;
  const critical = risks.filter(
    (r) =>
      String(r.severity ?? r.level ?? "").toLowerCase() === "critical" ||
      Number(r.severity_score ?? r.score ?? 0) >= 90
  ).length;
  const high = risks.filter(
    (r) =>
      String(r.severity ?? r.level ?? "").toLowerCase() === "high" ||
      (Number(r.severity_score ?? r.score ?? 0) >= 70 &&
        Number(r.severity_score ?? r.score ?? 0) < 90)
  ).length;
  let s = 100;
  s -= critical * 12;
  s -= high * 5;
  return clamp(s, 0, 100);
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function appendHistory(score) {
  const prev = loadHistory();
  const next = [
    ...prev,
    { ts: Date.now(), score },
  ].slice(-MAX_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export function isHealthScoreQuery(text) {
  return /health.?score|system.?score|overall.?health|jarvis.?score|score.?card/i.test(text);
}

export async function buildHealthScoreScript() {
  try {
    const [sRes, bRes, rRes] = await Promise.all([
      fetch(`${apiBase()}/v1/jarvis/system/status`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).catch(() => null),
      fetch(`${apiBase()}/v1/cinematic/brain`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).catch(() => null),
      fetch(`${apiBase()}/entities/RiskSignal`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).catch(() => null),
    ]);
    const status = sRes?.ok ? await sRes.json() : null;
    const brain = bRes?.ok ? await bRes.json() : null;
    const riskRaw = rRes?.ok ? await rRes.json() : null;
    const risks = Array.isArray(riskRaw)
      ? riskRaw
      : riskRaw?.items ?? riskRaw?.data ?? [];

    const sys = computeSystemScore(status) ?? 70;
    const brn = computeBrainScore(brain) ?? 70;
    const rsk = computeRiskScore(risks.length > 0 ? risks : null) ?? 70;
    const overall = Math.round(sys * 0.4 + brn * 0.3 + rsk * 0.3);
    const label = scoreLabel(overall);
    return `JARVIS systems are ${label}, sir. Overall health score is ${overall} out of one hundred. System score ${sys}, neural graph score ${brn}, risk profile score ${rsk}. Opening health scorecard now.`;
  } catch {
    return "Unable to compute health score at this time, sir.";
  }
}

export default function SystemHealthScorecard() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scores, setScores] = useState(null);
  const [history, setHistory] = useState(loadHistory);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState("");
  const pollRef = useRef(null);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:healthscore-toggle", onToggle);
    return () => window.removeEventListener("jarvis:healthscore-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchScores();
    pollRef.current = setInterval(fetchScores, 30_000);
    return () => clearInterval(pollRef.current);
  }, [open]);

  async function fetchScores() {
    setLoading(true);
    try {
      const [sRes, bRes, rRes] = await Promise.all([
        fetch(`${apiBase()}/v1/jarvis/system/status`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).catch(() => null),
        fetch(`${apiBase()}/v1/cinematic/brain`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).catch(() => null),
        fetch(`${apiBase()}/entities/RiskSignal`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).catch(() => null),
      ]);

      const status = sRes?.ok ? await sRes.json() : null;
      const brain = bRes?.ok ? await bRes.json() : null;
      const riskRaw = rRes?.ok ? await rRes.json() : null;
      const risks = Array.isArray(riskRaw)
        ? riskRaw
        : riskRaw?.items ?? riskRaw?.data ?? [];

      const sys = computeSystemScore(status) ?? 70;
      const brn = computeBrainScore(brain) ?? 70;
      const rsk = computeRiskScore(risks.length > 0 ? risks : null) ?? 70;
      const overall = Math.round(sys * 0.4 + brn * 0.3 + rsk * 0.3);

      const criticalCount = risks.filter(
        (r) =>
          String(r.severity ?? r.level ?? "").toLowerCase() === "critical" ||
          Number(r.severity_score ?? r.score ?? 0) >= 90
      ).length;

      const raw = {
        overall,
        sys,
        brn,
        rsk,
        cpu: status?.cpu_percent ?? status?.cpu ?? null,
        mem: status?.memory_percent ?? status?.memory ?? null,
        nodes: brain?.node_count ?? brain?.nodes ?? null,
        synapses: brain?.synapse_count ?? brain?.synapses ?? brain?.edges ?? null,
        criticalRisks: criticalCount,
        totalRisks: risks.length,
        fetchedAt: Date.now(),
      };
      setScores(raw);
      const h = appendHistory(overall);
      setHistory(h);
    } catch {}
    setLoading(false);
  }

  async function requestAI() {
    if (!scores || aiLoading) return;
    setAiLoading(true);
    setAiText("");
    const ctx = `Overall health score: ${scores.overall}/100. System: ${scores.sys}, Brain: ${scores.brn}, Risk: ${scores.rsk}. CPU: ${scores.cpu !== null ? scores.cpu + "%" : "n/a"}, Memory: ${scores.mem !== null ? scores.mem + "%" : "n/a"}, Nodes: ${scores.nodes ?? "n/a"}, Synapses: ${scores.synapses ?? "n/a"}, Critical risks: ${scores.criticalRisks}, Total risks: ${scores.totalRisks}.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          message: `Provide a 2-sentence analysis of this JARVIS system health report, highlighting the biggest risk and one recommended action: ${ctx}`,
        }),
      });
      const d = await r.json();
      const text = (d.answer || "Analysis unavailable.").trim();
      setAiText(text);
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text } })
      );
    } catch {
      setAiText("Analysis unavailable — reasoning core offline.");
    }
    setAiLoading(false);
  }

  const score = scores?.overall ?? null;
  const isCritical = score !== null && score < 40;

  const sparkMin = history.length > 0 ? Math.min(...history.map((h) => h.score)) : 0;
  const sparkMax = Math.max(history.length > 0 ? Math.max(...history.map((h) => h.score)) : 100, sparkMin + 1);
  const sparkW = 180;
  const sparkH = 36;

  function sparkPath() {
    if (history.length < 2) return "";
    const pts = history.map((h, i) => {
      const x = (i / (history.length - 1)) * sparkW;
      const y = sparkH - ((h.score - sparkMin) / (sparkMax - sparkMin)) * sparkH;
      return `${x},${y}`;
    });
    return `M${pts.join("L")}`;
  }

  return (
    <>
      {open && (
        <div
          style={{
            position: "fixed",
            left: 160,
            top: 50,
            zIndex: 69,
            width: "min(600px, 92vw)",
            maxHeight: "calc(100vh - 100px)",
            background: "rgba(4,8,14,0.93)",
            border: `1px solid ${CY}33`,
            borderTop: `2px solid ${CY}`,
            borderRadius: 10,
            backdropFilter: "blur(12px)",
            display: "flex",
            flexDirection: "column",
            fontFamily: "'JetBrains Mono',monospace",
            color: "#DCEBF5",
            overflow: "hidden",
            boxShadow: `0 0 60px ${CY}18`,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderBottom: `1px solid ${CY}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              ⊕ SYSTEM HEALTH SCORECARD
            </span>
            {score !== null && (
              <span
                style={{
                  background: scoreColor(score),
                  color: "#030509",
                  borderRadius: 8,
                  fontSize: 8,
                  padding: "1px 6px",
                  fontWeight: 700,
                  animation: isCritical ? "shspulse 1s ease-in-out infinite" : "none",
                }}
              >
                {scoreLabel(score)}
              </span>
            )}
            <div style={{ flex: 1 }} />
            {loading && (
              <span style={{ fontSize: 8, color: DIM, letterSpacing: 1 }}>COMPUTING…</span>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: DIM,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {!scores && loading ? (
              <div style={{ color: DIM, fontSize: 9, textAlign: "center", paddingTop: 32 }}>
                fetching health data…
              </div>
            ) : scores ? (
              <>
                {/* Composite score ring */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 24,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ position: "relative", width: 90, height: 90, flexShrink: 0 }}>
                    <svg width="90" height="90" viewBox="0 0 90 90">
                      <circle cx="45" cy="45" r="38" fill="none" stroke={`${CY}18`} strokeWidth="8" />
                      <circle
                        cx="45"
                        cy="45"
                        r="38"
                        fill="none"
                        stroke={scoreColor(scores.overall)}
                        strokeWidth="8"
                        strokeDasharray={`${(scores.overall / 100) * 238.8} 238.8`}
                        strokeLinecap="round"
                        transform="rotate(-90 45 45)"
                        style={{ filter: `drop-shadow(0 0 6px ${scoreColor(scores.overall)})` }}
                      />
                    </svg>
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 22,
                          fontWeight: 700,
                          color: scoreColor(scores.overall),
                          lineHeight: 1,
                          textShadow: `0 0 12px ${scoreColor(scores.overall)}`,
                        }}
                      >
                        {scores.overall}
                      </span>
                      <span style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>/100</span>
                    </div>
                  </div>

                  {/* Sub-scores */}
                  <div style={{ flex: 1 }}>
                    {[
                      { label: "SYSTEM", score: scores.sys, weight: "40%", detail: scores.cpu !== null ? `CPU ${Math.round(scores.cpu)}%` : "" },
                      { label: "NEURAL GRAPH", score: scores.brn, weight: "30%", detail: scores.nodes !== null ? `${scores.nodes} nodes` : "" },
                      { label: "RISK PROFILE", score: scores.rsk, weight: "30%", detail: `${scores.criticalRisks} critical` },
                    ].map(({ label, score: s, weight, detail }) => (
                      <div key={label} style={{ marginBottom: 8 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 3,
                          }}
                        >
                          <span style={{ fontSize: 8, color: DIM, letterSpacing: 1 }}>
                            {label}
                            <span style={{ color: `${DIM}88`, marginLeft: 4, fontSize: 7 }}>
                              ×{weight}
                            </span>
                          </span>
                          <span style={{ fontSize: 9, color: scoreColor(s), fontWeight: 700 }}>
                            {s}
                            {detail && (
                              <span style={{ fontSize: 7, color: DIM, marginLeft: 6 }}>
                                {detail}
                              </span>
                            )}
                          </span>
                        </div>
                        <div
                          style={{
                            height: 4,
                            borderRadius: 2,
                            background: `${CY}18`,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${s}%`,
                              height: "100%",
                              background: scoreColor(s),
                              borderRadius: 2,
                              boxShadow: `0 0 6px ${scoreColor(s)}`,
                              transition: "width 0.6s ease",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Metric tiles */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 8,
                    marginBottom: 16,
                  }}
                >
                  {[
                    { label: "CPU", val: scores.cpu !== null ? `${Math.round(scores.cpu)}%` : "—", accent: scores.cpu > 80 ? RD : scores.cpu > 50 ? AM : GN },
                    { label: "MEMORY", val: scores.mem !== null ? `${Math.round(scores.mem)}%` : "—", accent: scores.mem > 85 ? RD : scores.mem > 60 ? AM : GN },
                    { label: "NODES", val: scores.nodes !== null ? String(scores.nodes) : "—", accent: CY },
                    { label: "CRITICAL", val: String(scores.criticalRisks), accent: scores.criticalRisks > 0 ? RD : GN },
                  ].map(({ label, val, accent }) => (
                    <div
                      key={label}
                      style={{
                        background: `${accent}0A`,
                        border: `1px solid ${accent}33`,
                        borderRadius: 6,
                        padding: "8px 10px",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 700, color: accent }}>{val}</div>
                      <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Score sparkline */}
                {history.length > 1 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 8, color: DIM, letterSpacing: 1, marginBottom: 6 }}>
                      SCORE HISTORY ({history.length} samples)
                    </div>
                    <svg
                      width={sparkW}
                      height={sparkH}
                      style={{ display: "block", overflow: "visible" }}
                    >
                      <path
                        d={sparkPath()}
                        fill="none"
                        stroke={scoreColor(scores.overall)}
                        strokeWidth="1.5"
                        style={{ filter: `drop-shadow(0 0 3px ${scoreColor(scores.overall)})` }}
                      />
                      {history.length > 0 && (() => {
                        const last = history[history.length - 1];
                        const x = sparkW;
                        const y = sparkH - ((last.score - sparkMin) / (sparkMax - sparkMin)) * sparkH;
                        return (
                          <circle
                            cx={x}
                            cy={y}
                            r="3"
                            fill={scoreColor(scores.overall)}
                          />
                        );
                      })()}
                    </svg>
                  </div>
                )}

                {/* AI commentary */}
                <div style={{ borderTop: `1px solid ${CY}11`, paddingTop: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 9, color: CY, letterSpacing: 1 }}>◆ AI ANALYSIS</span>
                    <button
                      onClick={requestAI}
                      disabled={aiLoading}
                      style={{
                        background: `${CY}15`,
                        border: `1px solid ${CY}44`,
                        color: CY,
                        fontSize: 7,
                        padding: "2px 8px",
                        borderRadius: 4,
                        cursor: aiLoading ? "not-allowed" : "pointer",
                        letterSpacing: 1,
                        fontFamily: "inherit",
                        opacity: aiLoading ? 0.5 : 1,
                      }}
                    >
                      {aiLoading ? "CONSULTING…" : "ASK JARVIS"}
                    </button>
                  </div>
                  {aiText ? (
                    <div style={{ fontSize: 9, color: "#DCEBF5", lineHeight: 1.7 }}>{aiText}</div>
                  ) : (
                    <div style={{ fontSize: 8, color: DIM, fontStyle: "italic" }}>
                      Click ASK JARVIS for an AI anomaly assessment.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ color: DIM, fontSize: 9, textAlign: "center", paddingTop: 32 }}>
                No data yet. Waiting for refresh…
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "4px 12px",
              borderTop: `1px solid ${CY}11`,
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 7, color: DIM, letterSpacing: 0.5 }}>
              /v1/jarvis/system/status · /v1/cinematic/brain · /entities/RiskSignal · /v1/jarvis/agent/chat
            </span>
          </div>
        </div>
      )}

      {/* Toggle — left:4548 bottom strip */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="System Health Scorecard"
        style={{
          position: "fixed",
          left: 4548,
          bottom: 18,
          zIndex: 68,
          background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#030509" : isCritical ? RD : CY,
          border: `1px solid ${isCritical ? RD : CY}`,
          borderRadius: 6,
          padding: "3px 8px",
          fontSize: 8,
          fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1.5,
          cursor: "pointer",
          backdropFilter: "blur(6px)",
          boxShadow: open
            ? `0 0 12px ${CY}`
            : isCritical
            ? `0 0 8px ${RD}66`
            : "none",
          animation: isCritical && !open ? "shspulse 1.5s ease-in-out infinite" : "none",
        }}
      >
        ⊕ SCORE
        {score !== null && (
          <span
            style={{
              marginLeft: 4,
              background: scoreColor(score),
              color: "#030509",
              borderRadius: 8,
              fontSize: 7,
              padding: "0 4px",
              fontWeight: 700,
            }}
          >
            {score}
          </span>
        )}
      </button>

      <style>{`
        @keyframes shspulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(1.05); }
        }
      `}</style>
    </>
  );
}
