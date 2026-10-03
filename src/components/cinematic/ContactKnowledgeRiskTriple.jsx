import { useState, useEffect, useCallback } from 'react';

const API = '';

const CRKL_RE = /\b(contact[._-]?knowledge[._-]?risk|crkl|contact[._-]?triple|blind[._-]?contact|fully[._-]?covered[._-]?contact|contact[._-]?coverage[._-]?triple|knowledge[._-]?risk[._-]?contact|contact[._-]?intel[._-]?triple|crkltri)\b/i;

export function isCorklQuery(t) {
  return CRKL_RE.test(t || '');
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:          c.id || String(i),
    name:        c.name || c.full_name || c.fullName || `Contact ${i + 1}`,
    org:         c.org || c.company || c.organisation || '',
    role:        c.role || c.title || c.position || '',
    description: String(c.description || c.bio || c.notes || '').slice(0, 300),
    tags:        Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
    email:       c.email || '',
  }));
}

function normaliseKnowledge(raw) {
  if (!raw) return [];
  const arr = ['articles', 'items', 'results', 'data', 'entries', 'knowledge'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((a, i) => ({
    id:       a.id || String(i),
    title:    a.title || a.name || `Article ${i + 1}`,
    category: a.category || a.type || a.domain || '',
    summary:  String(a.summary || a.content || a.description || '').slice(0, 300),
    tags:     Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
  }));
}

function normaliseRisk(raw) {
  if (!raw) return [];
  const arr = ['risk_signals', 'risks', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((r, i) => ({
    id:          r.id || String(i),
    name:        r.name || r.title || `Risk ${i + 1}`,
    category:    r.category || r.type || r.sector || '',
    severity:    r.severity || r.level || r.priority || '',
    description: String(r.description || r.summary || r.source || '').slice(0, 300),
    tags:        Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(contToks, other) {
  const otherToks = [
    ...tokens(other.title || other.name),
    ...tokens(other.summary || other.description),
    ...tokens(other.category),
    ...tokens(other.tags),
    ...tokens(other.domain || other.area || ''),
  ].filter(Boolean);
  if (!contToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (contToks.has(t)) hits++;
  return hits / Math.max(contToks.size, otherToks.length);
}

function correlate(contacts, articles, risks) {
  return contacts.map(c => {
    const cToks = new Set([
      ...tokens(c.name),
      ...tokens(c.org),
      ...tokens(c.role),
      ...tokens(c.description),
      ...tokens(c.tags),
    ].filter(Boolean));

    const matchedKb = articles
      .map(a => ({ ...a, _score: matchScore(cToks, a) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedRisk = risks
      .map(r => ({ ...r, _score: matchScore(cToks, r) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasKb   = matchedKb.length > 0;
    const hasRisk = matchedRisk.length > 0;

    let coverage;
    if (hasKb && hasRisk)  coverage = 'FULLY COVERED';
    else if (hasKb)         coverage = 'KNOWLEDGE-ONLY';
    else if (hasRisk)       coverage = 'RISK-ONLY';
    else                    coverage = 'BLIND';

    return { ...c, _kb: matchedKb, _risk: matchedRisk, _coverage: coverage };
  });
}

export async function buildCorklScript() {
  const [cR, kR, rR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/knowledge/`).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
  ]);
  const contacts  = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
  const articles  = normaliseKnowledge(kR.status === 'fulfilled' ? kR.value : []);
  const risks     = normaliseRisk(rR.status === 'fulfilled' ? rR.value : []);
  const enriched  = correlate(contacts, articles, risks);
  const fc  = enriched.filter(s => s._coverage === 'FULLY COVERED').length;
  const ko  = enriched.filter(s => s._coverage === 'KNOWLEDGE-ONLY').length;
  const ro  = enriched.filter(s => s._coverage === 'RISK-ONLY').length;
  const bl  = enriched.filter(s => s._coverage === 'BLIND').length;
  return (
    `Contact × Knowledge × Risk Triple Coverage: ${contacts.length} contacts cross-referenced against ${articles.length} KB articles and ${risks.length} risk signals. ` +
    `${fc} contacts are FULLY COVERED (knowledge-backed + risk-monitored); ${ko} are KNOWLEDGE-ONLY (no risk monitoring); ` +
    `${ro} are RISK-ONLY (no KB article coverage); ${bl} are BLIND (no coverage — intelligence gap). ` +
    `Top blind contacts: ${enriched.filter(s => s._coverage === 'BLIND').slice(0, 3).map(s => s.name || s.id || '?').join(', ') || 'none'}.`
  );
}

const PANEL_W = 640;
const PANEL_H = 600;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';
const RD = '#EF4444';
const PU = '#A78BFA';

const COVERAGE_COLOR = {
  'FULLY COVERED':   GR,
  'KNOWLEDGE-ONLY':  CY,
  'RISK-ONLY':       AM,
  'BLIND':           RD,
};

const chip = (label, color = CY) => (
  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: color + '22', color, border: `1px solid ${color}55`, marginLeft: 4, whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

const ScoreBar = ({ score, color }) => (
  <div style={{ height: 3, width: '100%', background: '#1a2a1a', borderRadius: 2, marginTop: 2 }}>
    <div style={{ height: 3, width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
  </div>
);

const TABS = ['ALL', 'FULLY COVERED', 'KNOWLEDGE-ONLY', 'RISK-ONLY', 'BLIND'];

export default function ContactKnowledgeRiskTriple() {
  const [open, setOpen]       = useState(false);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [cR, kR, rR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/knowledge/`).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
      ]);
      const raw_c = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
      const raw_k = normaliseKnowledge(kR.status === 'fulfilled' ? kR.value : []);
      const raw_r = normaliseRisk(rR.status === 'fulfilled' ? rR.value : []);
      setContacts(correlate(raw_c, raw_k, raw_r));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:crkl-toggle', toggle);
    return () => window.removeEventListener('jarvis:crkl-toggle', toggle);
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
      const brief = await buildCorklScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Contact knowledge-risk triple coverage brief: ${brief}. Give a 2-sentence operational readiness assessment.` }),
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
    const blindCount = contacts.filter(c => c._coverage === 'BLIND').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Contact × Knowledge × Risk Triple Coverage (CRKL)"
        style={{
          position: 'fixed', left: 714880, bottom: 8, zIndex: 305,
          background: blindCount > 0 ? '#EF444422' : '#0a1a0a',
          border: `1px solid ${blindCount > 0 ? RD : '#00CFFF44'}`,
          color: blindCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ CRKL{blindCount > 0 ? ` ⚠${blindCount}` : ''}
      </button>
    );
  }

  const fc   = contacts.filter(c => c._coverage === 'FULLY COVERED').length;
  const ko   = contacts.filter(c => c._coverage === 'KNOWLEDGE-ONLY').length;
  const ro   = contacts.filter(c => c._coverage === 'RISK-ONLY').length;
  const bl   = contacts.filter(c => c._coverage === 'BLIND').length;

  const visible = contacts.filter(c =>
    (tab === 'ALL' || c._coverage === tab) &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase()) || c.org.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04100a', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6000, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ CONTACT × KNOWLEDGE × RISK TRIPLE COVERAGE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>CRKL</span>
        {bl > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {bl} BLIND</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['CONTACTS', contacts.length, CY],
          ['FULLY COVERED', fc, GR],
          ['KNOWLEDGE-ONLY', ko, CY],
          ['RISK-ONLY', ro, AM],
          ['BLIND', bl, RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#081508', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {contacts.length > 0 && [
            [fc, GR], [ko, CY], [ro, AM], [bl, RD]
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
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '33' : '#0a1a0a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#888',
          }}>{t}{t !== 'ALL' ? ` (${contacts.filter(c => c._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts…"
          style={{ width: '100%', background: '#081508', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No contacts match filter.</div>}
        {visible.map(c => {
          const color = COVERAGE_COLOR[c._coverage] || CY;
          const isExp = expanded === c.id;
          return (
            <div key={c.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06100a', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : c.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                {c.org && <span style={{ fontSize: 9, color: '#666', flexShrink: 0 }}>{c.org}</span>}
                {chip(c._coverage, color)}
                <span style={{ color: '#444', fontSize: 10, flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 8px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 700 }}>KB ARTICLES ({c._kb.length})</div>
                    {c._kb.length === 0
                      ? <div style={{ fontSize: 9, color: '#555' }}>No KB coverage</div>
                      : c._kb.map((a, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc' }}>{a.title}</div>
                          {a.category && chip(a.category, CY)}
                          <ScoreBar score={a._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 700 }}>RISK SIGNALS ({c._risk.length})</div>
                    {c._risk.length === 0
                      ? <div style={{ fontSize: 9, color: '#555' }}>No risk monitoring</div>
                      : c._risk.map((r, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc' }}>{r.name}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                            {r.category && chip(r.category, AM)}
                            {r.severity && chip(r.severity, r.severity === 'HIGH' || r.severity === 'CRITICAL' ? RD : AM)}
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

      {/* Footer */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          padding: '4px 12px', fontSize: 10, background: assessing ? '#1a2a1a' : '#0a1a0a',
          border: `1px solid ${CY}44`, borderRadius: 4, color: CY, cursor: 'pointer',
        }}>
          {assessing ? 'ASSESSING…' : '▶ ASSESS'}
        </button>
        <button onClick={load} disabled={loading} style={{ padding: '4px 8px', fontSize: 10, background: '#0a1a0a', border: '1px solid #333', borderRadius: 4, color: '#888', cursor: 'pointer' }}>↺</button>
        {assessText && <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>}
        <span style={{ fontSize: 9, color: '#444', flexShrink: 0 }}>{contacts.length} contacts · 90s</span>
      </div>
    </div>
  );
}
