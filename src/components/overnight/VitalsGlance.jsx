/**
 * VitalsGlance — compact inline strip showing the three most clinically
 * relevant biometrics (HR, HRV, SpO2) from GET /v1/vitals/latest.
 *
 * Polls every 5 minutes. Readings with ts === 0 or older than 24 h are
 * rendered at reduced opacity to indicate they are seed/default values.
 *
 * Mounted inside the breadcrumb strip div in src/Layout.jsx before AutobuildPill.
 */
import { useEffect, useReducer, useRef } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 5 * 60 * 1000;
const STALE_S = 24 * 60 * 60;

const METRICS = [
  { key: "hr",   label: "HR",   unitLabel: "bpm" },
  { key: "hrv",  label: "HRV",  unitLabel: "ms"  },
  { key: "spo2", label: "SpO2", unitLabel: "%"   },
];

function isStale(ts) {
  if (!ts || ts === 0) return true;
  return Date.now() / 1000 - ts > STALE_S;
}

export default function VitalsGlance() {
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const dataRef = useRef(null);
  const [, forceRender] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    let alive = true;
    kimiClient
      .request("/v1/vitals/latest")
      .then((d) => {
        if (alive && d?.ok && d?.items) {
          dataRef.current = d.items;
          forceRender();
        }
      })
      .catch(() => {});

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [tick]);

  const items = dataRef.current;
  if (!items) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "0 8px",
        borderLeft: `1px solid ${S.border}`,
        borderRight: `1px solid ${S.border}`,
      }}
      title="Biometric vitals — GET /v1/vitals/latest (5-min poll)"
    >
      {METRICS.map(({ key, label, unitLabel }) => {
        const reading = items[key];
        if (!reading) return null;
        const stale = isStale(reading.ts);
        return (
          <span
            key={key}
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: 2,
              opacity: stale ? 0.4 : 1,
              fontFamily: S.mono,
            }}
            title={stale ? `${label} — stale / default value` : `${label} — live`}
          >
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
              {label}
            </span>
            <span style={{ fontSize: S.fs.xs, color: S.textHi, fontWeight: 600, letterSpacing: 0.5 }}>
              {typeof reading.value === "number" ? Math.round(reading.value) : "—"}
            </span>
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 0.5 }}>
              {unitLabel}
            </span>
          </span>
        );
      })}
    </span>
  );
}
