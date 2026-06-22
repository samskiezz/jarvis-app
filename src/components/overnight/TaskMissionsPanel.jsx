/**
 * TaskMissionsPanel — slide-in left-edge drawer listing live mission tasks
 * from GET /entities/Task, polling every 2 min while open.
 *
 * Tab sits at 65 % from top (between ProofPacksDrawer 60 % and RemindersPanel 75 %).
 * Mounted in src/Layout.jsx after ProofPacksDrawer.
 *
 * Endpoint: GET /entities/Task
 * → array | { items | tasks | data | results: [...] }
 *   each task: { id, title|name|task_name, status|state, priority|urgency,
 *               assignee|assigned_to|owner, due_date|due|deadline,
 *               created_at|updated_at }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS   = 120_000;
const DRAWER_W  = 320;
const GLD  = "#FFD700";
const CY   = "#29E7FF";
const GRN  = "#00E5A0";
const RED  = "#e8203c";
const GREY = "#4e6070";

function relTime(ts) {
  if (!ts) return "—";
  const ms   = typeof ts === "number" && ts < 1e12 ? ts * 1000 : Number(ts);
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 0)     return "just now";
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function statusMeta(status = "") {
  const s = status.toLowerCase().replace(/\s+/g, "_");
  if (/in.progress|active|running/.test(s)) return { label: "ACTIVE",  color: CY  };
  if (/pending|todo|open/.test(s))          return { label: "PENDING", color: GLD };
  if (/blocked|fail|error/.test(s))         return { label: "BLOCKED", color: RED };
  if (/done|complet|success/.test(s))       return { label: "DONE",    color: GRN };
  return { label: (status || "UNKNOWN").toUpperCase().slice(0, 10), color: GREY };
}

function priorityColor(priority = "") {
  const p = priority.toLowerCase();
  if (/critical|urgent|high/.test(p)) return RED;
  if (/medium|normal/.test(p))        return GLD;
  if (/low/.test(p))                  return GREY;
  return null;
}

function normalise(raw) {
  if (!raw) return [];
  if (Array.isArray(raw))          return raw;
  if (Array.isArray(raw.items))    return raw.items;
  if (Array.isArray(raw.tasks))    return raw.tasks;
  if (Array.isArray(raw.data))     return raw.data;
  if (Array.isArray(raw.results))  return raw.results;
  return [];
}

export default function TaskMissionsPanel() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState(null);
  const [err,   setErr]   = useState(false);
  const [tick,  bump]     = useReducer((n) => n + 1, 0);
  const timerRef          = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/entities/Task")
      .then((raw) => {
        if (alive) { setTasks(normalise(raw)); setErr(false); }
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  const items   = tasks ?? [];
  const active  = items.filter((t) => /in.progress|active|running/i.test(t.status || t.state || "")).length;
  const blocked = items.filter((t) => /blocked|fail|error/i.test(t.status || t.state || "")).length;
  const accentColor = blocked > 0 ? RED : active > 0 ? GLD : CY;

  return (
    <>
      {/* Fixed toggle tab — left edge, 65 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close missions" : "Open missions"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "65%",
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
        {open ? "◀ MISSIONS" : "MISSIONS ▶"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8993,
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
            MISSIONS
          </span>
          {tasks !== null && (
            <>
              {active > 0 && (
                <span style={{ fontSize: S.fs.xxs, color: GLD, letterSpacing: 1 }}>
                  ▶ {active}
                </span>
              )}
              {blocked > 0 && (
                <span style={{ fontSize: S.fs.xxs, color: RED, letterSpacing: 1 }}>
                  ✕ {blocked}
                </span>
              )}
              <span style={{ fontSize: S.fs.xxs, color: GREY, letterSpacing: 1 }}>
                {items.length} total
              </span>
            </>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: RED, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : tasks === null ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO MISSIONS
            </div>
          ) : (
            items.map((task, idx) => {
              const status   = task.status || task.state || task.task_status || "pending";
              const sm       = statusMeta(status);
              const title    = task.title ?? task.name ?? task.task_name ?? `Task #${idx + 1}`;
              const priority = task.priority ?? task.urgency ?? task.importance ?? "";
              const assignee = task.assignee ?? task.assigned_to ?? task.owner ?? "";
              const due      = task.due_date ?? task.due ?? task.deadline ?? "";
              const age      = relTime(task.updated_at ?? task.created_at);
              const pc       = priorityColor(priority);

              return (
                <div
                  key={task.id ?? idx}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    borderLeft: `3px solid ${sm.color}`,
                    background: sm.color === RED ? `${RED}08` : "transparent",
                  }}
                >
                  {/* title + status badge */}
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
                      {title}
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
                    {priority && (
                      <span style={{ color: pc ?? GREY }}>
                        P:{priority.toUpperCase()}
                      </span>
                    )}
                    {assignee && <span>@{assignee}</span>}
                    {due && <span>DUE:{due}</span>}
                    <span style={{ marginLeft: "auto" }}>{age}</span>
                  </div>
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
          {tasks !== null
            ? `${items.length} TASK${items.length !== 1 ? "S" : ""} · 2 MIN POLL`
            : err
            ? "ERR"
            : "…"}
        </div>
      </div>
    </>
  );
}
