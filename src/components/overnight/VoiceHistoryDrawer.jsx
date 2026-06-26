/**
 * VoiceHistoryDrawer — slide-in right-edge drawer showing server-side voice
 * command history from GET /v1/voice/history.
 *
 * Tab sits at 68 % from top (between DecisionLedgerPanel 65 % and
 * AutomationRulesPanel 72 % on the right edge). Mounted in src/Layout.jsx
 * after EventBackboneMonitor.
 *
 * Endpoint: GET /v1/voice/history?limit=30
 * → { ok: bool, items: [{ id, ts, command, source }], count: number }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 120_000;
const DRAWER_W = 320;
const MAGENTA = "#D946EF";
const CYAN = "#22D3EE";
const VIOLET = "#A78BFA";
const GREEN = "#34D399";
const GREY = "#4E6070";
const RED = "#E8203C";

function relTime(ts_s) {
  if (!ts_s) return "—";
  const diff = Math.floor(Date.now() / 1000 - ts_s);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function SourceBadge({ source }) {
  const src = (source ?? "").toLowerCase();
  let color = GREY;
  let label = source ? source.toUpperCase() : "?";
  if (src === "tts") { color = CYAN; label = "TTS"; }
  else if (src === "nlu") { color = VIOLET; label = "NLU"; }
  else if (src === "stt") { color = GREEN; label = "STT"; }
  else if (src === "api") { color = MAGENTA; label = "API"; }
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
      {label}
    </span>
  );
}

export default function VoiceHistoryDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/voice/history?limit=30")
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
      {/* Fixed toggle tab — right edge, 68 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close voice history" : "Open voice history"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "68%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${MAGENTA}55`,
          borderRight: open ? "none" : `1px solid ${MAGENTA}55`,
          color: MAGENTA,
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
        {open ? "VOICE LOG ▶" : "VOICE LOG ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8988,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${MAGENTA}33`,
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
              color: MAGENTA,
              letterSpacing: 2,
              flex: 1,
            }}
          >
            VOICE HISTORY
          </span>
          {data && (
            <span
              style={{
                fontSize: S.fs.xxs,
                color: S.text,
                letterSpacing: 1,
              }}
            >
              {items.length} commands
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
              NO VOICE HISTORY
            </div>
          ) : (
            items.map((item, idx) => (
              <div
                key={item.id ?? idx}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "7px 14px",
                  borderBottom: `1px solid ${S.border}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* command text */}
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
                    {item.command ?? "—"}
                  </div>
                  {/* relative timestamp */}
                  <div
                    style={{
                      fontSize: S.fs.xxs,
                      color: GREY,
                      letterSpacing: 1,
                      marginTop: 2,
                    }}
                  >
                    {relTime(item.ts)}
                  </div>
                </div>
                <SourceBadge source={item.source} />
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
          {data ? "LIVE · 2 MIN POLL" : err ? "ERR" : "…"}
        </div>
      </div>
    </>
  );
}
