/**
 * TopObjectsDrawer — Feature 48
 * Left-edge slide-in drawer listing the top graph objects ranked by
 * PageRank (or centrality) from GET /v1/jarvis/analytics/top-objects.
 *
 * Tab at 40 % from top on left edge (between ScenarioRunsPanel 35 %
 * and RitualDeckPanel 45 %).
 * Polls every 5 minutes while open.
 * Mounted in src/Layout.jsx after SensorActivityPanel.
 *
 * Endpoints:
 *   GET /v1/jarvis/analytics/top-objects?kind=pagerank&limit=15
 *   GET /v1/jarvis/analytics/top-objects?kind=centrality&limit=15
 *   → { kind, count, results: [{ id, type, label, score, updated_ts }] }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 300;
const ACCENT = "#818CF8"; // indigo — unused by other overnight drawers

const TYPE_COLORS = {
  Person:       "#29E7FF",
  Organization: "#B57BFF",
  Location:     "#7FFF5F",
  Event:        "#FFD700",
  Asset:        "#F59E0B",
  Topic:        "#60A5FA",
  Concept:      "#34D399",
  Measurement:  "#FB7185",
};

function typeColor(t) {
  return TYPE_COLORS[t] || ACCENT;
}

function ScoreBar({ score, max }) {
  const pct = max > 0 ? Math.min(100, (score / max) * 100) : 0;
  return (
    <div
      style={{
        width: 64,
        height: 4,
        background: "rgba(255,255,255,0.07)",
        borderRadius: 2,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div style={{ width: `${pct}%`, height: "100%", background: ACCENT }} />
    </div>
  );
}

export default function TopObjectsDrawer() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("pagerank");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request(`/v1/jarvis/analytics/top-objects?kind=${kind}&limit=15`)
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
  }, [open, kind, tick]);

  const results = data?.results ?? [];
  const maxScore = results.length > 0 ? Math.max(...results.map((r) => r.score), 1e-9) : 1;

  return (
    <>
      {/* Fixed toggle tab — left edge at 40 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close top objects" : "Open top objects by rank"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "40%",
          transform: "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ACCENT}55`,
          borderLeft: open ? "none" : `1px solid ${ACCENT}55`,
          color: ACCENT,
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
        {open ? "RANK ▶" : "RANK ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 9005,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight: `1px solid ${ACCENT}33`,
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
          <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
            TOP OBJECTS
          </span>
          {/* Kind toggle buttons */}
          {["pagerank", "centrality"].map((k) => (
            <button
              key={k}
              onClick={() => { setKind(k); setData(null); bump(); }}
              style={{
                fontSize: S.fs.xxs,
                letterSpacing: 1,
                padding: "2px 6px",
                borderRadius: 3,
                border: `1px solid ${k === kind ? ACCENT : S.border}`,
                color: k === kind ? ACCENT : S.text,
                background: k === kind ? `${ACCENT}18` : "transparent",
                cursor: "pointer",
                fontFamily: S.mono,
              }}
            >
              {k === "pagerank" ? "PR" : "CTR"}
            </button>
          ))}
          {data != null && (
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
              {results.length}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div
              style={{
                padding: "20px 14px",
                color: "#F59E0B",
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
          ) : results.length === 0 ? (
            <div
              style={{
                padding: "20px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              NO SCORED OBJECTS FOUND
            </div>
          ) : (
            results.map((obj, idx) => (
              <div
                key={obj.id}
                style={{
                  padding: "9px 14px",
                  borderBottom: `1px solid ${S.border}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                {/* Rank + label + type badge */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: S.fs.xxs,
                      color: S.text,
                      minWidth: 18,
                      flexShrink: 0,
                    }}
                  >
                    #{idx + 1}
                  </span>
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
                    {obj.label || obj.id}
                  </span>
                  {obj.type && (
                    <span
                      style={{
                        fontSize: 8,
                        color: typeColor(obj.type),
                        border: `1px solid ${typeColor(obj.type)}44`,
                        borderRadius: 3,
                        padding: "1px 4px",
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        flexShrink: 0,
                      }}
                    >
                      {obj.type}
                    </span>
                  )}
                </div>

                {/* Score bar + value */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    paddingLeft: 26,
                  }}
                >
                  <ScoreBar score={obj.score} max={maxScore} />
                  <span
                    style={{
                      fontSize: S.fs.xxs,
                      color: S.text,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {Number(obj.score).toFixed(5)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer: kind label */}
        <div
          style={{
            padding: "8px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: S.fs.xxs,
            color: S.text,
            letterSpacing: 1,
          }}
        >
          SORTED BY {kind.toUpperCase()} · UPDATES EVERY 5 MIN
        </div>
      </div>
    </>
  );
}
