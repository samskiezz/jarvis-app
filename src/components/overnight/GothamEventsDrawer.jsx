/**
 * GothamEventsDrawer — F86: Gotham Operational Events
 * Right-edge slide-in drawer listing recent events from
 * GET /v1/gotham/events. Polls every 30 s while open.
 *
 * Tab sits at 47 % from top (between OntologySearchDrawer 43 %
 * and ContactsDirectoryDrawer 50 %).
 * Each row shows: kind badge, event ID (truncated), case link,
 * and relative timestamp. Critical/high kinds pulse amber.
 *
 * Mounted in src/Layout.jsx after NexusBusMonitor.
 *
 * Endpoint: GET /v1/gotham/events?limit=50
 * → { ok: bool, items: [{ event_id, case_id, kind, ts }], count: number }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 30_000;
const DRAWER_W = 340;
const AMBER = "#F59E0B";

const KIND_COLORS = {
  critical: "#EF4444",
  high:     "#F97316",
  alert:    "#F59E0B",
  warning:  "#EAB308",
  info:     "#38BDF8",
  debug:    "#6B7280",
};

function kindColor(kind) {
  const k = String(kind || "").toLowerCase();
  for (const [key, color] of Object.entries(KIND_COLORS)) {
    if (k.includes(key)) return color;
  }
  return AMBER;
}

function relAge(ts) {
  if (!ts) return "—";
  const epoch = typeof ts === "number" ? ts * 1000 : Date.parse(ts);
  if (isNaN(epoch)) return "—";
  const sec = Math.floor((Date.now() - epoch) / 1000);
  if (sec < 0) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function shortId(id) {
  if (!id) return "—";
  const s = String(id);
  return s.length > 14 ? `…${s.slice(-12)}` : s;
}

export default function GothamEventsDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/gotham/events?limit=50")
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

  const items = Array.isArray(data?.items) ? data.items
    : Array.isArray(data) ? data
    : [];

  const critCount = items.filter(
    (e) => String(e.kind || "").toLowerCase().includes("critical")
  ).length;

  return (
    <>
      {/* Fixed toggle tab — right edge, 47 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close Gotham events" : "Open Gotham events"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "47%",
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
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        }}
      >
        {critCount > 0 && (
          <span
            style={{
              background: "#EF4444",
              color: "#fff",
              borderRadius: 3,
              fontSize: 9,
              fontWeight: 700,
              padding: "1px 4px",
              letterSpacing: 0,
              writingMode: "horizontal-tb",
              flexShrink: 0,
            }}
          >
            {critCount}
          </span>
        )}
        <span>{open ? "▶ GOTHAM" : "◀ GOTHAM"}</span>
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
          background: "rgba(3,8,18,0.97)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderLeft: `1px solid ${AMBER}44`,
          display: "flex",
          flexDirection: "column",
          fontFamily: S.mono,
          fontSize: S.fs.xs,
          transition: "right 0.2s ease",
          overflowY: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 14px 8px",
            borderBottom: `1px solid ${AMBER}33`,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: AMBER, letterSpacing: 2, fontWeight: 700 }}>
            GOTHAM EVENTS
          </span>
          <span
            style={{
              marginLeft: "auto",
              background: `${AMBER}22`,
              color: AMBER,
              borderRadius: 3,
              padding: "1px 5px",
              fontSize: S.fs.xxs,
              letterSpacing: 1,
            }}
          >
            {items.length}
          </span>
          <button
            onClick={() => bump()}
            title="Reload"
            style={{
              background: "transparent",
              border: `1px solid ${AMBER}44`,
              borderRadius: 3,
              color: AMBER,
              cursor: "pointer",
              fontSize: S.fs.xxs,
              letterSpacing: 1,
              padding: "1px 5px",
              fontFamily: "inherit",
            }}
          >
            ↺
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {err && (
            <div
              style={{
                padding: "12px 14px",
                color: "#FF5555",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              ERROR — /v1/gotham/events unreachable
            </div>
          )}
          {!err && !data && (
            <div
              style={{
                padding: "16px 14px",
                color: "#4E6070",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              LOADING…
            </div>
          )}
          {!err && data && items.length === 0 && (
            <div
              style={{
                padding: "16px 14px",
                color: "#4E6070",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              NO EVENTS
            </div>
          )}
          {items.map((ev, i) => {
            const kc = kindColor(ev.kind);
            const isCrit = String(ev.kind || "").toLowerCase().includes("critical");
            return (
              <div
                key={ev.event_id ?? i}
                style={{
                  padding: "8px 14px",
                  borderBottom: `1px solid ${AMBER}11`,
                  borderLeft: isCrit ? `2px solid #EF4444` : "2px solid transparent",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      background: `${kc}22`,
                      color: kc,
                      border: `1px solid ${kc}44`,
                      borderRadius: 3,
                      padding: "1px 5px",
                      fontSize: S.fs.xxs,
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                      flexShrink: 0,
                    }}
                  >
                    {ev.kind || "event"}
                  </span>
                  <span
                    style={{
                      color: "#4E6070",
                      fontSize: S.fs.xxs,
                      letterSpacing: 0.5,
                      flex: 1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {shortId(ev.event_id)}
                  </span>
                  <span
                    style={{
                      color: "#2E4050",
                      fontSize: S.fs.xxs,
                      letterSpacing: 0.5,
                      flexShrink: 0,
                    }}
                  >
                    {relAge(ev.ts)}
                  </span>
                </div>
                {ev.case_id && (
                  <div
                    style={{
                      color: "#4E6070",
                      fontSize: S.fs.xxs,
                      letterSpacing: 0.5,
                    }}
                  >
                    case: {shortId(ev.case_id)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: `1px solid ${AMBER}22`,
            padding: "5px 14px",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#2E4050", fontSize: S.fs.xxs, letterSpacing: 1 }}>
            GET /v1/gotham/events · 30 s poll
          </span>
        </div>
      </div>
    </>
  );
}
