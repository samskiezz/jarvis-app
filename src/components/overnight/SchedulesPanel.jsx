/**
 * SchedulesPanel — Feature 42
 * Right-edge slide-in drawer listing JARVIS internal job schedules from GET /v1/schedules.
 * Tab at 42 % from top on right edge, between PipelineRunsDrawer (35 %) and
 * ContactsDirectoryDrawer (50 %). Polls every 2 min while open.
 *
 * Mounted in src/Layout.jsx after AutomationRulesPanel.
 *
 * Endpoint: GET /v1/schedules
 * → { items: [{ id, job_name, fn_key, interval_s, enabled, fn_key_known }],
 *     count: number, job_keys: string[], enabled: boolean }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 120_000;
const DRAWER_W = 320;
const ACCENT = "#38BDF8";
const GREEN = "#22C55E";
const AMBER = "#F5A623";
const RED = "#FF4D4D";
const DIM = "rgba(56,189,248,0.45)";

function fmtInterval(secs) {
  if (!secs) return "—";
  const s = Number(secs);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

export default function SchedulesPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/schedules")
      .then((d) => {
        if (alive) { setData(d); setErr(false); }
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    timerRef.current = setTimeout(() => {
      if (alive) bump();
    }, POLL_MS);

    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [open, tick]);

  const items = data?.items ?? [];
  const schedulerOn = data?.enabled !== false;
  const enabledJobs = items.filter((j) => j.enabled !== false).length;

  return (
    <>
      {/* Fixed toggle tab — right edge, 42 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close schedules" : "Open JARVIS job schedules"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "42%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ACCENT}55`,
          borderRight: open ? "none" : `1px solid ${ACCENT}55`,
          color: ACCENT,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "4px 0 0 4px",
          transition: "right 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "SCHED ▶" : "SCHED ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8995,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${ACCENT}33`,
          display: "flex",
          flexDirection: "column",
          transition: "right 0.2s ease",
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
          <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
            JOB SCHEDULES
          </span>
          {data && (
            <>
              <span
                style={{
                  fontSize: 9,
                  color: schedulerOn ? GREEN : RED,
                  border: `1px solid ${schedulerOn ? GREEN : RED}55`,
                  borderRadius: 3,
                  padding: "1px 5px",
                  letterSpacing: 1,
                  flexShrink: 0,
                }}
              >
                {schedulerOn ? "ON" : "OFF"}
              </span>
              <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
                {enabledJobs}/{items.length}
              </span>
            </>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: AMBER, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO SCHEDULES REGISTERED
            </div>
          ) : (
            items.map((job) => {
              const active = job.enabled !== false;
              const known = job.fn_key_known !== false && job.fn_key;
              return (
                <div
                  key={job.id ?? job.job_name}
                  style={{
                    padding: "9px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    opacity: active ? 1 : 0.45,
                  }}
                >
                  {/* Dot + job name + interval */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: active ? GREEN : S.border,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        color: "#DCEBF5",
                        fontSize: S.fs.xs,
                        letterSpacing: 0.5,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {job.job_name || "unnamed"}
                    </span>
                    <span style={{ fontSize: S.fs.xxs, color: DIM, letterSpacing: 1, flexShrink: 0 }}>
                      {fmtInterval(job.interval_s)}
                    </span>
                  </div>

                  {/* fn_key badge */}
                  {job.fn_key && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 15 }}>
                      <span
                        style={{
                          fontSize: 9,
                          color: known ? ACCENT : AMBER,
                          border: `1px solid ${known ? ACCENT : AMBER}55`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          letterSpacing: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 240,
                        }}
                      >
                        {job.fn_key}
                      </span>
                      {!known && (
                        <span style={{ fontSize: 9, color: AMBER, letterSpacing: 0.5 }}>unknown</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
