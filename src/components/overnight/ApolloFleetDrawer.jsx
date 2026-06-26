/**
 * ApolloFleetDrawer — Feature 124
 * Right-edge slide-in drawer showing JARVIS Apollo deployment fleet status.
 * Tab at 16 % from top (between CodePulseDrawer 17 % and VisionMonitorDrawer 14 %).
 *
 * Mounted in src/Layout.jsx after RiskSignalDrawer.
 *
 * Endpoints:
 *   GET /v1/jarvis/apollo/fleet
 *     → { environments: [{name, version, artifact, tier, status, ts}], artifacts, releases }
 *   GET /v1/jarvis/apollo/releases?limit=20
 *     → { releases: [{id, artifact, version, env, strategy, status, ts}] }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000; // 5 min
const DRAWER_W = 340;
const ACCENT = "#3B82F6";
const GREEN = "#22C55E";
const AMBER = "#F5A623";
const RED = "#FF4D4D";
const DIM = "rgba(59,130,246,0.45)";

function fmtAge(ts) {
  if (!ts) return "";
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (sec < 0) return "";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

const STATUS_COLOR = {
  active: GREEN,
  deployed: GREEN,
  ok: GREEN,
  rolledback: AMBER,
  pending: AMBER,
  degraded: AMBER,
  failed: RED,
  error: RED,
};

function statusColor(s) {
  return STATUS_COLOR[(s || "").toLowerCase()] ?? DIM;
}

const TIER_LABEL = { 0: "DEV", 1: "STAGING", 2: "PROD", dev: "DEV", staging: "STAGING", prod: "PROD" };

function tierLabel(t) {
  return TIER_LABEL[t] ?? String(t).toUpperCase();
}

function tierColor(t) {
  const label = tierLabel(t);
  if (label === "PROD") return RED;
  if (label === "STAGING") return AMBER;
  return DIM;
}

export default function ApolloFleetDrawer() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("fleet");
  const [fleet, setFleet] = useState(null);
  const [releases, setReleases] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    Promise.all([
      kimiClient.request("/v1/jarvis/apollo/fleet"),
      kimiClient.request("/v1/jarvis/apollo/releases?limit=20"),
    ])
      .then(([fleetData, relData]) => {
        if (!alive) return;
        setFleet(fleetData);
        setReleases(relData?.releases ?? []);
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

  const envs = fleet?.environments ?? [];
  const releaseList = releases ?? [];

  return (
    <>
      {/* Toggle tab — right edge, 16 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close Apollo Fleet" : "Open Apollo Fleet status"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "16%",
          transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)",
          zIndex: 9000,
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
        {open ? "APOLLO ▶" : "APOLLO ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8990,
          background: "rgba(2,6,10,0.96)",
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
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
            APOLLO FLEET
          </span>
          {fleet && (
            <span style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>
              {fleet.artifacts ?? 0} artifacts · {fleet.releases ?? 0} releases
            </span>
          )}
        </div>

        {/* Tab row */}
        <div style={{ display: "flex", borderBottom: `1px solid ${S.border}`, flexShrink: 0 }}>
          {["fleet", "releases"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: "6px 0",
                background: "none",
                border: "none",
                borderBottom: tab === t ? `2px solid ${ACCENT}` : "2px solid transparent",
                color: tab === t ? ACCENT : S.text,
                fontFamily: S.mono,
                fontSize: S.fs.xxs,
                letterSpacing: 1.5,
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: AMBER, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !fleet ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : tab === "fleet" ? (
            envs.length === 0 ? (
              <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                NO ENVIRONMENTS
              </div>
            ) : (
              envs.map((env, idx) => (
                <div
                  key={env.name ?? idx}
                  style={{
                    padding: "10px 14px",
                    borderBottom: `1px solid ${S.border}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: statusColor(env.status),
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: "#DCEBF5", fontSize: S.fs.xs, letterSpacing: 1, flex: 1 }}>
                      {env.name ?? "unknown"}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        color: tierColor(env.tier),
                        border: `1px solid ${tierColor(env.tier)}55`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 1,
                        flexShrink: 0,
                      }}
                    >
                      {tierLabel(env.tier)}
                    </span>
                  </div>
                  <div style={{ paddingLeft: 15, display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {env.version && (
                      <span style={{ fontSize: 9, color: ACCENT, letterSpacing: 0.5 }}>
                        v{env.version}
                      </span>
                    )}
                    {env.artifact && (
                      <span style={{ fontSize: 9, color: S.text, letterSpacing: 0.5, opacity: 0.7 }}>
                        {env.artifact}
                      </span>
                    )}
                    {env.status && (
                      <span
                        style={{
                          fontSize: 9,
                          color: statusColor(env.status),
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                        }}
                      >
                        {env.status}
                      </span>
                    )}
                    {env.ts && (
                      <span style={{ fontSize: 9, color: DIM, letterSpacing: 0.5, marginLeft: "auto" }}>
                        {fmtAge(env.ts)}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )
          ) : (
            /* releases tab */
            releaseList.length === 0 ? (
              <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                NO RELEASES
              </div>
            ) : (
              releaseList.map((rel, idx) => (
                <div
                  key={rel.id ?? idx}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${S.border}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span
                      style={{
                        fontSize: 9,
                        color: statusColor(rel.status),
                        border: `1px solid ${statusColor(rel.status)}55`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 1,
                        flexShrink: 0,
                        textTransform: "uppercase",
                      }}
                    >
                      {rel.status ?? "unknown"}
                    </span>
                    <span style={{ color: "#DCEBF5", fontSize: S.fs.xxs, letterSpacing: 1, flex: 1 }}>
                      {rel.artifact ?? "?"}
                    </span>
                    {rel.ts && (
                      <span style={{ fontSize: 9, color: DIM, letterSpacing: 0.5, flexShrink: 0 }}>
                        {fmtAge(rel.ts)}
                      </span>
                    )}
                  </div>
                  <div style={{ paddingLeft: 0, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {rel.version && (
                      <span style={{ fontSize: 9, color: ACCENT, letterSpacing: 0.5 }}>
                        v{rel.version}
                      </span>
                    )}
                    {rel.env && (
                      <span style={{ fontSize: 9, color: S.text, letterSpacing: 0.5 }}>
                        → {rel.env}
                      </span>
                    )}
                    {rel.strategy && (
                      <span style={{ fontSize: 9, color: DIM, letterSpacing: 0.5 }}>
                        [{rel.strategy}]
                      </span>
                    )}
                  </div>
                </div>
              ))
            )
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: 9,
            color: DIM,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          APOLLO · deploy fleet · 5-min poll
        </div>
      </div>
    </>
  );
}
