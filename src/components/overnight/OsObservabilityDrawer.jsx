/**
 * OsObservabilityDrawer — F130 JARVIS OS Observability Panel.
 * Right-edge slide-in at 56 % from top.
 * Polls GET /v1/jarvis/metrics + GET /v1/jarvis/traces?limit=20 every 60 s
 * when the drawer is open.
 *
 * Metrics: spans total, p50/p95 latency, error rate, total cost, by-layer.
 * Traces:  recent spans with status badge, layer chip, duration, cost.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS  = 60_000;
const DRAWER_W = 320;
const ORANGE   = "#F97316";
const GREEN    = "#22C55E";
const RED      = "#EF4444";
const AMBER    = "#F59E0B";
const SLATE    = "#64748B";

function Tile({ label, value, accent }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${accent ?? ORANGE}22`,
        borderRadius: 4,
        padding: "6px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: S.fs.sm, color: accent ?? ORANGE, letterSpacing: 1 }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function LayerBar({ layer, count, max }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
      <span style={{ fontSize: S.fs.xxs, color: S.text, width: 80, flexShrink: 0, letterSpacing: 0.5 }}>
        {(layer ?? "unknown").slice(0, 10)}
      </span>
      <div
        style={{
          flex: 1,
          height: 6,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: ORANGE,
            borderRadius: 3,
            boxShadow: `0 0 4px ${ORANGE}88`,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span style={{ fontSize: S.fs.xxs, color: ORANGE, width: 28, textAlign: "right", flexShrink: 0 }}>
        {count}
      </span>
    </div>
  );
}

function StatusBadge({ status }) {
  const ok  = status === "ok";
  const col = ok ? GREEN : RED;
  return (
    <span
      style={{
        fontSize: S.fs.xxs,
        color: col,
        border: `1px solid ${col}44`,
        borderRadius: 3,
        padding: "1px 5px",
        letterSpacing: 1,
        flexShrink: 0,
      }}
    >
      {ok ? "OK" : (status ?? "ERR").toUpperCase()}
    </span>
  );
}

function relAge(ts) {
  if (!ts) return "—";
  const diff = Math.round((Date.now() / 1000 - ts) / 60);
  if (diff < 1)  return "<1m";
  if (diff < 60) return `${diff}m`;
  return `${Math.round(diff / 60)}h`;
}

export default function OsObservabilityDrawer() {
  const [open,    setOpen]    = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [traces,  setTraces]  = useState(null);
  const [err,     setErr]     = useState(false);
  const [tick,    bump]       = useReducer((n) => n + 1, 0);
  const timerRef              = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    Promise.all([
      kimiClient.request("/v1/jarvis/metrics"),
      kimiClient.request("/v1/jarvis/traces?limit=20"),
    ])
      .then(([m, t]) => {
        if (!alive) return;
        setMetrics(m);
        setTraces(Array.isArray(t?.spans) ? t.spans : []);
        setErr(false);
      })
      .catch(() => { if (alive) setErr(true); });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [open, tick]);

  const byLayer  = metrics?.by_layer ?? {};
  const layerMax = Math.max(1, ...Object.values(byLayer));
  const errRate  = metrics?.error_rate ?? 0;

  return (
    <>
      {/* Fixed toggle tab — right edge, 56 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close OS Observability" : "Open OS Observability"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "56%",
          transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ORANGE}55`,
          borderRight: open ? "none" : `1px solid ${ORANGE}55`,
          color: ORANGE,
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
        {open ? "OS OBS ▶" : "OS OBS ◀"}
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
          borderLeft: `1px solid ${ORANGE}33`,
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
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: err ? RED : ORANGE,
              boxShadow: `0 0 5px ${err ? RED : ORANGE}88`,
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: S.fs.xs, color: ORANGE, letterSpacing: 2, flex: 1 }}>
            OS OBSERVABILITY
          </span>
          {metrics && (
            <span
              style={{
                fontSize: S.fs.xxs, color: SLATE, letterSpacing: 1,
              }}
            >
              {metrics.spans ?? 0} spans
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
          {!open ? null : err ? (
            <div style={{ color: RED, fontSize: S.fs.xs, letterSpacing: 1, padding: "16px 0" }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !metrics ? (
            <div style={{ color: S.text, fontSize: S.fs.xxs, letterSpacing: 1, padding: "16px 0" }}>
              LOADING…
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Aggregate metric tiles */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Tile label="P50 LATENCY" value={`${metrics.p50_ms ?? 0} ms`} accent={ORANGE} />
                <Tile label="P95 LATENCY" value={`${metrics.p95_ms ?? 0} ms`} accent={AMBER} />
                <Tile
                  label="ERROR RATE"
                  value={`${(errRate * 100).toFixed(1)} %`}
                  accent={errRate > 0 ? RED : GREEN}
                />
                <Tile
                  label="TOTAL COST"
                  value={`$${(metrics.total_cost ?? 0).toFixed(4)}`}
                  accent={ORANGE}
                />
              </div>

              {/* By-layer breakdown */}
              {Object.keys(byLayer).length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: S.fs.xxs, color: S.text, letterSpacing: 2,
                      marginBottom: 6, borderBottom: `1px solid ${S.border}`, paddingBottom: 4,
                    }}
                  >
                    BY LAYER
                  </div>
                  {Object.entries(byLayer)
                    .sort((a, b) => b[1] - a[1])
                    .map(([layer, count]) => (
                      <LayerBar key={layer} layer={layer} count={count} max={layerMax} />
                    ))}
                </div>
              )}

              {/* Recent traces */}
              {Array.isArray(traces) && traces.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: S.fs.xxs, color: S.text, letterSpacing: 2,
                      marginBottom: 6, borderBottom: `1px solid ${S.border}`, paddingBottom: 4,
                    }}
                  >
                    RECENT SPANS
                  </div>
                  {traces.map((span, i) => (
                    <div
                      key={span.id ?? i}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "5px 0",
                        borderBottom: `1px solid ${S.border}`,
                      }}
                    >
                      <StatusBadge status={span.status} />
                      <span
                        style={{
                          flex: 1, fontSize: S.fs.xxs, color: "#CBD5E1",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          letterSpacing: 0.4,
                        }}
                        title={span.action ?? span.layer}
                      >
                        {span.action ?? span.layer ?? "—"}
                      </span>
                      <span
                        style={{
                          fontSize: S.fs.xxs, color: ORANGE, flexShrink: 0, letterSpacing: 0.5,
                        }}
                      >
                        {span.duration_ms != null ? `${span.duration_ms}ms` : ""}
                      </span>
                      <span style={{ fontSize: S.fs.xxs, color: SLATE, flexShrink: 0 }}>
                        {relAge(span.ts)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Poll hint */}
              <div
                style={{
                  fontSize: S.fs.xxs, color: S.text, letterSpacing: 1,
                  textAlign: "right", marginTop: 4,
                }}
              >
                GET /v1/jarvis/metrics + /traces · 60 s poll
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
