/**
 * PipelineRunsDrawer — slide-in right-edge drawer showing recent pipeline /
 * graph-builder runs from GET /v1/run-builder/runs. Polls every 2 minutes
 * while open.
 *
 * Tab sits at 35 % from top so it does not overlap the AnomalyDrawer tab
 * which sits at 50 %. Mounted in src/Layout.jsx after OpsCasesPanel.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 120_000;
const DRAWER_W = 320;
const AMBER = "#f5a623";
const GREEN = "#00c878";
const RED = "#e8203c";
const GREY = "#4e6070";
const CYAN = "#29E7FF";

const STATUS_COLORS = {
  compiled: CYAN,
  running: AMBER,
  succeeded: GREEN,
  failed: RED,
  cancelled: GREY,
};

function relTime(ts_s) {
  if (!ts_s) return "—";
  const diff = Math.floor(Date.now() / 1000 - ts_s);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] ?? S.text;
  return (
    <span
      style={{
        fontFamily: S.mono,
        fontSize: S.fs.xxs,
        color,
        border: `1px solid ${color}55`,
        borderRadius: 3,
        padding: "1px 5px",
        letterSpacing: 1,
        flexShrink: 0,
        textTransform: "uppercase",
      }}
    >
      {status ?? "—"}
    </span>
  );
}

export default function PipelineRunsDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/run-builder/runs?limit=20")
      .then((d) => {
        if (alive) {
          setData(d);
          setErr(false);
        }
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

  const runs = data?.items ?? [];

  return (
    <>
      {/* Fixed toggle tab — right edge, 35 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close pipeline runs" : "Open pipeline runs"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "35%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${AMBER}55`,
          borderRight: open ? "none" : `1px solid ${AMBER}55`,
          color: AMBER,
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
        {open ? "RUNS ▶" : "RUNS ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8998,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${AMBER}33`,
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
          <span
            style={{
              fontSize: S.fs.xs,
              color: AMBER,
              letterSpacing: 2,
              flex: 1,
            }}
          >
            PIPELINE RUNS
          </span>
          {data && (
            <span
              style={{
                fontSize: S.fs.xxs,
                color: S.text,
                letterSpacing: 1,
              }}
            >
              {data.count ?? runs.length} runs
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div
              style={{
                padding: "20px 14px",
                color: RED,
                fontSize: S.fs.xs,
                letterSpacing: 1,
              }}
            >
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div
              style={{
                padding: "20px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              LOADING…
            </div>
          ) : runs.length === 0 ? (
            <div
              style={{
                padding: "20px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              NO RUNS FOUND
            </div>
          ) : (
            runs.map((r) => (
              <div
                key={r.run_id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "7px 14px",
                  borderBottom: `1px solid ${S.border}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: S.fs.xs,
                      color: S.textHi,
                      letterSpacing: 0.5,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {r.name || r.run_id}
                  </div>
                  <div
                    style={{
                      fontSize: S.fs.xxs,
                      color: S.text,
                      letterSpacing: 1,
                      marginTop: 2,
                    }}
                  >
                    {r.nodes_compiled ?? 0} nodes · {relTime(r.ts)}
                    {r.error && (
                      <span
                        style={{
                          color: RED,
                          marginLeft: 6,
                          maxWidth: 160,
                          display: "inline-block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          verticalAlign: "bottom",
                          whiteSpace: "nowrap",
                        }}
                        title={r.error}
                      >
                        · {r.error}
                      </span>
                    )}
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))
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
          {data
            ? `${data.source === "default-schema" ? "DEFAULT" : "LIVE"} · 2 MIN POLL`
            : err
            ? "ERR"
            : "…"}
        </div>
      </div>
    </>
  );
}
