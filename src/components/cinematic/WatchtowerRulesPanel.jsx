import { useState, useEffect, useCallback } from 'react';

const API = '';
const WTWR_RE = /\b(watchtower|rules?[_\s-]?engine|ops[_\s-]?rules?|alert[_\s-]?rules?|rule[_\s-]?engine|wtwr|rule[_\s-]?evaluation|active[_\s-]?rules?|which[_\s-]?rules?|create[_\s-]?rule|evaluate[_\s-]?rules?)\b/i;

export function isWtwrQuery(t) {
  return WTWR_RE.test(t || '');
}

export async function buildWtwrScript() {
  const r = await fetch(`${API}/v1/rules`).then(res => res.json()).catch(() => []);
  const rules = normaliseArray(r);
  const enabled = rules.filter(x => x.enabled !== false).length;
  const disabled = rules.length - enabled;
  const topRules = rules.slice(0, 4).map(x => x.name || x.id || '?').join(', ') || 'none';
  return (
    `Watchtower Rules Engine: ${rules.length} rules registered — ${enabled} enabled, ${disabled} disabled. ` +
    `Top rules: ${topRules}. Evaluate any rule set against live intel via POST /v1/rules/evaluate.`
  );
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'rules', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

const PANEL_W = 600;
const PANEL_H = 580;
const ACCENT = '#F59E0B';

export default function WatchtowerRulesPanel() {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('RULES');
  const [search, setSearch] = useState('');
  const [evalCtx, setEvalCtx] = useState('{}');
  const [evalResult, setEvalResult] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSeverity, setNewSeverity] = useState(50);
  const [newTarget, setNewTarget] = useState('');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${API}/v1/rules`).then(res => res.json());
      setRules(normaliseArray(r));
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) load();
    const id = open ? setInterval(load, 60000) : null;
    return () => { if (id) clearInterval(id); };
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:wtwr-toggle', h);
    return () => window.removeEventListener('jarvis:wtwr-toggle', h);
  }, []);

  const enabled = rules.filter(x => x.enabled !== false).length;
  const disabled = rules.length - enabled;

  const filtered = rules.filter(r => {
    if (!search) return true;
    const s = search.toLowerCase();
    return `${r.name || ''} ${r.target || ''} ${r.id || ''}`.toLowerCase().includes(s);
  });

  const badgeCount = enabled;
  const badgeCol = disabled > 0 ? '#F59E0B' : '#22C55E';

  async function doEval() {
    setEvaluating(true); setEvalResult(null);
    try {
      let ctx = null;
      try { ctx = JSON.parse(evalCtx); } catch (_) { ctx = null; }
      const r = await fetch(`${API}/v1/rules/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ context: ctx }),
      });
      const d = await r.json();
      setEvalResult(d);
    } catch (e) {
      setEvalResult({ error: e.message });
    }
    setEvaluating(false);
  }

  async function doCreate() {
    if (!newName.trim()) return;
    setCreating(true); setCreateMsg('');
    try {
      const r = await fetch(`${API}/v1/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ name: newName.trim(), severity: newSeverity, target: newTarget.trim() || undefined, enabled: true }),
      });
      if (r.ok) {
        setCreateMsg('Rule created.');
        setNewName(''); setNewTarget(''); setNewSeverity(50);
        load();
      } else {
        const e = await r.json().catch(() => ({}));
        setCreateMsg(`Error: ${e.detail || r.status}`);
      }
    } catch (e) {
      setCreateMsg(`Error: ${e.message}`);
    }
    setCreating(false);
  }

  async function doAssess() {
    setAssessing(true); setAssessText('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `Watchtower Rules Engine: ${rules.length} rules — ${enabled} enabled, ${disabled} disabled. Give a 2-sentence ops-rules health brief.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.result || JSON.stringify(d);
      setAssessText(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch (e) {
      setAssessText(`Error: ${e.message}`);
    }
    setAssessing(false);
  }

  function sevColour(sev) {
    if (sev >= 80) return '#EF4444';
    if (sev >= 50) return '#F59E0B';
    return '#22C55E';
  }

  return (
    <>
      {/* dock button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Watchtower Rules Engine (WTWR)"
        style={{
          position: 'fixed',
          left: 557040,
          bottom: 8,
          zIndex: 215,
          background: open ? ACCENT : '#1e293b',
          border: `1px solid ${ACCENT}`,
          borderRadius: 6,
          color: open ? '#04060A' : '#e2e8f0',
          fontSize: 11,
          fontWeight: 700,
          padding: '4px 9px',
          cursor: 'pointer',
          letterSpacing: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        ◈ WTWR
        {rules.length > 0 && (
          <span style={{ background: badgeCol, color: '#000', borderRadius: 8, fontSize: 10, padding: '0 5px', fontWeight: 800 }}>
            {badgeCount}
          </span>
        )}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: 'fixed',
          right: 24,
          bottom: 48,
          width: PANEL_W,
          height: PANEL_H,
          background: 'rgba(10,15,30,0.97)',
          border: `1px solid ${ACCENT}`,
          borderRadius: 12,
          zIndex: 9200,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: `0 0 40px rgba(245,158,11,0.18)`,
          overflow: 'hidden',
        }}>
          {/* header */}
          <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: ACCENT, fontSize: 14, fontWeight: 800, letterSpacing: 1 }}>◈ WATCHTOWER RULES ENGINE</span>
            <span style={{ flex: 1 }} />
            {loading && <span style={{ color: '#64748b', fontSize: 11 }}>loading…</span>}
            <button onClick={load} title="Refresh" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>↺</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 16px', borderBottom: '1px solid #0f172a' }}>
            {[
              { label: 'RULES', val: rules.length, col: ACCENT },
              { label: 'ENABLED', val: enabled, col: '#22C55E' },
              { label: 'DISABLED', val: disabled, col: '#EF4444' },
              { label: 'ENGINE', val: 'LIVE', col: '#06B6D4' },
            ].map(({ label, val, col }) => (
              <div key={label} style={{ flex: 1, background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ color: col, fontSize: 18, fontWeight: 800 }}>{val}</div>
                <div style={{ color: '#475569', fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* tab bar */}
          <div style={{ display: 'flex', gap: 6, padding: '6px 16px', borderBottom: '1px solid #0f172a', alignItems: 'center', flexWrap: 'wrap' }}>
            {['RULES', 'EVALUATE', 'CREATE'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? ACCENT : '#1e293b',
                border: '1px solid #334155',
                borderRadius: 4,
                color: tab === t ? '#04060A' : '#94a3b8',
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                cursor: 'pointer',
                letterSpacing: 1,
              }}>{t}</button>
            ))}
            {tab === 'RULES' && (
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="search rules…"
                style={{
                  flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 4,
                  color: '#e2e8f0', fontSize: 11, padding: '3px 8px',
                }}
              />
            )}
          </div>

          {/* body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {err && <div style={{ color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

            {/* RULES tab */}
            {tab === 'RULES' && (
              <>
                {filtered.length === 0 && !loading && (
                  <div style={{ color: '#475569', fontSize: 12, marginTop: 24, textAlign: 'center' }}>
                    No rules registered. Use CREATE to add the first rule.
                  </div>
                )}
                {filtered.map((rule, i) => {
                  const key = rule.id || rule._id || i;
                  const sev = rule.severity ?? 50;
                  const isOn = rule.enabled !== false;
                  return (
                    <div key={key} style={{
                      background: '#0f172a',
                      borderRadius: 6,
                      border: `1px solid ${isOn ? '#1e293b' : '#3f1239'}`,
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: isOn ? '#22C55E' : '#475569',
                        boxShadow: isOn ? '0 0 6px #22C55E' : 'none',
                        flexShrink: 0,
                      }} />
                      <span style={{
                        background: sevColour(sev) + '22',
                        color: sevColour(sev),
                        borderRadius: 4,
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '1px 5px',
                        flexShrink: 0,
                      }}>SEV {sev}</span>
                      <span style={{ color: '#e2e8f0', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rule.name || rule.id || '?'}
                      </span>
                      {rule.target && (
                        <span style={{ color: '#64748b', fontSize: 10, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          → {rule.target}
                        </span>
                      )}
                      {/* severity bar */}
                      <div style={{ width: 50, background: '#1e293b', borderRadius: 2, height: 4, flexShrink: 0 }}>
                        <div style={{ width: `${sev}%`, background: sevColour(sev), height: 4, borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* EVALUATE tab */}
            {tab === 'EVALUATE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ color: '#64748b', fontSize: 11, lineHeight: 1.5 }}>
                  Evaluate all enabled rules against a JSON context. Leave as <code style={{ color: ACCENT }}>{'{}'}</code> to use the live-intel snapshot.
                </div>
                <textarea
                  value={evalCtx}
                  onChange={e => setEvalCtx(e.target.value)}
                  rows={5}
                  placeholder='{"key": "value"}'
                  style={{
                    background: '#0f172a', border: '1px solid #334155', borderRadius: 6,
                    color: '#e2e8f0', fontSize: 11, padding: '8px', fontFamily: 'monospace',
                    resize: 'vertical',
                  }}
                />
                <button
                  onClick={doEval}
                  disabled={evaluating}
                  style={{
                    background: evaluating ? '#1e293b' : ACCENT,
                    border: 'none', borderRadius: 6,
                    color: evaluating ? '#94a3b8' : '#04060A',
                    fontSize: 11, fontWeight: 700,
                    padding: '6px 14px', cursor: 'pointer', alignSelf: 'flex-start',
                  }}
                >
                  {evaluating ? 'Evaluating…' : '▶ EVALUATE RULES'}
                </button>
                {evalResult && (
                  <div style={{ background: '#0f172a', borderRadius: 6, border: '1px solid #334155', padding: '10px 12px' }}>
                    <div style={{ color: ACCENT, fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>EVALUATION RESULT</div>
                    {evalResult.error ? (
                      <div style={{ color: '#EF4444', fontSize: 11 }}>{evalResult.error}</div>
                    ) : (
                      <>
                        {evalResult.fired !== undefined && (
                          <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>
                            Fired: <span style={{ color: '#22C55E', fontWeight: 700 }}>{evalResult.fired}</span> rule(s)
                          </div>
                        )}
                        {Array.isArray(evalResult.alerts) && evalResult.alerts.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {evalResult.alerts.slice(0, 10).map((a, ai) => (
                              <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{
                                  background: sevColour(a.severity || 50) + '22',
                                  color: sevColour(a.severity || 50),
                                  borderRadius: 3, fontSize: 9, padding: '1px 4px', fontWeight: 700,
                                }}>SEV {a.severity || '?'}</span>
                                <span style={{ color: '#cbd5e1', fontSize: 11 }}>{a.rule_name || a.name || 'Alert'}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {(!evalResult.alerts || evalResult.alerts.length === 0) && evalResult.fired === 0 && (
                          <div style={{ color: '#22C55E', fontSize: 11 }}>No rules fired — context is clean.</div>
                        )}
                        {evalResult.message && (
                          <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>{evalResult.message}</div>
                        )}
                        {!evalResult.alerts && evalResult.fired === undefined && (
                          <pre style={{ color: '#94a3b8', fontSize: 10, overflowX: 'auto', maxHeight: 160 }}>
                            {JSON.stringify(evalResult, null, 2)}
                          </pre>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* CREATE tab */}
            {tab === 'CREATE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ color: '#64748b', fontSize: 11 }}>Register a new Watchtower rule.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ color: '#94a3b8', fontSize: 10, letterSpacing: 1 }}>NAME</label>
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. High-severity quake alert"
                    style={{
                      background: '#0f172a', border: '1px solid #334155', borderRadius: 4,
                      color: '#e2e8f0', fontSize: 11, padding: '6px 10px',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ color: '#94a3b8', fontSize: 10, letterSpacing: 1 }}>
                    SEVERITY: <span style={{ color: sevColour(newSeverity), fontWeight: 700 }}>{newSeverity}</span>
                  </label>
                  <input
                    type="range" min={0} max={100} value={newSeverity}
                    onChange={e => setNewSeverity(Number(e.target.value))}
                    style={{ accentColor: sevColour(newSeverity) }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ color: '#94a3b8', fontSize: 10, letterSpacing: 1 }}>TARGET (optional)</label>
                  <input
                    value={newTarget}
                    onChange={e => setNewTarget(e.target.value)}
                    placeholder="e.g. quake / crypto / fx"
                    style={{
                      background: '#0f172a', border: '1px solid #334155', borderRadius: 4,
                      color: '#e2e8f0', fontSize: 11, padding: '6px 10px',
                    }}
                  />
                </div>
                <button
                  onClick={doCreate}
                  disabled={creating || !newName.trim()}
                  style={{
                    background: (creating || !newName.trim()) ? '#1e293b' : ACCENT,
                    border: 'none', borderRadius: 6,
                    color: (creating || !newName.trim()) ? '#94a3b8' : '#04060A',
                    fontSize: 11, fontWeight: 700,
                    padding: '6px 14px', cursor: 'pointer', alignSelf: 'flex-start',
                  }}
                >
                  {creating ? 'Creating…' : '◈ CREATE RULE'}
                </button>
                {createMsg && (
                  <div style={{ color: createMsg.startsWith('Error') ? '#EF4444' : '#22C55E', fontSize: 11 }}>
                    {createMsg}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* assess footer */}
          <div style={{ padding: '8px 16px', borderTop: '1px solid #1e293b' }}>
            {assessText && (
              <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.5 }}>{assessText}</div>
            )}
            <button
              onClick={doAssess}
              disabled={assessing}
              style={{
                background: assessing ? '#1e293b' : ACCENT,
                border: 'none', borderRadius: 6,
                color: assessing ? '#94a3b8' : '#04060A',
                fontSize: 11, fontWeight: 700,
                padding: '5px 14px', cursor: 'pointer',
              }}
            >
              {assessing ? 'Assessing…' : '▶ ASSESS'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
