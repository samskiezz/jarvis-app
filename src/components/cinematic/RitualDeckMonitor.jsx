/**
 * RitualDeckMonitor — F243.
 *
 * Data sources (real — backed by server/routes/ritual_deck.py + server/services/ritual_deck.py):
 *   GET  /v1/ritual/list                       → {items:[{id,name,steps:[{label,action,destructive}]}]}
 *   POST /v1/ritual/{id}/start                 {safe:true} → {ok,run:{id,routine_id,status,current_step,...},routine}
 *   GET  /v1/ritual/status/{run_id}            → {ok,run:{id,status,current_step,completed_steps,...}}
 *   POST /v1/ritual/run/{run_id}/advance       {action:"next"|"skip"|"stop"} → {ok,run,...}
 *
 * Displays:
 *   - Stat tiles: total routines / avg steps / active runs / completed runs
 *   - Routine list with step count badges
 *   - Expand routine → step list (label, action chip, ⚠ destructive badge)
 *   - ▶ RUN button per routine → starts a run in safe mode
 *   - Active runs section: status bar, current step, NEXT/SKIP/STOP controls
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence routine brief + TTS
 *
 * Toggle: ⬡ RDCK at left:137520, bottom:8, zIndex:123.
 * Badge: green = routine count.
 * 90 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isRdckQuery(q) / buildRdckScript()
 *
 * Voice triggers: "ritual deck / routines / morning startup / run routine /
 *   rdck / my routines / startup routine / daily routine / focus mode /
 *   shutdown prep / jarvis routines"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const RED = "#F87171";
const PRP = "#A78BFA";
const DIM = "#3A4A55";

const BTN_LEFT   = 137520;
const REFRESH_MS = 90_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const RDCK_RE =
  /\b(ritual\s*deck|rdck\b|my\s*routines?|startup\s*routine|daily\s*routine|morning\s*startup|focus\s*mode|shutdown\s*prep|jarvis\s*routines?|run\s*routine)\b/i;

export function isRdckQuery(t) {
  return RDCK_RE.test(t || "");
}

export async function buildRdckScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/ritual/list`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const items = Array.isArray(d?.items) ? d.items : [];
    if (!items.length) return "The ritual deck has no routines configured at this time, sir.";
    const names = items.slice(0, 3).map(r => r.name).join(", ");
    const totalSteps = items.reduce((n, r) => n + (Array.isArray(r.steps) ? r.steps.length : 0), 0);
    return `Ritual deck: ${items.length} routine${items.length !== 1 ? "s" : ""} registered — ` +
      `${names}${items.length > 3 ? ` and ${items.length - 3} more` : ""}. ` +
      `${totalSteps} steps across all routines. Say "run routine" to launch one.`;
  } catch {
    return "Unable to reach the ritual deck endpoint at this time, sir.";
  }
}

const STATUS_COLOUR = {
  running:   GN,
  completed: CY,
  stopped:   DIM,
  paused:    AM,
};

async function fetchRoutines() {
  const r = await fetch(`${apiBase()}/v1/ritual/list`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d?.items) ? d.items : [];
}

async function startRun(routineId) {
  const r = await fetch(`${apiBase()}/v1/ritual/${routineId}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ safe: true }),
  });
  return r.json();
}

async function advanceRun(runId, action) {
  const r = await fetch(`${apiBase()}/v1/ritual/run/${runId}/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ action }),
  });
  return r.json();
}

async function agentAssess(routineCount, totalSteps) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message: `Assess the JARVIS ritual deck: ${routineCount} routines with ${totalSteps} steps total. Provide a 2-sentence operational brief and recommended next routine to run.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No response from agent.";
}

export default function RitualDeckMonitor() {
  const [open,      setOpen]      = useState(false);
  const [routines,  setRoutines]  = useState([]);
  const [runs,      setRuns]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [expanded,  setExpanded]  = useState(null);
  const [starting,  setStarting]  = useState(null);
  const [advancing, setAdvancing] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [dossier,   setDossier]   = useState(null);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchRoutines();
      setRoutines(items);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (RDCK_RE.test(q)) {
        setOpen(true);
        window.dispatchEvent(new CustomEvent("jarvis:rdck-toggle"));
      }
    };
    window.addEventListener("jarvis:rdck-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:rdck-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  const totalSteps = routines.reduce(
    (n, r) => n + (Array.isArray(r.steps) ? r.steps.length : 0), 0,
  );
  const avgSteps   = routines.length ? (totalSteps / routines.length).toFixed(1) : "—";
  const activeRuns = runs.filter(r => r.status === "running").length;
  const doneRuns   = runs.filter(r => r.status === "completed").length;

  async function handleRun(routineId) {
    if (starting) return;
    setStarting(routineId);
    try {
      const d = await startRun(routineId);
      if (d.ok && d.run) {
        setRuns(prev => [...prev, { ...d.run, _routineName: d.routine?.name || routineId }]);
        setExpanded(`run:${d.run.id}`);
      }
    } catch (_) {}
    setStarting(null);
  }

  async function handleAdvance(runId, action) {
    if (advancing) return;
    setAdvancing(runId + action);
    try {
      const d = await advanceRun(runId, action);
      if (d.ok && d.run) {
        setRuns(prev => prev.map(r => r.id === runId
          ? { ...r, ...d.run }
          : r,
        ));
      }
    } catch (_) {}
    setAdvancing(null);
  }

  async function handleAssess() {
    if (assessing) return;
    setAssessing(true);
    setDossier(null);
    try {
      const text = await agentAssess(routines.length, totalSteps);
      setDossier(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Agent assessment unavailable.");
    }
    setAssessing(false);
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Ritual Deck Monitor"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 123,
          background: "rgba(5,10,18,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ⬡ RDCK
        {routines.length > 0 && (
          <span style={{
            marginLeft: 5, background: GN, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 8,
          }}>
            {routines.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 60, right: 18, zIndex: 124,
          width: "min(580px, 96vw)", maxHeight: "82vh",
          background: "rgba(5,10,18,0.97)",
          border: `1px solid ${CY}44`, borderRadius: 14,
          display: "flex", flexDirection: "column",
          boxShadow: `0 0 60px ${CY}14, 0 24px 48px rgba(0,0,0,0.8)`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          }}>
            <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
              ⬡ RITUAL DECK
            </span>
            {loading && <span style={{ fontSize: 9, color: DIM }}>refreshing…</span>}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
              <button
                onClick={handleAssess}
                disabled={assessing}
                style={{
                  background: assessing ? `${CY}22` : "transparent",
                  border: `1px solid ${CY}33`, borderRadius: 4,
                  color: CY, fontSize: 9, padding: "2px 8px",
                  cursor: assessing ? "default" : "pointer",
                  fontFamily: "inherit", opacity: assessing ? 0.6 : 1,
                }}
              >
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: "none",
                  color: DIM, cursor: "pointer", fontSize: 14, lineHeight: 1,
                }}
              >✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1, padding: "10px 16px",
            borderBottom: `1px solid ${CY}11`,
          }}>
            {[
              { label: "ROUTINES",  val: routines.length, col: CY },
              { label: "AVG STEPS", val: avgSteps,         col: AM },
              { label: "ACTIVE",    val: activeRuns,       col: GN },
              { label: "DONE",      val: doneRuns,         col: PRP },
            ].map(({ label, val, col }) => (
              <div key={label} style={{ textAlign: "center", padding: "4px 0" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
                <div style={{ fontSize: 8, color: DIM, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Dossier */}
          {dossier && (
            <div style={{
              margin: "0 16px 8px", padding: "8px 10px",
              background: `${CY}08`, border: `1px solid ${CY}22`,
              borderRadius: 6, color: "#9BBCCC", fontSize: 10, lineHeight: 1.6,
            }}>
              {dossier}
            </div>
          )}

          {/* Scrollable body */}
          <div style={{ overflowY: "auto", flex: 1 }}>

            {/* Routines */}
            {routines.length === 0 && !loading && (
              <div style={{ padding: "24px 16px", color: DIM, fontSize: 11, textAlign: "center" }}>
                No routines in ritual deck.
              </div>
            )}

            {routines.map((routine) => {
              const steps     = Array.isArray(routine.steps) ? routine.steps : [];
              const isExp     = expanded === routine.id;
              const isStart   = starting === routine.id;
              const destCount = steps.filter(s => s.destructive).length;

              return (
                <div
                  key={routine.id}
                  style={{
                    borderBottom: `1px solid ${CY}0A`,
                    background: isExp ? `${CY}05` : "transparent",
                  }}
                >
                  <div
                    style={{
                      padding: "9px 16px", display: "flex",
                      alignItems: "center", gap: 8, cursor: "pointer",
                    }}
                    onClick={() => setExpanded(isExp ? null : routine.id)}
                  >
                    {/* Step count badge */}
                    <span style={{
                      fontSize: 9, color: CY, border: `1px solid ${CY}44`,
                      borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                    }}>
                      {steps.length} step{steps.length !== 1 ? "s" : ""}
                    </span>

                    {/* Name */}
                    <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, fontWeight: 600 }}>
                      {routine.name}
                    </span>

                    {/* Destructive warning */}
                    {destCount > 0 && (
                      <span style={{ fontSize: 9, color: AM }}>⚠ {destCount} destructive</span>
                    )}

                    {/* Run button */}
                    <button
                      onClick={e => { e.stopPropagation(); handleRun(routine.id); }}
                      disabled={!!starting}
                      style={{
                        background: isStart ? `${GN}22` : `${GN}11`,
                        border: `1px solid ${GN}55`, borderRadius: 4,
                        color: GN, fontSize: 9, padding: "2px 8px",
                        cursor: starting ? "default" : "pointer",
                        fontFamily: "inherit",
                        opacity: starting && !isStart ? 0.4 : 1,
                        flexShrink: 0,
                      }}
                    >
                      {isStart ? "starting…" : "▶ RUN"}
                    </button>
                  </div>

                  {/* Step list */}
                  {isExp && steps.length > 0 && (
                    <div style={{ padding: "0 16px 10px" }}>
                      {steps.map((step, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "4px 0",
                            borderTop: i === 0 ? `1px solid ${CY}11` : "none",
                          }}
                        >
                          <span style={{ color: DIM, fontSize: 9, minWidth: 16 }}>{i + 1}.</span>
                          <span style={{ color: "#9BBCCC", fontSize: 10, flex: 1 }}>
                            {step.label}
                          </span>
                          {step.action && (
                            <span style={{
                              fontSize: 8, color: PRP, border: `1px solid ${PRP}33`,
                              borderRadius: 3, padding: "1px 5px",
                            }}>
                              {step.action}
                            </span>
                          )}
                          {step.destructive && (
                            <span style={{
                              fontSize: 8, color: AM, border: `1px solid ${AM}44`,
                              borderRadius: 3, padding: "1px 5px",
                            }}>
                              ⚠ DESTR
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Active/recent runs */}
            {runs.length > 0 && (
              <>
                <div style={{
                  padding: "8px 16px 4px",
                  borderTop: `1px solid ${CY}22`,
                  color: CY, fontSize: 9, letterSpacing: 2,
                }}>
                  RECENT RUNS
                </div>
                {runs.slice(-5).reverse().map((run) => {
                  const statusCol = STATUS_COLOUR[run.status] || DIM;
                  const isExpRun  = expanded === `run:${run.id}`;
                  const routine   = routines.find(r => r.id === run.routine_id);
                  const steps     = routine?.steps || [];
                  const stepLabel = steps[run.current_step]?.label || "—";
                  const isAdv     = advancing && advancing.startsWith(run.id);

                  return (
                    <div
                      key={run.id}
                      style={{
                        borderBottom: `1px solid ${CY}0A`,
                        background: isExpRun ? `${CY}05` : "transparent",
                      }}
                    >
                      <div
                        style={{
                          padding: "8px 16px", display: "flex",
                          alignItems: "center", gap: 8, cursor: "pointer",
                        }}
                        onClick={() => setExpanded(isExpRun ? null : `run:${run.id}`)}
                      >
                        <span style={{
                          width: 7, height: 7, borderRadius: "50%",
                          background: statusCol, flexShrink: 0,
                          boxShadow: run.status === "running" ? `0 0 6px ${statusCol}` : "none",
                        }} />
                        <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                          {run._routineName || run.routine_id}
                        </span>
                        <span style={{
                          fontSize: 8, color: statusCol,
                          border: `1px solid ${statusCol}44`,
                          borderRadius: 3, padding: "1px 5px",
                        }}>
                          {(run.status || "?").toUpperCase()}
                        </span>
                        <span style={{ fontSize: 9, color: DIM }}>
                          {run.current_step}/{steps.length || "?"}
                        </span>
                      </div>

                      {isExpRun && (
                        <div style={{
                          padding: "6px 16px 10px",
                          fontSize: 9, color: "#7AABB8", lineHeight: 2,
                        }}>
                          <div>
                            <span style={{ color: DIM }}>STEP   </span>
                            {run.current_step < steps.length ? `${run.current_step + 1}. ${stepLabel}` : "complete"}
                          </div>
                          <div>
                            <span style={{ color: DIM }}>DONE   </span>
                            {(run.completed_steps || []).length} step(s)
                          </div>
                          {run.status === "running" && (
                            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                              {["next", "skip", "stop"].map(act => (
                                <button
                                  key={act}
                                  onClick={e => { e.stopPropagation(); handleAdvance(run.id, act); }}
                                  disabled={!!advancing}
                                  style={{
                                    background: act === "stop" ? `${RED}11` : `${CY}11`,
                                    border: `1px solid ${act === "stop" ? RED : CY}44`,
                                    borderRadius: 4,
                                    color: act === "stop" ? RED : CY,
                                    fontSize: 9, padding: "2px 8px",
                                    cursor: advancing ? "default" : "pointer",
                                    fontFamily: "inherit",
                                    opacity: isAdv ? 0.6 : 1,
                                  }}
                                >
                                  {isAdv && advancing === run.id + act ? "…" : act.toUpperCase()}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 16px", borderTop: `1px solid ${CY}11`,
            color: DIM, fontSize: 9, letterSpacing: 1,
            display: "flex", justifyContent: "space-between",
          }}>
            <span>GET /v1/ritual/list · 90 s poll</span>
            <span>{routines.length} routine{routines.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      )}
    </>
  );
}
