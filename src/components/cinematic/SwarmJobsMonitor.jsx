/**
 * SwarmJobsMonitor — F25 Swarm jobs monitor.
 * Sources from /entities/SwarmJob — running jobs with live progress.
 * "JARVIS, swarm" opens the panel and speaks a brief.
 * Additive only — mounted via App.jsx; intent exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const YLW = "#FFD700";
const RED = "#FF4D6D";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SWARM_RE = /\bswarm|agent.job|agent.run|fleet.job|running.job|autonomous.job|job.monitor\b/i;

async function fetchSwarmJobs() {
  const r = await fetch(`${apiBase()}/entities/SwarmJob`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)               ? d
    : Array.isArray(d?.data)            ? d.data
    : Array.isArray(d?.items)           ? d.items
    : Array.isArray(d?.jobs)            ? d.jobs
    : Array.isArray(d?.swarm_jobs)      ? d.swarm_jobs
    : Array.isArray(d?.results)         ? d.results
    : [];
}

export function isSwarmQuery(text) {
  return SWARM_RE.test(text || "");
}

export async function buildSwarmScript() {
  let jobs = [];
  try { jobs = await fetchSwarmJobs(); } catch (_) {}

  if (!jobs.length) return "No swarm jobs found at this time, sir.";

  const running  = jobs.filter(j => /running|active|in.progress/i.test(j.status || "")).length;
  const queued   = jobs.filter(j => /queue|pending|waiting/i.test(j.status || "")).length;
  const failed   = jobs.filter(j => /fail|error|abort/i.test(j.status || "")).length;
  const total    = jobs.length;

  return (
    `Swarm monitor shows ${total} job${total !== 1 ? "s" : ""} total. ` +
    `${running} running, ${queued} queued, ${failed} failed. ` +
    (failed > 0 ? `Sir, ${failed} job${failed !== 1 ? "s" : ""} require${failed === 1 ? "s" : ""} attention.` : "All active jobs nominal.")
  ).trim();
}

function statusColor(status = "") {
  if (/running|active|in.progress/i.test(status)) return GRN;
  if (/queue|pending|waiting/i.test(status))       return YLW;
  if (/fail|error|abort/i.test(status))            return RED;
  if (/done|complete|success/i.test(status))       return CY;
  return "#566878";
}

function statusLabel(status = "") {
  if (/running|active|in.progress/i.test(status)) return "RUNNING";
  if (/queue|pending|waiting/i.test(status))       return "QUEUED";
  if (/fail|error|abort/i.test(status))            return "FAILED";
  if (/done|complete|success/i.test(status))       return "DONE";
  return (status || "UNKNOWN").toUpperCase().slice(0, 10);
}

function progressValue(job) {
  const p = job.progress ?? job.percent ?? job.completion ?? job.pct;
  if (p != null) return Math.min(100, Math.max(0, Number(p)));
  if (/done|complete|success/i.test(job.status || "")) return 100;
  if (/running|active/i.test(job.status || "")) return null;
  return 0;
}

export default function SwarmJobsMonitor() {
  const [open,    setOpen]    = useState(false);
  const [jobs,    setJobs]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const arr = await fetchSwarmJobs();
      setJobs(arr);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (SWARM_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const running = jobs.filter(j => /running|active|in.progress/i.test(j.status || ""));
  const queued  = jobs.filter(j => /queue|pending|waiting/i.test(j.status || ""));
  const failed  = jobs.filter(j => /fail|error|abort/i.test(j.status || ""));
  const done    = jobs.filter(j => /done|complete|success/i.test(j.status || ""));

  const visible = (() => {
    if (filter === "running") return running;
    if (filter === "queued")  return queued;
    if (filter === "failed")  return failed;
    if (filter === "done")    return done;
    return jobs;
  })();

  const hasFailures = failed.length > 0;

  const TABS = [
    { key: "all",     label: `ALL ${jobs.length}` },
    { key: "running", label: `▶ ${running.length}` },
    { key: "queued",  label: `◷ ${queued.length}` },
    { key: "failed",  label: `✕ ${failed.length}` },
    { key: "done",    label: `✓ ${done.length}` },
  ];

  return (
    <>
      {/* Toggle button — bottom-left strip at left:1324 */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Swarm Jobs Monitor"
        style={{
          position: "fixed", left: 1324, bottom: 18, zIndex: 68,
          background: open ? CY + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${hasFailures ? RED + "88" : CY + "55"}`,
          borderRadius: 8,
          color: open ? "#04060A" : (hasFailures ? RED : CY),
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${hasFailures ? RED : CY}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
          animation: hasFailures && !open ? "swpulse 2s ease-in-out infinite" : "none",
        }}
      >
        <span style={{ fontSize: 12 }}>⬡</span>
        SWARM
        {running.length > 0 && (
          <span style={{
            background: GRN + "44", color: GRN,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {running.length}
          </span>
        )}
        {hasFailures && (
          <span style={{
            background: RED + "44", color: RED,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {failed.length}
          </span>
        )}
      </button>

      {/* Swarm jobs panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(520px,96vw)", maxHeight: "min(620px,80vh)",
          background: "rgba(4,8,14,0.95)",
          border: `1px solid ${CY}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: running.length > 0 ? GRN : CY,
              boxShadow: `0 0 10px ${running.length > 0 ? GRN : CY}`,
              display: "inline-block",
              animation: (loading || running.length > 0) ? "swpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              SWARM JOBS MONITOR
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "SYNCING" : `REFRESH 20s`}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 8, padding: "10px 14px", borderBottom: `1px solid ${CY}18`,
          }}>
            {[
              { label: "RUNNING", val: running.length, color: GRN },
              { label: "QUEUED",  val: queued.length,  color: YLW },
              { label: "FAILED",  val: failed.length,  color: RED },
              { label: "DONE",    val: done.length,    color: CY },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: `${color}11`, border: `1px solid ${color}33`,
                borderRadius: 8, padding: "8px 6px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: 18, fontWeight: 900, lineHeight: 1 }}>{val}</div>
                <div style={{ color: color + "99", fontSize: 8, letterSpacing: 2, marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "8px 14px",
            borderBottom: `1px solid ${CY}18`,
          }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setFilter(t.key)} style={{
                background: filter === t.key ? `${CY}22` : "transparent",
                border: `1px solid ${filter === t.key ? CY + "88" : CY + "22"}`,
                borderRadius: 6, color: filter === t.key ? CY : "#4A6070",
                padding: "3px 8px", fontSize: 9, cursor: "pointer",
                letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace",
              }}>
                {t.label}
              </button>
            ))}
            <button onClick={load} style={{
              marginLeft: "auto", background: "transparent",
              border: `1px solid ${CY}22`, borderRadius: 6,
              color: "#4A6070", padding: "3px 8px", fontSize: 9,
              cursor: "pointer", letterSpacing: 1,
              fontFamily: "'JetBrains Mono',monospace",
            }}>
              ↺ REFRESH
            </button>
          </div>

          {/* Job list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {visible.length === 0 && (
              <div style={{
                padding: "28px 18px", color: "#4A6070",
                fontSize: 11, textAlign: "center", letterSpacing: 1,
              }}>
                {loading ? "LOADING SWARM JOBS…" : "NO JOBS IN THIS CATEGORY"}
              </div>
            )}
            {visible.map((job, i) => {
              const sc  = statusColor(job.status);
              const sl  = statusLabel(job.status);
              const pv  = progressValue(job);
              const name = job.name || job.job_name || job.title || job.id || `Job #${i + 1}`;
              const agentCount = job.agent_count ?? job.agents ?? job.num_agents;
              const taskCount  = job.task_count  ?? job.tasks  ?? job.num_tasks;
              const started    = job.started_at  ?? job.created_at ?? job.start_time;
              const updated    = job.updated_at  ?? job.last_updated ?? job.updated;
              const jobType    = job.type || job.job_type || job.kind;

              return (
                <div key={job.id || i} style={{
                  padding: "10px 14px",
                  borderBottom: `1px solid ${CY}0F`,
                  borderLeft: `3px solid ${sc}`,
                  display: "flex", flexDirection: "column", gap: 5,
                  background: /fail|error|abort/i.test(job.status || "")
                    ? `${RED}08` : "transparent",
                }}>
                  {/* Top row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#DCF0FF", fontSize: 12, flex: 1,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {name}
                    </span>
                    <span style={{
                      fontSize: 9, letterSpacing: 1.5, fontWeight: 700,
                      color: sc, background: sc + "22",
                      borderRadius: 5, padding: "2px 7px",
                    }}>
                      {sl}
                    </span>
                  </div>

                  {/* Progress bar */}
                  {pv !== null && (
                    <div style={{
                      height: 4, borderRadius: 2,
                      background: `${sc}22`, overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%", borderRadius: 2,
                        width: `${pv}%`,
                        background: sc,
                        transition: "width 0.8s ease",
                        boxShadow: pv < 100 ? `0 0 6px ${sc}` : "none",
                      }} />
                    </div>
                  )}
                  {pv !== null && (
                    <div style={{ fontSize: 9, color: sc + "99", letterSpacing: 1 }}>
                      {pv}% COMPLETE
                    </div>
                  )}
                  {pv === null && /running|active/i.test(job.status || "") && (
                    <div style={{ fontSize: 9, color: GRN + "99", letterSpacing: 1 }}>
                      ▶ IN PROGRESS
                    </div>
                  )}

                  {/* Meta row */}
                  <div style={{
                    display: "flex", gap: 12, flexWrap: "wrap",
                    fontSize: 9, color: "#4A6070",
                  }}>
                    {jobType     && <span>TYPE: <span style={{ color: "#7A9AB0" }}>{String(jobType).toUpperCase()}</span></span>}
                    {agentCount != null && <span>AGENTS: <span style={{ color: CY }}>{agentCount}</span></span>}
                    {taskCount  != null && <span>TASKS: <span style={{ color: CY }}>{taskCount}</span></span>}
                    {started    && <span>STARTED: <span style={{ color: "#7A9AB0" }}>{new Date(started).toLocaleTimeString()}</span></span>}
                    {updated    && <span>UPDATED: <span style={{ color: "#7A9AB0" }}>{new Date(updated).toLocaleTimeString()}</span></span>}
                  </div>

                  {/* Error / message */}
                  {(job.error || job.message || job.error_message) && (
                    <div style={{
                      fontSize: 9, color: RED, background: RED + "11",
                      borderRadius: 4, padding: "3px 7px", marginTop: 2,
                    }}>
                      {job.error || job.error_message || job.message}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px", borderTop: `1px solid ${CY}18`,
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 9, color: "#4A6070",
          }}>
            <span>{jobs.length} TOTAL JOBS</span>
            <span style={{ marginLeft: "auto" }}>
              {running.length > 0
                ? <span style={{ color: GRN }}>● {running.length} ACTIVE</span>
                : <span style={{ color: "#4A6070" }}>● IDLE</span>}
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes swpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.15); opacity: 0.65; }
        }
      `}</style>
    </>
  );
}
