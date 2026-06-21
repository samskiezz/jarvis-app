/**
 * DecisionLedgerPanel — slide-in right-edge drawer listing recent decisions
 * from GET /v1/decision/list. Polls every 5 minutes while open.
 *
 * Tab sits at 65 % from top so it does not overlap PipelineRunsDrawer (35 %)
 * or AnomalyDrawer (50 %). Mounted in src/Layout.jsx after PipelineRunsDrawer.
 *
 * Endpoint: GET /v1/decision/list?limit=20
 * → { items: [{ id, title, frontmatter: { state }, created_ts, updated_ts }] }
 *
 * State badge: frontmatter.state === "final" → FINAL (green), else → DRAFT (grey)
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 300;
const PURPLE = "#9b59f7";
const GREEN = "#00c878";
const GREY = "#4e6070";
const RED = "#e8203c";

function relTime(ts_ms) {
  if (!ts_ms) return "—";
  const diff = Math.floor((Date.now() - ts_ms) / 1000);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StateBadge({ state }) {
  const isFinal = state === "final";
  const color = isFinal ? GREEN : GREY;
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
      {isFinal ? "FINAL" : "DRAFT"}
    </span>
  );
}

export default function DecisionLedgerPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/decision/list?limit=20")
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
      {/* Fixed toggle tab — right edge, 65 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close decision ledger" : "Open decision ledger"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "65%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${PURPLE}55`,
          borderRight: open ? "none" : `1px solid ${PURPLE}55`,
          color: PURPLE,
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
        {open ? "LEDGER ▶" : "LEDGER ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8997,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${PURPLE}33`,
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
              color: PURPLE,
              letterSpacing: 2,
              flex: 1,
            }}
          >
            DECISION LEDGER
          </span>
          {data && (
            <span
              style={{
                fontSize: S.fs.xxs,
                color: S.text,
                letterSpacing: 1,
              }}
            >
              {items.length} items
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
          ) : items.length === 0 ? (
            <div
              style={{
                padding: "20px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              NO DECISIONS
            </div>
          ) : (
            items.map((d) => (
              <div
                key={d.id}
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
                    {d.title}
                  </div>
                  <div
                    style={{
                      fontSize: S.fs.xxs,
                      color: S.text,
                      letterSpacing: 1,
                      marginTop: 2,
                    }}
                  >
                    {relTime(d.created_ts)}
                  </div>
                </div>
                <StateBadge state={d.frontmatter?.state} />
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
