/**
 * InvestmentScenarioPlanner — F75.
 *
 * Parallel-fetches /entities/Investment + /v1/scenario/list.
 * Keyword-correlates each investment (name/type/description/tags) against
 * available scenarios to surface applicable hedging or mitigation scenarios.
 *
 * Stat tiles: investments / scenarios / matched / unmatched
 * Filter tabs: ALL / MATCHED / UNMATCHED
 * List: investments with matched scenario chips expanded on click.
 * Click ▶ RUN on a matched scenario → POST /v1/scenario/{id}/run + inline outcome.
 * Click ▶ PLAN on any investment → /v1/jarvis/agent/chat AI 2-sentence advisory
 *   + TTS via jarvis:speak-dossier.
 * 60s auto-refresh.
 *
 * Intent: "investment scenario" / "scenario plan" / "hedge scenario" /
 *         "investment plan" / "inscenp" / "scenario for investment" /
 *         "investment risk scenario" / "portfolio scenario"
 *   → jarvis:invscplan-toggle + TTS brief via buildInvScenPlanScript()
 *
 * Toggle: ◈ INSCENP at left:6524, zIndex 66.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GREEN = "#00c878";
const RED = "#FF3D5A";
const AMBER = "#F5A623";
const PURPLE = "#A78BFA";
const BTN_LEFT = 6524;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalisers ─────────────────────────────────────────────────────────────

function toArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && Array.isArray(raw.investments)) return raw.investments;
  if (raw && Array.isArray(raw.scenarios)) return raw.scenarios;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseInvestments(raw) {
  return toArray(raw).map((inv) => ({
    id: inv.id || inv.investment_id || String(Math.random()),
    name: inv.name || inv.asset || inv.ticker || inv.symbol || inv.title || "Unnamed Investment",
    type: inv.type || inv.asset_type || inv.category || inv.investment_type || "",
    description: inv.description || inv.summary || inv.notes || "",
    value: Number(inv.current_value ?? inv.value ?? inv.market_value ?? inv.amount ?? 0),
    tags: [...(inv.tags || []), ...(inv.keywords || [])].map(String),
    status: (inv.status || "active").toLowerCase(),
  }));
}

function normaliseScenarios(raw) {
  return toArray(raw).map((sc) => ({
    id: sc.id || sc.scenario_id || String(Math.random()),
    name: sc.name || sc.title || sc.scenario_name || "Unnamed Scenario",
    description: sc.description || sc.summary || sc.details || "",
    type: sc.type || sc.category || sc.scenario_type || "",
    severity: Number(sc.severity ?? sc.impact ?? sc.risk_level ?? 0),
    tags: [...(sc.tags || []), ...(sc.keywords || [])].map(String),
  }));
}

// ─── correlation ─────────────────────────────────────────────────────────────

function keywords(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function scenarioMatchScore(inv, scenario) {
  const invWords = [
    ...keywords(inv.name),
    ...keywords(inv.type),
    ...keywords(inv.description),
    ...inv.tags.flatMap(keywords),
  ];
  const scText = `${scenario.name} ${scenario.description} ${scenario.type}`.toLowerCase();
  return invWords.reduce((acc, w) => acc + (scText.includes(w) ? 1 : 0), 0);
}

function correlate(investments, scenarios) {
  return investments.map((inv) => {
    const matched = scenarios
      .map((sc) => ({ ...sc, _score: scenarioMatchScore(inv, sc) }))
      .filter((sc) => sc._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);
    return { ...inv, matched, hasMatch: matched.length > 0 };
  });
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const INVSCENP_RE =
  /investment.{0,14}scenario|scenario.{0,14}invest|hedge.{0,10}scenario|portfolio.{0,10}scenario|scenario\s+plan|investment\s+plan\b|inscenp\b|scenario\s+for\s+invest|investment\s+risk\s+scenario/i;

export function isInvScenPlanQuery(q) {
  return INVSCENP_RE.test(q || "");
}

export async function buildInvScenPlanScript() {
  try {
    const [invRaw, scRaw] = await Promise.all([
      fetch(`${apiBase()}/entities/Investment`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/scenario/list`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const investments = normaliseInvestments(invRaw);
    const scenarios = normaliseScenarios(scRaw);
    const correlated = correlate(investments, scenarios);
    const matched = correlated.filter((inv) => inv.hasMatch);
    const unmatched = correlated.filter((inv) => !inv.hasMatch);
    return `Investment-scenario planning complete, sir. ${investments.length} investment${investments.length !== 1 ? "s" : ""} assessed against ${scenarios.length} available scenario${scenarios.length !== 1 ? "s" : ""}. ${matched.length} investment${matched.length !== 1 ? "s have" : " has"} applicable scenario coverage. ${unmatched.length} investment${unmatched.length !== 1 ? "s remain" : " remains"} without a matched mitigation scenario — these warrant strategic attention.`;
  } catch (_) {
    return "Investment-scenario planner is standing by, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function InvestmentScenarioPlanner() {
  const [visible, setVisible] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [expanded, setExpanded] = useState(null);
  const [advising, setAdvising] = useState(null);
  const [running, setRunning] = useState({});
  const [outcomes, setOutcomes] = useState({});
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [invRaw, scRaw] = await Promise.all([
        fetch(`${apiBase()}/entities/Investment`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/scenario/list`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setInvestments(normaliseInvestments(invRaw));
      setScenarios(normaliseScenarios(scRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:invscplan-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invscplan-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function adviseInvestment(inv) {
    setAdvising(inv.id);
    const scenNames = inv.matched.map((s) => s.name).join(", ");
    const prompt = `As JARVIS, provide a 2-sentence strategic advisory for the investment "${inv.name}" (type: ${inv.type || "unknown"}). Applicable scenarios: ${scenNames || "none identified"}. Advise on scenario applicability and whether any of these scenarios should be executed to hedge or mitigate investment risk.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data to assess this investment scenario alignment at this time, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Investment scenario advisory unavailable at this time, sir." },
        })
      );
    }
    setAdvising(null);
  }

  async function runScenario(invId, sc) {
    const key = `${invId}__${sc.id}`;
    setRunning((p) => ({ ...p, [key]: true }));
    setOutcomes((p) => ({ ...p, [key]: null }));
    try {
      const r = await fetch(`${apiBase()}/v1/scenario/${sc.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      const outcome =
        d.outcome || d.result || d.status || d.message || "Scenario executed.";
      setOutcomes((p) => ({ ...p, [key]: outcome }));
    } catch (err) {
      setOutcomes((p) => ({ ...p, [key]: `Error: ${err.message}` }));
    }
    setRunning((p) => ({ ...p, [key]: false }));
  }

  const correlated = correlate(investments, scenarios);
  const matched = correlated.filter((inv) => inv.hasMatch);
  const unmatched = correlated.filter((inv) => !inv.hasMatch);

  const displayed =
    tab === "MATCHED" ? matched : tab === "UNMATCHED" ? unmatched : correlated;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Investment-Scenario Planner (F75)"
        style={{
          position: "fixed", bottom: 6, left: BTN_LEFT, zIndex: 66,
          background: visible ? `${AMBER}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? AMBER : AMBER}44`,
          color: visible ? AMBER : `${AMBER}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ INSCENP
        {matched.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{matched.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: BTN_LEFT - 280, zIndex: 66,
          width: 580, maxHeight: "72vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${AMBER}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${AMBER}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2 }}>◈ INVESTMENT-SCENARIO PLANNER</span>
            <button
              onClick={fetchData}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${AMBER}33`, borderRadius: 3,
                color: `${AMBER}88`, padding: "2px 6px", fontSize: 7,
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
              ["INVESTMENTS", correlated.length, CY],
              ["SCENARIOS", scenarios.length, PURPLE],
              ["MATCHED", matched.length, GREEN],
              ["UNMATCHED", unmatched.length, AMBER],
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
            {["ALL", "MATCHED", "UNMATCHED"].map((t) => (
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

          {/* Investment rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating investments against scenarios…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "UNMATCHED"
                ? "All investments have matching scenarios."
                : tab === "MATCHED"
                ? "No investment-scenario correlations found."
                : "No investment data available."}
            </div>
          ) : (
            displayed.map((inv) => {
              const isOpen = expanded === inv.id;
              return (
                <div key={inv.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${AMBER}44` : "#1a2530"}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isOpen ? null : inv.id)}>
                  {/* Investment header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    {inv.type && (
                      <span style={{
                        fontSize: 7, color: PURPLE, border: `1px solid ${PURPLE}55`,
                        borderRadius: 3, padding: "1px 5px", letterSpacing: 1, whiteSpace: "nowrap",
                      }}>{String(inv.type).toUpperCase()}</span>
                    )}
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{inv.name}</span>
                    {inv.value > 0 && (
                      <span style={{ fontSize: 8, color: GREEN, whiteSpace: "nowrap" }}>
                        ${inv.value.toLocaleString()}
                      </span>
                    )}
                    <span style={{
                      fontSize: 7,
                      color: inv.hasMatch ? GREEN : AMBER,
                      border: `1px solid ${inv.hasMatch ? GREEN : AMBER}44`,
                      borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap",
                    }}>
                      {inv.hasMatch
                        ? `${inv.matched.length} scenario${inv.matched.length !== 1 ? "s" : ""}`
                        : "NO MATCH"}
                    </span>
                  </div>

                  {/* Description snippet */}
                  {inv.description && (
                    <div style={{ color: "#556677", fontSize: 8, lineHeight: 1.4, marginBottom: 4 }}>
                      {inv.description.slice(0, 120)}{inv.description.length > 120 ? "…" : ""}
                    </div>
                  )}

                  {/* Tags + PLAN button */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 7, color: "#334455", flex: 1 }}>
                      {inv.tags.slice(0, 3).map((tag) => (
                        <span key={tag} style={{
                          marginRight: 4, border: "1px solid #223344",
                          borderRadius: 2, padding: "0 3px",
                        }}>{tag}</span>
                      ))}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); adviseInvestment(inv); }}
                      disabled={advising === inv.id}
                      style={{
                        background: advising === inv.id ? "#1a2530" : `${AMBER}18`,
                        color: advising === inv.id ? "#445566" : AMBER,
                        border: `1px solid ${AMBER}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: advising === inv.id ? "default" : "pointer",
                      }}
                    >{advising === inv.id ? "…advising" : "▶ PLAN"}</button>
                  </div>

                  {/* Expanded matched scenarios */}
                  {isOpen && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${AMBER}18` }}>
                      {inv.matched.length === 0 ? (
                        <div style={{ color: AMBER, fontSize: 8 }}>
                          No matching scenarios found for this investment.
                        </div>
                      ) : (
                        inv.matched.map((sc) => {
                          const key = `${inv.id}__${sc.id}`;
                          const isRunning = running[key];
                          const outcome = outcomes[key];
                          return (
                            <div key={sc.id} style={{
                              background: "rgba(255,255,255,0.02)",
                              border: "1px solid #1e3040",
                              borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                            }}>
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                                <div style={{
                                  width: 24, height: 24, borderRadius: 4,
                                  background: `${PURPLE}22`, border: `1px solid ${PURPLE}44`,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: 10, color: PURPLE, flexShrink: 0,
                                }}>⚙</div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ color: "#a0b8cc", fontSize: 10 }}>{sc.name}</div>
                                  {sc.description && (
                                    <div style={{ color: "#445566", fontSize: 8, marginTop: 1 }}>
                                      {sc.description.slice(0, 100)}{sc.description.length > 100 ? "…" : ""}
                                    </div>
                                  )}
                                  <div style={{ color: "#334455", fontSize: 7, marginTop: 2 }}>
                                    {[sc.type, sc.severity > 0 ? `impact ${sc.severity}` : ""].filter(Boolean).join(" · ")}
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); runScenario(inv.id, sc); }}
                                  disabled={isRunning}
                                  style={{
                                    background: isRunning ? "#1a2530" : `${GREEN}18`,
                                    color: isRunning ? "#445566" : GREEN,
                                    border: `1px solid ${GREEN}44`,
                                    borderRadius: 3, padding: "2px 8px",
                                    fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                                    letterSpacing: 1, cursor: isRunning ? "default" : "pointer",
                                    flexShrink: 0,
                                  }}
                                >{isRunning ? "…running" : "▶ RUN"}</button>
                              </div>
                              {outcome && (
                                <div style={{
                                  marginTop: 6, padding: "4px 8px",
                                  background: "rgba(0,200,120,0.06)",
                                  border: `1px solid ${GREEN}33`, borderRadius: 3,
                                  color: GREEN, fontSize: 8, lineHeight: 1.5,
                                }}>
                                  {String(outcome).slice(0, 300)}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /entities/Investment + /v1/scenario/list · 60s auto-refresh · click ▶ PLAN for AI advisory · ▶ RUN to execute
          </div>
        </div>
      )}
    </>
  );
}
