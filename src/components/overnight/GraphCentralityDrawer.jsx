/**
 * GraphCentralityDrawer — slide-in right-edge drawer listing the top entities
 * by influence score from GET /v1/graph/centrality.
 *
 * Tab sits at 80 % from top so it does not overlap DecisionLedgerPanel (65 %),
 * PipelineRunsDrawer (35 %), or AnomalyDrawer (50 %). Polls every 5 min while
 * open. Mounted in src/Layout.jsx after DecisionLedgerPanel.
 *
 * Endpoint: GET /v1/graph/centrality
 * → { items: [{ id, label, type, score }], count: number }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 300;
const TEAL = "#29E7FF";
const RED = "#e8203c";

function ScoreBar({ score }) {
  const pct = Math.min(100, Math.round((score ?? 0) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 60 }}>
      <div
        style={{
          flex: 1,
          height: 3,
          background: `${TEAL}22`,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: TEAL,
            borderRadius: 2,
          }}
        />
      </div>
      <span style={{ fontSize: S.fs.xxs, color: TEAL, letterSpacing: 0.5, flexShrink: 0, minWidth: 28, textAlign: "right" }}>
        {score != null ? score.toFixed(3) : "—"}
      </span>
    </div>
  );
}

function TypeBadge({ type }) {
  return (
    <span
      style={{
        fontFamily: S.mono,
        fontSize: S.fs.xxs,
        color: `${TEAL}AA`,
        border: `1px solid ${TEAL}33`,
        borderRadius: 3,
        padding: "1px 4px",
        letterSpacing: 1,
        flexShrink: 0,
        textTransform: "uppercase",
        maxWidth: 70,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {type ?? "?"}
    </span>
  );
}

export default function GraphCentralityDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/graph/centrality")
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

  const items = data?.items ?? [];

  return (
    <>
      {/* Fixed toggle tab — right edge, 80 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close graph centrality" : "Open graph centrality"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "80%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${TEAL}55`,
          borderRight: open ? "none" : `1px solid ${TEAL}55`,
          color: TEAL,
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
        {open ? "GRAPH ▶" : "GRAPH ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8996,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${TEAL}33`,
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
              color: TEAL,
              letterSpacing: 2,
              flex: 1,
            }}
          >
            GRAPH CENTRALITY
          </span>
          {data && (
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
              {items.length} entities
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: RED, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO ENTITIES
            </div>
          ) : (
            items.map((entity, i) => (
              <div
                key={entity.id ?? i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "6px 14px",
                  borderBottom: `1px solid ${S.border}`,
                }}
              >
                <span
                  style={{
                    fontSize: S.fs.xxs,
                    color: `${TEAL}66`,
                    letterSpacing: 1,
                    flexShrink: 0,
                    minWidth: 18,
                    paddingTop: 1,
                  }}
                >
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: S.fs.xs,
                      color: S.textHi,
                      letterSpacing: 0.5,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      marginBottom: 3,
                    }}
                  >
                    {entity.label ?? entity.id}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <TypeBadge type={entity.type} />
                    <ScoreBar score={entity.score} />
                  </div>
                </div>
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
          {data ? "LIVE · 5 MIN POLL" : err ? "ERR" : "…"}
        </div>
      </div>
    </>
  );
}
