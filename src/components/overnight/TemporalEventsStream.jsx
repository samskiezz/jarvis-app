/**
 * TemporalEventsStream — Feature 155
 * Right-edge slide-in drawer at 75 % from top showing the merged threshold-
 * crossing event stream across all History Lake time-series.
 *
 * Endpoints:
 *   POST /v1/temporal/timeline  {}
 *     → { count, events: [{ t, value, kind, series_id }] }
 *   GET  /v1/history/series
 *     → { items: [{ series_id, entity, metric, unit, ... }], count }
 *
 * Mounted in src/Layout.jsx after <BrainGoaPlanDrawer />.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 180_000; // 3 min
const DRAWER_W = 360;
const ACCENT = "#A3E635"; // lime-400 — unique to this drawer
const UP_COLOR = "#38BDF8"; // sky-blue for cross_up
const DN_COLOR = "#FB923C"; // orange for cross_down

function relAge(epochMs) {
  if (!epochMs) return "";
  const s = Math.floor((Date.now() - epochMs) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtVal(v) {
  if (v == null) return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return String(v);
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(3);
}

export default function TemporalEventsStream() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState(null);
  const [seriesMap, setSeriesMap] = useState({});
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);
  const seriesLoaded = useRef(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    // Load series name map once per session
    if (!seriesLoaded.current) {
      kimiClient
        .request("/v1/history/series")
        .then((res) => {
          if (!alive) return;
          const items = res?.items ?? res?.series ?? [];
          const map = {};
          items.forEach((s) => {
            const key = s.series_id ?? s.id ?? "";
            const label =
              [s.entity, s.metric, s.unit ? `(${s.unit})` : ""]
                .filter(Boolean)
                .join(" ") || key;
            if (key) map[key] = label;
          });
          setSeriesMap(map);
          seriesLoaded.current = true;
        })
        .catch(() => {});
    }

    // Fetch threshold-crossing events
    kimiClient
      .request("/v1/temporal/timeline", {
        method: "POST",
        body: JSON.stringify({ series_ids: null, limit: 100 }),
      })
      .then((res) => {
        if (!alive) return;
        setEvents(res?.events ?? []);
        setErr(false);
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

  const evList = events ?? [];
  // Sort newest-first (t is epoch-ms or iso string)
  const sorted = [...evList].sort((a, b) => {
    const ta = typeof a.t === "string" ? new Date(a.t).getTime() : (a.t ?? 0);
    const tb = typeof b.t === "string" ? new Date(b.t).getTime() : (b.t ?? 0);
    return tb - ta;
  });

  return (
    <>
      {/* Fixed toggle tab — right edge, 75 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close temporal events" : "Open temporal events stream"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "75%",
          transform: "translateY(-50%)",
          zIndex: 9001,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ACCENT}55`,
          borderRight: open ? "none" : `1px solid ${ACCENT}55`,
          color: ACCENT,
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
        {open ? "TEVT ▶" : "TEVT ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8993,
          background: "rgba(2,6,10,0.97)",
          borderLeft: `1px solid ${ACCENT}33`,
          transition: "right 0.2s ease",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: S.mono,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 14px 10px",
            borderBottom: `1px solid ${ACCENT}33`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              color: ACCENT,
              fontSize: S.fs.xs,
              letterSpacing: 2,
              fontWeight: 700,
            }}
          >
            ⚡ THRESHOLD EVENTS
          </span>
          {events !== null && (
            <span
              style={{
                marginLeft: "auto",
                background: `${ACCENT}22`,
                border: `1px solid ${ACCENT}55`,
                color: ACCENT,
                fontSize: S.fs.xxs,
                padding: "1px 6px",
                borderRadius: 3,
                letterSpacing: 1,
              }}
            >
              {sorted.length} events
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {!open ? null : err ? (
            <div
              style={{
                padding: "20px 14px",
                color: "#EF4444",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              ✗ ENDPOINT UNAVAILABLE
            </div>
          ) : events === null ? (
            <div
              style={{
                padding: "20px 14px",
                color: `${ACCENT}66`,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              LOADING…
            </div>
          ) : sorted.length === 0 ? (
            <div
              style={{
                padding: "20px 14px",
                color: `${ACCENT}55`,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              NO THRESHOLD CROSSINGS DETECTED
            </div>
          ) : (
            sorted.map((ev, i) => {
              const isUp = (ev.kind ?? "").includes("up");
              const kindColor = isUp ? UP_COLOR : DN_COLOR;
              const kindLabel = isUp ? "▲ CROSS UP" : "▼ CROSS DN";
              const sid = ev.series_id ?? "";
              const seriesLabel = seriesMap[sid] || sid || "unknown";
              const ts =
                typeof ev.t === "string"
                  ? new Date(ev.t).getTime()
                  : (ev.t ?? 0);

              return (
                <div
                  key={i}
                  style={{
                    padding: "7px 14px",
                    borderBottom: `1px solid ${ACCENT}18`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                  }}
                >
                  {/* Top row: kind badge + value + age */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        background: `${kindColor}22`,
                        border: `1px solid ${kindColor}55`,
                        color: kindColor,
                        fontSize: "9px",
                        padding: "1px 5px",
                        borderRadius: 3,
                        letterSpacing: 1,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      {kindLabel}
                    </span>
                    <span
                      style={{
                        color: "#E2E8F0",
                        fontSize: S.fs.xxs,
                        letterSpacing: 1,
                        marginLeft: "auto",
                        flexShrink: 0,
                      }}
                    >
                      {fmtVal(ev.value)}
                    </span>
                    <span
                      style={{
                        color: "#4B5563",
                        fontSize: "9px",
                        flexShrink: 0,
                      }}
                    >
                      {relAge(ts)}
                    </span>
                  </div>
                  {/* Bottom row: series label */}
                  <div
                    style={{
                      color: `${ACCENT}99`,
                      fontSize: "9px",
                      letterSpacing: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={seriesLabel}
                  >
                    {seriesLabel}
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
            borderTop: `1px solid ${ACCENT}22`,
            color: `${ACCENT}55`,
            fontSize: "9px",
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          POST /v1/temporal/timeline · 3-min poll · all series
        </div>
      </div>
    </>
  );
}
