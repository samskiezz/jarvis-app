/**
 * SolarEnergyPanel — slide-in left-edge drawer showing live solar inverter
 * data from GET /v1/solar/now.
 *
 * Tab sits at 93 % from top, below SwarmJobsDrawer at 88 %.
 * Accent: amber (#F59E0B). Polls every 2 minutes while open.
 *
 * Endpoint: GET /v1/solar/now
 * → { kw_now, kw_today_kwh, lifetime_kwh, ac_v, freq_hz, temp_c,
 *     batteries: [{ id, soc_pct, dc_v, kw, temp_c }],
 *     grid_export_kw, grid_import_kw, ts, schema_version, source }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 120_000;
const DRAWER_W = 300;
const AMBER = "#F59E0B";
const RED = "#e8203c";
const GREEN = "#22c55e";
const GREY = "#4e6070";

function fmt2(n) {
  if (n == null) return "—";
  return Number(n).toFixed(2);
}

function SocBar({ pct }) {
  const clampedPct = Math.min(100, Math.max(0, pct ?? 0));
  const color = clampedPct > 50 ? GREEN : clampedPct > 20 ? AMBER : RED;
  return (
    <div
      style={{
        height: 4,
        width: 80,
        background: "rgba(255,255,255,0.08)",
        borderRadius: 2,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${clampedPct}%`,
          background: color,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

function MetricRow({ label, value, unit, color }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 14px",
        borderBottom: `1px solid ${S.border}`,
      }}
    >
      <span
        style={{
          fontSize: S.fs.xxs,
          color: GREY,
          letterSpacing: 1,
          flex: 1,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: S.fs.xs,
          color: color ?? S.textHi,
          fontFamily: S.mono,
          letterSpacing: 0.5,
        }}
      >
        {value}
        {unit && (
          <span style={{ fontSize: S.fs.xxs, color: GREY, marginLeft: 2 }}>
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

export default function SolarEnergyPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/solar/now")
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

  const bat = data?.batteries?.[0] ?? null;
  const gridExport = data?.grid_export_kw ?? 0;
  const gridImport = data?.grid_import_kw ?? 0;

  return (
    <>
      {/* Fixed toggle tab — left edge, 93 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close solar panel" : "Open solar energy panel"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "93%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${AMBER}55`,
          borderLeft: open ? "none" : `1px solid ${AMBER}55`,
          color: AMBER,
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
        {open ? "SOLAR ▶" : "SOLAR ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8993,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight: `1px solid ${AMBER}33`,
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
              color: AMBER,
              letterSpacing: 2,
              flex: 1,
            }}
          >
            SOLAR ENERGY
          </span>
          {data?.source && (
            <span
              style={{
                fontSize: S.fs.xxs,
                color: GREY,
                border: `1px solid ${GREY}55`,
                borderRadius: 3,
                padding: "1px 4px",
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              {data.source}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
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
          ) : (
            <>
              <MetricRow
                label="Now"
                value={fmt2(data.kw_now)}
                unit="kW"
                color={data.kw_now > 0 ? AMBER : S.textHi}
              />
              <MetricRow
                label="Today"
                value={fmt2(data.kw_today_kwh)}
                unit="kWh"
              />
              <MetricRow
                label="Lifetime"
                value={
                  data.lifetime_kwh >= 1000
                    ? `${(data.lifetime_kwh / 1000).toFixed(2)}`
                    : fmt2(data.lifetime_kwh)
                }
                unit={data.lifetime_kwh >= 1000 ? "MWh" : "kWh"}
              />
              <MetricRow
                label="Grid Export"
                value={fmt2(gridExport)}
                unit="kW"
                color={gridExport > 0 ? GREEN : S.textHi}
              />
              <MetricRow
                label="Grid Import"
                value={fmt2(gridImport)}
                unit="kW"
                color={gridImport > 0 ? RED : S.textHi}
              />
              <MetricRow
                label="AC Voltage"
                value={fmt2(data.ac_v)}
                unit="V"
              />
              <MetricRow
                label="Frequency"
                value={fmt2(data.freq_hz)}
                unit="Hz"
              />
              <MetricRow
                label="Temp"
                value={fmt2(data.temp_c)}
                unit="°C"
              />

              {bat && (
                <>
                  <div
                    style={{
                      padding: "6px 14px 3px",
                      fontSize: S.fs.xxs,
                      color: GREY,
                      letterSpacing: 2,
                      textTransform: "uppercase",
                      borderTop: `1px solid ${S.border}`,
                    }}
                  >
                    Battery · {bat.id}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 14px 7px",
                      borderBottom: `1px solid ${S.border}`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: S.fs.xs,
                        color: S.textHi,
                        fontFamily: S.mono,
                        letterSpacing: 0.5,
                        flex: 1,
                      }}
                    >
                      {fmt2(bat.soc_pct)}%
                    </span>
                    <SocBar pct={bat.soc_pct} />
                  </div>
                  <MetricRow
                    label="Bat kW"
                    value={fmt2(bat.kw)}
                    unit="kW"
                  />
                  <MetricRow
                    label="Bat Temp"
                    value={fmt2(bat.temp_c)}
                    unit="°C"
                  />
                </>
              )}
            </>
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
            ? `LIVE · 2 MIN POLL · v${data.schema_version ?? "?"}`
            : err
            ? "ERR"
            : "…"}
        </div>
      </div>
    </>
  );
}
