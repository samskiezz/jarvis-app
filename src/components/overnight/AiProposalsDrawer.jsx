/**
 * AiProposalsDrawer — Feature 118
 * Right-edge slide-in drawer at 51 % from top listing AI-proposed governed
 * actions from GET /v1/aip/proposals. Polls every 5 min while open.
 *
 * Endpoint: GET /v1/aip/proposals
 * → { proposals: [{ id, object_id, action, payload, rationale, status, actor,
 *                    created_ts|created_at }] }
 *
 * Status badge: PENDING amber / APPROVED green / REJECTED red / other slate.
 * Pending count badge pulses on tab when any PENDING proposals present.
 * Accent: amber (#F59E0B).
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 340;
const AMBER = "#F59E0B";
const GREEN = "#22C55E";
const RED = "#EF4444";
const SLATE = "#94A3B8";

function statusColor(status) {
  const s = (status || "").toUpperCase();
  if (s === "PENDING") return AMBER;
  if (s === "APPROVED") return GREEN;
  if (s === "REJECTED") return RED;
  return SLATE;
}

function relAge(ts) {
  if (!ts) return "";
  const ms = typeof ts === "number" && ts > 1e12 ? ts : Number(ts) * 1000;
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AiProposalsDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/aip/proposals")
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

  const proposals = data?.proposals ?? [];
  const pendingCount = proposals.filter(
    (p) => (p.status || "").toUpperCase() === "PENDING"
  ).length;

  return (
    <>
      {/* Fixed toggle tab — right edge, 51 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close AI proposals" : "Open AI proposals"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "51%",
          transform: "translateY(-50%)",
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
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {open ? "AI PROP ▶" : "AI PROP ◀"}
        {!open && pendingCount > 0 && (
          <span
            style={{
              background: AMBER,
              color: "#000",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              flexShrink: 0,
              animation: "pulse 2s infinite",
            }}
          >
            {pendingCount}
          </span>
        )}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8995,
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
          <span style={{ fontSize: S.fs.xs, color: AMBER, letterSpacing: 2, flex: 1 }}>
            AI PROPOSALS
          </span>
          {data && (
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
              {pendingCount} pending / {proposals.length} total
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: AMBER, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : proposals.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO PROPOSALS FOUND
            </div>
          ) : (
            proposals.map((p) => {
              const sColor = statusColor(p.status);
              const ts = p.created_ts ?? p.created_at;
              const age = relAge(ts);
              return (
                <div
                  key={p.id ?? `${p.object_id}-${p.action}`}
                  style={{
                    padding: "9px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {/* Status badge + action */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 9,
                        color: sColor,
                        border: `1px solid ${sColor}55`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 1,
                        flexShrink: 0,
                        textTransform: "uppercase",
                      }}
                    >
                      {p.status || "UNKNOWN"}
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
                      {p.action || "–"}
                    </span>
                  </div>

                  {/* Object ID chip */}
                  {p.object_id && (
                    <span
                      style={{
                        fontSize: 9,
                        color: `${AMBER}bb`,
                        border: `1px solid ${AMBER}33`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 0.5,
                        display: "inline-block",
                        alignSelf: "flex-start",
                        maxWidth: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      OBJ: {p.object_id}
                    </span>
                  )}

                  {/* Rationale excerpt */}
                  {p.rationale && (
                    <span
                      style={{
                        fontSize: S.fs.xxs,
                        color: S.text,
                        lineHeight: 1.4,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {p.rationale}
                    </span>
                  )}

                  {/* Age + actor */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {age && (
                      <span style={{ fontSize: 9, color: `${S.text}88`, letterSpacing: 0.5 }}>
                        {age}
                      </span>
                    )}
                    {p.actor && (
                      <span style={{ fontSize: 9, color: `${S.text}66`, letterSpacing: 0.5 }}>
                        by {String(p.actor).slice(0, 16)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "8px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: 9,
            color: `${S.text}66`,
            letterSpacing: 0.5,
            flexShrink: 0,
          }}
        >
          GET /v1/aip/proposals · 5-min poll
        </div>
      </div>
    </>
  );
}
