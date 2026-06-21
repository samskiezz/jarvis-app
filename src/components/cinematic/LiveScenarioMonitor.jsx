/**
 * LiveScenarioMonitor — F52
 * Passive real-time status board for all JARVIS scenarios.
 *
 * Polls /v1/scenario/list every 30 s. Tracks transitions between poll
 * cycles: when a scenario moves to "completed" or "failed" it dispatches
 * jarvis:speak-dossier so the user hears about it hands-free.
 *
 * This is NOT the scenario launcher (F13 / ScenarioLauncher.jsx).
 * That lets you pick and run; this watches what is already running.
 *
 * Toggle:  ▶ SMON  at left:5304 in the bottom strip.
 * Event:   jarvis:scenario-monitor-toggle
 * Voice:   "scenario monitor" | "running scenarios" | "simulation status" | "scenario status"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GN  = "#39FF14";
const AM  = "#F5A623";
const RD  = "#FF4444";
const PU  = "#B97FFF";
const DIM = "#4A6070";
const BG  = "rgba(3,5,9,0.97)";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const POLL = 30_000;

const STATUS_COLOR = {
  running:   CY,
  pending:   AM,
  completed: GN,
  failed:    RD,
  queued:    PU,
};
const STATUS_ICON = {
  running:   "▶",
  pending:   "◷",
  completed: "✓",
  failed:    "✗",
  queued:    "…",
};

const SMON_RE =
  /\b(scenario[\s-]?monitor|running[\s-]?scenario|simulation[\s-]?status|scenario[\s-]?status|playbook[\s-]?status|smon)\b/i;

export function isScenarioMonitorQuery(t) {
  return SMON_RE.test(t || "");
}

async function fetchScenarios() {
  const r = await fetch(`${apiBase()}/v1/scenario/list`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return Array.isArray(d) ? d : (d.scenarios ?? d.data ?? []);
}

export async function buildScenarioMonitorScript() {
  try {
    const scenarios = await fetchScenarios();
    const total     = scenarios.length;
    const running   = scenarios.filter(s => (s.status || "").toLowerCase() === "running").length;
    const completed = scenarios.filter(s => (s.status || "").toLowerCase() === "completed").length;
    const failed    = scenarios.filter(s => (s.status || "").toLowerCase() === "failed").length;
    const pending   = total - running - completed - failed;
    const parts = [];
    if (running)   parts.push(`${running} running`);
    if (pending)   parts.push(`${pending} pending`);
    if (completed) parts.push(`${completed} completed`);
    if (failed)    parts.push(`${failed} failed`);
    if (!total)    return "No scenarios are registered in the simulation theatre at this time, sir.";
    return (
      `Scenario monitor active, sir. ${total} simulation${total !== 1 ? "s" : ""} registered: ` +
      parts.join(", ") + ". " +
      (running
        ? `I am actively watching ${running} running playbook${running !== 1 ? "s" : ""} and will alert you on completion or failure.`
        : "No playbooks are currently executing.")
    );
  } catch (_) {
    return "Unable to reach the simulation theatre at this time, sir.";
  }
}

export default function LiveScenarioMonitor() {
  const [open,      setOpen]      = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [badge,     setBadge]     = useState(0);
  const prevRef   = useRef(null);
  const timerRef  = useRef(null);

  const poll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchScenarios();
      setScenarios(data);

      if (prevRef.current !== null) {
        const prevMap = Object.fromEntries(prevRef.current.map(s => [s.id ?? s.name, s.status]));
        let alerts = 0;
        const transitions = [];
        for (const s of data) {
          const key  = s.id ?? s.name;
          const prev = prevMap[key];
          const curr = (s.status || "").toLowerCase();
          if (prev && prev.toLowerCase() !== curr && (curr === "completed" || curr === "failed")) {
            transitions.push({ name: s.name ?? s.title ?? key, status: curr });
            alerts++;
          }
        }
        if (transitions.length > 0) {
          setBadge(v => v + alerts);
          const msg = transitions
            .map(t => `Scenario "${t.name}" has ${t.status === "completed" ? "completed successfully" : "failed"}.`)
            .join(" ");
          window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: msg } }));
        }
      }
      prevRef.current = data;
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:scenario-monitor-toggle", handler);
    return () => window.removeEventListener("jarvis:scenario-monitor-toggle", handler);
  }, []);

  useEffect(() => {
    poll();
    timerRef.current = setInterval(poll, POLL);
    return () => clearInterval(timerRef.current);
  }, [poll]);

  useEffect(() => { if (open) setBadge(0); }, [open]);

  const counts = scenarios.reduce((acc, s) => {
    const st = (s.status || "pending").toLowerCase();
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, {});
  const hasRunning = (counts.running || 0) > 0;
  const hasFailed  = (counts.failed  || 0) > 0;
  const accent     = hasFailed ? RD : hasRunning ? CY : GN;

  return (
    <>
      {open && (
        <div style={{
          position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
          width: 560, maxHeight: "calc(100vh - 100px)",
          background: BG, border: `1px solid ${CY}33`, borderRadius: 10,
          zIndex: 72, display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          boxShadow: `0 0 40px ${CY}15`, overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${CY}22`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: CY, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>
                ▶ SCENARIO MONITOR
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 12 }}
              >✕</button>
            </div>
            <div style={{ color: DIM, fontSize: 7, marginTop: 2, letterSpacing: 0.5 }}>
              /v1/scenario/list — 30 s polling · {scenarios.length} scenario{scenarios.length !== 1 ? "s" : ""} registered
              {loading && <span style={{ color: CY, marginLeft: 8 }}>◌</span>}
            </div>
            {/* Status summary tiles */}
            {scenarios.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {Object.entries(counts).map(([st, n]) => (
                  <div key={st} style={{
                    display: "flex", alignItems: "center", gap: 4,
                    background: `${STATUS_COLOR[st] || DIM}18`,
                    border: `1px solid ${STATUS_COLOR[st] || DIM}44`,
                    borderRadius: 4, padding: "2px 7px",
                  }}>
                    <span style={{ color: STATUS_COLOR[st] || DIM, fontSize: 8 }}>
                      {STATUS_ICON[st] || "·"}
                    </span>
                    <span style={{ color: STATUS_COLOR[st] || DIM, fontSize: 8, letterSpacing: 1 }}>
                      {n} {st}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Scenario list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
            {error && (
              <div style={{ color: RD, fontSize: 8, padding: "4px 0" }}>{error}</div>
            )}
            {scenarios.length === 0 ? (
              <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 30 }}>
                {loading ? "Loading scenarios…" : "No scenarios registered."}
              </div>
            ) : (
              scenarios
                .slice()
                .sort((a, b) => {
                  const order = { running: 0, pending: 1, queued: 2, failed: 3, completed: 4 };
                  const as = order[(a.status || "").toLowerCase()] ?? 5;
                  const bs = order[(b.status || "").toLowerCase()] ?? 5;
                  return as - bs;
                })
                .map((s, i) => {
                  const st  = (s.status || "pending").toLowerCase();
                  const col = STATUS_COLOR[st] || DIM;
                  const title = s.name ?? s.title ?? s.id ?? `Scenario ${i + 1}`;
                  const desc  = s.description ?? s.objective ?? "";
                  const outcome = s.outcome ?? s.result ?? "";
                  return (
                    <div key={s.id ?? i} style={{
                      padding: "7px 0", borderBottom: `1px solid ${DIM}18`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          color: col, fontSize: 10, width: 12, textAlign: "center",
                          animation: st === "running" ? "smon-spin 2s linear infinite" : "none",
                        }}>
                          {STATUS_ICON[st] || "·"}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            color: "#DCEBF5", fontSize: 9, fontWeight: 600,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {title}
                          </div>
                          {desc && (
                            <div style={{
                              color: DIM, fontSize: 7, marginTop: 1,
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            }}>
                              {desc}
                            </div>
                          )}
                          {outcome && (
                            <div style={{ color: col, fontSize: 7, marginTop: 2, fontStyle: "italic" }}>
                              ↳ {outcome}
                            </div>
                          )}
                        </div>
                        <span style={{
                          color: col, fontSize: 7, letterSpacing: 1,
                          border: `1px solid ${col}44`, borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                        }}>
                          {st}
                        </span>
                      </div>
                    </div>
                  );
                })
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 14px", borderTop: `1px solid ${CY}11`,
            flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 7, color: DIM, letterSpacing: 0.5 }}>
              Auto-announces completions + failures via JARVIS TTS
            </span>
            <span style={{ fontSize: 7, color: DIM }}>30 s refresh</span>
          </div>
        </div>
      )}

      {/* Bottom-strip toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Scenario Monitor — live status of all simulation playbooks"
        style={{
          position: "fixed", left: 5304, bottom: 18, zIndex: 68,
          background: open ? accent : "rgba(5,8,13,0.75)",
          color: open ? "#030509" : accent,
          border: `1px solid ${accent}`,
          borderRadius: 6, padding: "3px 8px",
          fontSize: 8, fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1.5, cursor: "pointer",
          backdropFilter: "blur(6px)",
          boxShadow: open ? `0 0 12px ${accent}` : "none",
          animation: !open && badge > 0 ? "smon-pulse 1.5s ease-in-out infinite" : "none",
        }}
      >
        ▶ SMON
        {badge > 0 && (
          <span style={{
            marginLeft: 4, background: AM, color: "#030509",
            borderRadius: 8, fontSize: 7, padding: "0 4px", fontWeight: 700,
          }}>{badge}</span>
        )}
      </button>

      <style>{`
        @keyframes smon-pulse {
          0%, 100% { box-shadow: 0 0 4px ${AM}; }
          50%       { box-shadow: 0 0 16px ${AM}; }
        }
        @keyframes smon-spin {
          0%   { opacity: 1; }
          50%  { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}</style>
    </>
  );
}
