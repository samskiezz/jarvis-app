/**
 * PredictionModelPanel — F276.
 *
 * Data sources:
 *   GET  /v1/predict/models   → {models:[{id,name,available,learned}]}
 *   POST /functions/predict   → full prediction result with confidence + drivers + caveats
 *   GET  /v1/predict/patterns?series=... → {motifs,discords,regimes,changepoints,anomalies}
 *     (called after predict, using data.history values as the series)
 *
 * Displays:
 *   - ◈ PREDMDL button  left:202360  bottom:8  zIndex:372
 *   - Model selector dropdown from /v1/predict/models
 *   - Free-text subject/entity input
 *   - "Run" → POST /functions/predict → spinner → result:
 *       predicted outcome label, confidence bar (0–100%), evidence list
 *   - Patterns table from /v1/predict/patterns (runs after predict using history)
 *   - ASSESS → /v1/jarvis/agent/chat + TTS
 *
 * Toggle: ◈ PREDMDL  left:202360  bottom:8  zIndex:372
 * Event:  jarvis:predmdl-toggle
 * Voice:  "prediction model / predmdl / predict / run prediction / forecast model /
 *          prediction panel / model prediction / run model"
 *
 * Exported for JarvisBrain: isPredmdlQuery
 * Mounted via src/App.jsx.
 */
import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ─── palette ──────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const PU   = "#B06EFF";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";
const DIM  = "rgba(41,231,255,0.45)";

// ─── constants ────────────────────────────────────────────────────────────────
const BTN_LEFT = 202360;
const PANEL_W  = 780;
const PANEL_H  = 600;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── JarvisBrain export ───────────────────────────────────────────────────────
const PREDMDL_RE =
  /\b(prediction\s+model|predmdl\b|run\s+prediction|forecast\s+model|prediction\s+panel|model\s+prediction|run\s+model|predict\b)\b/i;

export function isPredmdlQuery(q) {
  return PREDMDL_RE.test(q || "");
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function confColor(c) {
  if (c == null) return AM;
  if (c >= 0.75) return GN;
  if (c >= 0.45) return AM;
  return RD;
}

function speak(text) {
  if (!text) return;
  fetch(`${apiBase()}/v1/voice/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ text, voice: "onyx" }),
  }).catch(() => {});
}

function ConfBar({ value }) {
  const pct = value != null ? Math.round(Math.min(1, Math.max(0, value)) * 100) : 0;
  const col = confColor(value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1, height: 8, background: "rgba(255,255,255,0.07)",
          borderRadius: 4, overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`, height: "100%",
            background: col, borderRadius: 4,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: col, minWidth: 34 }}>{pct}%</span>
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────
export default function PredictionModelPanel() {
  const [open, setOpen]         = useState(false);

  // models
  const [models, setModels]     = useState([]);
  const [modelId, setModelId]   = useState("");
  const [modelsErr, setModelsErr] = useState("");

  // form
  const [subject, setSubject]   = useState("");

  // predict
  const [running, setRunning]   = useState(false);
  const [result, setResult]     = useState(null);
  const [runErr, setRunErr]     = useState("");

  // patterns
  const [patterns, setPatterns] = useState(null);
  const [patErr, setPatErr]     = useState("");

  // assess
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");

  const panelRef = useRef(null);

  // ── toggle ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    function onToggle() { setOpen(v => !v); }
    window.addEventListener("jarvis:predmdl-toggle", onToggle);
    return () => window.removeEventListener("jarvis:predmdl-toggle", onToggle);
  }, []);

  // ── load models ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setModelsErr("");
    fetch(`${apiBase()}/v1/predict/models`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
      .then(r => r.json())
      .then(d => {
        const list = d?.models ?? [];
        setModels(list);
        if (list.length > 0 && !modelId) {
          setModelId(list[0].id ?? list[0].name ?? "");
        }
      })
      .catch(() => setModelsErr("Failed to load models."));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── run prediction ───────────────────────────────────────────────────────────
  async function runPredict() {
    if (!subject.trim()) return;
    setRunning(true);
    setResult(null);
    setRunErr("");
    setPatterns(null);
    setPatErr("");
    setAssessment("");
    try {
      const r = await fetch(`${apiBase()}/functions/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ question: subject.trim() }),
      });
      const d = await r.json();
      setResult(d);
      // use history values for patterns if available
      const history = d?.data?.history ?? [];
      const series = history.map(h => (typeof h === "object" ? (h.v ?? h.value ?? 0) : Number(h)));
      if (series.length >= 4) {
        fetchPatterns(series);
      }
    } catch {
      setRunErr("Prediction request failed.");
    } finally {
      setRunning(false);
    }
  }

  async function fetchPatterns(series) {
    try {
      const params = series.map(v => `series=${encodeURIComponent(v)}`).join("&");
      const r = await fetch(`${apiBase()}/v1/predict/patterns?${params}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const d = await r.json();
      if (d?.error) {
        setPatErr(d.error);
      } else {
        setPatterns(d);
      }
    } catch {
      setPatErr("Pattern analysis unavailable.");
    }
  }

  // ── assess ───────────────────────────────────────────────────────────────────
  async function assess() {
    if (!result) return;
    setAssessing(true);
    setAssessment("");
    const conf = result?.prediction?.interval?.confidence ?? result?.prediction?.probability ?? null;
    const pct  = conf != null ? Math.round(conf * 100) : null;
    const motifCount  = patterns?.motifs?.length ?? 0;
    const patternNote = motifCount > 0 ? `${motifCount} motif pattern(s) detected in the series data.` : "";
    const prompt =
      `Prediction engine result for: "${subject}". ` +
      (pct != null ? `Confidence: ${pct}%. ` : "") +
      (result.domain ? `Domain: ${result.domain}. ` : "") +
      patternNote +
      ` Summarise key findings and top patterns in two sentences.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d?.response ?? d?.message ?? d?.content ?? "";
      setAssessment(text);
      speak(text);
    } catch {
      setAssessment("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 372,
          background: "rgba(10,18,28,0.85)",
          border: `1px solid ${BORD}`,
          color: CY,
          fontSize: 9,
          letterSpacing: 1,
          padding: "4px 8px",
          borderRadius: 4,
          cursor: "pointer",
          fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ PREDMDL
      </button>
    );
  }

  const pred  = result?.prediction ?? {};
  const conf  = pred?.interval?.confidence ?? pred?.probability ?? null;
  const point = pred?.point_estimate ?? pred?.value ?? null;
  const drivers = result?.drivers ? Object.entries(result.drivers).slice(0, 6) : [];
  const caveats = result?.caveats ?? [];
  const assumptions = result?.assumptions ?? [];

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left: BTN_LEFT,
        bottom: 50,
        width: PANEL_W,
        maxHeight: PANEL_H,
        overflowY: "auto",
        zIndex: 372,
        background: SURF,
        border: `1px solid ${BORD}`,
        borderRadius: 8,
        padding: 18,
        fontFamily: "monospace",
        color: CY,
        fontSize: 11,
      }}
    >
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 13, letterSpacing: 2 }}>◈ PREDICTION MODEL PANEL</span>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
        >
          ✕
        </button>
      </div>

      {/* model selector */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>MODEL</label>
        {modelsErr ? (
          <div style={{ color: RD, fontSize: 10 }}>{modelsErr}</div>
        ) : (
          <select
            value={modelId}
            onChange={e => setModelId(e.target.value)}
            style={{
              width: "100%", marginTop: 4,
              background: "rgba(41,231,255,0.07)", border: `1px solid ${BORD}`,
              color: CY, fontSize: 11, padding: "4px 6px", borderRadius: 4,
              fontFamily: "monospace",
            }}
          >
            {models.length === 0 && <option value="">auto</option>}
            {models.map(m => (
              <option key={m.id ?? m.name} value={m.id ?? m.name}>
                {m.name ?? m.id}{m.available === false ? " (unavailable)" : ""}
                {m.learned ? " ✓" : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* subject input */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>PREDICTION SUBJECT / ENTITY</label>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") runPredict(); }}
          placeholder="e.g. BTC price in 24h / earthquake M5+ Pacific / project growth..."
          style={{
            width: "100%", boxSizing: "border-box", marginTop: 4,
            background: "rgba(41,231,255,0.07)", border: `1px solid ${BORD}`,
            color: CY, fontSize: 11, padding: "5px 8px", borderRadius: 4,
            fontFamily: "monospace",
          }}
        />
      </div>

      {/* run button */}
      <button
        onClick={runPredict}
        disabled={running || !subject.trim()}
        style={{
          background: running ? "none" : `${CY}22`,
          border: `1px solid ${running ? BORD : CY}`,
          color: running ? DIM : CY,
          fontSize: 10, letterSpacing: 1,
          padding: "5px 18px", borderRadius: 4,
          cursor: running ? "default" : "pointer",
          marginBottom: 14,
        }}
      >
        {running ? "⟳ PREDICTING..." : "▶ RUN PREDICTION"}
      </button>

      {runErr && <div style={{ color: RD, fontSize: 10, marginBottom: 10 }}>{runErr}</div>}

      {/* result panel */}
      {result && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: DIM, letterSpacing: 1, marginBottom: 6 }}>PREDICTION RESULT</div>

          {/* outcome label */}
          <div style={{
            background: "rgba(41,231,255,0.06)", border: `1px solid ${BORD}`,
            borderRadius: 5, padding: "8px 12px", marginBottom: 10,
          }}>
            <div style={{ fontSize: 10, color: DIM, marginBottom: 2 }}>OUTCOME</div>
            <div style={{ fontSize: 13, color: CY }}>
              {point != null
                ? (typeof point === "number" ? point.toFixed(4) : String(point))
                : result.domain === "seismic"
                  ? `M${(pred?.point_estimate ?? 5.0).toFixed(1)} probability`
                  : result.horizon
                    ? `Horizon: ${result.horizon}`
                    : "See drivers below"}
            </div>
            {result.domain && (
              <div style={{ fontSize: 9, color: DIM, marginTop: 2 }}>
                DOMAIN: {result.domain.toUpperCase()}
                {result.target ? ` · TARGET: ${result.target}` : ""}
              </div>
            )}
          </div>

          {/* confidence bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: DIM, letterSpacing: 1, marginBottom: 4 }}>CONFIDENCE</div>
            <ConfBar value={conf} />
            {pred?.interval?.low != null && pred?.interval?.high != null && (
              <div style={{ fontSize: 9, color: DIM, marginTop: 3 }}>
                Interval: [{typeof pred.interval.low === "number" ? pred.interval.low.toFixed(3) : pred.interval.low}
                {" — "}
                {typeof pred.interval.high === "number" ? pred.interval.high.toFixed(3) : pred.interval.high}]
              </div>
            )}
          </div>

          {/* evidence / drivers */}
          {drivers.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: DIM, letterSpacing: 1, marginBottom: 4 }}>SUPPORTING EVIDENCE</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {drivers.map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      background: "rgba(41,231,255,0.08)", border: `1px solid ${BORD}`,
                      borderRadius: 3, padding: "2px 7px", fontSize: 9, color: CY,
                    }}
                  >
                    <span style={{ color: DIM }}>{k}:</span>{" "}
                    {typeof v === "number" ? v.toFixed(4) : String(v).slice(0, 40)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* caveats */}
          {caveats.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: DIM, letterSpacing: 1, marginBottom: 4 }}>CAVEATS</div>
              {caveats.map((c, i) => (
                <div key={i} style={{ fontSize: 9, color: AM, marginBottom: 2 }}>
                  · {c}
                </div>
              ))}
            </div>
          )}

          {/* assumptions */}
          {assumptions.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: DIM, letterSpacing: 1, marginBottom: 4 }}>ASSUMPTIONS</div>
              {assumptions.map((a, i) => (
                <div key={i} style={{ fontSize: 9, color: `${CY}99`, marginBottom: 2 }}>
                  · {a}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* patterns table */}
      {(patterns || patErr) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: DIM, letterSpacing: 1, marginBottom: 6 }}>SERIES PATTERNS</div>
          {patErr && <div style={{ color: AM, fontSize: 10 }}>{patErr}</div>}
          {patterns && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
                <thead>
                  <tr style={{ color: DIM }}>
                    <th style={{ textAlign: "left", padding: "3px 6px", borderBottom: `1px solid ${BORD}` }}>PATTERN TYPE</th>
                    <th style={{ textAlign: "left", padding: "3px 6px", borderBottom: `1px solid ${BORD}` }}>DETAIL</th>
                    <th style={{ textAlign: "right", padding: "3px 6px", borderBottom: `1px solid ${BORD}` }}>COUNT</th>
                    <th style={{ padding: "3px 6px", borderBottom: `1px solid ${BORD}`, minWidth: 80 }}>SUPPORT</th>
                  </tr>
                </thead>
                <tbody>
                  {(patterns.motifs ?? []).slice(0, 4).map((m, i) => (
                    <tr key={`motif-${i}`} style={{ borderBottom: `1px solid rgba(41,231,255,0.05)` }}>
                      <td style={{ padding: "3px 6px", color: GN }}>MOTIF</td>
                      <td style={{ padding: "3px 6px", color: CY }}>
                        idx {m.start_idx ?? m.index ?? i}
                      </td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: DIM }}>
                        {(m.occurrences ?? 1)}
                      </td>
                      <td style={{ padding: "3px 6px" }}>
                        <ConfBar value={m.distance != null ? Math.max(0, 1 - m.distance / 10) : 0.6} />
                      </td>
                    </tr>
                  ))}
                  {(patterns.discords ?? []).slice(0, 3).map((d, i) => (
                    <tr key={`discord-${i}`} style={{ borderBottom: `1px solid rgba(41,231,255,0.05)` }}>
                      <td style={{ padding: "3px 6px", color: RD }}>DISCORD</td>
                      <td style={{ padding: "3px 6px", color: CY }}>
                        idx {d.index ?? d.start_idx ?? i}
                      </td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: DIM }}>1</td>
                      <td style={{ padding: "3px 6px" }}>
                        <ConfBar value={d.distance != null ? Math.min(1, d.distance / 10) : 0.8} />
                      </td>
                    </tr>
                  ))}
                  {(patterns.regimes ?? []).slice(0, 3).map((r, i) => (
                    <tr key={`regime-${i}`} style={{ borderBottom: `1px solid rgba(41,231,255,0.05)` }}>
                      <td style={{ padding: "3px 6px", color: AM }}>REGIME</td>
                      <td style={{ padding: "3px 6px", color: CY }}>
                        {`${r.start ?? r.start_idx ?? 0}–${r.end ?? r.end_idx ?? 0}`}
                      </td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: DIM }}>
                        {r.end != null && r.start != null ? r.end - r.start : "—"}
                      </td>
                      <td style={{ padding: "3px 6px" }}>
                        <ConfBar value={r.confidence ?? 0.65} />
                      </td>
                    </tr>
                  ))}
                  {(patterns.anomalies ?? []).slice(0, 3).map((a, i) => (
                    <tr key={`anomaly-${i}`} style={{ borderBottom: `1px solid rgba(41,231,255,0.05)` }}>
                      <td style={{ padding: "3px 6px", color: PU }}>ANOMALY</td>
                      <td style={{ padding: "3px 6px", color: CY }}>idx {typeof a === "number" ? a : (a.index ?? i)}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: DIM }}>1</td>
                      <td style={{ padding: "3px 6px" }}>
                        <ConfBar value={0.85} />
                      </td>
                    </tr>
                  ))}
                  {(patterns.motifs?.length ?? 0) + (patterns.discords?.length ?? 0) +
                   (patterns.regimes?.length ?? 0) + (patterns.anomalies?.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: "6px", color: DIM, textAlign: "center" }}>
                        No patterns detected in series
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* assess */}
      {result && (
        <div style={{ borderTop: `1px solid ${BORD}`, paddingTop: 10 }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: assessing ? "none" : `${CY}15`,
              border: `1px solid ${assessing ? BORD : CY}`,
              color: assessing ? DIM : CY,
              fontSize: 9, letterSpacing: 1,
              padding: "4px 14px", borderRadius: 4,
              cursor: assessing ? "default" : "pointer",
              marginBottom: 8,
            }}
          >
            {assessing ? "⟳ Assessing…" : "▶ ASSESS"}
          </button>
          {assessment && (
            <div style={{
              background: "rgba(41,231,255,0.05)", border: `1px solid ${BORD}`,
              borderRadius: 4, padding: "8px 10px", fontSize: 10, color: `${CY}cc`,
              lineHeight: 1.5,
            }}>
              {assessment}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
