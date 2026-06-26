/**
 * NexusControlPlane — fixed bottom-strip "⊕ CTRL" button that opens a
 * floating panel showing the live Nexus control-plane state from
 * GET /v1/control/state every 30 s.
 *
 * Response shape:
 *   {
 *     services:        { count: N, alive: N, roster: [...] }
 *     latest_snapshot: { seq, ts, topic, type, payload: {...} } | null
 *     latest_tasks:    { seq, ts, topic, type, payload: {...} } | null
 *     recent_events:   [{ seq, ts, stream|topic, type, actor, payload }]
 *   }
 *
 * Button fixed at left:1100, bottom:18 (between AmbientReactorHum 1012
 * and ServiceDiagnostics 1532 in the bottom strip).
 *
 * Mounted in src/App.jsx after <DailyObjectivesPlanner />.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 30_000; // 30 s
const ACCENT  = "#94A3B8"; // slate
const DIM     = "#4e6070";

/* relative-time helper */
function relTime(ts) {
  if (!ts) return "";
  const secs = Math.floor((Date.now() - ts * 1000) / 1000);
  if (secs < 5)  return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

/* colour-code topic stream names */
const TOPIC_COLORS = {
  system:      "#38BDF8", // sky
  service:     "#34D399", // emerald
  correlation: "#F59E0B", // amber
  health:      "#22C55E", // green
  cost:        "#F97316", // orange
  gpu:         "#A855F7", // purple
  tasks:       "#E879F9", // fuchsia
  control:     ACCENT,   // slate
};
function topicColor(t = "") {
  return TOPIC_COLORS[t.toLowerCase()] ?? DIM;
}

export default function NexusControlPlane() {
  const [open,   setOpen]  = useState(false);
  const [data,   setData]  = useState(null);
  const [err,    setErr]   = useState(false);
  const [tick,   bump]     = useReducer((n) => n + 1, 0);
  const timerRef           = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/control/state")
      .then((raw) => {
        if (!alive) return;
        setData(raw ?? null);
        setErr(false);
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  const svcs   = data?.services ?? {};
  const events = Array.isArray(data?.recent_events) ? data.recent_events : [];
  const snap   = data?.latest_snapshot ?? null;
  const tasks  = data?.latest_tasks ?? null;
  const alive  = svcs.alive ?? 0;
  const total  = svcs.count ?? 0;

  return (
    <>
      {/* Bottom-strip toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close Nexus Control Plane" : "Open Nexus Control Plane"}
        style={{
          position:      "fixed",
          left:          1100,
          bottom:        18,
          zIndex:        9100,
          background:    open ? `${ACCENT}22` : "rgba(2,6,10,0.90)",
          border:        `1px solid ${ACCENT}${open ? "aa" : "55"}`,
          borderRadius:  4,
          color:         open ? ACCENT : `${ACCENT}99`,
          fontFamily:    S.mono,
          fontSize:      "9px",
          letterSpacing: 2,
          padding:       "4px 10px",
          cursor:        "pointer",
          userSelect:    "none",
          whiteSpace:    "nowrap",
        }}
      >
        ⊕ CTRL{total > 0 && ` ${alive}/${total}`}
      </button>

      {/* Floating panel */}
      {open && (
        <div
          style={{
            position:         "fixed",
            left:             1100,
            bottom:           50,
            width:            400,
            maxHeight:        "60vh",
            zIndex:           9090,
            background:       "rgba(2,6,10,0.97)",
            backdropFilter:   S.blur,
            WebkitBackdropFilter: S.blur,
            border:           `1px solid ${ACCENT}44`,
            borderRadius:     6,
            display:          "flex",
            flexDirection:    "column",
            fontFamily:       S.mono,
            overflow:         "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display:       "flex",
              alignItems:    "center",
              gap:           8,
              padding:       "8px 14px",
              borderBottom:  `1px solid ${S.border}`,
              flexShrink:    0,
            }}
          >
            <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
              NEXUS CONTROL PLANE
            </span>
            {data && (
              <span
                style={{
                  fontSize:     S.fs.xxs,
                  color:        alive === total ? "#22C55E" : "#F59E0B",
                  letterSpacing: 1,
                }}
              >
                {alive}/{total} ALIVE
              </span>
            )}
          </div>

          {/* Latest snapshot summary */}
          {snap && (
            <div
              style={{
                padding:      "6px 14px",
                borderBottom: `1px solid ${S.border}`,
                flexShrink:   0,
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span
                  style={{
                    fontSize:     S.fs.xxs,
                    color:        topicColor(snap.topic ?? "system"),
                    border:       `1px solid ${topicColor(snap.topic ?? "system")}44`,
                    borderRadius: 3,
                    padding:      "1px 5px",
                    letterSpacing: 1,
                    flexShrink:   0,
                  }}
                >
                  {(snap.topic ?? "SYS").toUpperCase()}
                </span>
                <span style={{ fontSize: S.fs.xxs, color: S.text, flex: 1, letterSpacing: 0.5 }}>
                  SNAPSHOT · {snap.type ?? "—"}
                </span>
                <span style={{ fontSize: S.fs.xxs, color: DIM, letterSpacing: 0.5 }}>
                  {relTime(snap.ts)}
                </span>
              </div>
              {snap.payload && typeof snap.payload === "object" && (
                <div
                  style={{
                    marginTop:     3,
                    fontSize:      "9px",
                    color:         DIM,
                    letterSpacing: 0.5,
                    whiteSpace:    "nowrap",
                    overflow:      "hidden",
                    textOverflow:  "ellipsis",
                  }}
                >
                  {Object.keys(snap.payload).slice(0, 4).join(" · ")}
                </div>
              )}
            </div>
          )}

          {/* Latest tasks event summary */}
          {tasks && (
            <div
              style={{
                padding:      "6px 14px",
                borderBottom: `1px solid ${S.border}`,
                flexShrink:   0,
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span
                  style={{
                    fontSize:     S.fs.xxs,
                    color:        topicColor("tasks"),
                    border:       `1px solid ${topicColor("tasks")}44`,
                    borderRadius: 3,
                    padding:      "1px 5px",
                    letterSpacing: 1,
                    flexShrink:   0,
                  }}
                >
                  TASKS
                </span>
                <span style={{ fontSize: S.fs.xxs, color: S.text, flex: 1, letterSpacing: 0.5 }}>
                  {tasks.type ?? "—"}
                </span>
                <span style={{ fontSize: S.fs.xxs, color: DIM, letterSpacing: 0.5 }}>
                  {relTime(tasks.ts)}
                </span>
              </div>
              {tasks.payload && typeof tasks.payload === "object" && (
                <div
                  style={{
                    marginTop:     3,
                    fontSize:      "9px",
                    color:         DIM,
                    letterSpacing: 0.5,
                    whiteSpace:    "nowrap",
                    overflow:      "hidden",
                    textOverflow:  "ellipsis",
                  }}
                >
                  {Object.entries(tasks.payload)
                    .slice(0, 3)
                    .map(([k, v]) => `${k}:${typeof v === "object" ? "…" : v}`)
                    .join(" · ")}
                </div>
              )}
            </div>
          )}

          {/* Recent events list */}
          <div
            style={{
              flex:       1,
              overflowY:  "auto",
              padding:    "2px 0",
            }}
          >
            {err ? (
              <div style={{ padding: "16px 14px", color: "#e8203c", fontSize: S.fs.xs, letterSpacing: 1 }}>
                ENDPOINT UNREACHABLE
              </div>
            ) : data === null ? (
              <div style={{ padding: "16px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                LOADING…
              </div>
            ) : events.length === 0 ? (
              <div style={{ padding: "16px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                NO CONTROL EVENTS
              </div>
            ) : (
              events.map((ev, idx) => {
                const topic  = ev.topic ?? ev.stream ?? "—";
                const tColor = topicColor(topic);
                return (
                  <div
                    key={`${ev.seq}-${idx}`}
                    style={{
                      padding:      "5px 14px",
                      borderBottom: `1px solid ${S.border}`,
                      display:      "flex",
                      alignItems:   "baseline",
                      gap:          8,
                    }}
                  >
                    {/* seq badge */}
                    <span
                      style={{
                        fontSize:     "8px",
                        color:        DIM,
                        border:       `1px solid ${DIM}44`,
                        borderRadius: 3,
                        padding:      "1px 4px",
                        flexShrink:   0,
                        letterSpacing: 0.5,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {ev.seq ?? idx}
                    </span>
                    {/* topic chip */}
                    <span
                      style={{
                        fontSize:     "8px",
                        color:        tColor,
                        border:       `1px solid ${tColor}44`,
                        borderRadius: 3,
                        padding:      "1px 4px",
                        flexShrink:   0,
                        letterSpacing: 1,
                      }}
                    >
                      {topic.toUpperCase()}
                    </span>
                    {/* type + actor */}
                    <span
                      style={{
                        flex:          1,
                        fontSize:      S.fs.xxs,
                        color:         S.textHi,
                        letterSpacing: 0.5,
                        whiteSpace:    "nowrap",
                        overflow:      "hidden",
                        textOverflow:  "ellipsis",
                      }}
                    >
                      {ev.type ?? "—"}
                      {ev.actor && ev.actor !== "api" ? (
                        <span style={{ color: DIM }}> · {ev.actor}</span>
                      ) : null}
                    </span>
                    {/* relative timestamp */}
                    <span
                      style={{
                        fontSize:      "8px",
                        color:         DIM,
                        letterSpacing: 0.5,
                        flexShrink:    0,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {relTime(ev.ts)}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding:      "5px 14px",
              borderTop:    `1px solid ${S.border}`,
              fontSize:     "8px",
              color:        DIM,
              letterSpacing: 1,
              flexShrink:   0,
              display:      "flex",
              justifyContent: "space-between",
            }}
          >
            <span>GET /v1/control/state</span>
            <span>{events.length} EVENTS · 30 S POLL</span>
          </div>
        </div>
      )}
    </>
  );
}
