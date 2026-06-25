/**
 * UnderworldBridgeStatus — Feature 94
 * Right-edge slide-in drawer at 74 % from top.
 * Polls GET /v1/bridge/status every 60 s.
 * Shows APEX↔underworld bridge reachability + per-capability status badges.
 *
 * Mounted in src/Layout.jsx after ClaudeCodeRunsDrawer.
 *
 * Endpoint:
 *   GET /v1/bridge/status
 *   → { status, reachable, reason?, capabilities?: { graph_analytics, counterfactual,
 *       optimize, temporal_query, causal_chain, benchmarks } }
 */
import { useEffect, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 60_000;
const DRAWER_W = 300;
const ACCENT = "#8B5CF6";
const TAB_Y = "74%";

const CAP_LABELS = {
  graph_analytics: "GRAPH ANALYTICS",
  counterfactual: "COUNTERFACTUAL",
  optimize: "OPTIMIZER",
  temporal_query: "TEMPORAL QUERY",
  causal_chain: "CAUSAL CHAIN",
};

function StatusBadge({ ok }) {
  return (
    <span
      style={{
        fontSize: S.fs.xxs,
        letterSpacing: 1.5,
        padding: "1px 6px",
        borderRadius: 3,
        background: ok ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
        color: ok ? "#22C55E" : "#EF4444",
        border: `1px solid ${ok ? "#22C55E" : "#EF4444"}44`,
      }}
    >
      {ok ? "ONLINE" : "OFFLINE"}
    </span>
  );
}

export default function UnderworldBridgeStatus() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await kimiClient.request("/v1/bridge/status");
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

  const caps = data?.capabilities || {};
  const capEntries = Object.entries(CAP_LABELS).map(([key, label]) => ({
    key,
    label,
    available: !!caps[key],
  }));
  const benchmarks = Array.isArray(caps.benchmarks) ? caps.benchmarks : [];

  const bridgeUp = data?.status === "ok";
  const bridgeReachable = !!data?.reachable;

  return (
    <>
      {/* Tab trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Underworld Bridge Status"
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
        ◈ BRIDGE
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
            boxShadow: `-8px 0 32px rgba(139,92,246,0.12)`,
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
              UNDERWORLD BRIDGE
            </span>
            {loading && (
              <span style={{ color: `${ACCENT}88`, fontSize: S.fs.xxs }}>
                LOADING…
              </span>
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
              <div style={{ color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                NO DATA
              </div>
            )}

            {data && (
              <>
                {/* Bridge status tile */}
                <div
                  style={{
                    background: `${ACCENT}10`,
                    border: `1px solid ${ACCENT}33`,
                    borderRadius: 6,
                    padding: "10px 12px",
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: S.fs.xxs,
                        color: S.text,
                        letterSpacing: 2,
                        marginBottom: 4,
                      }}
                    >
                      PLATFORM
                    </div>
                    <div style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 1 }}>
                      {data.status?.toUpperCase() || "UNKNOWN"}
                    </div>
                  </div>
                  <StatusBadge ok={bridgeUp} />
                </div>

                {/* Reachability */}
                <div
                  style={{
                    background: `${ACCENT}08`,
                    border: `1px solid ${ACCENT}22`,
                    borderRadius: 6,
                    padding: "8px 12px",
                    marginBottom: 14,
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
                    DB REACHABLE
                  </span>
                  <StatusBadge ok={bridgeReachable} />
                </div>

                {/* Reason / note */}
                {data.reason && (
                  <div
                    style={{
                      fontSize: S.fs.xxs,
                      color: S.text,
                      letterSpacing: 0.5,
                      marginBottom: 14,
                      lineHeight: 1.5,
                      opacity: 0.7,
                    }}
                  >
                    {data.reason}
                  </div>
                )}

                {/* Capabilities */}
                {capEntries.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: S.fs.xxs,
                        color: S.text,
                        letterSpacing: 2,
                        marginBottom: 8,
                      }}
                    >
                      CAPABILITIES
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        marginBottom: 14,
                      }}
                    >
                      {capEntries.map((c) => (
                        <div
                          key={c.key}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "5px 8px",
                            borderRadius: 4,
                            background: c.available
                              ? "rgba(34,197,94,0.06)"
                              : "rgba(239,68,68,0.06)",
                          }}
                        >
                          <span
                            style={{
                              fontSize: S.fs.xxs,
                              color: S.textHi,
                              letterSpacing: 1,
                            }}
                          >
                            {c.label}
                          </span>
                          <StatusBadge ok={c.available} />
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Benchmarks list */}
                {benchmarks.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: S.fs.xxs,
                        color: S.text,
                        letterSpacing: 2,
                        marginBottom: 6,
                      }}
                    >
                      BENCHMARKS
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {benchmarks.map((b) => (
                        <span
                          key={b}
                          style={{
                            fontSize: S.fs.xxs,
                            letterSpacing: 1,
                            padding: "1px 6px",
                            borderRadius: 3,
                            background: `${ACCENT}18`,
                            color: ACCENT,
                            border: `1px solid ${ACCENT}33`,
                          }}
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </>
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
              /v1/bridge/status · 60 s
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
