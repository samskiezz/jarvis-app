/**
 * ScenarioRunsPanel — Feature 14
 * Left-edge slide-in drawer listing recent scenario runs from
 * GET /v1/scenario/list.
 *
 * Tab at 35 % from top on left edge so it does not overlap
 * OpsCasesPanel (60 %). Polls every 5 min while open.
 * Mounted in src/Layout.jsx after GraphCentralityDrawer.
 *
 * Endpoint: GET /v1/scenario/list?limit=20
 * → { count: number, runs: [{ id, name, params, result, engine, ts }] }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 320;
const TEAL = "#29E7FF";
const AMBER = "#F5A623";

function relAge(tsMs) {
  if (!tsMs) return "—";
  const sec = Math.floor((Date.now() - tsMs) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function resultSummary(result) {
  if (!result || typeof result !== "object") return null;
  if (result.summary) return String(result.summary).slice(0, 55);
  if (result.status) return String(result.status).slice(0, 55);
  if (result.message) return String(result.message).slice(0, 55);
  const keys = Object.keys(result).filter((k) => k !== "ok");
  if (!keys.length) return null;
  const first = result[keys[0]];
  return `${keys[0]}: ${String(first).slice(0, 45)}`;
}

export default function ScenarioRunsPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/scenario/list?limit=20")
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

  const runs = data?.runs ?? [];

  return (
    <>
      {/* Fixed toggle tab — left edge, 35 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close scenario runs" : "Open scenario runs"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "35%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${TEAL}55`,
          borderLeft: open ? "none" : `1px solid ${TEAL}55`,
          color: TEAL,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: open ? "0 4px 4px 0" : "0 4px 4px 0",
          transition: "left 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "SCENARIOS ▶" : "SCENARIOS ◀"}
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
          borderRight: `1px solid ${TEAL}33`,
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
          <span style={{ fontSize: S.fs.xs, color: TEAL, letterSpacing: 2, flex: 1 }}>
            SCENARIO RUNS
          </span>
          {data && (
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
              {runs.length} runs
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: AMBER, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : runs.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO SCENARIO RUNS
            </div>
          ) : (
            runs.map((run) => {
              const summary = resultSummary(run.result);
              return (
                <div
                  key={run.id}
                  style={{
                    padding: "9px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {/* Name + age */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span
                      style={{
                        color: "#DCEBF5",
                        fontSize: S.fs.xs,
                        letterSpacing: 0.5,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {run.name || "unnamed"}
                    </span>
                    <span style={{ fontSize: S.fs.xxs, color: S.text, flexShrink: 0 }}>
                      {relAge(run.ts)}
                    </span>
                  </div>

                  {/* Engine badge + result summary */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {run.engine && (
                      <span
                        style={{
                          fontSize: 9,
                          color: `${TEAL}AA`,
                          border: `1px solid ${TEAL}33`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          letterSpacing: 1,
                          flexShrink: 0,
                          textTransform: "uppercase",
                        }}
                      >
                        {String(run.engine).slice(0, 20)}
                      </span>
                    )}
                    {summary && (
                      <span
                        style={{
                          fontSize: S.fs.xxs,
                          color: S.text,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {summary}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
