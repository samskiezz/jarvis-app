/**
 * F150: Metrics Registry Drawer
 * Right-edge slide-in at 36%; polls GET /v1/metrics every 60 s.
 * Shows counter name+value tiles + timer mean/count rows.
 * Emerald (#10B981) accent.
 */
import { useState, useEffect, useCallback } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const ACCENT = "#10B981";
const DRAWER_W = 320;
const POLL_MS = 60_000;

export default function MetricsRegistryDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await kimiClient.request("/v1/metrics");
      setData(res);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const run = async () => { if (alive) await fetchMetrics(); };
    run();
    const id = setInterval(() => { if (alive) fetchMetrics(); }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [open, fetchMetrics]);

  const counters = data?.metrics?.counters ?? [];
  const timers = data?.metrics?.timers ?? [];

  return (
    <>
      {/* Tab */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "36%",
          zIndex: 9000,
          writingMode: "vertical-rl",
          background: `${ACCENT}22`,
          border: `1px solid ${ACCENT}66`,
          borderRight: open ? "none" : `1px solid ${ACCENT}66`,
          borderRadius: open ? "6px 0 0 6px" : "0 6px 6px 0",
          padding: "10px 5px",
          cursor: "pointer",
          color: ACCENT,
          fontSize: S.fs?.xxs ?? 10,
          fontFamily: S.mono,
          letterSpacing: 2,
          transition: "right 0.2s ease",
          userSelect: "none",
        }}
      >
        MTRX
      </div>

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: open ? 0 : -DRAWER_W,
          width: DRAWER_W,
          height: "100vh",
          zIndex: 8996,
          background: "rgba(5,10,18,0.97)",
          borderLeft: `1px solid ${ACCENT}44`,
          backdropFilter: S.blur ?? "blur(12px)",
          transition: "right 0.2s ease",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 14px 10px",
            borderBottom: `1px solid ${ACCENT}33`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span style={{ color: ACCENT, fontSize: 13, fontFamily: S.mono }}>◈</span>
          <span style={{ color: S.textHi ?? "#DCEBF5", fontFamily: S.mono, fontSize: S.fs?.xs ?? 11, letterSpacing: 1, flex: 1 }}>
            METRICS REGISTRY
          </span>
          {loading && (
            <span style={{ color: `${ACCENT}88`, fontSize: 9, fontFamily: S.mono }}>POLLING…</span>
          )}
          <span
            onClick={() => setOpen(false)}
            style={{ color: S.text ?? "#7A95AB", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
          >
            ✕
          </span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
          {err && (
            <div style={{ color: "#EF4444", fontSize: 10, fontFamily: S.mono, marginBottom: 8 }}>
              {err}
            </div>
          )}

          {/* Counters section */}
          {counters.length > 0 && (
            <>
              <div style={{ color: `${ACCENT}99`, fontSize: 9, fontFamily: S.mono, letterSpacing: 2, marginBottom: 6 }}>
                COUNTERS ({counters.length})
              </div>
              {counters.map((c, i) => (
                <div
                  key={`c-${i}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "5px 8px",
                    marginBottom: 3,
                    background: `${ACCENT}0A`,
                    border: `1px solid ${ACCENT}22`,
                    borderRadius: 4,
                  }}
                >
                  <span style={{ color: S.text ?? "#7A95AB", fontFamily: S.mono, fontSize: 10, flex: 1, wordBreak: "break-all" }}>
                    {c.name ?? "—"}
                    {c.labels && Object.keys(c.labels).length > 0 && (
                      <span style={{ color: `${ACCENT}66`, fontSize: 9 }}>
                        {" {" + Object.entries(c.labels).map(([k, v]) => `${k}=${v}`).join(",") + "}"}
                      </span>
                    )}
                  </span>
                  <span style={{ color: ACCENT, fontFamily: S.mono, fontSize: 11, fontWeight: 700, marginLeft: 8, flexShrink: 0 }}>
                    {c.value ?? 0}
                  </span>
                </div>
              ))}
            </>
          )}

          {/* Timers section */}
          {timers.length > 0 && (
            <>
              <div style={{ color: `${ACCENT}99`, fontSize: 9, fontFamily: S.mono, letterSpacing: 2, marginTop: 10, marginBottom: 6 }}>
                TIMERS ({timers.length})
              </div>
              {timers.map((t, i) => (
                <div
                  key={`t-${i}`}
                  style={{
                    padding: "5px 8px",
                    marginBottom: 3,
                    background: `${ACCENT}0A`,
                    border: `1px solid ${ACCENT}22`,
                    borderRadius: 4,
                  }}
                >
                  <div style={{ color: S.text ?? "#7A95AB", fontFamily: S.mono, fontSize: 10, wordBreak: "break-all" }}>
                    {t.name ?? "—"}
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
                    <span style={{ color: ACCENT, fontFamily: S.mono, fontSize: 10 }}>
                      mean {typeof t.mean === "number" ? t.mean.toFixed(1) : "—"}ms
                    </span>
                    <span style={{ color: `${ACCENT}88`, fontFamily: S.mono, fontSize: 10 }}>
                      n={t.count ?? 0}
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}

          {!loading && counters.length === 0 && timers.length === 0 && !err && (
            <div style={{ color: S.text ?? "#7A95AB", fontSize: 10, fontFamily: S.mono, textAlign: "center", marginTop: 24 }}>
              No metrics yet
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 12px",
            borderTop: `1px solid ${ACCENT}22`,
            display: "flex",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span style={{ color: `${ACCENT}66`, fontFamily: S.mono, fontSize: 9 }}>
            /v1/metrics · 60s poll
          </span>
          <span style={{ color: `${ACCENT}66`, fontFamily: S.mono, fontSize: 9 }}>
            {counters.length}c {timers.length}t
          </span>
        </div>
      </div>
    </>
  );
}
