/**
 * ScenarioImpactMatrix — F50
 * Fetches /v1/scenario/list and plots every scenario on a 3×3 impact × probability
 * risk matrix. Quadrant colours: LOW (green) / MEDIUM (amber) / HIGH (orange) /
 * CRITICAL (red). Hovering shows the scenario name; clicking sends a
 * "risk assessment for: {name}" message to /v1/jarvis/agent/chat and speaks
 * the AI response via jarvis:speak-dossier. Stats tiles show total scenarios and
 * critical-quadrant count. Filter input, 60s auto-refresh.
 * "JARVIS, impact matrix" | "scenario matrix" | "risk matrix" | "scenario risk"
 * → opens panel + TTS brief via isImpactMatrixQuery + buildImpactMatrixScript.
 * ◫ MATRIX toggle at left:3924 bottom strip with critical badge.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const RED  = "#FF4D6D";
const ORG  = "#FF8800";
const AMB  = "#FFD700";
const GRN  = "#00E5A0";
const DIM  = "#1A2535";
const POLL = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const MATRIX_RE =
  /\b(impact.matrix|scenario.matrix|risk.matrix|scenario.risk|threat.matrix|probability.matrix|risk.assessment.matrix)\b/i;

export function isImpactMatrixQuery(t) {
  return MATRIX_RE.test(t || "");
}

/* ── fetcher ───────────────────────────────────────────────────────────────── */
async function fetchScenarios() {
  const r = await fetch(`${apiBase()}/v1/scenario/list`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`scenario/list ${r.status}`);
  const d = await r.json();
  return Array.isArray(d)         ? d
    : Array.isArray(d?.data)      ? d.data
    : Array.isArray(d?.items)     ? d.items
    : Array.isArray(d?.scenarios) ? d.scenarios
    : Array.isArray(d?.results)   ? d.results
    : [];
}

/* ── derive impact/probability ─────────────────────────────────────────────── */
function deriveScores(s) {
  // impact: 1–3 (1=low, 2=medium, 3=high)
  const rawImpact = s.impact ?? s.severity ?? s.impact_score ?? s.risk_level ?? null;
  const rawProb   = s.probability ?? s.likelihood ?? s.probability_score ?? s.chance ?? null;

  function toTier(v, name) {
    if (v == null) {
      // deterministic from name hash so position is stable across refreshes
      const hash = (name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      return (hash % 3) + 1;
    }
    if (typeof v === "string") {
      const l = v.toLowerCase();
      if (/high|critical|severe|3/.test(l)) return 3;
      if (/medium|moderate|2/.test(l))      return 2;
      return 1;
    }
    const n = Number(v);
    if (n >= 70 || n === 3) return 3;
    if (n >= 35 || n === 2) return 2;
    return 1;
  }

  const name = s.name || s.title || s.scenario_name || "";
  return { impact: toTier(rawImpact, name), prob: toTier(rawProb, name + "p") };
}

/* ── quadrant colour ───────────────────────────────────────────────────────── */
function quadColour(impact, prob) {
  const score = impact * prob; // 1–9
  if (score >= 7) return RED;
  if (score >= 5) return ORG;
  if (score >= 3) return AMB;
  return GRN;
}

function quadLabel(impact, prob) {
  const score = impact * prob;
  if (score >= 7) return "CRITICAL";
  if (score >= 5) return "HIGH";
  if (score >= 3) return "MEDIUM";
  return "LOW";
}

/* ── TTS brief ─────────────────────────────────────────────────────────────── */
export async function buildImpactMatrixScript() {
  let scenarios = [];
  try { scenarios = await fetchScenarios(); } catch (_) {}
  if (!scenarios.length) return "No scenarios available for the impact matrix, sir.";

  let critical = 0, high = 0;
  scenarios.forEach(s => {
    const { impact, prob } = deriveScores(s);
    const label = quadLabel(impact, prob);
    if (label === "CRITICAL") critical++;
    else if (label === "HIGH") high++;
  });

  const total = scenarios.length;
  return (
    `Impact matrix is live with ${total} scenario${total !== 1 ? "s" : ""} plotted across the risk grid. ` +
    (critical ? `${critical} scenario${critical !== 1 ? "s" : ""} are in the critical quadrant. ` : "") +
    (high ? `${high} are rated high. ` : "") +
    `Recommend immediate review of critical scenarios, sir.`
  );
}

/* ── component ─────────────────────────────────────────────────────────────── */
export default function ScenarioImpactMatrix() {
  const [open, setOpen]         = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [filter, setFilter]     = useState("");
  const [tooltip, setTooltip]   = useState(null); // { x, y, name, label }
  const [assessing, setAssessing] = useState(null); // scenario id being assessed
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const data = await fetchScenarios();
      setScenarios(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen(o => {
      if (!o) load();
      return !o;
    });
    window.addEventListener("jarvis:matrix-toggle", toggle);
    return () => window.removeEventListener("jarvis:matrix-toggle", toggle);
  }, [load]);

  async function handleCellClick(s) {
    if (assessing === (s.id || s._id)) return;
    setAssessing(s.id || s._id);
    const name = s.name || s.title || s.scenario_name || "this scenario";
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Risk assessment for scenario: ${name}. What is its likely impact and recommended mitigation?` }),
      });
      const d = await r.json();
      const answer = (d.answer || "").trim() || `No assessment available for ${name}, sir.`;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: `Unable to assess ${name} at this time, sir.` },
      }));
    } finally {
      setAssessing(null);
    }
  }

  const filtered = scenarios.filter(s => {
    if (!filter) return true;
    const t = filter.toLowerCase();
    return (s.name || s.title || s.scenario_name || "").toLowerCase().includes(t)
      || (s.type || s.category || "").toLowerCase().includes(t)
      || (s.status || "").toLowerCase().includes(t);
  });

  // Build 3×3 grid buckets — impact rows (3 top → 1 bottom), prob cols (1 left → 3 right)
  const grid = {}; // "impact-prob" → scenario[]
  for (let i = 1; i <= 3; i++) for (let p = 1; p <= 3; p++) grid[`${i}-${p}`] = [];
  filtered.forEach(s => {
    const { impact, prob } = deriveScores(s);
    grid[`${impact}-${prob}`].push(s);
  });

  const criticalCount = scenarios.filter(s => {
    const { impact, prob } = deriveScores(s);
    return quadLabel(impact, prob) === "CRITICAL";
  }).length;

  const CELL_SIZE = 100;
  const AXIS_W    = 64;
  const GRID_W    = CELL_SIZE * 3;
  const GRID_H    = CELL_SIZE * 3;

  const IMPACT_LABELS = ["HIGH", "MEDIUM", "LOW"];   // rows top→bottom = impact 3,2,1
  const PROB_LABELS   = ["LOW", "MEDIUM", "HIGH"];   // cols left→right = prob 1,2,3

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => { if (!o) load(); return !o; })}
        title="Scenario Impact Matrix"
        style={{
          position: "fixed", bottom: 6, left: 3924, zIndex: 60,
          background: open ? CY : "rgba(5,8,13,0.82)", color: open ? "#04060A" : CY,
          border: `1px solid ${CY}66`, borderRadius: 6, padding: "3px 8px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 1,
          cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◫ MATRIX
        {criticalCount > 0 && !open && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: 8, padding: "0 5px", fontSize: 9,
          }}>{criticalCount}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", top: 60, right: 18, zIndex: 65,
          width: 520, maxHeight: "calc(100vh - 80px)",
          background: "rgba(6,10,18,0.95)", border: `1px solid ${CY}44`,
          borderRadius: 14, display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace", backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>

          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px 6px", borderBottom: `1px solid ${CY}22`,
          }}>
            <span style={{ color: CY, letterSpacing: 3, fontSize: 11, fontWeight: 700 }}>
              ◫ SCENARIO IMPACT MATRIX
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#6E8AA0",
              cursor: "pointer", fontSize: 14, padding: 0,
            }}>✕</button>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 8, padding: "8px 14px" }}>
            {[
              { label: "TOTAL", val: scenarios.length, col: CY },
              { label: "CRITICAL", val: criticalCount, col: RED },
              { label: "FILTERED", val: filtered.length, col: AMB },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, background: `${col}12`, border: `1px solid ${col}33`,
                borderRadius: 8, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter */}
          <div style={{ padding: "0 14px 8px" }}>
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="filter scenarios…"
              style={{
                width: "100%", background: "rgba(41,231,255,0.06)",
                border: `1px solid ${CY}33`, borderRadius: 6, color: CY,
                padding: "5px 10px", fontFamily: "inherit", fontSize: 11,
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Matrix */}
          <div style={{ padding: "0 14px 14px", overflowY: "auto", flex: 1 }}>
            {loading && !scenarios.length && (
              <div style={{ color: "#6E8AA0", fontSize: 11, textAlign: "center", padding: 24 }}>
                ◌ loading scenarios…
              </div>
            )}
            {err && (
              <div style={{ color: RED, fontSize: 11, padding: 8 }}>⚠ {err}</div>
            )}
            {!loading && !err && filtered.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 11, textAlign: "center", padding: 24 }}>
                No scenarios match the filter.
              </div>
            )}

            {filtered.length > 0 && (
              <div style={{ position: "relative" }}>
                {/* Y-axis label */}
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0, width: AXIS_W,
                  display: "flex", flexDirection: "column", justifyContent: "center",
                  alignItems: "center", gap: 0,
                }}>
                  <div style={{
                    writingMode: "vertical-rl", transform: "rotate(180deg)",
                    color: "#6E8AA0", fontSize: 9, letterSpacing: 2, marginBottom: 4,
                  }}>IMPACT ↑</div>
                  {IMPACT_LABELS.map(l => (
                    <div key={l} style={{
                      flex: 1, display: "flex", alignItems: "center",
                      color: "#4A6070", fontSize: 9, letterSpacing: 1,
                    }}>{l}</div>
                  ))}
                </div>

                {/* Grid area */}
                <div style={{ marginLeft: AXIS_W }}>
                  {/* Grid rows: impact 3 → 1 (top → bottom) */}
                  {[3, 2, 1].map(impactTier => (
                    <div key={impactTier} style={{ display: "flex", height: CELL_SIZE }}>
                      {[1, 2, 3].map(probTier => {
                        const cellScenarios = grid[`${impactTier}-${probTier}`];
                        const col = quadColour(impactTier, probTier);
                        const label = quadLabel(impactTier, probTier);
                        return (
                          <div key={probTier} style={{
                            width: CELL_SIZE, height: CELL_SIZE, flexShrink: 0,
                            border: `1px solid ${col}33`,
                            background: `${col}08`,
                            position: "relative", overflow: "hidden",
                            display: "flex", flexWrap: "wrap",
                            alignContent: "flex-start", gap: 3, padding: 4,
                          }}>
                            {/* quadrant label (faint) */}
                            <div style={{
                              position: "absolute", bottom: 2, right: 3,
                              fontSize: 7, color: `${col}55`, letterSpacing: 1,
                            }}>{label}</div>

                            {cellScenarios.map(s => {
                              const id = s.id || s._id || s.scenario_name || s.name;
                              const name = s.name || s.title || s.scenario_name || "?";
                              const isLoading = assessing === (s.id || s._id);
                              return (
                                <div
                                  key={id}
                                  onClick={() => handleCellClick(s)}
                                  title={name}
                                  style={{
                                    width: 14, height: 14, borderRadius: 3,
                                    background: isLoading ? "#6E8AA0" : col,
                                    opacity: isLoading ? 0.5 : 0.85,
                                    cursor: "pointer",
                                    boxShadow: `0 0 6px ${col}66`,
                                    transition: "transform 0.1s",
                                    flexShrink: 0,
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.transform = "scale(1.4)";
                                    setTooltip({ name, label, col });
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.transform = "scale(1)";
                                    setTooltip(null);
                                  }}
                                />
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* X-axis probability labels */}
                  <div style={{ display: "flex", marginTop: 4 }}>
                    {PROB_LABELS.map(l => (
                      <div key={l} style={{
                        width: CELL_SIZE, textAlign: "center",
                        color: "#4A6070", fontSize: 9, letterSpacing: 1,
                      }}>{l}</div>
                    ))}
                  </div>
                  <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 9, letterSpacing: 2, marginTop: 2 }}>
                    PROBABILITY →
                  </div>
                </div>

                {/* Hover tooltip */}
                {tooltip && (
                  <div style={{
                    position: "fixed", pointerEvents: "none",
                    background: "rgba(6,10,18,0.95)", border: `1px solid ${tooltip.col}66`,
                    borderRadius: 6, padding: "5px 10px", zIndex: 200,
                    fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
                    color: tooltip.col, left: "50%", transform: "translateX(-50%)",
                    bottom: 80, whiteSpace: "nowrap",
                  }}>
                    {tooltip.name} <span style={{ color: "#6E8AA0" }}>— {tooltip.label}</span>
                  </div>
                )}
              </div>
            )}

            {/* Legend */}
            <div style={{ display: "flex", gap: 12, marginTop: 12, justifyContent: "center" }}>
              {[["CRITICAL", RED], ["HIGH", ORG], ["MEDIUM", AMB], ["LOW", GRN]].map(([l, c]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
                  <span style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>{l}</span>
                </div>
              ))}
            </div>

            <div style={{ color: "#3A5060", fontSize: 9, textAlign: "center", marginTop: 8, letterSpacing: 1 }}>
              click a dot for AI risk assessment · auto-refreshes every 60s
            </div>
          </div>
        </div>
      )}
    </>
  );
}
