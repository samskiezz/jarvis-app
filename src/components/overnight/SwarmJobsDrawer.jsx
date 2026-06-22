/**
 * SwarmJobsDrawer — slide-in left-edge drawer listing autonomous swarm jobs
 * from GET /entities/SwarmJob, polling every 30 s while open.
 *
 * Tab sits at 88 % from top (below RemindersPanel at 75 %, above nothing).
 * Mounted in src/Layout.jsx after ActivityFeedPanel.
 *
 * Endpoint: GET /entities/SwarmJob
 * → array | { items | jobs | swarm_jobs | data | results: [...] }
 *   each job: { id, name|job_name|title, status, progress|percent,
 *               type|kind, agent_count|agents, task_count|tasks,
 *               started_at|created_at, updated_at, error? }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 30_000;
const DRAWER_W = 320;
const GRN  = "#00E5A0";
const YLW  = "#FFB340";
const RED  = "#e8203c";
const CY   = "#29E7FF";
const GREY = "#4e6070";

function relTime(ts) {
  if (!ts) return "—";
  const ms   = typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts;
  const diff = Math.floor((Date.now() - Number(ms)) / 1000);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function statusMeta(status = "") {
  if (/running|active|in.progress/i.test(status)) return { label: "RUNNING", color: GRN };
  if (/queue|pending|waiting/i.test(status))       return { label: "QUEUED",  color: YLW };
  if (/fail|error|abort/i.test(status))            return { label: "FAILED",  color: RED };
  if (/done|complete|success/i.test(status))       return { label: "DONE",    color: CY  };
  return { label: (status || "UNKNOWN").toUpperCase().slice(0, 10), color: GREY };
}

function progressValue(job) {
  const p = job.progress ?? job.percent ?? job.completion ?? job.pct;
  if (p != null) return Math.min(100, Math.max(0, Number(p)));
  if (/done|complete|success/i.test(job.status || "")) return 100;
  return null;
}

function normalise(raw) {
  if (!raw) return [];
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw.items))       return raw.items;
  if (Array.isArray(raw.jobs))        return raw.jobs;
  if (Array.isArray(raw.swarm_jobs))  return raw.swarm_jobs;
  if (Array.isArray(raw.data))        return raw.data;
  if (Array.isArray(raw.results))     return raw.results;
  return [];
}

export default function SwarmJobsDrawer() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState(null);
  const [err,  setErr]  = useState(false);
  const [tick, bump]    = useReducer((n) => n + 1, 0);
  const timerRef        = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/entities/SwarmJob")
      .then((raw) => {
        if (alive) { setJobs(normalise(raw)); setErr(false); }
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  const items   = jobs ?? [];
  const running = items.filter((j) => /running|active|in.progress/i.test(j.status || "")).length;
  const failed  = items.filter((j) => /fail|error|abort/i.test(j.status || "")).length;
  const accentColor = failed > 0 ? RED : running > 0 ? GRN : CY;

  return (
    <>
      {/* Fixed toggle tab — left edge, 88 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close swarm jobs" : "Open swarm jobs"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "88%",
          transform: "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${accentColor}55`,
          borderLeft: open ? "none" : `1px solid ${accentColor}55`,
          color: accentColor,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "0 4px 4px 0",
          transition: "left 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "◀ SWARM" : "SWARM ▶"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8994,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight: `1px solid ${accentColor}33`,
          display: "flex",
          flexDirection: "column",
          transition: "left 0.2s ease",
          fontFamily: S.mono,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: S.fs.xs, color: accentColor, letterSpacing: 2, flex: 1 }}>
            SWARM JOBS
          </span>
          {jobs !== null && (
            <>
              {running > 0 && (
                <span style={{ fontSize: S.fs.xxs, color: GRN, letterSpacing: 1 }}>
                  ▶ {running}
                </span>
              )}
              {failed > 0 && (
                <span style={{ fontSize: S.fs.xxs, color: RED, letterSpacing: 1 }}>
                  ✕ {failed}
                </span>
              )}
            </>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: RED, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : jobs === null ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO SWARM JOBS
            </div>
          ) : (
            items.map((job, idx) => {
              const sm   = statusMeta(job.status);
              const pv   = progressValue(job);
              const name = job.name ?? job.job_name ?? job.title ?? `Job #${idx + 1}`;
              const age  = relTime(job.started_at ?? job.created_at ?? job.start_time);
              const agents = job.agent_count ?? job.agents ?? job.num_agents;
              const tasks  = job.task_count  ?? job.tasks  ?? job.num_tasks;
              const kind   = job.type ?? job.kind ?? job.job_type;

              return (
                <div
                  key={job.id ?? idx}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    borderLeft: `3px solid ${sm.color}`,
                    background: sm.color === RED ? `${RED}08` : "transparent",
                  }}
                >
                  {/* name + status badge */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        flex: 1,
                        fontSize: S.fs.xs,
                        color: S.textHi,
                        letterSpacing: 0.5,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {name}
                    </span>
                    <span
                      style={{
                        fontSize: S.fs.xxs,
                        color: sm.color,
                        border: `1px solid ${sm.color}55`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 1,
                        flexShrink: 0,
                      }}
                    >
                      {sm.label}
                    </span>
                  </div>

                  {/* progress bar */}
                  {pv !== null && (
                    <div
                      style={{
                        height: 3,
                        borderRadius: 2,
                        background: `${sm.color}22`,
                        overflow: "hidden",
                        marginTop: 5,
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: 2,
                          width: `${pv}%`,
                          background: sm.color,
                          transition: "width 0.6s ease",
                        }}
                      />
                    </div>
                  )}

                  {/* meta row */}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      fontSize: S.fs.xxs,
                      color: GREY,
                      marginTop: 4,
                      letterSpacing: 0.5,
                    }}
                  >
                    {kind   && <span>TYPE:{kind.toString().toUpperCase()}</span>}
                    {agents != null && <span>AGENTS:{agents}</span>}
                    {tasks  != null && <span>TASKS:{tasks}</span>}
                    <span style={{ marginLeft: "auto" }}>{age}</span>
                  </div>

                  {/* error hint */}
                  {(job.error || job.error_message) && (
                    <div
                      style={{
                        fontSize: S.fs.xxs,
                        color: RED,
                        marginTop: 3,
                        letterSpacing: 0.3,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {job.error ?? job.error_message}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: S.fs.xxs,
            color: S.text,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          {jobs !== null
            ? `${items.length} JOB${items.length !== 1 ? "S" : ""} · 30 S POLL`
            : err
            ? "ERR"
            : "…"}
        </div>
      </div>
    </>
  );
}
