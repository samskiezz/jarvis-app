/**
 * MetricsMonitor — Feature 87
 * Right-edge slide-in drawer at 86 % from top showing JARVIS observability:
 *   - Span count, P50/P95 latency (ms), total cost, error rate
 *   - Per-layer span breakdown (sorted by count)
 *
 * Mounted in src/Layout.jsx after IncidentCorrelationDrawer.
 *
 * Endpoint:
 *   GET /v1/jarvis/metrics
 *   → { spans, p50_ms, p95_ms, total_cost, error_rate, by_layer: {[layer]: count} }
 */
import { useEffect, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 60_000;
const DRAWER_W = 320;
const ACCENT = "#6366F1";
const DIM = "rgba(99,102,241,0.35)";
const TAB_Y = "86%";

function fmt(n, decimals = 0) {
  if (n == null || isNaN(Number(n))) return "--";
  return Number(n).toFixed(decimals);
}

function errColor(rate) {
  if (rate == null) return S.text;
  const r = Number(rate);
  if (r >= 0.1) return "#EF4444";
  if (r >= 0.03) return "#F59E0B";
  return "#22C55E";
}

export default function MetricsMonitor() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await kimiClient.request("/v1/jarvis/metrics");
      setData(res);
    } catch (e) {
      setErr(e?.message || "fetch failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const layers = data?.by_layer
    ? Object.entries(data.by_layer).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <>
      {/* Tab trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="JARVIS Observability Metrics"
        style={{
          position: "fixed",
          right: 0,
          top: TAB_Y,
          zIndex: 110,
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          background: open ? ACCENT : "rgba(10,14,20,0.88)",
          color: open ? "#fff" : ACCENT,
          border: `1px solid ${ACCENT}`,
          borderRight: "none",
          borderRadius: "6px 0 0 6px",
          padding: "10px 5px",
          cursor: "pointer",
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          fontFamily: S.mono,
        }}
      >
        ◈ METRICS
      </button>

      {/* Drawer */}
      {open && (
        <div
          style={{
            position: "fixed",
            right: 0,
            top: 0,
            bottom: 0,
            width: DRAWER_W,
            zIndex: 109,
            background: "rgba(8,12,18,0.97)",
            borderLeft: `1px solid ${ACCENT}44`,
            display: "flex",
            flexDirection: "column",
            fontFamily: S.mono,
            boxShadow: `-8px 0 32px rgba(99,102,241,0.12)`,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 14px",
              borderBottom: `1px solid ${ACCENT}33`,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ color: ACCENT, fontSize: 13 }}>◈</span>
            <span
              style={{
                color: ACCENT,
                fontSize: S.fs.xs,
                letterSpacing: 3,
                flex: 1,
              }}
            >
              OBSERVABILITY
            </span>
            {loading && (
              <span style={{ color: DIM, fontSize: S.fs.xxs }}>LOADING…</span>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: S.text,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
            {err && (
              <div
                style={{
                  color: "#EF4444",
                  fontSize: S.fs.xxs,
                  marginBottom: 12,
                  letterSpacing: 1,
                }}
              >
                {err}
              </div>
            )}

            {!data && !loading && !err && (
              <div
                style={{ color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}
              >
                NO DATA
              </div>
            )}

            {data && (
              <>
                {/* Metric tiles */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    marginBottom: 16,
                  }}
                >
                  {[
                    { label: "SPANS", value: fmt(data.spans), unit: "" },
                    {
                      label: "P50",
                      value: fmt(data.p50_ms),
                      unit: " ms",
                    },
                    {
                      label: "P95",
                      value: fmt(data.p95_ms),
                      unit: " ms",
                    },
                    {
                      label: "COST",
                      value: `$${fmt(data.total_cost, 4)}`,
                      unit: "",
                    },
                  ].map((t) => (
                    <div
                      key={t.label}
                      style={{
                        background: `${ACCENT}10`,
                        border: `1px solid ${ACCENT}33`,
                        borderRadius: 6,
                        padding: "8px 10px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: S.fs.xxs,
                          color: S.text,
                          letterSpacing: 2,
                          marginBottom: 4,
                        }}
                      >
                        {t.label}
                      </div>
                      <div
                        style={{
                          fontSize: 15,
                          color: ACCENT,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {t.value}
                        {t.unit}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Error rate — full-width */}
                <div
                  style={{
                    background: `${ACCENT}10`,
                    border: `1px solid ${ACCENT}33`,
                    borderRadius: 6,
                    padding: "8px 10px",
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      fontSize: S.fs.xxs,
                      color: S.text,
                      letterSpacing: 2,
                    }}
                  >
                    ERROR RATE
                  </span>
                  <span
                    style={{
                      fontSize: 15,
                      color: errColor(data.error_rate),
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmt(data.error_rate * 100, 1)}%
                  </span>
                </div>

                {/* Layer breakdown */}
                {layers.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: S.fs.xxs,
                        color: S.text,
                        letterSpacing: 2,
                        marginBottom: 8,
                      }}
                    >
                      BY LAYER
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {layers.map(([layer, count]) => {
                        const maxCount = layers[0][1] || 1;
                        const pct = (count / maxCount) * 100;
                        return (
                          <div key={layer}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: S.fs.xxs,
                                marginBottom: 2,
                              }}
                            >
                              <span style={{ color: S.textHi, letterSpacing: 1 }}>
                                {layer}
                              </span>
                              <span
                                style={{
                                  color: ACCENT,
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                {count}
                              </span>
                            </div>
                            <div
                              style={{
                                height: 3,
                                background: `${ACCENT}22`,
                                borderRadius: 2,
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  width: `${pct}%`,
                                  background: ACCENT,
                                  borderRadius: 2,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {layers.length === 0 && (
                  <div
                    style={{
                      color: S.text,
                      fontSize: S.fs.xxs,
                      letterSpacing: 1,
                    }}
                  >
                    NO SPAN DATA
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "6px 14px",
              borderTop: `1px solid ${ACCENT}22`,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span style={{ color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              /v1/jarvis/metrics · 60 s
            </span>
            <button
              onClick={load}
              style={{
                background: "transparent",
                border: `1px solid ${ACCENT}55`,
                borderRadius: 4,
                color: ACCENT,
                cursor: "pointer",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
                padding: "2px 8px",
                fontFamily: S.mono,
              }}
            >
              ↺
            </button>
          </div>
        </div>
      )}
    </>
  );
}
