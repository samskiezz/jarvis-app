/**
 * KnowledgeTimelinePanel — slide-in right-edge drawer showing the latest
 * second-brain log + daily entries from GET /v1/brain/timeline?limit=30.
 *
 * Tab sits at 20 % from top so it does not overlap PipelineRunsDrawer (35 %),
 * AnomalyDrawer (50 %), DecisionLedgerPanel (65 %), or GraphCentralityDrawer
 * (80 %). Polls every 5 min while open.
 *
 * Endpoint: GET /v1/brain/timeline?limit=30
 * → { items: [{ id, kind, title, body_md, confidence, updated_ts, created_ts }], count }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS  = 300_000;
const DRAWER_W = 320;
const VIOLET   = "#B57BFF";

function relTime(ts) {
  if (!ts) return "—";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function KindBadge({ kind }) {
  const color = kind === "daily" ? "#FFD700" : VIOLET;
  return (
    <span
      style={{
        fontFamily: S.mono,
        fontSize: S.fs.xxs,
        color,
        border: `1px solid ${color}44`,
        borderRadius: 3,
        padding: "1px 5px",
        letterSpacing: 1,
        flexShrink: 0,
        textTransform: "uppercase",
      }}
    >
      {kind ?? "log"}
    </span>
  );
}

function firstLine(md) {
  if (!md) return null;
  const line = md.split("\n").find((l) => l.trim() && !l.startsWith("#"));
  if (!line) return null;
  return line.replace(/[*_`[\]]/g, "").slice(0, 80);
}

export default function KnowledgeTimelinePanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err,  setErr]  = useState(false);
  const [tick, bump]    = useReducer((n) => n + 1, 0);
  const timerRef        = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/brain/timeline?limit=30")
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

  return (
    <>
      {/* Fixed toggle tab — right edge, 20 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close knowledge timeline" : "Open knowledge timeline"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "20%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9002,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${VIOLET}55`,
          borderRight: open ? "none" : `1px solid ${VIOLET}55`,
          color: VIOLET,
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
        {open ? "BRAIN ▶" : "BRAIN ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 9001,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${VIOLET}33`,
          display: "flex",
          flexDirection: "column",
          transition: "right 0.2s ease",
          fontFamily: S.mono,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 14px",
            borderBottom: `1px solid ${VIOLET}22`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: S.fs.xxs,
              color: VIOLET,
              letterSpacing: 2,
              fontWeight: 700,
            }}
          >
            KNOWLEDGE TIMELINE
          </span>
          {data && (
            <span
              style={{
                fontSize: S.fs.xxs,
                color: `${VIOLET}77`,
                marginLeft: "auto",
              }}
            >
              {data.count ?? items.length} entries
            </span>
          )}
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none",
              border: "none",
              color: S.text,
              cursor: "pointer",
              fontSize: 14,
              padding: "0 2px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Refresh hint */}
        {open && !data && !err && (
          <div
            style={{
              padding: "20px 14px",
              color: S.text,
              fontSize: S.fs.xxs,
              letterSpacing: 1,
              textAlign: "center",
            }}
          >
            LOADING…
          </div>
        )}

        {err && (
          <div
            style={{
              padding: "14px",
              color: "#e8203c",
              fontSize: S.fs.xxs,
              letterSpacing: 1,
              textAlign: "center",
            }}
          >
            ENDPOINT UNAVAILABLE
          </div>
        )}

        {/* Entry list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!err && items.length === 0 && data && (
            <div
              style={{
                padding: "24px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
                textAlign: "center",
              }}
            >
              NO ENTRIES
            </div>
          )}

          {items.map((item) => {
            const snippet = firstLine(item.body_md);
            return (
              <div
                key={item.id}
                style={{
                  padding: "9px 14px",
                  borderBottom: `1px solid ${VIOLET}11`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {/* Top row: title + kind badge */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: S.fs.xs,
                      color: "#DCEBF5",
                      lineHeight: 1.3,
                      wordBreak: "break-word",
                    }}
                  >
                    {item.title || "(untitled)"}
                  </span>
                  <KindBadge kind={item.kind} />
                </div>

                {/* Body snippet */}
                {snippet && (
                  <div
                    style={{
                      fontSize: S.fs.xxs,
                      color: S.text,
                      lineHeight: 1.4,
                      wordBreak: "break-word",
                    }}
                  >
                    {snippet}
                  </div>
                )}

                {/* Footer: timestamp + confidence */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: S.fs.xxs,
                    color: `${VIOLET}66`,
                  }}
                >
                  <span>{relTime(item.updated_ts ?? item.created_ts)}</span>
                  {item.confidence != null && (
                    <span style={{ marginLeft: "auto" }}>
                      conf {(item.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "7px 14px",
            borderTop: `1px solid ${VIOLET}22`,
            fontSize: S.fs.xxs,
            color: `${VIOLET}66`,
            flexShrink: 0,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>/v1/brain/timeline</span>
          <span>5 min poll</span>
        </div>
      </div>
    </>
  );
}
