/**
 * ReportsBrowserDrawer — Feature 26
 * Left-edge slide-in drawer listing saved intelligence reports from
 * GET /v1/reports. Polls every 3 minutes while open.
 *
 * Tab sits at 8 % from top (above SourceConnectorsDrawer at 20 %).
 * Each row shows: report title, body excerpt (first 80 chars), and
 * relative creation timestamp. Clicking a row expands the full body inline.
 *
 * Mounted in src/Layout.jsx after InvestmentSnapshotDrawer.
 *
 * Endpoint: GET /v1/reports
 * → { items: [{ id, title, body, meta, created_ts }], count: number }
 * created_ts is unix milliseconds.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 180_000;
const DRAWER_W = 340;
const VIOLET = "#9B59FF";
const RED = "#e8203c";

function relAge(tsMs) {
  if (!tsMs) return "—";
  const sec = Math.floor((Date.now() - tsMs) / 1000);
  if (sec < 0) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function excerpt(body) {
  if (!body) return "";
  const text = body.replace(/#+\s*/g, "").replace(/\n+/g, " ").trim();
  return text.length > 80 ? text.slice(0, 80) + "…" : text;
}

export default function ReportsBrowserDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/reports")
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

  const reports = data?.items ?? [];

  return (
    <>
      {/* Fixed toggle tab — left edge, 8 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close reports browser" : "Open reports browser"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "8%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${VIOLET}55`,
          borderLeft: open ? "none" : `1px solid ${VIOLET}55`,
          color: VIOLET,
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
        {open ? "REPORTS ▶" : "REPORTS ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8998,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight: `1px solid ${VIOLET}33`,
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
          <span
            style={{
              fontSize: S.fs.xs,
              color: VIOLET,
              letterSpacing: 2,
              flex: 1,
            }}
          >
            INTELLIGENCE REPORTS
          </span>
          {data && (
            <span
              style={{
                fontSize: S.fs.xxs,
                color: S.text,
                letterSpacing: 1,
              }}
            >
              {data.count ?? reports.length}
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
          ) : reports.length === 0 ? (
            <div
              style={{
                padding: "20px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              NO REPORTS FOUND
            </div>
          ) : (
            reports.map((r) => {
              const isExpanded = expandedId === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    cursor: "pointer",
                    background: isExpanded
                      ? `${VIOLET}0A`
                      : "transparent",
                    borderLeft: isExpanded
                      ? `2px solid ${VIOLET}`
                      : "2px solid transparent",
                  }}
                >
                  <div
                    style={{
                      fontSize: S.fs.xs,
                      color: S.textHi,
                      letterSpacing: 0.5,
                      marginBottom: 3,
                    }}
                  >
                    {r.title || `Report #${r.id}`}
                  </div>
                  {!isExpanded && (
                    <div
                      style={{
                        fontSize: S.fs.xxs,
                        color: S.text,
                        letterSpacing: 0.5,
                        marginBottom: 3,
                        lineHeight: 1.4,
                      }}
                    >
                      {excerpt(r.body)}
                    </div>
                  )}
                  {isExpanded && (
                    <div
                      style={{
                        fontSize: S.fs.xxs,
                        color: "#A8C0CC",
                        letterSpacing: 0.3,
                        lineHeight: 1.6,
                        marginBottom: 4,
                        whiteSpace: "pre-wrap",
                        maxHeight: 260,
                        overflowY: "auto",
                        paddingRight: 4,
                      }}
                    >
                      {r.body || "—"}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: S.fs.xxs,
                      color: `${VIOLET}88`,
                      letterSpacing: 1,
                    }}
                  >
                    {relAge(r.created_ts)}
                  </div>
                </div>
              );
            })
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
            ? `LIVE · 3 MIN POLL`
            : err
            ? "ERR"
            : "…"}
        </div>
      </div>
    </>
  );
}
