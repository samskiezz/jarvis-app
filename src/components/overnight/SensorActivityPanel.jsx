/**
 * SensorActivityPanel — Feature 47
 * Right-edge slide-in drawer showing IMU motion activity from GET /v1/sensors/recent.
 * Tab at 27 % from top (between KnowledgeTimelinePanel 20 % and PipelineRunsDrawer 35 %).
 * Polls every 2 min while open.
 *
 * Mounted in src/Layout.jsx after VpnStatusPanel.
 *
 * Endpoint: GET /v1/sensors/recent?window_s=300
 * → { ok, window_s, samples, activity, rms_linear_acceleration_mps2,
 *     peak_linear_acceleration_mps2, peak_rotation_rate_dps, buffered,
 *     first_ts, last_ts }
 *
 * Activity labels: no_data | still | fidget | walking | running_or_vehicle |
 *                  impact_or_fall | vigorous
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS  = 120_000;
const DRAWER_W = 300;
const ACCENT   = "#8B5CF6";

const ACTIVITY_META = {
  no_data:            { label: "NO DATA",          color: "#4B5563" },
  still:              { label: "STILL",             color: "#10B981" },
  fidget:             { label: "FIDGET",            color: "#F59E0B" },
  walking:            { label: "WALKING",           color: "#3B82F6" },
  running_or_vehicle: { label: "RUNNING / VEHICLE", color: "#EF4444" },
  impact_or_fall:     { label: "IMPACT / FALL",     color: "#DC2626" },
  vigorous:           { label: "VIGOROUS",          color: "#F97316" },
};

function fmtTs(ts) {
  if (!ts) return "—";
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function SensorActivityPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err,  setErr]  = useState(false);
  const [tick, bump]    = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/sensors/recent?window_s=300")
      .then((d) => { if (alive) { setData(d); setErr(false); } })
      .catch(() => { if (alive) setErr(true); });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);

    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [open, tick]);

  const activity = data?.activity ?? "no_data";
  const meta     = ACTIVITY_META[activity] ?? ACTIVITY_META.no_data;

  const metrics = [
    { label: "SAMPLES (5 MIN)", value: data?.samples ?? "—",                                       unit: ""       },
    { label: "RMS ACCEL",        value: data?.rms_linear_acceleration_mps2 != null
                                          ? data.rms_linear_acceleration_mps2.toFixed(3)
                                          : "—",                                                     unit: " m/s²"  },
    { label: "PEAK ACCEL",       value: data?.peak_linear_acceleration_mps2 != null
                                          ? data.peak_linear_acceleration_mps2.toFixed(3)
                                          : "—",                                                     unit: " m/s²"  },
    { label: "PEAK ROTATION",    value: data?.peak_rotation_rate_dps != null
                                          ? data.peak_rotation_rate_dps.toFixed(1)
                                          : "—",                                                     unit: " °/s"   },
    { label: "BUFFERED",         value: data?.buffered ?? "—",                                       unit: " smpl"  },
    { label: "LAST SAMPLE",      value: fmtTs(data?.last_ts),                                       unit: ""       },
  ];

  return (
    <>
      {/* Fixed toggle tab — right edge, 27 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close sensor activity" : "Open IMU sensor activity"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "27%",
          transform: "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ACCENT}55`,
          borderRight: open ? "none" : `1px solid ${ACCENT}55`,
          color: ACCENT,
          fontFamily: S.mono,
          fontSize: S.fs?.xxs ?? 9,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "4px 0 0 4px",
          transition: "right 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "IMU ▶" : "IMU ◀"}
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
          background: "rgba(4,8,16,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${ACCENT}33`,
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
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "12px 14px 10px",
            borderBottom: `1px solid ${ACCENT}22`,
          }}
        >
          <div>
            <div style={{ color: ACCENT, fontSize: 9, letterSpacing: 2.5, fontWeight: 700 }}>
              SENSOR ACTIVITY
            </div>
            <div style={{ color: S.text, fontSize: 8, letterSpacing: 1, marginTop: 3, opacity: 0.7 }}>
              IMU · /v1/sensors/recent · 5-min window
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "transparent", border: "none",
              color: S.text, cursor: "pointer", fontSize: 16, lineHeight: 1,
              padding: 0, opacity: 0.6,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
          {err && !data && (
            <div style={{ color: "#EF4444", fontSize: 11, padding: "8px 0" }}>
              Failed to reach /v1/sensors/recent
            </div>
          )}
          {!data && !err && (
            <div style={{ color: S.text, fontSize: 11 }}>Loading…</div>
          )}
          {data && (
            <>
              {/* Activity badge */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "11px 12px",
                  marginBottom: 14,
                  background: `${meta.color}0D`,
                  border: `1px solid ${meta.color}33`,
                  borderLeft: `3px solid ${meta.color}`,
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                    background: meta.color,
                    boxShadow: `0 0 8px ${meta.color}80`,
                  }}
                />
                <div>
                  <div style={{ color: meta.color, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>
                    {meta.label}
                  </div>
                  <div style={{ color: S.text, fontSize: 8, letterSpacing: 1, marginTop: 2, opacity: 0.6 }}>
                    current activity
                  </div>
                </div>
              </div>

              {/* Metric rows */}
              {metrics.map(({ label, value, unit }) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    padding: "7px 0",
                    borderBottom: `1px solid ${ACCENT}11`,
                  }}
                >
                  <span style={{ color: S.text, fontSize: 9, letterSpacing: 1.5, opacity: 0.6 }}>
                    {label}
                  </span>
                  <span style={{ color: "#C0DCE8", fontSize: 12, letterSpacing: 0.5 }}>
                    {value}
                    {unit && (
                      <span style={{ color: S.text, fontSize: 9, opacity: 0.5 }}>{unit}</span>
                    )}
                  </span>
                </div>
              ))}

              {data.window_s != null && (
                <div style={{ marginTop: 12, color: S.text, fontSize: 8, letterSpacing: 1, opacity: 0.5 }}>
                  WINDOW: {data.window_s}s · 2-MIN POLL
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${ACCENT}11`,
            color: S.text,
            fontSize: 8,
            letterSpacing: 1,
            opacity: 0.4,
          }}
        >
          ACCELEROMETER · GYROSCOPE · IMU
        </div>
      </div>
    </>
  );
}
