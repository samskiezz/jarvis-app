import { useState, useEffect, useCallback } from 'react';

const API = '';

const KIRSTRI_RE = /\b(kirstri|knowledge[._-]?invest[._-]?risk|invest[._-]?risk[._-]?knowledge|critical[._-]?knowledge|hot[._-]?knowledge|portfolio[._-]?risk[._-]?knowledge|investment[._-]?risk[._-]?knowledge|knowledge[._-]?portfolio[._-]?risk|risk[._-]?invest[._-]?know(?:ledge)?)\b/i;

export function isKirstriQuery(t) {
  return KIRSTRI_RE.test(t || '');
}

function normaliseArticles(raw) {
  if (!raw) return [];
  const arr = ['articles', 'items', 'results', 'data', 'records', 'knowledge'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((a, i) => ({
    id:       a.id || String(i),
    name:     a.title || a.name || `Article ${i + 1}`,
    category: a.category || a.type || a.kind || '',
    summary:  String(a.summary || a.content || a.description || '').slice(0, 250),
    tags:     Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
  }));
}

function normaliseInvestments(raw) {
  if (!raw) return [];
  const arr = ['investments', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((inv, i) => ({
    id:     inv.id || String(i),
    name:   inv.name || inv.title || inv.asset || `Investment ${i + 1}`,
    sector: inv.sector || inv.industry || inv.asset_class || '',
    ticker: inv.ticker || inv.symbol || '',
    desc:   String(inv.notes || inv.description || inv.summary || '').slice(0, 200),
    tags:   Array.isArray(inv.tags) ? inv.tags.join(' ') : (inv.tags || ''),
  }));
}

function normaliseSignals(raw) {
  if (!raw) return [];
  const arr = ['risk_signals', 'signals', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:       s.id || String(i),
    name:     s.name || s.title || s.signal || `Signal ${i + 1}`,
    severity: s.severity || s.level || s.priority || '',
    category: s.category || s.type || '',
    desc:     String(s.description || s.summary || s.detail || '').slice(0, 200),
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(artToks, other) {
  const otherToks = [
    ...tokens(other.name || other.title),
    ...tokens(other.sector || other.category || other.kind || ''),
    ...tokens(other.ticker || other.severity || ''),
    ...tokens(other.desc || other.description || other.summary || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!artToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (artToks.has(t)) hits++;
  return hits / Math.max(artToks.size, otherToks.length);
}

function correlate(articles, investments, signals) {
  return articles.map(art => {
    const artToks = new Set([
      ...tokens(art.name),
      ...tokens(art.category),
      ...tokens(art.summary),
      ...tokens(art.tags),
    ].filter(Boolean));

    const matchedInv = investments
      .map(inv => ({ ...inv, _score: matchScore(artToks, inv) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedSig = signals
      .map(s => ({ ...s, _score: matchScore(artToks, s) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasInv = matchedInv.length > 0;
    const hasSig = matchedSig.length > 0;

    let coverage;
    if (hasInv && hasSig) coverage = 'FULLY CRITICAL';
    else if (hasInv)      coverage = 'INVESTED';
    else if (hasSig)      coverage = 'RISK-FLAGGED';
    else                  coverage = 'ARCHIVAL';

    return { ...art, _investments: matchedInv, _signals: matchedSig, _coverage: coverage };
  });
}

export async function buildKirstriScript() {
  const [aR, iR, sR] = await Promise.allSettled([
    fetch(`${API}/knowledge/`).then(r => r.json()),
    fetch(`${API}/entities/Investment`).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
  ]);
  const articles     = normaliseArticles(aR.status === 'fulfilled' ? aR.value : []);
  const investments  = normaliseInvestments(iR.status === 'fulfilled' ? iR.value : []);
  const signals      = normaliseSignals(sR.status === 'fulfilled' ? sR.value : []);
  const enriched     = correlate(articles, investments, signals);
  const fc  = enriched.filter(a => a._coverage === 'FULLY CRITICAL').length;
  const inv = enriched.filter(a => a._coverage === 'INVESTED').length;
  const rsk = enriched.filter(a => a._coverage === 'RISK-FLAGGED').length;
  const arc = enriched.filter(a => a._coverage === 'ARCHIVAL').length;
  return (
    `Knowledge × Investment × Risk Signal Triple Coverage: ${articles.length} KB articles cross-referenced against ` +
    `${investments.length} investments and ${signals.length} risk signals. ` +
    `${fc} FULLY CRITICAL (investment-aligned + risk-flagged — operationally hot); ` +
    `${inv} INVESTED (portfolio backing found, no active risk signal); ` +
    `${rsk} RISK-FLAGGED (risk signal alignment, no investment coverage); ` +
    `${arc} ARCHIVAL (no investment or risk signal — knowledge not operationally active). ` +
    `Operationally hot: ${enriched.filter(a => a._coverage === 'FULLY CRITICAL').slice(0, 3).map(a => a.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const AM = '#F59E0B';
const RD = '#EF4444';
const LM = '#84CC16';
const TE = '#2DD4BF';

const COVERAGE_COLOR = {
  'FULLY CRITICAL': RD,
  'INVESTED':       TE,
  'RISK-FLAGGED':   AM,
  'ARCHIVAL':       '#555',
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

const TABS = ['ALL', 'FULLY CRITICAL', 'INVESTED', 'RISK-FLAGGED', 'ARCHIVAL'];

export default function KnowledgeInvestmentRiskTriple() {
  const [open, setOpen]         = useState(false);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [aR, iR, sR] = await Promise.allSettled([
        fetch(`${API}/knowledge/`).then(r => r.json()),
        fetch(`${API}/entities/Investment`).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
      ]);
      const raw_a = normaliseArticles(aR.status === 'fulfilled' ? aR.value : []);
      const raw_i = normaliseInvestments(iR.status === 'fulfilled' ? iR.value : []);
      const raw_s = normaliseSignals(sR.status === 'fulfilled' ? sR.value : []);
      setArticles(correlate(raw_a, raw_i, raw_s));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:kirstri-toggle', toggle);
    return () => window.removeEventListener('jarvis:kirstri-toggle', toggle);
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
      const brief = await buildKirstriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Knowledge portfolio-risk coverage brief: ${brief}. Give a 2-sentence operational knowledge-investment-risk assessment.` }),
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
    const critCount = articles.filter(a => a._coverage === 'FULLY CRITICAL').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Knowledge × Investment × Risk Signal Triple Coverage (KIRSTRI)"
        style={{
          position: 'fixed', left: 723280, bottom: 8, zIndex: 320,
          background: critCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${critCount > 0 ? RD : CY + '44'}`,
          color: critCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ KIRSTRI{critCount > 0 ? ` ⚠${critCount}` : ''}
      </button>
    );
  }

  const fc  = articles.filter(a => a._coverage === 'FULLY CRITICAL').length;
  const inv = articles.filter(a => a._coverage === 'INVESTED').length;
  const rsk = articles.filter(a => a._coverage === 'RISK-FLAGGED').length;
  const arc = articles.filter(a => a._coverage === 'ARCHIVAL').length;

  const visible = articles.filter(art =>
    (tab === 'ALL' || art._coverage === tab) &&
    (!search || art.name.toLowerCase().includes(search.toLowerCase()) || art.category.toLowerCase().includes(search.toLowerCase()))
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
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ KNOWLEDGE × INVESTMENT × RISK SIGNAL TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>KIRSTRI</span>
        {fc > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {fc} CRITICAL</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['KB ARTICLES',    articles.length, CY],
          ['FULLY CRITICAL', fc,              RD],
          ['INVESTED',       inv,             TE],
          ['RISK-FLAGGED',   rsk,             AM],
          ['ARCHIVAL',       arc,             '#555'],
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
          {articles.length > 0 && [
            [fc, RD], [inv, TE], [rsk, AM], [arc, '#444']
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
          }}>{t}{t !== 'ALL' ? ` (${articles.filter(a => a._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search KB articles…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No articles match filter.</div>}
        {visible.map(art => {
          const color = COVERAGE_COLOR[art._coverage] || CY;
          const isExp = expanded === art.id;
          return (
            <div key={art.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : art.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{art.name}</span>
                {art.category && <span style={{ fontSize: 9, color: '#666', flexShrink: 0 }}>{art.category}</span>}
                {chip(art._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  {/* Left: Investments */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: TE, marginBottom: 4, fontWeight: 600 }}>INVESTMENTS ({art._investments.length})</div>
                    {art._investments.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No investment alignment</div>
                      : art._investments.map(inv => (
                        <div key={inv.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.name}</span>
                            {inv.sector && chip(inv.sector, TE)}
                            {inv.ticker && chip(inv.ticker, '#888')}
                          </div>
                          <ScoreBar score={inv._score} color={TE} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Divider */}
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Right: Risk Signals */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>RISK SIGNALS ({art._signals.length})</div>
                    {art._signals.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No risk signal alignment</div>
                      : art._signals.map(s => (
                        <div key={s.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                            {s.severity && chip(s.severity, s.severity?.toLowerCase?.().includes('crit') ? RD : AM)}
                            {s.category && chip(s.category, '#888')}
                          </div>
                          <ScoreBar score={s._score} color={AM} />
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
