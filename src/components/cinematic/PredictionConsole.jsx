import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const PRED_RE = /\b(predict|prediction|forecast|pred\b|prediction[._-]?engine|prediction[._-]?console|model[._-]?forecast|forecast[._-]?models|what[._-]?will[._-]?happen|make[._-]?a[._-]?prediction|price[._-]?forecast|growth[._-]?forecast|seismic[._-]?forecast|trajectory[._-]?forecast)\b/i;

export function isPredQuery(t) {
  return PRED_RE.test(t || '');
}

export async function buildPredScript() {
  const [modR, impR] = await Promise.allSettled([
    fetch(`${API}/v1/predict/models`).then(r => r.json()),
    fetch(`${API}/v1/predict/improvement`).then(r => r.json()),
  ]);
  const models = (modR.status === 'fulfilled' ? (modR.value.models || []) : []);
  const imp = impR.status === 'fulfilled' ? impR.value : {};
  const modelCount = models.length;
  const pending = (imp.pending_retrains || []).length;
  const evals = (imp.recent_evals || []).length;
  return `Prediction Engine: ${modelCount} learned model(s) available. ` +
    `Self-improvement loop: ${pending} pending retrain(s), ${evals} recent evaluation(s). ` +
    `${modelCount > 0 ? `Top model: ${models[0].name || models[0].model || 'auto'}.` : 'No trained models yet — ask a prediction question to seed the engine.'}`;
}

const CY = '#00D4FF';
const GN = '#22C55E';
const AM = '#F59E0B';
const RD = '#F43F5E';
const PU = '#A855F7';
const DIM = '#3A4A5A';

const DOMAIN_COLORS = {
  crypto: PU, seismic: RD, trajectory: AM, growth: GN, generic: CY,
};

function age(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Chip({ label, color = CY, dim }) {
  return (
    <span style={{
      fontSize: 10, padding: '1px 7px', borderRadius: 4, letterSpacing: 1,
      border: `1px solid ${dim ? DIM : color}55`,
      color: dim ? DIM : color, background: `${dim ? DIM : color}11`,
    }}>{label}</span>
  );
}

function StatTile({ label, value, color = CY }) {
  return (
    <div style={{
      flex: 1, minWidth: 80, background: 'rgba(0,212,255,0.04)',
      border: `1px solid ${color}22`, borderRadius: 8, padding: '8px 10px',
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'monospace' }}>{value ?? '—'}</div>
      <div style={{ fontSize: 9, color: '#6E8AA0', letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ScoreBar({ value, max = 1, color = CY }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 4, background: '#1A2535', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 10, color, fontFamily: 'monospace', minWidth: 32 }}>{typeof value === 'number' ? value.toFixed(3) : '—'}</span>
    </div>
  );
}

export default function PredictionConsole() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('PREDICT');
  const [models, setModels] = useState([]);
  const [improvement, setImprovement] = useState(null);
  const [loadingImp, setLoadingImp] = useState(false);

  // predict form
  const [question, setQuestion] = useState('');
  const [predicting, setPredicting] = useState(false);
  const [predResult, setPredResult] = useState(null);
  const [predError, setPredError] = useState(null);

  // assess
  const [assessing, setAssessing] = useState(false);

  const modTimer = useRef(null);

  const fetchModels = useCallback(async () => {
    try {
      const r = await fetch(`${API}/v1/predict/models`);
      if (r.ok) {
        const d = await r.json();
        setModels(d.models || []);
      }
    } catch { /* silent */ }
  }, []);

  const fetchImprovement = useCallback(async () => {
    setLoadingImp(true);
    try {
      const r = await fetch(`${API}/v1/predict/improvement`);
      if (r.ok) setImprovement(await r.json());
    } catch { /* silent */ }
    setLoadingImp(false);
  }, []);

  useEffect(() => {
    fetchModels();
    modTimer.current = setInterval(fetchModels, 120_000);
    return () => clearInterval(modTimer.current);
  }, [fetchModels]);

  useEffect(() => {
    if (open && tab === 'IMPROVEMENT' && !improvement) fetchImprovement();
  }, [open, tab, improvement, fetchImprovement]);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:pred-toggle', toggle);
    return () => window.removeEventListener('jarvis:pred-toggle', toggle);
  }, []);

  async function runPredict() {
    if (!question.trim()) return;
    setPredicting(true);
    setPredResult(null);
    setPredError(null);
    try {
      const r = await fetch(`${API}/functions/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      });
      if (r.ok) {
        setPredResult(await r.json());
      } else {
        setPredError(`HTTP ${r.status}`);
      }
    } catch (e) {
      setPredError(String(e));
    }
    setPredicting(false);
  }

  async function assess() {
    setAssessing(true);
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Summarise the prediction engine status: how many models are available, what domains are covered, and what is the self-improvement loop status? Two sentences max.` }),
      });
      if (r.ok) {
        const d = await r.json();
        const txt = d.response || d.answer || d.text || '';
        if (txt) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
      }
    } catch { /* silent */ }
    setAssessing(false);
  }

  const domainColor = d => DOMAIN_COLORS[d] || CY;
  const badgeColor = models.length > 0 ? GN : AM;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Prediction Console"
        style={{
          position: 'fixed', left: 374640 / 1000, bottom: 8, zIndex: 175,
          background: 'rgba(0,0,0,0.75)', border: `1px solid ${badgeColor}44`,
          borderRadius: 6, color: badgeColor, fontSize: 10, padding: '3px 8px',
          cursor: 'pointer', letterSpacing: 1, fontFamily: 'monospace',
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        ◉ PRED
        {models.length > 0 && (
          <span style={{ background: badgeColor, color: '#000', borderRadius: 3, fontSize: 9, padding: '0 4px', fontWeight: 700 }}>
            {models.length}
          </span>
        )}
      </button>
    );
  }

  const pred = predResult || {};
  const prediction = pred.prediction || {};
  const interval = prediction.interval || {};
  const assumptions = pred.assumptions || [];
  const caveats = pred.caveats || [];

  return (
    <div style={{
      position: 'fixed', left: 374640 / 1000, bottom: 48, zIndex: 175,
      width: 480, maxHeight: '80vh', overflowY: 'auto',
      background: 'rgba(5,12,20,0.97)', border: `1px solid ${CY}33`,
      borderRadius: 12, fontFamily: 'monospace', color: '#C8D8E8',
      boxShadow: `0 0 30px ${CY}22`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${CY}22` }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 2 }}>◉ PREDICTION CONSOLE</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={assess} disabled={assessing} style={{ fontSize: 9, color: AM, background: 'none', border: `1px solid ${AM}44`, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
            {assessing ? '...' : '▶ ASSESS'}
          </button>
          <button onClick={() => setOpen(false)} style={{ color: DIM, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', flexWrap: 'wrap' }}>
        <StatTile label="MODELS" value={models.length} color={models.length > 0 ? GN : AM} />
        <StatTile label="LAST DOMAIN" value={pred.domain || '—'} color={domainColor(pred.domain)} />
        <StatTile label="CONFIDENCE" value={prediction.confidence != null ? `${Math.round(prediction.confidence * 100)}%` : '—'} color={CY} />
        <StatTile label="PENDING RETRAIN" value={(improvement?.pending_retrains || []).length || '—'} color={AM} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '0 14px 8px', borderBottom: `1px solid ${CY}22` }}>
        {['PREDICT', 'MODELS', 'IMPROVEMENT'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontSize: 9, padding: '3px 10px', borderRadius: 4, cursor: 'pointer', letterSpacing: 1,
            background: tab === t ? `${CY}22` : 'none',
            border: `1px solid ${tab === t ? CY : DIM}`,
            color: tab === t ? CY : '#5A6A7A',
          }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: '10px 14px' }}>
        {/* PREDICT tab */}
        {tab === 'PREDICT' && (
          <div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: '#5A6A7A', marginBottom: 4, letterSpacing: 1 }}>ASK A PREDICTION QUESTION</div>
              <textarea
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runPredict(); }}
                placeholder="e.g. What will BTC price be in 24h? Probability of M4+ quake in California next 48h?"
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box', background: 'rgba(0,212,255,0.05)',
                  border: `1px solid ${CY}33`, borderRadius: 6, color: '#C8D8E8',
                  fontSize: 11, padding: '8px', resize: 'vertical', fontFamily: 'monospace',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                <button
                  onClick={runPredict}
                  disabled={predicting || !question.trim()}
                  style={{
                    background: predicting ? 'none' : `${CY}22`, border: `1px solid ${CY}55`,
                    color: predicting ? DIM : CY, borderRadius: 5, padding: '4px 14px',
                    fontSize: 10, cursor: predicting ? 'default' : 'pointer', letterSpacing: 1,
                  }}
                >
                  {predicting ? '⟳ PREDICTING...' : '▶ PREDICT'}
                </button>
                <span style={{ fontSize: 9, color: DIM }}>Ctrl+Enter to submit</span>
              </div>
            </div>

            {predError && (
              <div style={{ color: RD, fontSize: 10, padding: '6px 10px', background: `${RD}11`, borderRadius: 6, marginBottom: 8 }}>
                Error: {predError}
              </div>
            )}

            {pred.domain && (
              <div style={{ marginTop: 8 }}>
                {/* Domain + target + horizon */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <Chip label={`DOMAIN: ${pred.domain}`} color={domainColor(pred.domain)} />
                  {pred.target && <Chip label={`TARGET: ${pred.target}`} color={CY} />}
                  {pred.horizon && <Chip label={`HORIZON: ${pred.horizon}`} color={AM} />}
                  {pred.status && pred.status !== 'ok' && <Chip label={pred.status} color={RD} />}
                </div>

                {/* Prediction result */}
                {prediction.point_estimate != null && (
                  <div style={{ background: `${GN}08`, border: `1px solid ${GN}33`, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                    <div style={{ fontSize: 9, color: '#5A6A7A', letterSpacing: 1, marginBottom: 4 }}>PREDICTION</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: GN, fontFamily: 'monospace' }}>
                      {typeof prediction.point_estimate === 'number' ? prediction.point_estimate.toFixed(4) : prediction.point_estimate}
                    </div>
                    {(interval.low != null || interval.high != null) && (
                      <div style={{ fontSize: 10, color: AM, marginTop: 4 }}>
                        CI: [{interval.low != null ? Number(interval.low).toFixed(4) : '—'}, {interval.high != null ? Number(interval.high).toFixed(4) : '—'}]
                        {interval.level && <span style={{ color: DIM, marginLeft: 6 }}>{(interval.level * 100).toFixed(0)}%</span>}
                      </div>
                    )}
                    {prediction.confidence != null && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 9, color: '#5A6A7A', marginBottom: 3 }}>CONFIDENCE</div>
                        <ScoreBar value={prediction.confidence} max={1} color={prediction.confidence > 0.7 ? GN : prediction.confidence > 0.4 ? AM : RD} />
                      </div>
                    )}
                  </div>
                )}

                {/* Probability result (for events) */}
                {prediction.probability != null && prediction.point_estimate == null && (
                  <div style={{ background: `${PU}08`, border: `1px solid ${PU}33`, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                    <div style={{ fontSize: 9, color: '#5A6A7A', letterSpacing: 1, marginBottom: 4 }}>PROBABILITY</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: PU }}>
                      {(prediction.probability * 100).toFixed(1)}%
                    </div>
                    {prediction.confidence != null && (
                      <div style={{ marginTop: 6 }}>
                        <ScoreBar value={prediction.confidence} max={1} color={PU} />
                      </div>
                    )}
                  </div>
                )}

                {/* Method */}
                {pred.method && (
                  <div style={{ marginBottom: 6 }}>
                    {typeof pred.method === 'string' ? (
                      <Chip label={pred.method} color={CY} />
                    ) : (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {Object.entries(pred.method).map(([k, v]) => (
                          <Chip key={k} label={`${k}: ${v}`} color={CY} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Assumptions */}
                {assumptions.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 9, color: '#5A6A7A', letterSpacing: 1, marginBottom: 3 }}>ASSUMPTIONS</div>
                    {assumptions.map((a, i) => (
                      <div key={i} style={{ fontSize: 10, color: '#8A9AAA', padding: '2px 0', borderLeft: `2px solid ${CY}33`, paddingLeft: 6, marginBottom: 2 }}>
                        {a}
                      </div>
                    ))}
                  </div>
                )}

                {/* Caveats */}
                {caveats.length > 0 && (
                  <div>
                    <div style={{ fontSize: 9, color: '#5A6A7A', letterSpacing: 1, marginBottom: 3 }}>CAVEATS</div>
                    {caveats.map((c, i) => (
                      <div key={i} style={{ fontSize: 10, color: AM, padding: '2px 0', borderLeft: `2px solid ${AM}55`, paddingLeft: 6, marginBottom: 2 }}>
                        {c}
                      </div>
                    ))}
                  </div>
                )}

                {/* Insufficient data note */}
                {pred.status === 'insufficient_data' && pred.note && (
                  <div style={{ fontSize: 10, color: AM, marginTop: 6, padding: '6px 8px', background: `${AM}11`, borderRadius: 5 }}>
                    {pred.note}
                  </div>
                )}
              </div>
            )}

            {!pred.domain && !predicting && (
              <div style={{ fontSize: 10, color: DIM, textAlign: 'center', padding: '20px 0' }}>
                Enter a question above and press ▶ PREDICT
              </div>
            )}
          </div>
        )}

        {/* MODELS tab */}
        {tab === 'MODELS' && (
          <div>
            {models.length === 0 ? (
              <div style={{ fontSize: 10, color: DIM, textAlign: 'center', padding: '20px 0' }}>
                No trained models yet. Predictions seed the engine.
              </div>
            ) : (
              models.map((m, i) => {
                const name = m.name || m.model || `model-${i}`;
                const algo = m.algorithm || m.type || '—';
                const score = m.score ?? m.rmse ?? null;
                const lastTrain = m.last_train_ts || m.trained_at || null;
                return (
                  <div key={i} style={{ padding: '8px 10px', marginBottom: 6, background: 'rgba(0,212,255,0.03)', border: `1px solid ${CY}22`, borderRadius: 7 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: CY, fontWeight: 600 }}>{name}</span>
                      <Chip label={algo} color={PU} />
                      {lastTrain && <Chip label={age(lastTrain)} color={DIM} />}
                    </div>
                    {score != null && (
                      <div>
                        <div style={{ fontSize: 9, color: '#5A6A7A', marginBottom: 2 }}>{m.score != null ? 'SCORE' : 'RMSE'}</div>
                        <ScoreBar value={typeof score === 'number' ? score : parseFloat(score)} max={1} color={GN} />
                      </div>
                    )}
                    {m.domain && <div style={{ marginTop: 4 }}><Chip label={`domain: ${m.domain}`} color={domainColor(m.domain)} /></div>}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* IMPROVEMENT tab */}
        {tab === 'IMPROVEMENT' && (
          <div>
            {loadingImp && <div style={{ fontSize: 10, color: DIM, textAlign: 'center', padding: 20 }}>Loading...</div>}
            {improvement?.error && (
              <div style={{ fontSize: 10, color: RD, padding: '6px 8px', background: `${RD}11`, borderRadius: 5 }}>
                {improvement.error}
              </div>
            )}
            {improvement && !improvement.error && (
              <div>
                {/* Model scores */}
                {(improvement.model_scores || []).length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9, color: '#5A6A7A', letterSpacing: 1, marginBottom: 5 }}>MODEL SCORES</div>
                    {(improvement.model_scores || []).map((s, i) => (
                      <div key={i} style={{ marginBottom: 5, padding: '6px 8px', background: 'rgba(0,212,255,0.03)', border: `1px solid ${CY}22`, borderRadius: 6 }}>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 3, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, color: CY }}>{s.model || s.name || `model-${i}`}</span>
                          {s.domain && <Chip label={s.domain} color={domainColor(s.domain)} />}
                        </div>
                        {s.score != null && <ScoreBar value={s.score} max={1} color={GN} />}
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending retrains */}
                {(improvement.pending_retrains || []).length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9, color: '#5A6A7A', letterSpacing: 1, marginBottom: 5 }}>PENDING RETRAINS</div>
                    {(improvement.pending_retrains || []).map((r, i) => (
                      <div key={i} style={{ fontSize: 10, color: AM, padding: '3px 0', borderLeft: `2px solid ${AM}55`, paddingLeft: 6, marginBottom: 2 }}>
                        {typeof r === 'string' ? r : JSON.stringify(r)}
                      </div>
                    ))}
                  </div>
                )}

                {/* Recent evals */}
                {(improvement.recent_evals || []).length > 0 && (
                  <div>
                    <div style={{ fontSize: 9, color: '#5A6A7A', letterSpacing: 1, marginBottom: 5 }}>RECENT EVALUATIONS</div>
                    {(improvement.recent_evals || []).slice(0, 10).map((e, i) => (
                      <div key={i} style={{ padding: '5px 8px', marginBottom: 4, background: 'rgba(0,212,255,0.03)', border: `1px solid ${CY}22`, borderRadius: 5 }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {e.model && <Chip label={e.model} color={CY} />}
                          {e.score != null && <Chip label={`score: ${Number(e.score).toFixed(3)}`} color={e.score > 0.7 ? GN : e.score > 0.4 ? AM : RD} />}
                          {e.evaluated_at && <Chip label={age(e.evaluated_at)} color={DIM} />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(improvement.model_scores || []).length === 0 &&
                  (improvement.pending_retrains || []).length === 0 &&
                  (improvement.recent_evals || []).length === 0 && (
                    <div style={{ fontSize: 10, color: DIM, textAlign: 'center', padding: '20px 0' }}>
                      No improvement data yet — engine seeds on first prediction.
                    </div>
                )}
              </div>
            )}
            {!improvement && !loadingImp && (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 16 }}>
                <button onClick={fetchImprovement} style={{ fontSize: 10, color: CY, background: `${CY}11`, border: `1px solid ${CY}44`, borderRadius: 5, padding: '4px 12px', cursor: 'pointer' }}>
                  Load Improvement Status
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
