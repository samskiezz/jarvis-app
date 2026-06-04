/**
 * PredictionOracle — ask ANY prediction question in natural language and get a
 * rigorous, honest forecast back.
 *
 * Posts the question (+ optional JSON params) to the parallel-built backend
 * endpoint POST /functions/predict and renders the structured forecast: a big
 * point estimate, a confidence interval and/or probability, a history→forecast
 * chart with a shaded uncertainty band, the method/math used, the drivers, and —
 * prominently, because honesty is the feature — the assumptions and caveats.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis,
  Tooltip, CartesianGrid,
} from "recharts";
import { COLORS as C } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";
import {
  PageShell, PanelCard, Grid, Badge, DataState,
} from "@/components/PageKit";

const ACCENT = C.purple;

// Thin wrapper around the backend function proxy so the call site reads clearly
// and mirrors how analystChat / getLiveIntel are exposed elsewhere.
const predict = (payload) => kimiClient.functions.predict(payload);

const inputStyle = {
  background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 4,
  color: C.textB, padding: "9px 11px", fontSize: 12, fontFamily: "inherit", outline: "none",
};

const SAMPLES = [
  "XRP price in 48h",
  "Quake risk near Tokyo this week",
  "Where will flight UA218 be in 20 min",
  "BTC probability above 80k by Friday",
];

const fmtNum = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 0.001 || abs >= 1e7)) return n.toExponential(2);
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const fmtPct = (p) => (p === null || p === undefined || Number.isNaN(p)) ? null
  : `${Math.round(p * (p <= 1 ? 100 : 1))}%`;

export default function PredictionOracle() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [question, setQuestion] = useState("");
  const [paramsText, setParamsText] = useState("");
  const [showParams, setShowParams] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const autoRanRef = useRef(false);

  const run = useCallback(async (q, rawParams) => {
    const trimmed = (q || "").trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    let params;
    if (rawParams && rawParams.trim()) {
      try {
        params = JSON.parse(rawParams);
      } catch {
        setLoading(false);
        setError(new Error("Advanced params must be valid JSON."));
        return;
      }
    }
    try {
      const res = await predict(params ? { question: trimmed, params } : { question: trimmed });
      setResult(res);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-run when arriving with ?q=… (e.g. from the command palette).
  useEffect(() => {
    if (autoRanRef.current) return;
    const q = searchParams.get("q");
    if (q) {
      autoRanRef.current = true;
      setQuestion(q);
      run(q);
      // Clear the param so a refresh doesn't re-fire.
      searchParams.delete("q");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, run]);

  const onSubmit = (e) => {
    e.preventDefault();
    run(question, paramsText);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      run(question, paramsText);
    }
  };

  return (
    <PageShell
      title="PREDICTION ORACLE"
      subtitle="ASK ANYTHING — RIGOROUS, HONEST FORECASTS WITH STATED UNCERTAINTY"
      accent={ACCENT}
    >
      {/* ── Ask box ─────────────────────────────────────────────────────── */}
      <PanelCard title="ASK" accent={ACCENT} style={{ marginBottom: 14 }}>
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={onKeyDown}
              autoFocus
              placeholder="Ask anything — XRP price in 48h, quake risk near Tokyo this week, where's this flight in 20 min…"
              style={{ ...inputStyle, flex: 1, fontSize: 13 }}
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              style={{ ...inputStyle, cursor: loading ? "wait" : "pointer", color: ACCENT,
                borderColor: ACCENT + "66", background: ACCENT + "1a", fontWeight: 700,
                letterSpacing: 1.5, padding: "9px 18px", whiteSpace: "nowrap",
                opacity: !question.trim() ? 0.5 : 1 }}
            >
              {loading ? "◌ …" : "🔮 PREDICT"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {SAMPLES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setQuestion(s); run(s, paramsText); }}
                style={{ ...inputStyle, padding: "3px 9px", fontSize: 9, cursor: "pointer",
                  color: C.text, borderColor: C.border }}
              >
                {s}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => setShowParams((v) => !v)}
              style={{ ...inputStyle, padding: "3px 9px", fontSize: 9, cursor: "pointer",
                color: showParams ? ACCENT : C.text, borderColor: showParams ? ACCENT + "55" : C.border }}
            >
              {showParams ? "▾ ADVANCED PARAMS" : "▸ ADVANCED PARAMS"}
            </button>
          </div>

          {showParams && (
            <div>
              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>
                PARAMS (JSON) — optional. Supply a data series, a flight state vector, etc.
              </label>
              <textarea
                value={paramsText}
                onChange={(e) => setParamsText(e.target.value)}
                rows={5}
                placeholder={'{\n  "series": [1, 2, 3, 4],\n  "confidence": 0.9\n}'}
                style={{ ...inputStyle, width: "100%", marginTop: 5, fontSize: 11,
                  resize: "vertical", boxSizing: "border-box" }}
              />
            </div>
          )}
        </form>
      </PanelCard>

      {/* ── Result ──────────────────────────────────────────────────────── */}
      {(loading || error || result) && (
        <DataState
          loading={loading}
          error={error}
          empty={!result}
          emptyLabel="No forecast yet."
        >
          {result && <ResultView result={result} />}
        </DataState>
      )}
    </PageShell>
  );
}

function ResultView({ result }) {
  const {
    question, domain, target, horizon,
    prediction = {}, method = {}, drivers = {},
    data = {}, assumptions = [], caveats = [], used_llm,
  } = result || {};

  const interval = prediction.interval || {};
  const hasInterval = interval.low !== null && interval.low !== undefined
    && interval.high !== null && interval.high !== undefined;
  const prob = prediction.probability;
  const hasProb = prob !== null && prob !== undefined && !Number.isNaN(prob);
  const point = prediction.value ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Centerpiece result card */}
      <PanelCard accent={ACCENT} style={{ borderColor: ACCENT + "44" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 18 }}>
          {/* Big point estimate */}
          <div style={{ flex: "1 1 220px", minWidth: 200 }}>
            <div style={{ fontSize: 9, color: C.text, letterSpacing: 1.5, textTransform: "uppercase" }}>
              {target || "Forecast"}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 46, fontWeight: 800, color: ACCENT, lineHeight: 1 }}>
                {point !== null ? fmtNum(point) : (hasProb ? fmtPct(prob) : "—")}
              </span>
              {prediction.unit && point !== null && (
                <span style={{ fontSize: 16, color: C.textB, fontWeight: 600 }}>{prediction.unit}</span>
              )}
            </div>
            {prediction.point_estimate && (
              <div style={{ fontSize: 10, color: C.text, marginTop: 6 }}>
                {prediction.point_estimate}
              </div>
            )}
          </div>

          {/* Interval + probability */}
          <div style={{ flex: "1 1 220px", minWidth: 200, display: "flex", flexDirection: "column", gap: 10 }}>
            {hasInterval && (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 5, padding: "10px 12px",
                background: "rgba(0,0,0,0.3)" }}>
                <div style={{ fontSize: 8, color: C.text, letterSpacing: 1.5, textTransform: "uppercase" }}>
                  Confidence Interval
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.textB, marginTop: 4 }}>
                  {fmtNum(interval.low)} <span style={{ color: C.text }}>–</span> {fmtNum(interval.high)}
                </div>
                {interval.confidence !== null && interval.confidence !== undefined && (
                  <div style={{ fontSize: 9, color: C.text, marginTop: 3 }}>
                    @ {fmtPct(interval.confidence) || `${interval.confidence}`} confidence
                  </div>
                )}
              </div>
            )}
            {hasProb && (
              <div style={{ border: `1px solid ${C.blue}44`, borderRadius: 5, padding: "10px 12px",
                background: C.blueD }}>
                <div style={{ fontSize: 8, color: C.text, letterSpacing: 1.5, textTransform: "uppercase" }}>
                  Probability
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.blue, marginTop: 4 }}>
                  P = {fmtPct(prob)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 14,
          paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          {domain && <Badge color={ACCENT}>DOMAIN: {String(domain).toUpperCase()}</Badge>}
          {horizon && <Badge color={C.blue}>HORIZON: {String(horizon).toUpperCase()}</Badge>}
          {target && <Badge color={C.gold}>TARGET: {String(target).toUpperCase()}</Badge>}
          <span style={{ flex: 1 }} />
          <Badge color={used_llm ? C.gold : C.text}>
            {used_llm ? "⬡ LLM-ASSISTED" : "⬡ DETERMINISTIC"}
          </Badge>
        </div>
        {question && (
          <div style={{ fontSize: 9, color: C.text, marginTop: 8, fontStyle: "italic" }}>
            “{question}”
          </div>
        )}
      </PanelCard>

      {/* Chart */}
      <PanelCard title="HISTORY → FORECAST" accent={ACCENT}>
        <ForecastChart data={data} unit={prediction.unit} />
      </PanelCard>

      {/* Method + Drivers */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
        gap: 14, alignItems: "start" }}>
        <PanelCard title="METHOD" accent={ACCENT}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
            {method.name && <Badge color={ACCENT}>{method.name}</Badge>}
            {method.family && <Badge color={C.blue}>{method.family}</Badge>}
            {(method.models_used || []).map((m, i) => (
              <Badge key={i} color={C.text}>{m}</Badge>
            ))}
          </div>
          {method.math && (
            <pre style={{ margin: 0, padding: "10px 12px", background: "rgba(0,0,0,0.4)",
              border: `1px solid ${C.border}`, borderRadius: 5, color: C.neon, fontSize: 11,
              fontFamily: "'JetBrains Mono','SF Mono',monospace", whiteSpace: "pre-wrap",
              wordBreak: "break-word", lineHeight: 1.5 }}>
              {method.math}
            </pre>
          )}
        </PanelCard>

        <PanelCard title="DRIVERS" accent={ACCENT}>
          {Object.keys(drivers || {}).length === 0 ? (
            <div style={{ fontSize: 10, color: C.text }}>No drivers reported.</div>
          ) : (
            <Grid min={130} gap={8}>
              {Object.entries(drivers).map(([k, v]) => (
                <div key={k} style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`,
                  borderRadius: 5, padding: "8px 10px" }}>
                  <div style={{ fontSize: 8, letterSpacing: 1, color: C.text, textTransform: "uppercase" }}>
                    {k.replace(/_/g, " ")}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.textB, marginTop: 3,
                    wordBreak: "break-word" }}>
                    {typeof v === "number" ? fmtNum(v)
                      : typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </div>
                </div>
              ))}
            </Grid>
          )}
        </PanelCard>
      </div>

      {/* Assumptions + Caveats — honesty is a feature, shown prominently. */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
        gap: 14, alignItems: "start" }}>
        <PanelCard title="ASSUMPTIONS" accent={C.gold}>
          <HonestyList items={assumptions} color={C.gold} empty="No stated assumptions." />
        </PanelCard>
        <PanelCard title="CAVEATS" accent={C.red}>
          <HonestyList items={caveats} color={C.red} empty="No stated caveats." />
        </PanelCard>
      </div>

      {/* Data provenance */}
      {(data.source || data.as_of || data.lookback) && (
        <div style={{ fontSize: 9, color: C.text, letterSpacing: 0.5 }}>
          {data.source && <>SOURCE: <span style={{ color: C.textB }}>{data.source}</span>{"  •  "}</>}
          {data.lookback && <>LOOKBACK: <span style={{ color: C.textB }}>{data.lookback}</span>{"  •  "}</>}
          {data.as_of && <>AS OF: <span style={{ color: C.textB }}>{data.as_of}</span></>}
        </div>
      )}
    </div>
  );
}

function HonestyList({ items, color, empty }) {
  if (!items || items.length === 0) {
    return <div style={{ fontSize: 10, color: C.text }}>{empty}</div>;
  }
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex",
      flexDirection: "column", gap: 7 }}>
      {items.map((it, i) => (
        <li key={i} style={{ display: "flex", gap: 8, fontSize: 11, color: C.textB, lineHeight: 1.5 }}>
          <span style={{ color, flexShrink: 0 }}>▸</span>
          <span>{String(it)}</span>
        </li>
      ))}
    </ul>
  );
}

function ForecastChart({ data, unit }) {
  const history = Array.isArray(data?.history) ? data.history : [];
  const forecast = Array.isArray(data?.forecast) ? data.forecast : [];

  if (history.length === 0 && forecast.length === 0) {
    return <div style={{ fontSize: 10, color: C.text, padding: "8px 0" }}>No series available to chart.</div>;
  }

  // Merge into a single ordered axis. History points carry `hist`; forecast
  // points carry `fc` plus the band (low/high). The last history point is also
  // seeded into the forecast line so the dashed line connects to the solid one.
  const rows = [];
  history.forEach((p) => {
    rows.push({ t: labelT(p.t), hist: numOrNull(p.v) });
  });
  if (history.length && forecast.length) {
    const last = history[history.length - 1];
    rows.push({ t: labelT(last.t), hist: numOrNull(last.v), fc: numOrNull(last.v) });
  }
  forecast.forEach((p) => {
    const low = numOrNull(p.low);
    const high = numOrNull(p.high);
    rows.push({
      t: labelT(p.t),
      fc: numOrNull(p.v),
      bandBase: low,
      bandSpan: (low !== null && high !== null) ? high - low : null,
    });
  });

  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="t" tick={{ fill: C.text, fontSize: 8 }} stroke={C.border}
            tickLine={false} minTickGap={24} />
          <YAxis tick={{ fill: C.text, fontSize: 8 }} stroke={C.border} tickLine={false}
            width={48} domain={["auto", "auto"]}
            label={unit ? { value: unit, angle: -90, position: "insideLeft",
              fill: C.text, fontSize: 8, dy: 20 } : undefined} />
          <Tooltip
            contentStyle={{ background: C.panel, border: `1px solid ${ACCENT}55`, borderRadius: 5,
              fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}
            labelStyle={{ color: ACCENT }}
            itemStyle={{ color: C.textB }}
            formatter={(v, name) => [fmtNum(v), name]}
          />
          {/* Shaded uncertainty band: invisible base + visible span stacked on top */}
          <Area type="monotone" dataKey="bandBase" stackId="band" stroke="none"
            fill="none" isAnimationActive={false} connectNulls />
          <Area type="monotone" dataKey="bandSpan" stackId="band" stroke="none"
            fill={ACCENT} fillOpacity={0.14} isAnimationActive={false} connectNulls
            name="band" />
          {/* Past = solid */}
          <Line type="monotone" dataKey="hist" stroke={C.blue} strokeWidth={2}
            dot={false} isAnimationActive={false} connectNulls name="history" />
          {/* Forecast = dashed */}
          <Line type="monotone" dataKey="fc" stroke={ACCENT} strokeWidth={2}
            strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls
            name="forecast" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function labelT(t) {
  if (t === null || t === undefined) return "";
  if (typeof t === "number") {
    // Treat large numbers as epoch ms / s.
    const ms = t > 1e12 ? t : t > 1e9 ? t * 1000 : null;
    if (ms) {
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString(undefined,
        { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    return String(t);
  }
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  return String(t);
}
