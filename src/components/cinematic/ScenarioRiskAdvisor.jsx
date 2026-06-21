/**
 * ScenarioRiskAdvisor — F61.
 *
 * Parallel-fetches /entities/RiskSignal + /v1/scenario/list; keyword-correlates
 * active risk signals against available scenarios to surface the most relevant
 * mitigation simulations. Clicking a recommendation fires /v1/scenario/{id}/run
 * and shows the outcome inline.  AI 2-sentence advisory via /v1/jarvis/agent/chat
 * + TTS via jarvis:speak-dossier on demand.
 *
 * Intent: "JARVIS, mitigation" / "scenario advisor" / "which scenarios" / "risk advisor"
 *   → jarvis:srmadvisor-toggle event + TTS brief via buildScenarioRiskAdvisorScript()
 *
 * Toggle: ◈ SRMADV at left:5068, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const RED = "#FF3D5A";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const VIOLET = "#A78BFA";
const BTN_LEFT = 5068;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isScenarioRiskAdvisorQuery(q) {
  return /mitigation advisor|scenario advisor|which scenario|risk advisor|mitigate risk|scenario risk|srmadv/i.test(
    q || ""
  );
}

export async function buildScenarioRiskAdvisorScript() {
  try {
    const [rr, sr] = await Promise.all([
      fetch(`${apiBase()}/entities/RiskSignal`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/scenario/list`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const risks = normaliseArray(rr.ok ? await rr.json() : []);
    const scenarios = normaliseArray(sr.ok ? await sr.json() : []);
    const active = risks.filter(
      (r) => (r.status || r.state || "active") !== "resolved"
    );
    const critCount = active.filter(
      (r) => (r.severity || r.sev || 0) >= 90
    ).length;
    window.dispatchEvent(new CustomEvent("jarvis:srmadvisor-toggle"));
    if (!active.length)
      return "No active risk signals detected, sir. Threat board is clear.";
    return `Scenario-risk advisor online, sir. ${active.length} active risk signal${active.length !== 1 ? "s" : ""} cross-referenced against ${scenarios.length} available scenario${scenarios.length !== 1 ? "s" : ""}. ${critCount > 0 ? `${critCount} critical signal${critCount !== 1 ? "s" : ""} flagged.` : ""} Select a recommendation to run a mitigation scenario.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:srmadvisor-toggle"));
    return "Scenario risk advisor panel open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ScenarioRiskAdvisor() {
  const [visible, setVisible] = useState(false);
  const [risks, setRisks] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [runResults, setRunResults] = useState({});
  const [running, setRunning] = useState({});
  const [filter, setFilter] = useState("all");
  const pollRef = useRef(null);

  const critBadge = recommendations.filter((r) => r.riskSev >= 90).length;

  const fetchData = useCallback(async () => {
    try {
      const [rr, sr] = await Promise.all([
        fetch(`${apiBase()}/entities/RiskSignal`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/v1/scenario/list`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      const rawRisks = normaliseArray(rr.ok ? await rr.json() : []);
      const rawScenarios = normaliseArray(sr.ok ? await sr.json() : []);
      setRisks(rawRisks);
      setScenarios(rawScenarios);
      setRecommendations(correlate(rawRisks, rawScenarios));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:srmadvisor-toggle", onToggle);
    return () => window.removeEventListener("jarvis:srmadvisor-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, 60_000);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function getAiAdvisory() {
    if (!recommendations.length) return;
    setAiLoading(true);
    setAiText("");
    const top = recommendations.slice(0, 5);
    const prompt = `As JARVIS, provide a 2-sentence advisory on which mitigation scenarios are most critical to run right now, given these risk-scenario pairs: ${top.map((r) => `"${r.riskName}" → run scenario "${r.scenarioName}"`).join("; ")}. Be direct and urgent.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiText(answer);
      if (answer)
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
        );
    } catch (_) {
      setAiText("Unable to reach reasoning core.");
    } finally {
      setAiLoading(false);
    }
  }

  async function runScenario(rec) {
    const id = rec.scenarioId;
    if (!id || running[id]) return;
    setRunning((p) => ({ ...p, [id]: true }));
    try {
      const r = await fetch(`${apiBase()}/v1/scenario/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      const outcome = d.outcome || d.result || d.status || "Scenario executed.";
      setRunResults((p) => ({ ...p, [id]: outcome }));
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: `Scenario ${rec.scenarioName} complete. ${outcome}` },
        })
      );
    } catch (_) {
      setRunResults((p) => ({ ...p, [id]: "Execution failed — check backend." }));
    } finally {
      setRunning((p) => ({ ...p, [id]: false }));
    }
  }

  const filtered = recommendations.filter((r) => {
    if (filter === "critical") return r.riskSev >= 90;
    if (filter === "high") return r.riskSev >= 70;
    return true;
  });

  const activeCount = risks.filter(
    (r) => (r.status || r.state || "active") !== "resolved"
  ).length;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Scenario-Risk Mitigation Advisor"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 65,
          height: 26,
          padding: "0 8px",
          background: visible ? `${VIOLET}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? VIOLET : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? VIOLET : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {critBadge > 0 && !visible && (
          <span
            style={{
              display: "inline-block",
              marginRight: 5,
              background: RED,
              color: "#fff",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
            }}
          >
            {critBadge}
          </span>
        )}
        ◈ SRMADV
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 560),
            zIndex: 65,
            width: 540,
            maxHeight: "72vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.95)",
            border: `1px solid ${VIOLET}44`,
            borderTop: `2px solid ${VIOLET}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${VIOLET}18, 0 8px 32px rgba(0,0,0,0.7)`,
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderBottom: `1px solid ${VIOLET}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: VIOLET, fontSize: 13 }}>◈</span>
            <span
              style={{
                color: VIOLET,
                fontSize: 11,
                letterSpacing: 2,
                fontWeight: 700,
              }}
            >
              SCENARIO-RISK ADVISOR
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>
                loading…
              </span>
            )}
            <button
              onClick={() => setVisible(false)}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: "none",
                color: "#6E8AA0",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "8px 14px",
              borderBottom: `1px solid #1A2A3A`,
              flexShrink: 0,
            }}
          >
            {[
              { label: "ACTIVE RISKS", val: activeCount, col: critBadge > 0 ? RED : CY },
              { label: "SCENARIOS", val: scenarios.length, col: VIOLET },
              { label: "MATCHES", val: recommendations.length, col: AMBER },
              { label: "CRITICAL", val: critBadge, col: critBadge > 0 ? RED : "#4E6A7A" },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid #1A2A3A`,
                  borderRadius: 6,
                  padding: "5px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, color: t.col, fontWeight: 700 }}>
                  {t.val}
                </div>
                <div style={{ fontSize: 8, color: "#4E6A7A", letterSpacing: 1, marginTop: 1 }}>
                  {t.label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + AI button */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "8px 14px",
              borderBottom: `1px solid #1A2A3A`,
              flexShrink: 0,
              alignItems: "center",
            }}
          >
            {["all", "critical", "high"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  border: `1px solid ${filter === f ? VIOLET : "#2A3A4A"}`,
                  background: filter === f ? `${VIOLET}22` : "transparent",
                  color: filter === f ? VIOLET : "#6E8AA0",
                  fontSize: 10,
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textTransform: "uppercase",
                }}
              >
                {f}
              </button>
            ))}
            <button
              onClick={getAiAdvisory}
              disabled={aiLoading || !recommendations.length}
              style={{
                marginLeft: "auto",
                padding: "2px 10px",
                borderRadius: 4,
                border: `1px solid ${VIOLET}66`,
                background: aiLoading ? `${VIOLET}22` : "transparent",
                color: VIOLET,
                fontSize: 10,
                letterSpacing: 1,
                cursor: aiLoading ? "default" : "pointer",
                fontFamily: "inherit",
                opacity: recommendations.length ? 1 : 0.4,
              }}
            >
              {aiLoading ? "consulting…" : "▶ AI ADVISORY"}
            </button>
          </div>

          {/* AI advisory box */}
          {aiText && (
            <div
              style={{
                padding: "8px 14px",
                borderBottom: `1px solid ${VIOLET}18`,
                background: `${VIOLET}09`,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: VIOLET,
                  letterSpacing: 2,
                  marginBottom: 4,
                  fontWeight: 700,
                }}
              >
                JARVIS ADVISORY
              </div>
              <div style={{ fontSize: 11, color: "#DCEBF5", lineHeight: 1.5 }}>
                {aiText}
              </div>
            </div>
          )}

          {/* Recommendation list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {!loading && filtered.length === 0 && (
              <div style={{ padding: 18, color: "#6E8AA0", fontSize: 11 }}>
                {recommendations.length === 0
                  ? "No scenario-risk correlations found."
                  : "No matches for current filter."}
              </div>
            )}
            {filtered.map((rec, i) => {
              const accent =
                rec.riskSev >= 90 ? RED : rec.riskSev >= 70 ? AMBER : CY;
              const sevLabel =
                rec.riskSev >= 90
                  ? "CRITICAL"
                  : rec.riskSev >= 70
                  ? "HIGH"
                  : rec.riskSev >= 40
                  ? "MEDIUM"
                  : "LOW";
              const sid = rec.scenarioId;
              const result = runResults[sid];
              const isRunning = running[sid];
              return (
                <div
                  key={`${rec.riskId}-${sid}-${i}`}
                  style={{
                    padding: "10px 14px",
                    borderBottom: `1px solid #0E1A26`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    {/* Severity dot */}
                    <span
                      style={{
                        marginTop: 3,
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: accent,
                        boxShadow:
                          rec.riskSev >= 90
                            ? `0 0 6px ${RED}`
                            : "none",
                        flexShrink: 0,
                        animation:
                          rec.riskSev >= 90
                            ? "srapulse 1.4s ease-in-out infinite"
                            : "none",
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      {/* Risk signal */}
                      <div style={{ marginBottom: 3 }}>
                        <span
                          style={{
                            fontSize: 9,
                            letterSpacing: 1,
                            color: accent,
                            marginRight: 6,
                            fontWeight: 700,
                          }}
                        >
                          {sevLabel}
                        </span>
                        <span style={{ fontSize: 11, color: "#DCEBF5" }}>
                          {rec.riskName}
                        </span>
                      </div>
                      {/* Matched scenario */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontSize: 10, color: "#4E6A7A" }}>
                          → scenario:
                        </span>
                        <span style={{ fontSize: 11, color: VIOLET }}>
                          {rec.scenarioName}
                        </span>
                        <span
                          style={{
                            fontSize: 9,
                            color: "#3A5A6A",
                            letterSpacing: 1,
                          }}
                        >
                          [{rec.matchScore} keyword match{rec.matchScore !== 1 ? "es" : ""}]
                        </span>
                      </div>
                    </div>
                    {/* Run button */}
                    <button
                      onClick={() => runScenario(rec)}
                      disabled={isRunning || !!result}
                      style={{
                        flexShrink: 0,
                        padding: "3px 10px",
                        borderRadius: 4,
                        border: `1px solid ${result ? GREEN + "66" : VIOLET + "66"}`,
                        background: result
                          ? `${GREEN}12`
                          : isRunning
                          ? `${VIOLET}22`
                          : "transparent",
                        color: result ? GREEN : VIOLET,
                        fontSize: 9,
                        letterSpacing: 1,
                        cursor: isRunning || result ? "default" : "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {result ? "✓ DONE" : isRunning ? "RUNNING…" : "▶ RUN"}
                    </button>
                  </div>
                  {/* Run outcome */}
                  {result && (
                    <div
                      style={{
                        marginTop: 4,
                        padding: "5px 8px",
                        background: `${GREEN}0A`,
                        border: `1px solid ${GREEN}22`,
                        borderRadius: 4,
                        fontSize: 10,
                        color: "#A0C8B0",
                        lineHeight: 1.4,
                      }}
                    >
                      {result}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "5px 14px",
              borderTop: `1px solid ${VIOLET}18`,
              fontSize: 10,
              color: "#4E6A7A",
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            /entities/RiskSignal + /v1/scenario/list · 60s auto-refresh · click ▶ RUN to execute
          </div>
        </div>
      )}
      <style>{`@keyframes srapulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.6)}}`}</style>
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of ["items", "results", "data", "signals", "scenarios", "records"]) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

function keywords(str) {
  if (!str) return [];
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function correlate(risks, scenarios) {
  if (!risks.length || !scenarios.length) return [];

  const results = [];

  const active = risks.filter(
    (r) => (r.status || r.state || "active").toLowerCase() !== "resolved"
  );

  for (const risk of active) {
    const rName = risk.name || risk.title || risk.signal || risk.description || "Unknown";
    const rSev = Number(risk.severity ?? risk.sev ?? risk.priority ?? 0);
    const rTags = [
      rName,
      risk.type || "",
      risk.category || "",
      ...(Array.isArray(risk.tags) ? risk.tags : []),
    ].join(" ");
    const rKws = keywords(rTags);

    let best = null;
    let bestScore = 0;

    for (const sc of scenarios) {
      const scName = sc.name || sc.title || sc.scenario || "Unknown";
      const scTags = [
        scName,
        sc.description || "",
        sc.type || "",
        sc.category || "",
      ].join(" ");
      const scKws = keywords(scTags);

      const score = rKws.filter((w) => scKws.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        best = sc;
      }
    }

    if (best && bestScore >= 1) {
      results.push({
        riskId: risk.id || risk._id || rName,
        riskName: rName,
        riskSev: rSev,
        scenarioId: best.id || best._id || best.name,
        scenarioName: best.name || best.title || "Unknown",
        matchScore: bestScore,
      });
    }
  }

  results.sort((a, b) => b.riskSev - a.riskSev || b.matchScore - a.matchScore);
  return results;
}
