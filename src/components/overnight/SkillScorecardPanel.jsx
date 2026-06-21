/**
 * SkillScorecardPanel — Feature 17
 * Left-edge slide-in drawer showing JARVIS self-improvement metrics from
 * GET /v1/aip/skill.
 *
 * Tab at 50 % from top on left edge (between ScenarioRunsPanel at 35 %
 * and OpsCasesPanel at 60 %). Polls every 5 min while open.
 * Mounted in src/Layout.jsx after RemindersPanel.
 *
 * Endpoint: GET /v1/aip/skill
 * → { domain, skill_summary: { n_scored, mae, rmse, coverage, mean_skill_vs_baseline },
 *      scorecard: { ...same keys } }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 300;
const VIOLET = "#8B5CF6";

function fmt(v, decimals = 3) {
  if (v == null || isNaN(v)) return "—";
  return Number(v).toFixed(decimals);
}

function pct(v) {
  if (v == null || isNaN(v)) return "—";
  return `${(Number(v) * 100).toFixed(1)}%`;
}

function skillColor(v) {
  if (v == null || isNaN(v)) return S.text;
  return Number(v) > 0 ? "#4ADE80" : "#F87171";
}

const METRICS = [
  { key: "n_scored",              label: "SCORED",      render: (v) => (v == null ? "—" : String(v)),       unit: "predictions" },
  { key: "mae",                   label: "MAE",         render: (v) => fmt(v, 4),                            unit: "" },
  { key: "rmse",                  label: "RMSE",        render: (v) => fmt(v, 4),                            unit: "" },
  { key: "coverage",              label: "COVERAGE",    render: (v) => pct(v),                               unit: "" },
  { key: "mean_skill_vs_baseline",label: "SKILL Δ",     render: (v) => fmt(v, 4),                            unit: "", color: skillColor },
];

export default function SkillScorecardPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/aip/skill")
      .then((d) => {
        if (alive) { setData(d); setErr(false); }
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  const summary = data?.skill_summary ?? {};
  const scorecard = data?.scorecard ?? {};

  return (
    <>
      {/* Fixed toggle tab — left edge, 50 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close skill scorecard" : "Open skill scorecard"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "50%",
          transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${VIOLET}55`,
          borderLeft: open ? "none" : `1px solid ${VIOLET}55`,
          color: VIOLET,
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
        {open ? "SKILL ▶" : "SKILL ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8995,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight: `1px solid ${VIOLET}33`,
          display: "flex",
          flexDirection: "column",
          transition: "left 0.2s ease",
          fontFamily: S.mono,
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", borderBottom: `1px solid ${S.border}`, flexShrink: 0,
        }}>
          <span style={{ fontSize: S.fs.xs, color: VIOLET, letterSpacing: 2, flex: 1 }}>
            AIP SKILL SCORECARD
          </span>
          {data?.domain && (
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
              {data.domain}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: "#F87171", fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : (
            <>
              {/* Skill Summary */}
              <div style={{ padding: "8px 14px 4px", borderBottom: `1px solid ${S.border}` }}>
                <div style={{ fontSize: S.fs.xxs, color: VIOLET, letterSpacing: 2, marginBottom: 8 }}>
                  SKILL SUMMARY
                </div>
                {METRICS.map(({ key, label, render, unit, color }) => {
                  const val = summary[key];
                  const rendered = render(val);
                  const textColor = color ? color(val) : "#DCEBF5";
                  return (
                    <div key={key} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "baseline",
                      padding: "5px 0", borderBottom: `1px solid ${S.border}22`,
                    }}>
                      <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
                        {label}
                      </span>
                      <span style={{ fontSize: S.fs.xs, color: textColor, letterSpacing: 0.5 }}>
                        {rendered}{unit ? ` ${unit}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Scorecard (forward test) */}
              <div style={{ padding: "8px 14px 4px" }}>
                <div style={{ fontSize: S.fs.xxs, color: VIOLET, letterSpacing: 2, marginBottom: 8 }}>
                  FORWARD TEST SCORECARD
                </div>
                {METRICS.map(({ key, label, render, unit, color }) => {
                  const val = scorecard[key];
                  const rendered = render(val);
                  const textColor = color ? color(val) : "#DCEBF5";
                  return (
                    <div key={key} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "baseline",
                      padding: "5px 0", borderBottom: `1px solid ${S.border}22`,
                    }}>
                      <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
                        {label}
                      </span>
                      <span style={{ fontSize: S.fs.xs, color: textColor, letterSpacing: 0.5 }}>
                        {rendered}{unit ? ` ${unit}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
