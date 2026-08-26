import { useState, useEffect, useCallback } from 'react';

const API = '';

const EVLB_RE = /\b(eval(?:uation)?s?(?:\s+(?:console|models|suite|benchmark))?|benchmarks?(?:ing)?|aip\s+eval|model\s+eval|run\s+eval|llm\s+eval|run\s+benchmark|model\s+benchmark|eval\s+models|test\s+suite|prompt\s+eval|evlb)\b/i;
export function isEvlbQuery(t) { return EVLB_RE.test(t || ''); }

export async function buildEvlbScript() {
  try {
    const r = await fetch(`${API}/v1/aip/providers`);
    const d = await r.json();
    const list = d.providers || [];
    const configured = list.filter(p => p.configured).length;
    return `AIP Eval and Benchmark Console: ${list.length} LLM providers detected, ${configured} configured and active. Use this panel to run single-prompt evaluations or multi-model benchmarks across your local and cloud fleet.`;
  } catch {
    return 'AIP Eval Benchmark Console: provider status unavailable. Open the panel to run prompt evaluations and model benchmarks.';
  }
}

const PANEL_W = 660;
const PANEL_H = 580;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#EF4444';
const BG = 'rgba(6,11,22,0.97)';
const BORDER = 'rgba(0,207,255,0.18)';
const FONT = "'JetBrains Mono',monospace";

const inputStyle = {
  width: '100%', background: 'rgba(0,207,255,0.05)',
  border: `1px solid ${BORDER}`, color: '#C8D8E8',
  fontFamily: FONT, fontSize: 10, padding: '4px 7px',
  borderRadius: 3, boxSizing: 'border-box',
};

function Tile({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: 'rgba(0,207,255,0.05)', border: `1px solid ${color || BORDER}`, borderRadius: 4, padding: '8px 10px' }}>
      <div style={{ color: color || CY, fontSize: 18, fontWeight: 700, fontFamily: FONT }}>{value}</div>
      <div style={{ color: '#88A4B8', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ color: '#88A4B8', fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>{children}</div>;
}

export default function AipEvalBenchmark() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('EVAL');
  const [providers, setProviders] = useState([]);

  const [suiteId, setSuiteId] = useState('default');
  const [evalName, setEvalName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [system, setSystem] = useState('You are a helpful assistant.');
  const [model, setModel] = useState('');
  const [evalRunning, setEvalRunning] = useState(false);
  const [evalResult, setEvalResult] = useState(null);
  const [evalError, setEvalError] = useState('');

  const [bSuiteId, setBSuiteId] = useState('default');
  const [selectedModels, setSelectedModels] = useState([]);
  const [benchRunning, setBenchRunning] = useState(false);
  const [benchResult, setBenchResult] = useState(null);
  const [benchError, setBenchError] = useState('');

  const loadProviders = useCallback(async () => {
    try {
      const r = await fetch(`${API}/v1/aip/providers`);
      if (!r.ok) return;
      const d = await r.json();
      const list = d.providers || [];
      setProviders(list);
      setModel(prev => prev || (list[0]?.id ?? ''));
    } catch { /* network unavailable */ }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:evlb-toggle', onToggle);
    return () => window.removeEventListener('jarvis:evlb-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) { loadProviders(); timer = setInterval(loadProviders, 60000); }
    return () => clearInterval(timer);
  }, [open, loadProviders]);

  const runEval = useCallback(async () => {
    if (!prompt.trim()) return;
    setEvalRunning(true); setEvalResult(null); setEvalError('');
    try {
      const r = await fetch(`${API}/v1/aip/eval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suite_id: suiteId, name: evalName || 'unnamed', prompt, system, expect: '', model }),
      });
      const d = await r.json();
      if (!r.ok) { setEvalError(d.detail || JSON.stringify(d)); return; }
      setEvalResult(d);
    } catch (e) {
      setEvalError(e.message);
    } finally {
      setEvalRunning(false);
    }
  }, [suiteId, evalName, prompt, system, model]);

  const toggleModel = useCallback((id) => {
    setSelectedModels(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const runBenchmark = useCallback(async () => {
    if (selectedModels.length === 0) return;
    setBenchRunning(true); setBenchResult(null); setBenchError('');
    try {
      const params = new URLSearchParams({ suite_id: bSuiteId, models: selectedModels.join(',') });
      const r = await fetch(`${API}/v1/aip/eval/benchmark?${params}`);
      const d = await r.json();
      if (!r.ok) { setBenchError(d.detail || JSON.stringify(d)); return; }
      setBenchResult(d);
    } catch (e) {
      setBenchError(e.message);
    } finally {
      setBenchRunning(false);
    }
  }, [bSuiteId, selectedModels]);

  const configuredCount = providers.filter(p => p.configured).length;
  const lastEvalName = evalResult ? (evalResult.result?.name || evalName || '—') : '—';
  const rawScore = evalResult?.result?.score;
  const lastScore = rawScore != null ? `${Math.round(rawScore * 100)}%` : '—';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', left: 616320, bottom: 8, zIndex: 228,
          background: open ? 'rgba(0,207,255,0.18)' : 'rgba(6,11,22,0.85)',
          border: `1px solid ${open ? CY : 'rgba(0,207,255,0.35)'}`,
          color: CY, fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          padding: '4px 9px', borderRadius: 4, cursor: 'pointer',
          textShadow: `0 0 8px ${CY}`,
        }}
      >
        ⊡ EVLB
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: '50%', top: '50%',
          transform: 'translate(-50%,-50%)',
          width: PANEL_W, maxHeight: PANEL_H,
          background: BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 8, zIndex: 9228,
          display: 'flex', flexDirection: 'column',
          fontFamily: FONT, color: '#C8D8E8',
          boxShadow: '0 0 40px rgba(0,207,255,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ color: CY, fontSize: 11, letterSpacing: 2, textShadow: `0 0 10px ${CY}` }}>⊡ AIP EVAL &amp; BENCHMARK CONSOLE</div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#88A4B8', cursor: 'pointer', fontSize: 13 }}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px' }}>
            <Tile label="PROVIDERS" value={providers.length} color={CY} />
            <Tile label="CONFIGURED" value={configuredCount} color={GR} />
            <Tile label="LAST EVAL" value={lastEvalName.slice(0, 12)} color={AM} />
            <Tile label="LAST SCORE" value={lastScore} color={lastScore === '—' ? '#88A4B8' : GR} />
          </div>

          <div style={{ display: 'flex', gap: 4, padding: '0 14px 6px' }}>
            {['EVAL', 'BENCHMARK'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? 'rgba(0,207,255,0.12)' : 'transparent',
                border: `1px solid ${tab === t ? CY : 'rgba(0,207,255,0.2)'}`,
                color: tab === t ? CY : '#88A4B8',
                fontFamily: FONT, fontSize: 9, letterSpacing: 1,
                padding: '3px 10px', borderRadius: 3, cursor: 'pointer',
              }}>{t}</button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 14px' }}>
            {tab === 'EVAL' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Label>SUITE ID</Label>
                    <input value={suiteId} onChange={e => setSuiteId(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Label>NAME</Label>
                    <input value={evalName} onChange={e => setEvalName(e.target.value)} placeholder="optional" style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Label>MODEL</Label>
                    <select value={model} onChange={e => setModel(e.target.value)}
                      style={{ ...inputStyle, background: 'rgba(6,11,22,0.9)' }}>
                      {providers.map(p => (
                        <option key={p.id} value={p.id}>{p.id}{p.configured ? '' : ' ✗'}</option>
                      ))}
                      {providers.length === 0 && <option value="">loading…</option>}
                    </select>
                  </div>
                </div>
                <div>
                  <Label>SYSTEM PROMPT</Label>
                  <textarea value={system} onChange={e => setSystem(e.target.value)} rows={2}
                    style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div>
                  <Label>PROMPT</Label>
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
                    placeholder="Enter prompt to evaluate…"
                    style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <button onClick={runEval} disabled={evalRunning || !prompt.trim()} style={{
                  background: evalRunning ? 'rgba(0,207,255,0.05)' : 'rgba(0,207,255,0.12)',
                  border: `1px solid ${CY}`, color: CY, fontFamily: FONT, fontSize: 10, letterSpacing: 1,
                  padding: '6px 14px', borderRadius: 4, cursor: evalRunning ? 'wait' : 'pointer', alignSelf: 'flex-start',
                }}>
                  {evalRunning ? '◌ RUNNING…' : '▶ RUN EVAL'}
                </button>
                {evalError && (
                  <div style={{ background: 'rgba(239,68,68,0.08)', border: `1px solid ${RD}`, borderRadius: 4, padding: '8px 10px', color: RD, fontSize: 10 }}>
                    {evalError}
                  </div>
                )}
                {evalResult && (
                  <div style={{ background: 'rgba(0,207,255,0.04)', border: `1px solid ${BORDER}`, borderRadius: 4, padding: '10px 12px' }}>
                    <div style={{ color: GR, marginBottom: 6, fontWeight: 700, fontSize: 10 }}>
                      ✓ EVAL COMPLETE{evalResult.persisted ? ' — PERSISTED' : ''}
                    </div>
                    <pre style={{ color: '#C8D8E8', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 10 }}>
                      {JSON.stringify(evalResult.result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {tab === 'BENCHMARK' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <Label>SUITE ID</Label>
                  <input value={bSuiteId} onChange={e => setBSuiteId(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <Label>SELECT MODELS</Label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 0' }}>
                    {providers.map(p => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 10, color: p.configured ? '#C8D8E8' : '#88A4B8' }}>
                        <input type="checkbox" checked={selectedModels.includes(p.id)} onChange={() => toggleModel(p.id)}
                          style={{ accentColor: CY }} />
                        {p.id}
                        {!p.configured && <span style={{ color: RD, fontSize: 9 }}>✗</span>}
                      </label>
                    ))}
                    {providers.length === 0 && <span style={{ color: '#88A4B8', fontSize: 10 }}>Loading providers…</span>}
                  </div>
                </div>
                <button onClick={runBenchmark} disabled={benchRunning || selectedModels.length === 0} style={{
                  background: benchRunning ? 'rgba(0,207,255,0.05)' : 'rgba(0,207,255,0.12)',
                  border: `1px solid ${CY}`, color: CY, fontFamily: FONT, fontSize: 10, letterSpacing: 1,
                  padding: '6px 14px', borderRadius: 4, cursor: benchRunning ? 'wait' : 'pointer', alignSelf: 'flex-start',
                }}>
                  {benchRunning ? '◌ BENCHMARKING…' : '▶ RUN BENCHMARK'}
                </button>
                {benchError && (
                  <div style={{ background: 'rgba(239,68,68,0.08)', border: `1px solid ${RD}`, borderRadius: 4, padding: '8px 10px', color: RD, fontSize: 10 }}>
                    {benchError}
                  </div>
                )}
                {benchResult && (
                  <div style={{ background: 'rgba(0,207,255,0.04)', border: `1px solid ${BORDER}`, borderRadius: 4, padding: '10px 12px', overflowX: 'auto' }}>
                    <div style={{ color: GR, marginBottom: 8, fontWeight: 700, fontSize: 10 }}>✓ BENCHMARK COMPLETE</div>
                    {Array.isArray(benchResult.results) && benchResult.results.length > 0 ? (
                      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10 }}>
                        <thead>
                          <tr>
                            {Object.keys(benchResult.results[0]).map(k => (
                              <th key={k} style={{ color: CY, textAlign: 'left', padding: '4px 8px', borderBottom: `1px solid ${BORDER}`, letterSpacing: 1, fontSize: 9 }}>
                                {k.toUpperCase()}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {benchResult.results.map((row, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid rgba(0,207,255,0.08)` }}>
                              {Object.values(row).map((v, j) => (
                                <td key={j} style={{ padding: '4px 8px', color: '#C8D8E8' }}>{String(v)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <pre style={{ color: '#C8D8E8', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 10 }}>
                        {JSON.stringify(benchResult, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
