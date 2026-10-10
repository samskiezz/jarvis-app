import { useState, useEffect, useCallback } from 'react';

const API = '';

const INSRISI_RE = /\b(invest[._-]?scen[._-]?risk|insrisi|investment[._-]?triple|portfolio[._-]?scenario[._-]?risk|invest[._-]?risk[._-]?plan|blind[._-]?spot[._-]?invest|unhedged[._-]?invest|fully[._-]?covered[._-]?invest|portfolio[._-]?coverage[._-]?triple)\b/i;

export function isInsrisiQuery(t) {
  return INSRISI_RE.test(t || '');
}

function normaliseInvestments(raw) {
  if (!raw) return [];
  const arr = ['investments', 'holdings', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((inv, i) => ({
    id:     inv.id || String(i),
    name:   inv.name || inv.title || inv.asset || inv.ticker || `Investment ${i + 1}`,
    type:   inv.type || inv.asset_type || inv.category || inv.sector || '',
    status: inv.status || inv.state || '',
    value:  inv.value || inv.amount || inv.current_value || '',
    desc:   String(inv.description || inv.notes || inv.summary || inv.thesis || '').slice(0, 200),
    tags:   Array.isArray(inv.tags) ? inv.tags.join(' ') : (inv.tags || ''),
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = ['scenarios', 'simulations', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:     s.id || String(i),
    name:   s.name || s.title || s.objective || `Scenario ${i + 1}`,
    kind:   s.kind || s.type || s.category || '',
    status: s.status || s.state || '',
    desc:   String(s.description || s.objective || s.summary || '').slice(0, 200),
    tags:   Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function normaliseRisks(raw) {
  if (!raw) return [];
  const arr = ['risk_signals', 'risks', 'signals', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((r, i) => ({
    id:       r.id || String(i),
    name:     r.name || r.title || r.signal || `Risk ${i + 1}`,
    severity: r.severity || r.level || r.risk_level || '',
    kind:     r.kind || r.type || r.category || '',
    desc:     String(r.description || r.summary || r.details || '').slice(0, 200),
    tags:     Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(invToks, other) {
  const otherToks = [
    ...tokens(other.name || other.title),
    ...tokens(other.kind || other.type || other.category || other.sector || ''),
    ...tokens(other.desc || other.description || other.summary || other.objective || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!invToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (invToks.has(t)) hits++;
  return hits / Math.max(invToks.size, otherToks.length);
}

function correlate(investments, scenarios, risks) {
  return investments.map(inv => {
    const invToks = new Set([
      ...tokens(inv.name),
      ...tokens(inv.type),
      ...tokens(inv.desc),
      ...tokens(inv.tags),
    ].filter(Boolean));

    const matchedScenarios = scenarios
      .map(s => ({ ...s, _score: matchScore(invToks, s) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedRisks = risks
      .map(r => ({ ...r, _score: matchScore(invToks, r) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasScenario = matchedScenarios.length > 0;
    const hasRisk     = matchedRisks.length > 0;

    let coverage;
    if (hasScenario && hasRisk)  coverage = 'FULLY COVERED';
    else if (hasScenario)        coverage = 'SCENARIO-PLANNED';
    else if (hasRisk)            coverage = 'RISK-MONITORED';
    else                         coverage = 'BLIND SPOT';

    return { ...inv, _scenarios: matchedScenarios, _risks: matchedRisks, _coverage: coverage };
  });
}

export async function buildInsrisiScript() {
  const [iR, sR, rR] = await Promise.allSettled([
    fetch(`${API}/entities/Investment`).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
  ]);
  const investments = normaliseInvestments(iR.status === 'fulfilled' ? iR.value : []);
  const scenarios   = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
  const risks       = normaliseRisks(rR.status === 'fulfilled' ? rR.value : []);
  const enriched    = correlate(investments, scenarios, risks);
  const fc  = enriched.filter(i => i._coverage === 'FULLY COVERED').length;
  const sp  = enriched.filter(i => i._coverage === 'SCENARIO-PLANNED').length;
  const rm  = enriched.filter(i => i._coverage === 'RISK-MONITORED').length;
  const bs  = enriched.filter(i => i._coverage === 'BLIND SPOT').length;
  return (
    `Investment × Scenario × RiskSignal Triple Coverage: ${investments.length} investments cross-referenced against ` +
    `${scenarios.length} scenarios and ${risks.length} active risk signals. ` +
    `${fc} FULLY COVERED (scenario plan + risk monitoring); ${sp} SCENARIO-PLANNED (plan exists, no matched risk signal); ` +
    `${rm} RISK-MONITORED (risk signal found, no scenario coverage); ${bs} BLIND SPOT (unhedged — no coverage). ` +
    `Blind spots: ${enriched.filter(i => i._coverage === 'BLIND SPOT').slice(0, 3).map(i => i.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 700;
const PANEL_H = 620;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';
const RD = '#EF4444';
const PU = '#A855F7';
const TE = '#14B8A6';

const COVERAGE_COLOR = {
  'FULLY COVERED':    GR,
  'SCENARIO-PLANNED': CY,
  'RISK-MONITORED':   AM,
  'BLIND SPOT':       RD,
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

const TABS = ['ALL', 'FULLY COVERED', 'SCENARIO-PLANNED', 'RISK-MONITORED', 'BLIND SPOT'];

export default function InvestmentScenarioRiskTriple() {
  const [open, setOpen]             = useState(false);
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]               = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [iR, sR, rR] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
      ]);
      const raw_i = normaliseInvestments(iR.status === 'fulfilled' ? iR.value : []);
      const raw_s = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
      const raw_r = normaliseRisks(rR.status === 'fulfilled' ? rR.value : []);
      setInvestments(correlate(raw_i, raw_s, raw_r));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:insrisi-toggle', toggle);
    return () => window.removeEventListener('jarvis:insrisi-toggle', toggle);
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
      const brief = await buildInsrisiScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Investment × Scenario × RiskSignal triple coverage: ${brief}. Give a 2-sentence portfolio risk coverage assessment.` }),
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
    const blindCount = investments.filter(i => i._coverage === 'BLIND SPOT').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investment × Scenario × RiskSignal Triple Coverage (INSRISI)"
        style={{
          position: 'fixed', left: 720480, bottom: 8, zIndex: 315,
          background: blindCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${blindCount > 0 ? RD : CY + '44'}`,
          color: blindCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ INSRISI{blindCount > 0 ? ` ⚠${blindCount}` : ''}
      </button>
    );
  }

  const fc  = investments.filter(i => i._coverage === 'FULLY COVERED').length;
  const sp  = investments.filter(i => i._coverage === 'SCENARIO-PLANNED').length;
  const rm  = investments.filter(i => i._coverage === 'RISK-MONITORED').length;
  const bs  = investments.filter(i => i._coverage === 'BLIND SPOT').length;

  const visible = investments.filter(inv =>
    (tab === 'ALL' || inv._coverage === tab) &&
    (!search || inv.name.toLowerCase().includes(search.toLowerCase()) || inv.type.toLowerCase().includes(search.toLowerCase()))
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
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ INVESTMENT × SCENARIO × RISK TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>INSRISI</span>
        {bs > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {bs} BLIND SPOT</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['INVESTMENTS',      investments.length, CY],
          ['FULLY COVERED',    fc, GR],
          ['SCENARIO-PLANNED', sp, CY],
          ['RISK-MONITORED',   rm, AM],
          ['BLIND SPOT',       bs, RD],
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
          {investments.length > 0 && [
            [fc, GR], [sp, CY], [rm, AM], [bs, RD]
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
          }}>{t}{t !== 'ALL' ? ` (${investments.filter(i => i._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search investments…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No investments match filter.</div>}
        {visible.map(inv => {
          const color = COVERAGE_COLOR[inv._coverage] || CY;
          const isExp = expanded === inv.id;
          return (
            <div key={inv.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : inv.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.name}</span>
                {inv.type && <span style={{ fontSize: 9, color: '#888', flexShrink: 0 }}>{inv.type}</span>}
                {inv.value && chip(String(inv.value).slice(0, 12), TE)}
                {chip(inv._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  {/* Left: Scenarios */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>SCENARIOS ({inv._scenarios.length})</div>
                    {inv._scenarios.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No scenario coverage</div>
                      : inv._scenarios.map(s => (
                        <div key={s.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                            {s.kind && chip(s.kind, CY)}
                            {s.status && chip(s.status, AM)}
                          </div>
                          <ScoreBar score={s._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Divider */}
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Right: Risk Signals */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: RD, marginBottom: 4, fontWeight: 600 }}>RISK SIGNALS ({inv._risks.length})</div>
                    {inv._risks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No risk monitoring</div>
                      : inv._risks.map(r => (
                        <div key={r.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                            {r.severity && chip(r.severity, r.severity === 'CRITICAL' ? RD : AM)}
                            {r.kind && chip(r.kind, PU)}
                          </div>
                          <ScoreBar score={r._score} color={RD} />
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

      {/* Footer: ASSESS */}
      <div style={{ borderTop: '1px solid #00CFFF22', padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={assess} disabled={assessing} style={{
          padding: '3px 10px', fontSize: 10, borderRadius: 4, cursor: assessing ? 'default' : 'pointer',
          background: assessing ? '#1a1a2a' : '#00CFFF22', border: '1px solid #00CFFF55', color: CY,
        }}>
          {assessing ? '◌ Assessing…' : '▶ JARVIS ASSESS'}
        </button>
        {assessText && (
          <div style={{ flex: 1, fontSize: 9, color: '#94A3B8', lineHeight: 1.4, overflow: 'hidden' }}>
            {assessText.slice(0, 220)}{assessText.length > 220 ? '…' : ''}
          </div>
        )}
        <button onClick={load} style={{ background: 'none', border: '1px solid #333', color: '#666', borderRadius: 3, padding: '2px 6px', fontSize: 9, cursor: 'pointer' }}>↺</button>
      </div>
    </div>
  );
}
