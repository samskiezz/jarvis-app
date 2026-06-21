/**
 * ScenarioLauncher — F13 Scenario Launcher.
 * Lists available scenarios from /v1/scenario/list, lets the user pick one,
 * POSTs to /v1/scenario/{id}/run, and shows the outcome.
 * "JARVIS, scenarios" opens the panel and speaks a brief.
 * Additive only — mounted via App.jsx; intent exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const ORG = "#FF8800";
const CY  = "#29E7FF";
const GRN = "#00E5A0";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SCENARIO_RE = /\bscenario|simulation|predict|forecast|playbook|drill|run.scenario|launch.scenario\b/i;

async function fetchScenarios() {
  const r = await fetch(`${apiBase()}/v1/scenario/list`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)               ? d
    : Array.isArray(d?.data)            ? d.data
    : Array.isArray(d?.items)           ? d.items
    : Array.isArray(d?.scenarios)       ? d.scenarios
    : Array.isArray(d?.results)         ? d.results
    : [];
}

async function runScenario(id) {
  const r = await fetch(`${apiBase()}/v1/scenario/${id}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ scenario_id: id }),
  });
  const d = await r.json();
  return d;
}

export function isScenarioQuery(text) {
  return SCENARIO_RE.test(text || "");
}

export async function buildScenarioScript() {
  let scenarios = [];
  try { scenarios = await fetchScenarios(); } catch (_) {}

  if (!scenarios.length) return "No scenarios available in the simulation theatre, sir.";

  const total = scenarios.length;
  const names = scenarios
    .slice(0, 3)
    .map(s => s.name || s.title || s.scenario_name || "Unnamed scenario")
    .join(", ");

  return (
    `Simulation theatre has ${total} scenario${total !== 1 ? "s" : ""} ready. ` +
    (names ? `Available: ${names}.` : "")
  ).trim();
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

export default function ScenarioLauncher() {
  const [open,       setOpen]       = useState(false);
  const [scenarios,  setScenarios]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [lastFetch,  setLastFetch]  = useState(null);
  const [filter,     setFilter]     = useState("");
  const [running,    setRunning]    = useState(null);   // id of scenario being run
  const [outcome,    setOutcome]    = useState(null);   // { id, result }
  const [runError,   setRunError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const arr = await fetchScenarios();
      setScenarios(arr);
      setLastFetch(new Date());
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (SCENARIO_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  async function handleRun(s) {
    const id = s.id || s.scenario_id || s._id;
    if (!id) return;
    setRunning(id);
    setOutcome(null);
    setRunError(null);
    try {
      const result = await runScenario(id);
      setOutcome({ id, result });
    } catch (err) {
      setRunError(`Failed to run scenario: ${err.message || "unknown error"}`);
    } finally {
      setRunning(null);
    }
  }

  const visible = filter.trim()
    ? scenarios.filter(s => {
        const hay = [
          s.name, s.title, s.scenario_name, s.description, s.type, s.category,
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(filter.toLowerCase());
      })
    : scenarios;

  function outcomeText(result) {
    if (!result) return "No outcome data returned.";
    if (typeof result === "string") return result;
    return (
      result.outcome || result.summary || result.result ||
      result.message || result.status ||
      JSON.stringify(result, null, 2).slice(0, 300)
    );
  }

  return (
    <>
      {/* Toggle button — bottom-left strip, after INTEL */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Scenario Launcher"
        style={{
          position: "fixed", left: 492, bottom: 18, zIndex: 68,
          background: open ? ORG + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${ORG}55`,
          borderRadius: 8,
          color: open ? "#04060A" : ORG,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${ORG}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>▶</span>
        SIM
        {scenarios.length > 0 && (
          <span style={{
            background: ORG + "44", color: ORG,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {scenarios.length}
          </span>
        )}
      </button>

      {/* Scenario panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(460px,93vw)", maxHeight: "min(600px,76vh)",
          background: "rgba(4,8,14,0.94)",
          border: `1px solid ${ORG}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${ORG}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${ORG}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: ORG,
              boxShadow: `0 0 10px ${ORG}`, display: "inline-block",
              animation: loading ? "simpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: ORG, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              SIMULATION THEATRE
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "LOADING" : lastFetch ? `↻ ${fmtAge(lastFetch)}` : "—"}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stats bar */}
          {scenarios.length > 0 && (
            <div style={{
              padding: "5px 14px", borderBottom: `1px solid ${ORG}18`,
              display: "flex", gap: 16, alignItems: "center",
            }}>
              <span style={{ fontSize: 9, color: ORG, letterSpacing: 1 }}>
                {scenarios.length} SCENARIO{scenarios.length !== 1 ? "S" : ""}
              </span>
              <span style={{ fontSize: 9, color: "#566878", letterSpacing: 1, marginLeft: "auto" }}>
                CLICK ▶ TO RUN
              </span>
            </div>
          )}

          {/* Outcome banner */}
          {outcome && (
            <div style={{
              margin: "8px 10px 0",
              background: `${GRN}12`,
              border: `1px solid ${GRN}44`,
              borderRadius: 8, padding: "9px 12px",
            }}>
              <div style={{ fontSize: 9, color: GRN, letterSpacing: 2, marginBottom: 4, fontWeight: 700 }}>
                ✓ SCENARIO COMPLETE
              </div>
              <div style={{ fontSize: 9, color: "#adc1cd", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {outcomeText(outcome.result)}
              </div>
              <button
                onClick={() => setOutcome(null)}
                style={{
                  marginTop: 6, background: "none", border: "none",
                  color: "#566878", cursor: "pointer", fontSize: 9, padding: 0,
                }}
              >
                dismiss
              </button>
            </div>
          )}

          {/* Error banner */}
          {runError && (
            <div style={{
              margin: "8px 10px 0",
              background: "rgba(255,56,80,0.08)",
              border: "1px solid rgba(255,56,80,0.3)",
              borderRadius: 8, padding: "9px 12px",
              fontSize: 9, color: "#FF3850", lineHeight: 1.5,
            }}>
              {runError}
              <button
                onClick={() => setRunError(null)}
                style={{ marginLeft: 8, background: "none", border: "none", color: "#566878", cursor: "pointer", fontSize: 9 }}
              >
                dismiss
              </button>
            </div>
          )}

          {/* Filter */}
          <div style={{ padding: "6px 12px", borderTop: `1px solid ${ORG}18`, marginTop: 4 }}>
            <input
              type="text"
              placeholder="filter scenarios…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                background: `rgba(255,136,0,0.06)`, border: `1px solid ${ORG}33`,
                borderRadius: 5, color: "#DCEBF5", fontSize: 10,
                padding: "5px 9px", fontFamily: "'JetBrains Mono',monospace",
                outline: "none", letterSpacing: 0.5,
              }}
            />
          </div>

          {/* Scenario cards */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: "24px 14px", color: "#566878", fontSize: 10, textAlign: "center" }}>
                {scenarios.length === 0 ? "No scenarios available." : "No matches."}
              </div>
            )}
            {visible.map((s, i) => {
              const id       = s.id || s.scenario_id || s._id;
              const name     = s.name || s.title || s.scenario_name || `Scenario ${i + 1}`;
              const type     = s.type || s.category || s.kind || "";
              const desc     = s.description || s.summary || s.notes || "";
              const status   = s.status || s.state || "";
              const ts       = s.updated_at || s.last_run || s.created_at;
              const isRun    = running === id;

              return (
                <div key={id || i} style={{
                  margin: "6px 10px",
                  background: isRun ? `${ORG}10` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isRun ? ORG + "44" : "#2a3040"}`,
                  borderRadius: 8, padding: "9px 12px",
                  transition: "border-color 0.2s, background 0.2s",
                }}>
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    {type && (
                      <span style={{
                        fontSize: 8, color: ORG, background: ORG + "1a",
                        border: `1px solid ${ORG}44`, borderRadius: 3,
                        padding: "1px 6px", letterSpacing: 1, fontWeight: 700, textTransform: "uppercase",
                        flexShrink: 0,
                      }}>
                        {type}
                      </span>
                    )}
                    <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", fontWeight: 700, letterSpacing: 0.5 }}>
                      {name}
                    </span>
                    {status && (
                      <span style={{
                        fontSize: 8, color: CY + "aa", letterSpacing: 0.5, flexShrink: 0,
                      }}>
                        {status}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {desc && (
                    <p style={{
                      margin: "0 0 6px", fontSize: 9, color: "#8ba3b8",
                      lineHeight: 1.5, letterSpacing: 0.3,
                    }}>
                      {desc.length > 120 ? desc.slice(0, 120) + "…" : desc}
                    </p>
                  )}

                  {/* Footer row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {ts && (
                      <span style={{ fontSize: 8, color: "#566878" }}>{fmtAge(ts)}</span>
                    )}
                    <button
                      onClick={() => handleRun(s)}
                      disabled={!!running}
                      style={{
                        marginLeft: "auto",
                        background: isRun ? ORG : `${ORG}22`,
                        border: `1px solid ${ORG}66`,
                        borderRadius: 5,
                        color: isRun ? "#04060A" : ORG,
                        cursor: running ? "not-allowed" : "pointer",
                        padding: "3px 10px", fontSize: 9, letterSpacing: 1.5,
                        fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                        transition: "all 0.15s",
                        opacity: running && !isRun ? 0.4 : 1,
                      }}
                    >
                      {isRun ? "RUNNING…" : "▶ RUN"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes simpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
