/**
 * ActivityFeedPanel — slide-in right-edge drawer listing the unified activity
 * feed (notes + audit log entries) from GET /v1/activity.
 *
 * Tab sits at 90 % from top so it does not overlap the other right-edge drawers
 * (KnowledgeTimeline 20 %, PipelineRuns 35 %, Anomaly 50 %, DecisionLedger
 * 65 %, GraphCentrality 80 %). Mounted in src/Layout.jsx after
 * SourceConnectorsDrawer.
 *
 * Endpoint: GET /v1/activity?limit=30
 * → { items: [{ kind, ts, actor, action, resource_type, resource_id, body? }],
 *     count: number }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 180_000;
const DRAWER_W = 310;
const TEAL = "#00d4cc";
const RED = "#e8203c";
const GOLD = "#e8a020";
const GREY = "#4e6070";

function relTime(ts_ms) {
  if (!ts_ms) return "—";
  const diff = Math.floor((Date.now() - ts_ms) / 1000);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function KindBadge({ kind }) {
  const isAudit = kind === "audit";
  const color = isAudit ? GOLD : TEAL;
  return (
    <span
      style={{
        fontFamily: S.mono,
        fontSize: S.fs.xxs,
        color,
        border: `1px solid ${color}55`,
        borderRadius: 3,
        padding: "1px 4px",
        letterSpacing: 1,
        flexShrink: 0,
        textTransform: "uppercase",
      }}
    >
      {isAudit ? "AUDIT" : "NOTE"}
    </span>
  );
}

export default function ActivityFeedPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/activity?limit=30")
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
      {/* Fixed toggle tab — right edge, 90 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close activity feed" : "Open activity feed"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "90%",
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
        {open ? "ACTIVITY ▶" : "ACTIVITY ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8994,
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
            ACTIVITY FEED
          </span>
          {data && (
            <span
              style={{
                fontSize: S.fs.xxs,
                color: S.text,
                letterSpacing: 1,
              }}
            >
              {items.length} events
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
              NO ACTIVITY
            </div>
          ) : (
            items.map((item, idx) => (
              <div
                key={item.note_id ?? item.audit_id ?? idx}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "7px 14px",
                  borderBottom: `1px solid ${S.border}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* action line */}
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
                    {item.action ?? "—"}
                  </div>
                  {/* resource + actor */}
                  <div
                    style={{
                      fontSize: S.fs.xxs,
                      color: GREY,
                      letterSpacing: 0.5,
                      marginTop: 1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {[item.resource_type, item.resource_id]
                      .filter(Boolean)
                      .join("/")}
                    {item.actor ? ` · ${item.actor}` : ""}
                  </div>
                  {/* note body excerpt */}
                  {item.body && (
                    <div
                      style={{
                        fontSize: S.fs.xxs,
                        color: S.text,
                        letterSpacing: 0.3,
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        fontStyle: "italic",
                      }}
                    >
                      {item.body.length > 60
                        ? item.body.slice(0, 60) + "…"
                        : item.body}
                    </div>
                  )}
                  {/* relative time */}
                  <div
                    style={{
                      fontSize: S.fs.xxs,
                      color: S.text,
                      letterSpacing: 1,
                      marginTop: 2,
                    }}
                  >
                    {relTime(item.ts ? item.ts * 1000 : null)}
                  </div>
                </div>
                <KindBadge kind={item.kind} />
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
          {data ? "LIVE · 3 MIN POLL" : err ? "ERR" : "…"}
        </div>
      </div>
    </>
  );
}
