/**
 * PlatformStatusStrip — polls GET /v1/jarvis/system/status every 60 s and
 * renders a collapsible row of five subsystem LEDs plus live object/job counts.
 *
 * Mounted above the breadcrumb strip in AppLayout (src/Layout.jsx).
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 60_000;

const LED_ORDER = [
  "Foundry (data plane)",
  "Gotham (ontology/mission)",
  "Apollo (delivery)",
  "AIP (AI mesh)",
  "Security/Governance",
];

const LED_SHORT = {
  "Foundry (data plane)": "FOUNDRY",
  "Gotham (ontology/mission)": "GOTHAM",
  "Apollo (delivery)": "APOLLO",
  "AIP (AI mesh)": "AIP",
  "Security/Governance": "SEC",
};

function Led({ up, label }) {
  const color = up === null ? S.text : up ? "#00c878" : "#e8203c";
  return (
    <span
      title={`${label}: ${up === null ? "unknown" : up ? "online" : "offline"}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "default" }}
    >
      <span
        style={{
          display: "inline-block",
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: color,
          boxShadow: up ? `0 0 6px 1px ${color}88` : "none",
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: S.fs.xxs, color: up ? S.textHi : S.text, letterSpacing: 1 }}>
        {LED_SHORT[label] ?? label}
      </span>
    </span>
  );
}

export default function PlatformStatusStrip() {
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState(false);
  const timerRef = useRef(null);
  // useReducer tick forces a re-fetch without changing component identity
  const [tick, bump] = useReducer((n) => n + 1, 0);

  useEffect(() => {
    let alive = true;
    kimiClient
      .request("/v1/jarvis/system/status")
      .then((d) => { if (alive) { setStatus(d); setErr(false); } })
      .catch(() => { if (alive) setErr(true); });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [tick]);

  const subsystems = status?.subsystems_up ?? {};
  const objCount = status?.gotham?.ontology_objects ?? null;
  const jobs = status?.ingestion_jobs ?? null;

  const strip = {
    position: "sticky",
    top: 0,
    zIndex: 41,
    display: "flex",
    alignItems: "center",
    height: open ? 20 : 20,
    gap: 0,
    background: "rgba(2,6,10,0.92)",
    backdropFilter: S.blur,
    WebkitBackdropFilter: S.blur,
    borderBottom: `1px solid rgba(0,200,120,0.10)`,
    fontFamily: S.mono,
    overflow: "hidden",
    transition: "height 0.15s ease",
    userSelect: "none",
  };

  return (
    <div style={strip}>
      {/* toggle knob */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Collapse platform status" : "Expand platform status"}
        style={{
          background: "transparent",
          border: "none",
          color: S.text,
          cursor: "pointer",
          fontSize: S.fs.xxs,
          padding: "0 8px",
          height: "100%",
          letterSpacing: 1,
          flexShrink: 0,
        }}
      >
        {open ? "▲" : "▼"}
      </button>

      {open && (
        <>
          {/* subsystem LEDs */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 12 }}>
            {LED_ORDER.map((name) => (
              <Led key={name} label={name} up={err ? false : (status ? (subsystems[name] ?? null) : null)} />
            ))}
          </div>

          {/* separator */}
          <div style={{ width: 1, height: 10, background: S.border, flexShrink: 0 }} />

          {/* object count */}
          <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1, padding: "0 10px" }}>
            OBJ{" "}
            <span style={{ color: S.textHi }}>
              {objCount !== null ? objCount.toLocaleString() : "—"}
            </span>
          </span>

          {/* separator */}
          {jobs && (
            <>
              <div style={{ width: 1, height: 10, background: S.border, flexShrink: 0 }} />
              <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1, padding: "0 10px" }}>
                JOBS{" "}
                <span style={{ color: "#00c878" }}>{jobs.cleared ?? "—"}</span>
                <span style={{ color: S.text }}>/{jobs.total ?? "—"}</span>
              </span>
            </>
          )}

          {/* error indicator */}
          {err && (
            <span style={{ fontSize: S.fs.xxs, color: "#e8203c", letterSpacing: 1, paddingLeft: 8 }}>
              STATUS UNREACHABLE
            </span>
          )}

          <div style={{ flex: 1 }} />

          {/* last-polled indicator */}
          <span style={{ fontSize: S.fs.xxs, color: S.text, paddingRight: 10, letterSpacing: 1 }}>
            {status ? "LIVE" : err ? "ERR" : "…"}
          </span>
        </>
      )}
    </div>
  );
}
