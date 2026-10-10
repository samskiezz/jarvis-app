import { useState, useEffect, useCallback } from 'react';

const API = '';

const IRTTRI_RE = /\b(investigation[._-]?risk[._-]?task|irttri|fully[._-]?armed[._-]?invest|adrift[._-]?invest|investigation[._-]?triple|risk[._-]?task[._-]?invest|investigation[._-]?account|inv[._-]?risk[._-]?task|case[._-]?triple)\b/i;

export function isIrttriQuery(t) {
  return IRTTRI_RE.test(t || '');
}

function normaliseInvestigations(raw) {
  if (!raw) return [];
  const arr = ['investigations', 'items', 'results', 'data', 'cases', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((inv, i) => ({
    id:          inv.id || String(i),
    name:        inv.name || inv.title || inv.subject || `Investigation ${i + 1}`,
    kind:        inv.kind || inv.type || inv.category || '',
    status:      inv.status || inv.state || '',
    description: String(inv.description || inv.summary || inv.objective || '').slice(0, 300),
    tags:        Array.isArray(inv.tags) ? inv.tags.join(' ') : (inv.tags || ''),
  }));
}

function normaliseRiskSignals(raw) {
  if (!raw) return [];
  const arr = ['risk_signals', 'riskSignals', 'signals', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((r, i) => ({
    id:          r.id || String(i),
    name:        r.name || r.title || r.signal || `Signal ${i + 1}`,
    severity:    r.severity || r.level || r.priority || '',
    category:    r.category || r.type || '',
    sector:      r.sector || r.domain || '',
    description: String(r.description || r.summary || r.source || '').slice(0, 200),
    tags:        Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
  }));
}

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = ['tasks', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((t, i) => ({
    id:       t.id || String(i),
    name:     t.name || t.title || t.task || `Task ${i + 1}`,
    status:   t.status || t.state || '',
    priority: t.priority || t.urgency || '',
    desc:     String(t.description || t.summary || t.mission || '').slice(0, 200),
    tags:     Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(invToks, other) {
  const otherToks = [
    ...tokens(other.name || other.label || other.title),
    ...tokens(other.category || other.sector || other.kind || ''),
    ...tokens(other.description || other.desc || other.summary || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!invToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (invToks.has(t)) hits++;
  return hits / Math.max(invToks.size, otherToks.length);
}

function correlate(investigations, riskSignals, tasks) {
  return investigations.map(inv => {
    const iToks = new Set([
      ...tokens(inv.name),
      ...tokens(inv.description),
      ...tokens(inv.kind),
      ...tokens(inv.tags),
    ].filter(Boolean));

    const matchedRisks = riskSignals
      .map(r => ({ ...r, _score: matchScore(iToks, r) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedTasks = tasks
      .map(t => ({ ...t, _score: matchScore(iToks, t) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasRisk = matchedRisks.length > 0;
    const hasTask = matchedTasks.length > 0;

    let coverage;
    if (hasRisk && hasTask) coverage = 'FULLY ARMED';
    else if (hasRisk)       coverage = 'RISK-FLAGGED';
    else if (hasTask)       coverage = 'TASK-DRIVEN';
    else                    coverage = 'ADRIFT';

    return { ...inv, _risks: matchedRisks, _tasks: matchedTasks, _coverage: coverage };
  });
}

export async function buildIrttriScript() {
  const [iR, rR, tR] = await Promise.allSettled([
    fetch(`${API}/v1/investigations`).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${API}/entities/Task`).then(r => r.json()),
  ]);
  const investigations = normaliseInvestigations(iR.status === 'fulfilled' ? iR.value : []);
  const riskSignals    = normaliseRiskSignals(rR.status === 'fulfilled' ? rR.value : []);
  const tasks          = normaliseTasks(tR.status === 'fulfilled' ? tR.value : []);
  const enriched       = correlate(investigations, riskSignals, tasks);
  const fa  = enriched.filter(i => i._coverage === 'FULLY ARMED').length;
  const rf  = enriched.filter(i => i._coverage === 'RISK-FLAGGED').length;
  const td  = enriched.filter(i => i._coverage === 'TASK-DRIVEN').length;
  const ad  = enriched.filter(i => i._coverage === 'ADRIFT').length;
  return (
    `Investigation × RiskSignal × Task Triple Coverage: ${investigations.length} open investigations cross-referenced against ${riskSignals.length} risk signals and ${tasks.length} tasks. ` +
    `${fa} are FULLY ARMED (risk-aligned + task-backed); ${rf} are RISK-FLAGGED (risk signal found, no task response); ` +
    `${td} are TASK-DRIVEN (task exists, no risk signal); ${ad} are ADRIFT (no risk signal or task — accountability gap). ` +
    `Adrift cases: ${enriched.filter(i => i._coverage === 'ADRIFT').slice(0, 3).map(i => i.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';
const RD = '#EF4444';
const PU = '#A855F7';

const COVERAGE_COLOR = {
  'FULLY ARMED':  GR,
  'RISK-FLAGGED': AM,
  'TASK-DRIVEN':  CY,
  'ADRIFT':       RD,
};

const chip = (label, color = CY) => (
  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: color + '22', color, border: `1px solid ${color}55`, marginLeft: 4, whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

const ScoreBar = ({ score, color }) => (
  <div style={{ height: 3, width: '100%', background: '#1a1a2a', borderRadius: 2, marginTop: 2 }}>
    <div style={{ height: 3, width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
  </div>
);

const TABS = ['ALL', 'FULLY ARMED', 'RISK-FLAGGED', 'TASK-DRIVEN', 'ADRIFT'];

export default function InvestigationRiskTaskTriple() {
  const [open, setOpen]           = useState(false);
  const [investigations, setInvs] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]             = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [iR, rR, tR] = await Promise.allSettled([
        fetch(`${API}/v1/investigations`).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${API}/entities/Task`).then(r => r.json()),
      ]);
      const raw_i = normaliseInvestigations(iR.status === 'fulfilled' ? iR.value : []);
      const raw_r = normaliseRiskSignals(rR.status === 'fulfilled' ? rR.value : []);
      const raw_t = normaliseTasks(tR.status === 'fulfilled' ? tR.value : []);
      setInvs(correlate(raw_i, raw_r, raw_t));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:irttri-toggle', toggle);
    return () => window.removeEventListener('jarvis:irttri-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const brief = await buildIrttriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Investigation × RiskSignal × Task triple coverage brief: ${brief}. Give a 2-sentence investigation accountability assessment.` }),
      });
      const d = await r.json();
      const msg = d.response || d.message || d.content || brief;
      setAssessText(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch (e) {
      setAssessText(String(e));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const adCount = investigations.filter(i => i._coverage === 'ADRIFT').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investigation × RiskSignal × Task Triple Coverage (IRTTRI)"
        style={{
          position: 'fixed', left: 716560, bottom: 8, zIndex: 308,
          background: adCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${adCount > 0 ? RD : CY + '44'}`,
          color: adCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ IRTTRI{adCount > 0 ? ` ⚠${adCount}` : ''}
      </button>
    );
  }

  const fa = investigations.filter(i => i._coverage === 'FULLY ARMED').length;
  const rf = investigations.filter(i => i._coverage === 'RISK-FLAGGED').length;
  const td = investigations.filter(i => i._coverage === 'TASK-DRIVEN').length;
  const ad = investigations.filter(i => i._coverage === 'ADRIFT').length;

  const visible = investigations.filter(inv =>
    (tab === 'ALL' || inv._coverage === tab) &&
    (!search || inv.name.toLowerCase().includes(search.toLowerCase()) || inv.kind.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6000, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ INVESTIGATION × RISK SIGNAL × TASK TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>IRTTRI</span>
        {ad > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {ad} ADRIFT</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['INVESTIGATIONS', investigations.length, CY],
          ['FULLY ARMED',    fa, GR],
          ['RISK-FLAGGED',   rf, AM],
          ['TASK-DRIVEN',    td, PU],
          ['ADRIFT',         ad, RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {investigations.length > 0 && [
            [fa, GR], [rf, AM], [td, PU], [ad, RD]
          ].map(([v, c], i) => (
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '33' : '#0a0a1a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#888',
          }}>{t}{t !== 'ALL' ? ` (${investigations.filter(i => i._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search investigations…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No investigations match filter.</div>}
        {visible.map(inv => {
          const color = COVERAGE_COLOR[inv._coverage] || CY;
          const isExp = expanded === inv.id;
          return (
            <div key={inv.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : inv.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.name}</span>
                {inv.kind && <span style={{ fontSize: 9, color: '#666', flexShrink: 0 }}>{inv.kind}</span>}
                {inv.status && chip(inv.status, CY)}
                {chip(inv._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  {/* Left: Risk signals */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>RISK SIGNALS ({inv._risks.length})</div>
                    {inv._risks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No risk signal alignment</div>
                      : inv._risks.map(r => (
                        <div key={r.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                            {r.severity && chip(r.severity, r.severity?.toLowerCase().includes('crit') ? RD : AM)}
                          </div>
                          <ScoreBar score={r._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Divider */}
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Right: Tasks */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: GR, marginBottom: 4, fontWeight: 600 }}>TASKS ({inv._tasks.length})</div>
                    {inv._tasks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No task alignment</div>
                      : inv._tasks.map(t => (
                        <div key={t.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                            {t.status && chip(t.status, GR)}
                            {t.priority && chip(t.priority, t.priority?.toLowerCase().includes('high') || t.priority?.toLowerCase().includes('crit') ? RD : AM)}
                          </div>
                          <ScoreBar score={t._score} color={GR} />
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#0a0a1a', border: '1px solid #00CFFF44', color: CY, cursor: 'pointer' }}>
          {loading ? '…' : '↻ REFRESH'}
        </button>
        <button onClick={assess} disabled={assessing} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: assessing ? '#1a1a2a' : '#EF444422', border: `1px solid ${RD}55`, color: RD, cursor: 'pointer' }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
