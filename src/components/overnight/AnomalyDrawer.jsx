/**
 * AnomalyDrawer — slide-in right-edge drawer listing the latest anomalous
 * measurements from GET /v1/jarvis/analytics/anomalies?limit=20.
 *
 * Toggle button is fixed to the right edge. Each row shows metric name,
 * z-score severity badge, and relative timestamp.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S, COLORS as C } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 120_000;
const DRAWER_W = 320;

function relTime(ts) {
  if (!ts) return "—";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function zColor(z) {
  const abs = Math.abs(z ?? 0);
  if (abs >= 4) return "#e8203c";
  if (abs >= 2.5) return C.gold ?? "#f5a623";
  return C.neon ?? "#00c878";
}

function ZBadge({ z }) {
  const color = zColor(z);
  return (
    <span
      title={`z-score: ${z}`}
      style={{
        fontFamily: S.mono,
        fontSize: S.fs.xxs,
        color,
        border: `1px solid ${color}55`,
        borderRadius: 3,
        padding: "1px 5px",
        letterSpacing: 1,
        flexShrink: 0,
      }}
    >
      z{z >= 0 ? "+" : ""}{Number(z).toFixed(1)}
    </span>
  );
}

export default function AnomalyDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/jarvis/analytics/anomalies?limit=20")
      .then((d) => { if (alive) { setData(d); setErr(false); } })
      .catch(() => { if (alive) setErr(true); });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [open, tick]);

  const anomalies = data?.anomalies ?? [];

  return (
    <>
      {/* Fixed toggle tab on the right edge */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close anomaly feed" : "Open anomaly feed"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${C.gold ?? "#f5a623"}55`,
          borderRight: open ? "none" : `1px solid ${C.gold ?? "#f5a623"}55`,
          color: C.gold ?? "#f5a623",
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: open ? "4px 0 0 4px" : "4px 0 0 4px",
          transition: "right 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "▶ ANOMALIES" : "◀ ANOMALIES"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8999,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${C.gold ?? "#f5a623"}33`,
          display: "flex",
          flexDirection: "column",
          transition: "right 0.2s ease",
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
          <span style={{ fontSize: S.fs.xs, color: C.gold ?? "#f5a623", letterSpacing: 2, flex: 1 }}>
            ANOMALY FEED
          </span>
          {data && (
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
              {data.count ?? anomalies.length} detected
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: "#e8203c", fontSize: S.fs.xs, letterSpacing: 1 }}>
              FEED UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : anomalies.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO ANOMALIES DETECTED
            </div>
          ) : (
            anomalies.map((a, i) => (
              <div
                key={i}
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
                    {a.metric}
                  </div>
                  <div style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1, marginTop: 2 }}>
                    {relTime(a.ts)}
                  </div>
                </div>
                <ZBadge z={a.zscore} />
              </div>
            ))
          )}
        </div>

        {/* Footer — live indicator */}
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
