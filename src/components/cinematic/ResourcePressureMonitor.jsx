/**
 * ResourcePressureMonitor — F57.
 *
 * Correlates live system resources with running swarm workloads:
 *   /v1/jarvis/system/status  — CPU %, MEM %, load average
 *   /entities/SwarmJob        — running / queued jobs
 *   /v1/ops/events            — last 5 events for context
 *
 * Computes a 0–100 "pressure score" (weighted CPU 40 % + MEM 30 % +
 * load-ratio 20 % + job-density 10 %) and renders it as a gauge bar.
 *
 * Toggle:  ⊡ RPRES  at left:7668, bottom:8, zIndex 65
 * Event:   jarvis:respres-toggle
 * Voice:   "resource pressure" | "system load analysis" |
 *          "what's using resources" | "respres" | "load analysis" |
 *          "resource monitor" | "swarm load"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#f59e0b";
const RD   = "#ef4444";
const GR   = "#22c55e";
const BG   = "rgba(3,5,9,0.97)";
const BTN_LEFT = 7668;
const MONO = "'JetBrains Mono','Courier New',monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const RESPRES_RE =
  /\b(resource[\s-]?pressure|system[\s-]?load[\s-]?anal|what.{0,10}using[\s-]?resource|respres|load[\s-]?anal|resource[\s-]?monitor|swarm[\s-]?load)\b/i;

export function isRespresQuery(t) {
  return RESPRES_RE.test(t || "");
}

export async function buildRespresScript() {
  const API_KEY_LOCAL =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

  const [sysR, jobsR, opsR] = await Promise.allSettled([
    fetch(`${apiBase()}/v1/jarvis/system/status`,
      { headers: { Authorization: `Bearer ${API_KEY_LOCAL}` } }).then((r) => r.json()),
    fetch(`${apiBase()}/entities/SwarmJob`,
      { headers: { Authorization: `Bearer ${API_KEY_LOCAL}` } }).then((r) => r.json()),
    fetch(`${apiBase()}/v1/ops/events`,
      { headers: { Authorization: `Bearer ${API_KEY_LOCAL}` } }).then((r) => r.json()),
  ]);

  const sys  = sysR.status  === "fulfilled" ? sysR.value  : {};
  const jobs = jobsR.status === "fulfilled" ? jobsR.value : {};
  const ops  = opsR.status  === "fulfilled" ? opsR.value  : {};

  const cpu  = sys?.cpu_usage ?? sys?.cpu ?? 0;
  const mem  = sys?.memory_usage ?? sys?.mem ?? 0;
  const load = sys?.load_average ?? sys?.load ?? 0;
  const allJobs  = Array.isArray(jobs) ? jobs : (jobs?.data ?? jobs?.results ?? []);
  const running  = allJobs.filter((j) => (j.status || "").toLowerCase() === "running").length;
  const total    = allJobs.length || 1;
  const jobDens  = Math.min(100, (running / total) * 100);
  const pressure = Math.round(cpu * 0.4 + mem * 0.3 + Math.min(load * 25, 100) * 0.2 + jobDens * 0.1);

  const allOps   = Array.isArray(ops) ? ops : (ops?.data ?? ops?.results ?? []);
  const recentOps = allOps.slice(0, 3)
    .map((e) => `${e.severity ?? "?"} — ${e.message ?? e.description ?? e.type ?? "event"}`)
    .join("; ");

  const prompt = `You are JARVIS. Give a concise (2–3 sentence) spoken resource-pressure briefing. ` +
    `System: CPU ${cpu}%, MEM ${mem}%, load ${load}. ` +
    `Swarm: ${running} running jobs of ${total} total. ` +
    `Pressure score: ${pressure}/100. ` +
    `Recent ops: ${recentOps || "none"}. ` +
    `State whether the system is under pressure and identify the primary driver, sir.`;

  const cr = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY_LOCAL}` },
    body: JSON.stringify({ message: prompt }),
  });
  const cd = await cr.json();
  const narrative = (cd.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
  return (
    narrative ||
    `Resource pressure is at ${pressure}/100, sir. CPU at ${cpu}%, memory at ${mem}%, ` +
    `with ${running} swarm jobs running.`
  );
}

function pressureColor(score) {
  if (score >= 80) return RD;
  if (score >= 55) return AM;
  return GR;
}

function usePoll(fn, ms) {
  const savedFn = useRef(fn);
  useEffect(() => { savedFn.current = fn; }, [fn]);
  useEffect(() => {
    savedFn.current();
    const id = setInterval(() => savedFn.current(), ms);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
}

export default function ResourcePressureMonitor() {
  const [open, setOpen]         = useState(false);
  const [sysData, setSysData]   = useState(null);
  const [jobs, setJobs]         = useState([]);
  const [ops, setOps]           = useState([]);
  const [assessing, setAssess]  = useState(false);
  const [assessment, setAss]    = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [sR, jR, oR] = await Promise.allSettled([
        fetch(`${apiBase()}/v1/jarvis/system/status`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then((r) => r.json()),
        fetch(`${apiBase()}/entities/SwarmJob`,       { headers: { Authorization: `Bearer ${API_KEY}` } }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/ops/events`,           { headers: { Authorization: `Bearer ${API_KEY}` } }).then((r) => r.json()),
      ]);
      if (sR.status === "fulfilled") setSysData(sR.value);
      if (jR.status === "fulfilled") {
        const raw = jR.value;
        setJobs(Array.isArray(raw) ? raw : (raw?.data ?? raw?.results ?? []));
      }
      if (oR.status === "fulfilled") {
        const raw = oR.value;
        setOps((Array.isArray(raw) ? raw : (raw?.data ?? raw?.results ?? [])).slice(0, 5));
      }
    } catch (_) {}
  }, []);

  usePoll(fetchData, 30000);

  useEffect(() => {
    const h = () => { setOpen((v) => !v); };
    window.addEventListener("jarvis:respres-toggle", h);
    return () => window.removeEventListener("jarvis:respres-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    setAssess(true); setAss("");
    try {
      const text = await buildRespresScript();
      setAss(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setAss("Unable to reach the intelligence core, sir.");
    } finally {
      setAssess(false);
    }
  }, []);

  const cpu  = sysData?.cpu_usage ?? sysData?.cpu ?? 0;
  const mem  = sysData?.memory_usage ?? sysData?.mem ?? 0;
  const load = sysData?.load_average ?? sysData?.load ?? 0;

  const running = jobs.filter((j) => (j.status || "").toLowerCase() === "running");
  const queued  = jobs.filter((j) => (j.status || "").toLowerCase() === "queued" ||
                                     (j.status || "").toLowerCase() === "pending");
  const total   = jobs.length || 1;
  const jobDens = Math.min(100, (running.length / total) * 100);
  const pressure = Math.round(cpu * 0.4 + mem * 0.3 + Math.min(load * 25, 100) * 0.2 + jobDens * 0.1);
  const pColor  = pressureColor(pressure);

  const label = pressure >= 80 ? "CRITICAL" : pressure >= 55 ? "ELEVATED" : "NOMINAL";

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Resource Pressure Monitor — CPU/MEM/jobs correlation (F57)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
          background: open ? `rgba(41,231,255,0.12)` : "rgba(5,12,20,0.75)",
          border: `1px solid ${open ? CY : "rgba(41,231,255,0.22)"}`,
          color: sysData ? pColor : CY,
          fontFamily: MONO, fontSize: 10, letterSpacing: 1.2,
          padding: "4px 8px", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(6px)",
          boxShadow: pressure >= 80 ? `0 0 8px ${RD}55` : "none",
          animation: pressure >= 80 ? "rpulse 1.4s ease-in-out infinite" : "none",
        }}
      >
        ⊡ RPRES{sysData ? ` ${pressure}` : ""}
      </button>

      {open && (
        <div style={{
          position: "fixed",
          bottom: 36, left: Math.min(BTN_LEFT, window.innerWidth - 440),
          zIndex: 66, width: "min(420px, 92vw)",
          background: BG, border: `1px solid ${CY}33`,
          borderTop: `2px solid ${pColor}`,
          borderRadius: 10, padding: "14px 16px",
          backdropFilter: "blur(14px)", fontFamily: MONO,
          boxShadow: `0 0 40px ${pColor}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{
              width: 10, height: 10, borderRadius: "50%", background: pColor,
              boxShadow: `0 0 10px ${pColor}`, flexShrink: 0,
              animation: pressure >= 80 ? "rpulse 1.4s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, flex: 1 }}>
              RESOURCE PRESSURE
            </span>
            <span style={{ fontSize: 9, letterSpacing: 1, color: pColor, padding: "1px 6px",
              border: `1px solid ${pColor}55`, borderRadius: 4 }}>
              {label}
            </span>
            <button onClick={() => { setOpen(false); setAss(""); }}
              style={{ background: "transparent", border: "none", color: "#3a5060",
                cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 6 }}>✕</button>
          </div>

          {/* Pressure gauge */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between",
              fontSize: 9, letterSpacing: 1, color: "#3a5060", marginBottom: 3 }}>
              <span>PRESSURE SCORE</span>
              <span style={{ color: pColor }}>{pressure}/100</span>
            </div>
            <div style={{ height: 6, background: "rgba(41,231,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pressure}%`,
                background: `linear-gradient(90deg, ${GR}, ${pColor})`,
                borderRadius: 3, transition: "width 0.6s ease" }} />
            </div>
          </div>

          {/* System stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
            {[
              { label: "CPU", val: `${cpu}%`, color: cpu > 80 ? RD : cpu > 55 ? AM : CY },
              { label: "MEM", val: `${mem}%`, color: mem > 80 ? RD : mem > 55 ? AM : CY },
              { label: "LOAD", val: load.toFixed ? load.toFixed(2) : load, color: load > 4 ? RD : load > 2 ? AM : CY },
            ].map(({ label: l, val, color }) => (
              <div key={l} style={{ background: "rgba(41,231,255,0.05)", border: `1px solid rgba(41,231,255,0.1)`,
                borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "#3a5060", letterSpacing: 1, marginBottom: 2 }}>{l}</div>
                <div style={{ fontSize: 16, color, fontWeight: 700, letterSpacing: 1 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Swarm job summary */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, letterSpacing: 1, color: "#3a5060", marginBottom: 5 }}>
              SWARM JOBS ({jobs.length} total)
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[
                { l: "RUNNING", n: running.length, c: CY },
                { l: "QUEUED",  n: queued.length,  c: AM },
                { l: "OTHER",   n: jobs.length - running.length - queued.length, c: "#3a5060" },
              ].map(({ l, n, c }) => (
                <div key={l} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${c}33`,
                  borderRadius: 5, padding: "3px 8px", fontSize: 9, color: c, letterSpacing: 1 }}>
                  {l}: <b style={{ color: c }}>{n}</b>
                </div>
              ))}
            </div>
            {running.length > 0 && (
              <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 3 }}>
                {running.slice(0, 4).map((j, i) => (
                  <span key={i} style={{ fontSize: 9, color: "#4a8aa0", background: "rgba(41,231,255,0.05)",
                    border: "1px solid rgba(41,231,255,0.12)", borderRadius: 4, padding: "1px 5px" }}>
                    {j.name ?? j.type ?? j.id ?? "job"}
                  </span>
                ))}
                {running.length > 4 && (
                  <span style={{ fontSize: 9, color: "#3a5060" }}>+{running.length - 4} more</span>
                )}
              </div>
            )}
          </div>

          {/* Recent ops events */}
          {ops.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, letterSpacing: 1, color: "#3a5060", marginBottom: 4 }}>
                RECENT OPS EVENTS
              </div>
              {ops.slice(0, 3).map((e, i) => {
                const sev = (e.severity || "").toLowerCase();
                const ec = sev === "critical" ? RD : sev === "high" ? AM : "#4a8aa0";
                return (
                  <div key={i} style={{ fontSize: 10, color: "#7a9ab0", lineHeight: 1.4,
                    padding: "2px 0", borderBottom: "1px solid rgba(41,231,255,0.06)" }}>
                    <span style={{ color: ec, marginRight: 5 }}>◆</span>
                    {e.message ?? e.description ?? e.type ?? "event"}
                  </div>
                );
              })}
            </div>
          )}

          {/* Assessment */}
          {assessment && (
            <div style={{ marginBottom: 10, fontSize: 11, color: "#B0CCD8", lineHeight: 1.6,
              borderLeft: `2px solid ${pColor}55`, paddingLeft: 8 }}>
              {assessment}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: "transparent", border: `1px solid ${CY}66`,
                color: CY, fontFamily: MONO, fontSize: 10, letterSpacing: 1,
                padding: "3px 10px", borderRadius: 5, cursor: assessing ? "default" : "pointer",
                opacity: assessing ? 0.5 : 1,
              }}>
              ▶ {assessing ? "analysing…" : "ASSESS"}
            </button>
            <button
              onClick={fetchData}
              style={{ background: "transparent", border: `1px solid rgba(41,231,255,0.2)`,
                color: "#3a5060", fontFamily: MONO, fontSize: 10, letterSpacing: 1,
                padding: "3px 8px", borderRadius: 5, cursor: "pointer" }}>
              ↻
            </button>
            <span style={{ marginLeft: "auto", fontSize: 9, color: "#2a3a4a" }}>
              /v1/jarvis/system/status · /entities/SwarmJob · /v1/ops/events
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes rpulse {
          0%,100% { transform:scale(1); opacity:1; }
          50%      { transform:scale(1.5); opacity:.4; }
        }
      `}</style>
    </>
  );
}
