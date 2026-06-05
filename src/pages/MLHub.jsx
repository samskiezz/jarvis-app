/**
 * MLHub — model / inference run hub.
 *
 * Wired to the REAL AI/Prediction (AIP) engine that the backend already ships
 * (server/services/aip.py + server/routes/aip.py + server/routes/predict.py):
 *   - POST /functions/predict            → the unified forecasting model
 *                                          (point estimate + confidence interval)
 *   - POST /v1/aip/predict               → same engine via the AIP tool wrapper
 *   - GET  /v1/aip/oracle?asset=&source= → the TRAINED conviction/direction/
 *                                          volatility model (oracle_model.joblib)
 *
 * The page lists the real models on this engine and turns "launch job" into a
 * real INFERENCE RUN: each run hits the engine and the live result (status,
 * point estimate, interval, conviction/direction, method) is surfaced in the run
 * history. No SwarmJob shells, no fabricated progress bars — every row is the
 * genuine response of a model that actually executed. Keeps the cyberpunk-glass
 * identity (status badges, stat tiles, progress = real confidence/conviction).
 */
import { useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { apiPost, apiGet, qs, useAsync } from "@/lib/wave1";
import {
  PageShell, PanelCard, StatTile, Grid, Badge, DataState,
} from "@/components/PageKit";

const ACCENT = C.purple;

// The real models exposed by the AIP engine. "predict" is the unified
// forecasting engine (any question/domain); "oracle" is the trained joblib
// conviction model (crypto assets).
const MODELS = [
  {
    id: "predict",
    label: "Prediction Engine",
    family: "forecast",
    color: C.purple,
    desc: "Unified multi-domain forecaster — point estimate + confidence interval.",
    targetLabel: "QUESTION / TARGET",
    placeholder: "e.g. bitcoin price in 24h",
  },
  {
    id: "oracle",
    label: "Oracle (trained)",
    family: "conviction",
    color: C.gold,
    desc: "Trained conviction / direction / volatility model on a crypto asset.",
    targetLabel: "ASSET",
    placeholder: "e.g. bitcoin",
  },
];

const STATUS_COLOR = {
  ok: C.neon,
  running: C.blue,
  no_model: C.gold,
  not_fitted: C.gold,
  insufficient_data: C.gold,
  error: C.red,
};
const statusColor = (s) => STATUS_COLOR[String(s || "").toLowerCase()] || C.text;

const fmtNum = (v, d = 2) =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—";

const inputStyle = {
  background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 4,
  color: C.textB, padding: "7px 9px", fontSize: 10, fontFamily: "inherit", outline: "none",
};

// Normalise a model response into a uniform run row with a real "confidence" bar
// (forecast CI confidence, or oracle conviction) — never a faked percentage.
function buildRun(model, target, res) {
  const at = Date.now();
  const base = { id: `${model.id}-${at}`, at, model: model.label, modelColor: model.color, family: model.family, target };
  if (model.id === "oracle") {
    const status = res?.status || "error";
    const conv = typeof res?.conviction === "number" ? res.conviction : null;
    return {
      ...base,
      status,
      pct: conv != null ? Math.round(conv * 100) : 0,
      pctLabel: conv != null ? `${Math.round(conv * 100)}% conviction` : "",
      detail: status === "ok"
        ? `${String(res.direction || "").toUpperCase()} · p(up) ${fmtNum(res.prob_up)} · vol ${fmtNum(res.vol_pred, 4)} · point ${fmtNum(res.point)}`
        : (res?.reason || status),
    };
  }
  // predict
  const pred = res?.prediction || {};
  const interval = pred.interval || {};
  const conf = typeof interval.confidence === "number" ? interval.confidence : null;
  const point = pred.point_estimate ?? pred.value;
  const prob = pred.probability;
  const method = res?.method || {};
  const hasPoint = typeof point === "number" && Number.isFinite(point);
  const status = res?.status === "error" ? "error" : (hasPoint || typeof prob === "number" ? "ok" : "insufficient_data");
  let detail;
  if (hasPoint) {
    detail = `${res.domain || "generic"} · ${fmtNum(point)} [${fmtNum(interval.low)} – ${fmtNum(interval.high)}] · ${method.name || "model"}`;
  } else if (typeof prob === "number") {
    detail = `${res.domain || "generic"} · p ${fmtNum(prob)} · ${method.name || "model"}`;
  } else {
    detail = (res?.caveats && res.caveats[0]) || res?.reason || "insufficient data";
  }
  return {
    ...base,
    status,
    pct: conf != null ? Math.round(conf * 100) : (typeof prob === "number" ? Math.round(prob * 100) : 0),
    pctLabel: conf != null ? `${Math.round(conf * 100)}% confidence` : (typeof prob === "number" ? `p=${fmtNum(prob)}` : ""),
    detail,
  };
}

export default function MLHub() {
  const [runs, setRuns] = useState([]);
  const [modelId, setModelId] = useState(MODELS[0].id);
  const [target, setTarget] = useState("");
  const { loading: busy, error, run: act } = useAsync();

  const model = useMemo(() => MODELS.find((m) => m.id === modelId) || MODELS[0], [modelId]);

  const pushRun = (entry) => setRuns((prev) => [entry, ...prev].slice(0, 30));

  const launch = async (e) => {
    e.preventDefault();
    const tgt = target.trim() || model.placeholder.replace(/^e\.g\.\s*/, "");
    const res = await act(() =>
      model.id === "oracle"
        ? apiGet(`/v1/aip/oracle${qs({ asset: tgt, source: "crypto" })}`)
        : apiPost("/functions/predict", { question: tgt }),
    );
    if (res) pushRun(buildRun(model, tgt, res));
  };

  const removeRun = (id) => setRuns((prev) => prev.filter((r) => r.id !== id));

  const counts = useMemo(() => runs.reduce((acc, r) => {
    const k = r.status === "ok" ? "ok" : (r.status === "error" ? "error" : "degraded");
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {}), [runs]);

  return (
    <PageShell
      title="ML HUB"
      subtitle="PREDICTION ENGINE · ORACLE MODEL · LIVE INFERENCE RUNS"
      accent={ACCENT}
      actions={
        <Badge color={ACCENT}>{MODELS.length} MODELS</Badge>
      }
    >
      <Grid min={150} gap={10} style={{ marginBottom: 14 }}>
        <StatTile label="Models" value={MODELS.length} accent={ACCENT} sub="on engine" />
        <StatTile label="Runs (session)" value={runs.length} accent={C.blue} />
        <StatTile label="OK" value={counts.ok || 0} accent={C.neon} sub="produced output" />
        <StatTile label="Degraded" value={counts.degraded || 0} accent={C.gold} sub="insufficient/no-model" />
        <StatTile label="Errors" value={counts.error || 0} accent={C.red} />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 14, alignItems: "start" }}>
        <PanelCard title="INFERENCE RUNS" accent={ACCENT} right={<Badge color={ACCENT}>{runs.length}</Badge>}>
          <DataState
            loading={busy && runs.length === 0}
            error={error && runs.length === 0 ? error : null}
            empty={!busy && runs.length === 0}
            emptyLabel="No runs yet — pick a model and launch a real inference run →"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {runs.map((r) => {
                const sc = statusColor(r.status);
                return (
                  <div key={r.id} style={{ border: `1px solid ${C.border}`, borderRadius: 5, padding: "9px 11px", background: "rgba(0,0,0,0.25)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: C.textB, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.target}
                      </span>
                      <Badge color={r.modelColor}>{r.model}</Badge>
                      <Badge color={sc}>{String(r.status || "?").toUpperCase()}</Badge>
                    </div>
                    <div style={{ marginTop: 7, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(0, Math.min(100, r.pct))}%`, height: "100%", background: sc, transition: "width .3s" }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", marginTop: 6, gap: 10 }}>
                      <span style={{ fontSize: 8, color: sc, fontWeight: 700 }}>{r.pctLabel}</span>
                      <span style={{ flex: 1, fontSize: 9, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.detail}
                      </span>
                      <button onClick={() => removeRun(r.id)}
                        style={{ ...inputStyle, padding: "3px 8px", fontSize: 8, cursor: "pointer", color: C.red, borderColor: C.red + "44" }}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </DataState>
        </PanelCard>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <PanelCard title="LAUNCH RUN" accent={ACCENT}>
            <form onSubmit={launch} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>MODEL</label>
              <select value={modelId} onChange={(e) => { setModelId(e.target.value); setTarget(""); }} style={inputStyle}>
                {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label} · {m.family}</option>)}
              </select>

              <div style={{ fontSize: 9, color: C.text }}>{model.desc}</div>

              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>{model.targetLabel}</label>
              <input value={target} onChange={(e) => setTarget(e.target.value)}
                placeholder={model.placeholder} style={inputStyle} />

              <button type="submit" disabled={busy}
                style={{ ...inputStyle, cursor: busy ? "wait" : "pointer", color: model.color, borderColor: model.color + "66",
                  background: model.color + "1a", fontWeight: 700, letterSpacing: 1, marginTop: 4 }}>
                {busy ? "… RUNNING" : "▶ RUN INFERENCE"}
              </button>
              {error && (
                <div style={{ fontSize: 9, color: C.red }}>
                  {String(error.message || error)}
                </div>
              )}
            </form>
          </PanelCard>

          <PanelCard title="MODELS" accent={C.blue}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {MODELS.map((m) => (
                <div key={m.id} style={{ border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 10px", background: "rgba(0,0,0,0.25)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, color: C.textB, fontWeight: 700, flex: 1 }}>{m.label}</span>
                    <Badge color={m.color}>{m.family}</Badge>
                  </div>
                  <div style={{ fontSize: 9, color: C.text, marginTop: 4 }}>{m.desc}</div>
                </div>
              ))}
            </div>
          </PanelCard>
        </div>
      </div>
    </PageShell>
  );
}
