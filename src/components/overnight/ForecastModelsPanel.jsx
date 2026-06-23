/**
 * ForecastModelsPanel — Feature 56
 * Left-edge slide-in showing JARVIS forecast model registry + self-improvement
 * loop status from GET /v1/predict/models and GET /v1/predict/improvement.
 *
 * Tab at 55 % from top (between SkillScorecardPanel 50 % and ProofPacksDrawer 60 %).
 * Polls every 5 min while open.
 * Mounted in src/Layout.jsx after SkillScorecardPanel.
 *
 * Endpoints:
 *   GET /v1/predict/models
 *     → { models: [{ id, name, available, learned }] }
 *   GET /v1/predict/improvement
 *     → { model_scores: [...], pending_retrains: [...], recent_evaluations: [...] }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 310;
const ACCENT = "#38BDF8";

function rel(ts) {
  if (!ts) return "—";
  const secs = Math.floor((Date.now() - ts * 1000) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function fmt4(v) {
  if (v == null || isNaN(v)) return "—";
  return Number(v).toFixed(4);
}

export default function ForecastModelsPanel() {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState([]);
  const [improvement, setImprovement] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    Promise.all([
      kimiClient.request("/v1/predict/models"),
      kimiClient.request("/v1/predict/improvement"),
    ])
      .then(([mRes, iRes]) => {
        if (!alive) return;
        setModels(mRes?.models ?? []);
        setImprovement(iRes ?? null);
        setErr(false);
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  const scores = improvement?.model_scores ?? [];
  const pending = improvement?.pending_retrains ?? [];
  const evals = improvement?.recent_evaluations ?? [];

  const scoreMap = {};
  for (const s of scores) if (s.model_id) scoreMap[s.model_id] = s;

  return (
    <>
      {/* Fixed toggle tab — left edge, 55 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close forecast models" : "Open forecast models"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "55%",
          transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ACCENT}55`,
          borderLeft: open ? "none" : `1px solid ${ACCENT}55`,
          color: ACCENT,
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
        {open ? "MODELS ▶" : "MODELS ◀"}
      </button>

      {/* Slide-in drawer */}
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
          borderRight: `1px solid ${ACCENT}33`,
          display: "flex",
          flexDirection: "column",
          transition: "left 0.2s ease",
          fontFamily: S.mono,
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", borderBottom: `1px solid ${S.border}`, flexShrink: 0,
        }}>
          <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
            FORECAST MODELS
          </span>
          {pending.length > 0 && (
            <span style={{
              background: "#F59E0B22", border: "1px solid #F59E0B55",
              color: "#F59E0B", borderRadius: 3, padding: "1px 5px",
              fontSize: S.fs.xxs, letterSpacing: 1,
            }}>
              {pending.length} RETRAIN{pending.length !== 1 ? "S" : ""} PENDING
            </span>
          )}
          <button
            onClick={() => bump()}
            style={{
              background: "transparent", border: "none", color: S.text,
              cursor: "pointer", fontSize: S.fs.xxs, padding: 0, letterSpacing: 1,
            }}
          >
            ↺
          </button>
        </div>

        {err && (
          <div style={{ padding: "10px 14px", color: "#F87171", fontSize: S.fs.xs, letterSpacing: 1 }}>
            ENDPOINT UNAVAILABLE
          </div>
        )}

        {/* Model registry */}
        {models.length > 0 && (
          <div style={{ padding: "8px 14px 0", borderBottom: `1px solid ${S.border}`, flexShrink: 0 }}>
            <div style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 2, marginBottom: 6 }}>
              REGISTRY
            </div>
            {models.map((m) => {
              const sc = scoreMap[m.id];
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 0", borderBottom: `1px solid ${S.border}`,
                  }}
                >
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                    background: m.available ? "#4ADE80" : "#6B7280",
                  }} />
                  <span style={{ flex: 1, fontSize: S.fs.xs, color: m.available ? S.textHi : S.text, letterSpacing: 0.5 }}>
                    {m.name}
                  </span>
                  {m.learned && (
                    <span style={{
                      background: `${ACCENT}22`, border: `1px solid ${ACCENT}55`,
                      color: ACCENT, borderRadius: 3, padding: "1px 4px",
                      fontSize: S.fs.xxs, letterSpacing: 1, flexShrink: 0,
                    }}>ML</span>
                  )}
                  {sc?.score != null && (
                    <span style={{
                      fontSize: S.fs.xxs, color: "#4ADE80", letterSpacing: 1, flexShrink: 0,
                    }}>
                      {fmt4(sc.score)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Model scores from improvement loop */}
        {scores.length > 0 && (
          <div style={{ padding: "8px 14px 0", borderBottom: `1px solid ${S.border}`, flexShrink: 0 }}>
            <div style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 2, marginBottom: 6 }}>
              IMPROVEMENT SCORES
            </div>
            {scores.slice(0, 6).map((s, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "4px 0",
                borderBottom: `1px solid ${S.border}`,
              }}>
                <span style={{ flex: 1, fontSize: S.fs.xs, color: S.textHi, letterSpacing: 0.5 }}>
                  {s.model_id ?? "—"}
                </span>
                <span style={{ fontSize: S.fs.xxs, color: "#4ADE80", letterSpacing: 1 }}>
                  {fmt4(s.score)}
                </span>
                {s.evaluated_ts && (
                  <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 0.5 }}>
                    {rel(s.evaluated_ts)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Recent evaluations */}
        {evals.length > 0 && (
          <div style={{ padding: "8px 14px 0", flexShrink: 0 }}>
            <div style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 2, marginBottom: 6 }}>
              RECENT EVALS
            </div>
            {evals.slice(0, 8).map((e, i) => (
              <div key={i} style={{
                padding: "4px 0", borderBottom: `1px solid ${S.border}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ flex: 1, fontSize: S.fs.xs, color: S.textHi, letterSpacing: 0.5 }}>
                    {e.model_id ?? "—"}
                  </span>
                  <span style={{ fontSize: S.fs.xxs, color: e.skill_score != null && e.skill_score > 0 ? "#4ADE80" : "#F87171", letterSpacing: 1 }}>
                    {fmt4(e.skill_score)}
                  </span>
                  <span style={{ fontSize: S.fs.xxs, color: S.text }}>
                    {rel(e.evaluated_ts)}
                  </span>
                </div>
                {e.series_id && (
                  <div style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 0.5, marginTop: 1 }}>
                    {String(e.series_id).slice(0, 32)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!err && models.length === 0 && improvement == null && (
          <div style={{ padding: "18px 14px", color: S.text, fontSize: S.fs.xs, letterSpacing: 1 }}>
            LOADING…
          </div>
        )}

        {!err && models.length === 0 && improvement != null && (
          <div style={{ padding: "18px 14px", color: S.text, fontSize: S.fs.xs, letterSpacing: 1 }}>
            NO MODELS AVAILABLE
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: "auto", padding: "8px 14px",
          borderTop: `1px solid ${S.border}`, flexShrink: 0,
        }}>
          <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
            {models.length} MODEL{models.length !== 1 ? "S" : ""} · {evals.length} EVAL{evals.length !== 1 ? "S" : ""}
          </span>
        </div>
      </div>
    </>
  );
}
