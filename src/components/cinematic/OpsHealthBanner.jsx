/**
 * OpsHealthBanner — F41
 *
 * Persistent slim ops-health strip fixed at bottom:54, visible once first
 * data arrives. Parallel-polls four confirmed-real endpoints every 30–60 s:
 *   • /v1/jarvis/system/status → overall system health (cpu/mem/load)
 *   • /entities/RiskSignal     → critical + high risk counts
 *   • /entities/Task            → open task count
 *   • /entities/SwarmJob        → running/queued job count
 *
 * Four colour-coded pills with click-to-open-panel via jarvis:ask.
 * Voice trigger: "ops health" / "operational health" / "ops summary" / "ohb"
 * Event: jarvis:ohb-toggle
 * Toggle: ◈ OHB at left:8732, zIndex:64
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF3D5A";
const AMB = "#F5A623";
const GRN = "#00E5A0";
const DIM = "#4a5568";

const BTN_LEFT  = 8732;
const POLL_SYS  = 30_000;
const POLL_ENT  = 60_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isOpsHealthBannerQuery(q) {
  return /\bops.health\b|\boperational.health\b|\bops.summary\b|\bops.banner\b|\bhealth.banner\b|\bohb\b/i.test(q || "");
}

export async function buildOpsHealthBannerScript() {
  const hdrs = { Authorization: `Bearer ${API_KEY}` };
  let sysOk = true, cpuPct = 0, critRisks = 0, highRisks = 0, openTasks = 0, runningJobs = 0;

  try {
    const r = await fetch(`${apiBase()}/v1/jarvis/system/status`, { headers: hdrs });
    if (r.ok) {
      const d = await r.json();
      cpuPct = Math.round(
        (d?.cpu_percent ?? d?.cpu ?? d?.system?.cpu_percent ?? 0)
      );
      const load = d?.load_avg ?? d?.load ?? d?.system?.load_avg ?? 0;
      sysOk = cpuPct < 90 && load < 4;
    }
  } catch (_) {}

  try {
    const r = await fetch(`${apiBase()}/entities/RiskSignal`, { headers: hdrs });
    if (r.ok) {
      const d = await r.json();
      const arr = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
      critRisks = arr.filter(x => (x.severity || x.level || "").toLowerCase() === "critical").length;
      highRisks = arr.filter(x => (x.severity || x.level || "").toLowerCase() === "high").length;
    }
  } catch (_) {}

  try {
    const r = await fetch(`${apiBase()}/entities/Task`, { headers: hdrs });
    if (r.ok) {
      const d = await r.json();
      const arr = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
      openTasks = arr.filter(x => !["done","complete","completed","closed","cancelled"].includes(
        (x.status || "").toLowerCase()
      )).length;
    }
  } catch (_) {}

  try {
    const r = await fetch(`${apiBase()}/entities/SwarmJob`, { headers: hdrs });
    if (r.ok) {
      const d = await r.json();
      const arr = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
      runningJobs = arr.filter(x => ["running","queued","pending"].includes(
        (x.status || "").toLowerCase()
      )).length;
    }
  } catch (_) {}

  window.dispatchEvent(new CustomEvent("jarvis:ohb-toggle"));

  if (!sysOk) {
    return `Ops health banner is live, sir. System is under load at ${cpuPct}% CPU. ${critRisks} critical risk signal${critRisks !== 1 ? "s" : ""} detected. ${openTasks} task${openTasks !== 1 ? "s" : ""} open. ${runningJobs} swarm job${runningJobs !== 1 ? "s" : ""} active. Recommend reviewing service diagnostics immediately.`;
  }
  if (critRisks > 0) {
    return `Ops health banner reporting, sir. ${critRisks} critical risk signal${critRisks !== 1 ? "s" : ""} require immediate attention. System nominal at ${cpuPct}% CPU. ${openTasks} task${openTasks !== 1 ? "s" : ""} open. ${runningJobs} swarm job${runningJobs !== 1 ? "s" : ""} active.`;
  }
  return `Operational health is nominal, sir. System at ${cpuPct}% CPU. ${highRisks} elevated risk${highRisks !== 1 ? "s" : ""}. ${openTasks} task${openTasks !== 1 ? "s" : ""} open. ${runningJobs} swarm job${runningJobs !== 1 ? "s" : ""} active. All clear.`;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function sysPillColor(cpu, loadAvg) {
  if (cpu >= 90 || loadAvg >= 4) return RED;
  if (cpu >= 65 || loadAvg >= 2) return AMB;
  return GRN;
}

function riskPillColor(crit, high) {
  if (crit > 0) return RED;
  if (high > 0) return AMB;
  return CY;
}

function pill(label, value, color, title, onClick) {
  return (
    <button
      key={label}
      title={title}
      onClick={onClick}
      style={{
        background: "rgba(0,0,0,0)",
        border: `1px solid ${color}44`,
        borderRadius: 3,
        padding: "0 8px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 5,
        height: 22,
        outline: "none",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ color: "#8899aa", fontSize: 9, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1, textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ color, fontSize: 10, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, letterSpacing: 0.5 }}>
        {value}
      </span>
    </button>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function OpsHealthBanner() {
  const [open, setOpen] = useState(false);
  const [hasData, setHasData] = useState(false);

  const [cpu, setCpu]         = useState(0);
  const [loadAvg, setLoadAvg] = useState(0);
  const [sysLabel, setSysLabel] = useState("—");

  const [critRisks, setCritRisks] = useState(0);
  const [highRisks, setHighRisks] = useState(0);

  const [openTasks, setOpenTasks]    = useState(0);
  const [runningJobs, setRunningJobs] = useState(0);

  const sysTimer  = useRef(null);
  const entTimers = useRef(null);
  const hdrs = { Authorization: `Bearer ${API_KEY}` };

  const fetchSys = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/system/status`, { headers: hdrs });
      if (!r.ok) return;
      const d = await r.json();
      const c = Math.round(d?.cpu_percent ?? d?.cpu ?? d?.system?.cpu_percent ?? 0);
      const l = d?.load_avg ?? d?.load ?? d?.system?.load_avg ?? 0;
      setCpu(c);
      setLoadAvg(l);
      if (c >= 90 || l >= 4) setSysLabel("LOAD");
      else if (c >= 65 || l >= 2) setSysLabel("WARN");
      else setSysLabel("OK");
      setHasData(true);
    } catch (_) {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRisks = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/entities/RiskSignal`, { headers: hdrs });
      if (!r.ok) return;
      const d = await r.json();
      const arr = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
      setCritRisks(arr.filter(x => (x.severity || x.level || "").toLowerCase() === "critical").length);
      setHighRisks(arr.filter(x => (x.severity || x.level || "").toLowerCase() === "high").length);
      setHasData(true);
    } catch (_) {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTasks = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/entities/Task`, { headers: hdrs });
      if (!r.ok) return;
      const d = await r.json();
      const arr = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
      setOpenTasks(arr.filter(x => !["done","complete","completed","closed","cancelled"].includes(
        (x.status || "").toLowerCase()
      )).length);
      setHasData(true);
    } catch (_) {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSwarm = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/entities/SwarmJob`, { headers: hdrs });
      if (!r.ok) return;
      const d = await r.json();
      const arr = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
      setRunningJobs(arr.filter(x => ["running","queued","pending"].includes(
        (x.status || "").toLowerCase()
      )).length);
      setHasData(true);
    } catch (_) {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSys();
    fetchRisks();
    fetchTasks();
    fetchSwarm();

    sysTimer.current = setInterval(fetchSys, POLL_SYS);
    entTimers.current = setInterval(() => {
      fetchRisks();
      fetchTasks();
      fetchSwarm();
    }, POLL_ENT);

    return () => {
      clearInterval(sysTimer.current);
      clearInterval(entTimers.current);
    };
  }, [fetchSys, fetchRisks, fetchTasks, fetchSwarm]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:ohb-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ohb-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (hasData && !open) setOpen(true);
  }, [hasData]); // eslint-disable-line react-hooks/exhaustive-deps

  const dispatch = (text) =>
    window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { text } }));

  const sysColor  = sysPillColor(cpu, loadAvg);
  const riskColor = riskPillColor(critRisks, highRisks);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Ops Health Banner (F41)"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 64,
          background: open ? `${CY}22` : "rgba(0,0,0,0.55)",
          border: `1px solid ${open ? CY : "#334155"}`,
          color: open ? CY : DIM,
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9,
          letterSpacing: 1.5,
          padding: "3px 8px",
          cursor: "pointer",
          borderRadius: 2,
          textTransform: "uppercase",
        }}
      >
        ◈ OHB
        {critRisks > 0 && (
          <span style={{
            marginLeft: 5,
            background: RED,
            color: "#fff",
            borderRadius: 8,
            padding: "0 4px",
            fontSize: 8,
            fontWeight: 700,
          }}>
            {critRisks}
          </span>
        )}
      </button>

      {/* Banner strip */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 40,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 64,
            background: "rgba(8,12,26,0.88)",
            border: `1px solid ${CY}22`,
            borderRadius: 4,
            padding: "3px 10px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            backdropFilter: "blur(6px)",
            boxShadow: `0 0 12px ${CY}18`,
          }}
        >
          <span style={{
            color: "#4a5568",
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 8,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginRight: 4,
            flexShrink: 0,
          }}>
            OPS
          </span>

          {pill(
            "SYS",
            sysLabel,
            sysColor,
            `CPU: ${cpu}%  Load: ${typeof loadAvg === "number" ? loadAvg.toFixed(2) : loadAvg} — click for service diagnostics`,
            () => dispatch("service health")
          )}

          {pill(
            "RISKS",
            critRisks > 0 ? `${critRisks}C${highRisks > 0 ? ` ${highRisks}H` : ""}` : highRisks > 0 ? `${highRisks}H` : "CLEAR",
            riskColor,
            `${critRisks} critical, ${highRisks} high risk signals — click for risk board`,
            () => dispatch("risk board")
          )}

          {pill(
            "TASKS",
            String(openTasks),
            CY,
            `${openTasks} open tasks — click for task board`,
            () => dispatch("task board")
          )}

          {pill(
            "SWARM",
            String(runningJobs),
            runningJobs > 0 ? GRN : DIM,
            `${runningJobs} active swarm jobs — click for swarm monitor`,
            () => dispatch("swarm jobs")
          )}

          <span style={{
            color: "#334155",
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 8,
            marginLeft: 4,
            flexShrink: 0,
          }}>
            30s
          </span>
        </div>
      )}
    </>
  );
}
