/**
 * MissionControlConsole — F51
 *
 * Parallel-fetches /entities/Task + /entities/SwarmJob + /entities/RiskSignal +
 * /v1/investigations and renders a 4-KPI operational cockpit:
 *   • Tasks   — total / done / active / failed
 *   • Swarms  — running / queued / failed / done
 *   • Risks   — total / critical / high / medium
 *   • Cases   — total / open / closed
 *
 * Each tile has a live status bar (SVG). ▶ ASSESS feeds all counts into
 * /v1/jarvis/agent/chat for a 2-sentence operational brief + TTS via
 * jarvis:speak-dossier.
 *
 * Toggle: ⬛ MCTL at left:71320 bottom:18 (off-screen HUD strip).
 * Ctrl+Shift+L keyboard shortcut.
 * Voice: "mission control / mission console / mctl / control console /
 *         ops console / ops overview / operational overview / ops cockpit"
 * Event: jarvis:mission-control-toggle
 * 45-second auto-refresh.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GRN    = "#00E5A0";
const RED    = "#FF4D6D";
const AMB    = "#FFD700";
const VIOLET = "#A78BFA";
const DARK   = "rgba(5,8,13,0.92)";
const BTN_LEFT = 71320;
const POLL_MS  = 45_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── exports for JarvisBrain ─────────────────────────────────────────────────

export function isMissionControlQuery(q) {
  return /mission.control|mission.console|mctl|control.console|ops.console|ops.overview|operational.overview|ops.cockpit/i.test(
    q || ""
  );
}

export async function buildMissionControlScript() {
  try {
    const [tasks, swarms, risks, cases] = await Promise.all([
      fetchTasks(), fetchSwarms(), fetchRisks(), fetchCases(),
    ]);
    window.dispatchEvent(new CustomEvent("jarvis:mission-control-toggle"));
    const doneTasks  = tasks.filter(t => /done|complete|closed/i.test(t.status)).length;
    const failedSwarm = swarms.filter(s => /fail/i.test(s.status)).length;
    const critRisks  = risks.filter(r => r.severity >= 8 || /critical/i.test(r.level)).length;
    const openCases  = cases.filter(c => /open|active|ongoing/i.test(c.status)).length;
    return `Mission control overview, sir. ${tasks.length} tasks on record — ${doneTasks} complete. ${swarms.length} swarm jobs: ${failedSwarm} in failure state. Risk posture: ${critRisks} critical signal${critRisks !== 1 ? "s" : ""} from ${risks.length} total. ${openCases} investigation case${openCases !== 1 ? "s" : ""} remain open. All KPIs are live on the console.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:mission-control-toggle"));
    return "Mission control console open, sir.";
  }
}

// ─── fetchers ────────────────────────────────────────────────────────────────

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function fetchTasks() {
  try {
    const r = await fetch(`${apiBase()}/entities/Task`, { headers: hdrs });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
  } catch { return []; }
}

async function fetchSwarms() {
  try {
    const r = await fetch(`${apiBase()}/entities/SwarmJob`, { headers: hdrs });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
  } catch { return []; }
}

async function fetchRisks() {
  try {
    const r = await fetch(`${apiBase()}/entities/RiskSignal`, { headers: hdrs });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
  } catch { return []; }
}

async function fetchCases() {
  try {
    const r = await fetch(`${apiBase()}/v1/investigations`, { headers: hdrs });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
  } catch { return []; }
}

// ─── mini progress bar ────────────────────────────────────────────────────────

function Bar({ segments }) {
  // segments = [{pct, color}]; pcts should sum to ≤100
  let x = 0;
  return (
    <svg width="100%" height="6" style={{ display: "block", borderRadius: 3, overflow: "hidden" }}>
      <rect width="100%" height="6" fill="rgba(255,255,255,0.06)" />
      {segments.map((s, i) => {
        const bar = (
          <rect key={i} x={`${x}%`} width={`${s.pct}%`} height="6" fill={s.color} rx="2" />
        );
        x += s.pct;
        return bar;
      })}
    </svg>
  );
}

// ─── kpi tile ─────────────────────────────────────────────────────────────────

function KpiTile({ label, total, rows, barSegments, accentColor }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", border: `1px solid ${accentColor}33`,
      borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "#6E8AA0", letterSpacing: 2, textTransform: "uppercase" }}>
          {label}
        </span>
        <span style={{ fontSize: 20, fontWeight: 700, color: accentColor, letterSpacing: -1 }}>
          {total}
        </span>
      </div>
      <Bar segments={barSegments} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 8px", marginTop: 2 }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
            <span style={{ color: "#6E8AA0" }}>{row.label}</span>
            <span style={{ color: row.color || "#DCEBF5", fontWeight: 600 }}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export default function MissionControlConsole() {
  const [visible, setVisible]     = useState(false);
  const [tasks, setTasks]         = useState([]);
  const [swarms, setSwarms]       = useState([]);
  const [risks, setRisks]         = useState([]);
  const [cases, setCases]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [t, s, r, c] = await Promise.all([
      fetchTasks(), fetchSwarms(), fetchRisks(), fetchCases(),
    ]);
    setTasks(t); setSwarms(s); setRisks(r); setCases(c);
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible(v => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:mission-control-toggle", onToggle);
    return () => window.removeEventListener("jarvis:mission-control-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!visible) return;
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [visible, load]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "L") {
        e.preventDefault();
        setVisible(v => {
          if (!v) load();
          return !v;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [load]);

  async function handleAssess() {
    setAssessing(true);
    try {
      const doneTasks    = tasks.filter(t => /done|complete|closed/i.test(t.status || "")).length;
      const activeTasks  = tasks.filter(t => /active|progress|open/i.test(t.status || "")).length;
      const failedTasks  = tasks.filter(t => /fail/i.test(t.status || "")).length;
      const runSwarms    = swarms.filter(s => /run|active|progress/i.test(s.status || "")).length;
      const failSwarms   = swarms.filter(s => /fail/i.test(s.status || "")).length;
      const critRisks    = risks.filter(r => r.severity >= 8 || /critical/i.test(r.level || "")).length;
      const highRisks    = risks.filter(r => (r.severity >= 5 && r.severity < 8) || /high/i.test(r.level || "")).length;
      const openCases    = cases.filter(c => /open|active|ongoing/i.test(c.status || "")).length;
      const prompt = `Mission control snapshot: ${tasks.length} tasks (${activeTasks} active, ${doneTasks} done, ${failedTasks} failed). ${swarms.length} swarm jobs (${runSwarms} running, ${failSwarms} failed). ${risks.length} risk signals (${critRisks} CRITICAL, ${highRisks} HIGH). ${cases.length} investigation cases (${openCases} open). Give a 2-sentence operational assessment and single most urgent action.`;
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const brief = (data.answer || "Operational status reviewed, sir.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } }));
    } catch {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Mission control assessment unavailable — check network, sir." },
      }));
    }
    setAssessing(false);
  }

  // ── computed metrics ────────────────────────────────────────────────────────

  const taskDone   = tasks.filter(t => /done|complete|closed/i.test(t.status || "")).length;
  const taskActive = tasks.filter(t => /active|progress|open/i.test(t.status || "")).length;
  const taskFailed = tasks.filter(t => /fail/i.test(t.status || "")).length;
  const taskOther  = Math.max(0, tasks.length - taskDone - taskActive - taskFailed);
  const total_T    = tasks.length || 1;

  const swarmRun  = swarms.filter(s => /run|active|progress/i.test(s.status || "")).length;
  const swarmQ    = swarms.filter(s => /queue|pending|wait/i.test(s.status || "")).length;
  const swarmFail = swarms.filter(s => /fail/i.test(s.status || "")).length;
  const swarmDone = swarms.filter(s => /done|complete/i.test(s.status || "")).length;
  const total_S   = swarms.length || 1;

  const riskCrit = risks.filter(r => r.severity >= 8 || /critical/i.test(r.level || "")).length;
  const riskHigh = risks.filter(r => (r.severity >= 5 && r.severity < 8) || /high/i.test(r.level || "")).length;
  const riskMed  = risks.filter(r => (r.severity >= 2 && r.severity < 5) || /medium|med/i.test(r.level || "")).length;
  const riskLow  = Math.max(0, risks.length - riskCrit - riskHigh - riskMed);
  const total_R  = risks.length || 1;

  const caseOpen   = cases.filter(c => /open|active|ongoing/i.test(c.status || "")).length;
  const caseClosed = cases.filter(c => /closed?|done|resolved?|complete/i.test(c.status || "")).length;
  const caseOther  = Math.max(0, cases.length - caseOpen - caseClosed);
  const total_C    = cases.length || 1;

  return (
    <>
      {/* off-screen HUD button */}
      <button
        onClick={() => { setVisible(v => { if (!v) load(); return !v; }); }}
        title="Mission Control Console (Ctrl+Shift+L)"
        style={{
          position: "fixed", bottom: 18, left: BTN_LEFT, zIndex: 70,
          background: visible ? CY : "rgba(5,8,13,0.75)",
          color: visible ? "#04060A" : CY,
          border: `1px solid ${CY}55`, borderRadius: 4, padding: "2px 7px",
          fontSize: 10, letterSpacing: 1.5, cursor: "pointer", fontFamily: "monospace",
          boxShadow: visible ? `0 0 12px ${CY}` : "none",
        }}
      >
        ⬛ MCTL
      </button>

      {visible && (
        <div style={{
          position: "fixed", left: 18, top: 72, zIndex: 70,
          width: "min(460px, 92vw)",
          background: DARK, border: `1px solid ${CY}44`,
          borderRadius: 12, padding: "14px 16px",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 40px ${CY}18`,
          fontFamily: "'JetBrains Mono', monospace",
          maxHeight: "calc(100vh - 100px)",
          overflowY: "auto",
        }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: CY,
                boxShadow: `0 0 10px ${CY}`, display: "inline-block" }} />
              <span style={{ color: CY, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
                MISSION CONTROL
              </span>
              {loading && (
                <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>LOADING…</span>
              )}
            </div>
            <button
              onClick={() => setVisible(false)}
              style={{ background: "none", border: "none", color: "#6E8AA0",
                cursor: "pointer", fontSize: 14, lineHeight: 1 }}
            >✕</button>
          </div>

          {/* KPI grid — 2×2 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <KpiTile
              label="Tasks"
              total={tasks.length}
              accentColor={GRN}
              barSegments={[
                { pct: (taskDone / total_T) * 100, color: GRN },
                { pct: (taskActive / total_T) * 100, color: CY },
                { pct: (taskFailed / total_T) * 100, color: RED },
              ]}
              rows={[
                { label: "Done",   value: taskDone,   color: GRN },
                { label: "Active", value: taskActive, color: CY },
                { label: "Failed", value: taskFailed, color: RED },
                { label: "Other",  value: taskOther,  color: "#6E8AA0" },
              ]}
            />
            <KpiTile
              label="Swarm Jobs"
              total={swarms.length}
              accentColor={VIOLET}
              barSegments={[
                { pct: (swarmRun  / total_S) * 100, color: CY },
                { pct: (swarmQ   / total_S) * 100, color: VIOLET },
                { pct: (swarmFail / total_S) * 100, color: RED },
                { pct: (swarmDone / total_S) * 100, color: GRN },
              ]}
              rows={[
                { label: "Running", value: swarmRun,  color: CY },
                { label: "Queued",  value: swarmQ,    color: VIOLET },
                { label: "Failed",  value: swarmFail, color: RED },
                { label: "Done",    value: swarmDone, color: GRN },
              ]}
            />
            <KpiTile
              label="Risk Signals"
              total={risks.length}
              accentColor={RED}
              barSegments={[
                { pct: (riskCrit / total_R) * 100, color: RED },
                { pct: (riskHigh / total_R) * 100, color: AMB },
                { pct: (riskMed  / total_R) * 100, color: VIOLET },
                { pct: (riskLow  / total_R) * 100, color: GRN },
              ]}
              rows={[
                { label: "Critical", value: riskCrit, color: RED },
                { label: "High",     value: riskHigh, color: AMB },
                { label: "Medium",   value: riskMed,  color: VIOLET },
                { label: "Low",      value: riskLow,  color: GRN },
              ]}
            />
            <KpiTile
              label="Investigations"
              total={cases.length}
              accentColor={AMB}
              barSegments={[
                { pct: (caseOpen   / total_C) * 100, color: AMB },
                { pct: (caseClosed / total_C) * 100, color: GRN },
                { pct: (caseOther  / total_C) * 100, color: "#6E8AA0" },
              ]}
              rows={[
                { label: "Open",   value: caseOpen,   color: AMB },
                { label: "Closed", value: caseClosed, color: GRN },
                { label: "Other",  value: caseOther,  color: "#6E8AA0" },
              ]}
            />
          </div>

          {/* assess button */}
          <button
            onClick={handleAssess}
            disabled={assessing}
            style={{
              width: "100%", padding: "7px 0", borderRadius: 6,
              border: `1px solid ${CY}55`, background: "rgba(41,231,255,0.08)",
              color: CY, fontSize: 10, letterSpacing: 2, cursor: assessing ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {assessing ? "▶ ASSESSING…" : "▶ ASSESS OPERATIONAL STATUS"}
          </button>

          {/* footer */}
          <div style={{ marginTop: 8, fontSize: 9, color: "#6E8AA0", letterSpacing: 1, textAlign: "right" }}>
            AUTO-REFRESH 45 s · Ctrl+Shift+L
          </div>
        </div>
      )}
    </>
  );
}
