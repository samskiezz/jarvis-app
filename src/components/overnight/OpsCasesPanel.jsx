/**
 * OpsCasesPanel — slide-in left-edge drawer listing open cases from
 * GET /v1/cases. Polls every 2 minutes while open.
 *
 * Mounted in src/Layout.jsx after AnomalyDrawer. Toggle tab fixed to left edge
 * so it doesn't overlap the right-side AnomalyDrawer tab.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S, COLORS as C } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 120_000;
const DRAWER_W = 320;
const CY = "#29E7FF";

const STATUS_COLOR = {
  open: CY,
  closed: C.neon ?? "#00c878",
  archived: S.text ?? "#4e6070",
};

function relTime(ts_ms) {
  if (!ts_ms) return "—";
  const diff = Math.floor((Date.now() - ts_ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatusBadge({ status }) {
  const color = STATUS_COLOR[status] ?? S.text;
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

export default function OpsCasesPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/cases?status=open")
      .then((d) => { if (alive) { setData(d); setErr(false); } })
      .catch(() => { if (alive) setErr(true); });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [open, tick]);

  const cases = data?.items ?? [];

  return (
    <>
      {/* Fixed toggle tab on the left edge */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close cases panel" : "Open ops cases"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "60%",
          transform: "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${CY}55`,
          borderLeft: open ? "none" : `1px solid ${CY}55`,
          color: CY,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: open ? "0 4px 4px 0" : "0 4px 4px 0",
          transition: "left 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "CASES ▶" : "CASES ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8999,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight: `1px solid ${CY}33`,
          display: "flex",
          flexDirection: "column",
          transition: "left 0.2s ease",
          fontFamily: S.mono,
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          borderBottom: `1px solid ${S.border}`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: S.fs.xs, color: CY, letterSpacing: 2, flex: 1 }}>
            OPS CASES
          </span>
          {data && (
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
              {data.count ?? cases.length} open
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: "#e8203c", fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : cases.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO OPEN CASES
            </div>
          ) : (
            cases.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "7px 14px",
                  borderBottom: `1px solid ${S.border}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: S.fs.xs,
                    color: S.textHi,
                    letterSpacing: 0.5,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>
                    {c.title}
                  </div>
                  <div style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1, marginTop: 2 }}>
                    {c.notes?.length ?? 0} note{c.notes?.length !== 1 ? "s" : ""} · {relTime(c.created_ts)}
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 14px",
          borderTop: `1px solid ${S.border}`,
          fontSize: S.fs.xxs,
          color: S.text,
          letterSpacing: 1,
          flexShrink: 0,
        }}>
          {data ? "LIVE · 2 MIN POLL" : err ? "ERR" : "…"}
        </div>
      </div>
    </>
  );
}
