import { useState, useEffect, useCallback } from 'react';

const API = '';

const LKRSTRI_RE = /\b(lkrstri|live[._-]?intel[._-]?knowledge|knowledge[._-]?risk[._-]?intel|live[._-]?knowledge[._-]?risk|intel[._-]?kb[._-]?risk|fully[._-]?known[._-]?intel|uncharted[._-]?intel|live[._-]?risk[._-]?kb|kb[._-]?risk[._-]?intel|intel[._-]?knowledge[._-]?risk)\b/i;

export function isLkrstriQuery(t) {
  return LKRSTRI_RE.test(t || '');
}

function normaliseLiveIntel(raw) {
  if (!raw) return [];
  const arr = ['events', 'intel', 'items', 'results', 'data', 'records', 'signals'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((e, i) => ({
    id:       e.id || String(i),
    name:     e.name || e.title || e.event || e.headline || `Intel ${i + 1}`,
    type:     e.type || e.category || e.kind || e.source || '',
    severity: e.severity || e.level || e.priority || e.risk_level || '',
    desc:     String(e.description || e.summary || e.detail || e.content || '').slice(0, 200),
    tags:     Array.isArray(e.tags) ? e.tags.join(' ') : (e.tags || ''),
    region:   e.region || e.location || e.geo || '',
  }));
}

function normaliseKbArticles(raw) {
  if (!raw) return [];
  const arr = ['articles', 'items', 'results', 'data', 'records', 'documents', 'entries'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((a, i) => ({
    id:       a.id || String(i),
    name:     a.name || a.title || a.heading || `Article ${i + 1}`,
    category: a.category || a.type || a.domain || '',
    topic:    a.topic || a.subject || '',
    desc:     String(a.description || a.summary || a.content || a.body || '').slice(0, 200),
    tags:     Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
  }));
}

function normaliseRisks(raw) {
  if (!raw) return [];
  const arr = ['risk_signals', 'risks', 'signals', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((r, i) => ({
    id:       r.id || String(i),
    name:     r.name || r.title || r.signal || `Risk ${i + 1}`,
    severity: r.severity || r.level || r.priority || '',
    category: r.category || r.type || r.kind || '',
    sector:   r.sector || r.domain || '',
    desc:     String(r.description || r.summary || r.detail || '').slice(0, 200),
    tags:     Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(intelToks, other) {
  const otherToks = [
    ...tokens(other.name || other.title || ''),
    ...tokens(other.severity || other.level || ''),
    ...tokens(other.category || other.type || other.domain || ''),
    ...tokens(other.sector || other.topic || ''),
    ...tokens(other.desc || other.description || other.summary || ''),
    ...tokens(other.tags || ''),
    ...tokens(other.region || other.geo || ''),
  ].filter(Boolean);
  if (!intelToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (intelToks.has(t)) hits++;
  return hits / Math.max(intelToks.size, otherToks.length);
}

function correlate(intelItems, kbArticles, risks) {
  return intelItems.map(evt => {
    const toks = new Set([
      ...tokens(evt.name),
      ...tokens(evt.type),
      ...tokens(evt.desc),
      ...tokens(evt.tags),
      ...tokens(evt.region),
    ].filter(Boolean));

    const matchedKb = kbArticles
      .map(a => ({ ...a, _score: matchScore(toks, a) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedRisks = risks
      .map(r => ({ ...r, _score: matchScore(toks, r) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasKb   = matchedKb.length > 0;
    const hasRisk = matchedRisks.length > 0;

    let coverage;
    if (hasKb && hasRisk)  coverage = 'FULLY KNOWN';
    else if (hasKb)        coverage = 'KB-BACKED';
    else if (hasRisk)      coverage = 'RISK-FLAGGED';
    else                   coverage = 'UNCHARTED';

    return { ...evt, _kb: matchedKb, _risks: matchedRisks, _coverage: coverage };
  });
}

export async function buildLkrstriScript() {
  const [iR, kR, rR] = await Promise.allSettled([
    fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
    fetch(`${API}/knowledge/`).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
  ]);
  const intelItems = normaliseLiveIntel(iR.status === 'fulfilled' ? iR.value : []);
  const kbArticles = normaliseKbArticles(kR.status === 'fulfilled' ? kR.value : []);
  const risks      = normaliseRisks(rR.status === 'fulfilled' ? rR.value : []);
  const enriched   = correlate(intelItems, kbArticles, risks);
  const fk  = enriched.filter(e => e._coverage === 'FULLY KNOWN').length;
  const kb  = enriched.filter(e => e._coverage === 'KB-BACKED').length;
  const rf  = enriched.filter(e => e._coverage === 'RISK-FLAGGED').length;
  const unc = enriched.filter(e => e._coverage === 'UNCHARTED').length;
  return (
    `Live Intel × Knowledge × Risk Signal Triple Coverage: ${intelItems.length} live intel events cross-referenced against ` +
    `${kbArticles.length} KB articles and ${risks.length} risk signals. ` +
    `${fk} FULLY KNOWN (KB-documented + risk signal — intelligence event with context and threat linkage); ` +
    `${kb} KB-BACKED (KB article coverage, no risk signal linked); ` +
    `${rf} RISK-FLAGGED (risk signal detected, no KB documentation); ` +
    `${unc} UNCHARTED (no KB or risk signal — live intel with no context or threat record). ` +
    `Most critical uncharted: ${enriched.filter(e => e._coverage === 'UNCHARTED').slice(0, 3).map(e => e.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';

const COVERAGE_COLOR = {
  'FULLY KNOWN':   GR,
  'KB-BACKED':     CY,
  'RISK-FLAGGED':  AM,
  'UNCHARTED':     '#555',
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

const TABS = ['ALL', 'FULLY KNOWN', 'KB-BACKED', 'RISK-FLAGGED', 'UNCHARTED'];

export default function LiveIntelKnowledgeRiskTriple() {
  const [open, setOpen]             = useState(false);
  const [events, setEvents]         = useState([]);
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
      const [iR, kR, rR] = await Promise.allSettled([
        fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
        fetch(`${API}/knowledge/`).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
      ]);
      const raw_i = normaliseLiveIntel(iR.status === 'fulfilled' ? iR.value : []);
      const raw_k = normaliseKbArticles(kR.status === 'fulfilled' ? kR.value : []);
      const raw_r = normaliseRisks(rR.status === 'fulfilled' ? rR.value : []);
      setEvents(correlate(raw_i, raw_k, raw_r));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:lkrstri-toggle', toggle);
    return () => window.removeEventListener('jarvis:lkrstri-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const brief = await buildLkrstriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Live intel knowledge-risk coverage brief: ${brief}. Give a 2-sentence assessment of live intelligence coverage across KB articles and risk signals.` }),
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
    const uncCount = events.filter(e => e._coverage === 'UNCHARTED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Live Intel × Knowledge × Risk Signal Triple Coverage (LKRSTRI)"
        style={{
          position: 'fixed', left: 733360, bottom: 8, zIndex: 338,
          background: uncCount > 0 ? '#F59E0B22' : '#0a0a1a',
          border: `1px solid ${uncCount > 0 ? AM : CY + '44'}`,
          color: uncCount > 0 ? AM : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ LKRSTRI{uncCount > 0 ? ` ⚠${uncCount}` : ''}
      </button>
    );
  }

  const fk  = events.filter(e => e._coverage === 'FULLY KNOWN').length;
  const kb  = events.filter(e => e._coverage === 'KB-BACKED').length;
  const rf  = events.filter(e => e._coverage === 'RISK-FLAGGED').length;
  const unc = events.filter(e => e._coverage === 'UNCHARTED').length;

  const visible = events.filter(e =>
    (tab === 'ALL' || e._coverage === tab) &&
    (!search || e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.type.toLowerCase().includes(search.toLowerCase()) ||
      e.desc.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ LIVE INTEL × KNOWLEDGE × RISK SIGNAL TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>LKRSTRI</span>
        {unc > 0 && <span style={{ fontSize: 10, color: AM, background: '#F59E0B22', border: '1px solid #F59E0B55', borderRadius: 3, padding: '1px 5px' }}>⚠ {unc} UNCHARTED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['LIVE INTEL',   events.length, CY],
          ['FULLY KNOWN',  fk,            GR],
          ['KB-BACKED',    kb,            CY],
          ['RISK-FLAGGED', rf,            AM],
          ['UNCHARTED',    unc,           '#555'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {events.length > 0 && [
            [fk, GR], [kb, CY], [rf, AM], [unc, '#444']
          ].map(([v, c], i) => (
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '33' : '#0a0a1a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#888',
          }}>{t}{t !== 'ALL' ? ` (${events.filter(e => e._coverage === t).length})` : ''}</button>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search live intel…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: AM, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No intel events match filter.</div>}
        {visible.map(evt => {
          const color = COVERAGE_COLOR[evt._coverage] || CY;
          const isExp = expanded === evt.id;
          return (
            <div key={evt.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : evt.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{evt.name}</span>
                {evt.type && chip(evt.type, '#888')}
                {evt.severity && chip(evt.severity, evt.severity?.toLowerCase?.().includes('crit') ? '#EF4444' : AM)}
                {chip(evt._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>KB ARTICLES ({evt._kb.length})</div>
                    {evt._kb.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No KB article alignment</div>
                      : evt._kb.map(a => (
                        <div key={a.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                            {a.category && chip(a.category, '#888')}
                          </div>
                          <ScoreBar score={a._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>RISK SIGNALS ({evt._risks.length})</div>
                    {evt._risks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No risk signal alignment</div>
                      : evt._risks.map(r => (
                        <div key={r.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                            {r.severity && chip(r.severity, r.severity?.toLowerCase?.().includes('crit') ? '#EF4444' : AM)}
                            {r.category && chip(r.category, '#888')}
                          </div>
                          <ScoreBar score={r._score} color={AM} />
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

      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#0a0a1a', border: '1px solid #00CFFF44', color: CY, cursor: 'pointer' }}>
          {loading ? '…' : '↻ REFRESH'}
        </button>
        <button onClick={assess} disabled={assessing} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: assessing ? '#1a1a2a' : '#F59E0B22', border: `1px solid ${AM}55`, color: AM, cursor: 'pointer' }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
