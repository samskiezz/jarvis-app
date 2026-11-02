/**
 * ModelEvaluationRunner — F289.
 *
 * Run evaluations against past forecasts and track model quality scores.
 *
 *   Models     — GET /v1/predict/models → model selector list with name + learned badge.
 *   Evaluate   — POST /v1/predict/evaluate { forecast_id, actuals } → evaluation panel
 *                showing CRPS / RMSE / PSI / ECE metric bars.
 *   Re-run     — clears result, re-submits same forecast_id.
 *   Improvement— GET /v1/predict/improvement → model_scores ranked list with estimated
 *                gain bars; pending_retrains count; recent_evaluations summary.
 *   ASSESS     — /v1/jarvis/agent/chat + TTS.
 *
 * Toggle: ◈ MEVLRUN  left:209640  bottom:8  zIndex:385
 * Event:  jarvis:mevlrun-toggle
 * Voice:  "model evaluation / mevlrun / evaluate model / model runner /
 *          forecast evaluation / model scores / model eval"
 *
 * Exported for JarvisBrain: isMevlrunQuery
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ─── palette ──────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const PU   = "#A78BFA";
const GRAY = "#4E6070";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const BTN_LEFT  = 209640;
const PANEL_W   = 740;
const PANEL_H   = 580;

// ─── JarvisBrain export ───────────────────────────────────────────────────────
const MEVLRUN_RE =
  /\b(model\s+eval(uation)?\b|mevlrun\b|evaluate\s+model\b|model\s+runner\b|forecast\s+eval(uation)?\b|model\s+scores?\b|model\s+eval\b)\b/i;

export function isMevlrunQuery(q) {
  return MEVLRUN_RE.test(q || "");
}

// ─── helpers ──────────────────────────────────────────────────────────────────
async function fetchModels() {
  const r = await fetch(`${apiBase()}/v1/predict/models`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return d?.models || [];
}

async function fetchImprovement() {
  const r = await fetch(`${apiBase()}/v1/predict/improvement`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  return r.json();
}

async function runEvaluate(forecastId, actualsArr) {
  const r = await fetch(`${apiBase()}/v1/predict/evaluate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ forecast_id: forecastId, actuals: actualsArr }),
  });
  return r.json();
}

async function runAssess(context) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `Analyse model evaluation results and improvement data. Context: ${JSON.stringify(context).slice(0, 600)}. Summarise model performance, top improvement actions, and next steps.`,
    }),
  });
  const d = await r.json();
  return d?.response || d?.message || d?.text || JSON.stringify(d);
}

async function speakTTS(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    const d = await r.json();
    if (d?.audio_url || d?.url) {
      const audio = new Audio(d.audio_url || d.url);
      audio.play().catch(() => {});
    }
  } catch {
    // TTS is best-effort
  }
}

// ─── metric bar ───────────────────────────────────────────────────────────────
// Lower CRPS/RMSE/PSI/ECE is better; bar shows inverted quality (0=worst, 100=best)
function metricColor(label, value) {
  if (label === "overlap") return CY;
  // For error metrics lower=better; clamp and invert for display
  if (value === null || value === undefined) return GRAY;
  if (value < 0.1) return GN;
  if (value < 0.5) return CY;
  if (value < 1.5) return AM;
  return RD;
}

// Normalise metric to a 0-100 bar width (lower error → wider bar = better)
function metricBarPct(label, value) {
  if (label === "overlap") return Math.min(100, ((value || 0) / 100) * 100);
  if (value === null || value === undefined) return 0;
  // Invert: 0 error = 100% bar, 2+ error = ~0%
  return Math.max(0, Math.min(100, (1 - Math.min(value, 2) / 2) * 100));
}

function MetricBar({ label, value }) {
  const pct   = metricBarPct(label, value);
  const color = metricColor(label, value);
  const disp  = value === null || value === undefined ? "—" : Number(value).toFixed(4);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ color: GRAY, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
        <span style={{ color, fontSize: 12, fontFamily: "monospace" }}>{disp}</span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

// ─── score bar for model_scores ───────────────────────────────────────────────
function ScoreRow({ ms }) {
  const score = ms.score != null ? Number(ms.score).toFixed(3) : "—";
  const runs  = ms.runs || 0;
  const pct   = ms.avg_rmse != null ? Math.max(0, Math.min(100, (1 - Math.min(ms.avg_rmse, 2) / 2) * 100)) : 0;
  return (
    <div style={{ padding: "8px 10px", borderBottom: `1px solid ${BORD}`, display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
      <div>
        <div style={{ color: CY, fontSize: 12 }}>{ms.model}</div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: GN, borderRadius: 2 }} />
        </div>
      </div>
      <span style={{ color: GRAY, fontSize: 11 }}>{runs} run{runs !== 1 ? "s" : ""}</span>
      <span style={{ color: AM, fontSize: 11, fontFamily: "monospace" }}>{score}</span>
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────
export default function ModelEvaluationRunner() {
  const [open, setOpen]               = useState(false);
  const [models, setModels]           = useState([]);
  const [improvement, setImprovement] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [dataErr, setDataErr]         = useState(null);

  // Eval form
  const [forecastId, setForecastId]   = useState("");
  const [actualsStr, setActualsStr]   = useState("");
  const [evaluating, setEvaluating]   = useState(false);
  const [evalResult, setEvalResult]   = useState(null);
  const [evalErr, setEvalErr]         = useState(null);

  // ASSESS
  const [assessing, setAssessing]     = useState(false);
  const [assessText, setAssessText]   = useState(null);

  const [tab, setTab]                 = useState("eval"); // "eval" | "scores"

  const loadData = useCallback(async () => {
    try {
      setLoadingData(true);
      setDataErr(null);
      const [mdls, imp] = await Promise.all([fetchModels(), fetchImprovement()]);
      setModels(mdls);
      setImprovement(imp);
    } catch (ex) {
      setDataErr(ex.message || "Load failed");
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:mevlrun-toggle", handler);
    return () => window.removeEventListener("jarvis:mevlrun-toggle", handler);
  }, []);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  const handleEvaluate = useCallback(async () => {
    if (!forecastId.trim()) { setEvalErr("Enter a forecast ID."); return; }
    const nums = actualsStr.split(/[,\s]+/).map(Number).filter(n => !isNaN(n));
    if (nums.length < 1) { setEvalErr("Enter at least one actual value."); return; }
    try {
      setEvaluating(true);
      setEvalErr(null);
      setEvalResult(null);
      const r = await runEvaluate(forecastId.trim(), nums);
      if (r.error) { setEvalErr(r.error); }
      else { setEvalResult(r); }
    } catch (ex) {
      setEvalErr(ex.message || "Evaluation failed");
    } finally {
      setEvaluating(false);
    }
  }, [forecastId, actualsStr]);

  const handleRerun = useCallback(() => {
    setEvalResult(null);
    handleEvaluate();
  }, [handleEvaluate]);

  const handleAssess = useCallback(async () => {
    try {
      setAssessing(true);
      const ctx = { models, improvement, evalResult };
      const text = await runAssess(ctx);
      setAssessText(text);
      speakTTS(text.slice(0, 300));
    } catch {
      setAssessText("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [models, improvement, evalResult]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 385,
          background: "rgba(10,18,28,0.85)",
          border: `1px solid ${BORD}`,
          color: CY,
          fontFamily: "monospace",
          fontSize: 10,
          padding: "3px 7px",
          cursor: "pointer",
          borderRadius: 3,
          letterSpacing: 1,
        }}
        title="Model Evaluation Runner"
      >
        ◈ MEVLRUN
      </button>
    );
  }

  const modelScores = improvement?.model_scores || [];
  const pendingRetrains = improvement?.pending_retrains || [];
  const recentEvals = improvement?.recent_evaluations || [];

  return (
    <div
      style={{
        position: "fixed",
        right: 24,
        bottom: 40,
        width: PANEL_W,
        maxHeight: PANEL_H,
        zIndex: 385,
        background: SURF,
        border: `1px solid ${BORD}`,
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        fontFamily: "monospace",
        overflow: "hidden",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${BORD}`, gap: 8 }}>
        <span style={{ color: CY, fontSize: 12, fontWeight: 700, letterSpacing: 1, flex: 1 }}>◈ MODEL EVALUATION RUNNER</span>
        <span style={{ color: GRAY, fontSize: 11 }}>{models.length} models</span>
        {pendingRetrains.length > 0 && (
          <span style={{ color: AM, fontSize: 10, background: "rgba(245,166,35,0.12)", borderRadius: 3, padding: "2px 6px" }}>
            {pendingRetrains.length} retrain pending
          </span>
        )}
        <button onClick={loadData} style={btnStyle(GRAY)} title="Refresh">↺</button>
        <button onClick={handleAssess} disabled={assessing} style={btnStyle(PU)} title="ASSESS">
          {assessing ? "…" : "ASSESS"}
        </button>
        <button onClick={() => setOpen(false)} style={btnStyle(RD)}>✕</button>
      </div>

      {/* tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${BORD}` }}>
        {["eval", "scores"].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "7px 0", fontFamily: "monospace", fontSize: 11,
              letterSpacing: 1, textTransform: "uppercase", cursor: "pointer",
              background: tab === t ? "rgba(41,231,255,0.08)" : "transparent",
              color: tab === t ? CY : GRAY,
              border: "none", borderBottom: tab === t ? `2px solid ${CY}` : "2px solid transparent",
            }}
          >
            {t === "eval" ? "Evaluate" : "Model Scores"}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "12px 14px" }}>
        {dataErr && <div style={{ color: RD, fontSize: 11, marginBottom: 10 }}>{dataErr}</div>}
        {loadingData && <div style={{ color: GRAY, fontSize: 11 }}>Loading…</div>}

        {/* ── EVALUATE tab ── */}
        {tab === "eval" && (
          <>
            {/* model list (read-only context) */}
            {models.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ color: GRAY, fontSize: 10, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" }}>Available Models</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {models.map(m => (
                    <span
                      key={m.id}
                      style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 3,
                        background: m.available ? "rgba(74,222,128,0.12)" : "rgba(78,96,112,0.2)",
                        color: m.available ? GN : GRAY,
                        border: `1px solid ${m.available ? "rgba(74,222,128,0.25)" : BORD}`,
                      }}
                      title={`${m.name} — ${m.learned ? "learned" : "statistical"}`}
                    >
                      {m.name}{m.learned ? " ●" : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* eval form */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: GRAY, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>
                Forecast ID
              </label>
              <input
                value={forecastId}
                onChange={e => setForecastId(e.target.value)}
                placeholder="UUID of a past forecast"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: GRAY, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>
                Actual Values (comma-separated)
              </label>
              <input
                value={actualsStr}
                onChange={e => setActualsStr(e.target.value)}
                placeholder="e.g. 1.2, 3.4, 5.6, 7.8"
                style={inputStyle}
              />
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button
                onClick={handleEvaluate}
                disabled={evaluating}
                style={{ ...btnStyle(CY), padding: "6px 16px", fontSize: 11 }}
              >
                {evaluating ? "Evaluating…" : "Evaluate"}
              </button>
              {evalResult && (
                <button
                  onClick={handleRerun}
                  disabled={evaluating}
                  style={{ ...btnStyle(AM), padding: "6px 14px", fontSize: 11 }}
                >
                  Re-run
                </button>
              )}
            </div>

            {evalErr && (
              <div style={{ color: RD, fontSize: 11, marginBottom: 10, padding: "6px 10px", background: "rgba(248,113,113,0.08)", borderRadius: 4 }}>
                {evalErr}
              </div>
            )}

            {evalResult && (
              <div style={{ background: "rgba(41,231,255,0.04)", border: `1px solid ${BORD}`, borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ color: CY, fontSize: 11, marginBottom: 10, letterSpacing: 1 }}>
                  EVALUATION RESULT — {evalResult.model || "—"}
                </div>
                <MetricBar label="CRPS"    value={evalResult.crps}    />
                <MetricBar label="RMSE"    value={evalResult.rmse}    />
                <MetricBar label="PSI"     value={evalResult.psi}     />
                <MetricBar label="ECE"     value={evalResult.ece}     />
                <MetricBar label="Overlap" value={evalResult.overlap} />
                <div style={{ color: GRAY, fontSize: 10, marginTop: 8 }}>
                  eval id: <span style={{ color: CY }}>{evalResult.evaluation_id}</span>
                </div>
              </div>
            )}

            {/* recent evaluations from improvement endpoint */}
            {recentEvals.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ color: GRAY, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Recent Evaluations ({recentEvals.length})
                </div>
                {recentEvals.slice(0, 5).map((ev, i) => (
                  <div
                    key={ev.id || i}
                    onClick={() => setForecastId(ev.forecast_id || "")}
                    style={{ padding: "6px 8px", borderBottom: `1px solid ${BORD}`, cursor: "pointer", fontSize: 11 }}
                    title="Click to load forecast ID"
                  >
                    <span style={{ color: CY }}>{ev.model}</span>
                    <span style={{ color: GRAY, marginLeft: 8 }}>RMSE {Number(ev.rmse || 0).toFixed(3)}</span>
                    <span style={{ color: GRAY, marginLeft: 8 }}>{ev.forecast_id?.slice(0, 12)}…</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── MODEL SCORES tab ── */}
        {tab === "scores" && (
          <>
            {improvement?.error && (
              <div style={{ color: AM, fontSize: 11, padding: "6px 10px", background: "rgba(245,166,35,0.08)", borderRadius: 4, marginBottom: 10 }}>
                {improvement.error}
              </div>
            )}
            {modelScores.length === 0 && !improvement?.error && (
              <div style={{ color: GRAY, fontSize: 11 }}>No model scores yet — run an evaluation first.</div>
            )}
            {modelScores.map((ms, i) => <ScoreRow key={ms.model || i} ms={ms} />)}

            {pendingRetrains.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ color: AM, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Pending Retrains ({pendingRetrains.length})
                </div>
                {pendingRetrains.slice(0, 5).map((pr, i) => (
                  <div key={pr.id || i} style={{ padding: "5px 8px", borderBottom: `1px solid ${BORD}`, fontSize: 11 }}>
                    <span style={{ color: CY }}>{pr.model}</span>
                    <span style={{ color: GRAY, marginLeft: 8 }}>{pr.reason || "degraded"}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ASSESS output */}
        {assessText && (
          <div style={{ marginTop: 14, padding: "8px 10px", background: "rgba(167,139,250,0.07)", border: `1px solid rgba(167,139,250,0.2)`, borderRadius: 6, fontSize: 11, color: "#d4c8f5", lineHeight: 1.5 }}>
            {assessText}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── style helpers ────────────────────────────────────────────────────────────
const inputStyle = {
  width: "100%",
  background: "rgba(255,255,255,0.05)",
  border: `1px solid ${BORD}`,
  borderRadius: 4,
  color: "#e0eaf5",
  fontFamily: "monospace",
  fontSize: 11,
  padding: "6px 8px",
  boxSizing: "border-box",
};

function btnStyle(color) {
  return {
    background: "transparent",
    border: `1px solid ${color}`,
    color,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "3px 8px",
    cursor: "pointer",
    borderRadius: 3,
    letterSpacing: 0.5,
  };
}
